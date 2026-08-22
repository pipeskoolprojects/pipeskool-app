-- =============================================================================
-- PIPESKOOL — update202: PUSH NOTIFICATION SUBSCRIPTIONS
-- Stores each device's web-push subscription (per staff login). Pushes themselves
-- are sent by the /api/push server route using the VAPID keys in Vercel env vars.
-- In-app bell/notifications table unchanged. Run as ONE transaction. Backup first.
-- =============================================================================
create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  staff_id bigint not null references app_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_staff on push_subscriptions(staff_id);
alter table push_subscriptions enable row level security;
drop policy if exists push_own_sel on push_subscriptions;
drop policy if exists push_own_ins on push_subscriptions;
drop policy if exists push_own_del on push_subscriptions;
create policy push_own_sel on push_subscriptions for select using (staff_id = fn_current_staff_id());
create policy push_own_ins on push_subscriptions for insert with check (staff_id = fn_current_staff_id());
create policy push_own_del on push_subscriptions for delete using (staff_id = fn_current_staff_id());

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.tables where table_name='push_subscriptions')  as push_table,          -- 1
  (select count(*) from pg_policies where tablename='push_subscriptions')                  as push_policies,       -- 3
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)         as unlocked_tables_left; -- 0
