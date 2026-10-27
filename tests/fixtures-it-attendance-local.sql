-- LOCAL TEST FIXTURE ONLY (synthetic rows, never shipped) — just enough of the live schema to run pipeskool_it_attendance_register.sql
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
create type attendance_status as enum ('present','half_day','absent');
create type labour_type as enum ('own','contractor');
create type punch_type as enum ('self','proxy');
create type verify_status as enum ('pending','verified','corrected');
create table sites (id bigserial primary key, name text, is_active boolean default true, shift_start time, shift_end time);
create table app_users (id bigserial primary key, full_name text, mobile text, auth_id uuid, role text, is_active boolean default true);
create table user_sites (id bigserial primary key, user_id bigint, site_id bigint, unique(user_id, site_id));
create table contractors (id bigserial primary key, name text);
create table workers (id bigserial primary key, full_name text, mobile text, category text, labour_type labour_type default 'own', contractor_id bigint, contractor_name text, site_id bigint, is_active boolean default true, ot_eligible boolean default true, last_working_day date, joining_date date, exited_at timestamptz);
create table worker_sites (worker_id bigint, site_id bigint, primary key(worker_id, site_id));
create table permissions (id bigserial primary key, user_id bigint, site_id bigint, module text, action text, allowed boolean default true);
create table attendance (id bigserial primary key, worker_id bigint, site_id bigint, att_date date, punch_in timestamptz, punch_out timestamptz, punch_in_selfie_url text, punch_out_selfie_url text, auto_punched_out boolean,
  hours_worked numeric, status attendance_status, ot_hours numeric, punch_type punch_type, proxy_photo_url text, verify_status verify_status default 'pending', verified_by bigint, verified_at timestamptz,
  ot_approved boolean, ot_approved_hours numeric, ot_approved_at timestamptz, ot_approved_by bigint, punch_in_distance_m int, punch_out_distance_m int, punch_out_site_id bigint, review_status text, site_manual boolean, unique(worker_id, att_date));
create table attendance_audit (id bigserial primary key, worker_id bigint, employee_name text, site_id bigint, site_name text, att_date date, old_status text, new_status text, old_ot_hours numeric, new_ot_hours numeric, old_marker text, new_marker text, action text, reason text, changed_by bigint, changed_by_name text, changed_at timestamptz);
create or replace function fn_is_director() returns boolean language sql stable as $$ select exists (select 1 from app_users where auth_id = auth.uid() and role = 'director') $$;
create or replace function fn_has_perm(p_module text, p_action text) returns boolean language sql stable security definer as $$
  select fn_is_director() or exists (select 1 from permissions p join app_users u on u.id = p.user_id where u.auth_id = auth.uid() and p.module = p_module and p.action = p_action and p.allowed) $$;

-- data: 4 sites (one Head Office 10:00 shift, one with no shift), IT exec (sites 1,2,8) + director + supervisor; 40 workers + 6 staff; two days of punches
insert into sites (id, name, shift_start, shift_end) values (1,'KEI Industries, Sanand','09:00','18:00'), (2,'SOUL Campus, GIFT City','09:00','18:00'), (8,'HEAD OFFICE','10:00','19:00'), (6,'ATOS',null,null), (9,'OUTSIDE SCOPE','09:00','18:00');
insert into app_users (id, full_name, mobile, auth_id, role) values (7,'Satyam','9000000007','00000000-0000-0000-0000-000000000007','it_executive'), (1,'Keyal','9000000001','00000000-0000-0000-0000-000000000001','director'),
 (12,'Satyendra','9000000012','00000000-0000-0000-0000-000000000012','supervisor'), (8,'Mukesh','9000000008','00000000-0000-0000-0000-000000000008','ho_admin'), (5,'Kishan','9000000005','00000000-0000-0000-0000-000000000005','billing_engineer'), (21,'Ajit','9000000021','00000000-0000-0000-0000-000000000021','it_executive');
insert into user_sites (user_id, site_id) values (7,1),(7,2),(7,8),(7,6),(12,2),(8,8),(5,1),(1,1),(1,2),(1,8),(21,9);
insert into permissions (user_id, site_id, module, action) values (7,1,'attendance','verify'),(7,1,'attendance','manage'),(12,2,'attendance','verify'),(21,9,'attendance','view');
insert into contractors (id, name) values (1,'Mojahid'), (2,'Akhilesh Yadav');
-- staff punch profiles (mobile = login)
insert into workers (id, full_name, mobile, category, site_id) values (101,'Satyendra','9000000012','supervisor',2), (102,'Mukesh','9000000008','office',8), (103,'Kishan','9000000005','engineer',1), (104,'Keyal','9000000001','director',8);
-- labour
insert into workers (id, full_name, mobile, category, labour_type, contractor_id, site_id)
select 200 + g, 'Worker ' || g, '98' || lpad(g::text, 8, '0'), (array['helper','welder','fitter','grinder','mason','plumber'])[1 + g % 6], case when g % 4 = 0 then 'contractor'::labour_type else 'own' end, case when g % 4 = 0 then 1 + (g / 4) % 2 end, (array[1,2,6,1,2])[1 + g % 5] from generate_series(1, 40) g;
update workers set is_active = false, last_working_day = '2026-10-20', exited_at = now() where id = 240;   -- exited mid-month
insert into workers (id, full_name, mobile, category, site_id) values (299, 'Outside Worker', '9700000000', 'helper', 9);
insert into worker_sites values (205, 8), (206, 2);
-- punches for 2026-10-26 (IST): 08:40 .. 09:40, some proxy, some verified, a few before 08:00 / after 10:00, one multiple-site, one absent, one without punch-in
insert into attendance (worker_id, site_id, att_date, punch_in, punch_out, hours_worked, status, ot_hours, punch_type, verify_status, ot_approved, ot_approved_hours, punch_in_distance_m, punch_in_selfie_url, proxy_photo_url)
select 200 + g, w.site_id, '2026-10-26', ('2026-10-26 ' || lpad(((8 * 60 + 40 + g * 2) / 60)::text, 2, '0') || ':' || lpad(((8 * 60 + 40 + g * 2) % 60)::text, 2, '0') || ':00+05:30')::timestamptz,
       case when g % 7 = 0 then null else ('2026-10-26 18:' || lpad((g % 50)::text, 2, '0') || ':00+05:30')::timestamptz end, 8.5, case when g % 11 = 0 then 'half_day' else 'present' end::attendance_status,
       case when g % 5 = 0 then 1.5 else 0 end, case when g % 3 = 0 then 'self' else 'proxy' end::punch_type, case when g % 4 = 1 then 'verified' else 'pending' end::verify_status,
       g % 10 = 0, case when g % 10 = 0 then 2 end, case when g % 3 = 0 then 100 + g * 7 end, case when g % 3 = 0 then 'selfie/' || g || '.jpg' end, case when g % 3 <> 0 then 'proxy/' || g || '.jpg' end
  from generate_series(1, 36) g join workers w on w.id = 200 + g;
update attendance set punch_in = '2026-10-26 07:45:00+05:30' where worker_id = 201;   -- before 08:00
update attendance set punch_in = '2026-10-26 10:20:00+05:30' where worker_id = 202;   -- after 10:00
update attendance set punch_in = null, status = 'absent' where worker_id = 203;         -- absent mark, no punch
update attendance set punch_in_selfie_url = null, proxy_photo_url = null where worker_id = 204;   -- no photo
insert into attendance (worker_id, site_id, att_date, punch_in, punch_out, hours_worked, status, punch_type, verify_status, punch_in_distance_m, punch_in_selfie_url) values
 (101, 2, '2026-10-26', '2026-10-26 09:05:00+05:30', '2026-10-26 18:10:00+05:30', 9, 'present', 'self', 'pending', 60, 'selfie/s1.jpg'),
 (102, 8, '2026-10-26', '2026-10-26 10:12:00+05:30', '2026-10-26 19:00:00+05:30', 8.8, 'present', 'self', 'verified', 40, 'selfie/s2.jpg'),
 (103, 1, '2026-10-26', '2026-10-26 08:58:00+05:30', null, null, 'present', 'self', 'pending', 80, 'selfie/s3.jpg'),
 (299, 9, '2026-10-26', '2026-10-26 09:00:00+05:30', null, null, 'present', 'self', 'pending', 10, null);
-- previous days
insert into attendance (worker_id, site_id, att_date, punch_in, status, punch_type, verify_status)
select 200 + g, w.site_id, d::date, (d::date || ' 09:00:00+05:30')::timestamptz, 'present', 'proxy', case when g % 2 = 0 then 'verified' else 'pending' end::verify_status
  from generate_series(1, 30) g join workers w on w.id = 200 + g, generate_series('2026-10-20'::date, '2026-10-25'::date, interval '1 day') d where (g + extract(day from d)::int) % 3 <> 0;
