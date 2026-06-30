-- ============================================================
-- Pipeskool — Delivery challan / Goods receipt → Tally Receipt Note
-- Marks GRN stock transactions as exported to Tally (Receipt Note).
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING. Safe to re-run.
-- ============================================================
alter table stock_txns add column if not exists tally_rn_exported_at timestamptz;
