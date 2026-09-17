"use client";
// update394: ATTENDANCE RULES — the single-source-of-truth editors behind /calendar/rules.
// Every write goes through a SECURITY DEFINER function gated on Director / attendance:manage.
import { supabase, isDemo } from "./supabase";

export const CATS = [["labour", "Workers / Labour"], ["site_staff", "Site Staff"], ["office_staff", "Office Staff"]];
export const SUN_CODES = [["weekly_off", "Weekly Off"], ["working", "Working Day"], ["special_pay", "Special Pay"]];
export const ruleCode = r => (!r || r.weekday_off == null) ? "working" : (r.is_paid_off ? "weekly_off" : "special_pay");

const clean = e => {
  const m = String(e?.message || e || "Something went wrong");
  if (/fn_rules_|fn_worker_upcoming|schema cache|holiday_reason|holiday_set_by/i.test(m)) return "Run pipeskool_attendance_rules.sql (update 394) in Supabase first.";
  return m.replace(/^.*?ERROR:\s*/i, "");
};
const call = async (fn, args) => { if (isDemo) return { ok: false, error: "Demo mode." }; const { error } = await supabase.rpc(fn, args); return error ? { ok: false, error: clean(error) } : { ok: true }; };

export const setWorkerOverride = (workerId, date, mult, reason) => call("fn_rules_set_worker_override", { p_worker_id: Number(workerId), p_on_date: date, p_multiplier: mult == null ? null : Number(mult), p_reason: reason || null });
export const setStaffOverride  = (userId, date, mult, reason)   => call("fn_rules_set_staff_override",  { p_user_id: Number(userId),   p_on_date: date, p_multiplier: mult == null ? null : Number(mult), p_reason: reason || null });
export const setTypeDefaults   = (code, present, absent)        => call("fn_rules_set_type_defaults",   { p_code: code, p_present: present, p_absent: absent });
export const setSundayRule     = (siteId, code)                 => call("fn_rules_set_sunday",          { p_site_id: Number(siteId), p_code: code });

export async function getOverrides(from, to) {
  if (isDemo) return [];
  const { data, error } = await supabase.rpc("fn_rules_overrides", { p_from: from, p_to: to });
  if (error) throw new Error(clean(error));
  return data || [];
}
export async function getSundayRules() {
  if (isDemo) return {};
  const { data, error } = await supabase.from("sunday_site_rules").select("site_id, weekday_off, is_paid_off, paid_off_multiplier_worked");
  if (error) throw new Error(clean(error));
  const m = {}; (data || []).forEach(r => { m[String(r.site_id)] = r; }); return m;
}
export async function getTypesList() {
  if (isDemo) return [];
  const { data, error } = await supabase.from("holiday_types").select("*").order("code");
  if (error) throw new Error(clean(error));
  return data || [];
}
export async function getPeople() {   // for the Add Override picker
  if (isDemo) return { workers: [], staff: [] };
  const [{ data: w }, { data: s }] = await Promise.all([
    supabase.from("workers").select("id, full_name, site_id, sites:site_id(name)").eq("is_active", true).order("full_name"),
    supabase.from("app_users").select("id, full_name, role, site_id").eq("is_active", true).order("full_name"),
  ]);
  return { workers: w || [], staff: s || [] };
}
// worker punch screen (anon) — holidays today + next 3 days
export async function getWorkerUpcomingHolidays(workerId) {
  if (isDemo || !workerId) return [];
  const { data, error } = await supabase.rpc("fn_worker_upcoming_holidays", { p_worker_id: Number(workerId) });
  return error ? [] : (data || []);
}
// staff/supervisors of the affected sites (all active staff when the holiday is company-wide)
export async function staffForSites(siteIds) {
  if (isDemo) return [];
  if (!siteIds || !siteIds.length) { const { data } = await supabase.from("app_users").select("id").eq("is_active", true); return (data || []).map(u => u.id); }
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from("app_users").select("id").eq("is_active", true).in("site_id", siteIds),
    supabase.from("user_sites").select("user_id").in("site_id", siteIds),
  ]);
  return [...new Set([...(a || []).map(u => u.id), ...(b || []).map(u => u.user_id)])];
}
