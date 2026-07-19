-- ============================================================
-- Pipeskool — RLS-SAFE STAFF LOGIN LOOKUP
-- Fixes the flaw found on 19 Jul: with RLS enabled, the login screen's
-- pre-authentication staff lookup was blocked, locking EVERYONE out.
-- This adds one narrow SECURITY DEFINER function that answers only
-- "give me the login fields for this exact mobile number" — the staff
-- table itself stays fully locked. Safe to run before or after RLS enable.
-- RUN ONCE in Supabase SQL Editor, together with deploying update95.
-- ============================================================
-- prerequisite from update74 (harmless if already present)
alter table app_users add column if not exists auth_version int not null default 1;

create or replace function fn_staff_login_lookup(p_mobile text)
returns table (id bigint, full_name text, mobile text, role text, site_id bigint,
               auth_id uuid, auth_email text, auth_version int)
language sql security definer stable
set search_path = public
as $$
  select u.id, u.full_name, u.mobile, u.role, u.site_id, u.auth_id, u.auth_email, u.auth_version
  from app_users u
  where u.mobile = trim(p_mobile) and u.is_active = true
  limit 1;
$$;

revoke all on function fn_staff_login_lookup(text) from public;
grant execute on function fn_staff_login_lookup(text) to anon, authenticated;
select 'RLS-safe staff login lookup installed' as done;
