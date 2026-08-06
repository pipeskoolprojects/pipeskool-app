-- =============================================================================
-- PIPESKOOL — update152: WORKER CATEGORY MASTER (add your own categories)
-- The fixed database enum is replaced by a managed master table (same pattern
-- as Role Master / Machine Types). Existing categories are preserved exactly.
-- Directors add new categories from the app — no SQL ever again for this.
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- 1. master table (prefixed name — generic-name collision lesson)
create table if not exists worker_categories (
  id bigserial primary key,
  code text unique not null,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. seed with the nine existing categories
insert into worker_categories (code, label) values
  ('plumber','Plumber'), ('fitter','Fitter'), ('helper','Helper'),
  ('welder','Welder'), ('supervisor','Supervisor'), ('operator','Operator'),
  ('electrician','Electrician'), ('mason','Mason'), ('other','Other')
on conflict (code) do nothing;

-- 3. workers.category: enum -> plain text (values preserved verbatim)
alter table workers alter column category type text using category::text;

-- 4. the enum is no longer referenced anywhere -> remove it
drop type if exists worker_category;

-- 5. RLS: everyone logged-in reads; only Directors add/rename/deactivate
alter table worker_categories enable row level security;
drop policy if exists wcat_select on worker_categories;
create policy wcat_select on worker_categories for select to authenticated using (true);
drop policy if exists wcat_insert on worker_categories;
create policy wcat_insert on worker_categories for insert to authenticated with check (fn_is_director());
drop policy if exists wcat_update on worker_categories;
create policy wcat_update on worker_categories for update to authenticated using (fn_is_director());

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from worker_categories)                                   as categories_seeded,   -- expect 9
  (select data_type from information_schema.columns
    where table_name = 'workers' and column_name = 'category')               as category_type,       -- expect text
  (select count(*) from pg_type where typname = 'worker_category')           as old_enum_left;       -- expect 0
