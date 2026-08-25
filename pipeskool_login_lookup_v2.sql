-- =============================================================================
-- PIPESKOOL — update225: login lookup v2 — tolerant mobile matching.
-- ROOT CAUSE of "Mobile number not registered as staff" for valid users
-- (including the Director): the lookup compared the typed number to the stored
-- one EXACTLY, so any stored formatting (+91 prefix, spaces, leading 0) made a
-- real account invisible. v2 compares the LAST 10 DIGITS of both sides.
-- No data changed; same columns returned; passwords/roles untouched. Run ONCE.
-- =============================================================================
create or replace function fn_staff_login_lookup(p_mobile text)
returns table (id bigint, full_name text, mobile text, role text, site_id bigint,
               auth_id uuid, auth_email text, auth_version int)
language sql stable security definer set search_path = public as $$
  select u.id, u.full_name, u.mobile, u.role, u.site_id, u.auth_id, u.auth_email, u.auth_version
  from app_users u
  where right(regexp_replace(u.mobile, '\D', '', 'g'), 10)
      = right(regexp_replace(coalesce(trim(p_mobile), ''), '\D', '', 'g'), 10)
    and length(regexp_replace(coalesce(trim(p_mobile), ''), '\D', '', 'g')) >= 10
    and u.is_active = true
  limit 1;
$$;
grant execute on function fn_staff_login_lookup(text) to anon, authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from pg_proc where proname = 'fn_staff_login_lookup')            as fn_ok,                -- 1
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)  as unlocked_tables_left; -- 0
