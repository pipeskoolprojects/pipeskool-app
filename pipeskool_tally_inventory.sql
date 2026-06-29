-- ============================================================
-- Pipeskool — Tally inventory (Stock masters + Purchase Order voucher)
-- Adds a separate "exported as PO order" stamp (distinct from the
-- purchase-bill stamp), so the PO order and the bill track separately.
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING. Safe to re-run.
-- ============================================================
alter table purchase_orders add column if not exists tally_po_exported_at timestamptz;
