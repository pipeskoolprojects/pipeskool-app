-- =============================================================================
-- PIPESKOOL — update177: lock the legacy audit_log table (advisor: rls_disabled_in_public)
-- audit_log is an early leftover; NO app code uses it (the live audit trail is
-- module_audit_log, already policy-locked). Enabling RLS with Director-only
-- read closes the public door; the table and any historical rows are KEPT.
-- BACKUP from Admin -> Backup & Restore BEFORE running (standing rule).
-- =============================================================================

alter table audit_log enable row level security;

drop policy if exists al_select on audit_log;
create policy al_select on audit_log for select to authenticated
  using (fn_is_director());
-- no insert/update/delete policies: nothing writes here; writes are refused

notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from pg_tables
    where schemaname = 'public' and rowsecurity = false)        as unlocked_tables_left,  -- expect 0
  (select count(*) from pg_policies
    where tablename = 'audit_log')                              as audit_log_policies,    -- expect 1
  (select count(*) from audit_log)                              as historical_rows;       -- info only
