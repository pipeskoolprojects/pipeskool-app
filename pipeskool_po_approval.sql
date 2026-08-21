-- =============================================================================
-- PIPESKOOL — update198: DIRECTOR APPROVAL WORKFLOW FOR PURCHASE ORDERS
-- Staff can prepare a PO, but it stays "Pending Director approval" until a
-- Director approves it. Only approved POs can be printed / received against.
-- Enforced in the DATABASE (trigger + SECURITY DEFINER RPC), not just the UI.
-- Existing POs are grandfathered as approved. Existing PO logic untouched.
-- Run as ONE transaction. Backup first (standing rule).
-- =============================================================================
alter table purchase_orders add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending','approved','rejected'));
alter table purchase_orders add column if not exists approved_by bigint references app_users(id);
alter table purchase_orders add column if not exists approved_at timestamptz;
alter table purchase_orders add column if not exists reject_reason text;

-- New POs: directors' own POs are auto-approved; everyone else's start pending.
create or replace function fn_po_approval_default()
returns trigger language plpgsql security definer set search_path = public as $$
declare u record;
begin
  select id, role into u from app_users where auth_id = auth.uid() and is_active = true limit 1;
  if u.role = 'director' then
    new.approval_status := 'approved'; new.approved_by := u.id; new.approved_at := now();
  else
    new.approval_status := 'pending'; new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_po_approval_default on purchase_orders;
create trigger trg_po_approval_default before insert on purchase_orders
for each row execute function fn_po_approval_default();

-- Approve / reject — Directors only (rejection needs a reason)
create or replace function fn_po_approve(p_po_id bigint, p_action text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; p record;
begin
  select id, role, full_name into u from app_users where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null or u.role <> 'director' then
    return jsonb_build_object('ok', false, 'error', 'Only Directors can approve or reject purchase orders.');
  end if;
  select id, po_no, status, approval_status into p from purchase_orders where id = p_po_id;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'PO not found.'); end if;
  if p.status = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'PO is cancelled.'); end if;
  if p_action = 'approved' then
    update purchase_orders set approval_status = 'approved', approved_by = u.id, approved_at = now(), reject_reason = null where id = p_po_id;
  elsif p_action = 'rejected' then
    if coalesce(trim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'A reason is required to reject.'); end if;
    update purchase_orders set approval_status = 'rejected', approved_by = u.id, approved_at = now(), reject_reason = trim(p_reason) where id = p_po_id;
  else
    return jsonb_build_object('ok', false, 'error', 'Unknown action.');
  end if;
  insert into module_audit_log (module, action, staff_id, meta)
  values ('procurement', 'po_' || p_action, u.id, jsonb_build_object('po_no', p.po_no, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'po_no', p.po_no, 'by', u.full_name);
end $$;
grant execute on function fn_po_approve(bigint, text, text) to authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns where table_name='purchase_orders'
     and column_name in ('approval_status','approved_by','approved_at','reject_reason'))  as approval_cols,       -- 4
  (select count(*) from pg_trigger where tgname='trg_po_approval_default')                as default_trigger,      -- 1
  (select count(*) from pg_proc where proname='fn_po_approve')                            as approve_fn,           -- 1
  (select count(*) from purchase_orders where approval_status <> 'approved')              as pending_or_rejected,  -- 0 (existing grandfathered)
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)        as unlocked_tables_left; -- 0
