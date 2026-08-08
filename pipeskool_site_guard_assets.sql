-- =============================================================================
-- PIPESKOOL — update160 (v2 — fixes 42703: petty requester column is requested_by): SITE-ACCESS GUARD (money tables) + test-data delete +
--                        asset edit audit log
--
-- 1. fn_site_allowed(site): the caller must be a Director or assigned to that
--    site. Applied to expenses / advance_salary_requests / petty_cash_requests:
--      * INSERT: create tick AND the row's site must be one of the caller's
--        assigned sites — the DATABASE now refuses cross-site creation.
--      * SELECT: Directors see all; others see rows of their assigned sites
--        plus their OWN rows (a claimant always sees their own claim).
--    NOTE (honest scope): this locks the three money tables site-wise. The
--    remaining ~45 tables keep module-level locks; full per-site read RLS
--    across everything stays the flagged Phase-3 job.
-- 2. Deletes the identified TEST row: Rs.2,000 advance for SATYAM CHAURASIA
--    dated 2026-07-25. Nothing else is touched (I cannot judge which other
--    rows are tests — name them and I will script them).
-- 3. asset_edit_log: every asset edit stores who / when / exactly what changed.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1a. the guard ----------
create or replace function fn_site_allowed(p_site_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select fn_is_director() or p_site_id is null or exists (
    select 1 from user_sites us
      join app_users u on u.id = us.user_id
     where u.auth_id = auth.uid() and u.is_active and us.site_id = p_site_id
  );
$$;
grant execute on function fn_site_allowed(bigint) to authenticated;

-- ---------- 1b. rebuild the three money tables' policies deterministically ----
do $$ declare pol record; t text; begin
  foreach t in array array['expenses','advance_salary_requests','petty_cash_requests'] loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on %I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- expenses
create policy exp_select on expenses for select to authenticated
  using (fn_is_director() or fn_site_allowed(site_id)
         or claimant_user_id = fn_current_staff_id() or holder_user_id = fn_current_staff_id());
create policy exp_insert on expenses for insert to authenticated
  with check ((fn_has_perm('money','create') or fn_has_perm('wages','create')) and fn_site_allowed(site_id));
create policy exp_update on expenses for update to authenticated
  using (fn_has_perm('money','approve') or fn_has_perm('money','manage')
         or fn_has_perm('wages','approve') or fn_has_perm('wages','verify') or fn_has_perm('wages','manage'));
create policy exp_delete on expenses for delete to authenticated
  using (fn_has_perm('money','manage'));

-- advance_salary_requests
create policy adv_select on advance_salary_requests for select to authenticated
  using (fn_is_director() or fn_site_allowed(site_id) or raised_by = fn_current_staff_id());
create policy adv_insert on advance_salary_requests for insert to authenticated
  with check ((fn_has_perm('money','create') or fn_has_perm('wages','create')) and fn_site_allowed(site_id));
create policy adv_update on advance_salary_requests for update to authenticated
  using (fn_has_perm('money','approve') or fn_has_perm('money','manage')
         or fn_has_perm('wages','approve') or fn_has_perm('wages','manage'));
create policy adv_delete on advance_salary_requests for delete to authenticated
  using (fn_has_perm('money','manage'));

-- petty_cash_requests (status changes still ONLY via fn_approve_petty)
create policy pcr_select on petty_cash_requests for select to authenticated
  using (fn_is_director() or fn_site_allowed(site_id) or requested_by = fn_current_staff_id());
create policy pcr_insert on petty_cash_requests for insert to authenticated
  with check ((fn_has_perm('money','create') or fn_has_perm('wages','create')) and fn_site_allowed(site_id));
create policy pcr_delete on petty_cash_requests for delete to authenticated
  using (fn_is_director());

-- ---------- 2. identified test row ----------
delete from advance_salary_requests
 where beneficiary_name ilike 'SATYAM CHAURASIA' and amount = 2000
   and created_at::date = date '2026-07-25';

-- ---------- 3. asset edit audit ----------
create table if not exists asset_edit_log (
  id bigserial primary key,
  asset_id  bigint not null references assets(id) on delete cascade,
  edited_by bigint references app_users(id),
  edited_at timestamptz not null default now(),
  changes   jsonb not null            -- { field: { from: ..., to: ... }, ... }
);
alter table asset_edit_log enable row level security;
drop policy if exists ael_select on asset_edit_log;
create policy ael_select on asset_edit_log for select to authenticated using (true);
drop policy if exists ael_insert on asset_edit_log;
create policy ael_insert on asset_edit_log for insert to authenticated
  with check (fn_has_perm('assets','manage') or fn_has_perm('assets','create'));

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='fn_site_allowed')                     as guard_fn,      -- expect 1
  (select count(*) from pg_policies
    where tablename in ('expenses','advance_salary_requests','petty_cash_requests')) as money_policies, -- expect 11
  (select count(*) from advance_salary_requests
    where beneficiary_name ilike 'SATYAM CHAURASIA' and amount = 2000)            as test_row_left,  -- expect 0
  (select count(*) from information_schema.tables
    where table_name='asset_edit_log')                                            as audit_table;    -- expect 1
