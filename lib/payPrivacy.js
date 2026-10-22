// update471: PAY PRIVACY — who may see wages / salaries, and the only way the app reads them.
// workers.daily_wage and app_users.monthly_salary are not readable directly any more (column revoke, update471
// phase 2). They are read from two database views that return rows ONLY for people allowed to see pay
// (fn_can_view_salary(): Director, Director-access, the Wages "view" right or the Manage-staff admin right — never a Supervisor):
//   workers_pay (id, daily_wage)      staff_pay (id, monthly_salary)
// A Supervisor therefore gets nothing back from the server, whatever screen or tool he uses.
import { supabase, isDemo } from "./supabase";
import { getSession, canAnySite, hasAdminCap } from "./auth";

// UI mirror of fn_can_view_salary() — decides whether salary fields and actions are drawn at all.
export function canSeeSalary(s = getSession()) {
  if (!s) return false;
  if (String(s.role || "").toLowerCase() === "supervisor") return false;
  return s.role === "director" || canAnySite(s, "wages", "view") || hasAdminCap(s, "manage_staff");
}

async function payMap(view, col, ids) {
  const list = [...new Set((ids || []).map(Number).filter(Boolean))];
  const out = {};
  if (isDemo || !list.length) return out;
  for (let i = 0; i < list.length; i += 300) {
    const { data } = await supabase.from(view).select(`id, ${col}`).in("id", list.slice(i, i + 300));
    (data || []).forEach(r => { out[r.id] = r[col]; });
  }
  return out;
}
// { workerId: daily_wage } — empty for people without pay access
export const workerWages = ids => payMap("workers_pay", "daily_wage", ids);
// { staffUserId: monthly_salary } — empty for people without pay access
export const staffSalaries = ids => payMap("staff_pay", "monthly_salary", ids);

// merge helpers: put the pay field back on rows read from workers / app_users (null when hidden)
export async function withWorkerWage(rows, key = "id") {
  if (!rows?.length) return rows || [];
  const m = await workerWages(rows.map(r => r?.[key]));
  return rows.map(r => (r ? { ...r, daily_wage: m[r[key]] ?? null } : r));
}
export async function withStaffSalary(rows, key = "id") {
  if (!rows?.length) return rows || [];
  const m = await staffSalaries(rows.map(r => r?.[key]));
  return rows.map(r => (r ? { ...r, monthly_salary: m[r[key]] ?? null } : r));
}
