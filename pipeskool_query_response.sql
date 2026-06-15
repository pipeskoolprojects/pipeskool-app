-- ============================================================
-- PIPESKOOL — Query-response loop (v3.2)
-- Lets site staff reply to a queried claim/advance and resubmit.
-- Run in Supabase SQL Editor.
-- ============================================================

-- Expenses: capture the site person's reply when resubmitting
alter table expenses add column if not exists response_note text;
alter table expenses add column if not exists resubmitted_at timestamptz;

-- Advance salary requests: same
alter table advance_salary_requests add column if not exists response_note text;
alter table advance_salary_requests add column if not exists resubmitted_at timestamptz;

-- ============================================================
-- Done. No data changed; only new optional columns added.
-- ============================================================
