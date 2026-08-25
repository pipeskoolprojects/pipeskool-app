-- =============================================================================
-- PIPESKOOL — update224: multi-site worker punch — FIX.
-- ROOT CAUSE: worker_sites was readable only by AUTHENTICATED users, but the
-- worker punch screen runs WITHOUT a login (anon key). So a worker's allotted
-- sites came back empty and the site dropdown never appeared.
-- Fix: allow anon to READ the worker→site mapping and site names/geofences
-- (read-only; writes stay locked to authenticated as before). Backup first.
-- =============================================================================
drop policy if exists ws_select_anon on worker_sites;
create policy ws_select_anon on worker_sites for select to anon using (true);

drop policy if exists sites_select_anon on sites;
create policy sites_select_anon on sites for select to anon using (true);

notify pgrst, 'reload schema';

select
  (select count(*) from pg_policies where tablename='worker_sites' and policyname='ws_select_anon')  as ws_anon,   -- 1
  (select count(*) from pg_policies where tablename='sites'        and policyname='sites_select_anon') as sites_anon, -- 1
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)                    as unlocked_tables_left; -- 0
