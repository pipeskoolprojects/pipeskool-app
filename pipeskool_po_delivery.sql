-- ============================================================
-- Pipeskool — PO delivery tracking (Phase B, point 8)
-- Carries the site's expected date onto the PO, lets the office update
-- a live delivery status, which the site sees on mobile.
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING. Safe to re-run.
-- ============================================================
alter table purchase_orders add column if not exists expected_delivery   date;
alter table purchase_orders add column if not exists delivery_status      text not null default 'pending';
alter table purchase_orders add column if not exists delivery_note        text;
alter table purchase_orders add column if not exists delivery_updated_at  timestamptz;

-- seed expected delivery from the indent's required-by date
update purchase_orders p set expected_delivery = mi.required_by
  from material_indents mi
  where p.indent_id = mi.id and p.expected_delivery is null;
