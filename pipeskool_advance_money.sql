-- =============================================================================
-- PIPESKOOL — update156: ADVANCE REQUESTS raise under MONEY rights
-- Bug: Hardening P2 mapped advance_salary_requests under the "wages" module,
-- but the app raises advances from the Money/Expense screens (money module).
-- Supervisors with Money->Create (like Amit) were refused by RLS:
--   "new row violates row-level security policy for advance_salary_requests".
-- Fix: RAISING an advance = Money->Create OR Wages->Create (either unlocks it).
-- Approving/paying stays exactly as P2 set it (wages-side, Accountant/Director).
-- Run in Supabase SQL Editor as ONE transaction.
-- STANDING RULE: take a backup from Admin -> Backup & Restore BEFORE running.
-- =============================================================================

drop policy if exists "add" on advance_salary_requests;
create policy "add" on advance_salary_requests for insert to authenticated
  with check (fn_has_perm('money','create') or fn_has_perm('wages','create'));

-- ---------- verification (SQL-Editor safe) ----------
select count(*) as advance_insert_policy
  from pg_policies
 where tablename = 'advance_salary_requests' and policyname = 'add'
   and with_check ilike '%money%';
-- expect: 1
