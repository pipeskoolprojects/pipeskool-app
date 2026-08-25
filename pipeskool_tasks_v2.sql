-- =============================================================================
-- PIPESKOOL — update220: TASKS v2 — repeat (none/daily/weekly) on assigned tasks.
-- Additive only; existing tasks untouched (default 'none'). Backup first.
-- =============================================================================
alter table staff_tasks add column if not exists repeat text not null default 'none'
  check (repeat in ('none','daily','weekly'));

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns
     where table_name='staff_tasks' and column_name='repeat')                       as repeat_col,          -- 1
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)  as unlocked_tables_left; -- 0
