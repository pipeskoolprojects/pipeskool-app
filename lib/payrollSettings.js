// update276: PAYROLL RULES — one place (app_settings) read by the payroll engine and the
// Settings tab. Nothing about PT / OT divisor / weekly-off pay is hardcoded in pages.
import { supabase, isDemo } from "./supabase";

export const PAYROLL_DEFAULTS = {
  period_start_day: 1,           // pay period starts on this day of month
  period_label: "Monthly wages",
  pt_threshold: 12000,           // gross above this => PT applies (Gujarat slab)
  pt_amount: 200,
  ot_divisor: 8,                 // OT rate = daily rate ÷ this (site may override)
  wo_paid: true,                 // weekly off paid for labour (Director, 1 Sep)
  wo_weekday: 0,                 // 0 = Sunday
};
const KEYS = Object.keys(PAYROLL_DEFAULTS);

export async function getPayrollSettings() {
  if (isDemo) return { ...PAYROLL_DEFAULTS };
  const { data, error } = await supabase.from("app_settings").select("key, value").like("key", "payroll.%");
  if (error) throw new Error("Could not load payroll settings: " + error.message);
  const out = { ...PAYROLL_DEFAULTS };
  (data || []).forEach(r => {
    const k = r.key.replace(/^payroll\./, "");
    if (!(k in out)) return;
    const d = PAYROLL_DEFAULTS[k];
    out[k] = typeof d === "boolean" ? String(r.value) === "true" : typeof d === "number" ? Number(r.value) : String(r.value);
  });
  return out;
}

export async function savePayrollSettings(s) {
  if (isDemo) return { ok: true };
  const rows = KEYS.filter(k => k in s).map(k => ({ key: "payroll." + k, value: String(s[k]), updated_at: new Date().toISOString() }));
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: /row-level security/i.test(error.message) ? "Only a Director can change payroll rules." : error.message };
  return { ok: true };
}

// Effective OT divisor for a site: explicit site override > company setting > 8
export function effectiveOtDivisor(site, settings) {
  const s = Number(site?.ot_divisor); if (s > 0) return s;
  const c = Number(settings?.ot_divisor); if (c > 0) return c;
  return 8;
}

// update279: LOCAL calendar date -> yyyy-mm-dd. toISOString() converts to UTC, which in India
// turned "1 Aug 00:00" into "31 Jul" and collapsed month ranges to nothing.
export function isoLocal(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function monthBounds(monthStr) {   // { from: yyyy-mm-01, to: first day of next month }
  const [y, m] = monthStr.split("-").map(Number);
  return { from: `${monthStr}-01`, to: isoLocal(new Date(y, m, 1)), daysInMonth: new Date(y, m, 0).getDate() };
}

// Weekly-off dates (yyyy-mm-dd) inside [from, to)
export function weeklyOffDates(from, to, weekday = 0) {
  const out = [];
  const d = new Date(from + "T00:00:00"), end = new Date(to + "T00:00:00");
  for (; d < end; d.setDate(d.getDate() + 1)) if (d.getDay() === Number(weekday)) out.push(isoLocal(d));
  return out;
}
