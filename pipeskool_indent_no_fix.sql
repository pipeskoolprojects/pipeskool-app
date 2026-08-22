-- =============================================================================
-- PIPESKOOL — update208: INDENT NUMBER GENERATOR FIX (duplicate key on raise)
-- Old fn_next_indent_no used count(*)+1 — after ANY indent delete the count drops
-- and the next number collides with an existing one ("duplicate key ...indent_no_key").
-- v2 = MAX existing sequence for this site+month prefix + 1 (holes from deletes are
-- fine, numbers never reused downward), serialized with an advisory lock.
-- Run as ONE transaction. Backup first (standing rule).
-- =============================================================================
create or replace function fn_next_indent_no(p_site_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare pfx text; n int;
begin
  pfx := 'IND/' || p_site_id || '/' || to_char(now() at time zone 'Asia/Kolkata', 'YYMM') || '/';
  perform pg_advisory_xact_lock(hashtext('indent_no'), p_site_id::int);
  select coalesce(max(nullif(regexp_replace(substring(indent_no from length(pfx) + 1), '\D', '', 'g'), '')::int), 0) + 1
    into n
  from material_indents
  where indent_no like pfx || '%';
  return pfx || lpad(n::text, 3, '0');
end $$;
grant execute on function fn_next_indent_no(bigint) to authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where p.proname = 'fn_next_indent_no' and ns.nspname = 'public')                 as fn_v2,               -- 1
  (select fn_next_indent_no(5) is not null)                                           as sample_ok,            -- true (no insert happens)
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)    as unlocked_tables_left; -- 0
