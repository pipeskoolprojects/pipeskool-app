-- ============================================================
-- Pipeskool — Director password reset
-- Adds a reset counter so the Director can force any staff member's
-- password to be recreated (old credentials become useless for staff access).
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING update74. Safe to re-run.
-- ============================================================
alter table app_users add column if not exists auth_version int not null default 1;
