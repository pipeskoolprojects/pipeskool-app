-- ============================================================
-- Pipeskool — GO-LIVE CLEANUP (run once before real operations)
-- Removes: payroll TEST data, demo seed assets (PSK-… samples),
-- and deactivates the old 90000000xx test staff logins.
-- Real data entered by your team is NOT touched.
-- ============================================================

-- 1) payroll test data (TEST workers + their attendance/payouts + TEST CONTRACTOR)
delete from wage_payouts where worker_id in (select id from workers where mobile like '80000000%');
delete from attendance   where worker_id in (select id from workers where mobile like '80000000%');
delete from workers      where mobile like '80000000%';
delete from contractors  where name = 'TEST CONTRACTOR'
  and not exists (select 1 from workers where contractor_id = contractors.id);

-- 2) demo seed assets (sample PSK-coded machines/instruments from development)
delete from asset_txns where asset_id in (select id from assets where asset_code like 'PSK-%');
delete from assets where asset_code like 'PSK-%';

-- 3) old TEST staff logins (9000000001-5) — deactivated, not deleted,
--    so any history they created stays intact but they can never sign in.
update app_users set is_active = false where mobile like '90000000%';

select 'Go-live cleanup done' as done,
  (select count(*) from workers where mobile like '80000000%') as test_workers_left,
  (select count(*) from assets where asset_code like 'PSK-%') as demo_assets_left,
  (select count(*) from app_users where mobile like '90000000%' and is_active) as test_staff_active;
