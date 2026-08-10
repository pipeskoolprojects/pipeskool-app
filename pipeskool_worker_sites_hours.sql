-- =============================================================================
-- PIPESKOOL — update168: WORKER SITE ALLOTMENT + HOURS = ACTUAL TIME AT SITE
--
-- 1. worker_sites: a worker can be allotted MULTIPLE sites (rotating crews).
--    Primary site stays on the worker (home site); extra allotments here.
--    Self-punch is accepted only at an allotted site — validated in the
--    punch function, not the screen.
-- 2. Director's policy (10 Aug): hours = actual time at site. NO lunch/break
--    deduction, ever. fn_calc_attendance v3 removes the deduction, and all
--    August punches are recomputed so the parallel-run month is consistent.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. multi-site allotment ----------
create table if not exists worker_sites (
  worker_id bigint not null references workers(id) on delete cascade,
  site_id   bigint not null references sites(id) on delete cascade,
  primary key (worker_id, site_id)
);
alter table worker_sites enable row level security;
drop policy if exists ws_select on worker_sites;
create policy ws_select on worker_sites for select to authenticated using (true);
drop policy if exists ws_insert on worker_sites;
create policy ws_insert on worker_sites for insert to authenticated
  with check (fn_has_perm('workers','create') or fn_has_perm('workers','manage'));
drop policy if exists ws_delete on worker_sites;
create policy ws_delete on worker_sites for delete to authenticated
  using (fn_has_perm('workers','create') or fn_has_perm('workers','manage'));

-- ---------- 2. hours: actual time at site (no deduction) ----------
create or replace function fn_calc_attendance()
returns trigger language plpgsql as $$
declare
  s sites%rowtype;
  worked numeric;
begin
  select * into s from sites where id = new.site_id;
  if new.punch_in is not null and new.punch_out is not null then
    worked := extract(epoch from (new.punch_out - new.punch_in)) / 3600.0;
    if worked < 0 then worked := 0; end if;
    -- update168: NO break deduction — hours are the actual span at site
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

-- recompute August (parallel-run month) under the new rule
update attendance set punch_out = punch_out
 where att_date >= date '2026-08-01'
   and punch_in is not null and punch_out is not null;

-- ---------- 3. punch v4: only at an allotted site ----------
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
  if v_site <> w.site_id and not exists
     (select 1 from worker_sites ws where ws.worker_id = w.id and ws.site_id = v_site) then
    return jsonb_build_object('ok', false,
      'error', 'This worker is not allotted to this site — ask the supervisor to allot the site in Workers Master.');
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

-- ---------- standard: reload the API schema cache ----------
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.tables where table_name = 'worker_sites')  as allot_table,   -- expect 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_calc_attendance'
      and prosrc not ilike '%lunch%')                                                 as hours_fn_v3,   -- expect 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_worker_punch' and p.pronargs = 5)  as punch_fn_v4,   -- expect 1
  (select count(*) from attendance
    where att_date >= date '2026-08-01' and punch_out is not null)                    as august_recomputed;
