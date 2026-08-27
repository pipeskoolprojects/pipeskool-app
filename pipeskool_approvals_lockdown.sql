-- =============================================================================
-- PIPESKOOL — update238: APPROVAL LOCKDOWN
--
-- WHAT THIS FIXES
-- Approval ACTIONS were already enforced server-side before this file
-- (fn_approve_petty, fn_confirm_petty_return, fn_po_approve, and the exp_update /
-- adv_update RLS policies all require Director or an approve/manage permission).
-- What was NOT enforced was READING the pending queues. Since update162 the read
-- policies were:
--     director OR fn_has_admin('view_all_money') OR fn_site_allowed(site_id) OR own row
-- so anyone assigned to a site — and every Accountant / IT Executive, who were
-- granted view_all_money on 8 Aug — could read every PENDING petty cash request,
-- expense claim, salary advance and cash return, directly from the API, whatever
-- the UI showed.
--
-- WHAT CHANGES
-- PENDING rows become visible only to (a) someone who may approve them,
-- (b) an Accountant / IT Executive holding the view_all_money capability, or
-- (c) the person who raised them. Everyone else — supervisors, site staff,
-- storekeepers, billing — loses the site-wide read they had via fn_site_allowed().
-- DECIDED rows (approved / rejected / confirmed / cancelled) keep exactly the
-- visibility they have today, so site reports, money ledgers, person profiles,
-- Tally export and the dashboards are unaffected.
--
-- READ IS NOT APPROVE. view_all_money grants SELECT and nothing else. Approving still
-- requires Director or money/wages approve|manage, enforced separately in
-- fn_approve_petty, fn_confirm_petty_return and the exp_update / adv_update policies.
-- An Accountant or IT Executive can therefore watch the pending queue but cannot act on
-- it — the API refuses them even if a button were somehow rendered.
--
-- ONE DEFINITION, FOUR CALL SITES
-- All four tables call the SAME function, fn_approval_row_visible(). The policies
-- cannot drift apart because none of them contains any logic of its own — each is
-- a single call passing that table's owner columns, status and site.
--
-- ALSO IN THIS FILE
-- fn_approve_item(): item-master approval was a bare UPDATE, allowed by the phase-2
-- "edit" policy to anyone with stock CREATE — so a storekeeper who could add items
-- could also approve pending ones. It now goes through a SECURITY DEFINER function
-- requiring Director or stock approve/manage.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. who may approve money items (one definition) ----------
-- Mirrors fn_approve_petty / fn_confirm_petty_return / exp_update / adv_update.
create or replace function fn_can_approve_money() returns boolean
language sql stable security definer set search_path = public as $$
  select fn_is_director()
      or fn_has_perm('money','approve') or fn_has_perm('money','manage')
      or fn_has_perm('wages','approve') or fn_has_perm('wages','manage');
$$;

-- ---------- 2. is this row still awaiting a decision? ----------
create or replace function fn_approval_pending(p_status text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_status, '') in ('pending', 'queried', 'info_needed');
$$;

-- ---------- 3. THE shared row-visibility rule ----------
-- p_owner1 / p_owner2 : the app_users ids that "own" the row (second may be null)
-- p_status            : the row's status
-- p_site              : the row's site_id
create or replace function fn_approval_row_visible(
  p_owner1 bigint, p_owner2 bigint, p_status text, p_site bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    -- decided rows: unchanged from update162 behaviour
    when not fn_approval_pending(p_status) then
      fn_is_director() or fn_has_admin('view_all_money') or fn_site_allowed(p_site)
      or p_owner1 = fn_current_staff_id() or p_owner2 = fn_current_staff_id()
    -- pending rows: approvers, view_all_money holders (READ ONLY — see below), and the
    -- person who raised it. Nobody else.
    else
      fn_can_approve_money()
      or fn_has_admin('view_all_money')
      or p_owner1 = fn_current_staff_id() or p_owner2 = fn_current_staff_id()
  end;
$$;

grant execute on function fn_can_approve_money(), fn_approval_pending(text),
  fn_approval_row_visible(bigint, bigint, text, bigint) to authenticated;

-- ---------- 4. the four read policies — one call each, no local logic ----------
-- NOTE (fix, 27 Aug): status is the ENUM expense_status on `expenses` and
-- `advance_salary_requests`, and plain text on the two petty tables. PostgreSQL does not
-- implicitly cast an enum to text when resolving a function call, so every call site casts
-- status::text explicitly. Harmless on the text columns, required on the enum ones.
drop policy if exists pcr_select on petty_cash_requests;
create policy pcr_select on petty_cash_requests for select to authenticated
  using (fn_approval_row_visible(requested_by, null, status::text, site_id));

drop policy if exists exp_select on expenses;
create policy exp_select on expenses for select to authenticated
  using (fn_approval_row_visible(claimant_user_id, holder_user_id, status::text, site_id));

drop policy if exists adv_select on advance_salary_requests;
create policy adv_select on advance_salary_requests for select to authenticated
  using (fn_approval_row_visible(raised_by, beneficiary_user_id, status::text, site_id));

drop policy if exists pret_select on petty_cash_returns;
create policy pret_select on petty_cash_returns for select to authenticated
  using (fn_approval_row_visible(user_id, null, status::text, site_id));

-- ---------- 5. item-master approval becomes a real server-side check ----------
create or replace function fn_approve_item(p_id bigint, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; it record;
begin
  select id, role into u from app_users where auth_id = auth.uid() and is_active limit 1;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.'); end if;
  if not (u.role = 'director' or fn_has_perm('stock','approve') or fn_has_perm('stock','manage')) then
    return jsonb_build_object('ok', false, 'error', 'You are not authorised to review new items.');
  end if;
  if p_action not in ('approve','reject') then
    return jsonb_build_object('ok', false, 'error', 'Invalid action.');
  end if;

  select id, display_name, pending_review into it from item_master where id = p_id for update;
  if it.id is null then return jsonb_build_object('ok', false, 'error', 'Item not found.'); end if;
  if not it.pending_review then
    return jsonb_build_object('ok', false, 'error', 'This item is not awaiting review.');
  end if;

  if p_action = 'approve' then
    update item_master set pending_review = false where id = p_id;
    return jsonb_build_object('ok', true, 'name', it.display_name, 'action', 'approved');
  end if;

  begin
    delete from item_master where id = p_id;
  exception when foreign_key_violation then
    return jsonb_build_object('ok', false,
      'error', 'This item was already used in stock/indents — it can only be approved or deactivated, not removed.');
  end;
  return jsonb_build_object('ok', true, 'name', it.display_name, 'action', 'rejected');
end $$;

grant execute on function fn_approve_item(bigint, text) to authenticated;

-- ---------- 6. standard: reload the API schema cache ----------
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from pg_proc where proname = 'fn_approval_row_visible')            as shared_fn_installed,   -- expect 1
  (select count(*) from pg_proc where proname = 'fn_can_approve_money')               as money_fn_installed,    -- expect 1
  (select count(*) from pg_proc where proname = 'fn_approve_item')                    as item_fn_installed,     -- expect 1
  (select count(*) from pg_policies
     where schemaname = 'public'
       and policyname in ('pcr_select','exp_select','adv_select','pret_select')
       and qual ilike '%fn_approval_row_visible%')                                    as policies_using_shared, -- expect 4
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_approval_row_visible'
       and pg_get_functiondef(p.oid) ilike '%view_all_money%')                        as viewer_path_present,   -- expect 1
  (select count(*) from pg_policies
     where schemaname = 'public'
       and tablename in ('petty_cash_requests','expenses','advance_salary_requests','petty_cash_returns')
       and cmd = 'SELECT'
       and qual not ilike '%fn_approval_row_visible%')                                as policies_not_shared,   -- expect 0
  (select count(*) from pg_policies
     where schemaname = 'public' and roles::text like '%anon%')                       as anon_policies_left,    -- expect 0
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity))
                                                                                      as unlocked_tables_left;  -- expect 0
