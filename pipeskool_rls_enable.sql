-- ============================================================
-- Pipeskool — PHASE 2b: ENABLE ROW-LEVEL SECURITY
-- ⚠ RUN THIS ONLY AFTER password login (update60) is deployed and
--   EVERY staff member has created a password and signed in at least once.
--   After this runs, the database refuses anonymous access to staff data —
--   anyone not signed in gets nothing.
-- Rollback: pipeskool_rls_rollback.sql restores the old open behaviour.
-- ============================================================

-- Helper: is the caller a signed-in staff member?
create or replace function fn_is_staff() returns boolean
language sql stable security definer as $$
  select exists (select 1 from app_users where auth_id = auth.uid() and is_active);
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'sites','app_users','user_sites','permissions','contractors','workers','attendance',
    'wage_payouts','material_indents','material_indent_items','indent_quotes','purchase_orders','po_items',
    'item_master','stock_txns','grn_issues','vendors','assets','asset_txns',
    'dpr_reports','dpr_lines','dpr_photos','boq_items','expenses','expense_queries',
    'ra_settings','ra_bills','ra_bill_lines','tally_settings'
  ]
  loop
    -- skip tables that don't exist in this database
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_all on %I', t);
    execute format('create policy staff_all on %I for all to authenticated using (fn_is_staff()) with check (fn_is_staff())', t);
  end loop;
end $$;

-- ---- Deliberate exceptions: the WORKER self-punch flow (workers are not staff
-- and have no passwords yet — they log in by mobile and can only punch themselves).
-- Without these, worker punching would break the moment RLS turns on.
drop policy if exists worker_lookup on workers;
create policy worker_lookup on workers for select to anon using (is_active);

drop policy if exists worker_punch_read on attendance;
create policy worker_punch_read on attendance for select to anon using (true);
drop policy if exists worker_punch_insert on attendance;
create policy worker_punch_insert on attendance for insert to anon with check (punch_type = 'self');
drop policy if exists worker_punch_update on attendance;
create policy worker_punch_update on attendance for update to anon using (punch_type = 'self') with check (punch_type = 'self');

-- sites: workers need geofence + shift info to punch
drop policy if exists site_geo_read on sites;
create policy site_geo_read on sites for select to anon using (is_active);
