-- ============================================================
-- Pipeskool — RLS ROLLBACK (emergency)
-- Turns row-level security OFF again on all tables, restoring the
-- pre-Phase-2b open behaviour. Run if login problems lock the team out.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'sites','app_users','user_sites','permissions','contractors','workers','attendance',
    'wage_payouts','material_indents','material_indent_items','indent_quotes','purchase_orders','po_items',
    'item_master','stock_txns','grn_issues','vendors','assets','asset_txns',
    'dpr_reports','dpr_lines','dpr_photos','boq_items','expenses','expense_queries',
    'ra_settings','ra_bills','ra_bill_lines','tally_settings'
  ]
  loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table %I disable row level security', t);
  end loop;
end $$;
