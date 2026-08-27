-- =============================================================================
-- PIPESKOOL — update242: ADVANCE SALARY — REVISE OR WITHDRAW AFTER APPROVAL
--
-- WHY
-- An advance salary request could be approved exactly once and never touched again:
-- the Action column switched to "Done" and no control existed for anyone, Director
-- included. A mis-click was permanent, and because staff payroll deducts approved
-- advances by reviewed_at month, a wrong approval quietly ate someone's salary.
-- Petty cash has had Change-amount / Undo-approval since update194; this brings
-- advances to the same standard.
--
-- WHAT THIS ADDS
-- 1. approved_amount column — the Director may approve LESS than was requested, and
--    the original ask stays visible (exactly how petty_cash_requests already works).
-- 2. fn_review_advance() — one SECURITY DEFINER entry point for every decision:
--    first approval, revision of an approved row, withdrawal, or approving a row that
--    was previously rejected. It permission-checks, refuses to touch a PAID advance,
--    writes an audit row, and reports the PREVIOUS status so the app can tell the
--    person "approval revised" rather than "approved" a second time.
--
-- WHAT IT DOES NOT DO
-- It does not move money. Approving an advance has never created a ledger entry —
-- the deduction happens when staff payroll is generated. So a withdrawal made before
-- payroll costs nothing; made after, regenerate that month and the row corrects.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. approved amount (nullable = approved in full) ----------
alter table advance_salary_requests
  add column if not exists approved_amount numeric(12,2);

-- ---------- 2. the single review entry point ----------
-- p_action: 'approved' | 'rejected' | 'queried'
-- p_amount: only meaningful with 'approved'; null = approve the full requested amount
create or replace function fn_review_advance(
  p_id bigint, p_action text, p_note text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; r record; v_amt numeric;
begin
  select id, role, full_name into u from app_users where auth_id = auth.uid() and is_active limit 1;
  if u.id is null then
    return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.');
  end if;

  -- same money-approval rule as fn_approve_petty and the exp_update / adv_update policies
  if not (u.role = 'director'
          or fn_has_perm('money','approve') or fn_has_perm('money','manage')
          or fn_has_perm('wages','approve') or fn_has_perm('wages','manage')) then
    return jsonb_build_object('ok', false, 'error', 'You are not authorised to review salary advances.');
  end if;

  if p_action not in ('approved','rejected','queried') then
    return jsonb_build_object('ok', false, 'error', 'Invalid action.');
  end if;

  select * into r from advance_salary_requests where id = p_id for update;
  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'Request not found.');
  end if;

  -- a PAID advance is money already handed over: correct it outside the app, not here
  if r.paid then
    return jsonb_build_object('ok', false,
      'error', 'This advance is already marked PAID and cannot be revised. Reverse the payment first.');
  end if;

  if p_action = 'approved' then
    v_amt := coalesce(p_amount, r.amount);
    if v_amt <= 0 then
      return jsonb_build_object('ok', false, 'error', 'Approved amount must be more than zero.');
    end if;
    if v_amt > r.amount then
      return jsonb_build_object('ok', false,
        'error', 'Approved amount cannot exceed the requested ' || r.amount || '.');
    end if;
  else
    v_amt := null;
  end if;

  update advance_salary_requests
     set status          = p_action::expense_status,
         approved_amount = case when p_action = 'approved' then v_amt else null end,
         query_note      = p_note,
         reviewed_by     = u.id,
         reviewed_at     = case when p_action = 'approved' then now() else null end
   where id = p_id;

  -- every decision is logged, including reversals — this is the audit trail the
  -- old bare UPDATE never left behind
  begin
    insert into module_audit_log (module, action, ref_id, staff_id, meta)
    values ('advance', p_action, p_id, u.id,
            jsonb_build_object('prev_status', r.status, 'prev_amount', r.approved_amount,
                               'requested', r.amount, 'new_amount', v_amt,
                               'beneficiary', r.beneficiary_name, 'note', p_note));
  exception when others then null;   -- never let logging block a correction
  end;

  return jsonb_build_object('ok', true,
    'prev_status',  r.status,
    'requested',    r.amount,
    'amount',       v_amt,
    'beneficiary',  r.beneficiary_name,
    'raised_by',    r.raised_by,
    'site_id',      r.site_id,
    'reviewer',     u.full_name);
end $$;

grant execute on function fn_review_advance(bigint, text, text, numeric) to authenticated;

-- ---------- 3. standard: reload the API schema cache ----------
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.columns
    where table_name = 'advance_salary_requests' and column_name = 'approved_amount')  as approved_amount_col,  -- expect 1
  (select count(*) from pg_proc where proname = 'fn_review_advance')                   as review_fn,            -- expect 1
  (select count(*) from advance_salary_requests where status = 'approved')             as approved_rows,        -- your current count
  (select count(*) from advance_salary_requests
     where status = 'approved' and approved_amount is not null)                        as part_approved,        -- expect 0 on first run
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity))
                                                                                       as unlocked_tables_left; -- expect 0
