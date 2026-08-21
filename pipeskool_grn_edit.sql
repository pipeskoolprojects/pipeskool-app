-- =============================================================================
-- PIPESKOOL — update192: GRN HEADER EDIT (creator / IT / Director), last-edited trail
-- fn_grn_edit updates the GRN's header fields on grn_headers AND on every underlying
-- stock_txns line (the register reads the lines), records who edited last, and writes
-- a module_audit_log entry with old -> new values. Quantities/items are NOT editable
-- here (locked rule: corrections to qty go via cancel or vendor return).
-- Run as ONE transaction. Backup first (standing rule).
-- =============================================================================
alter table grn_headers add column if not exists last_edited_by bigint references app_users(id);
alter table grn_headers add column if not exists last_edited_at timestamptz;

create or replace function fn_grn_edit(p_grn_no text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; h record; v_vendor text; v_chal text; v_our text; v_date date; v_note text;
begin
  select id, role, full_name into u from app_users where auth_id = auth.uid() and is_active = true limit 1;
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'No active staff record for this login.'); end if;
  select * into h from grn_headers where grn_no = p_grn_no;
  if h.grn_no is null then return jsonb_build_object('ok', false, 'error', 'GRN not found.'); end if;
  if h.status = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'Cancelled GRNs cannot be edited.'); end if;
  if not (u.role in ('director', 'it_executive') or u.id = h.created_by) then
    return jsonb_build_object('ok', false, 'error', 'Only the person who entered this GRN, IT, or a Director can edit it.');
  end if;

  v_vendor := coalesce(nullif(p->>'vendor',''), h.vendor);
  v_chal   := coalesce(nullif(p->>'challan_no',''), h.challan_no);
  v_our    := coalesce(nullif(p->>'our_challan_no',''), h.our_challan_no);
  v_date   := coalesce(nullif(p->>'challan_date','')::date, h.challan_date);
  v_note   := coalesce(p->>'note', h.note);

  update grn_headers set vendor = v_vendor, challan_no = v_chal, our_challan_no = v_our,
         challan_date = v_date, note = v_note, last_edited_by = u.id, last_edited_at = now()
   where grn_no = p_grn_no;
  update stock_txns set vendor = v_vendor, supplier = v_vendor, challan_no = v_chal,
         our_challan_no = v_our, challan_date = v_date
   where grn_no = p_grn_no and txn_type::text = 'grn';

  insert into module_audit_log (module, action, staff_id, meta)
  values ('grn', 'edited', u.id, jsonb_build_object('grn_no', p_grn_no,
          'old', jsonb_build_object('vendor', h.vendor, 'challan_no', h.challan_no, 'our_challan_no', h.our_challan_no, 'challan_date', h.challan_date),
          'new', jsonb_build_object('vendor', v_vendor, 'challan_no', v_chal, 'our_challan_no', v_our, 'challan_date', v_date)));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function fn_grn_edit(text, jsonb) to authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns where table_name='grn_headers'
     and column_name in ('last_edited_by','last_edited_at'))                        as edit_cols,          -- 2
  (select count(*) from pg_proc where proname = 'fn_grn_edit')                       as edit_fn,            -- 1
  (select count(*) from pg_tables where schemaname='public' and rowsecurity=false)   as unlocked_tables_left; -- 0
