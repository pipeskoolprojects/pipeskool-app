-- =============================================================================
-- PIPESKOOL — update260: BOQ AMENDMENTS + EXTRA ITEMS + BASIC RATE DIFFERENCE
--                        + RATE FREEZE ON RA BILLS   (SOUL pilot)
--
-- Four things, all decided with the Director on 29 Aug:
--   1. RATE FREEZE. ra_bill_lines never stored the rate — every bill recomputed
--      from boq_items.rate LIVE, so amending a rate would silently rewrite
--      already-submitted bills. Each line now snapshots its rate; existing
--      lines are backfilled with today's BOQ rate (freezing history as billed).
--   2. BOQ AMENDMENTS. Qty / rate / basic-rate changes go through
--      fn_amend_boq(), which logs old -> new with a mandatory reason.
--      Old bills stay frozen (point 1); the new figures apply from the
--      NEXT bill only.
--   3. EXTRA (NON-TENDER) ITEMS. boq_items.is_extra + approval status.
--   4. BASIC RATE DIFFERENCE. basic_rate lives on the BOQ line (from tender);
--      purchase_rate is snapshotted per bill line (auto-suggested from the
--      latest approved PO via v_item_latest_po_rate, Director confirms).
--      Deduction = (basic - purchase) x THIS bill's INSTALLED qty, per the
--      Director's decision matching SOUL RA-3 (1,893 x 137 = 2,59,341).
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. BOQ line: extra-item flag, tender basic rate, item link ----------
alter table boq_items
  add column if not exists is_extra     boolean not null default false,
  add column if not exists extra_status text check (extra_status in ('pending','approved')),
  add column if not exists basic_rate   numeric(14,2),
  add column if not exists item_id      bigint references item_master(id);

-- ---------- 2. rate + basic-diff snapshots on every bill line ----------
alter table ra_bill_lines
  add column if not exists rate          numeric(14,2),
  add column if not exists basic_rate    numeric(14,2),
  add column if not exists purchase_rate numeric(14,2);

-- freeze existing history exactly as it stands today
update ra_bill_lines l set rate = b.rate
  from boq_items b where b.id = l.boq_item_id and l.rate is null;

-- ---------- 3. amendment log ----------
create table if not exists boq_amendments (
  id           bigint generated always as identity primary key,
  boq_item_id  bigint not null references boq_items(id) on delete cascade,
  site_id      bigint not null references sites(id),
  field        text   not null check (field in ('boq_qty','rate','basic_rate')),
  old_value    numeric(16,3),
  new_value    numeric(16,3),
  reason       text   not null,
  amended_by   bigint references app_users(id),
  amended_at   timestamptz not null default now()
);
create index if not exists idx_boq_amend_item on boq_amendments(boq_item_id, amended_at desc);
create index if not exists idx_boq_amend_site on boq_amendments(site_id, amended_at desc);

alter table boq_amendments enable row level security;
drop policy if exists ba_select on boq_amendments;
create policy ba_select on boq_amendments for select to authenticated using (true);
-- no insert/update/delete policies: writes happen ONLY through fn_amend_boq below

-- ---------- 4. the amendment function (Director or billing-manage only) ----------
create or replace function fn_amend_boq(
  p_boq_id bigint, p_qty numeric, p_rate numeric, p_basic_rate numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; b record; changed text[] := '{}';
begin
  select id, role, full_name into u from app_users
    where auth_id = auth.uid() and is_active limit 1;
  if u.id is null then
    return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.');
  end if;
  if not (u.role = 'director' or fn_has_perm('billing','manage')) then
    return jsonb_build_object('ok', false, 'error', 'Only a Director or a Billing manager can amend the BOQ.');
  end if;
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'A reason is required for every BOQ amendment.');
  end if;

  select * into b from boq_items where id = p_boq_id;
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'BOQ line not found.'); end if;

  if p_qty is not null and p_qty is distinct from b.boq_qty then
    insert into boq_amendments (boq_item_id, site_id, field, old_value, new_value, reason, amended_by)
      values (b.id, b.site_id, 'boq_qty', b.boq_qty, p_qty, trim(p_reason), u.id);
    changed := changed || 'boq_qty';
  end if;
  if p_rate is not null and p_rate is distinct from b.rate then
    insert into boq_amendments (boq_item_id, site_id, field, old_value, new_value, reason, amended_by)
      values (b.id, b.site_id, 'rate', b.rate, p_rate, trim(p_reason), u.id);
    changed := changed || 'rate';
  end if;
  if p_basic_rate is not null and p_basic_rate is distinct from b.basic_rate then
    insert into boq_amendments (boq_item_id, site_id, field, old_value, new_value, reason, amended_by)
      values (b.id, b.site_id, 'basic_rate', b.basic_rate, p_basic_rate, trim(p_reason), u.id);
    changed := changed || 'basic_rate';
  end if;

  if array_length(changed, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'Nothing changed — the values entered are the same as the current ones.');
  end if;

  update boq_items set
    boq_qty    = coalesce(p_qty, boq_qty),
    rate       = coalesce(p_rate, rate),
    basic_rate = coalesce(p_basic_rate, basic_rate)
  where id = p_boq_id;

  return jsonb_build_object('ok', true, 'changed', changed);
end $$;
grant execute on function fn_amend_boq(bigint, numeric, numeric, numeric, text) to authenticated;

-- ---------- 5. latest approved purchase rate per (site, item) ----------
create or replace view v_item_latest_po_rate as
select distinct on (po.site_id, pi.item_id)
  po.site_id, pi.item_id, pi.rate as purchase_rate, po.po_no, po.po_date
from po_items pi
join purchase_orders po on po.id = pi.po_id
where po.status <> 'cancelled'
  and coalesce(po.approval_status, 'approved') = 'approved'
order by po.site_id, pi.item_id, po.po_date desc, pi.id desc;

-- ---------- 6. progress view rebuilt with the new columns ----------
-- (drop first: CREATE OR REPLACE cannot insert a column mid-list)
drop view if exists v_boq_progress;
create view v_boq_progress as
select b.id, b.site_id, s.name as site_name, s.code as site_code,
  b.item_code, b.description, b.short_name, b.unit, b.section,
  b.boq_qty, b.rate, b.done_qty,
  b.is_extra, b.extra_status, b.basic_rate, b.item_id,
  case when b.boq_qty > 0 then round(b.done_qty / b.boq_qty * 100, 1) else 0 end as pct
from boq_items b join sites s on s.id = b.site_id
where b.is_active;

notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.columns where table_name = 'boq_items'
     and column_name in ('is_extra','extra_status','basic_rate','item_id'))        as boq_cols,        -- expect 4
  (select count(*) from information_schema.columns where table_name = 'ra_bill_lines'
     and column_name in ('rate','basic_rate','purchase_rate'))                     as line_cols,       -- expect 3
  (select count(*) from ra_bill_lines where rate is null)                          as lines_unfrozen,  -- expect 0
  (select count(*) from pg_proc where proname = 'fn_amend_boq')                    as amend_fn,        -- expect 1
  (select count(*) from information_schema.views
     where table_name in ('v_item_latest_po_rate','v_boq_progress'))               as views_ok,        -- expect 2
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity))
                                                                                   as unlocked_left;   -- expect 0
