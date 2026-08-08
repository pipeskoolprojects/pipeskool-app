-- =============================================================================
-- PIPESKOOL — update162: "View all sites' money" admin capability
-- Policy decision by Director (8 Aug): Accountants and IT Executives see ALL
-- sites' money records. Implemented as an assignable admin capability
-- (view_all_money), pre-granted to all current accountant / it_executive
-- staff, controllable per-person from Access Rights -> Admin capabilities.
-- The three money tables' READ policies now honour it.
-- Safe to run whether or not pipeskool_site_guard_assets.sql (v2) ran first:
-- policies are dropped by name if present and recreated in full.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- 1. grant the capability to every current Accountant and IT Executive
insert into admin_rights (user_id, capability)
select id, 'view_all_money' from app_users
 where role in ('accountant', 'it_executive') and is_active = true
on conflict do nothing;

-- 2. read policies honour it (recreated in full — idempotent)
drop policy if exists exp_select on expenses;
create policy exp_select on expenses for select to authenticated
  using (fn_is_director() or fn_has_admin('view_all_money') or fn_site_allowed(site_id)
         or claimant_user_id = fn_current_staff_id() or holder_user_id = fn_current_staff_id());

drop policy if exists adv_select on advance_salary_requests;
create policy adv_select on advance_salary_requests for select to authenticated
  using (fn_is_director() or fn_has_admin('view_all_money') or fn_site_allowed(site_id)
         or raised_by = fn_current_staff_id());

drop policy if exists pcr_select on petty_cash_requests;
create policy pcr_select on petty_cash_requests for select to authenticated
  using (fn_is_director() or fn_has_admin('view_all_money') or fn_site_allowed(site_id)
         or requested_by = fn_current_staff_id());

-- 3. standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from pg_policies
    where policyname in ('exp_select','adv_select','pcr_select')
      and qual ilike '%view_all_money%')                                        as policies_updated, -- expect 3
  (select count(*) from admin_rights where capability = 'view_all_money')       as people_granted;   -- your accountant+IT count
