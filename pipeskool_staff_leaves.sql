-- ============================================================
-- Pipeskool — PAID LEAVES for selected staff
-- Annual paid-leave entitlement per staff member (e.g. 20). Monthly
-- absences consume the remaining balance first (no deduction); only
-- absences beyond the balance cut salary. Balance tracks per calendar
-- year from the staff salary sheets themselves.
-- RUN BEFORE DEPLOYING update101. Safe to re-run.
-- ============================================================
alter table app_users add column if not exists annual_paid_leaves numeric(5,1) not null default 0;
alter table staff_payouts add column if not exists leaves_used numeric(5,1) not null default 0;
alter table staff_payouts add column if not exists leave_balance numeric(5,1) not null default 0;
select 'Paid leaves installed' as done;
