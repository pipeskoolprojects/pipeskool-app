-- ============================================================
-- Pipeskool — "MARKS ATTENDANCE?" PER STAFF (update114)
-- Not every staff member punches. New per-staff toggle; OFF means:
-- no punch screen, no auto-created worker profile, never appears in
-- the Workers (labour) section. Also returns the flag through the
-- RLS-safe login lookup. RUN BEFORE DEPLOYING update114.
-- ============================================================
alter table app_users add column if not exists requires_punch boolean not null default true;

drop function if exists fn_staff_login_lookup(text);
create function fn_staff_login_lookup(p_mobile text)
returns table (id bigint, full_name text, mobile text, role text, site_id bigint,
               auth_id uuid, auth_email text, auth_version int, requires_punch boolean)
language sql security definer stable
set search_path = public
as $$
  select u.id, u.full_name, u.mobile, u.role, u.site_id, u.auth_id, u.auth_email,
         u.auth_version, u.requires_punch
  from app_users u
  where u.mobile = trim(p_mobile) and u.is_active = true
  limit 1;
$$;
revoke all on function fn_staff_login_lookup(text) from public;
grant execute on function fn_staff_login_lookup(text) to anon, authenticated;
select 'Staff punch toggle installed' as done;
