-- ============================================================
-- Pipeskool — Tools & Assets redesign  (v2 — fixes view dependency)
-- Status model + repair workflow + custodian-as-name.
-- RUN THIS IN SUPABASE SQL EDITOR *BEFORE* DEPLOYING THE APP UPDATE.
-- Safe to re-run.
-- ============================================================

-- 0) Drop the view FIRST — it depends on asset_txns.txn_type, so Postgres
--    won't let us change that column's type while the view exists.
drop view if exists v_asset_repair_history;

-- 1) status & txn_type become free text (the app now owns every transition).
alter table assets     alter column status   drop default;
alter table assets     alter column status   type text using status::text;
alter table assets     alter column status   set default 'idle';
alter table asset_txns alter column txn_type type text using txn_type::text;

-- 2) normalise old statuses to the new model:
--    idle | in_use | needs_repair | under_repair | lost
update assets set status = 'idle' where status in ('available', 'in_transit', 'scrapped');

-- 3) custodian as a plain name (UI suggests site staff but accepts any name)
alter table assets     add column if not exists custodian_name text;
alter table asset_txns add column if not exists custodian_name text;

update assets a set custodian_name = u.full_name
  from app_users u
  where a.custodian_user_id = u.id and a.custodian_name is null;

-- 4) drop the auto-sync triggers — app sets status/site/custodian directly
drop trigger if exists trg_asset_txn on asset_txns;
drop trigger if exists trg_asset_ack on asset_txns;

-- 5) recreate repair history = COMPLETED repairs (repair_in) and their cost
create or replace view v_asset_repair_history as
select a.id as asset_id, a.asset_code, a.name,
  count(t.id) filter (where t.txn_type = 'repair_in')                       as repair_count,
  coalesce(sum(t.repair_cost) filter (where t.txn_type = 'repair_in'), 0)   as total_repair_cost,
  a.purchase_cost
from assets a
left join asset_txns t on t.asset_id = a.id
group by a.id;
