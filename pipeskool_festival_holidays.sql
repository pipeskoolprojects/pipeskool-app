-- =============================================================================
-- PIPESKOOL — update246: FESTIVAL HOLIDAYS -> PAYROLL
--
-- WHAT THIS ADDS
-- 1. Site scoping on company_holidays. NULL / empty site_ids = every site (the default,
--    and what all your existing rows become). A list pins the holiday to those sites.
-- 2. Audit columns on wage_payouts and staff_payouts so a payslip can PROVE how a
--    holiday changed the number, instead of the rule being a silent calculation.
--
-- THE RULE (Director, 27 Aug), applied only to dates marked in company_holidays:
--   absent / no punch  -> paid 1x the normal daily rate (paid holiday, no leave request)
--   present full day   -> paid 2x the normal daily rate
--   present half day   -> paid 1x the normal daily rate
--   OT on a holiday    -> unchanged, normal OT rate
--
-- WHAT IT DOES NOT TOUCH
-- No existing wage or OT logic changes. Approved and paid payout rows are still never
-- rewritten by a regenerate, so a holiday added after approval does NOT retro-apply —
-- the holiday must be in the calendar BEFORE you generate that month.
--
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. site scoping (null = all sites) ----------
alter table company_holidays
  add column if not exists site_ids bigint[];

comment on column company_holidays.site_ids is
  'NULL or empty = applies to every site. A list pins the holiday to those site ids.';

-- ---------- 2. audit columns: labour ----------
alter table wage_payouts
  add column if not exists holiday_paid_days   numeric(5,1) not null default 0,   -- absent on a holiday, paid 1x
  add column if not exists holiday_double_days numeric(5,1) not null default 0,   -- worked full, paid 2x
  add column if not exists holiday_half_days   numeric(5,1) not null default 0,   -- worked half, paid 1x
  add column if not exists holiday_amount      numeric(12,2) not null default 0;  -- rupees this rule added

-- ---------- 3. audit columns: staff ----------
alter table staff_payouts
  add column if not exists holiday_paid_days   numeric(5,1) not null default 0,
  add column if not exists holiday_double_days numeric(5,1) not null default 0,
  add column if not exists holiday_half_days   numeric(5,1) not null default 0,
  add column if not exists holiday_amount      numeric(12,2) not null default 0;

-- ---------- 4. helper: the holidays that apply to one site in one month ----------
create or replace function fn_holidays_for(p_site_id bigint, p_from date, p_to date)
returns table (on_date date, name text)
language sql stable security definer set search_path = public as $$
  select h.on_date, h.name
    from company_holidays h
   where h.on_date >= p_from and h.on_date < p_to
     and (h.site_ids is null or cardinality(h.site_ids) = 0
          or p_site_id = any (h.site_ids));
$$;

grant execute on function fn_holidays_for(bigint, date, date) to authenticated;

-- ---------- 5. standard: reload the API schema cache ----------
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from information_schema.columns
    where table_name = 'company_holidays' and column_name = 'site_ids')            as site_ids_col,      -- expect 1
  (select count(*) from information_schema.columns
    where table_name = 'wage_payouts' and column_name like 'holiday_%')            as labour_cols,       -- expect 4
  (select count(*) from information_schema.columns
    where table_name = 'staff_payouts' and column_name like 'holiday_%')           as staff_cols,        -- expect 4
  (select count(*) from pg_proc where proname = 'fn_holidays_for')                 as helper_fn,         -- expect 1
  (select count(*) from company_holidays)                                          as holidays_on_file,  -- your current count
  (select count(*) from company_holidays where site_ids is not null
     and cardinality(site_ids) > 0)                                                as site_specific,     -- expect 0 on first run
  (select count(*) from wage_payouts where status in ('approved','paid'))          as locked_labour_rows,-- untouched by this file
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity))
                                                                                   as unlocked_tables_left; -- expect 0
