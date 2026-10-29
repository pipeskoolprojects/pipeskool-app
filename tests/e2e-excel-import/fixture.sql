-- local stand-in for the live tables used by update 484 (shapes copied from the live database)
create schema if not exists auth;
create schema if not exists extensions;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
create table sites (id bigserial primary key, name text, is_active boolean default true);
create table app_users (id bigserial primary key, full_name text, auth_id uuid, role text, is_active boolean default true, director_access boolean, price_access boolean);
create table permissions (id bigserial primary key, user_id bigint, site_id bigint, module text, action text, allowed boolean default true);
create table notifications (id bigserial primary key, staff_id bigint, kind text, title text, body text, link text, is_read boolean default false, created_at timestamptz default now(), site_id bigint, status text, request_id bigint);
create table module_audit_log (id bigserial primary key, module text, action text, ref_id bigint, staff_id bigint, at timestamptz default now(), ip text, device text, meta jsonb);
create table item_master (id bigserial primary key, item_type text, material text, sub_type text, size text, item_class text, make text, unit text default 'Nos', is_active boolean default true, pending_review boolean default false,
  display_name text generated always as (item_type || ' - ' || material || coalesce(' ' || sub_type, '') || coalesce(' ' || size, '') || coalesce(' (' || item_class || ')', '') || coalesce(' [' || make || ']', '')) stored);
create table vendors (id bigserial primary key, name text, is_active boolean default true);
create type po_status as enum ('draft','issued','partial','closed','cancelled','delivered');
create table material_indents (id bigserial primary key, indent_no text, site_id bigint, raised_by bigint, required_by date, urgency text default 'normal', note text, status text default 'open', created_at timestamptz default now());
create table material_indent_items (id bigserial primary key, indent_id bigint references material_indents(id) on delete cascade, item_id bigint, item_name text, qty numeric, unit text, purpose text, spec text);
create table purchase_orders (id bigserial primary key, po_no text, vendor_id bigint, site_id bigint, indent_id bigint, gst_pct numeric default 18, subtotal numeric default 0, gst_amount numeric default 0, total numeric default 0,
  status po_status default 'draft', created_by bigint, created_at timestamptz default now(), vendor_name text, total_amount numeric default 0, is_lowest boolean default true, non_lowest_reason text, split_note text, issued_by bigint,
  approval_status text default 'approved' check (approval_status in ('pending','approved','rejected')), approved_by bigint, approved_at timestamptz, reject_reason text);
create table po_items (id bigserial primary key, po_id bigint references purchase_orders(id) on delete cascade, item_id bigint references item_master(id), qty numeric, rate numeric, amount numeric, indent_item_id bigint references material_indent_items(id) on delete set null,
  item_name text, unit text, spec text, list_rate numeric, discount_pct numeric, gst_pct numeric default 18, line_kind text);
create table indent_quotes (id bigserial primary key, indent_id bigint, indent_item_id bigint, vendor_id bigint, vendor_name text, rate numeric, remarks text, created_at timestamptz default now(), list_rate numeric, discount_pct numeric);
create or replace function fn_is_director() returns boolean language sql stable security definer as $$ select coalesce((select role = 'director' and is_active from app_users where auth_id = auth.uid() limit 1), false) $$;
create or replace function fn_is_site_role(r text) returns boolean language sql immutable as $$ select r in ('supervisor','site_engineer','storekeeper','site_incharge','peon') $$;
create or replace function public.fn_can_view_prices() returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce((select u.is_active and not fn_is_site_role(u.role) and (u.role in ('director', 'procurement_head') or coalesce(u.director_access, false) or coalesce(u.price_access, false))
        from public.app_users u where u.auth_id = auth.uid() limit 1), false) $function$;
create or replace function public.fn_next_po_no(p_site_id bigint) returns text language plpgsql as $function$
declare n int; begin select count(*) + 1 into n from purchase_orders; return 'PO/' || to_char(now(),'YYMM') || '/' || lpad(n::text, 4, '0'); end $function$;
create or replace function public.fn_po_approval_default() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare u record; begin
  select id, role into u from app_users where auth_id = auth.uid() and is_active = true limit 1;
  if u.role = 'director' then new.approval_status := 'approved'; new.approved_by := u.id; new.approved_at := now();
  else new.approval_status := 'pending'; new.approved_by := null; new.approved_at := null; end if; return new; end $function$;
create trigger trg_po_approval_default before insert on purchase_orders for each row execute function fn_po_approval_default();
create or replace function public.fn_po_approve(p_po_id bigint, p_action text, p_reason text default null) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare u record; p record; begin
  select id, role, full_name into u from app_users where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null or u.role <> 'director' then return jsonb_build_object('ok', false, 'error', 'Only Directors can approve or reject purchase orders.'); end if;
  select id, po_no, status, approval_status into p from purchase_orders where id = p_po_id;
  if p.status = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'PO is cancelled.'); end if;
  if p_action = 'approved' then update purchase_orders set approval_status = 'approved', approved_by = u.id, approved_at = now(), reject_reason = null where id = p_po_id;
  elsif p_action = 'rejected' then update purchase_orders set approval_status = 'rejected', approved_by = u.id, approved_at = now(), reject_reason = trim(p_reason) where id = p_po_id; end if;
  return jsonb_build_object('ok', true, 'po_no', p.po_no); end $function$;
create or replace function public.fn_indent_sync_status(p_indent_id bigint) returns void language plpgsql security definer as $$ begin null; end $$;
create or replace function public.trg_po_items_indent_sync() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_ind bigint; begin select indent_id into v_ind from public.material_indent_items where id = coalesce(new.indent_item_id, old.indent_item_id);
  if v_ind is not null then perform public.fn_indent_sync_status(v_ind); end if; return coalesce(new, old); end $function$;
create trigger po_items_indent_sync after insert or delete on po_items for each row execute function trg_po_items_indent_sync();
create or replace function public.trg_po_status_indent_sync() returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin if new.indent_id is not null and (old.status is distinct from new.status) then perform public.fn_indent_sync_status(new.indent_id); end if; return new; end $function$;
create trigger po_status_indent_sync after update of status on purchase_orders for each row execute function trg_po_status_indent_sync();
create or replace function public.fn_next_indent_no(p_site_id bigint) returns text language plpgsql security definer set search_path to 'public' as $function$
declare pfx text; n int; begin
  pfx := 'IND/' || p_site_id || '/' || to_char(now() at time zone 'Asia/Kolkata', 'YYMM') || '/';
  select coalesce(max(nullif(regexp_replace(substring(indent_no from length(pfx) + 1), '\D', '', 'g'), '')::int), 0) + 1 into n from material_indents where indent_no like pfx || '%';
  return pfx || lpad(n::text, 3, '0'); end $function$;
