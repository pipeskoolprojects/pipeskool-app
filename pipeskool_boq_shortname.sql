-- ============================================================
-- Pipeskool — BOQ SHORT NAMES
-- Concise display name per BOQ line for app screens (tables, RA
-- worksheet, DPR dropdown). The FULL description is preserved and
-- still prints on the client abstract, matching the work order.
-- RUN BEFORE DEPLOYING update106. Safe to re-run.
-- ============================================================
alter table boq_items add column if not exists short_name text;
select 'BOQ short names installed' as done;

-- rebuild the progress view to expose short_name
create or replace view v_boq_progress as
select b.id, b.site_id, s.name as site_name, s.code as site_code,
  b.item_code, b.description, b.short_name, b.unit, b.section,
  b.boq_qty, b.done_qty,
  case when b.boq_qty > 0 then round(b.done_qty / b.boq_qty * 100, 1) else 0 end as pct
from boq_items b join sites s on s.id = b.site_id
where b.is_active;
select 'View rebuilt with short_name' as done2;
