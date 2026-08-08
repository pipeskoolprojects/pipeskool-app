-- =============================================================================
-- PIPESKOOL — update161: INDENT-EDIT DOUBLING FIX + duplicate cleanup +
--                        automatic API-cache reload (new standard)
--
-- BUG: editing an indent deleted old item rows then inserted the new list, but
-- the delete needed the Indent MANAGE tick — for raisers with only Create it
-- silently deleted NOTHING, then re-inserted everything: 34 -> 68 -> 134.
-- FIX: fn_edit_indent_items (SECURITY DEFINER) — verifies the editor (raiser,
-- Director, or IT), blocks if a PO exists, then replaces items + clears quotes
-- ATOMICALLY. The app now edits ONLY through this function.
-- CLEANUP: removes exact-duplicate item lines created by the bug (all indents,
-- keeps one of each identical line).
-- NEW STANDARD: this and every future SQL file ends with an API-cache reload,
-- killing the "data disappeared after SQL" class of incident permanently.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. atomic edit function ----------
drop function if exists fn_edit_indent_items(bigint, date, text, text, jsonb);

create function fn_edit_indent_items(p_indent_id bigint, p_required_by date,
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
  select count(*) into po_count from purchase_orders where indent_id = p_indent_id;
  if po_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'Indent has purchase order(s) — editing is locked.');
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

-- ---------- 2. remove exact-duplicate lines created by the bug ----------
with ranked as (
  select id, row_number() over (
    partition by indent_id, coalesce(item_id, -1), item_name, qty, unit,
                 coalesce(purpose, ''), coalesce(spec, '')
    order by id) as rn
  from material_indent_items
)
delete from material_indent_items
 where id in (select id from ranked where rn > 1);

-- ---------- 3. NEW STANDARD: reload the API schema cache ----------
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_edit_indent_items')            as edit_fn,        -- expect 1
  (select count(*) from (
     select 1 from material_indent_items
     group by indent_id, coalesce(item_id, -1), item_name, qty, unit,
              coalesce(purpose, ''), coalesce(spec, '')
     having count(*) > 1) d)                                                      as dup_groups_left, -- expect 0
  (select count(*) from material_indent_items mi
     join material_indents i on i.id = mi.indent_id
    where i.indent_no = 'IND/7/2608/001')                                         as ind7_items_now;  -- Kishan's true count (~34)
