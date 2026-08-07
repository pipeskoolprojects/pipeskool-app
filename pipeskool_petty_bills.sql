-- =============================================================================
-- PIPESKOOL — update159: EXPENSE BILLS (multi, viewable) + ADVANCE PETTY CASH REQUESTS
--
-- 1. expense_bills: every expense can carry MULTIPLE bill files (image or PDF),
--    each previewable and downloadable. Legacy single bill_photo_url stays and
--    is displayed alongside.
-- 2. petty_cash_requests: request petty cash BEFORE spending (site, amount,
--    purpose, required date, remarks) -> same approval pattern as advances ->
--    APPROVAL ATOMICALLY CREDITS the requester's petty balance via a grant row
--    (fn_approve_petty, SECURITY DEFINER: status change + petty_cash_grants
--    insert succeed or fail together).
-- 3. Notification routing seeded: Directors receive the new 'petty' kind.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. multiple bills per expense ----------
create table if not exists expense_bills (
  id bigint generated always as identity primary key,
  expense_id bigint not null references expenses(id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_expense_bills_exp on expense_bills(expense_id);
alter table expense_bills enable row level security;
drop policy if exists eb_select on expense_bills;
create policy eb_select on expense_bills for select to authenticated using (true);
drop policy if exists eb_insert on expense_bills;
create policy eb_insert on expense_bills for insert to authenticated
  with check (fn_has_perm('money','create') or fn_has_perm('wages','create'));

-- ---------- 2. petty cash requests ----------
create table if not exists petty_cash_requests (
  id bigint generated always as identity primary key,
  site_id bigint not null references sites(id),
  requested_by bigint not null references app_users(id),
  amount numeric(12,2) not null check (amount > 0),
  purpose text not null,
  required_date date,
  remarks text,
  status text not null default 'pending',        -- pending | approved | rejected
  query_note text,
  reviewed_by bigint references app_users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table petty_cash_requests enable row level security;
drop policy if exists pcr_select on petty_cash_requests;
create policy pcr_select on petty_cash_requests for select to authenticated using (true);
drop policy if exists pcr_insert on petty_cash_requests;
create policy pcr_insert on petty_cash_requests for insert to authenticated
  with check (fn_has_perm('money','create') or fn_has_perm('wages','create'));
-- status changes only through fn_approve_petty (SECURITY DEFINER) -> no direct update policy

-- approval: status + balance credit, atomically
create or replace function fn_approve_petty(p_id bigint, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; r record;
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
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'Request already ' || r.status || '.');
  end if;

  update petty_cash_requests
     set status = p_status, query_note = p_note,
         reviewed_by = u.id, reviewed_at = now()
   where id = p_id;

  if p_status = 'approved' then
    insert into petty_cash_grants (user_id, site_id, amount, note)
    values (r.requested_by, r.site_id, r.amount,
            'Petty request #' || r.id || coalesce(' — ' || r.purpose, ''));
  end if;

  return jsonb_build_object('ok', true, 'requested_by', r.requested_by,
    'amount', r.amount, 'site_id', r.site_id, 'purpose', r.purpose);
end $$;
grant execute on function fn_approve_petty(bigint, text, text) to authenticated;

-- ---------- 3. notification routing: Directors get 'petty' ----------
insert into notification_routes (request_kind, user_id)
select 'petty', u.id from app_users u where u.role = 'director' and u.is_active
on conflict do nothing;

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.tables where table_name = 'expense_bills')       as bills_table,   -- expect 1
  (select count(*) from information_schema.tables where table_name = 'petty_cash_requests') as petty_table,   -- expect 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_approve_petty')                          as approve_fn,    -- expect 1
  (select count(*) from notification_routes where request_kind = 'petty')                   as petty_routes;  -- expect >=1
