-- =============================================================================
-- PIPESKOOL — update211: REQUESTER SELF-EDIT OF PENDING EXPENSES
-- Until the Director/approver acts on it, the person who raised an expense can
-- edit it — amount, purpose, category, date, paid-to — and switch the funding
-- source between Own pocket and Petty cash (safe: petty deducts on APPROVAL only,
-- which is the locked rule). Enforced via SECURITY DEFINER RPC + audited.
-- Run as ONE transaction. Backup first (standing rule).
-- =============================================================================
create or replace function fn_expense_self_edit(
  p_id bigint, p_amount numeric, p_note text, p_category text,
  p_funding text, p_date date, p_paid_to text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; e record;
begin
  select id, full_name into u from app_users where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'Not logged in.'); end if;
  select id, claimant_user_id, status, amount, funding_source into e from expenses where id = p_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'Expense not found.'); end if;
  if e.claimant_user_id <> u.id then
    return jsonb_build_object('ok', false, 'error', 'Only the person who raised this expense can edit it.');
  end if;
  if e.status not in ('pending','queried') then
    return jsonb_build_object('ok', false, 'error', 'Already ' || e.status || ' — it can no longer be edited.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Amount must be more than zero.');
  end if;
  if p_funding not in ('own_pocket','petty_cash') then
    return jsonb_build_object('ok', false, 'error', 'Funding must be Own pocket or Petty cash.');
  end if;
  update expenses set
    amount = p_amount,
    note = coalesce(nullif(trim(p_note), ''), note),
    category = p_category::expense_category,
    funding_source = p_funding,
    expense_date = coalesce(p_date, expense_date),
    paid_to = coalesce(nullif(trim(p_paid_to), ''), paid_to)
  where id = p_id;
  insert into module_audit_log (module, action, staff_id, meta)
  values ('money', 'expense_self_edit', u.id,
    jsonb_build_object('expense_id', p_id, 'old_amount', e.amount, 'new_amount', p_amount,
                       'old_funding', e.funding_source, 'new_funding', p_funding));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function fn_expense_self_edit(bigint, numeric, text, text, text, date, text) to authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from pg_proc where proname='fn_expense_self_edit')               as edit_fn,              -- 1
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)  as unlocked_tables_left; -- 0
