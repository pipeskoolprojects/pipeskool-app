-- ============================================================
-- PIPESKOOL — update118: Staff bank / KYC details
-- Adds bank account, IFSC and PAN to staff (app_users) so the
-- Staff Salary Excel sheet can carry transfer details.
-- Safe to run any time (works with RLS enabled — column add only,
-- existing app_users policies cover the new columns).
-- Run in Supabase SQL Editor BEFORE deploying the update118 code.
-- ============================================================

alter table app_users add column if not exists bank_account_no text;
alter table app_users add column if not exists bank_ifsc text;
alter table app_users add column if not exists pan_no text;

-- verification: should list the three new columns
select column_name
from information_schema.columns
where table_name = 'app_users'
  and column_name in ('bank_account_no', 'bank_ifsc', 'pan_no')
order by column_name;
