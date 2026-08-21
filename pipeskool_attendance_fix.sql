-- =============================================================================
-- PIPESKOOL — update194: ATTENDANCE / OT CALCULATION FIX + PF & PT
--
-- BUG FOUND: update168's fn_calc_attendance regressed OT back to "worked − 8h"
-- (that's why the register shows 3.72h for a 19:57 punch-out). The correct rule
-- (from the earlier attendance_ot update, and shown on Site Master) is:
--   OT = punch-out time AFTER the site's shift-end. Shift 10–19 → OT starts 19:00.
-- v4 below = 168's no-lunch hours + shift-end OT, minute-exact.
-- Also: wage_payouts gains PF and Professional Tax (manual, per payout), and
-- August rows are recomputed so raw OT matches the rule (APPROVED OT is untouched).
-- Run as ONE transaction. Backup first (standing rule).
-- =============================================================================

create or replace function fn_calc_attendance()
returns trigger language plpgsql as $$
declare
  s sites%rowtype;
  worked_min integer; ot_min integer;
  po_local timestamp; shift_end_local timestamp;
begin
  select * into s from sites where id = new.site_id;
  if new.punch_in is not null and new.punch_out is not null then
    -- minute-exact span, no break deduction (locked rule from update168)
    worked_min := greatest(floor(extract(epoch from (new.punch_out - new.punch_in)) / 60.0)::int, 0);
    new.hours_worked := round(worked_min / 60.0, 2);
    if worked_min >= s.full_day_min_hours * 60 then new.status := 'present';
    elsif worked_min >= s.half_day_min_hours * 60 then new.status := 'half_day';
    else new.status := 'absent';
    end if;
    -- OT = minutes after the SITE'S SHIFT END only (never "worked − std hours")
    if new.status <> 'absent' and s.shift_end is not null then
      po_local := new.punch_out at time zone 'Asia/Kolkata';
      shift_end_local := (po_local::date) + s.shift_end;
      ot_min := greatest(floor(extract(epoch from (po_local - shift_end_local)) / 60.0)::int, 0);
      new.ot_hours := round(ot_min / 60.0, 2);
    else
      new.ot_hours := 0;
    end if;
  end if;
  return new;
end $$;

-- recompute the parallel-run month under the corrected rule (approved OT untouched)
update attendance set punch_out = punch_out
 where att_date >= date '2026-08-01'
   and punch_in is not null and punch_out is not null;

-- PF / Professional Tax — manual per payout, draft-editable; net = gross − adv − pf − pt
alter table wage_payouts add column if not exists pf_amount numeric(12,2) not null default 0;
alter table wage_payouts add column if not exists pt_amount numeric(12,2) not null default 0;
update wage_payouts set net = round(gross - advances_deducted - pf_amount - pt_amount, 2)
 where status = 'draft';

notify pgrst, 'reload schema';

select
  (select count(*) from pg_proc where proname='fn_calc_attendance' and prosrc like '%shift_end_local%' and prosrc not like '%std_working_hours%') as calc_v4,   -- 1
  (select count(*) from attendance a join sites s on s.id = a.site_id
    where a.att_date >= '2026-08-01' and a.punch_out is not null and a.ot_hours > 0
      and (a.punch_out at time zone 'Asia/Kolkata')::time <= s.shift_end)          as bad_ot_left,          -- 0 (no OT before shift end)
  (select count(*) from information_schema.columns where table_name='wage_payouts'
      and column_name in ('pf_amount','pt_amount'))                                as pf_pt_cols,           -- 2
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false) as unlocked_tables_left; -- 0
