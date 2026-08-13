-- =============================================================================
-- PIPESKOOL — update178 (v2 — 42P01 fix: rights table is named permissions, not user_perms): PO delivered-status fix + per-item GST & discount +
--                        "Manage staff" capability
-- 1. po_status enum gains 'delivered' — fixes: invalid input value for enum.
-- 2. po_items: list_rate, discount_pct, gst_pct (default 18) — POs can carry
--    5% / 12% / 18% / 28% items together; print shows Rate → Disc% → Net.
-- 3. manage_staff capability: holders can ADD/EDIT staff in the Staff Master
--    (app_users + site assignment + role-default rights seeding). Editing
--    Access Rights ticks remains Director-only — deliberate separation.
-- Purely additive — no data touched.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- 1. delivery status
alter type po_status add value if not exists 'delivered';

-- 2. PO line pricing columns
alter table po_items add column if not exists list_rate    numeric(12,2);
alter table po_items add column if not exists discount_pct numeric(5,2);
alter table po_items add column if not exists gst_pct      numeric(4,1) not null default 18;

-- 3. manage_staff — additive policies (existing Director policies stay)
drop policy if exists au_ins_staffadmin on app_users;
create policy au_ins_staffadmin on app_users for insert to authenticated
  with check (fn_has_admin('manage_staff'));
drop policy if exists au_upd_staffadmin on app_users;
create policy au_upd_staffadmin on app_users for update to authenticated
  using (fn_has_admin('manage_staff'));
drop policy if exists us_ins_staffadmin on user_sites;
create policy us_ins_staffadmin on user_sites for insert to authenticated
  with check (fn_has_admin('manage_staff'));
drop policy if exists us_del_staffadmin on user_sites;
create policy us_del_staffadmin on user_sites for delete to authenticated
  using (fn_has_admin('manage_staff'));
drop policy if exists up_ins_staffadmin on permissions;
create policy up_ins_staffadmin on permissions for insert to authenticated
  with check (fn_has_admin('manage_staff'));
drop policy if exists up_del_staffadmin on permissions;
create policy up_del_staffadmin on permissions for delete to authenticated
  using (fn_has_admin('manage_staff'));

-- standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'po_status' and e.enumlabel = 'delivered')                 as delivered_status, -- expect 1
  (select count(*) from information_schema.columns
    where table_name = 'po_items'
      and column_name in ('list_rate','discount_pct','gst_pct'))                as po_columns,       -- expect 3
  (select count(*) from pg_policies where policyname like '%staffadmin')        as staff_policies,   -- expect 6
  (select count(*) from pg_tables
    where schemaname = 'public' and rowsecurity = false)                        as unlocked_tables_left; -- expect 0
