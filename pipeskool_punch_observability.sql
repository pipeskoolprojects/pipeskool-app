-- =============================================================================
-- PIPESKOOL — update180: PUNCH RELIABILITY — staff site-switch fix + every
--                        rejected punch is now RECORDED and VISIBLE
-- Root cause of "sites/workers disappearing": since update168, STAFF punching
-- at a switched (non-home) site was rejected by the allotment check (staff
-- punch profiles have no worker_sites rows), and rejections left NO TRACE.
-- 1. fn_worker_punch v5: staff punch profiles may punch at any site assigned
--    to their staff login (Directors anywhere); labour rule unchanged
--    (home site + allotted sites).
-- 2. punch_failures: EVERY rejection (geofence / allotment / no GPS / inactive)
--    is logged with worker, site, reason, distance, time — and shown on the
--    Attendance register + Dashboard. Silent field failures are over.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

create table if not exists punch_failures (
  id bigserial primary key,
  worker_id   bigint,
  worker_name text,
  site_id     bigint references sites(id),
  reason      text not null,
  distance_m  integer,
  at          timestamptz not null default now()
);
create index if not exists idx_punch_failures_at on punch_failures (at);
alter table punch_failures enable row level security;
drop policy if exists pf_select on punch_failures;
create policy pf_select on punch_failures for select to authenticated using (true);
-- inserts happen only inside the SECURITY DEFINER logger below

create or replace function fn_log_punch_failure(p_worker_id bigint, p_name text,
  p_site_id bigint, p_reason text, p_dist integer)
returns void language sql security definer set search_path = public as $$
  insert into punch_failures (worker_id, worker_name, site_id, reason, distance_m)
  values (p_worker_id, p_name, p_site_id, p_reason, p_dist);
$$;

create or replace function fn_worker_punch(p_worker_id bigint, p_lat double precision,
  p_lng double precision, p_selfie_path text, p_site_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w record; s record; ex record; r attendance;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  v_site bigint; v_dist integer; v_is_out boolean := false;
begin
  select id, site_id, is_active, full_name, auth_id into w from workers where id = p_worker_id;
  if w.id is null or not w.is_active then
    perform fn_log_punch_failure(p_worker_id, null, p_site_id, 'Worker not found or inactive', null);
    return jsonb_build_object('ok', false, 'error', 'Worker not found or inactive.');
  end if;

  select * into ex from attendance where worker_id = p_worker_id and att_date = today limit 1;
  if ex.id is null then
    select * into ex from attendance
      where worker_id = p_worker_id and att_date = today - 1
        and punch_in is not null and punch_out is null
      limit 1;
    if ex.id is not null then v_is_out := true; end if;
  elsif ex.punch_out is null then
    v_is_out := true;
  else
    return jsonb_build_object('ok', false, 'error', 'Already punched out today.');
  end if;

  v_site := coalesce(p_site_id, w.site_id);

  -- update168: the punch site must be the worker's home site or an allotted site
  if v_site <> w.site_id
     and not exists (select 1 from worker_sites ws where ws.worker_id = w.id and ws.site_id = v_site)
     and not exists (select 1 from app_users au                       -- v5: staff punch profiles
                       join user_sites us on us.user_id = au.id       --     may punch at any site
                      where au.auth_id = w.auth_id and au.is_active   --     assigned to their login
                        and us.site_id = v_site)
     and not exists (select 1 from app_users au where au.auth_id = w.auth_id
                        and au.is_active and au.role = 'director') then
    perform fn_log_punch_failure(w.id, w.full_name, v_site, 'Not allotted to this site', null);
    return jsonb_build_object('ok', false,
      'error', 'Not allotted to this site — ask the supervisor to allot it in Workers Master.');
  end if;

  select geofence_lat, geofence_lng, geofence_radius_m into s
    from sites where id = v_site;

  v_dist := null;
  if s.geofence_lat is not null and s.geofence_lng is not null then
    if p_lat is null or p_lng is null then
      perform fn_log_punch_failure(w.id, w.full_name, v_site, 'No GPS location', null);
      return jsonb_build_object('ok', false,
        'error', 'Location required — enable GPS/location permission and try again, or ask your supervisor to mark you.');
    end if;
    v_dist := round(6371000 * acos(least(1.0,
        cos(radians(s.geofence_lat)) * cos(radians(p_lat))
          * cos(radians(p_lng) - radians(s.geofence_lng))
        + sin(radians(s.geofence_lat)) * sin(radians(p_lat)))))::integer;
    if v_dist > coalesce(s.geofence_radius_m, 200) then
      perform fn_log_punch_failure(w.id, w.full_name, v_site, 'Outside geofence', v_dist);
      return jsonb_build_object('ok', false,
        'error', 'You are ' || v_dist || ' m from site (allowed ' ||
                 coalesce(s.geofence_radius_m, 200) || ' m). Self punch is blocked — ask your supervisor to mark you.');
    end if;
  end if;

  if not v_is_out then
    insert into attendance (worker_id, site_id, att_date, punch_in, punch_in_lat, punch_in_lng,
      punch_in_selfie_url, punch_type, punch_in_distance_m)
    values (p_worker_id, v_site, today, now(), p_lat, p_lng, p_selfie_path, 'self', v_dist)
    returning * into r;
    return jsonb_build_object('ok', true, 'data', to_jsonb(r));
  else
    update attendance set punch_out = now(), punch_out_lat = p_lat, punch_out_lng = p_lng,
      punch_out_selfie_url = p_selfie_path, punch_out_distance_m = v_dist,
      punch_out_site_id = v_site
    where id = ex.id returning * into r;
    return jsonb_build_object('ok', true, 'data', to_jsonb(r));
  end if;
end $$;

grant execute on function fn_worker_punch(bigint, double precision, double precision, text, bigint)
  to anon, authenticated;

-- standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.tables
    where table_name = 'punch_failures')                                        as failures_table,  -- expect 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_worker_punch'
      and prosrc ilike '%fn_log_punch_failure%')                                as punch_v5,        -- expect 1
  (select count(*) from pg_tables
    where schemaname = 'public' and rowsecurity = false)                        as unlocked_tables_left; -- expect 0
