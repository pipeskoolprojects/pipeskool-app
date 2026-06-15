-- ============================================================
-- PIPESKOOL — Starter staff users (app_users) + site links
-- Run in Supabase SQL Editor. Fixes the "raised_by" foreign key error.
-- These are the office/site STAFF (not labour workers).
-- ============================================================

-- Create staff. Adjust names/mobiles to your real team anytime.
insert into app_users (full_name, mobile, role, site_id) values
  ('Keyal Shah',  '9000000001', 'director',      null),   -- you (HO, all sites)
  ('Accountant',  '9000000002', 'ho_admin',      null),   -- accountant (HO)
  ('S. Desai',    '9000000003', 'supervisor',    1),      -- KEI supervisor
  ('M. Joshi',    '9000000004', 'supervisor',    2),      -- SOUL supervisor
  ('R. Mehta',    '9000000005', 'supervisor',    3)       -- The Creek supervisor
on conflict (mobile) do nothing;

-- Link supervisors to the site(s) they handle (for "advance for my site" logic)
insert into user_sites (user_id, site_id)
select u.id, u.site_id from app_users u where u.site_id is not null
on conflict (user_id, site_id) do nothing;

-- Director & accountant can act on all sites
insert into user_sites (user_id, site_id)
select u.id, s.id
from app_users u cross join sites s
where u.role in ('director','ho_admin')
on conflict (user_id, site_id) do nothing;

-- Give one supervisor some petty cash so you can test the held-balance flow
insert into petty_cash_grants (user_id, site_id, amount, note, given_by)
select su.id, 1, 20000, 'Opening petty cash for testing', d.id
from app_users su, app_users d
where su.mobile = '9000000003' and d.mobile = '9000000001';

-- ============================================================
-- After running this, app_users IDs exist so requests can link.
-- The first inserted user (Keyal Shah) will typically be id = 1.
-- ============================================================
