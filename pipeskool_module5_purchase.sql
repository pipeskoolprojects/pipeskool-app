-- ============================================================
-- PIPESKOOL — Module 5: Material Indent & Purchase
-- Migration v5.0 — run AFTER modules 1-4
-- ============================================================

create type indent_status as enum ('pending','approved','rejected','po_issued','dispatched','partial','delivered','cancelled');
create type po_status as enum ('draft','issued','partial','closed','cancelled');

-- ---------- VENDORS (supplier master) ----------
create table vendors (
  id bigint generated always as identity primary key,
  name text not null,
  contact_person text,
  contact_mobile text,
  email text,
  gst_number text,
  address text,
  payment_terms text,                       -- e.g. 30 days credit / Advance / 50-50
  rating numeric(2,1) default 0,            -- running performance score 0-5
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- vendor item rate history (for price trend & rate comparison)
create table vendor_rates (
  id bigint generated always as identity primary key,
  vendor_id bigint not null references vendors(id),
  item_id bigint not null references item_master(id),
  rate numeric(12,2) not null,
  quoted_on date not null default current_date,
  enquiry_id bigint,
  created_at timestamptz not null default now()
);
create index idx_vrate_item on vendor_rates(item_id, quoted_on);

-- ---------- INDENTS (header + lines) ----------
create table indents (
  id bigint generated always as identity primary key,
  indent_no text unique,
  site_id bigint not null references sites(id),
  required_by date,
  purpose text,
  urgency text default 'normal',
  status indent_status not null default 'pending',
  raised_by bigint references app_users(id),
  approved_by bigint references app_users(id),
  approved_at timestamptz,
  reject_note text,
  created_at timestamptz not null default now()
);
create index idx_indent_status on indents(status);

create table indent_items (
  id bigint generated always as identity primary key,
  indent_id bigint not null references indents(id) on delete cascade,
  item_id bigint not null references item_master(id),
  qty numeric(14,2) not null check (qty > 0),
  approved_qty numeric(14,2),               -- HO may trim after stock check
  material_request_id bigint references material_requests(id)
);

-- ---------- ENQUIRIES & QUOTES (rate comparison: 3 quotes) ----------
create table enquiries (
  id bigint generated always as identity primary key,
  enquiry_no text unique,
  indent_id bigint references indents(id),
  created_by bigint references app_users(id),
  created_at timestamptz not null default now()
);

create table enquiry_quotes (
  id bigint generated always as identity primary key,
  enquiry_id bigint not null references enquiries(id) on delete cascade,
  vendor_id bigint not null references vendors(id),
  item_id bigint not null references item_master(id),
  qty numeric(14,2) not null,
  rate numeric(12,2) not null,
  delivery_days integer,
  is_selected boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- PURCHASE ORDERS ----------
create table purchase_orders (
  id bigint generated always as identity primary key,
  po_no text unique not null,
  vendor_id bigint not null references vendors(id),
  site_id bigint not null references sites(id),
  indent_id bigint references indents(id),
  po_date date not null default current_date,
  payment_terms text,
  delivery_address text,
  gst_pct numeric(5,2) not null default 18,
  subtotal numeric(14,2) not null default 0,
  gst_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status po_status not null default 'draft',
  amendment_no integer not null default 0,
  amendment_note text,
  created_by bigint references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_po_vendor on purchase_orders(vendor_id);

create table po_items (
  id bigint generated always as identity primary key,
  po_id bigint not null references purchase_orders(id) on delete cascade,
  item_id bigint not null references item_master(id),
  qty numeric(14,2) not null check (qty > 0),
  rate numeric(12,2) not null,
  amount numeric(14,2) generated always as (qty * rate) stored,
  received_qty numeric(14,2) not null default 0,   -- updated from GRN
  billed_qty numeric(14,2) not null default 0       -- updated from vendor bill
);

-- ---------- VENDOR BILLS (for 3-way match) ----------
create table vendor_bills (
  id bigint generated always as identity primary key,
  bill_no text,
  vendor_id bigint not null references vendors(id),
  po_id bigint references purchase_orders(id),
  bill_date date,
  amount numeric(14,2) not null,
  bill_photo_url text,
  match_status text default 'pending',       -- matched / short_supply / overbilled / pending
  created_at timestamptz not null default now()
);

-- ---------- PO vs GRN vs BILL: 3-way match view ----------
create or replace view v_three_way_match as
select
  po.id as po_id, po.po_no, v.name as vendor, s.code as site_code,
  pi.item_id, im.display_name,
  pi.qty as po_qty, pi.received_qty, pi.billed_qty,
  pi.rate, pi.amount as po_amount,
  case
    when pi.received_qty < pi.qty then 'short_supply'
    when pi.billed_qty > pi.received_qty then 'overbilled'
    when pi.received_qty = pi.qty and pi.billed_qty = pi.qty then 'matched'
    else 'in_progress'
  end as match_flag
from po_items pi
join purchase_orders po on po.id = pi.po_id
join vendors v on v.id = po.vendor_id
join sites s on s.id = po.site_id
join item_master im on im.id = pi.item_id;

-- ---------- PRICE TREND view ----------
create or replace view v_price_trend as
select item_id, quoted_on, min(rate) as min_rate, avg(rate) as avg_rate, max(rate) as max_rate
from vendor_rates group by item_id, quoted_on order by quoted_on;

-- ---------- auto PO total ----------
create or replace function fn_po_totals()
returns trigger language plpgsql as $$
declare st numeric;
begin
  select coalesce(sum(qty*rate),0) into st from po_items where po_id = coalesce(new.po_id, old.po_id);
  update purchase_orders set
    subtotal = st,
    gst_amount = round(st * gst_pct / 100, 2),
    total = st + round(st * gst_pct / 100, 2)
  where id = coalesce(new.po_id, old.po_id);
  return null;
end $$;

create trigger trg_po_totals
after insert or update or delete on po_items
for each row execute function fn_po_totals();

-- ---------- SEED: vendors ----------
insert into vendors (name, contact_person, contact_mobile, gst_number, payment_terms, rating) values
  ('Shree Hardware & Pipes', 'Jayesh Shah', '9824011111', '24ABCDS1234A1Z5', '30 days credit', 4.2),
  ('Gujarat Pipe Traders', 'Nilesh Patel', '9824022222', '24XYZGP5678B1Z3', '50% advance, 50% on delivery', 3.8),
  ('Astral Distributor - Ahmedabad', 'Ramesh Mehta', '9824033333', '24ASTRL9012C1Z7', 'Advance', 4.6);

-- ============================================================
-- End of Module 5 migration.
-- ============================================================
