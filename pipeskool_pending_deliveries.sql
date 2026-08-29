-- =============================================================================
-- PIPESKOOL — update256: PENDING DELIVERY TRACKING
--
-- BUILT ON WHAT ALREADY EXISTS — NOTHING IS DUPLICATED
-- v_po_item_receipt (update~184, GRN/PO link) already derives ordered / received / pending
-- per PO line from stock_txns, and already nets off grn_reversal rows. This file does NOT
-- recompute any of that. It adds only what was missing:
--   1. short-close columns on po_items (close a shortfall permanently, with a reason)
--   2. po_item_followups — a note trail for chasing a vendor
--   3. v_po_item_pending — the register view: the receipt figures plus vendor, site, aging,
--      excess detection and a single status per line
--
-- Because pending is DERIVED, recording a GRN or Delivery Challan updates it automatically.
-- There is no manual entry and no second copy of the quantity anywhere.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. short-close: never delete a shortfall, close it with a reason ----------
alter table po_items
  add column if not exists short_closed     boolean not null default false,
  add column if not exists short_close_note text,
  add column if not exists short_closed_by  bigint references app_users(id),
  add column if not exists short_closed_at  timestamptz;

-- ---------- 2. follow-up trail ----------
create table if not exists po_item_followups (
  id          bigint generated always as identity primary key,
  po_item_id  bigint not null references po_items(id) on delete cascade,
  po_id       bigint not null references purchase_orders(id) on delete cascade,
  note        text   not null,
  promised_by date,
  created_by  bigint references app_users(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_po_followups_item on po_item_followups(po_item_id, created_at desc);

alter table po_item_followups enable row level security;

drop policy if exists pif_select on po_item_followups;
create policy pif_select on po_item_followups for select to authenticated
  using (fn_is_director() or fn_has_perm('indent','view') or fn_has_perm('indent','create')
         or fn_has_perm('indent','manage') or fn_has_perm('indent','approve'));

drop policy if exists pif_insert on po_item_followups;
create policy pif_insert on po_item_followups for insert to authenticated
  with check (fn_is_director() or fn_has_perm('indent','create') or fn_has_perm('indent','manage'));

-- ---------- 3. short-close is a decision, so it goes through a checked function ----------
create or replace function fn_short_close_po_item(p_po_item_id bigint, p_note text, p_undo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; it record;
begin
  select id, role, full_name into u from app_users where auth_id = auth.uid() and is_active limit 1;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.'); end if;
  if not (u.role = 'director' or fn_has_perm('indent','manage') or fn_has_perm('indent','approve')) then
    return jsonb_build_object('ok', false, 'error', 'Only a Director or an Indent manager can short-close a delivery.');
  end if;

  select id, item_name, short_closed into it from po_items where id = p_po_item_id for update;
  if it.id is null then return jsonb_build_object('ok', false, 'error', 'PO line not found.'); end if;

  if p_undo then
    update po_items set short_closed = false, short_close_note = null,
           short_closed_by = null, short_closed_at = null where id = p_po_item_id;
    return jsonb_build_object('ok', true, 'action', 'reopened', 'item', it.item_name);
  end if;

  if coalesce(btrim(p_note), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'A reason is required to short-close a line.');
  end if;

  update po_items set short_closed = true, short_close_note = p_note,
         short_closed_by = u.id, short_closed_at = now() where id = p_po_item_id;
  return jsonb_build_object('ok', true, 'action', 'short_closed', 'item', it.item_name, 'by', u.full_name);
end $$;

grant execute on function fn_short_close_po_item(bigint, text, boolean) to authenticated;

-- ---------- 4. the register view ----------
-- Reads v_po_item_receipt for the quantities; adds vendor, site, aging, excess and status.
create or replace view v_po_item_pending as
select
  r.po_item_id, r.po_id, po.po_no, po.vendor_name, po.site_id, s.name as site_name,
  po.created_at as po_date, po.approval_status, po.status as po_status,
  r.item_name, r.unit, r.ordered_qty, r.received_qty, r.rate,
  -- over-delivery is reported as excess, never as a negative pending number
  greatest(r.ordered_qty - r.received_qty, 0)                       as pending_qty,
  greatest(r.received_qty - r.ordered_qty, 0)                       as excess_qty,
  round(case when r.ordered_qty > 0
             then least(r.received_qty / r.ordered_qty * 100, 100) else 0 end)::int as pct_received,
  greatest(r.ordered_qty - r.received_qty, 0) * coalesce(r.rate, 0) as pending_value,
  r.grn_count, r.last_grn_at,
  -- aging runs from the last delivery if there was one, otherwise from the PO date
  greatest(0, (current_date - coalesce(r.last_grn_at, po.created_at)::date)) as days_pending,
  pi.short_closed, pi.short_close_note, pi.short_closed_at,
  sc.full_name as short_closed_by_name,
  case
    when pi.short_closed                          then 'short_closed'
    when r.received_qty > r.ordered_qty           then 'excess'
    when r.received_qty >= r.ordered_qty          then 'received'
    when r.received_qty > 0                       then 'partial'
    else 'pending'
  end as line_status
from v_po_item_receipt r
join po_items pi          on pi.id = r.po_item_id
join purchase_orders po   on po.id = r.po_id
left join sites s         on s.id = po.site_id
left join app_users sc    on sc.id = pi.short_closed_by
where po.status <> 'cancelled';

grant select on v_po_item_pending to authenticated;

notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.columns
     where table_name = 'po_items' and column_name like 'short_close%')          as short_close_cols,   -- expect 3
  (select count(*) from information_schema.tables
     where table_name = 'po_item_followups')                                     as followups_table,    -- expect 1
  (select count(*) from pg_proc where proname = 'fn_short_close_po_item')        as close_fn,           -- expect 1
  (select count(*) from information_schema.views
     where table_name = 'v_po_item_pending')                                     as register_view,      -- expect 1
  (select count(*) from v_po_item_pending where line_status in ('pending','partial')) as open_lines,     -- your live count
  (select count(*) from v_po_item_pending where line_status = 'excess')          as excess_lines,       -- over-delivered
  (select count(*) from po_items)                                                as po_items_untouched, -- unchanged
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity))
                                                                                 as unlocked_tables_left; -- expect 0
