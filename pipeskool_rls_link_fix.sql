-- ============================================================
-- Pipeskool — RLS-SAFE FIRST-LOGIN LINK (run once, now)
-- Completes the lock-safe login set: when a staff member creates
-- their password for the FIRST time, the new account must be linked
-- to their staff row — but the lock doesn't recognise them as staff
-- until the link exists. This narrow function performs only that
-- link: exact mobile match, only if not already linked.
-- ============================================================
create or replace function fn_link_staff_auth(p_mobile text, p_auth uuid, p_email text)
returns boolean language sql security definer volatile
set search_path = public
as $$
  update app_users set auth_id = p_auth, auth_email = p_email
  where mobile = trim(p_mobile) and is_active = true and auth_id is null
  returning true;
$$;
revoke all on function fn_link_staff_auth(text, uuid, text) from public;
grant execute on function fn_link_staff_auth(text, uuid, text) to authenticated;
select 'First-login link installed' as done;
