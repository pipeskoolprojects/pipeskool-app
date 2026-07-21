-- ============================================================
-- Pipeskool — MACHINE TYPE MASTER for rentals
-- Managed dropdown of machine types (JCB, Boom Lift, ...) so entries
-- stay consistent — no "JCB" vs "JCB MACHINE" duplicates.
-- RUN BEFORE DEPLOYING update109. Safe to re-run.
-- ============================================================
create table if not exists rental_machine_types (
  id bigint generated always as identity primary key,
  name text not null,
  is_active boolean not null default true
);
create unique index if not exists ux_machine_type_name on rental_machine_types (lower(name));

insert into rental_machine_types (name) values ('JCB'), ('Boom Lift')
on conflict do nothing;

do $$ begin
  begin
    alter table rental_machine_types enable row level security;
    drop policy if exists staff_all on rental_machine_types;
    create policy staff_all on rental_machine_types for all to authenticated using (fn_is_staff()) with check (fn_is_staff());
  exception when undefined_function then
    alter table rental_machine_types disable row level security;
  end;
end $$;
select 'Machine type master installed' as done;
