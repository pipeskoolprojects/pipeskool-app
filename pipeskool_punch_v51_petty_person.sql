-- =============================================================================
-- PIPESKOOL — update181: KISHAN-CLASS PUNCH FIX + petty cash = ONE ACCOUNT PER
--                        PERSON
-- 1. fn_worker_punch v5.1: staff punch profiles are matched to their staff
--    login by auth id OR MOBILE NUMBER (profiles enrolled without the auth
--    link were failing the staff check and getting "Not allotted"). Labour
--    rule unchanged: home site + allotted sites.
-- 2. v_petty_cash_balance v3: PERSON-WISE — one account per holder across all
--    sites (Director's rule 14 Aug). Grants/spends/returns from every site
--    net into ONE balance; the ledger keeps per-transaction site detail.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

create or replace function fn_worker_punch(p_worker_id bigint, p_lat double precision,
  p_lng double precision, p_selfie_path text, p_site_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w record; s record; ex record; r attendance;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  v_site bigint; v_dist integer; v_is_out boolean := false;
begin
  select id, site_id, is_active, full_name, auth_id, mobile into w from workers where id = p_worker_id;
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
     and not exists (select 1 from app_users au                       -- v5.1: staff punch profiles
                       join user_sites us on us.user_id = au.id       --   may punch at any site of
                      where au.is_active and us.site_id = v_site      --   their staff login, linked
                        and (au.auth_id = w.auth_id                   --   by auth OR mobile number
                             or au.mobile = w.mobile))
     and not exists (select 1 from app_users au
                      where au.is_active and au.role = 'director'
                        and (au.auth_id = w.auth_id or au.mobile = w.mobile)) then
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

-- ---------- 2. one petty account per person ----------
drop view if exists v_petty_cash_balance;
create view v_petty_cash_balance as
select
  u.id as user_id, u.full_name,
  coalesce(g.granted, 0)  as granted,
  coalesce(e.spent, 0)    as spent_from_petty,
  coalesce(r.returned, 0) as returned,
  coalesce(g.granted, 0) - coalesce(e.spent, 0) - coalesce(r.returned, 0) as balance,
  (coalesce(g.granted, 0) > 0
   and coalesce(g.granted, 0) - coalesce(e.spent, 0) - coalesce(r.returned, 0) = 0) as settled
from app_users u
left join (select user_id, sum(amount) granted from petty_cash_grants group by 1) g
  on g.user_id = u.id
left join (select claimant_user_id, sum(amount) spent
           from expenses where funding_source = 'petty_cash' and status = 'approved' group by 1) e
  on e.claimant_user_id = u.id
left join (select user_id, sum(amount) returned
           from petty_cash_returns where status = 'confirmed' group by 1) r
  on r.user_id = u.id
where coalesce(g.granted, 0) <> 0 or coalesce(e.spent, 0) <> 0 or coalesce(r.returned, 0) <> 0;

-- standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_worker_punch'
      and prosrc ilike '%au.mobile = w.mobile%')                                as punch_v5_1,      -- expect 1
  (select count(*) from information_schema.columns
    where table_name = 'v_petty_cash_balance' and column_name = 'site_id')      as view_site_cols,  -- expect 0 (person-wise)
  (select count(*) from v_petty_cash_balance
    where full_name ilike '%SATYENDRA RAI%')                                    as satyendra_rows,  -- expect 1
  (select count(*) from pg_tables
    where schemaname = 'public' and rowsecurity = false)                        as unlocked_tables_left; -- expect 0
