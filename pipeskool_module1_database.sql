-- ============================================================
-- PIPESKOOL SITE MANAGEMENT SOFTWARE
-- Module 1: Attendance & Labour Management
-- Database migration v1.0 — PostgreSQL / Supabase
-- ============================================================

-- ---------- ENUM TYPES ----------
create type user_role as enum ('director','ho_admin','site_engineer','supervisor','storekeeper','worker');
create type worker_category as enum ('plumber','fitter','helper','welder','supervisor','operator');
create type labour_type as enum ('own','contractor');
create type attendance_status as enum ('present','half_day','absent');
create type punch_type as enum ('self','proxy');
create type verify_status as enum ('pending','verified','corrected');
create type pay_mode as enum ('bank','cash');
create type payout_status as enum ('draft','approved','paid');

-- ---------- 1. SITES ----------
create table sites (
  id bigint generated always as identity primary key,
  name text not null,
  code text not null unique,                -- e.g. KEI, SOUL, CREEK
  address text,
  geofence_lat double precision not null,
  geofence_lng double precision not null,
  geofence_radius_m integer not null default 200,
  std_working_hours numeric(4,2) not null default 8.0,   -- working hrs excl. lunch
  lunch_minutes integer not null default 60,
  full_day_min_hours numeric(4,2) not null default 7.5,
  half_day_min_hours numeric(4,2) not null default 3.5,
  auto_punchout_time time not null default '20:00',
  muster_lock_time time not null default '10:00',        -- next-day lock
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 2. APP USERS (staff: director, engineers, supervisors, admins) ----------
create table app_users (
  id bigint generated always as identity primary key,
  auth_id uuid unique,                      -- links to Supabase auth.users
  full_name text not null,
  mobile text not null unique,
  role user_role not null,
  site_id bigint references sites(id),      -- null = head office / all sites
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 3. CONTRACTORS (petty/labour contractors) ----------
create table contractors (
  id bigint generated always as identity primary key,
  name text not null,
  contact_person text,
  contact_mobile text,
  gst_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 4. WORKERS (worker master) ----------
create table workers (
  id bigint generated always as identity primary key,
  auth_id uuid unique,                      -- worker's own OTP login
  full_name text not null,
  mobile text not null unique,              -- unique ID, prevents duplicates
  photo_url text,                           -- live-captured photo (mandatory in app)
  category worker_category not null,
  labour_type labour_type not null default 'own',
  contractor_id bigint references contractors(id),
  daily_wage numeric(10,2) not null,
  site_id bigint not null references sites(id),
  aadhaar_doc_url text,                     -- uploaded photocopy
  bank_account_no text,
  bank_ifsc text,
  bank_holder_name text,
  profile_complete boolean generated always as (
    aadhaar_doc_url is not null
    and bank_account_no is not null
    and bank_ifsc is not null
  ) stored,
  is_active boolean not null default true,
  created_by bigint references app_users(id),
  created_at timestamptz not null default now(),
  constraint contractor_required check (
    labour_type <> 'contractor' or contractor_id is not null
  )
);
create index idx_workers_site on workers(site_id);
create index idx_workers_contractor on workers(contractor_id);

-- ---------- 5. ATTENDANCE (one row per worker per day) ----------
create table attendance (
  id bigint generated always as identity primary key,
  worker_id bigint not null references workers(id),
  site_id bigint not null references sites(id),
  att_date date not null,
  punch_in timestamptz,
  punch_in_lat double precision,
  punch_in_lng double precision,
  punch_in_selfie_url text,
  punch_out timestamptz,
  punch_out_lat double precision,
  punch_out_lng double precision,
  punch_out_selfie_url text,
  auto_punched_out boolean not null default false,  -- system closed at 8 PM
  hours_worked numeric(5,2),                        -- computed on punch-out
  status attendance_status,                         -- auto from hours
  ot_hours numeric(5,2) not null default 0,
  ot_reason text,
  ot_approved_by bigint references app_users(id),
  punch_type punch_type not null default 'self',
  proxy_photo_url text,                             -- mandatory live photo if proxy
  proxy_reason text,
  marked_by bigint references app_users(id),        -- who proxy-punched
  verify_status verify_status not null default 'pending',
  verified_by bigint references app_users(id),
  verified_at timestamptz,
  correction_reason text,                           -- mandatory if corrected
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (worker_id, att_date),                     -- one record per worker per day
  constraint proxy_needs_photo check (
    punch_type <> 'proxy' or proxy_photo_url is not null
  )
);
create index idx_attendance_site_date on attendance(site_id, att_date);
create index idx_attendance_worker_date on attendance(worker_id, att_date);
create index idx_attendance_pending on attendance(verify_status) where verify_status = 'pending';

-- ---------- 6. ADVANCES (links to Expenses module later) ----------
create table advances (
  id bigint generated always as identity primary key,
  worker_id bigint not null references workers(id),
  site_id bigint not null references sites(id),
  amount numeric(10,2) not null check (amount > 0),
  adv_date date not null default current_date,
  reason text,
  given_by bigint not null references app_users(id),
  expense_id bigint,                        -- FK added when Module 3 is built
  settled_in_payout bigint,                 -- FK to wage_payouts when deducted
  created_at timestamptz not null default now()
);
create index idx_advances_worker on advances(worker_id);

-- ---------- 7. WAGE PAYOUTS (monthly, own labour only) ----------
create table wage_payouts (
  id bigint generated always as identity primary key,
  worker_id bigint not null references workers(id),
  site_id bigint not null references sites(id),
  pay_month date not null,                  -- first day of month, e.g. 2026-05-01
  days_full numeric(5,1) not null default 0,
  days_half numeric(5,1) not null default 0,
  days_total numeric(5,1) generated always as (days_full + days_half * 0.5) stored,
  ot_hours numeric(6,2) not null default 0,
  daily_rate numeric(10,2) not null,
  ot_rate numeric(10,2) not null,           -- daily_rate / std hours
  gross numeric(12,2) not null,
  advances_deducted numeric(12,2) not null default 0,
  net numeric(12,2) not null,
  pay_mode pay_mode not null,
  status payout_status not null default 'draft',
  approved_by bigint references app_users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (worker_id, pay_month)
);
create index idx_payouts_month_site on wage_payouts(pay_month, site_id);

-- ---------- 8. AUDIT LOG (every change, forever) ----------
create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id bigint not null,
  action text not null,                     -- insert / update / delete
  old_values jsonb,
  new_values jsonb,
  changed_by bigint references app_users(id),
  changed_at timestamptz not null default now()
);
create index idx_audit_table_record on audit_log(table_name, record_id);

-- ---------- BUSINESS LOGIC: auto day status from punch hours ----------
create or replace function fn_calc_attendance()
returns trigger language plpgsql as $$
declare
  s sites%rowtype;
  worked numeric;
begin
  select * into s from sites where id = new.site_id;
  if new.punch_in is not null and new.punch_out is not null then
    worked := extract(epoch from (new.punch_out - new.punch_in)) / 3600.0
              - (s.lunch_minutes / 60.0);
    if worked < 0 then worked := 0; end if;
    new.hours_worked := round(worked::numeric, 2);
    if worked >= s.full_day_min_hours then
      new.status := 'present';
      new.ot_hours := greatest(round((worked - s.std_working_hours)::numeric, 2), 0);
    elsif worked >= s.half_day_min_hours then
      new.status := 'half_day';
      new.ot_hours := 0;
    else
      new.status := 'absent';
      new.ot_hours := 0;
    end if;
  end if;
  return new;
end $$;

create trigger trg_calc_attendance
before insert or update of punch_in, punch_out on attendance
for each row execute function fn_calc_attendance();

-- ---------- BUSINESS LOGIC: block edits on locked records ----------
create or replace function fn_block_locked()
returns trigger language plpgsql as $$
begin
  if old.is_locked then
    raise exception 'This attendance record is locked. Director/Admin approval required.';
  end if;
  return new;
end $$;

create trigger trg_block_locked
before update on attendance
for each row execute function fn_block_locked();

-- ---------- SEED DATA: your three sites (update lat/lng to actual) ----------
insert into sites (name, code, geofence_lat, geofence_lng, geofence_radius_m) values
  ('KEI Industries, Sanand', 'KEI',  22.9920, 72.3850, 250),
  ('SOUL Campus, GIFT City', 'SOUL', 23.1600, 72.6840, 250),
  ('The Creek',              'CREEK',23.0300, 72.5070, 200);

-- ============================================================
-- End of Module 1 migration.
-- Next migrations will ADD tables for DPR, Expenses, Stock etc.
-- on top of this same foundation — nothing here gets rebuilt.
-- ============================================================
