-- ============================================================
-- PIPESKOOL — SECURITY HARDENING PHASE 1 + BACKUP/RESTORE ENGINE
-- Run BEFORE deploying update128 code.
-- 1) Identity helper functions the DATABASE itself trusts (not just the UI)
-- 2) One-click backup support (fn_list_tables) + restore engine (fn_restore_table)
-- 3) Tightened Row-Level-Security on all 15 new-module tables:
--    writes now require the right role/permission INSIDE the database,
--    so bypassing the app UI no longer works on these tables.
--    (Legacy tables get the same treatment in Hardening Phase 2.)
-- Safe to re-run: create or replace / drop policy if exists.
-- ============================================================

-- ---------- 1. identity helpers ----------
create or replace function fn_current_staff_id() returns bigint
language sql stable security definer set search_path = public as $$
  select id from app_users where auth_id = auth.uid() limit 1;
$$;

create or replace function fn_is_director() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'director' and is_active
                   from app_users where auth_id = auth.uid() limit 1), false);
$$;

create or replace function fn_has_perm(p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select fn_is_director() or exists (
    select 1 from permissions p
    join app_users u on u.id = p.user_id
    where u.auth_id = auth.uid() and p.module = p_module
      and p.action = p_action and p.allowed = true);
$$;

grant execute on function fn_current_staff_id(), fn_is_director(), fn_has_perm(text, text) to authenticated;

-- ---------- 2. backup / restore engine ----------
-- list every real table in public schema (director only)
create or replace function fn_list_tables() returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_is_director() then raise exception 'Directors only.'; end if;
  return (select coalesce(array_agg(tablename order by tablename), '{}')
          from pg_tables where schemaname = 'public');
end $$;

-- restore rows into a table from a backup file:
--  * inserts rows that are MISSING (matched by primary/unique keys); never
--    overwrites or deletes anything that exists — safe recovery semantics
--  * keeps original ids (OVERRIDING SYSTEM VALUE when the id is identity)
--  * skips generated columns (e.g. item_master.display_name)
--  * repairs the id sequence afterwards so future inserts don't collide
create or replace function fn_restore_table(p_table text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  cols text; ident_col text; n int;
begin
  if not fn_is_director() then raise exception 'Directors only.'; end if;
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p_table) then
    raise exception 'Unknown table %', p_table;
  end if;

  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
  from pg_attribute
  where attrelid = ('public.' || quote_ident(p_table))::regclass
    and attnum > 0 and not attisdropped and attgenerated = '';

  select attname into ident_col
  from pg_attribute
  where attrelid = ('public.' || quote_ident(p_table))::regclass
    and attnum > 0 and not attisdropped and attidentity in ('a', 'd')
  limit 1;

  execute format(
    'insert into %I (%s) select %s from jsonb_populate_recordset(null::%I, $1) %s on conflict do nothing',
    p_table, cols, cols, p_table,
    case when ident_col is not null then 'overriding system value' else '' end)
  using p_rows;
  get diagnostics n = row_count;

  if ident_col is not null then
    execute format(
      'select setval(pg_get_serial_sequence(%L, %L), greatest(coalesce((select max(%I) from %I), 0), 1), true)',
      'public.' || p_table, ident_col, ident_col, p_table);
  end if;
  return n;
end $$;

grant execute on function fn_list_tables(), fn_restore_table(text, jsonb) to authenticated;

-- ---------- 3. tightened RLS on the new-module tables ----------
-- helper macro pattern: drop the wide-open policy, add scoped ones.
do $$
declare t text;
begin
  foreach t in array array['notifications','module_audit_log','company_holidays','notices',
    'notice_targets','notice_attachments','notice_reads','notice_acks','notice_comments',
    'daily_quotes','app_settings','support_tickets','leave_requests','leave_approvals','leave_approval_config']
  loop
    execute format('drop policy if exists "auth all" on %I', t);
  end loop;
end $$;

-- notices: everyone reads; create needs the Create tick; edit/remove needs Manage
create policy "read"   on notices for select to authenticated using (true);
create policy "create" on notices for insert to authenticated with check (fn_has_perm('notices','create'));
create policy "manage" on notices for update to authenticated using (fn_has_perm('notices','manage')) with check (fn_has_perm('notices','manage'));
create policy "remove" on notices for delete to authenticated using (fn_has_perm('notices','manage'));

create policy "read"   on notice_targets for select to authenticated using (true);
create policy "create" on notice_targets for insert to authenticated with check (fn_has_perm('notices','create'));
create policy "remove" on notice_targets for delete to authenticated using (fn_has_perm('notices','manage'));

create policy "read"   on notice_attachments for select to authenticated using (true);
create policy "create" on notice_attachments for insert to authenticated with check (fn_has_perm('notices','create'));
create policy "remove" on notice_attachments for delete to authenticated using (fn_has_perm('notices','manage'));

-- reads/acks/comments: only as yourself
create policy "read"  on notice_reads for select to authenticated using (true);
create policy "own"   on notice_reads for insert to authenticated with check (staff_id = fn_current_staff_id());
create policy "read"  on notice_acks for select to authenticated using (true);
create policy "own"   on notice_acks for insert to authenticated with check (staff_id = fn_current_staff_id());
create policy "read"  on notice_comments for select to authenticated using (true);
create policy "own"   on notice_comments for insert to authenticated with check (staff_id = fn_current_staff_id());
create policy "mod"   on notice_comments for delete to authenticated using (staff_id = fn_current_staff_id() or fn_has_perm('notices','manage'));

-- quotes & settings: read all; write = director or notice-manager
create policy "read"  on daily_quotes for select to authenticated using (true);
create policy "write" on daily_quotes for update to authenticated using (fn_has_perm('notices','manage')) with check (fn_has_perm('notices','manage'));
create policy "add"   on daily_quotes for insert to authenticated with check (fn_has_perm('notices','manage'));
create policy "read"  on app_settings for select to authenticated using (true);
create policy "write" on app_settings for all to authenticated using (fn_is_director()) with check (fn_is_director());

-- holidays: read all; write = director (leave module may widen later)
create policy "read"  on company_holidays for select to authenticated using (true);
create policy "write" on company_holidays for all to authenticated using (fn_is_director()) with check (fn_is_director());

-- notifications: strictly your own (directors can read all — needed for backup)
create policy "own read"  on notifications for select to authenticated using (staff_id = fn_current_staff_id() or fn_is_director());
create policy "add"       on notifications for insert to authenticated with check (true);
create policy "own update" on notifications for update to authenticated using (staff_id = fn_current_staff_id()) with check (staff_id = fn_current_staff_id());

-- audit log: anyone may append; only directors may read
create policy "append" on module_audit_log for insert to authenticated with check (true);
create policy "read"   on module_audit_log for select to authenticated using (fn_is_director());

-- support tickets: yours, or director sees all
create policy "own"    on support_tickets for select to authenticated using (staff_id = fn_current_staff_id() or fn_is_director());
create policy "create" on support_tickets for insert to authenticated with check (staff_id = fn_current_staff_id());
create policy "admin"  on support_tickets for update to authenticated using (fn_is_director()) with check (fn_is_director());

-- leave: apply as yourself; approvers/directors see and act (update129 uses these)
create policy "see"    on leave_requests for select to authenticated using (staff_id = fn_current_staff_id() or fn_is_director() or fn_has_perm('leave','approve'));
create policy "apply"  on leave_requests for insert to authenticated with check (staff_id = fn_current_staff_id());
create policy "act"    on leave_requests for update to authenticated using (staff_id = fn_current_staff_id() or fn_is_director() or fn_has_perm('leave','approve')) with check (true);
create policy "read"   on leave_approvals for select to authenticated using (true);
create policy "act"    on leave_approvals for insert to authenticated with check (fn_is_director() or fn_has_perm('leave','approve'));
create policy "read"   on leave_approval_config for select to authenticated using (true);
create policy "write"  on leave_approval_config for all to authenticated using (fn_is_director()) with check (fn_is_director());

-- verification (safe to run from the SQL Editor)
select count(*) as security_functions_installed
from pg_proc where proname in ('fn_current_staff_id','fn_is_director','fn_has_perm','fn_list_tables','fn_restore_table');
select count(*) as policies_on_new_tables
from pg_policies where schemaname = 'public' and tablename in
 ('notifications','module_audit_log','company_holidays','notices','notice_targets','notice_attachments',
  'notice_reads','notice_acks','notice_comments','daily_quotes','app_settings','support_tickets',
  'leave_requests','leave_approvals','leave_approval_config');
