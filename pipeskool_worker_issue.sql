-- ============================================================
-- PIPESKOOL — Per-Worker Issue & Settlement (v9.5)
-- Issue material to a named worker. Settle later = Used (consumption)
-- + Returned to store. Pending settlements flagged per worker+item.
-- Run in Supabase SQL Editor.
-- ============================================================

-- worker tracking on issues / returns-to-store
alter table stock_txns add column if not exists worker_id bigint references workers(id);
alter table stock_txns add column if not exists worker_name text;

-- worker tracking on consumption (so "used" ties to the worker who held it)
alter table stock_consumption add column if not exists worker_id bigint references workers(id);
alter table stock_consumption add column if not exists worker_name text;

-- ---- per worker + item HELD pool (pending settlement) ----
-- held = issued to worker − used by worker − returned-to-store by worker
drop view if exists v_worker_holdings cascade;
create view v_worker_holdings as
with iss as (
  select site_id, item_id, worker_id, max(worker_name) as worker_name,
         sum(qty) as issued, min(created_at) as first_issue, max(created_at) as last_issue
  from stock_txns where txn_type = 'issue' and worker_id is not null
  group by site_id, item_id, worker_id
),
ret as (
  select site_id, item_id, worker_id, sum(qty) as returned
  from stock_txns where txn_type = 'return_store' and worker_id is not null
  group by site_id, item_id, worker_id
),
con as (
  select site_id, item_id, worker_id, sum(qty) as used
  from stock_consumption where worker_id is not null
  group by site_id, item_id, worker_id
)
select
  i.site_id, s.name as site_name, s.code as site_code,
  i.item_id, im.display_name, im.unit,
  i.worker_id, i.worker_name,
  i.issued,
  coalesce(c.used,0)     as used,
  coalesce(r.returned,0) as returned,
  (i.issued - coalesce(c.used,0) - coalesce(r.returned,0)) as held,
  i.first_issue, i.last_issue,
  floor(extract(epoch from (now() - i.first_issue)) / 86400)::int as days_outstanding
from iss i
join item_master im on im.id = i.item_id
join sites s on s.id = i.site_id
left join ret r on r.site_id = i.site_id and r.item_id = i.item_id and r.worker_id = i.worker_id
left join con c on c.site_id = i.site_id and c.item_id = i.item_id and c.worker_id = i.worker_id
where (i.issued - coalesce(c.used,0) - coalesce(r.returned,0)) > 0;

-- ============================================================
-- Done. Issue-to-worker + holdings pool ready.
-- Store balance view (v_stock_balance) is unchanged and correct:
--   issue removes from store; consumption does NOT (already issued).
-- ============================================================
