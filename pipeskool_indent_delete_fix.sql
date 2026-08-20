-- =============================================================================
-- PIPESKOOL — update187: INDENT DELETE — works even when 175 was never run
-- Symptom: Delete on an indent whose POs are all cancelled failed with
--   "update or delete on material_indent_items violates foreign key po_items_indent_item_id_fkey"
-- Fix (belt and braces): 1) re-apply the ON DELETE SET NULL link from update175 (idempotent);
-- 2) fn_delete_indent v3 explicitly un-links cancelled PO lines before deleting, and
--    names the LIVE PO numbers when it refuses. Locked rules unchanged: live PO blocks delete;
--    cancelled POs never count. Nothing else touched. Run as ONE transaction. Backup first.
-- =============================================================================
alter table po_items drop constraint if exists po_items_indent_item_id_fkey;
alter table po_items add constraint po_items_indent_item_id_fkey
  foreign key (indent_item_id) references material_indent_items(id) on delete set null;

create or replace function fn_delete_indent(p_indent_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u record; ind record; live_pos text; live_n int; unlinked int;
begin
  select id, role into u from app_users where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.'); end if;
  if not (u.role in ('director', 'it_executive', 'accountant') or fn_has_admin('delete_indent')) then
    return jsonb_build_object('ok', false,
      'error', 'Only Directors, IT, Accountants — or staff granted the "Delete indents" admin right — can delete indents.');
  end if;
  select id, indent_no into ind from material_indents where id = p_indent_id;
  if ind.id is null then return jsonb_build_object('ok', false, 'error', 'Indent not found — it may already be deleted.'); end if;

  select count(*), string_agg(po_no, ', ' order by po_no) into live_n, live_pos
    from purchase_orders where indent_id = p_indent_id and status <> 'cancelled';
  if live_n > 0 then
    return jsonb_build_object('ok', false, 'live_pos', live_n,
      'error', 'Indent ' || ind.indent_no || ' has ' || live_n || ' live purchase order(s): ' || live_pos ||
               '. Cancel the PO(s) first — an indent under a live PO cannot be deleted.');
  end if;

  -- cancelled PO lines keep their own copy of item/qty/rate; just release the link
  update po_items set indent_item_id = null
   where indent_item_id in (select id from material_indent_items where indent_id = p_indent_id);
  get diagnostics unlinked = row_count;

  delete from indent_quotes where indent_id = p_indent_id;
  delete from material_indent_items where indent_id = p_indent_id;
  delete from material_indents where id = p_indent_id;
  return jsonb_build_object('ok', true, 'indent_no', ind.indent_no, 'unlinked_po_lines', unlinked);
end $$;
grant execute on function fn_delete_indent(bigint) to authenticated;

notify pgrst, 'reload schema';

select
  (select delete_rule from information_schema.referential_constraints
    where constraint_name = 'po_items_indent_item_id_fkey')                                   as fk_delete_rule,   -- SET NULL
  (select count(*) from pg_proc where proname = 'fn_delete_indent' and prosrc like '%unlinked_po_lines%') as delete_fn_v3,  -- 1
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)             as unlocked_tables_left; -- 0
