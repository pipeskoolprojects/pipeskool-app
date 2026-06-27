-- ============================================================
-- Pipeskool — Vendor allocation + discount quoting (Phase C, points 5 & 7)
-- Lets the office allocate items to specific vendors and enter
-- list rate + discount % → net rate. Rate is now optional so an
-- allocated item can exist before its rate comes back.
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING. Safe to re-run.
-- ============================================================
alter table indent_quotes alter column rate drop not null;
alter table indent_quotes add column if not exists list_rate    numeric(12,2);
alter table indent_quotes add column if not exists discount_pct numeric(5,2);
