-- ============================================================
-- Pipeskool — staff-initiated password reset requests
-- Staff tap "Forgot password? Request a reset" on the login screen ->
-- a pending request lands here. The Director sees it in
-- Workers & Staff -> Staff and Approves (their old password stops
-- working; they create a fresh one on next login) or Declines.
-- RUN ONCE in Supabase SQL Editor before deploying this update.
-- Safe to re-run.
-- ============================================================

create table if not exists password_reset_requests (
  id bigint generated always as identity primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by bigint references app_users(id)
);
create index if not exists idx_prr_pending on password_reset_requests(user_id) where status = 'pending';

-- Same helper the RLS-enable script installs (create or replace = safe either way)
create or replace function fn_is_staff() returns boolean
language sql stable security definer as $$
  select exists (select 1 from app_users where auth_id = auth.uid() and is_active);
$$;

alter table password_reset_requests enable row level security;
drop policy if exists staff_all on password_reset_requests;
create policy staff_all on password_reset_requests
  for all to authenticated using (fn_is_staff()) with check (fn_is_staff());

-- Narrow SECURITY DEFINER entry point for the login screen (caller is anonymous):
-- validates the mobile, allows at most ONE pending request per staff member,
-- and never exposes the staff table itself.
create or replace function fn_request_password_reset(p_mobile text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint; v_auth uuid;
begin
  select id, auth_id into v_id, v_auth
    from app_users where mobile = trim(p_mobile) and is_active = true limit 1;
  if v_id is null then return 'not_found'; end if;
  if v_auth is null then return 'no_password'; end if;   -- already reset / first login pending
  if exists (select 1 from password_reset_requests where user_id = v_id and status = 'pending') then
    return 'already_pending';
  end if;
  insert into password_reset_requests (user_id) values (v_id);
  return 'ok';
end;
$$;

revoke all on function fn_request_password_reset(text) from public;
grant execute on function fn_request_password_reset(text) to anon, authenticated;

select 'Password reset requests installed' as done;
