-- ============================================================
-- Pipeskool — REMOVE KISHAN'S WORKER PROFILE (run once, NOW)
-- Deletes the auto-created worker punch-profile on 9601703309 and
-- every history row anchoring it. His STAFF login is untouched.
-- Run AFTER deploying update114, which stops it from re-creating.
-- ============================================================
do $$
declare wid bigint;
begin
  select id into wid from workers where mobile = '9601703309' limit 1;
  if wid is not null then
    delete from wage_payouts where worker_id = wid;
    delete from attendance   where worker_id = wid;
    if to_regclass('public.advance_salary_requests') is not null then
      delete from advance_salary_requests where beneficiary_worker_id = wid;
    end if;
    if to_regclass('public.grn_issues') is not null then
      delete from grn_issues where worker_id = wid;
    end if;
    delete from workers where id = wid;
  end if;
end $$;
select 'Kishan worker profile removed' as done,
  (select count(*) from workers where mobile = '9601703309') as rows_left;
