-- =============================================================================
-- PIPESKOOL — update154: ADMIN CAPABILITIES (assignable micro-permissions)
-- Company-wide admin tasks stop being hardcoded to roles. A new admin_rights
-- table holds per-person capabilities, granted from Access Rights by Directors.
-- Directors implicitly hold every capability. Enforcement is in the DATABASE
-- (RLS / functions), the UI only reflects it.
--
-- Capabilities wired in this update:
--   manage_categories -> add/rename worker categories
--   delete_indent     -> delete indents (IN ADDITION to Director/IT/Accountant,
--                        who keep the right as before — no regression)
-- The framework grows: each future micro-task = one catalog line in the app
-- + one fn_has_admin('<cap>') clause in its policy/function.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- 1. capability grants
create table if not exists admin_rights (
  user_id    bigint not null references app_users(id) on delete cascade,
  capability text   not null,
  allowed    boolean not null default true,
  granted_by bigint,
  granted_at timestamptz not null default now(),
  primary key (user_id, capability)
);

alter table admin_rights enable row level security;
drop policy if exists ar_select on admin_rights;
create policy ar_select on admin_rights for select to authenticated using (true);
drop policy if exists ar_insert on admin_rights;
create policy ar_insert on admin_rights for insert to authenticated with check (fn_is_director());
drop policy if exists ar_update on admin_rights;
create policy ar_update on admin_rights for update to authenticated using (fn_is_director());
drop policy if exists ar_delete on admin_rights;
create policy ar_delete on admin_rights for delete to authenticated using (fn_is_director());

-- 2. the single check used by every enforcement point
create or replace function fn_has_admin(p_cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select fn_is_director() or exists (
    select 1 from admin_rights ar
      join app_users u on u.id = ar.user_id
     where u.auth_id = auth.uid() and u.is_active
       and ar.capability = p_cap and ar.allowed
  );
$$;
grant execute on function fn_has_admin(text) to authenticated;

-- 3. capability: manage_categories (replaces director-only from update152)
drop policy if exists wcat_insert on worker_categories;
create policy wcat_insert on worker_categories for insert to authenticated
  with check (fn_has_admin('manage_categories'));
drop policy if exists wcat_update on worker_categories;
create policy wcat_update on worker_categories for update to authenticated
  using (fn_has_admin('manage_categories'));

-- 4. capability: delete_indent (roles keep their right; capability extends it)
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

  select count(*) into po_count from purchase_orders where indent_id = p_indent_id;
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

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.tables where table_name = 'admin_rights')  as rights_table,   -- expect 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_has_admin')                         as admin_fn,       -- expect 1
  (select count(*) from pg_policies where tablename = 'worker_categories'
    and policyname in ('wcat_insert','wcat_update'))                                   as cat_policies;   -- expect 2
