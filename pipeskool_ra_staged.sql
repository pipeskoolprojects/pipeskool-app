-- ============================================================
-- Pipeskool — RA BILLING: STAGED PER-ITEM PAYMENT TERMS (Option B)
-- Real work orders (e.g. SOUL) pay different item groups differently:
-- e.g. 60% Supply / 30% Installation / 10% Testing&Commissioning for some
-- item ranges, 90/10 for others. This adds payment groups assigned per
-- BOQ item, three-stage cumulative quantities per bill line (with the
-- %s snapshotted on each line so old bills never change), and a GST %
-- for the bill abstract.
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING update80. Safe to re-run.
-- ============================================================

create table if not exists ra_payment_groups (
  id          bigint generated always as identity primary key,
  site_id     bigint not null references sites(id),
  name        text not null,
  supply_pct  numeric(5,2) not null default 0,
  install_pct numeric(5,2) not null default 0,
  tc_pct      numeric(5,2) not null default 0
);

alter table boq_items add column if not exists payment_group_id bigint references ra_payment_groups(id) on delete set null;

alter table ra_bill_lines add column if not exists cum_tc_qty numeric(14,3) not null default 0;
alter table ra_bill_lines add column if not exists sup_pct numeric(5,2);
alter table ra_bill_lines add column if not exists ins_pct numeric(5,2);
alter table ra_bill_lines add column if not exists tc_pct  numeric(5,2);

alter table ra_settings add column if not exists gst_pct numeric(5,2) not null default 18;

-- allow the new mode value
alter table ra_settings drop constraint if exists ra_settings_billing_mode_check;
alter table ra_settings add constraint ra_settings_billing_mode_check check (billing_mode in ('simple','split','staged'));
alter table ra_bills drop constraint if exists ra_bills_billing_mode_check;
alter table ra_bills add constraint ra_bills_billing_mode_check check (billing_mode in ('simple','split','staged'));

-- progress: simple -> cum_qty; split/staged -> installation qty (physical work)
create or replace function fn_apply_ra_progress(p_site_id bigint) returns void
language plpgsql security definer as $$
begin
  update boq_items b set done_qty = coalesce(x.done, 0)
  from (
    select l.boq_item_id,
           case when bl.billing_mode = 'simple' then l.cum_qty else l.cum_install_qty end as done
    from ra_bill_lines l
    join ra_bills bl on bl.id = l.ra_bill_id
    where bl.site_id = p_site_id
      and bl.bill_no = (select max(b2.bill_no) from ra_bills b2 where b2.site_id = p_site_id)
  ) x
  where b.id = x.boq_item_id and b.site_id = p_site_id;
end $$;

-- RLS (if already enabled): staff-only access on the new table
do $$ begin
  if exists (select 1 from pg_tables where tablename = 'ra_payment_groups') then
    begin
      alter table ra_payment_groups enable row level security;
      drop policy if exists staff_all on ra_payment_groups;
      create policy staff_all on ra_payment_groups for all to authenticated using (fn_is_staff()) with check (fn_is_staff());
    exception when undefined_function then
      alter table ra_payment_groups disable row level security;  -- fn_is_staff not created yet (RLS phase pending)
    end;
  end if;
end $$;
