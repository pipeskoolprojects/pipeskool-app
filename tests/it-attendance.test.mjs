// update479: IT Attendance Register — checks that need no browser or database. (The register itself is exercised by the
// Playwright run against the real SQL functions in a local PostgreSQL; see IT_ATTENDANCE_NOTES.md.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isITExecutiveRole } from "../lib/it-ui.mjs";

test("role gate: only the IT Executive role (however it is spelled) gets the new register", () => {
  for (const r of ["it_executive", "IT Executive", "It Executive", "it-executive"]) assert.equal(isITExecutiveRole(r), true, r);
  for (const r of ["director", "supervisor", "ho_admin", "hr", "site_manager", "office", "", null, "it_engineer"]) assert.equal(isITExecutiveRole(r), false, String(r));
});

test("SQL: every new function refuses non-IT callers, scopes to user_sites, and is additive only", () => {
  const sql = fs.readFileSync(new URL("../pipeskool_it_attendance_register.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.fn_att_it_me\(\)/);
  assert.match(sql, /<> 'itexecutive'[\s\S]*?errcode = '42501'/, "non-IT → 42501 (HTTP 403)");
  assert.match(sql, /from user_sites us\s+where us\.user_id = fn_att_it_me\(\)/, "scope = the caller's assigned sites");
  for (const fn of ["fn_att_it_summary", "fn_att_it_register", "fn_att_it_verify"]) assert.match(sql, new RegExp("create or replace function public\\." + fn));
  assert.match(sql, /fn_has_perm\('attendance', 'verify'\) or fn_has_perm\('attendance', 'manage'\)/, "verify keeps the classic right");
  assert.match(sql, /verify_status = 'pending' and a\.site_id = any\(v_scope\)/, "verify is idempotent and in scope");
  assert.match(sql, /insert into attendance_audit/, "audit row per verified record");
  assert.doesNotMatch(sql, /alter table|drop table (?!(if exists )?_)|create (table|index)(?! temp)|drop policy|create policy/i, "no schema or policy change (only temp tables)");
  assert.match(sql, /coalesce\(s\.shift_start, '09:00'::time\)/, "missing shift timings default to 09:00");
});

test("classic register is untouched for other roles (page keeps AttendanceClassic, selects by role)", () => {
  const page = fs.readFileSync(new URL("../app/attendance/page.js", import.meta.url), "utf8");
  assert.match(page, /function AttendanceClassic\(\)/);
  assert.match(page, /isITExecutiveRole\(getSession\(\)\?\.role\)/);
  assert.match(page, /🏢 Office Staff/, "classic tabs still there");
  const comp = fs.readFileSync(new URL("../components/ITAttendanceRegister.js", import.meta.url), "utf8");
  assert.doesNotMatch(comp, /[\u{1F300}-\u{1FAFF}]/u, "no emoji in the new UI");
  assert.match(comp, /prefers-reduced-motion/);
  assert.match(comp, /window\.confirm\(`Verify \$\{ids\.length\} pending entries/, "confirmation for Verify visible");
});
