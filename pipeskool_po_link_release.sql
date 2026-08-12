-- =============================================================================
-- PIPESKOOL — update175: EDIT-AFTER-CANCEL, final layer
-- Saving an edit on an indent whose PO was cancelled failed with:
--   "update or delete on material_indent_items violates foreign key
--    po_items_indent_item_id_fkey"
-- Cause: the cancelled PO's line rows still POINT at the indent's item rows,
-- and the link had no release rule, so the edit's delete was refused.
-- Fix: the link now releases automatically (ON DELETE SET NULL). Safe because
-- every PO line stores its own copy of item name / qty / unit / rate — a
-- cancelled PO's record and print remain complete forever. Live POs still
-- block editing entirely (update174 guard), so live links are never touched.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

alter table po_items drop constraint if exists po_items_indent_item_id_fkey;
alter table po_items add constraint po_items_indent_item_id_fkey
  foreign key (indent_item_id) references material_indent_items(id) on delete set null;

-- standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select delete_rule from information_schema.referential_constraints
    where constraint_name = 'po_items_indent_item_id_fkey')            as fk_delete_rule;  -- expect SET NULL
