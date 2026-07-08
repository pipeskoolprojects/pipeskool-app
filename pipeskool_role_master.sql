-- ============================================================
-- Pipeskool — ROLE MASTER
-- Roles become data you manage in the app (Workers & Staff Master →
-- Manage roles), instead of a fixed list baked into the database.
-- RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING update64. Safe to re-run.
-- ============================================================

-- 1) unlock the role column (was a fixed enum type)
alter table app_users alter column role type text using role::text;

-- 2) role master table
create table if not exists staff_roles (
  code       text primary key,
  label      text not null,
  sort_order int  not null default 100,
  is_active  boolean not null default true
);

insert into staff_roles (code, label, sort_order) values
  ('director',        'Director',                    1),
  ('ho_admin',        'Accountant / HO Admin',       2),
  ('site_engineer',   'Site Engineer',               3),
  ('supervisor',      'Site Incharge / Supervisor',  4),
  ('storekeeper',     'Storekeeper',                 5),
  ('billing_engineer','Billing Engineer',            6),
  ('hr_admin',        'HR Admin',                    7),
  ('procurement_head','Procurement Head',            8)
on conflict (code) do nothing;
