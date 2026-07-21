-- ============================================================
-- Pipeskool — RENTALS MODULE (machines & rooms on rent)
-- Tracks machines (JCB, boom lift…) and rooms rented per site:
-- start date, monthly rent due day, supplier/owner, rent, deposit,
-- and uploaded documents (machine + operator papers).
-- RUN BEFORE DEPLOYING update108. Safe to re-run.
-- ============================================================
create table if not exists rentals (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('machine','room')),
  name text not null,                       -- machine type ("JCB") or room label
  site_id bigint not null references sites(id),
  supplier_name text,                       -- machine supplier / room owner
  rent_amount numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0,
  start_date date not null,
  rent_due_day int not null check (rent_due_day between 1 and 31),
  note text,
  is_active boolean not null default true,
  ended_on date,
  created_by bigint references app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists rental_docs (
  id bigint generated always as identity primary key,
  rental_id bigint not null references rentals(id) on delete cascade,
  doc_name text not null,
  file_path text not null,
  uploaded_by bigint references app_users(id),
  uploaded_at timestamptz not null default now()
);

do $$ begin
  begin
    alter table rentals enable row level security;
    drop policy if exists staff_all on rentals;
    create policy staff_all on rentals for all to authenticated using (fn_is_staff()) with check (fn_is_staff());
    alter table rental_docs enable row level security;
    drop policy if exists staff_all on rental_docs;
    create policy staff_all on rental_docs for all to authenticated using (fn_is_staff()) with check (fn_is_staff());
  exception when undefined_function then
    alter table rentals disable row level security;
    alter table rental_docs disable row level security;
  end;
end $$;
select 'Rentals module installed' as done;
