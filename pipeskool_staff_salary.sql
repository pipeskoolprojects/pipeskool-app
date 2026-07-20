-- ============================================================
-- Pipeskool — STAFF SALARY MODULE
-- Monthly staff salaries computed from their own punches:
-- per-day = salary/30 (fixed, per Director's rule), Sundays paid,
-- working-day absences deducted, OT only for staff marked eligible,
-- approved salary advances auto-deducted. Draft -> Approved -> Paid
-- with the same never-rewrite protection as labour payroll.
-- RUN BEFORE DEPLOYING update100. Safe to re-run.
-- ============================================================
alter table app_users add column if not exists monthly_salary numeric(12,2) not null default 0;
alter table app_users add column if not exists ot_eligible boolean not null default false;

create table if not exists staff_payouts (
  id bigint generated always as identity primary key,
  user_id bigint not null references app_users(id),
  pay_month date not null,
  monthly_salary numeric(12,2) not null,
  working_days numeric(5,1) not null default 0,
  days_present numeric(5,1) not null default 0,
  days_absent numeric(5,1) not null default 0,
  deduction numeric(12,2) not null default 0,
  ot_hours numeric(7,2) not null default 0,
  ot_amount numeric(12,2) not null default 0,
  advances_deducted numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  status payout_status not null default 'draft',
  approved_by bigint references app_users(id),
  approved_at timestamptz, paid_at timestamptz,
  unique (user_id, pay_month)
);

do $$ begin
  begin
    alter table staff_payouts enable row level security;
    drop policy if exists staff_all on staff_payouts;
    create policy staff_all on staff_payouts for all to authenticated using (fn_is_staff()) with check (fn_is_staff());
  exception when undefined_function then
    alter table staff_payouts disable row level security;
  end;
end $$;
select 'Staff salary module installed' as done;
