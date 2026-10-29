\set ON_ERROR_STOP 1
set search_path = public, extensions;
-- the real sync function (update484 version) is in the import SQL; fixture had a stub → load it
\i /home/claude/work/it475/pipeskool_excel_indent_import.sql
\pset format unaligned
\pset tuples_only on
select '--- unauthorized (supervisor, view only)';
select set_config('app.uid', '00000000-0000-0000-0000-000000000021', false);
select fn_import_create('{"site_id":12}', '[{"row_no":1,"item_text":"CPVC Tee 20mm","qty":5}]')->>'error';
select fn_imp_can_any();
select '--- purchase exec creates an import';
select set_config('app.uid', '00000000-0000-0000-0000-000000000012', false);
select fn_import_create('{"site_id":1}', '[{"row_no":1,"item_text":"x","qty":5}]')->>'error' as other_site;
select (fn_import_create('{"site_id":12,"file_name":"a.xlsx","file_hash":"h1"}', '[{"row_no":2,"item_text":"CPVC Tee 20 mm astral","qty":5,"unit":"Nos"},{"row_no":3,"item_text":"cpvc teee 20mm","qty":2}]')->>'import_id') as imp1 \gset
select fn_import_check_hash('h1')->>'file_name' as dup_warns;
select jsonb_array_length(fn_import_candidates(:imp1)) n_rows, fn_import_candidates(:imp1)->0->'exact' exact0;
select id as r1 from indent_import_rows where import_id = :imp1 and row_no = 2 \gset
select id as r2 from indent_import_rows where import_id = :imp1 and row_no = 3 \gset
select id as tee20 from item_master where display_name = 'Fitting - CPVC Tee 20mm [ASTRAL]' \gset
select id as tee25 from item_master where display_name = 'Fitting - CPVC Tee 25mm [ASTRAL]' \gset
select fn_import_save_matches(:imp1, jsonb_build_array(jsonb_build_object('row_id', :r2, 'status', 'confirm', 'layer', 'fuzzy', 'confidence', 0.8, 'item_id', :tee20)));
select fn_import_confirm(:r2, :tee20, 'yes')->>'ok';
select normalized_text, site_id, times_confirmed from item_alias order by id;
select '--- second upload of the same text → alias layer';
select (fn_import_create('{"site_id":12}', '[{"row_no":1,"item_text":"CPVC  TEEE 20MM","qty":1}]')->>'import_id') as imp2 \gset
select fn_import_candidates(:imp2)->0->'alias';
select '--- overrides switch the alias off after 3';
do $$ declare i int; imp bigint; rid bigint; t20 bigint; t25 bigint; begin
  select id into t20 from item_master where display_name = 'Fitting - CPVC Tee 20mm [ASTRAL]';
  select id into t25 from item_master where display_name = 'Fitting - CPVC Tee 25mm [ASTRAL]';
  for i in 1..3 loop
    imp := (fn_import_create('{"site_id":12}', '[{"row_no":1,"item_text":"cpvc teee 20mm","qty":1}]')->>'import_id')::bigint;
    select id into rid from indent_import_rows where import_id = imp;
    perform fn_import_save_matches(imp, jsonb_build_array(jsonb_build_object('row_id', rid, 'status', 'auto', 'layer', 'alias', 'confidence', 1, 'item_id', t20)));
    perform fn_import_confirm(rid, t25, 'change');
  end loop; end $$;
select item_id = :tee20 as is_tee20, site_id, overrides, active from item_alias where normalized_text = 'cpvc teee 20mm' order by item_id, site_id nulls first;
select '--- rates: lowest NET wins; old, inactive-vendor, rejected and cancelled are excluded';
select set_config('app.uid', '00000000-0000-0000-0000-000000000001', false);
insert into purchase_orders (id, po_no, site_id, vendor_name, vendor_id, status, approval_status, created_at) values
 (101, 'PO/A', 12, 'CHIMANLAL SHANKARLAL SHAH', 1, 'issued', 'approved', now() - interval '10 days'),
 (102, 'PO/B', 12, 'ASTRAL DEPOT', 2, 'delivered', 'approved', now() - interval '5 days'),
 (103, 'PO/OLD', 12, 'PIPE HOUSE', 4, 'issued', 'approved', now() - interval '200 days'),
 (104, 'PO/INACT', 12, 'OLD VENDOR', 3, 'issued', 'approved', now() - interval '3 days'),
 (105, 'PO/REJ', 12, 'PIPE HOUSE', 4, 'issued', 'rejected', now() - interval '3 days'),
 (106, 'PO/CAN', 12, 'PIPE HOUSE', 4, 'cancelled', 'approved', now() - interval '3 days');
update purchase_orders set approval_status = case id when 105 then 'rejected' else 'approved' end where id between 101 and 106;
insert into po_items (po_id, item_id, item_name, qty, unit, rate, list_rate, discount_pct) values
 (101, :tee20, 'tee20', 50, 'Nos', 54.18, 129, 58), (102, :tee20, 'tee20', 40, 'Nos', 72, 120, 40),
 (103, :tee20, 'tee20', 40, 'Nos', 30, 60, 50), (104, :tee20, 'tee20', 40, 'Nos', 20, 40, 50), (105, :tee20, 'tee20', 40, 'Nos', 10, 20, 50), (106, :tee20, 'tee20', 40, 'Nos', 9, 18, 50),
 (101, :tee25, 'tee25', 5000, 'Nos', 80, 100, 20), (102, :tee25, 'tee25', 10, 'Mtr', 50, 50, 0);
insert into material_indents (id, indent_no, site_id, raised_by, status) values (501, 'IND/12/2610/009', 12, 12, 'open');
select id as tee32 from item_master where display_name = 'Fitting - CPVC Tee 32mm [ASTRAL]' \gset
insert into material_indent_items (id, indent_id, item_id, item_name, qty, unit) values (901, 501, :tee20, 'tee20', 100, 'Nos'), (902, 501, :tee25, 'tee25', 10, 'pcs'), (903, 501, :tee32, 'tee32', 3, 'Nos'), (904, 501, null, 'free text', 2, 'Nos');
select set_config('app.uid', '00000000-0000-0000-0000-000000000012', false);
select fn_import_compute_rates(501);
select indent_item_id, status, vendor_name, net_rate, source_no, qty_flag, alt->>'vendor' alt_vendor from indent_import_line_rates order by 1;
select '--- non-price user sees no rates';
select fn_import_line_rates(501)->0->>'net_rate' as hidden, fn_import_line_rates(501)->0->>'vendor_name' as vendor;
select '--- draft POs (purchase exec): pending, one per vendor';
select fn_import_draft_pos(501) - 'site_id';
select po_no, vendor_name, status, approval_status, total_amount from purchase_orders where indent_id = 501 order by id;
select status from material_indents where id = 501;
select '--- director-created drafts are still pending';
select set_config('app.uid', '00000000-0000-0000-0000-000000000001', false);
insert into material_indents (id, indent_no, site_id, raised_by, status) values (502, 'IND/12/2610/010', 12, 1, 'open');
insert into material_indent_items (id, indent_id, item_id, item_name, qty, unit) values (911, 502, :tee20, 'tee20', 10, 'Nos');
select fn_import_draft_pos(502)->'pos'->0->>'po_no' as po \gset
select status, approval_status from purchase_orders where po_no = :'po';
select '--- reject → cancelled, lines released; approve → issued';
select fn_po_approve((select id from purchase_orders where po_no = :'po'), 'rejected', 'rate too high')->>'ok';
select status, approval_status from purchase_orders where po_no = :'po';
select po_id is null as released, status from indent_import_line_rates where indent_item_id = 911;
select status from material_indents where id = 502;
select fn_import_draft_pos(502)->'pos'->0->>'po_no' as po2 \gset
select fn_po_approve((select id from purchase_orders where po_no = :'po2'), 'approved')->>'ok';
select status, approval_status from purchase_orders where po_no = :'po2';
select status from material_indents where id = 502;
select '--- price user view';
select count(*) from v_item_rate_history;
select set_config('app.uid', '00000000-0000-0000-0000-000000000012', false);
select count(*) from v_item_rate_history;
