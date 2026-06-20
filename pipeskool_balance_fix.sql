-- ============================================================
-- PIPESKOOL — Stock Balance Fix (v9.4)
-- Correct store balance: consumption does NOT deduct again.
--   Store Balance = Received + Returned-to-store
--                   − Issued − Returned-to-vendor
-- Consumption is tracked separately (for Tally + BOQ wastage),
-- and represents usage of ALREADY-ISSUED material.
-- Run in Supabase SQL Editor.
-- ============================================================

drop view if exists v_stock_balance cascade;

create view v_stock_balance as
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
  coalesce(t.received,0)         as received,
  coalesce(t.issued,0)           as issued,
  coalesce(t.returned,0)         as returned,           -- returned to store
  coalesce(t.returned_vendor,0)  as returned_vendor,
  coalesce(c.consumed,0)         as consumed,           -- usage of issued material (info only)
  -- STORE balance: issue removes from store; consumption does NOT (already issued)
  (coalesce(t.received,0) + coalesce(t.returned,0)
     - coalesce(t.issued,0) - coalesce(t.returned_vendor,0)) as balance,
  -- material lying with the site team: issued but neither consumed nor returned to store
  (coalesce(t.issued,0) - coalesce(c.consumed,0) - coalesce(t.returned,0)) as with_site,
  coalesce(t.rate, im.last_rate, 0) as rate,
  (coalesce(t.received,0) + coalesce(t.returned,0)
     - coalesce(t.issued,0) - coalesce(t.returned_vendor,0))
     * coalesce(t.rate, im.last_rate, 0) as value,
  greatest(coalesce(t.last_txn, '1970-01-01'), coalesce(c.last_cons, '1970-01-01')) as last_activity
from item_master im
cross join sites s
left join txn t on t.item_id = im.id and t.site_id = s.id
left join cons c on c.item_id = im.id and c.site_id = s.id
where coalesce(t.received,0) + coalesce(t.issued,0) + coalesce(t.returned,0)
    + coalesce(t.returned_vendor,0) + coalesce(c.consumed,0) > 0;

-- ============================================================
-- Done. Store balance no longer double-counts consumption.
-- New column 'with_site' = issued − consumed − returned-to-store.
-- ============================================================
