-- =============================================================================
-- PIPESKOOL — update223: Delivery Challan numbering per company Tally series.
-- New challans number PSP/2026-27/<n>, continuing after the highest existing
-- number in that series and never below 201 (Tally is already at 201).
-- Existing challan numbers are NOT changed. Backup first. Run ONCE.
-- =============================================================================
create or replace function fn_next_dc_no(p_site_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('dc_no'), 0);   -- one company-wide series
  select greatest(coalesce(max(nullif(regexp_replace(substring(dc_ref from 13), '\D', '', 'g'), '')::int), 0), 200) + 1
    into n from delivery_challans where dc_ref like 'PSP/2026-27/%';
  return 'PSP/2026-27/' || n;
end $$;
grant execute on function fn_next_dc_no(bigint) to authenticated;

notify pgrst, 'reload schema';

select
  (select fn_next_dc_no(0) = 'PSP/2026-27/201'
     or exists (select 1 from delivery_challans where dc_ref like 'PSP/2026-27/%')) as next_no_ok,  -- true
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)  as unlocked_tables_left; -- 0
