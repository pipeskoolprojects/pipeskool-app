-- ============================================================
-- PIPESKOOL — Stock Returns (v9.3)
-- Two return types:
--   return_store  : surplus from work area back to store (ADDS to balance)
--   return_vendor : wrong/excess back to vendor (SUBTRACTS from balance)
-- Run in Supabase SQL Editor.
-- ============================================================

-- make sure consume table has the columns used by the app
alter table stock_consumption add column if not exists done_by bigint references app_users(id);
alter table stock_consumption add column if not exists purpose text;

-- stock_txns already stores txn_type; we will use 'return_store' and 'return_vendor'.
-- add an optional reason + vendor link for vendor returns
alter table stock_txns add column if not exists return_reason text;

-- ---- rebuild the balance view to account for both return types ----
-- Balance = received + returned_to_store − issued − consumed − returned_to_vendor
create or replace view v_stock_balance as
with txn as (
  select
    t.site_id, t.item_id,
    sum(case when t.txn_type = 'grn'           then t.qty else 0 end) as received,
    sum(case when t.txn_type = 'issue'         then t.qty else 0 end) as issued,
    sum(case when t.txn_type = 'return_store'  then t.qty else 0 end) as returned,
    sum(case when t.txn_type = 'return_vendor' then t.qty else 0 end) as returned_vendor,
    max(t.created_at) as last_txn,
    max(t.rate) filter (where t.txn_type = 'grn') as rate
  from stock_txns t
  group by t.site_id, t.item_id
),
cons as (
  select site_id, item_id, sum(qty) as consumed, max(created_at) as last_cons
  from stock_consumption group by site_id, item_id
)
select
  im.id as item_id, im.display_name, im.item_type, im.unit, coalesce(im.min_stock,0) as min_stock,
  s.id as site_id, s.code as site_code, s.name as site_name,
  coalesce(t.received,0) as received,
  coalesce(t.issued,0) as issued,
  coalesce(t.returned,0) as returned,
  coalesce(t.returned_vendor,0) as returned_vendor,
  coalesce(c.consumed,0) as consumed,
  (coalesce(t.received,0) + coalesce(t.returned,0)
     - coalesce(t.issued,0) - coalesce(c.consumed,0) - coalesce(t.returned_vendor,0)) as balance,
  coalesce(t.rate, im.last_rate, 0) as rate,
  (coalesce(t.received,0) + coalesce(t.returned,0)
     - coalesce(t.issued,0) - coalesce(c.consumed,0) - coalesce(t.returned_vendor,0))
     * coalesce(t.rate, im.last_rate, 0) as value,
  greatest(coalesce(t.last_txn, '1970-01-01'), coalesce(c.last_cons, '1970-01-01')) as last_activity
from item_master im
cross join sites s
left join txn t on t.item_id = im.id and t.site_id = s.id
left join cons c on c.item_id = im.id and c.site_id = s.id
where coalesce(t.received,0) + coalesce(t.issued,0) + coalesce(t.returned,0)
    + coalesce(t.returned_vendor,0) + coalesce(c.consumed,0) > 0;

-- ============================================================
-- Done. Returns to store (add) and to vendor (subtract) supported.
-- ============================================================
