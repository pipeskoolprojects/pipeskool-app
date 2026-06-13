-- ============================================================
-- PIPESKOOL — Module 6: Tools & Assets Register
-- Migration v6.0 — run AFTER modules 1-5
-- ============================================================

create type asset_status as enum ('available','in_use','in_transit','under_repair','lost','scrapped');
create type asset_txn_type as enum ('allocate','transfer','return','repair_out','repair_in','report_loss','scrap');

-- ---------- ASSET MASTER ----------
create table assets (
  id bigint generated always as identity primary key,
  asset_code text unique not null,           -- PSK-TM-001
  name text not null,                         -- Threading machine 4"
  category text not null,                     -- Machine / Power tool / Scaffolding / Testing / Vehicle-mount
  make_model text,
  serial_no text,
  purchase_date date,
  purchase_cost numeric(12,2),
  photo_url text,
  status asset_status not null default 'available',
  current_site_id bigint references sites(id),
  custodian_user_id bigint references app_users(id),
  calibration_required boolean not null default false,
  calibration_due date,                       -- e.g. hydro-test gauges
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_assets_site on assets(current_site_id);
create index idx_assets_status on assets(status);

-- ---------- MOVEMENT / EVENT LOG ----------
create table asset_txns (
  id bigint generated always as identity primary key,
  asset_id bigint not null references assets(id),
  txn_type asset_txn_type not null,
  from_site_id bigint references sites(id),
  to_site_id bigint references sites(id),
  custodian_user_id bigint references app_users(id),
  -- transfer acknowledgement
  acknowledged boolean not null default false,
  acknowledged_by bigint references app_users(id),
  acknowledged_at timestamptz,
  -- repair
  repair_issue text,
  repair_vendor text,
  repair_cost numeric(12,2),
  -- loss
  loss_reason text,
  responsible_user_id bigint references app_users(id),
  note text,
  done_by bigint references app_users(id),
  txn_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index idx_asset_txn_asset on asset_txns(asset_id);

-- ---------- repair cost history view ----------
create or replace view v_asset_repair_history as
select a.id as asset_id, a.asset_code, a.name,
  count(t.id) filter (where t.txn_type = 'repair_out') as repair_count,
  coalesce(sum(t.repair_cost), 0) as total_repair_cost,
  a.purchase_cost
from assets a
left join asset_txns t on t.asset_id = a.id and t.txn_type = 'repair_out'
group by a.id;

-- ---------- trigger: keep asset.status & location in sync with txns ----------
create or replace function fn_asset_txn()
returns trigger language plpgsql as $$
begin
  if new.txn_type = 'allocate' then
    update assets set status = 'in_use', current_site_id = new.to_site_id,
      custodian_user_id = new.custodian_user_id where id = new.asset_id;
  elsif new.txn_type = 'transfer' then
    update assets set status = 'in_transit' where id = new.asset_id;
  elsif new.txn_type = 'return' then
    update assets set status = 'available', custodian_user_id = null where id = new.asset_id;
  elsif new.txn_type = 'repair_out' then
    update assets set status = 'under_repair' where id = new.asset_id;
  elsif new.txn_type = 'repair_in' then
    update assets set status = 'available' where id = new.asset_id;
  elsif new.txn_type = 'report_loss' then
    update assets set status = 'lost' where id = new.asset_id;
  elsif new.txn_type = 'scrap' then
    update assets set status = 'scrapped', is_active = false where id = new.asset_id;
  end if;
  return new;
end $$;

create trigger trg_asset_txn
after insert on asset_txns
for each row execute function fn_asset_txn();

-- ---------- trigger: on transfer acknowledgement, complete the move ----------
create or replace function fn_asset_ack()
returns trigger language plpgsql as $$
begin
  if new.acknowledged and not old.acknowledged and new.txn_type = 'transfer' then
    update assets set status = 'in_use', current_site_id = new.to_site_id,
      custodian_user_id = new.acknowledged_by where id = new.asset_id;
  end if;
  return new;
end $$;

create trigger trg_asset_ack
before update of acknowledged on asset_txns
for each row execute function fn_asset_ack();

-- ---------- SEED: sample assets ----------
insert into assets (asset_code, name, category, make_model, purchase_date, purchase_cost, status, current_site_id, calibration_required, calibration_due) values
  ('PSK-TM-001', 'Threading machine 4"', 'Machine', 'Ridgid 300', '2023-04-10', 185000, 'in_use', 1, false, null),
  ('PSK-GM-001', 'Grooving machine', 'Machine', 'Victaulic VG26', '2023-06-15', 240000, 'in_use', 1, false, null),
  ('PSK-WS-001', 'Welding set 400A', 'Machine', 'ESAB Buddy', '2024-01-20', 62000, 'in_use', 1, false, null),
  ('PSK-WS-002', 'Welding set 400A', 'Machine', 'ESAB Buddy', '2024-01-20', 62000, 'available', 2, false, null),
  ('PSK-HP-001', 'Hydro-test pump', 'Testing', 'Kirloskar 50bar', '2023-09-05', 48000, 'in_use', 1, true, '2026-07-15'),
  ('PSK-PG-001', 'Pressure gauge set', 'Testing', 'Wika 0-60bar', '2024-03-12', 9500, 'in_use', 1, true, '2026-06-25'),
  ('PSK-CC-001', 'Core cutting machine', 'Power tool', 'Hilti DD150', '2024-05-18', 135000, 'under_repair', 2, false, null),
  ('PSK-SC-001', 'Scaffolding set (50 units)', 'Scaffolding', '—', '2023-02-01', 95000, 'in_use', 3, false, null);

-- ============================================================
-- End of Module 6 migration. CORE SITE OPERATIONS COMPLETE.
-- ============================================================
