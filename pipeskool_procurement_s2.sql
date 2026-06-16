-- ============================================================
-- PIPESKOOL — Procurement Stage 2 (v9.1)
-- Vendor quotes per indent item, rate comparison, PO with
-- mandatory non-lowest reason + split support.
-- Run AFTER Stage 1. Run in Supabase SQL Editor.
-- ============================================================

-- ---- vendors master (extend if exists, else create) ----
create table if not exists vendors (
  id bigint generated always as identity primary key,
  name text not null,
  gstin text,
  contact text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---- quotes: a vendor's rate for a specific indent line ----
create table if not exists indent_quotes (
  id bigint generated always as identity primary key,
  indent_id bigint not null references material_indents(id) on delete cascade,
  indent_item_id bigint not null references material_indent_items(id) on delete cascade,
  vendor_id bigint references vendors(id),
  vendor_name text not null,           -- snapshot (office may type a new vendor)
  rate numeric(12,2) not null,
  remarks text,
  created_at timestamptz not null default now()
);
create index if not exists idx_quotes_indent on indent_quotes(indent_id);

-- ---- purchase orders: header + lines (one indent can yield >1 PO if split) ----
create table if not exists purchase_orders (
  id bigint generated always as identity primary key,
  po_no text unique,
  indent_id bigint references material_indents(id),
  site_id bigint references sites(id),
  vendor_id bigint references vendors(id),
  vendor_name text not null,
  total_amount numeric(14,2) not null default 0,
  is_lowest boolean not null default true,      -- was this the lowest-total vendor?
  non_lowest_reason text,                       -- MANDATORY when is_lowest = false
  split_note text,                              -- reason for splitting into multiple POs
  status text not null default 'issued',        -- issued | delivered | closed | cancelled
  issued_by bigint references app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists po_items (
  id bigint generated always as identity primary key,
  po_id bigint not null references purchase_orders(id) on delete cascade,
  indent_item_id bigint references material_indent_items(id),
  item_id bigint references item_master(id),
  item_name text,
  qty numeric(14,3) not null,
  unit text,
  rate numeric(12,2) not null,
  amount numeric(14,2) generated always as (qty * rate) stored
);
create index if not exists idx_po_items on po_items(po_id);

-- ---- PO number generator ----
create or replace function fn_next_po_no(p_site_id bigint)
returns text language plpgsql as $$
declare n int;
begin
  select count(*) + 1 into n from purchase_orders;
  return 'PO/' || to_char(now(),'YYMM') || '/' || lpad(n::text, 4, '0');
end $$;

-- seed a couple of demo vendors if table empty
insert into vendors (name, gstin, phone)
select * from (values
  ('Turakhia Steel', '24ABCDE1234F1Z5', '9825000001'),
  ('Shree Pipe Traders', '24XYZAB5678K1Z2', '9825000002'),
  ('Gujarat Fittings Co', '24LMNOP9012Q1Z8', '9825000003')
) v(name, gstin, phone)
where not exists (select 1 from vendors);

-- ============================================================
-- Done. Quote entry, comparison and PO (with split + reason) ready.
-- ============================================================
