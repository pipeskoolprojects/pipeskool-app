"use client";
// update340: PAYROLL SUMMARY — the tab split and the filters, in ONE place so the screen,
// the Excel export and the PDF route can never disagree about what is on the page.
//
//   Office Staff / Site Staff  -> staff_payouts (one monthly row per person)
//   Workers / Labour           -> wage_payouts  (unchanged from update278)
//
// The tab a person lands in comes from their MASTER ASSIGNMENT, exactly as the Full
// Attendance Summary decides it, so the two screens can never put the same person in
// different sections.
export const EMPTY_FILTERS = { q: "", id: "", site: "", role: "", cat: "", status: "", ot: "" };

export function filtersActive(f) {
  return !!(f && (f.q || f.id || f.site || f.role || f.cat || f.status || f.ot));
}

// Encode/decode for the PDF route, so a download matches what is on screen.
export function filtersToQuery(f, tab) {
  const p = new URLSearchParams();
  if (tab) p.set("board", tab);
  Object.entries(f || {}).forEach(([k, v]) => { if (v) p.set("f_" + k, v); });
  const s = p.toString();
  return s ? "&" + s : "";
}
export function filtersFromQuery(sp) {
  const f = { ...EMPTY_FILTERS };
  Object.keys(EMPTY_FILTERS).forEach(k => { const v = sp.get("f_" + k); if (v) f[k] = v; });
  return { filters: f, tab: sp.get("board") || "labour" };
}

// ---- does one PERSON pass the filters? people come from the attendance grid ----
export function personPasses(p, f) {
  const q = (f.q || "").trim().toLowerCase(), id = (f.id || "").trim().toLowerCase();
  if (q && !p.worker.toLowerCase().includes(q)) return false;
  if (id && !(String(p.mobile).toLowerCase().includes(id) || String(p.wid) === id)) return false;
  if (f.site && !p.siteNames.includes(f.site)) return false;
  if (f.role && p.designation !== f.role) return false;
  if (f.cat && p.designation !== f.cat) return false;
  if (f.status === "present" && p.p === 0) return false;
  if (f.status === "half" && p.h === 0) return false;
  if (f.status === "absent" && p.a === 0) return false;
  if (f.status === "leave" && !p.rows.some(r => r.leave && r.leave.size)) return false;
  if (f.status === "review" && p.review === 0) return false;
  if (f.ot === "yes" && !p.otTotal) return false;
  if (f.ot === "no" && p.otTotal) return false;
  return true;
}

// which group does this tab want?
export const groupOf = tab => tab === "office" ? "office" : tab === "site_staff" ? "site_staff" : "labour";

// options for the filter dropdowns, from the people actually in this tab
export function boardOptions(people, tab) {
  const group = groupOf(tab);
  const s = new Set(), r = new Set(), c = new Set();
  (people || []).filter(p => p.group === group).forEach(p => {
    p.siteNames.forEach(n => s.add(n));
    if (p.designation) (p.isStaff ? r : c).add(p.designation);
  });
  return { sites: [...s].sort(), roles: [...r].sort(), cats: [...c].sort() };
}

// the set of worker/staff ids this tab + these filters allow through
export function allowedPeople(people, tab, filters) {
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  const group = groupOf(tab);
  return (people || []).filter(p => p.group === group && personPasses(p, f));
}
