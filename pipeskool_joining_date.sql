-- ============================================================
-- Pipeskool — JOINING DATE for proportionate paid leaves
-- Staff joining after 1 April get leaves prorated by months remaining
-- in the Apr–Mar leave year (e.g. 20 annual, joins 1 Oct -> 10).
-- Blank joining date = full entitlement. RUN BEFORE update104.
-- ============================================================
alter table app_users add column if not exists joining_date date;
select 'Joining date installed' as done;
