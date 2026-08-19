-- =============================================================================
-- PIPESKOOL — update186: SUPERVISOR "MARK ABSENT" (staff-side muster only)
--
-- Absent marks live in their OWN table — the attendance table, the worker punch
-- function and the worker app are NOT touched. A later real punch by the worker
-- always wins (the muster shows the punch; the absent mark is shown as superseded).
-- Cross-site protection: a worker with ANY attendance today cannot be marked absent
-- (enforced here by the insert policy, not only in the app).
-- Run in Supabase SQL Editor as ONE transaction. Backup first (standing rule).
-- =============================================================================

create table if not exists attendance_absent_marks (
  id         bigint generated always as identity primary key,
  worker_id  bigint not null references workers(id),
  site_id    bigint not null references sites(id),
  att_date   date   not null default (now() at time zone 'Asia/Kolkata')::date,
  reason     text,
  marked_by  bigint references app_users(id),
  marked_at  timestamptz not null default now(),
  unique (worker_id, att_date)                  -- one mark per worker per day, any site
);
create index if not exists idx_absent_marks_site_date on attendance_absent_marks (site_id, att_date);

alter table attendance_absent_marks enable row level security;
drop policy if exists aam_select on attendance_absent_marks;
create policy aam_select on attendance_absent_marks for select to authenticated using (true);
drop policy if exists aam_insert on attendance_absent_marks;
create policy aam_insert on attendance_absent_marks for insert to authenticated
  with check (
    (fn_has_perm('attendance','create') or fn_has_perm('attendance','manage'))
    and not exists (select 1 from attendance a                      -- global: no punch anywhere today
                     where a.worker_id = attendance_absent_marks.worker_id
                       and a.att_date  = attendance_absent_marks.att_date)
  );
drop policy if exists aam_delete on attendance_absent_marks;
create policy aam_delete on attendance_absent_marks for delete to authenticated
  using (fn_has_perm('attendance','create') or fn_has_perm('attendance','manage'));

-- per-row verify by the supervisor (existing update policy covers it: attendance "edit"
-- = create/approve/verify/manage on the attendance module). Nothing to add.

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.tables where table_name='attendance_absent_marks') as marks_table,   -- 1
  (select count(*) from pg_policies where tablename='attendance_absent_marks')                 as marks_policies, -- 3
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)             as unlocked_tables_left; -- 0
