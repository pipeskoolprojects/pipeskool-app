-- ============================================================
-- Pipeskool — Tally integration (foundation + Purchase export)
-- TallyPrime XML import. Office maps ledger names once, then exports
-- vouchers as XML to import into Tally. Purchase = accounting voucher
-- (party + purchase ledger + GST); stock moves via the stock-journal
-- export (separate), per the locked architecture.
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING. Safe to re-run.
-- ============================================================

create table if not exists tally_settings (
  id              int primary key default 1,
  company_name    text,                       -- exact TallyPrime company name
  home_state_code text default '24',          -- Gujarat = 24 (decides CGST+SGST vs IGST)
  default_gst_pct numeric(5,2) default 18,
  purchase_ledger text default 'Purchase',
  cgst_ledger     text default 'Input CGST',
  sgst_ledger     text default 'Input SGST',
  igst_ledger     text default 'Input IGST',
  round_off_ledger text default 'Round Off',
  cash_ledger     text default 'Cash',
  bank_ledger     text default 'Bank',
  default_expense_ledger text default 'Site Expenses',
  voucher_purchase text default 'Purchase',
  voucher_payment  text default 'Payment',
  voucher_stockjrnl text default 'Stock Journal',
  auto_create_party boolean default true,     -- include vendor ledger masters in XML
  constraint tally_single_row check (id = 1)
);
insert into tally_settings (id) values (1) on conflict (id) do nothing;

-- mark POs already pushed to Tally to avoid double posting
alter table purchase_orders add column if not exists tally_exported_at timestamptz;
