"use client";
// update246: FESTIVAL HOLIDAYS — one place that answers "is this date a paid holiday here?"
// Both payroll generators, the attendance register and the muster all read from here, so the
// rule can never drift between what a payslip says and what the register shows.
import { supabase, isDemo } from "./supabase";

// holidays that apply to a site inside [from, to). site_ids null/empty = every site.
export async function getHolidayMap(siteId, from, to) {
  if (isDemo) return {};
  const { data } = await supabase.from("company_holidays")
    .select("on_date, name, site_ids")
    .gte("on_date", from).lt("on_date", to);
  const map = {};
  (data || []).forEach(h => {
    const list = h.site_ids || [];
    const applies = list.length === 0 || list.map(Number).includes(Number(siteId));
    if (applies) map[h.on_date] = h.name;
  });
  return map;   // { "2026-08-19": "Raksha Bandhan" }
}

// every holiday in a window, for calendars and badges (no site filter applied)
export async function getHolidaysBetween(from, to) {
  if (isDemo) return [];
  const { data } = await supabase.from("company_holidays")
    .select("id, on_date, name, kind, site_ids")
    .gte("on_date", from).lte("on_date", to).order("on_date");
  return data || [];
}

// THE RULE, in one function. Both generators call it so labour and staff cannot diverge.
//   status: "present" | "half_day" | "absent" | null (no punch at all)
// Returns how many DAY-UNITS of the normal daily rate that date is worth, plus a tag.
export function holidayDayValue(status) {
  if (status === "present")  return { units: 2, tag: "2x", label: "Holiday \u00b7 2\u00d7 pay" };
  if (status === "half_day") return { units: 1, tag: "half", label: "Holiday \u00b7 2\u00d7 (half day)" };
  return { units: 1, tag: "paid", label: "Holiday \u00b7 Paid" };   // absent or no punch
}
