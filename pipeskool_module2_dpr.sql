-- ============================================================
-- PIPESKOOL — Module 2: Daily Progress Report (DPR)
-- Migration v2.0 — run AFTER pipeskool_module1_database.sql
-- ============================================================

create type hindrance_reason as enum (
  'front_not_available','drawing_pending','material_shortage',
  'client_hold','power_water_issue','weather','manpower_shortage','other'
);
create type dpr_status as enum ('draft','submitted');

-- ---------- ACTIVITIES (per site, linked to BOQ items) ----------
create table activities (
  id bigint generated always as identity primary key,
  site_id bigint not null references sites(id),
  boq_item_code text,                       -- links to BOQ module later
  description text not null,                -- e.g. 110mm UPVC SWR pipe laying
  unit text not null,                       -- Rmt / Nos / Points / Sqm
  boq_qty numeric(14,2) not null default 0, -- total contracted quantity
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_activities_site on activities(site_id);

-- ---------- DPR HEADER (one per site per day) ----------
create table dpr (
  id bigint generated always as identity primary key,
  site_id bigint not null references sites(id),
  dpr_date date not null,
  filled_by bigint references app_users(id),
  manpower_present integer not null default 0,   -- snapshot from attendance
  manpower_detail jsonb,                          -- {plumber:6, helper:9...}
  tomorrow_plan text,
  status dpr_status not null default 'draft',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (site_id, dpr_date)
);
create index idx_dpr_date on dpr(dpr_date);

-- ---------- WORK DONE LINES ----------
create table dpr_work_items (
  id bigint generated always as identity primary key,
  dpr_id bigint not null references dpr(id) on delete cascade,
  activity_id bigint not null references activities(id),
  qty numeric(14,2) not null check (qty > 0),
  location_tag text,                        -- Bay-5 / Grid B-F / Block A 3rd floor
  remarks text
);
create index idx_dpr_items_activity on dpr_work_items(activity_id);

-- ---------- HINDRANCES (gold for claims & EOT) ----------
create table dpr_hindrances (
  id bigint generated always as identity primary key,
  dpr_id bigint not null references dpr(id) on delete cascade,
  reason hindrance_reason not null,
  hours_lost numeric(5,2) not null default 0,
  description text
);

-- ---------- PHOTOS (geo-tagged, min 2/day enforced in app) ----------
create table dpr_photos (
  id bigint generated always as identity primary key,
  dpr_id bigint not null references dpr(id) on delete cascade,
  photo_url text not null,
  caption text,
  lat double precision,
  lng double precision,
  taken_at timestamptz not null default now()
);

-- ---------- MATERIAL CONSUMED (FK to stock items when Module 4 arrives) ----------
create table dpr_materials (
  id bigint generated always as identity primary key,
  dpr_id bigint not null references dpr(id) on delete cascade,
  item_name text not null,
  qty numeric(14,2) not null,
  unit text,
  stock_item_id bigint                      -- linked in Module 4
);

-- ---------- PROGRESS VIEW: cumulative vs BOQ ----------
create or replace view v_activity_progress as
select
  a.id as activity_id, a.site_id, a.description, a.unit, a.boq_qty,
  coalesce(sum(w.qty), 0) as done_qty,
  case when a.boq_qty > 0
       then round(coalesce(sum(w.qty),0) / a.boq_qty * 100, 1)
       else 0 end as pct_complete
from activities a
left join dpr_work_items w on w.activity_id = a.id
left join dpr d on d.id = w.dpr_id and d.status = 'submitted'
group by a.id;

-- ---------- SEED: sample activities (replace with real BOQ lists) ----------
insert into activities (site_id, boq_item_code, description, unit, boq_qty, sort_order)
select s.id, v.code, v.descr, v.unit, v.qty, v.ord
from sites s
join (values
  ('KEI',  'P-01', '350NB MS pipe welding - Trench',        'Rmt',    850, 1),
  ('KEI',  'P-02', '200NB MS pipe erection - Bay 5',        'Rmt',   1200, 2),
  ('KEI',  'P-03', 'Pipe supports fabrication & fixing',    'Nos',    640, 3),
  ('KEI',  'P-04', 'Hydro-testing of welded lines',         'Rmt',   2050, 4),
  ('SOUL', 'S-01', '110mm UPVC SWR pipe laying',            'Rmt',   2400, 1),
  ('SOUL', 'S-02', 'CPVC concealed piping - toilets',       'Points', 980, 2),
  ('SOUL', 'S-03', 'GI header piping - terrace',            'Rmt',    420, 3),
  ('SOUL', 'S-04', 'Sanitary fixture installation',         'Nos',    310, 4),
  ('CREEK','C-01', '160mm HDPE external drainage',          'Rmt',   1100, 1),
  ('CREEK','C-02', 'CPVC water supply riser piping',        'Rmt',    760, 2),
  ('CREEK','C-03', 'Storm water RCC chamber connections',   'Nos',     84, 3)
) as v(site_code, code, descr, unit, qty, ord) on v.site_code = s.code;

-- ============================================================
-- End of Module 2 migration.
-- ============================================================
