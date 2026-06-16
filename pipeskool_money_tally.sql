-- ============================================================
-- PIPESKOOL — Money: Paid/Posted tracking + approval audit (v3.3)
-- Run in Supabase SQL Editor.
-- ============================================================

-- Advance salary requests
alter table advance_salary_requests add column if not exists posted_to_tally boolean not null default false;
alter table advance_salary_requests add column if not exists posted_at timestamptz;
alter table advance_salary_requests add column if not exists posted_by bigint references app_users(id);

-- Expenses
alter table expenses add column if not exists posted_to_tally boolean not null default false;
alter table expenses add column if not exists posted_at timestamptz;
alter table expenses add column if not exists posted_by bigint references app_users(id);

-- (reviewed_by / reviewed_at already exist from earlier migrations for approval audit)

-- ============================================================
-- Done. Only optional columns added; no data changed.
-- ============================================================
