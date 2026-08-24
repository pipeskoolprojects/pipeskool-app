-- =============================================================================
-- PIPESKOOL — update215: DELIVERY CHALLAN MODULE (feeds GRN Register; additive)
-- Records what physically arrived against the vendor's own challan, before GRN.
-- Chain: PO -> Delivery Challan -> GRN (grn_no written back on convert).
-- Run as ONE transaction. Backup first (standing rule).
-- =============================================================================
create table if not exists delivery_challans (
  id bigint generated always as identity primary key,
  dc_ref text not null unique,
  site_id bigint not null references sites(id),
  vendor_name text not null default '',
  vendor_dc_no text,
  dc_date date not null default current_date,
  po_id bigint references purchase_orders(id),
  source text not null default 'manual' check (source in ('auto','manual')),
  status text not null default 'pending' check (status in ('matched','mismatch','pending')),
  confidence int,                          -- auto-extraction match confidence %
  proof_path text,                         -- uploaded vendor challan photo/PDF (attendance-photos bucket)
  grn_no text,                             -- filled by Convert -> GRN
  created_by bigint references app_users(id),
  created_at timestamptz not null default now()
);
create table if not exists delivery_challan_items (
  id bigint generated always as identity primary key,
  dc_id bigint not null references delivery_challans(id) on delete cascade,
  po_item_id bigint,
  item_id bigint,
  item_name text not null,
  unit text default '',
  ordered_qty numeric(12,2) not null default 0,
  received_qty numeric(12,2) not null default 0
);
alter table delivery_challans enable row level security;
alter table delivery_challan_items enable row level security;
drop policy if exists dc_sel on delivery_challans;
create policy dc_sel on delivery_challans for select using (auth.uid() is not null);
drop policy if exists dci_sel on delivery_challan_items;
create policy dci_sel on delivery_challan_items for select using (auth.uid() is not null);
drop policy if exists dc_ins on delivery_challans;
create policy dc_ins on delivery_challans for insert
  with check (fn_is_director() or fn_has_perm('stock','create'));
drop policy if exists dc_upd on delivery_challans;
create policy dc_upd on delivery_challans for update
  using (fn_is_director() or fn_has_perm('stock','create'));
drop policy if exists dci_ins on delivery_challan_items;
create policy dci_ins on delivery_challan_items for insert
  with check (fn_is_director() or fn_has_perm('stock','create'));

create or replace function fn_next_dc_no(p_site_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare pfx text; n int;
begin
  pfx := 'DC/' || p_site_id || '/' || to_char(now() at time zone 'Asia/Kolkata', 'YYMM') || '/';
  perform pg_advisory_xact_lock(hashtext('dc_no'), p_site_id::int);
  select coalesce(max(nullif(regexp_replace(substring(dc_ref from length(pfx) + 1), '\D', '', 'g'), '')::int), 0) + 1
    into n from delivery_challans where dc_ref like pfx || '%';
  return pfx || lpad(n::text, 3, '0');
end $$;
grant execute on function fn_next_dc_no(bigint) to authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.tables where table_name in ('delivery_challans','delivery_challan_items')) as dc_tables,        -- 2
  (select count(*) from pg_policies where tablename like 'delivery_challan%')                                          as dc_policies,      -- 6
  (select count(*) from pg_proc where proname='fn_next_dc_no')                                                         as dc_fn,            -- 1
  (select fn_next_dc_no(1) is not null)                                                                                as sample_ok,        -- true
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)                                     as unlocked_tables_left; -- 0
