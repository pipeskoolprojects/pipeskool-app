-- =============================================================================
-- PIPESKOOL — update176: GRN — our challan no + challan page uploads
-- 1. stock_txns.grn_ref: one shared id per goods-receipt (all items of one
--    challan group under it, like issue_ref from update141).
-- 2. stock_txns.our_challan_no: the company's own challan number.
-- 3. grn_docs: uploaded pages of BOTH challans (supplier's and ours),
--    multiple pages per kind, linked by grn_ref.
-- NO data is touched — purely additive columns + one new table.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

alter table stock_txns add column if not exists grn_ref text;
alter table stock_txns add column if not exists our_challan_no text;
create index if not exists idx_stock_txns_grn_ref on stock_txns (grn_ref) where grn_ref is not null;

create table if not exists grn_docs (
  id bigserial primary key,
  grn_ref text not null,
  site_id bigint references sites(id),
  kind text not null check (kind in ('supplier', 'company')),
  path text not null,
  uploaded_by bigint references app_users(id),
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_grn_docs_ref on grn_docs (grn_ref);

alter table grn_docs enable row level security;
drop policy if exists gd_select on grn_docs;
create policy gd_select on grn_docs for select to authenticated using (true);
drop policy if exists gd_insert on grn_docs;
create policy gd_insert on grn_docs for insert to authenticated
  with check (fn_has_perm('stock','create') or fn_has_perm('stock','manage'));

-- standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.columns
    where table_name = 'stock_txns' and column_name in ('grn_ref','our_challan_no'))  as txn_columns,  -- expect 2
  (select count(*) from information_schema.tables
    where table_name = 'grn_docs')                                                    as docs_table,   -- expect 1
  (select count(*) from pg_policies where tablename = 'grn_docs')                     as docs_policies; -- expect 2
