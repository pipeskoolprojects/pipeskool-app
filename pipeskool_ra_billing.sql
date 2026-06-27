-- ============================================================
-- Pipeskool — RA Billing module
-- Running Account bills: cumulative measured quantity per BOQ line,
-- "this bill" = cumulative − previous. Drives BOQ progress.
-- Two modes, selectable per project:
--   simple  -> one cumulative qty per line  (value = qty x rate)
--   split   -> Material Delivery % + Installation %  (The Creek abstract style)
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING. Safe to re-run.
-- ============================================================

-- per-project billing configuration
create table if not exists ra_settings (
  site_id      bigint primary key references sites(id),
  billing_mode text not null default 'simple',     -- 'simple' | 'split'
  material_pct numeric(5,2) not null default 70,
  install_pct  numeric(5,2) not null default 30,
  updated_at   timestamptz default now()
);

-- RA bill header
create table if not exists ra_bills (
  id           bigint generated always as identity primary key,
  site_id      bigint not null references sites(id),
  bill_no      int not null,                        -- 1,2,3 -> shown as RA-1, RA-2
  bill_date    date not null default current_date,
  period_from  date,
  period_to    date,
  status       text not null default 'draft',       -- draft | submitted | certified | paid
  billing_mode text not null default 'simple',      -- snapshot at creation time
  material_pct numeric(5,2) default 70,
  install_pct  numeric(5,2) default 30,
  remarks      text,
  created_at   timestamptz default now(),
  unique (site_id, bill_no)
);
create index if not exists idx_ra_bills_site on ra_bills(site_id);

-- RA bill line = cumulative figures per BOQ item for this bill
create table if not exists ra_bill_lines (
  id               bigint generated always as identity primary key,
  ra_bill_id       bigint not null references ra_bills(id) on delete cascade,
  boq_item_id      bigint not null references boq_items(id),
  cum_qty          numeric(16,3) default 0,   -- simple: cumulative qty done
  cum_material_qty numeric(16,3) default 0,   -- split: cumulative qty material delivered
  cum_install_qty  numeric(16,3) default 0,   -- split: cumulative qty installed
  unique (ra_bill_id, boq_item_id)
);
create index if not exists idx_ra_lines_bill on ra_bill_lines(ra_bill_id);

-- Push the LATEST bill's cumulative progress into boq_items.done_qty,
-- which feeds v_boq_progress (% complete). Installation qty is the physical
-- progress in split mode; cum_qty in simple mode.
create or replace function fn_apply_ra_progress(p_site_id bigint)
returns void language plpgsql as $$
begin
  update boq_items b set done_qty = coalesce((
    select case when rb.billing_mode = 'split' then l.cum_install_qty else l.cum_qty end
    from ra_bill_lines l
    join ra_bills rb on rb.id = l.ra_bill_id
    where l.boq_item_id = b.id and rb.site_id = p_site_id
    order by rb.bill_no desc
    limit 1
  ), 0)
  where b.site_id = p_site_id;
end $$;
