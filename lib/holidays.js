"use client";
// update246 → 386: THE holiday module every surface reads. One place for the rule so a
// payslip, muster and register never disagree.
//
// UPDATE 386 introduces holiday_types + per-category multipliers + per-site Sunday. The
// old getHolidayMap()/holidayDayValue() calls still work — they are the fallback when a
// holiday row has no type_code. Both payroll engines have been rewritten to call the new
// resolver holidayFor(dateStr, siteId, category, status).
import { supabase, isDemo } from "./supabase";

// ---- pre-386 backward-compatible surface ----
export async function getHolidayMap(siteId, from, to, audience = "labour") {
  if (isDemo) return {};
  const { data } = await supabase.from("company_holidays")
    .select("on_date, name, site_ids, applies_to")
    .gte("on_date", from).lt("on_date", to);
  const map = {};
  (data || []).forEach(h => {
    const list = h.site_ids || [];
    const siteOk = list.length === 0 || list.map(Number).includes(Number(siteId));
    const who = h.applies_to || "both";
    const audOk = who === "both" || who === audience;
    if (siteOk && audOk) map[h.on_date] = h.name;
  });
  return map;
}

export async function getHolidaysBetween(from, to) {
  if (isDemo) return [];
  const { data } = await supabase.from("company_holidays")
    .select("id, on_date, name, kind, site_ids, applies_to, note, type_code, category_rules")
    .gte("on_date", from).lte("on_date", to).order("on_date");
  return data || [];
}

// The classic rule — kept as fallback. present=2×, half=½(2×)=1×, absent=1× paid.
// Supports a numeric override the old Day Payments panel used to write.
export function holidayDayValue(status, override) {
  if (typeof override === "number" && !Number.isNaN(override)) {
    if (status === "present")  return { units: override,       tag: "custom",       label: "Holiday · " + fmtX(override) + " pay" };
    if (status === "half_day") return { units: override * 0.5, tag: "custom_half",  label: "Holiday · " + fmtX(override) + " (half day)" };
    return { units: override, tag: "custom_paid", label: "Holiday · " + fmtX(override) + " paid" };
  }
  if (status === "present")  return { units: 2, tag: "2x",   label: "Holiday · 2× pay" };
  if (status === "half_day") return { units: 1, tag: "half", label: "Holiday · 2× (half day)" };
  return { units: 1, tag: "paid", label: "Holiday · Paid" };
}
function fmtX(n) { const s = Number(n).toFixed(2).replace(/\.?0+$/, ""); return s + "×"; }

// ---- 386: category-aware resolver ----
// audiences are labour vs both/staff on the OLD applies_to axis. Categories on the NEW axis
// are labour | site_staff | office_staff. "audience" is mapped to a set of matching categories.
const AUD_TO_CATS = {
  labour: ["labour"],
  staff:  ["site_staff", "office_staff"],
  both:   ["labour", "site_staff", "office_staff"],
};

let _cachedTypes = null;
export async function getHolidayTypes() {
  if (isDemo) return {};
  if (_cachedTypes) return _cachedTypes;
  const { data } = await supabase.from("holiday_types").select("*");
  const by = {};
  (data || []).forEach(t => { by[t.code] = t; });
  _cachedTypes = by; return by;
}
export function _resetHolidayCache() { _cachedTypes = null; }   // for tests / edit hooks

// Load one window ready for the engines to iterate.
//   returns { byDate: {"2026-08-28": [row, row]}, types: {...}, sundayRules: {siteId: rule} }
export async function getHolidayContext(from, to) {
  if (isDemo) return { byDate: {}, types: {}, sundayRules: {} };
  const [{ data: hols }, types, { data: sunRules }] = await Promise.all([
    supabase.from("company_holidays")
      .select("on_date, name, site_ids, applies_to, type_code, category_rules")
      .gte("on_date", from).lt("on_date", to),
    getHolidayTypes(),
    supabase.from("sunday_site_rules").select("site_id, weekday_off, is_paid_off, paid_off_multiplier_worked"),
  ]);
  const byDate = {};
  (hols || []).forEach(h => { (byDate[h.on_date] = byDate[h.on_date] || []).push(h); });
  const sundayRules = {};
  (sunRules || []).forEach(r => { sundayRules[String(r.site_id)] = r; });
  return { byDate, types, sundayRules };
}

// resolve() answers a single question:
//   for (this date, this site, this category, this attendance status)
//   how many day-units of the normal daily rate does the wage engine owe?
//
//   ctx     — the object from getHolidayContext
//   date    — "yyyy-mm-dd"
//   siteId  — worker/staff's site
//   category — "labour" | "site_staff" | "office_staff"
//   status  — attendance status; "present" | "half_day" | "absent" | "no_record"
//   override — numeric attendance.holiday_multiplier (workers) or staff_pay_days.multiplier (staff)
//
// Returns { units, tag, label, source } or null when the date is a normal day.
export function resolveHoliday(ctx, date, siteId, category, status, override) {
  // 1. explicit per-row override wins
  if (typeof override === "number" && !Number.isNaN(override)) {
    const dv = holidayDayValue(status, override);
    return { ...dv, source: "override" };
  }

  // 2. holiday rows on this date, filtered by site and category
  const rows = (ctx.byDate[date] || []).filter(h => siteApplies(h, siteId));
  if (rows.length) {
    // pick the first row whose category_rules/applies_to touches this category
    const row = rows.find(h => categoryApplies(h, category)) || null;
    if (row) {
      const mult = pickCategoryMultiplier(row, ctx.types, category, status);
      if (mult != null) {
        const type = ctx.types[row.type_code] || null;
        // half-day scales the "present" multiplier by 0.5, same rule as before.
        const units = status === "half_day" ? mult * 0.5 : mult;
        const label = "Holiday · " + fmtX(mult) + " · " + row.name;
        return { units, tag: type?.code || "hol", label, source: "holiday", holiday: row.name, type: type?.code };
      }
      // row exists for this category but its rules didn't emit — fall through to classic
      return { ...holidayDayValue(status), source: "holiday_classic", holiday: row.name };
    }
  }

  // 3. Sunday — per-site rule, else caller's default
  // (the engines already have a settings-driven Sunday rule; this branch just carries the
  //  per-site override so the caller can consult it. Returning null keeps that path stable.)
  return null;
}

function siteApplies(h, siteId) {
  const list = h.site_ids || [];
  return list.length === 0 || list.map(Number).includes(Number(siteId));
}
function categoryApplies(h, category) {
  // If category_rules is set, the categories are its keys (or "*").
  if (h.category_rules && typeof h.category_rules === "object") {
    return h.category_rules[category] != null || h.category_rules["*"] != null;
  }
  // Otherwise map the classic applies_to to categories.
  const cats = AUD_TO_CATS[h.applies_to || "both"] || [];
  return cats.includes(category);
}
function pickCategoryMultiplier(h, types, category, status) {
  const key = status === "present" || status === "half_day" ? "present" : "absent";
  // per-row map first
  if (h.category_rules) {
    const cat = h.category_rules[category] || h.category_rules["*"];
    if (cat != null) {
      // shape can be a scalar (present multiplier) or { present, absent }
      if (typeof cat === "number") return cat;
      if (typeof cat === "object" && cat[key] != null) return Number(cat[key]);
    }
  }
  // type default
  const t = h.type_code ? types[h.type_code] : null;
  if (t) {
    const m = key === "present" ? t.default_multipliers_present : t.default_multipliers_absent;
    if (m && m[category] != null) return Number(m[category]);
    if (m && m["*"]      != null) return Number(m["*"]);
    // counts_as_paid_day=false and absent → 0 units
    if (key === "absent" && !t.counts_as_paid_day) return 0;
  }
  return null;   // let the caller fall back to holidayDayValue()
}

// ---- Sunday resolver, small and separate ----
export function sundayRuleFor(ctx, siteId, weekday) {
  const r = ctx.sundayRules[String(siteId)];
  if (r && Number(r.weekday_off) === weekday) return r;
  return null;
}


// ---- saveHoliday / deleteHoliday (kept from update 264; the calendar imports these) ----
export async function saveHoliday(f) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const row = {
    on_date: f.on_date,
    name: String(f.name || "").trim(),
    kind: f.kind || null,
    site_ids: Array.isArray(f.site_ids) ? f.site_ids.map(Number) : [],
    applies_to: f.applies_to || "both",
    note: String(f.note || "").trim() || null,
    // update386: category-aware columns. Nullable — an old row saved without them keeps
    // the classic 2×-worked / 1×-absent rule.
    type_code: f.type_code || null,
    category_rules: f.category_rules && Object.keys(f.category_rules).length ? f.category_rules : null,
  };
  if (!row.on_date || !row.name) return { ok: false, error: "Date and name are required." };
  const { error } = f.id
    ? await supabase.from("company_holidays").update(row).eq("id", f.id)
    : await supabase.from("company_holidays").insert(row);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteHoliday(id) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("company_holidays").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// update386: dry-run + commit copy of one year's holidays into another year.
export async function copyHolidaysYear(fromYear, toYear, dryRun = true) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_copy_holidays", {
    p_from_year: Number(fromYear), p_to_year: Number(toYear), p_dry_run: !!dryRun,
  });
  return error ? { ok: false, error: error.message } : { ok: true, data };
}
