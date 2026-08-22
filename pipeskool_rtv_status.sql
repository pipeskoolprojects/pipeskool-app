-- =============================================================================
-- PIPESKOOL — update205: VENDOR RETURN (RTV) STATUS TRACKING
-- One status per RTV reference: awaiting (default) / delayed / returned,
-- with who-changed-it + when. Additive — no existing GRN/return behavior changes.
-- Run as ONE transaction. Backup first (standing rule).
-- =============================================================================
create table if not exists rtv_status (
  ref text primary key,
  status text not null default 'awaiting' check (status in ('awaiting','delayed','returned')),
  changed_by bigint references app_users(id),
  changed_at timestamptz not null default now()
);
alter table rtv_status enable row level security;
drop policy if exists rtv_sel on rtv_status;
create policy rtv_sel on rtv_status for select using (auth.uid() is not null);
-- writes only through the RPC below (definer), so no insert/update policies needed

create or replace function fn_rtv_set_status(p_ref text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record;
begin
  select id, role, full_name into u from app_users where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'Not logged in.'); end if;
  if not (u.role in ('director','it_executive') or fn_has_perm('stock','manage')) then
    return jsonb_build_object('ok', false, 'error', 'Only Directors, IT or stock managers can change return status.');
  end if;
  if p_status not in ('awaiting','delayed','returned') then
    return jsonb_build_object('ok', false, 'error', 'Unknown status.');
  end if;
  insert into rtv_status (ref, status, changed_by, changed_at)
  values (p_ref, p_status, u.id, now())
  on conflict (ref) do update set status = excluded.status, changed_by = excluded.changed_by, changed_at = now();
  insert into module_audit_log (module, action, staff_id, meta)
  values ('stock', 'rtv_status', u.id, jsonb_build_object('ref', p_ref, 'status', p_status));
  return jsonb_build_object('ok', true, 'by', u.full_name, 'at', now());
end $$;
grant execute on function fn_rtv_set_status(text, text) to authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.tables where table_name='rtv_status')  as rtv_table,            -- 1
  (select count(*) from pg_policies where tablename='rtv_status')                  as rtv_policies,         -- 1
  (select count(*) from pg_proc where proname='fn_rtv_set_status')                 as status_fn,            -- 1
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false) as unlocked_tables_left; -- 0
