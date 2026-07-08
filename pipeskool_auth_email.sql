-- ============================================================
-- Pipeskool — FIX: login account no longer breaks when a staff
-- mobile number is edited. The account is now tied to the permanent
-- staff ID (stored in auth_email), not the mobile number.
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING update66. Safe to re-run.
-- ============================================================
alter table app_users add column if not exists auth_email text;

-- ONE-TIME REPAIR for accounts already broken by a mobile change
-- (e.g. Keyal: password was created under the old test number).
-- This clears the broken link so the person simply CREATES THEIR
-- PASSWORD AGAIN on next login — 30 seconds, nothing else lost.
update app_users set auth_id = null, auth_email = null
where mobile = '9898159970';
