-- =============================================================================
-- PIPESKOOL — update157: ROLE-BASED NOTIFICATION ENGINE
-- One engine for every request module (advance, expense, indent, leave, ticket,
-- notices — and any future kind with zero schema change):
--   * notification_routes: Director decides WHO receives WHICH request kind.
--   * fn_notify_request: fan-out to routed users only, and only those assigned
--     to the request's site (Directors exempt from site filter).
--   * fn_notify_user / fn_notify_users: decision -> ONLY the original requester.
--   * notifications gains site_id / status / request_id; reads locked to OWN
--     rows (nobody can see anyone else's notifications, even via the API).
--   * Realtime enabled on the table for instant in-app delivery.
-- Existing approval logic is untouched — notifications are fired AFTER the
-- existing actions succeed.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- 1. richer notification rows
alter table notifications add column if not exists site_id    bigint references sites(id);
alter table notifications add column if not exists status     text;
alter table notifications add column if not exists request_id bigint;

-- 2. who receives what (Director-managed)
create table if not exists notification_routes (
  request_kind text   not null,
  user_id      bigint not null references app_users(id) on delete cascade,
  allowed      boolean not null default true,
  primary key (request_kind, user_id)
);
alter table notification_routes enable row level security;
drop policy if exists nr_select on notification_routes;
create policy nr_select on notification_routes for select to authenticated using (true);
drop policy if exists nr_insert on notification_routes;
create policy nr_insert on notification_routes for insert to authenticated with check (fn_is_director());
drop policy if exists nr_update on notification_routes;
create policy nr_update on notification_routes for update to authenticated using (fn_is_director());
drop policy if exists nr_delete on notification_routes;
create policy nr_delete on notification_routes for delete to authenticated using (fn_is_director());

-- seed: every current Director receives every request kind (editable later)
insert into notification_routes (request_kind, user_id)
select k.kind, u.id
  from (values ('advance'),('expense'),('indent'),('leave'),('ticket')) as k(kind)
  cross join app_users u
 where u.role = 'director' and u.is_active = true
on conflict do nothing;

-- 3. fan-out to routed + site-relevant users (SECURITY DEFINER: a supervisor's
--    session must be able to create rows for the receivers)
create or replace function fn_notify_request(p_kind text, p_request_id bigint,
  p_site_id bigint, p_title text, p_body text, p_link text)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notifications (staff_id, kind, title, body, link, site_id, status, request_id)
  select u.id, p_kind, p_title, p_body, p_link, p_site_id, 'pending', p_request_id
    from notification_routes r
    join app_users u on u.id = r.user_id and u.is_active
   where r.request_kind = p_kind and r.allowed
     and (u.role = 'director' or p_site_id is null
          or exists (select 1 from user_sites us where us.user_id = u.id and us.site_id = p_site_id));
  get diagnostics n = row_count;
  return n;
end $$;

-- 4. decision -> the one requester only
create or replace function fn_notify_user(p_user_id bigint, p_kind text, p_request_id bigint,
  p_site_id bigint, p_title text, p_body text, p_link text, p_status text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (staff_id, kind, title, body, link, site_id, status, request_id)
  values (p_user_id, p_kind, p_title, p_body, p_link, p_site_id, p_status, p_request_id);
$$;

-- bulk (leave approver chains, ticket admins, notice audiences)
create or replace function fn_notify_users(p_user_ids bigint[], p_kind text, p_request_id bigint,
  p_site_id bigint, p_title text, p_body text, p_link text, p_status text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (staff_id, kind, title, body, link, site_id, status, request_id)
  select unnest(p_user_ids), p_kind, p_title, p_body, p_link, p_site_id, p_status, p_request_id;
$$;

grant execute on function fn_notify_request(text,bigint,bigint,text,text,text),
  fn_notify_user(bigint,text,bigint,bigint,text,text,text,text),
  fn_notify_users(bigint[],text,bigint,bigint,text,text,text,text) to authenticated;

-- 5. lock reads to OWN rows (requirement: unauthorized users never see them)
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='notifications' loop
    execute format('drop policy %I on notifications', pol.policyname);
  end loop;
end $$;
create policy notif_select on notifications for select to authenticated
  using (staff_id = fn_current_staff_id());
create policy notif_insert on notifications for insert to authenticated with check (true);
create policy notif_update on notifications for update to authenticated
  using (staff_id = fn_current_staff_id());

-- 6. realtime for instant in-app delivery
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null; end $$;

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.columns where table_name='notifications'
     and column_name in ('site_id','status','request_id'))                          as notif_columns,  -- expect 3
  (select count(*) from information_schema.tables where table_name='notification_routes') as routes_table, -- expect 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('fn_notify_request','fn_notify_user','fn_notify_users')) as notify_fns, -- expect 3
  (select count(*) from pg_policies where tablename='notifications')                as notif_policies; -- expect 3
