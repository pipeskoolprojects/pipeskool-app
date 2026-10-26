-- update 477: DPR — free-text work points, free-text material, late (past-date) and multi-day entries.
-- Safe to re-run. Nothing is deleted or rewritten; old DPRs (BOQ-linked work, quantities, hindrances) keep working.

-- 1. columns ------------------------------------------------------------------------------------
alter table public.dpr add column if not exists is_late boolean not null default false;
alter table public.dpr add column if not exists late_reason text;
alter table public.dpr add column if not exists filled_at timestamptz;            -- when it was actually submitted
alter table public.dpr add column if not exists entered_by bigint references public.app_users(id);
alter table public.dpr add column if not exists manpower_source text;             -- attendance | manual | none
update public.dpr set filled_at = coalesce(filled_at, submitted_at, created_at) where filled_at is null;
update public.dpr set entered_by = coalesce(entered_by, filled_by) where entered_by is null and filled_by is not null;
alter table public.dpr alter column filled_at set default now();
-- a work point is plain text now: quantity / unit / BOQ links stay for old rows, simply null for new ones
alter table public.dpr_work_items alter column qty drop not null;
alter table public.dpr_materials alter column qty drop not null;
create index if not exists dpr_site_date_idx on public.dpr(site_id, dpr_date desc);

-- 2. permission: dpr_backdate · create  ("DPR late entries") — default ON wherever dpr · create is ON ------
insert into public.permissions (user_id, site_id, module, action, allowed)
select p.user_id, p.site_id, 'dpr_backdate', 'create', true
  from public.permissions p
 where p.module = 'dpr' and p.action = 'create' and p.allowed
   and not exists (select 1 from public.permissions q where q.user_id = p.user_id and q.site_id = p.site_id and q.module = 'dpr_backdate' and q.action = 'create');
-- role defaults (Reset to role / new site assignment) also grant it with dpr · create
create or replace function public.fn_seed_site_permissions(p_user_id bigint, p_role text, p_site_id bigint)
returns void language plpgsql as $$
begin
  delete from permissions where user_id = p_user_id and site_id = p_site_id;
  if p_role = 'director' then
    insert into permissions(user_id, site_id, module, action, allowed)
    select p_user_id, p_site_id, m, a, true from
      (values ('attendance'),('dpr'),('money'),('stock'),('indent'),('assets'),('wages'),('workers')) mods(m),
      (values ('view'),('create'),('approve'),('verify'),('manage')) acts(a);
  elsif p_role = 'ho_admin' then   -- Accountant
    insert into permissions(user_id, site_id, module, action, allowed)
    select p_user_id, p_site_id, m, a, true from
      (values ('attendance'),('dpr'),('money'),('stock'),('indent'),('assets'),('wages'),('workers')) mods(m),
      (values ('view'),('approve')) acts(a);
    insert into permissions(user_id, site_id, module, action, allowed) values
      (p_user_id,p_site_id,'money','create',true),(p_user_id,p_site_id,'wages','create',true)
    on conflict do nothing;
  elsif p_role in ('supervisor','site_engineer') then  -- Site Incharge / Engineer
    insert into permissions(user_id, site_id, module, action, allowed)
    select p_user_id, p_site_id, m, a, true from
      (values ('attendance'),('dpr'),('money'),('stock'),('indent'),('assets'),('workers')) mods(m),
      (values ('view'),('create')) acts(a);
    insert into permissions(user_id, site_id, module, action, allowed) values
      (p_user_id,p_site_id,'attendance','verify',true)
    on conflict do nothing;
  elsif p_role = 'storekeeper' then
    insert into permissions(user_id, site_id, module, action, allowed)
    select p_user_id, p_site_id, m, a, true from
      (values ('stock'),('indent'),('assets')) mods(m),
      (values ('view'),('create')) acts(a);
  end if;
  -- update477: whoever may create a DPR may also file it late, unless a Director unticks it
  insert into permissions(user_id, site_id, module, action, allowed)
  select p_user_id, p_site_id, 'dpr_backdate', 'create', true
   where exists (select 1 from permissions where user_id = p_user_id and site_id = p_site_id and module = 'dpr' and action = 'create' and allowed)
  on conflict do nothing;
end $$;

-- 2b. non-working days: Sundays + company holidays that stop site labour (kind = holiday, applies to labour or both,
--     company-wide or listing this site). Used by the batch save and the pending calendar.
create or replace function public.fn_dpr_is_holiday(p_site_id bigint, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_holidays h
                  where h.on_date = p_day and coalesce(h.is_active, true) and coalesce(h.kind, 'holiday') = 'holiday'
                    and coalesce(h.applies_to, 'both') in ('labour', 'both')
                    and (h.site_ids is null or p_site_id = any(h.site_ids)));
$$;
grant execute on function public.fn_dpr_is_holiday(bigint, date) to authenticated;

-- 3. one server call for past-date / many-day entries: validates, creates all days in ONE transaction -------
--    p: { site_id, dates: ["2026-10-01", ...], reason, work: ["point", ...], materials: [{name, qty, unit}],
--         plan, skip_sundays (bool), skip_existing (bool) }
--    returns { ok, created: [{date,id}], skipped: [{date,reason}], existing_id (single date that already has a DPR) }
create or replace function public.fn_dpr_save_late(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me public.app_users; v_site bigint := (p->>'site_id')::bigint; v_reason text := btrim(coalesce(p->>'reason',''));
  v_dates date[]; v_d date; v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_work jsonb := coalesce(p->'work','[]'::jsonb); v_mats jsonb := coalesce(p->'materials','[]'::jsonb);
  v_skip_sun boolean := coalesce((p->>'skip_sundays')::boolean, true); v_skip_ex boolean := coalesce((p->>'skip_existing')::boolean, true);
  v_created jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_id bigint; v_mp int; v_exist bigint; v_n int := 0; w jsonb; m jsonb;
  v_single boolean;
begin
  select * into v_me from app_users where auth_id = auth.uid() and is_active limit 1;
  if v_me.id is null then return jsonb_build_object('ok', false, 'error', 'Login required.'); end if;
  if v_site is null or not fn_site_allowed(v_site) then return jsonb_build_object('ok', false, 'error', 'You are not assigned to this site.'); end if;
  if not (fn_has_perm('dpr','create') or fn_has_perm('dpr','manage')) then return jsonb_build_object('ok', false, 'error', 'You do not have the DPR create right.'); end if;
  if not (fn_has_perm('dpr_backdate','create') or fn_has_perm('dpr','manage')) then
    return jsonb_build_object('ok', false, 'error', 'You do not have the "DPR late entries" right. A Director can grant it under Access Rights.');
  end if;
  select array_agg(distinct x::date order by x::date) into v_dates from jsonb_array_elements_text(coalesce(p->'dates','[]'::jsonb)) x;
  if v_dates is null or array_length(v_dates,1) = 0 then return jsonb_build_object('ok', false, 'error', 'Pick at least one date.'); end if;
  if array_length(v_dates,1) > 62 then return jsonb_build_object('ok', false, 'error', 'A range can cover at most 62 days.'); end if;
  if (select max(d) from unnest(v_dates) d) >= v_today then return jsonb_build_object('ok', false, 'error', 'Past dates only — today is filled from the Today tab, future dates are not allowed.'); end if;
  if length(v_reason) < 3 then return jsonb_build_object('ok', false, 'error', 'Please add the reason for the late entry (at least 3 characters).'); end if;
  -- at least one non-empty work point
  if not exists (select 1 from jsonb_array_elements_text(v_work) t where btrim(t) <> '') then return jsonb_build_object('ok', false, 'error', 'Add at least one work point.'); end if;
  v_single := array_length(v_dates,1) = 1;

  foreach v_d in array v_dates loop
    if v_skip_sun and not v_single and extract(dow from v_d) = 0 then v_skipped := v_skipped || jsonb_build_object('date', v_d, 'reason', 'Sunday'); continue; end if;
    if v_skip_sun and not v_single and fn_dpr_is_holiday(v_site, v_d) then v_skipped := v_skipped || jsonb_build_object('date', v_d, 'reason', 'Holiday'); continue; end if;
    select id into v_exist from dpr where site_id = v_site and dpr_date = v_d;
    if v_exist is not null then
      -- idempotent retry: the same person saved this very late entry moments ago (double tap / network retry) → success, nothing new
      if v_single and exists (select 1 from dpr where id = v_exist and is_late and entered_by = v_me.id and late_reason = v_reason and filled_at > now() - interval '3 minutes') then
        return jsonb_build_object('ok', true, 'created', jsonb_build_array(jsonb_build_object('date', v_d, 'id', v_exist)), 'skipped', '[]'::jsonb, 'retry', true);
      end if;
      if v_single then return jsonb_build_object('ok', false, 'error', 'A DPR already exists for this date.', 'code', 'exists', 'existing_id', v_exist); end if;
      v_skipped := v_skipped || jsonb_build_object('date', v_d, 'reason', 'already exists');   -- never overwrite in a batch
      continue;
    end if;
    -- manpower: that day's attendance for the site; 0 + flag when there is none
    select count(*) into v_mp from attendance where site_id = v_site and att_date = v_d and status in ('present','half_day');
    insert into dpr (site_id, dpr_date, filled_by, entered_by, manpower_present, manpower_source, tomorrow_plan, status, submitted_at, filled_at, is_late, late_reason)
    values (v_site, v_d, v_me.id, v_me.id, coalesce(v_mp,0), case when coalesce(v_mp,0) > 0 then 'attendance' else 'none' end,
            nullif(btrim(coalesce(p->>'plan','')),''), 'submitted', now(), now(), true, v_reason)
    returning id into v_id;
    for w in select * from jsonb_array_elements_text(v_work) loop
      if btrim(w #>> '{}') <> '' then insert into dpr_work_items (dpr_id, activity_text, qty) values (v_id, btrim(w #>> '{}'), null); end if;
    end loop;
    for m in select * from jsonb_array_elements(v_mats) loop
      if btrim(coalesce(m->>'name','')) <> '' then
        insert into dpr_materials (dpr_id, item_name, qty, unit) values (v_id, btrim(m->>'name'), nullif(m->>'qty','')::numeric, nullif(m->>'unit',''));
      end if;
    end loop;
    v_created := v_created || jsonb_build_object('date', v_d, 'id', v_id); v_n := v_n + 1;
  end loop;

  if v_n > 0 then
    insert into module_audit_log (module, action, ref_id, staff_id, meta)
    values ('dpr', 'late_entry', null, v_me.id, jsonb_build_object('site_id', v_site, 'dates', (select jsonb_agg(c->>'date') from jsonb_array_elements(v_created) c), 'reason', v_reason, 'created', v_n, 'source', coalesce(p->>'source','past')));
  end if;
  return jsonb_build_object('ok', true, 'created', v_created, 'skipped', v_skipped);
exception when others then
  -- any failure rolls the whole batch back (function body = one transaction)
  return jsonb_build_object('ok', false, 'error', 'Nothing was saved: ' || sqlerrm);
end $$;
revoke all on function public.fn_dpr_save_late(jsonb) from public, anon;
grant execute on function public.fn_dpr_save_late(jsonb) to authenticated;

-- 4. "used recently" suggestions: distinct recent work points / material names for a site (no master lookup)
create or replace function public.fn_dpr_recent_texts(p_site_id bigint, p_kind text, p_limit int default 6)
returns table(txt text) language sql stable security definer set search_path = public as $$
  select t from (
    select distinct on (lower(t)) t, mx from (
      select case when p_kind = 'material' then m.item_name else w.activity_text end as t, max(d.dpr_date) mx
        from dpr d
        left join dpr_work_items w on p_kind <> 'material' and w.dpr_id = d.id and w.activity_text is not null and w.activity_id is null and w.boq_item_id is null and w.item_id is null
        left join dpr_materials m on p_kind = 'material' and m.dpr_id = d.id
       where d.site_id = p_site_id and fn_site_allowed(p_site_id)
       group by 1
    ) x where t is not null and btrim(t) <> ''
    order by lower(t), mx desc
  ) y order by mx desc limit greatest(1, least(coalesce(p_limit,6), 12));
$$;
grant execute on function public.fn_dpr_recent_texts(bigint, text, int) to authenticated;

-- 5. pending DPR calendar: one call per site per month → filled / pending / non-working dates, server computed.
--    Pending = a working day (not Sunday, not a labour holiday) between the site's start and yesterday with no DPR.
--    Site start = sites.start_date, or the first DPR date when start_date is empty. Visible only for allowed sites.
create or replace function public.fn_dpr_month_status(p_site_id bigint, p_year int, p_month int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from date := make_date(p_year, p_month, 1); v_to date; v_today date := (now() at time zone 'Asia/Kolkata')::date;
        v_start date; v_filled jsonb; v_pending jsonb; v_off jsonb; v_cnt int;
begin
  if p_site_id is null or not fn_site_allowed(p_site_id) then return jsonb_build_object('ok', false, 'error', 'You are not assigned to this site.'); end if;
  if not (fn_has_perm('dpr','view') or fn_has_perm('dpr','create') or fn_has_perm('dpr','manage')) then return jsonb_build_object('ok', false, 'error', 'No DPR right.'); end if;
  v_to := (v_from + interval '1 month')::date - 1;
  select coalesce(s.start_date, (select min(dpr_date) from dpr where site_id = p_site_id), v_today) into v_start from sites s where s.id = p_site_id;
  select coalesce(jsonb_agg(to_char(dpr_date,'YYYY-MM-DD') order by dpr_date), '[]'::jsonb) into v_filled
    from dpr where site_id = p_site_id and dpr_date between v_from and v_to;
  select coalesce(jsonb_agg(to_char(d,'YYYY-MM-DD') order by d), '[]'::jsonb) into v_off
    from generate_series(v_from, v_to, interval '1 day') g(d)
   where extract(dow from g.d) = 0 or fn_dpr_is_holiday(p_site_id, g.d::date);
  select coalesce(jsonb_agg(to_char(d,'YYYY-MM-DD') order by d), '[]'::jsonb), count(*) into v_pending, v_cnt
    from generate_series(v_from, v_to, interval '1 day') g(d)
   where g.d::date < v_today and g.d::date >= v_start
     and extract(dow from g.d) <> 0 and not fn_dpr_is_holiday(p_site_id, g.d::date)
     and not exists (select 1 from dpr where site_id = p_site_id and dpr_date = g.d::date);
  return jsonb_build_object('ok', true, 'site_id', p_site_id, 'year', p_year, 'month', p_month, 'today', to_char(v_today,'YYYY-MM-DD'),
    'start_date', to_char(v_start,'YYYY-MM-DD'), 'filled', v_filled, 'pending', v_pending, 'off', v_off, 'pending_count', coalesce(v_cnt,0));
end $$;
grant execute on function public.fn_dpr_month_status(bigint, int, int) to authenticated;

-- current-month pending count for the DPR tab badge / header (same rules, one number)
create or replace function public.fn_dpr_pending_count(p_site_id bigint) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((fn_dpr_month_status(p_site_id, extract(year from (now() at time zone 'Asia/Kolkata'))::int, extract(month from (now() at time zone 'Asia/Kolkata'))::int)->>'pending_count')::int, 0);
$$;
grant execute on function public.fn_dpr_pending_count(bigint) to authenticated;

-- 6. check
select count(*) filter (where is_late) late_rows, count(*) filled_at_set from dpr where filled_at is not null;
