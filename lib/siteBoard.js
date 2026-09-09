"use client";
// update339: SITE SUMMARY DASHBOARD — the filtering and per-site aggregation, in ONE place
// so the screen, the Excel export and the PDF route can never disagree about what is on it.
//
// Two things worth knowing about this board:
//
// 1. IT SHOWS EVERY ACTIVE SITE, EVERY MONTH. A site with nothing recorded gets a row of
//    zeros rather than vanishing. A missing row reads as "no cost"; a zero row reads as
//    "nothing recorded" — and only one of those is a statement you can act on.
//
// 2. LABOUR COST IS REAL; STAFF COST IS NOT SPLIT. Labour money comes from wage_payouts,
//    which the engine already attributes per site. Staff salary is ONE monthly figure per
//    person in staff_payouts with no site on it, so the staff tabs report DAYS and OT HOURS
//    per site — both facts drawn from attendance — and leave cost blank. Splitting a monthly
//    salary across sites needs a rule the Director has to choose; inventing one here would
//    put a number on screen that no one decided.
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
function personPasses(p, f) {
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

// ---------------------------------------------------------------------------
// buildSiteBoard
//   tab      "labour" | "site_staff" | "office"
//   people   from loadAttendanceGrid(...).people  (already carries .group)
//   pay      from loadPayrollSummary(...)         (rows + allSites)
// ---------------------------------------------------------------------------
export function buildSiteBoard({ tab, filters, people, pay }) {
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  const group = tab === "office" ? "office" : tab === "site_staff" ? "site_staff" : "labour";
  const isLabour = group === "labour";

  const matched = (people || []).filter(p => p.group === group && personPasses(p, f));
  const allowedWorkerIds = new Set(matched.map(p => p.wid));

  // start every active site at zero so nothing disappears in a quiet month
  const bySite = {};
  (pay?.allSites || []).forEach(s => {
    bySite[s.id] = { site_id: s.id, site: s.name, workers: new Set(), days: 0, otH: 0, basic: 0, otAmt: 0, generated: false };
  });
  const touch = (id, name) => {
    if (!bySite[id]) bySite[id] = { site_id: id, site: name || ("Site " + id), workers: new Set(), days: 0, otH: 0, basic: 0, otAmt: 0, generated: false };
    return bySite[id];
  };

  if (isLabour) {
    // money, straight from the payment record — only for workers that passed the filters
    (pay?.rows || []).forEach(r => {
      if (!allowedWorkerIds.has(r.worker_id)) return;
      const s = touch(r.site_id, r.site);
      if (r.days > 0) s.workers.add(r.worker_id);
      s.days += r.days; s.basic += r.basic; s.otAmt += r.otAmt; s.otH += Number(r.ot_hours || 0);
      s.generated = true;
    });
  } else {
    // staff: days and OT hours per site, from attendance. No cost — see the note above.
    matched.forEach(p => p.rows.forEach(r => {
      const s = touch(r.sid, r.site);
      if (r.daysPaid > 0) s.workers.add(p.wid);
      s.days += r.daysPaid; s.otH += r.otTotal;
    }));
  }

  const sites = Object.values(bySite)
    .map(s => ({ ...s, workers: s.workers.size, days: +s.days.toFixed(2), otH: +s.otH.toFixed(2),
                 basic: +s.basic.toFixed(2), otAmt: +s.otAmt.toFixed(2),
                 total: +(s.basic + s.otAmt).toFixed(2) }))
    .sort((a, b) => a.site.localeCompare(b.site));

  const grand = {
    workers: matched.length,                       // headcount, not a sum of per-site sets
    days: +sites.reduce((n, s) => n + s.days, 0).toFixed(2),
    otH: +sites.reduce((n, s) => n + s.otH, 0).toFixed(2),
    basic: +sites.reduce((n, s) => n + s.basic, 0).toFixed(2),
    otAmt: +sites.reduce((n, s) => n + s.otAmt, 0).toFixed(2),
    total: +sites.reduce((n, s) => n + s.total, 0).toFixed(2),
    people: matched.length,
    sitesWithActivity: sites.filter(s => s.days > 0).length,
  };

  // Reconciliation only means something for labour, and only with no filters on — a filtered
  // board is a subset by design and must not be reported as failing to reconcile.
  if (isLabour && !filtersActive(f)) {
    grand.workerGross = pay?.grand?.workerGross ?? 0;
    grand.workerNet = pay?.grand?.workerNet ?? 0;
    grand.reconciled = Math.abs((grand.workerGross || 0) - grand.total) < 0.5;
    grand.canReconcile = true;
  } else {
    grand.canReconcile = false;
  }

  return { tab: group, isLabour, sites, grand, matched };
}

// options for the filter dropdowns, taken from the people actually in this tab
export function boardOptions(people, tab) {
  const group = tab === "office" ? "office" : tab === "site_staff" ? "site_staff" : "labour";
  const s = new Set(), r = new Set(), c = new Set();
  (people || []).filter(p => p.group === group).forEach(p => {
    p.siteNames.forEach(n => s.add(n));
    if (p.designation) (p.isStaff ? r : c).add(p.designation);
  });
  return { sites: [...s].sort(), roles: [...r].sort(), cats: [...c].sort() };
}
