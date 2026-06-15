-- ============================================================
-- PIPESKOOL — Staff Login + Access Rights (RBAC) v7.0
-- Action-level permissions, site-scoped, Director-managed.
-- Run in Supabase SQL Editor.
-- ============================================================

-- ---- modules & actions catalogue (what can be permissioned) ----
-- module keys map to app areas; actions are view/create/approve etc.
create table if not exists permissions (
  id bigint generated always as identity primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  module text not null,        -- 'attendance','dpr','money','stock','indent','assets','wages','workers','dashboard','access_rights'
  action text not null,        -- 'view','create','approve','verify','manage'
  allowed boolean not null default false,
  unique (user_id, module, action)
);
create index if not exists idx_perms_user on permissions(user_id);

-- ---- helper: seed default permissions for a user based on role ----
create or replace function fn_seed_permissions(p_user_id bigint, p_role text)
returns void language plpgsql as $$
declare
  -- module, action pairs to grant per role
  rec record;
begin
  delete from permissions where user_id = p_user_id;

  if p_role = 'director' then
    -- everything, including access_rights manage
    insert into permissions (user_id, module, action, allowed)
    select p_user_id, m, a, true from
      (values ('dashboard'),('attendance'),('dpr'),('money'),('stock'),
              ('indent'),('assets'),('wages'),('workers'),('access_rights')) mods(m),
      (values ('view'),('create'),('approve'),('verify'),('manage')) acts(a);

  elsif p_role = 'ho_admin' then  -- Accountant
    insert into permissions (user_id, module, action, allowed)
    select p_user_id, m, a, true from
      (values ('dashboard'),('attendance'),('dpr'),('money'),('stock'),
              ('indent'),('assets'),('wages'),('workers')) mods(m),
      (values ('view'),('approve')) acts(a);
    -- accountant can also create wage payouts
    insert into permissions (user_id, module, action, allowed) values
      (p_user_id,'money','create',true),(p_user_id,'wages','create',true)
    on conflict do nothing;

  elsif p_role in ('supervisor','site_engineer') then  -- Site Incharge / Engineer
    insert into permissions (user_id, module, action, allowed)
    select p_user_id, m, a, true from
      (values ('dashboard'),('attendance'),('dpr'),('money'),('stock'),('indent'),('assets'),('workers')) mods(m),
      (values ('view'),('create')) acts(a);
    -- supervisor can verify attendance for their site
    insert into permissions (user_id, module, action, allowed) values
      (p_user_id,'attendance','verify',true)
    on conflict do nothing;

  elsif p_role = 'storekeeper' then
    insert into permissions (user_id, module, action, allowed)
    select p_user_id, m, a, true from
      (values ('stock'),('indent'),('assets')) mods(m),
      (values ('view'),('create')) acts(a);

  elsif p_role = 'worker' then
    -- workers: only attendance punch (handled in worker app), minimal
    insert into permissions (user_id, module, action, allowed) values
      (p_user_id,'attendance','create',true);
  end if;
end $$;

-- seed permissions for all existing staff based on their current role
do $$
declare u record;
begin
  for u in select id, role from app_users loop
    perform fn_seed_permissions(u.id, u.role::text);
  end loop;
end $$;

-- ---- convenience view: a user's allowed module/action map ----
create or replace view v_user_permissions as
select u.id as user_id, u.full_name, u.role, p.module, p.action, p.allowed
from app_users u left join permissions p on p.user_id = u.id;

-- ============================================================
-- After this runs, every staff user has a default permission set
-- matching their role, which the Director can fine-tune by ticks.
-- ============================================================
