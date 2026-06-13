-- ============================================================
-- PIPESKOOL — Module 4: Material Stock & Inventory
-- Migration v4.0 — run AFTER modules 1, 2, 3
-- ============================================================

create type stock_txn_type as enum ('grn','issue','transfer_out','transfer_in','return','adjustment');
create type material_request_status as enum ('open','indented','fulfilled','cancelled');

-- ---------- ITEM MASTER (plumbing hierarchy: type -> material -> size -> class) ----------
create table item_master (
  id bigint generated always as identity primary key,
  item_type text not null,                  -- Pipe / Fitting / Valve / Fixture / Consumable / Pump / Tank
  material text not null,                    -- CPVC / GI / MS / UPVC / HDPE / Brass ...
  sub_type text,                             -- Elbow / Tee / Gate valve / Coupler (for fittings/valves)
  size text,                                 -- 25mm / 50mm / 350NB
  item_class text,                           -- SDR 11 / Heavy / PN10 / Schedule 40
  make text,                                 -- Astral / Dutron / Wilo ...
  unit text not null default 'Nos',          -- Nos / Rmt / Kg / Set
  hsn_code text,
  min_stock numeric(14,2) not null default 0,
  display_name text generated always as (
    item_type || ' - ' || material ||
    coalesce(' ' || sub_type, '') ||
    coalesce(' ' || size, '') ||
    coalesce(' (' || item_class || ')', '') ||
    coalesce(' [' || make || ']', '')
  ) stored,
  is_active boolean not null default true,
  created_by bigint references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_item_type on item_master(item_type, material);
create unique index idx_item_unique on item_master(
  item_type, material, coalesce(sub_type,''), coalesce(size,''), coalesce(item_class,''), coalesce(make,'')
);

-- ---------- STOCK TRANSACTIONS (single source of truth; balance is derived) ----------
create table stock_txns (
  id bigint generated always as identity primary key,
  item_id bigint not null references item_master(id),
  site_id bigint not null references sites(id),
  txn_type stock_txn_type not null,
  qty numeric(14,2) not null check (qty > 0),  -- always positive; sign applied by type
  rate numeric(12,2),                          -- for GRN: PO rate -> valuation
  txn_date date not null default current_date,
  -- GRN fields
  po_reference text,
  supplier text,
  challan_photo_url text,
  condition_remarks text,
  -- issue fields
  issued_to text,                              -- work area / petty contractor / activity
  activity_id bigint references activities(id),
  -- transfer fields
  counterpart_site_id bigint references sites(id),
  vehicle_no text,
  -- common
  note text,
  done_by bigint references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_stock_item_site on stock_txns(item_id, site_id);
create index idx_stock_site_date on stock_txns(site_id, txn_date);

-- ---------- DAILY CONSUMPTION (quick usage log by site staff) ----------
create table stock_consumption (
  id bigint generated always as identity primary key,
  item_id bigint not null references item_master(id),
  site_id bigint not null references sites(id),
  qty numeric(14,2) not null check (qty > 0),
  cons_date date not null default current_date,
  activity_id bigint references activities(id),
  logged_by bigint references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_cons_item_site on stock_consumption(item_id, site_id);

-- ---------- MATERIAL REQUESTS (site raises; feeds Indent module) ----------
create table material_requests (
  id bigint generated always as identity primary key,
  site_id bigint not null references sites(id),
  item_id bigint not null references item_master(id),
  qty numeric(14,2) not null check (qty > 0),
  required_by date,
  purpose text,
  urgency text default 'normal',            -- normal / urgent
  status material_request_status not null default 'open',
  raised_by bigint references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_matreq_status on material_requests(status) where status = 'open';

-- ---------- LIVE STOCK BALANCE VIEW ----------
-- received(grn+transfer_in) - issued(issue+transfer_out+consumption) +/- adjustment
create or replace view v_stock_balance as
with txn as (
  select item_id, site_id,
    sum(case when txn_type in ('grn','transfer_in','return') then qty
             when txn_type in ('issue','transfer_out') then -qty
             when txn_type = 'adjustment' then qty else 0 end) as net_txn,
    sum(case when txn_type in ('grn','transfer_in') then qty else 0 end) as received,
    sum(case when txn_type in ('issue','transfer_out') then qty else 0 end) as issued,
    sum(case when txn_type = 'return' then qty else 0 end) as returned,
    max(rate) filter (where txn_type = 'grn') as last_rate,
    max(txn_date) as last_movement
  from stock_txns group by item_id, site_id
),
cons as (
  select item_id, site_id, sum(qty) as consumed, max(cons_date) as last_cons
  from stock_consumption group by item_id, site_id
)
select
  i.id as item_id, i.display_name, i.item_type, i.material, i.unit, i.min_stock,
  s.id as site_id, s.code as site_code, s.name as site_name,
  coalesce(t.received,0) as received,
  coalesce(t.issued,0) as issued,
  coalesce(t.returned,0) as returned,
  coalesce(c.consumed,0) as consumed,
  coalesce(t.net_txn,0) - coalesce(c.consumed,0) as balance,
  coalesce(t.last_rate,0) as rate,
  (coalesce(t.net_txn,0) - coalesce(c.consumed,0)) * coalesce(t.last_rate,0) as value,
  greatest(t.last_movement, c.last_cons) as last_activity
from item_master i
cross join sites s
left join txn t on t.item_id = i.id and t.site_id = s.id
left join cons c on c.item_id = i.id and c.site_id = s.id
where i.is_active and s.is_active
  and (t.item_id is not null or c.item_id is not null);

-- ---------- SEED: starter plumbing item master ----------
insert into item_master (item_type, material, sub_type, size, item_class, make, unit, min_stock) values
  ('Pipe','CPVC',null,'25mm','SDR 11','Astral','Rmt',200),
  ('Pipe','CPVC',null,'32mm','SDR 11','Astral','Rmt',150),
  ('Pipe','UPVC',null,'110mm','SWR','Dutron','Rmt',300),
  ('Pipe','MS',null,'350NB','Heavy','—','Rmt',100),
  ('Pipe','MS',null,'200NB','Heavy','—','Rmt',150),
  ('Pipe','HDPE',null,'160mm','PE-80','Dutron','Rmt',200),
  ('Fitting','CPVC','Elbow','25mm',null,'Astral','Nos',100),
  ('Fitting','CPVC','Tee','25mm',null,'Astral','Nos',80),
  ('Fitting','GI','Elbow','50mm',null,'—','Nos',60),
  ('Valve','Brass','Gate valve','50mm','PN16','Zoloto','Nos',20),
  ('Valve','CI','Butterfly valve','200mm','PN16','Audco','Nos',8),
  ('Fixture','Ceramic','Wash basin',null,null,'Hindware','Nos',15),
  ('Consumable','Welding','Electrode','3.15mm',null,'Esab','Kg',50),
  ('Consumable','Solvent','CPVC cement',null,null,'Astral','Nos',30);

-- ============================================================
-- End of Module 4 migration.
-- ============================================================
