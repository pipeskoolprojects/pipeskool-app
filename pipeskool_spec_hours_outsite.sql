-- =============================================================================
-- PIPESKOOL — update145: Specification field + hours-calculation fix +
--                        punch-out at a different site + cross-midnight punch-out
--
-- 1. SPEC: material_indent_items.spec + po_items.spec (additive) — flows
--    indent -> enquiry -> PO -> PDF/Excel.
-- 2. HOURS FIX: fn_calc_attendance deducted the site's lunch break from EVERY
--    punch, even a 10-minute one (short spans went negative -> 0, wrong hours).
--    Lunch is now deducted only when the raw worked span is at least the site's
--    half-day minimum hours (short punches obviously contain no lunch).
--    Cross-midnight spans are inherently correct (timestamptz difference).
-- 3. MULTI-SITE SUPERVISOR: attendance.punch_out_site_id — punch-out may
--    legitimately happen at a DIFFERENT site than punch-in. The punch-out is
--    validated against the geofence of the site the person is at NOW, and both
--    sites are stored.
-- 4. CROSS-MIDNIGHT: a punch-out just after midnight now closes yesterday's
--    open punch instead of accidentally opening a new day's punch-in.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. spec columns ----------
alter table material_indent_items add column if not exists spec text;
alter table po_items              add column if not exists spec text;

-- ---------- 3. punch-out site ----------
alter table attendance add column if not exists punch_out_site_id bigint references sites(id);

-- ---------- 2. hours calculation fix ----------
create or replace function fn_calc_attendance()
returns trigger language plpgsql as $$
declare
  s sites%rowtype;
  raw numeric;
  worked numeric;
begin
  select * into s from sites where id = new.site_id;
  if new.punch_in is not null and new.punch_out is not null then
    raw := extract(epoch from (new.punch_out - new.punch_in)) / 3600.0;
    if raw < 0 then raw := 0; end if;
    -- lunch is only inside a real working day, never inside a short span (update145)
    if raw >= coalesce(s.half_day_min_hours, 4) then
      worked := raw - (coalesce(s.lunch_minutes, 0) / 60.0);
    else
      worked := raw;
    end if;
    if worked < 0 then worked := 0; end if;
    new.hours_worked := round(worked::numeric, 2);
    if worked >= s.full_day_min_hours then
      new.status := 'present';
      new.ot_hours := greatest(round((worked - s.std_working_hours)::numeric, 2), 0);
    elsif worked >= s.half_day_min_hours then
      new.status := 'half_day';
      new.ot_hours := 0;
    else
      new.status := 'absent';
      new.ot_hours := 0;
    end if;
  end if;
  return new;
end $$;

-- ---------- 3+4. punch function v3 (same signature -> safe replace) ----------
create or replace function fn_worker_punch(p_worker_id bigint, p_lat double precision,
  p_lng double precision, p_selfie_path text, p_site_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w record; s record; ex record; r attendance;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  v_site bigint; v_dist integer; v_is_out boolean := false;
begin
  select id, site_id, is_active into w from workers where id = p_worker_id;
  if w.id is null or not w.is_active then
    return jsonb_build_object('ok', false, 'error', 'Worker not found or inactive.');
  end if;

  select * into ex from attendance where worker_id = p_worker_id and att_date = today limit 1;
  if ex.id is null then
    -- cross-midnight: an open punch from yesterday is closed by this punch (update145)
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

  -- geofence is always checked against the site the person is at NOW:
  -- punch-in site = selected site (or roster site); punch-out site may differ (multi-site staff).
  v_site := coalesce(p_site_id, w.site_id);

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

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.columns where table_name = 'material_indent_items' and column_name = 'spec')
  + (select count(*) from information_schema.columns where table_name = 'po_items' and column_name = 'spec')
  + (select count(*) from information_schema.columns where table_name = 'attendance' and column_name = 'punch_out_site_id')
    as new_columns,                                                              -- expect 3
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_worker_punch' and p.pronargs = 5)
    as punch_fn,                                                                 -- expect 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_calc_attendance')
    as hours_fn;                                                                 -- expect 1
