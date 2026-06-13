-- ============================================================
-- PIPESKOOL — Module 3: Site Expenses / Petty Cash / Salary Advance
-- Migration v3.0 — run AFTER module 1 & 2 migrations
-- ============================================================

create type expense_category as enum (
  'local_material','transport','labour_advance','tea_food',
  'consumables','repairs','loading_unloading','misc'
);
create type expense_status as enum ('pending','approved','queried','rejected');
create type expense_pay_mode as enum ('cash','upi');

-- ---------- IMPREST TRANSFERS (HO -> a person at a site) ----------
create table imprest_transfers (
  id bigint generated always as identity primary key,
  site_id bigint not null references sites(id),
  holder_user_id bigint not null references app_users(id),  -- who holds the cash
  amount numeric(12,2) not null check (amount > 0),
  transfer_date date not null default current_date,
  mode text not null default 'bank',          -- bank / cash / upi
  reference_no text,
  note text,
  given_by bigint references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_imprest_site on imprest_transfers(site_id);
create index idx_imprest_holder on imprest_transfers(holder_user_id);

-- ---------- EXPENSES (every rupee spent at site) ----------
create table expenses (
  id bigint generated always as identity primary key,
  site_id bigint not null references sites(id),
  holder_user_id bigint not null references app_users(id),  -- who spent it
  expense_date date not null default current_date,
  category expense_category not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_to text not null,
  pay_mode expense_pay_mode not null default 'cash',
  bill_photo_url text,                         -- missing photo => flagged on web
  note text,
  worker_id bigint references workers(id),     -- mandatory when category = labour_advance
  status expense_status not null default 'pending',
  reviewed_by bigint references app_users(id),
  reviewed_at timestamptz,
  query_note text,                             -- accountant's question if queried
  advance_id bigint references advances(id),   -- set when labour advance is approved
  created_at timestamptz not null default now(),
  constraint labour_advance_needs_worker check (
    category <> 'labour_advance' or worker_id is not null
  )
);
create index idx_expenses_site_date on expenses(site_id, expense_date);
create index idx_expenses_status on expenses(status) where status = 'pending';
create index idx_expenses_holder on expenses(holder_user_id);

-- ---------- SALARY ADVANCES (staff member's own salary) ----------
create table salary_advances (
  id bigint generated always as identity primary key,
  user_id bigint not null references app_users(id),  -- the staff member
  site_id bigint references sites(id),
  amount numeric(12,2) not null check (amount > 0),
  request_date date not null default current_date,
  reason text,
  status expense_status not null default 'pending',
  reviewed_by bigint references app_users(id),
  reviewed_at timestamptz,
  query_note text,
  settled boolean not null default false,      -- ticked when deducted from salary (HR module)
  settled_month date,
  created_at timestamptz not null default now()
);
create index idx_sal_adv_user on salary_advances(user_id);

-- ---------- BUSINESS LOGIC: approved labour advance flows to wage register ----------
create or replace function fn_expense_approved()
returns trigger language plpgsql as $$
declare adv_id bigint;
begin
  if new.status = 'approved' and old.status is distinct from 'approved'
     and new.category = 'labour_advance' and new.worker_id is not null
     and new.advance_id is null then
    insert into advances (worker_id, site_id, amount, adv_date, reason, given_by, expense_id)
    values (new.worker_id, new.site_id, new.amount, new.expense_date,
            coalesce(new.note,'Labour advance via expenses'), coalesce(new.reviewed_by, new.holder_user_id), new.id)
    returning id into adv_id;
    new.advance_id := adv_id;
  end if;
  return new;
end $$;

create trigger trg_expense_approved
before update of status on expenses
for each row execute function fn_expense_approved();

-- ---------- RECONCILIATION VIEW: per site per holder ----------
create or replace view v_imprest_reconciliation as
select
  u.id as holder_user_id, u.full_name as holder, s.id as site_id, s.name as site,
  coalesce(t.transferred, 0) as transferred,
  coalesce(e.approved, 0) as approved_spend,
  coalesce(e.pending, 0) as pending_spend,
  coalesce(t.transferred, 0) - coalesce(e.approved, 0) as in_hand
from app_users u
join sites s on s.id = coalesce(u.site_id, s.id)
left join (
  select holder_user_id, site_id, sum(amount) transferred
  from imprest_transfers group by 1, 2
) t on t.holder_user_id = u.id and t.site_id = s.id
left join (
  select holder_user_id, site_id,
    sum(amount) filter (where status = 'approved') approved,
    sum(amount) filter (where status = 'pending') pending
  from expenses group by 1, 2
) e on e.holder_user_id = u.id and e.site_id = s.id
where coalesce(t.transferred, 0) > 0 or coalesce(e.approved, 0) > 0 or coalesce(e.pending, 0) > 0;

-- ============================================================
-- End of Module 3 migration.
-- ============================================================
