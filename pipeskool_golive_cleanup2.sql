-- ============================================================
-- Pipeskool — GO-LIVE CLEANUP v2 (fresh slate before launch)
-- Clears ALL transactional/test data entered during development &
-- testing. KEEPS every master: sites+geofences, staff & rights,
-- workers, contractors, vendors, item master, BOQ + payment groups
-- + billing settings, machine types, Tally settings.
-- Missing tables are skipped automatically (no errors).
-- RUN ONCE, as the LAST SQL before launch. NOT reversible.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    -- attendance & pay
    'attendance','wage_payouts','staff_payouts',
    'advance_salary_requests','salary_advances',
    -- money
    'expenses','imprest_transfers','petty_cash_grants',
    -- DPR
    'dpr_work_items','dpr_materials','dpr_photos','dpr_hindrances','dpr',
    -- procurement chain (indents -> quotes -> POs)
    'indent_quotes','po_items','purchase_orders',
    'material_indent_items','material_indents',
    'indent_items','indents','material_requests',
    -- stock movements
    'grn_issues','stock_consumption','stock_txns',
    -- assets & rentals transactions
    'asset_txns','rental_docs','rentals',
    -- billing TEST bills (BOQ itself is kept)
    'ra_bill_lines','ra_bills'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from %I', t);
    end if;
  end loop;
  -- BOQ progress back to zero (it derives from RA bills, now none)
  if to_regclass('public.boq_items') is not null then
    update boq_items set done_qty = 0;
  end if;
end $$;

select 'FRESH SLATE READY' as done,
  (select count(*) from attendance)         as attendance_left,
  (select count(*) from purchase_orders)    as pos_left,
  (select count(*) from expenses)           as expenses_left,
  (select count(*) from ra_bills)           as ra_bills_left,
  (select count(*) from sites)              as sites_kept,
  (select count(*) from app_users where is_active) as staff_kept,
  (select count(*) from boq_items)          as boq_lines_kept;
