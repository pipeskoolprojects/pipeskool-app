-- =============================================================================
-- PIPESKOOL — update203 v2: MASTER PROJECT MANAGEMENT LAYER
-- v2: fn_has_perm is 2-arg (module, action) — v1 passed 3 args and rolled back cleanly.
-- Design: SITES *ARE* PROJECTS. Every existing module (attendance, stock, procure,
-- DPR, expenses, billing, wages) is already keyed by site_id — so the project system
-- is a metadata + workspace layer over the sites table. ZERO duplicate data.
-- Upcoming/idea projects are sites rows with is_active=false (kept out of all
-- operational dropdowns until activated). Run as ONE transaction. Backup first.
-- =============================================================================
alter table sites add column if not exists project_status text not null default 'active'
  check (project_status in ('active','upcoming','on_hold','delayed','completed','idea'));
alter table sites add column if not exists client_name text;
alter table sites add column if not exists client_contact text;
alter table sites add column if not exists manager_id bigint references app_users(id);
alter table sites add column if not exists start_date date;
alter table sites add column if not exists end_date date;
alter table sites add column if not exists expected_start date;
alter table sites add column if not exists contract_value numeric(14,2);
alter table sites add column if not exists estimated_cost numeric(14,2);
alter table sites add column if not exists priority text not null default 'medium'
  check (priority in ('high','medium','low'));
alter table sites add column if not exists tags text;
alter table sites add column if not exists description text;
-- existing live sites stay 'active'; nothing changes for them (default covers)

create table if not exists project_docs (
  id bigint generated always as identity primary key,
  site_id bigint not null references sites(id) on delete cascade,
  name text not null,
  path text not null,
  uploaded_by bigint references app_users(id),
  created_at timestamptz not null default now()
);
alter table project_docs enable row level security;
drop policy if exists pdoc_sel on project_docs;
drop policy if exists pdoc_ins on project_docs;
drop policy if exists pdoc_del on project_docs;
create policy pdoc_sel on project_docs for select using (auth.uid() is not null);
create policy pdoc_ins on project_docs for insert with check (fn_is_director() or fn_has_perm('dpr','create'));
create policy pdoc_del on project_docs for delete using (fn_is_director());

create table if not exists project_tasks (
  id bigint generated always as identity primary key,
  site_id bigint references sites(id) on delete cascade,
  title text not null,
  due_date date,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  assigned_to bigint references app_users(id),
  done boolean not null default false,
  done_at timestamptz,
  created_by bigint references app_users(id),
  created_at timestamptz not null default now()
);
alter table project_tasks enable row level security;
drop policy if exists ptask_sel on project_tasks;
drop policy if exists ptask_ins on project_tasks;
drop policy if exists ptask_upd on project_tasks;
drop policy if exists ptask_del on project_tasks;
create policy ptask_sel on project_tasks for select using (auth.uid() is not null);
create policy ptask_ins on project_tasks for insert with check (fn_is_director() or created_by = fn_current_staff_id());
create policy ptask_upd on project_tasks for update using (fn_is_director() or assigned_to = fn_current_staff_id() or created_by = fn_current_staff_id());
create policy ptask_del on project_tasks for delete using (fn_is_director() or created_by = fn_current_staff_id());

-- editing project metadata / creating projects = Directors (RLS on sites already
-- restricts writes to directors from earlier hardening; verified by policy count)

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns where table_name='sites'
     and column_name in ('project_status','client_name','manager_id','contract_value','estimated_cost','priority','tags','description','expected_start','start_date','end_date','client_contact')) as project_cols, -- 12
  (select count(*) from information_schema.tables where table_name in ('project_docs','project_tasks')) as new_tables,  -- 2
  (select count(*) from pg_policies where tablename in ('project_docs','project_tasks'))                as new_policies, -- 7
  (select count(*) from sites where project_status <> 'active')                                          as non_active,   -- 0 (existing grandfathered)
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)                       as unlocked_tables_left; -- 0
