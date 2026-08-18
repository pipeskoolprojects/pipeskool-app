-- =============================================================================
-- PIPESKOOL — update185 (v2): GRN ↔ PO LINK, GRN HEADERS, CANCEL/VOID, PRIVATE CHALLAN STORAGE
--
--  1. stock_txns.po_id / po_item_id  — a GRN line can be received against a PO line.
--  2. stock_txn_type gains 'grn_reversal' (cancelled GRN = reversing lines, history kept).
--  3. grn_headers — ONE row per GRN (status open|cancelled, PO, created_by, cancel info),
--     back-filled from every existing GRN. grn_material_changes — spec substitutions.
--  4. v_stock_balance: received = grn − grn_reversal (all other columns unchanged).
--  5. v_po_item_receipt / v_po_receipt — ordered / received / pending per PO line & PO.
--  6. fn_next_grn_no(site) — sequential DB number GRN/<site>/<YYMM>/<NNN> (old numbers stay).
--  7. fn_grn_create(jsonb) — atomic GRN (header + lines + issues + changes + docs + PO
--     delivery status + audit). fn_grn_cancel(grn_no, reason) — Director / IT /
--     capability 'cancel_grn'; refuses if items already issued (balance would go negative).
--  8. Private storage bucket 'grn-docs' + policies; grn_docs.bucket column.
--  Nothing is deleted. Run in Supabase SQL Editor as ONE transaction.
--  STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. PO link on stock lines ----------
alter table stock_txns add column if not exists po_id      bigint references purchase_orders(id);
alter table stock_txns add column if not exists po_item_id bigint references po_items(id);
create index if not exists idx_stock_txns_po_item on stock_txns (po_item_id) where po_item_id is not null;
create index if not exists idx_stock_txns_grn_no  on stock_txns (grn_no)     where grn_no is not null;

-- ---------- 2. reversal txn type (compared as text below: same-transaction safe) ----------
alter type stock_txn_type add value if not exists 'grn_reversal';

-- ---------- 3. GRN headers + material changes ----------
create table if not exists grn_headers (
  grn_no         text primary key,
  site_id        bigint not null references sites(id),
  po_id          bigint references purchase_orders(id),
  vendor         text,
  challan_no     text,
  our_challan_no text,
  challan_date   date,
  note           text,
  status         text not null default 'open' check (status in ('open','cancelled')),
  created_by     bigint references app_users(id),
  created_at     timestamptz not null default now(),
  cancelled_by   bigint references app_users(id),
  cancelled_at   timestamptz,
  cancel_reason  text
);
create index if not exists idx_grn_headers_site_date on grn_headers (site_id, created_at desc);
create index if not exists idx_grn_headers_po        on grn_headers (po_id) where po_id is not null;

-- back-fill: one header per existing GRN (earliest line = creator/time; nothing invented)
insert into grn_headers (grn_no, site_id, vendor, challan_no, our_challan_no, challan_date, created_by, created_at)
select t.grn_no, min(t.site_id),
       max(coalesce(t.vendor, t.supplier)),
       max(t.challan_no), max(t.our_challan_no), max(t.challan_date),
       (array_agg(t.done_by order by t.created_at, t.id))[1],
       min(t.created_at)
  from stock_txns t
 where t.txn_type::text = 'grn' and t.grn_no is not null
 group by t.grn_no
on conflict (grn_no) do nothing;

create table if not exists grn_material_changes (
  id               bigint generated always as identity primary key,
  grn_no           text not null references grn_headers(grn_no),
  po_item_id       bigint references po_items(id),
  ordered_item_id  bigint references item_master(id),
  ordered_name     text,
  received_item_id bigint references item_master(id),
  received_name    text,
  qty              numeric(14,3),
  reason           text,
  created_by       bigint references app_users(id),
  created_at       timestamptz not null default now()
);
create index if not exists idx_grn_changes_grn on grn_material_changes (grn_no);

alter table grn_headers enable row level security;
alter table grn_material_changes enable row level security;
drop policy if exists gh_select on grn_headers;
create policy gh_select on grn_headers for select to authenticated using (true);
drop policy if exists gmc_select on grn_material_changes;
create policy gmc_select on grn_material_changes for select to authenticated using (true);
-- no insert/update/delete policies: writes happen ONLY through the SECURITY DEFINER RPCs below.

-- grn_docs: which bucket the file lives in + delete/update rights (cancel or migration)
alter table grn_docs add column if not exists bucket text not null default 'attendance-photos';
drop policy if exists gd_update on grn_docs;
create policy gd_update on grn_docs for update to authenticated using (fn_is_director()) with check (fn_is_director());
drop policy if exists gd_delete on grn_docs;
create policy gd_delete on grn_docs for delete to authenticated using (fn_is_director());

-- ---------- 4. balance view: cancelled GRNs reverse the receipt ----------
-- v2: the live view's column ORDER differs from the shipped file (42P16 on 18 Aug), so
-- drop + recreate exactly like pipeskool_balance_fix did. The app reads columns by NAME.
-- Nothing depends on this view except app queries (checked: no dependent views).
drop view if exists v_stock_balance cascade;
create view v_stock_balance as
with txn as (
  select
    t.site_id, t.item_id,
    sum(case when t.txn_type::text = 'grn'          then t.qty
             when t.txn_type::text = 'grn_reversal' then -t.qty else 0 end) as received,
    sum(case when t.txn_type::text = 'issue'         then t.qty else 0 end) as issued,
    sum(case when t.txn_type::text = 'return_store'  then t.qty else 0 end) as returned,
    sum(case when t.txn_type::text = 'return_vendor' then t.qty else 0 end) as returned_vendor,
    max(t.created_at) as last_txn,
    max(t.rate) filter (where t.txn_type::text = 'grn') as rate
  from stock_txns t
  group by t.site_id, t.item_id
),
cons as (
  select site_id, item_id, sum(qty) as consumed, max(created_at) as last_cons
  from stock_consumption group by site_id, item_id
)
select
  im.id as item_id, im.display_name, im.item_type, im.unit, coalesce(im.min_stock,0) as min_stock,
  s.id as site_id, s.code as site_code, s.name as site_name,
  coalesce(t.received,0)         as received,
  coalesce(t.issued,0)           as issued,
  coalesce(t.returned,0)         as returned,
  coalesce(t.returned_vendor,0)  as returned_vendor,
  coalesce(c.consumed,0)         as consumed,
  (coalesce(t.received,0) + coalesce(t.returned,0)
     - coalesce(t.issued,0) - coalesce(t.returned_vendor,0)) as balance,
  (coalesce(t.issued,0) - coalesce(c.consumed,0) - coalesce(t.returned,0)) as with_site,
  coalesce(t.rate, im.last_rate, 0) as rate,
  (coalesce(t.received,0) + coalesce(t.returned,0)
     - coalesce(t.issued,0) - coalesce(t.returned_vendor,0))
     * coalesce(t.rate, im.last_rate, 0) as value,
  greatest(coalesce(t.last_txn, '1970-01-01'), coalesce(c.last_cons, '1970-01-01')) as last_activity
from item_master im
cross join sites s
left join txn t on t.item_id = im.id and t.site_id = s.id
left join cons c on c.item_id = im.id and c.site_id = s.id
where coalesce(t.received,0) + coalesce(t.issued,0) + coalesce(t.returned,0)
    + coalesce(t.returned_vendor,0) + coalesce(c.consumed,0) > 0;

-- ---------- 5. PO receipt views ----------
create or replace view v_po_item_receipt as
select pi.id as po_item_id, pi.po_id, pi.item_id, pi.item_name, pi.unit, pi.qty as ordered_qty, pi.rate,
       coalesce(r.received, 0) as received_qty,
       greatest(pi.qty - coalesce(r.received, 0), 0) as pending_qty,
       coalesce(r.grn_count, 0) as grn_count, r.last_grn_at
  from po_items pi
  left join (
    select po_item_id,
           sum(case when txn_type::text = 'grn' then qty when txn_type::text = 'grn_reversal' then -qty else 0 end) as received,
           count(distinct grn_no) filter (where txn_type::text = 'grn') as grn_count,
           max(created_at) as last_grn_at
      from stock_txns where po_item_id is not null group by po_item_id
  ) r on r.po_item_id = pi.id;

create or replace view v_po_receipt as
select po.id as po_id, po.po_no,
       sum(v.ordered_qty) as ordered_qty, sum(v.received_qty) as received_qty, sum(v.pending_qty) as pending_qty,
       count(*) as item_count, count(*) filter (where v.pending_qty <= 0) as items_complete,
       max(v.last_grn_at) as last_grn_at
  from purchase_orders po join v_po_item_receipt v on v.po_id = po.id
 group by po.id, po.po_no;

grant select on v_po_item_receipt, v_po_receipt to authenticated;

-- ---------- 6. sequential GRN number ----------
create or replace function fn_next_grn_no(p_site_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare prefix text; n int;
begin
  perform pg_advisory_xact_lock(hashtext('grn_no_' || p_site_id));
  prefix := 'GRN/' || p_site_id || '/' || to_char(now(), 'YYMM') || '/';
  select count(*) + 1 into n from grn_headers where grn_no like prefix || '%';
  return prefix || lpad(n::text, 3, '0');
end $$;

-- ---------- helper: recompute PO delivery status from receipts ----------
create or replace function fn_po_sync_delivery(p_po_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_po_id is null then return; end if;
  select * into r from v_po_receipt where po_id = p_po_id;
  if r.po_id is null then return; end if;
  if r.pending_qty <= 0 and r.received_qty > 0 then
    update purchase_orders set delivery_status = 'delivered', status = case when status = 'cancelled' then status else 'delivered' end,
           delivery_updated_at = now() where id = p_po_id;
  elsif r.received_qty > 0 then
    update purchase_orders set delivery_status = 'partial', status = case when status in ('cancelled') then status else 'issued' end,
           delivery_updated_at = now() where id = p_po_id;
  else
    -- nothing received (e.g. after cancel): back to awaiting, unless site set a manual state
    update purchase_orders set delivery_status = case when delivery_status in ('delivered','partial') then 'pending' else delivery_status end,
           status = case when status = 'delivered' then 'issued' else status end,
           delivery_updated_at = now() where id = p_po_id;
  end if;
end $$;

-- ---------- 7a. create GRN atomically ----------
-- p = { site_id, po_id?, vendor, challan_no?, our_challan_no?, challan_date?, note?,
--       lines: [{ item_id, item_name, unit, challan_qty, received_qty, po_item_id?,
--                 change?: { received_item_id, received_name, reason } }],
--       docs:  [{ kind: 'supplier'|'company', path, bucket }] }
create or replace function fn_grn_create(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u record; v_grn text; ln jsonb; d jsonb;
  v_item bigint; v_recv numeric; v_chal numeric; v_short numeric; v_rate numeric;
  v_po bigint; v_poi bigint; v_issues int := 0; v_over int := 0; v_changes int := 0; v_ordered numeric; v_prev numeric;
  v_line_count int := 0;
begin
  select id, role into u from app_users where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.'); end if;
  if not (fn_has_perm('stock','create') or fn_has_perm('stock','manage')) then
    return jsonb_build_object('ok', false, 'error', 'You do not have GRN rights for this site.');
  end if;
  if (p->>'site_id') is null then return jsonb_build_object('ok', false, 'error', 'Site missing.'); end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then return jsonb_build_object('ok', false, 'error', 'Add at least one item line.'); end if;

  v_po := nullif(p->>'po_id', '')::bigint;
  if v_po is not null and not exists (select 1 from purchase_orders where id = v_po and status <> 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'That PO is cancelled or does not exist.');
  end if;

  v_grn := fn_next_grn_no((p->>'site_id')::bigint);
  insert into grn_headers (grn_no, site_id, po_id, vendor, challan_no, our_challan_no, challan_date, note, created_by)
  values (v_grn, (p->>'site_id')::bigint, v_po, nullif(p->>'vendor',''), nullif(p->>'challan_no',''),
          nullif(p->>'our_challan_no',''), nullif(p->>'challan_date','')::date, nullif(p->>'note',''), u.id);

  for ln in select * from jsonb_array_elements(p->'lines') loop
    v_recv := coalesce(nullif(ln->>'received_qty','')::numeric, nullif(ln->>'challan_qty','')::numeric, 0);
    v_chal := coalesce(nullif(ln->>'challan_qty','')::numeric, v_recv);
    if v_recv <= 0 then continue; end if;
    v_poi := nullif(ln->>'po_item_id','')::bigint;
    -- material change: stock lands on the item ACTUALLY received
    if ln->'change' is not null and (ln->'change'->>'received_item_id') is not null then
      v_item := (ln->'change'->>'received_item_id')::bigint;
    else
      v_item := nullif(ln->>'item_id','')::bigint;
    end if;
    if v_item is null then continue; end if;
    v_short := v_chal - v_recv;

    -- valuation: PO net rate when receiving against a PO, else item's last known rate
    v_rate := null;
    if v_poi is not null then select rate into v_rate from po_items where id = v_poi and po_id = v_po; end if;
    if v_rate is null then select last_rate into v_rate from item_master where id = v_item; end if;
    v_rate := coalesce(v_rate, 0);

    insert into stock_txns (site_id, item_id, txn_type, qty, rate, supplier, vendor, challan_no, challan_date,
                            grn_ref, grn_no, our_challan_no, challan_qty, short_qty, done_by, po_id, po_item_id, note)
    values ((p->>'site_id')::bigint, v_item, 'grn', v_recv, v_rate, nullif(p->>'vendor',''), nullif(p->>'vendor',''),
            nullif(p->>'challan_no',''), nullif(p->>'challan_date','')::date,
            v_grn, v_grn, nullif(p->>'our_challan_no',''), v_chal, v_short, u.id, v_po, v_poi, nullif(p->>'note',''));
    v_line_count := v_line_count + 1;

    if v_short <> 0 then
      insert into grn_issues (grn_no, site_id, item_id, item_name, challan_qty, received_qty, issue_note, raised_by)
      values (v_grn, (p->>'site_id')::bigint, v_item, ln->>'item_name', v_chal, v_recv, 'Short/excess by ' || v_short, u.id);
      v_issues := v_issues + 1;
    end if;

    if v_poi is not null then
      select ordered_qty, received_qty into v_ordered, v_prev from v_po_item_receipt where po_item_id = v_poi;
      if v_prev > v_ordered then v_over := v_over + 1; end if;
    end if;

    if ln->'change' is not null and (ln->'change'->>'received_item_id') is not null then
      insert into grn_material_changes (grn_no, po_item_id, ordered_item_id, ordered_name, received_item_id, received_name, qty, reason, created_by)
      values (v_grn, v_poi, nullif(ln->>'item_id','')::bigint, ln->>'item_name', v_item, ln->'change'->>'received_name', v_recv,
              nullif(ln->'change'->>'reason',''), u.id);
      v_changes := v_changes + 1;
    end if;
  end loop;

  if v_line_count = 0 then raise exception 'No valid item lines (received qty must be > 0).'; end if;

  for d in select * from jsonb_array_elements(coalesce(p->'docs', '[]'::jsonb)) loop
    insert into grn_docs (grn_ref, site_id, kind, path, bucket, uploaded_by)
    values (v_grn, (p->>'site_id')::bigint, d->>'kind', d->>'path', coalesce(nullif(d->>'bucket',''), 'attendance-photos'), u.id);
  end loop;

  perform fn_po_sync_delivery(v_po);

  insert into module_audit_log (module, action, staff_id, meta)
  values ('grn', 'created', u.id, jsonb_build_object('grn_no', v_grn, 'site_id', p->>'site_id', 'po_id', v_po,
          'lines', v_line_count, 'issues', v_issues, 'changes', v_changes, 'docs', jsonb_array_length(coalesce(p->'docs','[]'::jsonb))));

  return jsonb_build_object('ok', true, 'grn_no', v_grn, 'lines', v_line_count, 'discrepancies', v_issues,
                            'over_receipt', v_over, 'changes', v_changes);
end $$;
grant execute on function fn_grn_create(jsonb) to authenticated;

-- ---------- 7b. cancel / void GRN ----------
create or replace function fn_grn_cancel(p_grn_no text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; h record; ln record; v_bal numeric; v_blocked text := ''; v_n int := 0;
begin
  select id, role into u from app_users where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.'); end if;
  if not (fn_is_director() or u.role = 'it_executive' or fn_has_admin('cancel_grn')) then
    return jsonb_build_object('ok', false, 'error', 'Only Directors, IT or staff with the Cancel-GRN right can cancel a GRN.');
  end if;
  if coalesce(trim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'A reason is mandatory.'); end if;
  select * into h from grn_headers where grn_no = p_grn_no;
  if h.grn_no is null then return jsonb_build_object('ok', false, 'error', 'GRN not found in headers (run the back-fill?).'); end if;
  if h.status = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'Already cancelled.'); end if;

  -- refuse if reversing would make any item negative (material already issued / returned)
  for ln in select item_id, sum(qty) as qty from stock_txns
             where grn_no = p_grn_no and txn_type::text = 'grn' group by item_id loop
    select coalesce(balance, 0) into v_bal from v_stock_balance where site_id = h.site_id and item_id = ln.item_id;
    if coalesce(v_bal, 0) - ln.qty < 0 then
      v_blocked := v_blocked || (select display_name from item_master where id = ln.item_id) || ' (store ' || coalesce(v_bal,0) || ' < ' || ln.qty || '), ';
    end if;
  end loop;
  if v_blocked <> '' then
    return jsonb_build_object('ok', false, 'error', 'Cannot cancel — material already issued: ' || rtrim(v_blocked, ', ') || '. Record the return / correction first.');
  end if;

  insert into stock_txns (site_id, item_id, txn_type, qty, rate, supplier, vendor, grn_ref, po_id, po_item_id, done_by, note)
  select site_id, item_id, 'grn_reversal', qty, rate, supplier, vendor, grn_no, po_id, po_item_id, u.id,
         'Cancelled GRN ' || p_grn_no || ': ' || p_reason
    from stock_txns where grn_no = p_grn_no and txn_type::text = 'grn';
  get diagnostics v_n = row_count;

  update grn_headers set status = 'cancelled', cancelled_by = u.id, cancelled_at = now(), cancel_reason = p_reason
   where grn_no = p_grn_no;
  update grn_issues set status = 'closed' where grn_no = p_grn_no and status = 'open';
  perform fn_po_sync_delivery(h.po_id);

  insert into module_audit_log (module, action, staff_id, meta)
  values ('grn', 'cancelled', u.id, jsonb_build_object('grn_no', p_grn_no, 'reason', p_reason, 'reversed_lines', v_n));
  return jsonb_build_object('ok', true, 'reversed_lines', v_n);
end $$;
grant execute on function fn_grn_cancel(text, text) to authenticated;

-- ---------- 8. private storage bucket for challan pages ----------
do $$
begin
  insert into storage.buckets (id, name, public) values ('grn-docs', 'grn-docs', false) on conflict (id) do nothing;
exception when others then raise notice 'grn-docs bucket not created (%). App falls back to the public bucket.', sqlerrm;
end $$;
do $$
begin
  drop policy if exists "grn_docs_read"   on storage.objects;
  drop policy if exists "grn_docs_write"  on storage.objects;
  drop policy if exists "grn_docs_delete" on storage.objects;
  create policy "grn_docs_read"  on storage.objects for select to authenticated
    using (bucket_id = 'grn-docs' and (fn_has_perm('stock','view') or fn_has_perm('stock','create') or fn_has_perm('stock','manage')));
  create policy "grn_docs_write" on storage.objects for insert to authenticated
    with check (bucket_id = 'grn-docs' and (fn_has_perm('stock','create') or fn_has_perm('stock','manage')));
  create policy "grn_docs_delete" on storage.objects for delete to authenticated
    using (bucket_id = 'grn-docs' and fn_is_director());
exception when others then raise notice 'storage policies not applied (%).', sqlerrm;
end $$;

-- standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.columns where table_name='stock_txns' and column_name in ('po_id','po_item_id')) as txn_po_cols,      -- expect 2
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='stock_txn_type' and e.enumlabel='grn_reversal') as reversal_enum, -- 1
  (select count(*) from grn_headers)                                                                             as headers_total,
  (select count(distinct grn_no) from stock_txns where txn_type::text='grn' and grn_no is not null)              as grn_groups,        -- must EQUAL headers_total
  (select count(*) from information_schema.tables where table_name in ('grn_material_changes'))                  as changes_table,     -- 1
  (select count(*) from information_schema.columns where table_name='grn_docs' and column_name='bucket')         as docs_bucket_col,   -- 1
  (select count(*) from information_schema.views where table_name in ('v_po_item_receipt','v_po_receipt'))       as po_views,          -- 2
  (select count(*) from pg_proc where proname in ('fn_next_grn_no','fn_grn_create','fn_grn_cancel','fn_po_sync_delivery')) as functions, -- 4
  (select count(*) from storage.buckets where id='grn-docs')                                                     as private_bucket,    -- 1 (0 = fallback to public)
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)                               as unlocked_tables_left; -- 0
