-- Machine Repair module. Review and run only after this change is approved.
-- All transitions go through authenticated RPCs; table policies provide site-scoped reads.
begin;

create sequence if not exists machine_repair_request_seq start 1;
create table if not exists machine_repair_requests (
  id bigint generated always as identity primary key,
  number text not null unique,
  site_id bigint not null references sites(id),
  raised_by bigint not null references app_users(id),
  created_at timestamptz not null default now(),
  vendor_id bigint references vendors(id),
  sent_by bigint references app_users(id),
  sent_at timestamptz
);
create table if not exists machine_repair_machines (
  id bigint generated always as identity primary key,
  request_id bigint not null references machine_repair_requests(id) on delete cascade,
  sequence_no integer not null check (sequence_no between 1 and 20),
  name text not null check (length(trim(name)) > 0),
  problem text not null check (length(trim(problem)) > 0),
  photo_url text not null check (length(trim(photo_url)) > 0),
  received_at timestamptz,
  received_by bigint references app_users(id),
  remark text,
  unique (request_id, sequence_no)
);
create table if not exists machine_repair_receipts (
  id bigint generated always as identity primary key,
  request_id bigint not null references machine_repair_requests(id) on delete cascade,
  version integer not null,
  pdf_path text not null,
  pdf_url text not null,
  generated_by bigint not null references app_users(id),
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(request_id, version)
);
create table if not exists machine_repair_audit (
  id bigint generated always as identity primary key,
  request_id bigint not null references machine_repair_requests(id) on delete cascade,
  machine_id bigint references machine_repair_machines(id) on delete set null,
  action text not null check (action in ('created','sent','received')),
  staff_id bigint not null references app_users(id),
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists machine_repair_site_created on machine_repair_requests(site_id, created_at desc);
create index if not exists machine_repair_machine_request on machine_repair_machines(request_id, sequence_no);
create index if not exists machine_repair_audit_request on machine_repair_audit(request_id, at desc);

-- Add only this module's default permissions for existing assigned staff.
insert into permissions(user_id,site_id,module,action,allowed)
select us.user_id,us.site_id,'machine_repair',a.action,true
from user_sites us join app_users u on u.id=us.user_id and u.is_active
cross join lateral (select unnest(case
 when u.role='director' then array['view','create','approve','manage']::text[]
 when u.role in ('ho_admin','it_executive') then array['view','approve']::text[]
 when u.role in ('supervisor','site_engineer') then array['view','create']::text[]
 else array[]::text[] end) as action) a
on conflict(user_id,site_id,module,action) do update set allowed=true;

create or replace function fn_repair_staff_id()
returns bigint language sql stable security definer set search_path = public, auth
as $$ select id from app_users where auth_id = auth.uid() and is_active limit 1 $$;

create or replace function fn_repair_is_office(p_staff bigint, p_site bigint)
returns boolean language sql stable security definer set search_path = public
as $$
 select exists (
   select 1 from app_users u where u.id=p_staff and u.is_active and (
     u.role in ('director','ho_admin','it_executive')
     or exists(select 1 from permissions p where p.user_id=u.id and p.site_id=p_site
       and p.module='machine_repair' and p.allowed and p.action in ('approve','manage'))
   )
 )
$$;

create or replace function fn_repair_site_access(p_staff bigint, p_site bigint)
returns boolean language sql stable security definer set search_path = public
as $$
 select exists (
   select 1 from app_users u where u.id=p_staff and u.is_active and (
     u.role='director'
     or exists(select 1 from user_sites us where us.user_id=u.id and us.site_id=p_site)
     or exists(select 1 from app_users s where s.id=u.id and s.site_id=p_site)
   )
 )
$$;

create or replace view v_machine_repair_requests with (security_invoker=true) as
select r.id,r.number,r.site_id,s.name as site_name,r.raised_by,u.full_name as raised_by_name,
 r.created_at,r.vendor_id,v.name as vendor_name,r.sent_by,r.sent_at,
 count(m.id)::integer as machine_count,
 count(m.id) filter(where m.received_at is not null)::integer as received_count,
 case when r.sent_at is null then 'Requested'
      when count(m.id) filter(where m.received_at is not null)=count(m.id) then 'Received'
      when count(m.id) filter(where m.received_at is not null)>0 then 'Partially received'
      else 'Sent to vendor' end as status
from machine_repair_requests r join sites s on s.id=r.site_id
join app_users u on u.id=r.raised_by
left join vendors v on v.id=r.vendor_id
left join machine_repair_machines m on m.request_id=r.id
group by r.id,s.name,u.full_name,v.name;

alter table machine_repair_requests enable row level security;
alter table machine_repair_machines enable row level security;
alter table machine_repair_receipts enable row level security;
alter table machine_repair_audit enable row level security;
drop policy if exists repair_request_read on machine_repair_requests;
create policy repair_request_read on machine_repair_requests for select to authenticated
 using (fn_repair_site_access(fn_repair_staff_id(),site_id));
drop policy if exists repair_machine_read on machine_repair_machines;
create policy repair_machine_read on machine_repair_machines for select to authenticated
 using (exists(select 1 from machine_repair_requests r where r.id=request_id and fn_repair_site_access(fn_repair_staff_id(),r.site_id)));
drop policy if exists repair_receipt_read on machine_repair_receipts;
create policy repair_receipt_read on machine_repair_receipts for select to authenticated
 using (exists(select 1 from machine_repair_requests r where r.id=request_id and fn_repair_site_access(fn_repair_staff_id(),r.site_id)));
drop policy if exists repair_audit_read on machine_repair_audit;
create policy repair_audit_read on machine_repair_audit for select to authenticated
 using (exists(select 1 from machine_repair_requests r where r.id=request_id and fn_repair_site_access(fn_repair_staff_id(),r.site_id)));
revoke all on machine_repair_requests,machine_repair_machines,machine_repair_receipts,machine_repair_audit from anon,authenticated;
grant select on machine_repair_requests,machine_repair_machines,machine_repair_receipts,machine_repair_audit,v_machine_repair_requests to authenticated;

create or replace function fn_machine_repair_create(p_site_id bigint,p_machines jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare sid bigint:=fn_repair_staff_id(); rid bigint; n integer; x jsonb; i integer:=0;
begin
 if sid is null then raise exception 'Sign in required'; end if;
 if not fn_repair_site_access(sid,p_site_id) then raise exception 'You are not assigned to this site'; end if;
 if not exists(select 1 from app_users where id=sid and role in ('supervisor','site_engineer')) then
   raise exception 'Only a site supervisor can create repair requests';
 end if;
 if not exists(select 1 from permissions where user_id=sid and site_id=p_site_id and module='machine_repair' and allowed and action in ('create','manage'))
 then raise exception 'Machine Repair permission is required'; end if;
 if jsonb_typeof(p_machines)<>'array' or jsonb_array_length(p_machines)<1 or jsonb_array_length(p_machines)>20
 then raise exception 'Add between 1 and 20 machines'; end if;
 n:=nextval('machine_repair_request_seq');
 insert into machine_repair_requests(number,site_id,raised_by) values ('REP-'||lpad(n::text,4,'0'),p_site_id,sid) returning id into rid;
 for x in select value from jsonb_array_elements(p_machines) loop
   i:=i+1;
   if length(trim(coalesce(x->>'name','')))=0 or length(trim(coalesce(x->>'problem','')))=0 or length(trim(coalesce(x->>'photo_url','')))=0 then
     raise exception 'Machine % needs a photo, name and problem',i;
   end if;
   if (x->>'photo_url') !~ '^repairs/[A-Za-z0-9/_-]+\.jpg$' then raise exception 'Invalid machine photo path'; end if;
   insert into machine_repair_machines(request_id,sequence_no,name,problem,photo_url)
     values(rid,i,trim(x->>'name'),trim(x->>'problem'),x->>'photo_url');
 end loop;
 insert into machine_repair_audit(request_id,action,staff_id,meta) values(rid,'created',sid,jsonb_build_object('machine_count',i));
 insert into notifications(staff_id,kind,title,body,link,site_id,status,request_id)
 select u.id,'machine_repair','Repair request submitted',
   (select number from machine_repair_requests where id=rid)||' · '||i||' machine(s)',
   '/go?to=repairs&repair='||rid,p_site_id,'pending',rid
 from app_users u where u.is_active and (u.role in ('director','ho_admin','it_executive') or
   exists(select 1 from permissions p where p.user_id=u.id and p.site_id=p_site_id and p.module='machine_repair' and p.allowed and p.action in ('approve','manage')));
 return jsonb_build_object('ok',true,'id',rid,'number',(select number from machine_repair_requests where id=rid));
end $$;

create or replace function fn_machine_repair_send(p_request_id bigint,p_vendor_id bigint,p_pdf_path text,p_pdf_url text)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare sid bigint:=fn_repair_staff_id(); r machine_repair_requests%rowtype; ver integer;
begin
 if sid is null then raise exception 'Sign in required'; end if;
 select * into r from machine_repair_requests where id=p_request_id for update;
 if not found then raise exception 'Repair request not found'; end if;
 if not fn_repair_site_access(sid,r.site_id) or not fn_repair_is_office(sid,r.site_id) then raise exception 'Office permission is required'; end if;
 if r.sent_at is not null then raise exception 'This request was already sent'; end if;
 if not exists(select 1 from vendors where id=p_vendor_id and is_active) then raise exception 'Choose an active vendor'; end if;
 if p_pdf_path !~ '^repairs/receipts/[A-Za-z0-9_-]+\.pdf$' or p_pdf_url not like 'http%' then raise exception 'A generated receipt PDF is required'; end if;
 select coalesce(max(version),0)+1 into ver from machine_repair_receipts where request_id=p_request_id;
 update machine_repair_requests set vendor_id=p_vendor_id,sent_by=sid,sent_at=now() where id=p_request_id;
 update machine_repair_receipts set sent_at=now() where request_id=p_request_id and sent_at is null;
 insert into machine_repair_receipts(request_id,version,pdf_path,pdf_url,generated_by,sent_at)
 values(p_request_id,ver,p_pdf_path,p_pdf_url,sid,now());
 update machine_repair_audit set meta=meta||jsonb_build_object('vendor_id',p_vendor_id,'receipt_version',ver)
 where id=(select max(id) from machine_repair_audit where request_id=p_request_id and action='sent');
 insert into machine_repair_audit(request_id,action,staff_id,meta) values(p_request_id,'sent',sid,jsonb_build_object('vendor_id',p_vendor_id,'receipt_version',ver,'pdf_url',p_pdf_url));
 insert into notifications(staff_id,kind,title,body,link,site_id,status,request_id)
 values(r.raised_by,'machine_repair','Machines sent to vendor',r.number||' has been sent to the repair vendor.','/go?to=repairs&repair='||p_request_id,r.site_id,'sent',p_request_id);
 return jsonb_build_object('ok',true,'version',ver,'sent_at',now());
end $$;


create or replace function fn_machine_repair_receipt_version(p_request_id bigint,p_pdf_path text,p_pdf_url text)
returns jsonb language plpgsql security definer set search_path=public,auth
as $
declare sid bigint:=fn_repair_staff_id(); r machine_repair_requests%rowtype; ver integer;
begin
 if sid is null then raise exception 'Sign in required'; end if;
 select * into r from machine_repair_requests where id=p_request_id for update;
 if not found or r.sent_at is null then raise exception 'Sent repair request not found'; end if;
 if not fn_repair_site_access(sid,r.site_id) or not fn_repair_is_office(sid,r.site_id) then raise exception 'Office permission is required'; end if;
 if p_pdf_path !~ '^repairs/receipts/[A-Za-z0-9_-]+\\.pdf(p_machine_id bigint,p_remark text default null)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare sid bigint:=fn_repair_staff_id(); m machine_repair_machines%rowtype; r machine_repair_requests%rowtype;
begin
 if sid is null then raise exception 'Sign in required'; end if;
 select * into m from machine_repair_machines where id=p_machine_id for update;
 if not found then raise exception 'Machine not found'; end if;
 select * into r from machine_repair_requests where id=m.request_id;
 if not fn_repair_site_access(sid,r.site_id) or not exists(select 1 from app_users where id=sid and role in ('supervisor','site_engineer'))
 then raise exception 'Assigned site supervisor access is required'; end if;
 if r.sent_at is null then raise exception 'Machine has not been sent to the vendor'; end if;
 if m.received_at is not null then raise exception 'Machine is already marked received'; end if;
 update machine_repair_machines set received_at=now(),received_by=sid,remark=nullif(trim(coalesce(p_remark,'')),'') where id=p_machine_id;
 insert into machine_repair_audit(request_id,machine_id,action,staff_id,meta) values(m.request_id,m.id,'received',sid,jsonb_build_object('remark',nullif(trim(coalesce(p_remark,'')),'')));
 insert into notifications(staff_id,kind,title,body,link,site_id,status,request_id)
 select u.id,'machine_repair','Machine received',r.number||' · '||m.name||' received at site.','/go?to=repairs&repair='||r.id,r.site_id,'received',r.id
 from app_users u where u.is_active and (u.role in ('director','ho_admin','it_executive') or
   exists(select 1 from permissions p where p.user_id=u.id and p.site_id=r.site_id and p.module='machine_repair' and p.allowed and p.action in ('approve','manage')));
 return jsonb_build_object('ok',true,'received_at',now());
end $$;

create or replace function fn_machine_repair_dashboard(p_site_id bigint default null)
returns table(with_vendor bigint) language plpgsql security definer set search_path=public,auth
as $$
declare sid bigint:=fn_repair_staff_id();
begin
 if sid is null then raise exception 'Sign in required'; end if;
 return query select count(*) from v_machine_repair_requests v where v.status in ('Sent to vendor','Partially received')
 and fn_repair_site_access(sid,v.site_id) and (p_site_id is null or p_site_id=v.site_id)
 and (exists(select 1 from app_users where id=sid and role='director') or v.raised_by=sid or v.site_id=p_site_id);
end $$;

grant execute on function fn_machine_repair_create(bigint,jsonb),fn_machine_repair_send(bigint,bigint,text,text),
 fn_machine_repair_receive(bigint,text),fn_machine_repair_dashboard(bigint),fn_machine_repair_receipt_version(bigint,text,text) to authenticated;
commit;
 or p_pdf_url not like 'http%' then raise exception 'A generated receipt PDF is required'; end if;
 select coalesce(max(version),0)+1 into ver from machine_repair_receipts where request_id=p_request_id;
 insert into machine_repair_receipts(request_id,version,pdf_path,pdf_url,generated_by)
 values(p_request_id,ver,p_pdf_path,p_pdf_url,sid);
 insert into machine_repair_audit(request_id,action,staff_id,meta)
 values(p_request_id,'sent',sid,jsonb_build_object('receipt_version',ver,'regenerated',true,'pdf_url',p_pdf_url));
 return jsonb_build_object('ok',true,'version',ver,'generated_at',now());
end $;

create or replace function fn_machine_repair_receive(p_machine_id bigint,p_remark text default null)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare sid bigint:=fn_repair_staff_id(); m machine_repair_machines%rowtype; r machine_repair_requests%rowtype;
begin
 if sid is null then raise exception 'Sign in required'; end if;
 select * into m from machine_repair_machines where id=p_machine_id for update;
 if not found then raise exception 'Machine not found'; end if;
 select * into r from machine_repair_requests where id=m.request_id;
 if not fn_repair_site_access(sid,r.site_id) or not exists(select 1 from app_users where id=sid and role in ('supervisor','site_engineer'))
 then raise exception 'Assigned site supervisor access is required'; end if;
 if r.sent_at is null then raise exception 'Machine has not been sent to the vendor'; end if;
 if m.received_at is not null then raise exception 'Machine is already marked received'; end if;
 update machine_repair_machines set received_at=now(),received_by=sid,remark=nullif(trim(coalesce(p_remark,'')),'') where id=p_machine_id;
 insert into machine_repair_audit(request_id,machine_id,action,staff_id,meta) values(m.request_id,m.id,'received',sid,jsonb_build_object('remark',nullif(trim(coalesce(p_remark,'')),'')));
 insert into notifications(staff_id,kind,title,body,link,site_id,status,request_id)
 select u.id,'machine_repair','Machine received',r.number||' · '||m.name||' received at site.','/go?to=repairs&repair='||r.id,r.site_id,'received',r.id
 from app_users u where u.is_active and (u.role in ('director','ho_admin','it_executive') or
   exists(select 1 from permissions p where p.user_id=u.id and p.site_id=r.site_id and p.module='machine_repair' and p.allowed and p.action in ('approve','manage')));
 return jsonb_build_object('ok',true,'received_at',now());
end $$;

create or replace function fn_machine_repair_dashboard(p_site_id bigint default null)
returns table(with_vendor bigint) language plpgsql security definer set search_path=public,auth
as $$
declare sid bigint:=fn_repair_staff_id();
begin
 if sid is null then raise exception 'Sign in required'; end if;
 return query select count(*) from v_machine_repair_requests v where v.status in ('Sent to vendor','Partially received')
 and fn_repair_site_access(sid,v.site_id) and (p_site_id is null or p_site_id=v.site_id)
 and (exists(select 1 from app_users where id=sid and role='director') or v.raised_by=sid or v.site_id=p_site_id);
end $$;

grant execute on function fn_machine_repair_create(bigint,jsonb),fn_machine_repair_send(bigint,bigint,text,text),
 fn_machine_repair_receive(bigint,text),fn_machine_repair_dashboard(bigint) to authenticated;
commit;
