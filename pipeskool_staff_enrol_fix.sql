-- =============================================================================
-- PIPESKOOL — update136: staff punch self-enrol fix
-- Problem: first-time staff punch auto-creates their worker row by direct
--          INSERT into workers. Hardening P2 RLS requires workers.create for
--          that — staff with View-only rights (e.g. Sanjan) get
--          "new row violates row-level security policy for table workers".
-- Fix: narrow SECURITY DEFINER RPC (same pattern as fn_worker_punch) that
--          creates/reactivates the logged-in staff member's OWN punch profile
--          server-side. Granted to authenticated only (staff are logged in).
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- guard: return-type changes need a drop first (42P13 lesson)
drop function if exists fn_staff_enrol_punch(bigint);

create function fn_staff_enrol_punch(p_site_id bigint default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u record;
  w record;
  sid bigint;
begin
  -- who is calling — must be an active, linked staff login
  select id, full_name, mobile, role, requires_punch
    into u
    from app_users
   where auth_id = auth.uid() and is_active = true
   limit 1;

  if u.id is null then
    return jsonb_build_object('ok', false,
      'error', 'No active staff record linked to this login — re-login or ask the Director.');
  end if;
  if u.role = 'director' then
    return jsonb_build_object('ok', false, 'error', 'Directors do not punch.');
  end if;
  if coalesce(u.requires_punch, true) = false then
    return jsonb_build_object('ok', false, 'error', 'Punching is turned off for you.');
  end if;
  if u.mobile is null or length(trim(u.mobile)) = 0 then
    return jsonb_build_object('ok', false,
      'error', 'Your staff record has no mobile — ask the Director to check Workers & Staff Master.');
  end if;

  -- reuse any existing worker row on this number (active or not)
  select id, is_active into w
    from workers
   where mobile = trim(u.mobile)
   order by is_active desc
   limit 1;

  if w.id is not null then
    if not w.is_active then
      update workers set is_active = true where id = w.id;
    end if;
    return jsonb_build_object('ok', true, 'worker_id', w.id, 'reused', true);
  end if;

  -- site: requested site if it is one of THEIR assigned sites, else first assigned
  sid := null;
  if p_site_id is not null then
    select us.site_id into sid
      from user_sites us
     where us.user_id = u.id and us.site_id = p_site_id
     limit 1;
  end if;
  if sid is null then
    select us.site_id into sid
      from user_sites us
     where us.user_id = u.id
     order by us.site_id
     limit 1;
  end if;
  if sid is null then
    return jsonb_build_object('ok', false,
      'error', 'You are not assigned to any site — ask the Director to assign one in Access Rights.');
  end if;

  insert into workers (full_name, mobile, category, labour_type, daily_wage, site_id, is_active)
  values (u.full_name, trim(u.mobile), 'supervisor', 'own', 0, sid, true)
  returning id into w;

  return jsonb_build_object('ok', true, 'worker_id', w.id, 'reused', false);
exception when unique_violation then
  -- raced with another enrol on same mobile — row exists, that is fine
  return jsonb_build_object('ok', true, 'reused', true);
end $$;

-- staff only — NOT anon (workers use fn_worker_lookup/_punch; this is for logged-in staff)
grant execute on function fn_staff_enrol_punch(bigint) to authenticated;
revoke execute on function fn_staff_enrol_punch(bigint) from anon;

-- ---------- verification (SQL-Editor safe) ----------
select count(*) as fn_staff_enrol_punch_installed
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'fn_staff_enrol_punch';
-- expect: 1
