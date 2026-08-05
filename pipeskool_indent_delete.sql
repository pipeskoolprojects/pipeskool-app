-- =============================================================================
-- PIPESKOOL — update148: delete indent (Director / IT Executive / Accountant only)
-- Deletes a wrong/duplicate indent with its item lines and vendor quotes.
-- BLOCKED if any Purchase Order exists for it — cancel the PO first, so no PO
-- is ever orphaned. Role check is done SERVER-SIDE from the caller's login.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

drop function if exists fn_delete_indent(bigint);

create function fn_delete_indent(p_indent_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u record; ind record; po_count int;
begin
  select id, role into u from app_users
   where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null then
    return jsonb_build_object('ok', false, 'error', 'No active staff login.');
  end if;
  if u.role not in ('director', 'it_executive', 'accountant') then
    return jsonb_build_object('ok', false,
      'error', 'Only Director, IT Executive or Accountant can delete an indent.');
  end if;

  select id, indent_no into ind from material_indents where id = p_indent_id;
  if ind.id is null then
    return jsonb_build_object('ok', false, 'error', 'Indent not found.');
  end if;

  select count(*) into po_count from purchase_orders where indent_id = p_indent_id;
  if po_count > 0 then
    return jsonb_build_object('ok', false,
      'error', 'This indent has ' || po_count || ' PO(s). Cancel the PO(s) first, then delete.');
  end if;

  delete from indent_quotes         where indent_id = p_indent_id;
  delete from material_indent_items where indent_id = p_indent_id;
  delete from material_indents      where id = p_indent_id;

  return jsonb_build_object('ok', true, 'indent_no', ind.indent_no);
end $$;

grant execute on function fn_delete_indent(bigint) to authenticated;
revoke execute on function fn_delete_indent(bigint) from anon;

-- ---------- verification (SQL-Editor safe) ----------
select count(*) as fn_delete_indent_installed
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'fn_delete_indent';
-- expect: 1
