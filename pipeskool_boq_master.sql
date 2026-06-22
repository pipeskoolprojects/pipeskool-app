-- ============================================================
-- PIPESKOOL — BOQ Master + DPR work logging (v10.0)
-- Per-site BOQ line items (Excel upload + manual). DPR work logs
-- against a BOQ line / material / free-text, tracking cumulative %.
-- Run in Supabase SQL Editor.
-- ============================================================

-- ---- BOQ line items per site ----
create table if not exists boq_items (
  id bigint generated always as identity primary key,
  site_id bigint not null references sites(id) on delete cascade,
  item_code text,
  description text not null,
  unit text,
  boq_qty numeric(16,3) not null default 0,
  rate numeric(14,2),
  section text,                       -- optional grouping (e.g. "Water Supply", "Drainage")
  done_qty numeric(16,3) not null default 0,   -- cumulative qty executed
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_boq_site on boq_items(site_id);

-- ---- DPR work lines can reference a BOQ item, a material item, or free text ----
alter table dpr_work_items add column if not exists boq_item_id bigint references boq_items(id);
alter table dpr_work_items add column if not exists item_id bigint references item_master(id);
alter table dpr_work_items add column if not exists activity_text text;   -- free-text fallback
alter table dpr_work_items add column if not exists unit text;
alter table dpr_work_items alter column activity_id drop not null;

-- ---- bump cumulative done_qty on a BOQ line ----
create or replace function fn_add_boq_progress(p_boq_id bigint, p_qty numeric)
returns void language plpgsql as $$
begin
  update boq_items set done_qty = coalesce(done_qty,0) + coalesce(p_qty,0) where id = p_boq_id;
end $$;

-- ---- progress view: % complete per BOQ line ----
create or replace view v_boq_progress as
select b.id, b.site_id, s.name as site_name, s.code as site_code,
  b.item_code, b.description, b.unit, b.section,
  b.boq_qty, b.done_qty,
  case when b.boq_qty > 0 then round(b.done_qty / b.boq_qty * 100, 1) else 0 end as pct
from boq_items b join sites s on s.id = b.site_id
where b.is_active;

-- ============================================================
-- Done. BOQ master + DPR-to-BOQ progress ready.
-- ============================================================
