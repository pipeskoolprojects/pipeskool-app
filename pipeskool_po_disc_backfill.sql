-- =============================================================================
-- PIPESKOOL — update179: show Rate / Disc % / Net Rate on OLD POs too
-- POs issued before update178 have no list_rate / discount_pct on their lines
-- (the columns didn't exist yet), so their print falls back to net-rate-only.
-- The list rate and discount you typed in the rate grid WERE saved in
-- indent_quotes — this backfills them onto the old PO lines by matching the
-- same item + the PO's vendor. New POs already store them at issue time.
-- Lines whose quote no longer exists (edited indents clear quotes) or whose
-- item link was released by a cancel keep the graceful net-rate fallback.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

update po_items pi
   set list_rate    = q.list_rate,
       discount_pct = q.discount_pct
  from indent_quotes q, purchase_orders po
 where po.id = pi.po_id
   and pi.indent_item_id is not null
   and q.indent_item_id = pi.indent_item_id
   and q.vendor_name = po.vendor_name
   and pi.list_rate is null
   and q.list_rate is not null;

-- standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from po_items where list_rate is not null)                  as lines_with_discount_data,
  (select count(*) from po_items where list_rate is null)                      as lines_still_fallback,   -- quotes gone / link released
  (select count(*) from pg_tables
    where schemaname = 'public' and rowsecurity = false)                       as unlocked_tables_left;   -- expect 0
