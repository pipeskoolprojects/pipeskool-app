-- =============================================================================
-- PIPESKOOL — update150: PENDING-REVIEW queue for quick-added items
-- Items quick-added from indents (and the earlier backfill) no longer land in
-- the master silently. They are flagged pending_review = office team reviews,
-- edits (proper Type/Size/HSN), and approves them into the master from the
-- Item / Material Master page. Pending items:
--   - stay linked to the indents that created them (nothing breaks),
--   - do NOT appear in item searches (indents, GRN, stock) until approved.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

alter table item_master add column if not exists pending_review boolean not null default false;

-- every quick-added item so far carries the temporary type GENERAL -> queue them all
update item_master set pending_review = true
 where item_type = 'GENERAL' and is_active = true;

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.columns
    where table_name = 'item_master' and column_name = 'pending_review') as column_installed, -- expect 1
  (select count(*) from item_master where pending_review = true)         as items_in_queue;   -- your GENERAL items count
