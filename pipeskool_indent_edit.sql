-- ============================================================
-- Pipeskool — Indent edit flag (Phase B, point 4)
-- Lets a site edit an indent (same day AND before PO) and flags it as changed.
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING. Safe to re-run.
-- ============================================================
alter table material_indents add column if not exists edited_at timestamptz;
