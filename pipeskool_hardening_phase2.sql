-- ============================================================
-- PIPESKOOL — SECURITY HARDENING PHASE 2  (run BEFORE deploying update131 code)
-- ⚠ TAKE A BACKUP from Admin → Backup & Restore BEFORE running this.
-- A) Closes ALL anonymous (no-login) access to tables. Worker punch and staff
--    login keep working through narrow SECURITY DEFINER functions instead of
--    open table access. Until update131 code is deployed, worker self-punch
--    briefly uses the new functions' fallback — deploy code right after this.
-- B) Database-enforced, permission-mapped policies on every legacy table:
--    reads for logged-in staff; writes require the matching Access-Rights tick
--    (insert=Create · update=Create/Approve/Verify · delete=Manage; Director always).
--    Payroll tables readable only by the person themself or wages-View holders.
-- C) NEW module 'billing' gates BOQ / RA-bill / Tally writes — after deploying,
--    tick Billing for staff who do billing (e.g. Nisarg) in Access Rights.
-- Safe to re-run.
-- ============================================================

-- ---------- A1. staff login lookup (pre-auth) ----------
-- older versions of these functions may exist with different signatures;
-- drop first (create-or-replace cannot change a return type)
drop function if exists fn_staff_login_lookup(text);
drop function if exists fn_link_staff_auth(text, text);
drop function if exists fn_worker_lookup(text);
drop function if exists fn_worker_today(bigint);
drop function if exists fn_worker_punch(bigint, double precision, double precision, text);

create or replace function fn_staff_login_lookup(p_mobile text)
returns table (id bigint, full_name text, mobile text, role text, site_id bigint,
               auth_id uuid, auth_email text, auth_version int)
language sql stable security definer set search_path = public as $$
  select u.id, u.full_name, u.mobile, u.role, u.site_id, u.auth_id, u.auth_email, u.auth_version
  from app_users u where u.mobile = trim(p_mobile) and u.is_active = true limit 1;
$$;
grant execute on function fn_staff_login_lookup(text) to anon, authenticated;

-- first-time password: link the fresh auth account to the staff row
create or replace function fn_link_staff_auth(p_mobile text, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update app_users set auth_id = auth.uid(), auth_email = p_email
  where mobile = trim(p_mobile) and is_active = true
    and (auth_id is null or auth_id = auth.uid());
  return found;
end $$;
grant execute on function fn_link_staff_auth(text, text) to authenticated;

-- ---------- A2. worker self-punch (workers have no login by design) ----------
create or replace function fn_worker_lookup(p_mobile text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w record;
begin
  select wk.id, wk.full_name, wk.category, wk.site_id, wk.is_active, wk.profile_complete,
         s.name as site_name, s.geofence_lat, s.geofence_lng, s.geofence_radius_m
  into w from workers wk left join sites s on s.id = wk.site_id
  where wk.mobile = trim(p_mobile)
  order by wk.is_active desc limit 1;
  if w.id is null then return null; end if;
  if not w.is_active then update workers set is_active = true where id = w.id; end if;
  return jsonb_build_object('id', w.id, 'full_name', w.full_name, 'category', w.category,
    'site_id', w.site_id, 'site_name', w.site_name, 'geofence_lat', w.geofence_lat,
    'geofence_lng', w.geofence_lng, 'geofence_radius_m', coalesce(w.geofence_radius_m, 200),
    'profile_complete', w.profile_complete);
end $$;

create or replace function fn_worker_today(p_worker_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select to_jsonb(t) from (
    select id, punch_in, punch_out, hours_worked, status, ot_hours
    from attendance
    where worker_id = p_worker_id
      and att_date = (now() at time zone 'Asia/Kolkata')::date
    limit 1) t), '{}'::jsonb);
$$;

create or replace function fn_worker_punch(p_worker_id bigint, p_lat double precision,
  p_lng double precision, p_selfie_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w record; ex record; today date := (now() at time zone 'Asia/Kolkata')::date; r attendance;
begin
  select id, site_id, is_active into w from workers where id = p_worker_id;
  if w.id is null or not w.is_active then
    return jsonb_build_object('ok', false, 'error', 'Worker not found or inactive.');
  end if;
  select * into ex from attendance where worker_id = p_worker_id and att_date = today limit 1;
  if ex.id is null then
    insert into attendance (worker_id, site_id, att_date, punch_in, punch_in_lat, punch_in_lng,
      punch_in_selfie_url, punch_type)
    values (p_worker_id, w.site_id, today, now(), p_lat, p_lng, p_selfie_path, 'self')
    returning * into r;
    return jsonb_build_object('ok', true, 'data', to_jsonb(r));
  elsif ex.punch_out is null then
    update attendance set punch_out = now(), punch_out_lat = p_lat, punch_out_lng = p_lng,
      punch_out_selfie_url = p_selfie_path
    where id = ex.id returning * into r;
    return jsonb_build_object('ok', true, 'data', to_jsonb(r));
  else
    return jsonb_build_object('ok', false, 'error', 'Already punched out today.');
  end if;
end $$;
grant execute on function fn_worker_lookup(text), fn_worker_today(bigint),
  fn_worker_punch(bigint, double precision, double precision, text) to anon, authenticated;

-- ---------- B. module-mapped policies on all legacy tables ----------
do $$
declare
  -- table : module : sensitive_select ('S' = own-or-wages-view read)
  map text[][] := array[
    ['attendance','attendance',''],       ['workers','workers',''],           ['contractors','workers',''],
    ['activities','dpr',''],              ['dpr','dpr',''],                   ['dpr_hindrances','dpr',''],
    ['dpr_materials','dpr',''],           ['dpr_photos','dpr',''],            ['dpr_work_items','dpr',''],
    ['stock_txns','stock',''],            ['stock_consumption','stock',''],   ['grn_issues','stock',''],
    ['item_master','stock',''],           ['material_requests','stock',''],
    ['assets','assets',''],               ['asset_txns','assets',''],
    ['indents','indent',''],              ['indent_items','indent',''],       ['indent_quotes','indent',''],
    ['material_indents','indent',''],     ['material_indent_items','indent',''],
    ['purchase_orders','indent',''],      ['po_items','indent',''],
    ['vendors','indent',''],              ['vendor_bills','indent',''],       ['vendor_rates','indent',''],
    ['enquiries','indent',''],            ['enquiry_quotes','indent',''],
    ['expenses','money',''],              ['advances','money',''],            ['imprest_transfers','money',''],
    ['petty_cash_grants','money',''],
    ['staff_payouts','wages','S'],        ['wage_payouts','wages','S'],
    ['salary_advances','wages','S'],      ['advance_salary_requests','wages','S'],
    ['rentals','rentals',''],             ['rental_docs','rentals',''],       ['rental_machine_types','rentals',''],
    ['boq_items','billing',''],           ['ra_bills','billing',''],          ['ra_bill_lines','billing',''],
    ['ra_payment_groups','billing',''],   ['ra_settings','billing',''],       ['tally_settings','billing','']
  ];
  t text; m text; s text; pol record; i int;
begin
  for i in 1 .. array_length(map, 1) loop
    t := map[i][1]; m := map[i][2]; s := map[i][3];
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      continue;   -- table not present in this database — skip
    end if;
    execute format('alter table %I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', pol.policyname, t);
    end loop;
    if s = 'S' then
      -- payroll-grade: own row (user_id) or wages-View / Director
      execute format($p$create policy "see" on %I for select to authenticated
        using (fn_has_perm('wages','view') or
               (to_jsonb(%I.*) ? 'user_id' and (to_jsonb(%I.*)->>'user_id')::bigint = fn_current_staff_id()))$p$, t, t, t);
    else
      execute format('create policy "see" on %I for select to authenticated using (true)', t);
    end if;
    execute format($p$create policy "add" on %I for insert to authenticated
      with check (fn_has_perm(%L,'create') or fn_has_perm(%L,'manage'))$p$, t, m, m);
    execute format($p$create policy "edit" on %I for update to authenticated
      using (fn_has_perm(%L,'create') or fn_has_perm(%L,'approve') or fn_has_perm(%L,'verify') or fn_has_perm(%L,'manage'))
      with check (true)$p$, t, m, m, m, m);
    execute format($p$create policy "del" on %I for delete to authenticated
      using (fn_has_perm(%L,'manage'))$p$, t, m);
  end loop;
end $$;

-- identity & admin tables: read for staff, writes Director-only (self-serve via RPCs above)
do $$
declare t text; pol record;
begin
  foreach t in array array['app_users','permissions','user_sites','sites','staff_roles'] loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then continue; end if;
    execute format('alter table %I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', pol.policyname, t);
    end loop;
    execute format('create policy "see" on %I for select to authenticated using (true)', t);
    execute format('create policy "adm" on %I for all to authenticated using (fn_is_director()) with check (fn_is_director())', t);
  end loop;
end $$;

-- verification (SQL-Editor safe)
select count(*) as tables_with_policies from (select distinct tablename from pg_policies where schemaname = 'public') x;
select count(*) as anon_table_policies_left from pg_policies
  where schemaname = 'public' and roles::text like '%anon%';
