-- ============================================================
-- PIPESKOOL — SCHEMA FOR 3 NEW MODULES (run once, before update127)
-- Module 1: Company Notice Board + Daily Quote
-- Module 2: AI Assistant (support tickets; knowledge base ships in code)
-- Module 3: Leave Request Management
-- Shared: notifications, audit log, company_holidays
-- Safe to re-run: create table if not exists / on conflict do nothing.
-- ============================================================

-- ---------- SHARED: in-app notifications (used by all 3 modules) ----------
create table if not exists notifications (
  id bigint generated always as identity primary key,
  staff_id bigint not null references app_users(id) on delete cascade,
  kind text not null,                      -- notice / leave / ticket / system
  title text not null,
  body text,
  link text,                               -- in-app route to open
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_staff on notifications(staff_id, is_read, created_at desc);

-- ---------- SHARED: audit log ----------
create table if not exists module_audit_log (
  id bigint generated always as identity primary key,
  module text not null,                    -- notices / leave / assistant / daily_quotes
  action text not null,                    -- created / modified / approved / rejected / cancelled / pinned ...
  ref_id bigint,
  staff_id bigint references app_users(id),
  at timestamptz not null default now(),
  ip text, device text,
  meta jsonb
);
create index if not exists idx_maudit_mod on module_audit_log(module, ref_id);

-- ---------- SHARED: company company_holidays / events ----------
create table if not exists company_holidays (
  id bigint generated always as identity primary key,
  on_date date not null,
  name text not null,
  kind text not null default 'holiday',    -- holiday / festival / event / weekly_off
  created_at timestamptz not null default now(),
  unique (on_date, name)
);

-- staff birthday (optional, feeds leave calendar)
alter table app_users add column if not exists dob date;

-- ---------- MODULE 1: NOTICES ----------
create table if not exists notices (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  priority text not null default 'normal',       -- normal / important / urgent / emergency
  category text not null default 'general',      -- general/hr/safety/quality/material/client/technical/accounts/payroll/holiday/festival/maintenance
  audience_type text not null default 'company', -- company / sites / roles / staff
  start_date date not null default current_date,
  expiry_date date,
  is_pinned boolean not null default false,
  allow_comments boolean not null default true,
  require_ack boolean not null default false,
  created_by bigint references app_users(id),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  is_active boolean not null default true
);
create index if not exists idx_notices_live on notices(is_active, is_pinned desc, created_at desc);

create table if not exists notice_targets (         -- rows only when audience_type != company
  id bigint generated always as identity primary key,
  notice_id bigint not null references notices(id) on delete cascade,
  site_id bigint references sites(id),
  role text,
  staff_id bigint references app_users(id)
);
create index if not exists idx_ntargets on notice_targets(notice_id);

create table if not exists notice_attachments (
  id bigint generated always as identity primary key,
  notice_id bigint not null references notices(id) on delete cascade,
  name text not null, url text not null, mime text,
  uploaded_by bigint references app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists notice_reads (
  notice_id bigint not null references notices(id) on delete cascade,
  staff_id bigint not null references app_users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notice_id, staff_id)
);

create table if not exists notice_acks (
  notice_id bigint not null references notices(id) on delete cascade,
  staff_id bigint not null references app_users(id) on delete cascade,
  ack_at timestamptz not null default now(),
  primary key (notice_id, staff_id)
);

create table if not exists notice_comments (
  id bigint generated always as identity primary key,
  notice_id bigint not null references notices(id) on delete cascade,
  staff_id bigint not null references app_users(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- MODULE 1: DAILY QUOTES ----------
create table if not exists daily_quotes (
  id bigint generated always as identity primary key,
  text text not null unique,
  theme text,                              -- safety/teamwork/productivity/leadership/ownership/discipline/quality/client/learning/excellence
  quote_date date unique,                  -- date it is/was shown; null = still in the bank
  is_favorite boolean not null default false,
  is_manual boolean not null default false,
  created_at timestamptz not null default now()
);

-- app-level settings (quote time etc.)
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into app_settings(key, value) values ('quote_time', '08:00') on conflict do nothing;

-- ---------- MODULE 2: SUPPORT TICKETS ----------
create table if not exists support_tickets (
  id bigint generated always as identity primary key,
  staff_id bigint not null references app_users(id),
  route text not null default 'admin',     -- hr / accounts / site_engineer / admin
  subject text not null,
  body text,
  screenshot_url text,
  diagnostic jsonb,                        -- auto: role, site, page, device, app version
  status text not null default 'open',     -- open / in_progress / resolved / closed
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by bigint references app_users(id),
  resolution_note text
);
create index if not exists idx_tickets on support_tickets(status, created_at desc);

-- ---------- MODULE 3: LEAVE ----------
create table if not exists leave_requests (
  id bigint generated always as identity primary key,
  staff_id bigint not null references app_users(id),
  leave_type text not null default 'paid', -- paid / sick / casual / emergency / half_day / lwp
  from_date date not null,
  to_date date not null,
  days numeric not null,                   -- computed at apply-time (0.5 for half day)
  reason text,
  emergency_contact text,
  doc_url text,                            -- medical certificate / supporting doc
  status text not null default 'pending',  -- pending / approved / rejected / cancelled / info_needed
  current_level int not null default 1,
  applied_at timestamptz not null default now(),
  decided_at timestamptz,
  cancel_note text
);
create index if not exists idx_leave_staff on leave_requests(staff_id, from_date desc);
create index if not exists idx_leave_pending on leave_requests(status, current_level);

create table if not exists leave_approvals (
  id bigint generated always as identity primary key,
  request_id bigint not null references leave_requests(id) on delete cascade,
  level int not null,
  approver_id bigint references app_users(id),
  action text not null,                    -- approved / rejected / info_requested
  note text,
  acted_at timestamptz not null default now(),
  ip text, device text
);

-- admin-configurable chain: 1–3 levels; each level a role OR a named staff
create table if not exists leave_approval_config (
  level int primary key check (level between 1 and 3),
  approver_role text,                      -- e.g. 'supervisor', 'ho_admin'
  approver_staff bigint references app_users(id),
  is_active boolean not null default true
);
insert into leave_approval_config(level, approver_role) values (1, 'director') on conflict do nothing;

-- ---------- RLS (app runs with lock ON — same permissive authenticated pattern as other transactional tables) ----------
do $$
declare t text;
begin
  foreach t in array array['notifications','module_audit_log','company_holidays','notices','notice_targets','notice_attachments','notice_reads','notice_acks','notice_comments','daily_quotes','app_settings','support_tickets','leave_requests','leave_approvals','leave_approval_config']
  loop
    execute format('alter table %I enable row level security', t);
    begin
      execute format('create policy "auth all" on %I for all to authenticated using (true) with check (true)', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- verification
select 'notices' t, count(*) from notices
union all select 'daily_quotes', count(*) from daily_quotes
union all select 'leave_requests', count(*) from leave_requests
union all select 'company_holidays', count(*) from company_holidays
union all select 'support_tickets', count(*) from support_tickets
union all select 'leave_approval_config', count(*) from leave_approval_config;
