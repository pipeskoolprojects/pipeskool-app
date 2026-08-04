-- =============================================================================
-- PIPESKOOL — update144: PUNCH GEOFENCE ENFORCED SERVER-SIDE + category enum fix
--
-- BUG 1 (attendance from anywhere): fn_worker_punch stored GPS but NEVER
--   validated it. Client-side gating existed but had two free-pass fallbacks
--   (GPS denied/unavailable, geofence not configured) and could not be trusted
--   anyway (client checks are bypassable by definition). Punches also always
--   recorded at the worker's ROSTER site even when staff switched sites.
-- FIX: fn_worker_punch v2 — the SERVER computes the distance (haversine) from
--   the punching site's configured geofence and REJECTS the punch when outside
--   the radius or when coordinates are missing while a geofence is configured.
--   Records the distance on the attendance row (audit trail), and records the
--   punch at the site actually being punched (p_site_id), validated the same way.
--   Punch-out is validated against the same site as the punch-in row.
--   NOTE: sites with NO geofence configured cannot be enforced — set
--   geofence for every site in Admin -> Site Master.
--
-- BUG 2 (invalid input value for enum worker_category: "mason"): the Add-worker
--   form offers electrician / mason / other but the database enum was never
--   extended beyond the original six values.
-- FIX: extend the enum (additive, safe).
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- BUG 2: worker_category enum ----------
alter type worker_category add value if not exists 'electrician';
alter type worker_category add value if not exists 'mason';
alter type worker_category add value if not exists 'other';

-- ---------- BUG 1: audit columns ----------
alter table attendance add column if not exists punch_in_distance_m  integer;
alter table attendance add column if not exists punch_out_distance_m integer;

-- ---------- BUG 1: geofence-enforcing punch function ----------
-- signature changes (adds p_site_id) -> drop the old one first (42P13 rule)
drop function if exists fn_worker_punch(bigint, double precision, double precision, text);

create function fn_worker_punch(p_worker_id bigint, p_lat double precision,
  p_lng double precision, p_selfie_path text, p_site_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w record; s record; ex record; r attendance;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  v_site bigint; v_dist integer;
begin
  select id, site_id, is_active into w from workers where id = p_worker_id;
  if w.id is null or not w.is_active then
    return jsonb_build_object('ok', false, 'error', 'Worker not found or inactive.');
  end if;

  select * into ex from attendance where worker_id = p_worker_id and att_date = today limit 1;

  -- punch-in site = requested site (staff site switcher) else roster site;
  -- punch-out is always validated against the site punched INTO this morning.
  if ex.id is null then v_site := coalesce(p_site_id, w.site_id);
  else                  v_site := ex.site_id;
  end if;

  select geofence_lat, geofence_lng, geofence_radius_m into s
    from sites where id = v_site;

  v_dist := null;
  if s.geofence_lat is not null and s.geofence_lng is not null then
    if p_lat is null or p_lng is null then
      return jsonb_build_object('ok', false,
        'error', 'Location required — enable GPS/location permission and try again, or ask your supervisor to mark you.');
    end if;
    v_dist := round(6371000 * acos(least(1.0,
        cos(radians(s.geofence_lat)) * cos(radians(p_lat))
          * cos(radians(p_lng) - radians(s.geofence_lng))
        + sin(radians(s.geofence_lat)) * sin(radians(p_lat)))))::integer;
    if v_dist > coalesce(s.geofence_radius_m, 200) then
      return jsonb_build_object('ok', false,
        'error', 'You are ' || v_dist || ' m from site (allowed ' ||
                 coalesce(s.geofence_radius_m, 200) || ' m). Self punch is blocked — ask your supervisor to mark you.');
    end if;
  end if;

  if ex.id is null then
    insert into attendance (worker_id, site_id, att_date, punch_in, punch_in_lat, punch_in_lng,
      punch_in_selfie_url, punch_type, punch_in_distance_m)
    values (p_worker_id, v_site, today, now(), p_lat, p_lng, p_selfie_path, 'self', v_dist)
    returning * into r;
    return jsonb_build_object('ok', true, 'data', to_jsonb(r));
  elsif ex.punch_out is null then
    update attendance set punch_out = now(), punch_out_lat = p_lat, punch_out_lng = p_lng,
      punch_out_selfie_url = p_selfie_path, punch_out_distance_m = v_dist
    where id = ex.id returning * into r;
    return jsonb_build_object('ok', true, 'data', to_jsonb(r));
  else
    return jsonb_build_object('ok', false, 'error', 'Already punched out today.');
  end if;
end $$;

grant execute on function fn_worker_punch(bigint, double precision, double precision, text, bigint)
  to anon, authenticated;

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'worker_category')                                        as category_values,   -- expect 9
  (select count(*) from information_schema.columns
    where table_name = 'attendance' and column_name in
      ('punch_in_distance_m','punch_out_distance_m'))                           as distance_columns,   -- expect 2
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_worker_punch'
      and p.pronargs = 5)                                                       as punch_fn_v2;        -- expect 1
