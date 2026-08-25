-- =============================================================================
-- PIPESKOOL — update219: TASK SYSTEM (Director/Admin assign -> staff execute)
-- Purely ADDITIVE: two new tables + one status RPC. No existing table, row,
-- module, permission or workflow is touched in any way.
-- Run as ONE transaction. Backup first (standing rule).
-- =============================================================================
create table if not exists staff_tasks (
  id bigint generated always as identity primary key,
  title text not null,
  description text default '',
  site_id bigint references sites(id),
  assigned_to bigint not null references app_users(id),
  assigned_by bigint not null references app_users(id),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','in_progress','completed')),
  remarks text default '',                       -- assignee's running remarks
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists staff_task_files (
  id bigint generated always as identity primary key,
  task_id bigint not null references staff_tasks(id) on delete cascade,
  path text not null,
  uploaded_by bigint references app_users(id),
  created_at timestamptz not null default now()
);
alter table staff_tasks enable row level security;
alter table staff_task_files enable row level security;

create or replace function fn_me_id() returns bigint language sql stable security definer set search_path = public as
$$ select id from app_users where auth_id = auth.uid() and is_active = true limit 1 $$;
create or replace function fn_is_task_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from app_users where auth_id = auth.uid() and is_active = true and role in ('director','it_executive')) $$;
grant execute on function fn_me_id() to authenticated;
grant execute on function fn_is_task_admin() to authenticated;

drop policy if exists st_sel on staff_tasks;
create policy st_sel on staff_tasks for select
  using (fn_is_task_admin() or assigned_to = fn_me_id() or assigned_by = fn_me_id());
drop policy if exists st_ins on staff_tasks;
create policy st_ins on staff_tasks for insert with check (fn_is_task_admin());
drop policy if exists st_upd on staff_tasks;
create policy st_upd on staff_tasks for update using (fn_is_task_admin());
drop policy if exists st_del on staff_tasks;
create policy st_del on staff_tasks for delete using (fn_is_task_admin());
drop policy if exists stf_sel on staff_task_files;
create policy stf_sel on staff_task_files for select
  using (exists(select 1 from staff_tasks t where t.id = task_id and (fn_is_task_admin() or t.assigned_to = fn_me_id() or t.assigned_by = fn_me_id())));
drop policy if exists stf_ins on staff_task_files;
create policy stf_ins on staff_task_files for insert
  with check (exists(select 1 from staff_tasks t where t.id = task_id and (fn_is_task_admin() or t.assigned_to = fn_me_id())));

-- assignee moves their OWN task Pending -> In progress -> Completed (+remarks), audited
create or replace function fn_task_set_status(p_id bigint, p_status text, p_remarks text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u bigint; t record;
begin
  u := fn_me_id();
  if u is null then return jsonb_build_object('ok', false, 'error', 'Not logged in.'); end if;
  select id, assigned_to, assigned_by, status into t from staff_tasks where id = p_id;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'Task not found.'); end if;
  if not (t.assigned_to = u or fn_is_task_admin()) then
    return jsonb_build_object('ok', false, 'error', 'Only the assignee (or a Director/IT) can update this task.');
  end if;
  if p_status not in ('pending','in_progress','completed') then
    return jsonb_build_object('ok', false, 'error', 'Unknown status.');
  end if;
  update staff_tasks set status = p_status,
    remarks = coalesce(nullif(trim(p_remarks), ''), remarks),
    completed_at = case when p_status = 'completed' then now() else null end
  where id = p_id;
  insert into module_audit_log (module, action, staff_id, meta)
  values ('tasks', 'status', u, jsonb_build_object('task_id', p_id, 'from', t.status, 'to', p_status));
  return jsonb_build_object('ok', true, 'assigned_by', t.assigned_by);
end $$;
grant execute on function fn_task_set_status(bigint, text, text) to authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.tables where table_name in ('staff_tasks','staff_task_files')) as task_tables,   -- 2
  (select count(*) from pg_policies where tablename in ('staff_tasks','staff_task_files'))                as task_policies, -- 6
  (select count(*) from pg_proc where proname in ('fn_task_set_status','fn_me_id','fn_is_task_admin'))    as task_fns,      -- 3
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)                        as unlocked_tables_left; -- 0
