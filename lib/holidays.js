"use client";
// update246: FESTIVAL HOLIDAYS — one place that answers "is this date a paid holiday here?"
// Both payroll generators, the attendance register and the muster all read from here, so the
// rule can never drift between what a payslip says and what the register shows.
import { supabase, isDemo } from "./supabase";

// holidays that apply to a site inside [from, to). site_ids null/empty = every site.
export async function getHolidayMap(siteId, from, to, audience = "labour") {
  if (isDemo) return {};
  const { data } = await supabase.from("company_holidays")
    .select("on_date, name, site_ids, applies_to")
    .gte("on_date", from).lt("on_date", to);
  const map = {};
  (data || []).forEach(h => {
    const list = h.site_ids || [];
    const siteOk = list.length === 0 || list.map(Number).includes(Number(siteId));
    // update293: PAY GUARD - only holidays that apply to this audience reach a wage.
    // Observances (applies_to none) and the other audience never do.
    const who = h.applies_to || "both";
    const audOk = who === "both" || who === audience;
    if (siteOk && audOk) map[h.on_date] = h.name;
  });
  return map;   // { "2026-08-28": "Raksha Bandhan" }
}

// every holiday in a window, for calendars and badges (no site filter applied)
export async function getHolidaysBetween(from, to) {
  if (isDemo) return [];
  const { data } = await supabase.from("company_holidays")
    .select("id, on_date, name, kind, site_ids, applies_to, note")   // update293
    .gte("on_date", from).lte("on_date", to).order("on_date");
  return data || [];
}

// THE RULE, in one function. Both generators call it so labour and staff cannot diverge.
//   status: "present" | "half_day" | "absent" | null (no punch at all)
// Returns how many DAY-UNITS of the normal daily rate that date is worth, plus a tag.
export function holidayDayValue(status, override) {
  // update382: if the calendar set a per-worker multiplier for this day, it beats the default.
  //   override is a numeric like 2.0, 1.5, or 0. present/half_day scale by attendance the same
  //   way — half_day still pays half of the chosen multiplier. Absent honours the override
  //   directly (0 means "not paid for this day", 1 means "paid 1×", etc.).
  if (typeof override === "number" && !Number.isNaN(override)) {
    if (status === "present")  return { units: override,       tag: "custom", label: "Holiday \u00b7 " + fmtX(override) + " pay" };
    if (status === "half_day") return { units: override * 0.5, tag: "custom_half", label: "Holiday \u00b7 " + fmtX(override) + " (half day)" };
    return { units: override, tag: "custom_paid", label: "Holiday \u00b7 " + fmtX(override) + " paid" };
  }
  if (status === "present")  return { units: 2, tag: "2x",   label: "Holiday \u00b7 2\u00d7 pay" };
  if (status === "half_day") return { units: 1, tag: "half", label: "Holiday \u00b7 2\u00d7 (half day)" };
  return { units: 1, tag: "paid", label: "Holiday \u00b7 Paid" };   // absent or no punch
}
function fmtX(n) { const s = Number(n).toFixed(2).replace(/\.?0+$/, ""); return s + "\u00d7"; }


// ---------------- update264: HOLIDAY MANAGEMENT (calendar Add/Edit/Delete) ----------------
// One table, one source of truth: these write the SAME company_holidays rows that payroll,
// the muster and the attendance register already read. DB policy (update264 SQL) restricts
// writes to Director / attendance-manage; the UI mirrors that but the database is the gate.
export async function saveHoliday({ id, on_date, name, site_ids, applies_to, note }) {   // update293
  if (isDemo) return { ok: true };
  if (!on_date) return { ok: false, error: "Pick the holiday date." };
  if (!name || !name.trim()) return { ok: false, error: "Enter the holiday name." };
  const payload = { on_date, name: name.trim(), kind: "holiday",
    site_ids: site_ids && site_ids.length ? site_ids : null,   // null = ALL sites (246 rule)
    applies_to: ["both", "staff", "labour", "none"].includes(applies_to) ? applies_to : "both",
    note: (note || "").trim() || null };   // update293
  const q = id
    ? supabase.from("company_holidays").update(payload).eq("id", id)
    : supabase.from("company_holidays").insert(payload);
  const { error } = await q;
  if (error) {
    if (String(error.message || "").includes("row-level security"))
      return { ok: false, error: "Only a Director (or attendance manager) can add or change holidays." };
    if (String(error.message || "").includes("duplicate"))
      return { ok: false, error: "That holiday already exists on that date." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteHoliday(id) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("company_holidays").delete().eq("id", id);
  if (error) {
    if (String(error.message || "").includes("row-level security"))
      return { ok: false, error: "Only a Director (or attendance manager) can delete holidays." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
