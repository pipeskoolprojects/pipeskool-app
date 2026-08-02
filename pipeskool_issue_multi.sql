-- =============================================================================
-- PIPESKOOL — update141: multi-item Issue to Worker
-- Adds issue_ref on stock_txns: all items issued together in one transaction
-- share the same Issue ID (e.g. ISS-20260802-483920).
-- Purely additive — no existing data or behaviour changes.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

alter table stock_txns add column if not exists issue_ref text;

-- lookup by issue id (settlement / audit views later)
create index if not exists idx_stock_txns_issue_ref on stock_txns(issue_ref)
  where issue_ref is not null;

-- ---------- verification (SQL-Editor safe) ----------
select count(*) as issue_ref_column_installed
  from information_schema.columns
 where table_schema = 'public' and table_name = 'stock_txns' and column_name = 'issue_ref';
-- expect: 1
