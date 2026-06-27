-- ============================================================
-- Pipeskool — Attendance & OT (Phase A)
-- Per-site shift start/end times; OT counted only AFTER shift end;
-- supervisor-approvable OT with deviation flagging.
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING. Safe to re-run.
-- ============================================================

-- 1) Per-site shift clock times (explicit start + end)
alter table sites add column if not exists shift_start time not null default '09:00';
alter table sites add column if not exists shift_end   time not null default '18:00';

-- 2) OT approval fields on attendance
alter table attendance add column if not exists ot_approved       boolean   not null default false;
alter table attendance add column if not exists ot_approved_hours numeric(5,2);
alter table attendance add column if not exists ot_approved_by    bigint references app_users(id);
alter table attendance add column if not exists ot_approved_at    timestamptz;

-- 3) Recompute OT as time worked AFTER the site's shift end (IST wall clock),
--    instead of "hours beyond standard". Status logic (present/half/absent)
--    stays based on worked hours.
create or replace function fn_calc_attendance()
returns trigger language plpgsql as $$
declare
  s sites%rowtype;
  worked numeric;
  po_local timestamp;
  shift_end_local timestamp;
  ot numeric;
begin
  select * into s from sites where id = new.site_id;
  if new.punch_in is not null and new.punch_out is not null then
    worked := extract(epoch from (new.punch_out - new.punch_in)) / 3600.0 - (s.lunch_minutes / 60.0);
    if worked < 0 then worked := 0; end if;
    new.hours_worked := round(worked::numeric, 2);

    if worked >= s.full_day_min_hours then new.status := 'present';
    elsif worked >= s.half_day_min_hours then new.status := 'half_day';
    else new.status := 'absent';
    end if;

    -- OT = punch-out time minus shift end (only the part after closing time)
    if new.status <> 'absent' and s.shift_end is not null then
      po_local := new.punch_out at time zone 'Asia/Kolkata';
      shift_end_local := (po_local::date) + s.shift_end;
      ot := extract(epoch from (po_local - shift_end_local)) / 3600.0;
      new.ot_hours := greatest(round(ot::numeric, 2), 0);
    else
      new.ot_hours := 0;
    end if;
  end if;
  return new;
end $$;

-- (trigger trg_calc_attendance already exists from module 1 and points at this function)
