insert into sites (id, name) values (1, 'KEI Sanand'), (2, 'SOUL Campus'), (12, 'Citadel');
insert into app_users (id, full_name, auth_id, role) values
 (1, 'Keyal Shah', '00000000-0000-0000-0000-000000000001', 'director'),
 (7, 'Satyam', '00000000-0000-0000-0000-000000000007', 'it_executive'),
 (12, 'Purchase Exec', '00000000-0000-0000-0000-000000000012', 'project_coodinator'),
 (21, 'Site Sup', '00000000-0000-0000-0000-000000000021', 'supervisor'),
 (10, 'Sanjan', '00000000-0000-0000-0000-000000000010', 'storekeeper');
insert into permissions (user_id, site_id, module, action) values (12, 12, 'indent', 'create'), (12, 2, 'indent', 'create'), (21, 12, 'indent', 'view'), (10, 2, 'indent', 'view');
insert into vendors (id, name, is_active) values (1, 'CHIMANLAL SHANKARLAL SHAH', true), (2, 'ASTRAL DEPOT', true), (3, 'OLD VENDOR', false), (4, 'PIPE HOUSE', true);
