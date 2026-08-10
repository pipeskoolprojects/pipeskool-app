-- =============================================================================
-- PIPESKOOL — update174: EDIT/DELETE unlock after PO cancellation
-- The server-side guards in fn_edit_indent_items and fn_delete_indent counted
-- ALL purchase orders — including cancelled ones — so an indent whose only PO
-- was cancelled stayed locked forever. Both now count LIVE POs only.
-- Rule: an indent is editable/deletable again when every PO on it is cancelled;
-- while ANY live PO exists it stays locked (items under live POs must never be
-- rewritten). Cancelled POs keep their records.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

create or replace function fn_edit_indent_items(p_indent_id bigint, p_required_by date,
  p_urgency text, p_note text, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u record; ind record; po_count int; n int;
begin
  select id, role into u from app_users
   where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null then
    return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.');
  end if;

  select id, raised_by, status, indent_no into ind
    from material_indents where id = p_indent_id;
  if ind.id is null then
    return jsonb_build_object('ok', false, 'error', 'Indent not found.');
  end if;
  if not (ind.raised_by = u.id or u.role in ('director', 'it_executive')) then
    return jsonb_build_object('ok', false, 'error', 'Only the person who raised this indent (or Director/IT) can edit it.');
  end if;
  if ind.status not in ('open', 'quoting') then
    return jsonb_build_object('ok', false, 'error', 'Indent ' || ind.indent_no || ' is ' || ind.status || ' — it can no longer be edited.');
  end if;
  select count(*) into po_count from purchase_orders where indent_id = p_indent_id and status <> 'cancelled';
  if po_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'Indent has LIVE purchase order(s) — editing is locked. Cancel the PO(s) first.');
  end if;

  update material_indents
     set required_by = p_required_by, urgency = coalesce(p_urgency, 'normal'),
         note = p_note, edited_at = now(), status = 'open'
   where id = p_indent_id;

  delete from indent_quotes where indent_id = p_indent_id;        -- stale after item change
  delete from material_indent_items where indent_id = p_indent_id; -- definer: always succeeds

  insert into material_indent_items (indent_id, item_id, item_name, qty, unit, purpose, spec)
  select p_indent_id, (l->>'item_id')::bigint, l->>'item_name', (l->>'qty')::numeric,
         l->>'unit', l->>'purpose', l->>'spec'
    from jsonb_array_elements(p_lines) as l
   where coalesce(l->>'item_name', '') <> '' and coalesce((l->>'qty')::numeric, 0) > 0;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'No valid item lines — edit rejected (nothing was changed).';
  end if;

  return jsonb_build_object('ok', true, 'items', n);
end $$;

grant execute on function fn_edit_indent_items(bigint, date, text, text, jsonb) to authenticated;

create or replace function fn_delete_indent(p_indent_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u record; po_count int; ind record;
begin
  select id, role into u from app_users
   where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null then
    return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.');
  end if;
  if not (u.role in ('director', 'it_executive', 'accountant') or fn_has_admin('delete_indent')) then
    return jsonb_build_object('ok', false,
      'error', 'Only Directors, IT, Accountants — or staff granted the "Delete indents" admin right — can delete indents.');
  end if;

  select id, indent_no into ind from material_indents where id = p_indent_id;
  if ind.id is null then
    return jsonb_build_object('ok', false, 'error', 'Indent not found — it may already be deleted.');
  end if;

  select count(*) into po_count from purchase_orders where indent_id = p_indent_id and status <> 'cancelled';
  if po_count > 0 then
    return jsonb_build_object('ok', false,
      'error', 'Indent ' || ind.indent_no || ' has ' || po_count || ' purchase order(s) — cancel the PO(s) first; deleting under an issued PO would corrupt procurement history.');
  end if;

  delete from indent_quotes where indent_id = p_indent_id;
  delete from material_indent_items where indent_id = p_indent_id;
  delete from material_indents where id = p_indent_id;
  return jsonb_build_object('ok', true, 'indent_no', ind.indent_no);
end $$;

grant execute on function fn_delete_indent(bigint) to authenticated;

-- standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_edit_indent_items'
      and prosrc ilike '%cancelled%')  as edit_fn_fixed,   -- expect 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_delete_indent'
      and prosrc ilike '%cancelled%')  as delete_fn_fixed; -- expect 1
