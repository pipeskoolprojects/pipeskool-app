-- ============================================================
-- Pipeskool — DIRECTOR SELF-UNLOCK (break-glass)
-- Use when the DIRECTOR forgets their own password. The normal
-- "Forgot password?" flow needs the Director's approval in the app,
-- which the Director can't give while locked out — this script does
-- that approval directly in the database instead.
--
-- HOW TO USE:
--   1) Below, replace 99XXXXXXXX with the Director's registered mobile.
--   2) Run in Supabase SQL Editor (Dashboard → SQL Editor → Run).
--   3) Open the app login page, enter that mobile, tap Next —
--      you'll be asked to CREATE a new password (like first login).
--
-- Only touches the one Director row. Safe to re-run.
-- ============================================================
do $$
declare
  v_mobile text := '99XXXXXXXX';   -- << PUT THE DIRECTOR'S MOBILE NUMBER HERE
  v_id bigint;
begin
  select id into v_id from app_users
   where mobile = trim(v_mobile) and role = 'director' and is_active = true
   limit 1;
  if v_id is null then
    raise exception 'No active Director found with mobile "%" — check the number at the top of this script.', v_mobile;
  end if;

  -- Same effect as the Director pressing "Approve reset" for themselves:
  -- old password stops working; next login asks to create a new one.
  update app_users
     set auth_id = null, auth_email = null,
         auth_version = coalesce(auth_version, 1) + 1
   where id = v_id;

  -- Close out any pending reset request they filed from the login screen.
  if to_regclass('public.password_reset_requests') is not null then
    update password_reset_requests
       set status = 'approved', decided_at = now(), decided_by = v_id
     where user_id = v_id and status = 'pending';
  end if;
end $$;

select 'Director unlocked — open the login page, enter the mobile, and create a new password.' as done;
