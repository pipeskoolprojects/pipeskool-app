-- =============================================================================
-- PIPESKOOL — update167: PETTY CASH RETURNS + SETTLED + ledger view
-- Director's decisions (8 Aug): 1b approved-only deduction (ALREADY live —
-- the balance view filters status='approved'); 2b two-step returns (holder
-- records on mobile -> Director/Accountant confirms receipt on web); 3a
-- ADVANCE SETTLED automatically when balance reaches zero.
--
-- 1. petty_cash_returns: holder-initiated, pending until confirmed. Only
--    CONFIRMED returns reduce the balance. Status changes only via the
--    SECURITY DEFINER confirm function.
-- 2. v_petty_cash_balance v2: granted - spent(approved) - returned(confirmed),
--    plus 'returned' and 'settled' columns for the cards and ledger.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. returns ----------
create table if not exists petty_cash_returns (
  id bigserial primary key,
  user_id  bigint not null references app_users(id),
  site_id  bigint not null references sites(id),
  amount   numeric(12,2) not null check (amount > 0),
  note     text,
  status   text not null default 'pending',   -- pending | confirmed | cancelled
  created_at   timestamptz not null default now(),
  confirmed_by bigint references app_users(id),
  confirmed_at timestamptz
);

alter table petty_cash_returns enable row level security;
drop policy if exists pret_select on petty_cash_returns;
create policy pret_select on petty_cash_returns for select to authenticated
  using (fn_is_director() or fn_has_admin('view_all_money') or fn_site_allowed(site_id)
         or user_id = fn_current_staff_id());
drop policy if exists pret_insert on petty_cash_returns;
create policy pret_insert on petty_cash_returns for insert to authenticated
  with check (user_id = fn_current_staff_id() and fn_site_allowed(site_id));
-- no update/delete policies: status changes ONLY via fn_confirm_petty_return

create or replace function fn_confirm_petty_return(p_id bigint, p_action text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; r record;
begin
  select id, role into u from app_users where auth_id = auth.uid() and is_active limit 1;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.'); end if;
  if not (u.role = 'director'
          or fn_has_perm('money','approve') or fn_has_perm('money','manage')
          or fn_has_perm('wages','approve') or fn_has_perm('wages','manage')) then
    return jsonb_build_object('ok', false, 'error', 'You are not authorised to confirm cash returns.');
  end if;
  if p_action not in ('confirmed','cancelled') then
    return jsonb_build_object('ok', false, 'error', 'Invalid action.');
  end if;
  select * into r from petty_cash_returns where id = p_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'Return not found.'); end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'Return already ' || r.status || '.');
  end if;
  update petty_cash_returns
     set status = p_action, note = coalesce(p_note, note),
         confirmed_by = u.id, confirmed_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'user_id', r.user_id, 'site_id', r.site_id, 'amount', r.amount);
end $$;
grant execute on function fn_confirm_petty_return(bigint, text, text) to authenticated;

-- ---------- 2. balance view v2 (adds returned + settled) ----------
drop view if exists v_petty_cash_balance;
create view v_petty_cash_balance as
select
  u.id as user_id, u.full_name, s.id as site_id, s.name as site_name,
  coalesce(g.granted, 0)  as granted,
  coalesce(e.spent, 0)    as spent_from_petty,
  coalesce(r.returned, 0) as returned,
  coalesce(g.granted, 0) - coalesce(e.spent, 0) - coalesce(r.returned, 0) as balance,
  (coalesce(g.granted, 0) > 0
   and coalesce(g.granted, 0) - coalesce(e.spent, 0) - coalesce(r.returned, 0) = 0) as settled
from app_users u
cross join sites s
left join (select user_id, site_id, sum(amount) granted from petty_cash_grants group by 1,2) g
  on g.user_id = u.id and g.site_id = s.id
left join (select claimant_user_id, site_id, sum(amount) spent
           from expenses where funding_source = 'petty_cash' and status = 'approved' group by 1,2) e
  on e.claimant_user_id = u.id and e.site_id = s.id
left join (select user_id, site_id, sum(amount) returned
           from petty_cash_returns where status = 'confirmed' group by 1,2) r
  on r.user_id = u.id and r.site_id = s.id
where coalesce(g.granted, 0) <> 0 or coalesce(e.spent, 0) <> 0 or coalesce(r.returned, 0) <> 0;

-- ---------- standard: reload the API schema cache ----------
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.tables where table_name = 'petty_cash_returns')  as returns_table,  -- expect 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_confirm_petty_return')                   as confirm_fn,     -- expect 1
  (select count(*) from information_schema.columns
    where table_name = 'v_petty_cash_balance' and column_name in ('returned','settled'))    as view_columns;   -- expect 2
