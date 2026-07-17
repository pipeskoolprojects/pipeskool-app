-- ============================================================
-- Pipeskool — REMOVE payroll test data (run after testing)
-- ============================================================
delete from wage_payouts where worker_id in (select id from workers where mobile like '80000000%');
delete from attendance   where worker_id in (select id from workers where mobile like '80000000%');
delete from workers      where mobile like '80000000%';
delete from contractors  where name = 'TEST CONTRACTOR' and not exists (select 1 from workers where contractor_id = contractors.id);
select 'Payroll test data removed' as done;
