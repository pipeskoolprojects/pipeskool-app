-- =============================================================================
-- PIPESKOOL — update164: PETTY CASH — approve a DIFFERENT amount + EDIT a
--                        decision after the fact (undo mistaken approvals)
--
-- 1. approved_amount on requests: approver can grant less (or more) than asked
--    (e.g. asked Rs.5,000, approve Rs.2,000).
-- 2. Grants now carry request_id (backfilled from the note for old grants), so
--    a decision can be REVISED safely: re-approving replaces the old grant,
--    withdrawing (-> rejected) removes it — the employee's petty balance and
--    request history update automatically, atomically.
-- 3. fn_approve_petty v2: same authorisation, now accepts any current status
--    (pending / approved / rejected) and an optional amount. All-or-nothing.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- 1. columns + request link
alter table petty_cash_requests add column if not exists approved_amount numeric(12,2);
alter table petty_cash_grants   add column if not exists request_id bigint references petty_cash_requests(id);

-- backfill: old grants embedded 'Petty request #<id>' in their note
update petty_cash_grants
   set request_id = (substring(note from 'Petty request #(\d+)'))::bigint
 where request_id is null and note like 'Petty request #%';

-- backfill: already-approved requests were approved at the asked amount
update petty_cash_requests set approved_amount = amount
 where status = 'approved' and approved_amount is null;

-- 2. reviewer function v2 (signature change -> drop old first)
drop function if exists fn_approve_petty(bigint, text, text);

create function fn_approve_petty(p_id bigint, p_status text, p_note text,
  p_amount numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; r record; v_amount numeric; v_prev text;
begin
  select id, role into u from app_users where auth_id = auth.uid() and is_active limit 1;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.'); end if;
  if not (u.role = 'director'
          or fn_has_perm('money','approve') or fn_has_perm('money','manage')
          or fn_has_perm('wages','approve') or fn_has_perm('wages','manage')) then
    return jsonb_build_object('ok', false, 'error', 'You are not authorised to review petty cash requests.');
  end if;
  if p_status not in ('approved','rejected') then
    return jsonb_build_object('ok', false, 'error', 'Invalid status.');
  end if;

  select * into r from petty_cash_requests where id = p_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'Request not found.'); end if;
  v_prev := r.status;

  v_amount := coalesce(p_amount, r.amount);
  if p_status = 'approved' and (v_amount is null or v_amount <= 0) then
    return jsonb_build_object('ok', false, 'error', 'Approved amount must be greater than zero.');
  end if;

  -- any previous grant for this request is replaced (or removed on withdrawal)
  delete from petty_cash_grants where request_id = p_id;

  if p_status = 'approved' then
    insert into petty_cash_grants (user_id, site_id, amount, note, request_id)
    values (r.requested_by, r.site_id, v_amount,
            'Petty request #' || r.id
              || case when v_amount <> r.amount
                 then ' (approved ' || v_amount || ' against asked ' || r.amount || ')'
                 else '' end
              || coalesce(' — ' || r.purpose, ''),
            r.id);
  end if;

  update petty_cash_requests
     set status = p_status,
         approved_amount = case when p_status = 'approved' then v_amount else null end,
         query_note = p_note, reviewed_by = u.id, reviewed_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'requested_by', r.requested_by,
    'requested_amount', r.amount, 'approved_amount',
    case when p_status = 'approved' then v_amount else null end,
    'prev_status', v_prev, 'site_id', r.site_id, 'purpose', r.purpose);
end $$;

grant execute on function fn_approve_petty(bigint, text, text, numeric) to authenticated;

-- 3. standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.columns
    where (table_name='petty_cash_requests' and column_name='approved_amount')
       or (table_name='petty_cash_grants' and column_name='request_id'))       as new_columns,      -- expect 2
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='fn_approve_petty' and p.pronargs=4) as fn_v2,           -- expect 1
  (select count(*) from petty_cash_grants
    where request_id is null and note like 'Petty request #%')                 as unlinked_grants;  -- expect 0
