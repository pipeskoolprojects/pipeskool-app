-- =============================================================================
-- PIPESKOOL — update190: OT ELIGIBILITY FOR LABOUR (workers table)
-- app_users.ot_eligible already exists (staff, default false — update staff_salary).
-- Workers get the same master switch; default TRUE keeps today's behaviour for
-- everyone until you switch individuals off in Workers & Staff Master.
-- OT stays manual-approval-only everywhere (locked rule); this only controls
-- whether OT can exist at all for a person. Run as ONE transaction. Backup first.
-- =============================================================================
alter table workers add column if not exists ot_eligible boolean not null default true;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns
    where table_name='workers' and column_name='ot_eligible')                      as worker_ot_col,       -- 1
  (select count(*) from workers where is_active = true and ot_eligible = true)     as eligible_workers,    -- = active workers (all, until you untick)
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false) as unlocked_tables_left; -- 0
