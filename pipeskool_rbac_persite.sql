-- ============================================================
-- PIPESKOOL — Per-SITE Access Rights (RBAC v8.0)
-- Same person can have DIFFERENT rights on DIFFERENT sites.
-- Run in Supabase SQL Editor (replaces the v7 permissions table).
-- ============================================================

drop view if exists v_user_permissions;
drop table if exists permissions cascade;

-- permissions are now per (user, SITE, module, action)
create table permissions (
  id bigint generated always as identity primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  site_id bigint not null references sites(id) on delete cascade,
  module text not null,
  action text not null,
  allowed boolean not null default false,
  unique (user_id, site_id, module, action)
);
create index idx_perms_user on permissions(user_id);
create index idx_perms_user_site on permissions(user_id, site_id);

-- seed default rights for a user ON A SPECIFIC SITE, based on role
create or replace function fn_seed_site_permissions(p_user_id bigint, p_role text, p_site_id bigint)
returns void language plpgsql as $$
begin
  delete from permissions where user_id = p_user_id and site_id = p_site_id;

  if p_role = 'director' then
    insert into permissions(user_id, site_id, module, action, allowed)
    select p_user_id, p_site_id, m, a, true from
      (values ('attendance'),('dpr'),('money'),('stock'),('indent'),('assets'),('wages'),('workers')) mods(m),
      (values ('view'),('create'),('approve'),('verify'),('manage')) acts(a);

  elsif p_role = 'ho_admin' then   -- Accountant
    insert into permissions(user_id, site_id, module, action, allowed)
    select p_user_id, p_site_id, m, a, true from
      (values ('attendance'),('dpr'),('money'),('stock'),('indent'),('assets'),('wages'),('workers')) mods(m),
      (values ('view'),('approve')) acts(a);
    insert into permissions(user_id, site_id, module, action, allowed) values
      (p_user_id,p_site_id,'money','create',true),(p_user_id,p_site_id,'wages','create',true)
    on conflict do nothing;

  elsif p_role in ('supervisor','site_engineer') then  -- Site Incharge / Engineer
    insert into permissions(user_id, site_id, module, action, allowed)
    select p_user_id, p_site_id, m, a, true from
      (values ('attendance'),('dpr'),('money'),('stock'),('indent'),('assets'),('workers')) mods(m),
      (values ('view'),('create')) acts(a);
    insert into permissions(user_id, site_id, module, action, allowed) values
      (p_user_id,p_site_id,'attendance','verify',true)
    on conflict do nothing;

  elsif p_role = 'storekeeper' then
    insert into permissions(user_id, site_id, module, action, allowed)
    select p_user_id, p_site_id, m, a, true from
      (values ('stock'),('indent'),('assets')) mods(m),
      (values ('view'),('create')) acts(a);
  end if;
end $$;

-- give director & accountant all sites (assign + seed)
insert into user_sites (user_id, site_id)
select u.id, s.id from app_users u cross join sites s
where u.role in ('director','ho_admin')
on conflict (user_id, site_id) do nothing;

-- seed permissions for every existing assignment
do $$
declare r record;
begin
  for r in select us.user_id, us.site_id, u.role
           from user_sites us join app_users u on u.id = us.user_id loop
    perform fn_seed_site_permissions(r.user_id, r.role::text, r.site_id);
  end loop;
end $$;

-- ============================================================
-- Now each (user, site) pair has its own tickable rights.
-- ============================================================
