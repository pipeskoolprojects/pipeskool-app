-- ============================================================
-- PIPESKOOL — Module 3 REVISION (v3.1)
-- Restructures Money/Expense: Advance Salary + Site Expense Claim
-- Keeps petty cash held-balance model.
-- Run AFTER the original module 3 migration.
-- ============================================================

-- ---- app_users: add bank details + which sites a person handles ----
alter table app_users add column if not exists bank_account_no text;
alter table app_users add column if not exists bank_ifsc text;
alter table app_users add column if not exists bank_holder_name text;
alter table app_users add column if not exists bank_complete boolean
  generated always as (bank_account_no is not null and bank_ifsc is not null) stored;

-- which sites a supervisor/engineer handles (a person can handle several)
create table if not exists user_sites (
  id bigint generated always as identity primary key,
  user_id bigint not null references app_users(id),
  site_id bigint not null references sites(id),
  unique (user_id, site_id)
);

-- ---- ADVANCE SALARY REQUESTS (for self OR any worker/employee at handled site) ----
-- beneficiary is EITHER a worker (labour) OR an app_user (staff). Exactly one is set.
create table if not exists advance_salary_requests (
  id bigint generated always as identity primary key,
  req_no text unique,
  site_id bigint references sites(id),
  beneficiary_worker_id bigint references workers(id),
  beneficiary_user_id bigint references app_users(id),
  beneficiary_name text not null,            -- snapshot for display
  beneficiary_kind text not null,            -- 'labour' | 'staff'
  amount numeric(12,2) not null check (amount > 0),
  reason text,
  bank_on_file boolean not null default false,  -- flag (not a blocker)
  status expense_status not null default 'pending',
  raised_by bigint references app_users(id),
  reviewed_by bigint references app_users(id),
  reviewed_at timestamptz,
  query_note text,
  paid boolean not null default false,
  paid_at timestamptz,
  settled boolean not null default false,    -- recovered from salary/wages later
  created_at timestamptz not null default now(),
  constraint one_beneficiary check (
    (beneficiary_worker_id is not null)::int + (beneficiary_user_id is not null)::int = 1
  )
);
create index if not exists idx_asr_status on advance_salary_requests(status);

-- ---- PETTY CASH balance (held by a person at a site) ----
create table if not exists petty_cash_grants (
  id bigint generated always as identity primary key,
  user_id bigint not null references app_users(id),
  site_id bigint not null references sites(id),
  amount numeric(12,2) not null check (amount > 0),
  grant_date date not null default current_date,
  note text,
  given_by bigint references app_users(id),
  created_at timestamptz not null default now()
);

-- ---- extend expenses with funding source + reimbursement target ----
alter type expense_category add value if not exists 'general_site' ;  -- safety, ignore if exists
alter table expenses add column if not exists funding_source text not null default 'own_pocket';
  -- 'own_pocket' => reimburse claimant's bank ; 'petty_cash' => deduct from held balance
alter table expenses add column if not exists claimant_user_id bigint references app_users(id);
alter table expenses add column if not exists reimbursed boolean not null default false;
alter table expenses add column if not exists bank_on_file boolean not null default false;

-- ---- petty cash held balance view (grants - approved petty_cash expenses) ----
create or replace view v_petty_cash_balance as
select
  u.id as user_id, u.full_name, s.id as site_id, s.name as site_name,
  coalesce(g.granted,0) as granted,
  coalesce(e.spent,0) as spent_from_petty,
  coalesce(g.granted,0) - coalesce(e.spent,0) as balance
from app_users u
cross join sites s
left join (select user_id, site_id, sum(amount) granted from petty_cash_grants group by 1,2) g
  on g.user_id = u.id and g.site_id = s.id
left join (select claimant_user_id, site_id, sum(amount) spent
           from expenses where funding_source='petty_cash' and status='approved' group by 1,2) e
  on e.claimant_user_id = u.id and e.site_id = s.id
where coalesce(g.granted,0) > 0 or coalesce(e.spent,0) > 0;

-- ============================================================
-- End of Module 3 revision.
-- ============================================================
