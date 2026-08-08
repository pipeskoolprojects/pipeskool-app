-- =============================================================================
-- PIPESKOOL — update163: ITEM TYPE MASTER (add your own material types)
-- The fixed Type list (Pipe/Fitting/Valve/...) becomes a managed master —
-- same pattern as Worker Categories. Existing types preserved exactly; the
-- item_type column is already plain text, so nothing else changes.
-- Adding types is a new admin capability "Manage item types" (Directors
-- always; grant to others from Access Rights -> Admin capabilities).
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

create table if not exists item_types (
  id bigserial primary key,
  label text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into item_types (label) values
  ('Pipe'), ('Fitting'), ('Valve'), ('Fixture'), ('Consumable'), ('Pump'), ('Tank')
on conflict (label) do nothing;

alter table item_types enable row level security;
drop policy if exists it_select on item_types;
create policy it_select on item_types for select to authenticated using (true);
drop policy if exists it_insert on item_types;
create policy it_insert on item_types for insert to authenticated
  with check (fn_has_admin('manage_item_types'));
drop policy if exists it_update on item_types;
create policy it_update on item_types for update to authenticated
  using (fn_has_admin('manage_item_types'));

-- standard: reload the API schema cache
notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from item_types)                                          as types_seeded,   -- expect 7
  (select count(*) from pg_policies where tablename = 'item_types')          as type_policies;  -- expect 3
