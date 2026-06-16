-- ============================================================
-- PIPESKOOL — Procurement Stage 1 (v9.0)
-- Fixes challan column, extends material master, adds multi-item
-- indents (material requests) and GRN discrepancy fields.
-- Run in Supabase SQL Editor.
-- ============================================================

-- ---- FIX: stock_txns missing columns used by GRN ----
alter table stock_txns add column if not exists challan_no text;
alter table stock_txns add column if not exists challan_date date;
alter table stock_txns add column if not exists challan_qty numeric(14,3);   -- as per vendor challan
alter table stock_txns add column if not exists short_qty numeric(14,3) default 0; -- discrepancy (challan - received)
alter table stock_txns add column if not exists grn_no text;                 -- groups multi-item GRN lines
alter table stock_txns add column if not exists vendor text;

-- ---- MATERIAL MASTER: extend with HSN, default unit, last purchase rate ----
alter table item_master add column if not exists hsn_code text;
alter table item_master add column if not exists last_rate numeric(12,2);
alter table item_master add column if not exists preferred_vendor text;

-- ---- MULTI-ITEM MATERIAL REQUEST (INDENT) header + lines ----
create table if not exists material_indents (
  id bigint generated always as identity primary key,
  indent_no text unique,
  site_id bigint not null references sites(id),
  raised_by bigint references app_users(id),
  required_by date,
  urgency text default 'normal',         -- normal | urgent
  note text,
  status text not null default 'open',   -- open | quoting | po_issued | partially_received | received | closed | cancelled
  created_at timestamptz not null default now()
);
create index if not exists idx_indents_site on material_indents(site_id);
create index if not exists idx_indents_status on material_indents(status);

create table if not exists material_indent_items (
  id bigint generated always as identity primary key,
  indent_id bigint not null references material_indents(id) on delete cascade,
  item_id bigint references item_master(id),
  item_name text,                        -- snapshot / free text if not in master
  qty numeric(14,3) not null,
  unit text,
  purpose text,
  received_qty numeric(14,3) default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_indent_items on material_indent_items(indent_id);

-- ---- discrepancy issues raised at receipt ----
create table if not exists grn_issues (
  id bigint generated always as identity primary key,
  grn_no text,
  site_id bigint references sites(id),
  item_id bigint references item_master(id),
  item_name text,
  challan_qty numeric(14,3),
  received_qty numeric(14,3),
  issue_note text,
  raised_by bigint references app_users(id),
  status text default 'open',
  created_at timestamptz not null default now()
);

-- ---- indent number generator ----
create or replace function fn_next_indent_no(p_site_id bigint)
returns text language plpgsql as $$
declare n int;
begin
  select count(*) + 1 into n from material_indents where site_id = p_site_id;
  return 'IND/' || p_site_id || '/' || to_char(now(),'YYMM') || '/' || lpad(n::text, 3, '0');
end $$;

-- ============================================================
-- Done. GRN challan error fixed; multi-item indents & GRN ready.
-- ============================================================
