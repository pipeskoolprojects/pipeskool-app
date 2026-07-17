-- ============================================================
-- Pipeskool — PAYROLL TEST DATA (safe, clearly-marked, removable)
-- Creates 4 TEST workers at KEI (site 1) + attendance on the 1st–5th
-- of the CURRENT month covering every payroll rule.
-- Remove afterwards with pipeskool_payroll_test_cleanup.sql
-- ============================================================

-- 1) test contractor + test workers (mobiles 8000000001-4 so they can't clash with real ones)
insert into contractors (name)
select 'TEST CONTRACTOR' where not exists (select 1 from contractors where name = 'TEST CONTRACTOR');

do $$ begin
  insert into workers (full_name, mobile, category, labour_type, daily_wage, site_id, is_active)
  values ('RAMESH TEST',   '8000000001', 'plumber', 'own',        800, 1, true)
  on conflict (mobile) do nothing;
  insert into workers (full_name, mobile, category, labour_type, daily_wage, site_id, is_active)
  values ('SURESH TEST',   '8000000002', 'helper',  'own',        600, 1, true)
  on conflict (mobile) do nothing;
  insert into workers (full_name, mobile, category, labour_type, daily_wage, site_id, contractor_id, is_active)
  values ('CONTRACT TEST', '8000000003', 'fitter',  'contractor', 700, 1,
          (select id from contractors where name = 'TEST CONTRACTOR'), true)
  on conflict (mobile) do nothing;
  begin
    insert into workers (full_name, mobile, category, labour_type, daily_wage, site_id, is_active)
    values ('ZERO TEST',   '8000000004', 'supervisor', 'own',       0, 1, true)
    on conflict (mobile) do nothing;
  exception when check_violation then
    raise notice 'ZERO TEST skipped (wage>0 check) — zero-wage case is covered by staff punch profiles anyway';
  end;
end $$;

-- 2) attendance (triggers off so seeded status/OT stay exactly as written)
alter table attendance disable trigger user;

with m as (select date_trunc('month', current_date)::date d),
     w as (select id, mobile from workers where mobile in ('8000000001','8000000002','8000000003','8000000004'))
insert into attendance (worker_id, site_id, att_date, punch_in, punch_out, hours_worked, status, ot_hours, ot_approved, ot_approved_hours, punch_type)
select w.id, 1, x.dt, t.pin, t.pout, x.hrs, x.st::attendance_status, x.ot, x.appr, x.appr_h, 'self'
from w join lateral (
  values
  -- RAMESH: full+2h OT (pre-approved) | full+3h OT (NOT approved) | full | half | absent
  ('8000000001', (select d from m),              '09:00','20:00', 10.0, 'present', 2.0, true,  2.0),
  ('8000000001', (select d from m) + 1,          '09:00','21:00', 11.0, 'present', 3.0, false, null),
  ('8000000001', (select d from m) + 2,          '09:00','18:00',  8.0, 'present', 0.0, false, null),
  ('8000000001', (select d from m) + 3,          '09:00','13:00',  4.0, 'half_day',0.0, false, null),
  ('8000000001', (select d from m) + 4,          null,   null,     null,'absent',  0.0, false, null),
  -- SURESH: 3 full + 1 half, no OT
  ('8000000002', (select d from m),              '09:00','18:00',  8.0, 'present', 0.0, false, null),
  ('8000000002', (select d from m) + 1,          '09:00','18:00',  8.0, 'present', 0.0, false, null),
  ('8000000002', (select d from m) + 2,          '09:00','18:00',  8.0, 'present', 0.0, false, null),
  ('8000000002', (select d from m) + 3,          '09:00','13:00',  4.0, 'half_day',0.0, false, null),
  -- CONTRACT: 2 full days (must NOT appear in payroll — contractor labour)
  ('8000000003', (select d from m),              '09:00','18:00',  8.0, 'present', 0.0, false, null),
  ('8000000003', (select d from m) + 1,          '09:00','18:00',  8.0, 'present', 0.0, false, null),
  -- ZERO: 1 full day (must be SKIPPED — ₹0 wage)
  ('8000000004', (select d from m),              '09:00','18:00',  8.0, 'present', 0.0, false, null)
) as x(mob, dt, tin, tout, hrs, st, ot, appr, appr_h)
  on x.mob = w.mobile
cross join lateral (select
  case when x.tin  is null then null else ((x.dt::timestamp + x.tin::time::interval)  at time zone 'Asia/Kolkata') end pin,
  case when x.tout is null then null else ((x.dt::timestamp + x.tout::time::interval) at time zone 'Asia/Kolkata') end pout
) t(pin, pout)
on conflict do nothing;

alter table attendance enable trigger user;
select 'Seed done: ' || count(*) || ' test attendance rows this month' from attendance a
  join workers w on w.id = a.worker_id where w.mobile like '80000000%'
  and a.att_date >= date_trunc('month', current_date);
