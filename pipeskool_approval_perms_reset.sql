-- =============================================================================
-- PIPESKOOL — update238b: APPROVAL PERMISSIONS RESET (Director-only in practice)
--
-- POLICY (Keyal, 27 Aug): the gating stays a flexible per-module permission system,
-- but NO non-Director role holds any approval module by default. A specific module
-- can be handed to a specific person later from Access Rights, with no code change.
--
-- Directors are NOT listed in the permissions table at all — fn_is_director() short-
-- circuits every check — so this file only has to clear non-Director grants.
--
-- WHAT IT CLEARS (allowed = false; rows are kept so Access Rights still shows the
-- tick boxes, and so this is reversible by re-ticking rather than re-seeding):
--     money.approve   money.manage      <- petty cash, expense claims, advances, returns
--     wages.approve   wages.manage      <- the alternate path into the same money approvals
--     leave.approve   leave.manage      <- leave requests
--     indent.approve                    <- purchase orders
--     stock.approve                     <- new items awaiting review
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH:
--   * indent.manage and stock.manage — these also govern ordinary day-to-day work
--     (issuing POs, editing the item master). Clearing them would stop storekeepers
--     working. fn_approve_item and fn_po_approve are guarded separately, so leaving
--     these in place does not grant approval rights.
--   * the view_all_money admin capability (update162). Accountants and IT Executives
--     keep it, and it still lets them READ pending money across every site — that is
--     deliberate (Keyal, 27 Aug: view-only, no approve/reject anywhere). Reading is all
--     it grants; every approve path checks Director or money/wages approve|manage.
--   * anything a person needs to RAISE requests (create), or to see their own rows.
--
-- RUN THE PREVIEW FIRST. Section 1 changes nothing — read it, then run section 2.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

-- ---------- 1. PREVIEW — who is about to lose what (changes nothing) ----------
select u.full_name, u.role, p.module, p.action
  from permissions p
  join app_users u on u.id = p.user_id
 where p.allowed = true
   and u.role <> 'director'
   and (p.module, p.action) in (
        ('money','approve'), ('money','manage'),
        ('wages','approve'), ('wages','manage'),
        ('leave','approve'), ('leave','manage'),
        ('indent','approve'),
        ('stock','approve'))
 order by u.full_name, p.module, p.action;

-- ---------- 2. APPLY ----------
update permissions p
   set allowed = false
  from app_users u
 where u.id = p.user_id
   and p.allowed = true
   and u.role <> 'director'
   and (p.module, p.action) in (
        ('money','approve'), ('money','manage'),
        ('wages','approve'), ('wages','manage'),
        ('leave','approve'), ('leave','manage'),
        ('indent','approve'),
        ('stock','approve'));

notify pgrst, 'reload schema';

-- ---------- verification (SQL-Editor safe) ----------
select
  (select count(*) from permissions p join app_users u on u.id = p.user_id
    where p.allowed = true and u.role <> 'director'
      and (p.module, p.action) in (('money','approve'),('money','manage'),
           ('wages','approve'),('wages','manage'),('leave','approve'),('leave','manage'),
           ('indent','approve'),('stock','approve')))              as non_director_approvers_left,  -- expect 0
  (select count(*) from app_users where role = 'director' and is_active) as active_directors,       -- expect 2 (you + Ketul)
  (select count(*) from admin_rights where capability = 'view_all_money' and allowed)
                                                                    as view_all_money_kept,         -- unchanged
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity))
                                                                    as unlocked_tables_left;        -- expect 0
