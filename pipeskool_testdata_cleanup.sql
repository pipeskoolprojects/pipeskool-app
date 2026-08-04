-- =============================================================================
-- PIPESKOOL — update143: targeted TEST-DATA cleanup
-- Deletes ONLY:
--   1. Test indent IND/1/2607/001 (+ its item lines, quotes, PO lines/POs if any)
--   2. Test asset ABC-XYZ "WELDING MACHINE BOSCH" (+ its movement history)
-- Nothing else is touched. (The "Consumption vs BOQ norm" rows you saw are NOT
-- database data — they were demo rows hardcoded in the app; removed in the
-- update143 code, no SQL needed for that.)
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---- 1. test indent IND/1/2607/001 and everything hanging off it ----
with tgt as (select id from material_indents where indent_no = 'IND/1/2607/001')
delete from po_items
 where po_id in (select id from purchase_orders where indent_id in (select id from tgt));

with tgt as (select id from material_indents where indent_no = 'IND/1/2607/001')
delete from purchase_orders where indent_id in (select id from tgt);

with tgt as (select id from material_indents where indent_no = 'IND/1/2607/001')
delete from indent_quotes where indent_id in (select id from tgt);

with tgt as (select id from material_indents where indent_no = 'IND/1/2607/001')
delete from material_indent_items where indent_id in (select id from tgt);

delete from material_indents where indent_no = 'IND/1/2607/001';

-- ---- 2. test asset ABC-XYZ ----
delete from asset_txns
 where asset_id in (select id from assets where asset_code = 'ABC-XYZ');
delete from assets where asset_code = 'ABC-XYZ';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from material_indents where indent_no = 'IND/1/2607/001') as indent_left,
  (select count(*) from assets where asset_code = 'ABC-XYZ')                 as asset_left;
-- expect: indent_left = 0, asset_left = 0
