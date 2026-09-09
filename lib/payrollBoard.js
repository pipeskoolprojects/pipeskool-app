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


// update341: getStaffPayouts() returns its own flattened shape (salary/working/present/…),
// but the staff table, the Excel export and the PDF route were all written against the raw
// staff_payouts column names (monthly_salary/working_days/days_present/…). Every numeric
// column therefore rendered blank, the name was overwritten with "#<id>", and user_id was
// dropped entirely so NO row ever matched. Normalise once, here, and use it everywhere.
export function staffRowsFor(staffPayouts, allowed) {
  const uids = new Set((allowed || []).map(p => p.uid).filter(Boolean).map(Number));
  return (staffPayouts || [])
    .filter(s => uids.has(Number(s.user_id)))
    .map(s => ({
      ...s,
      monthly_salary: Number(s.salary || 0),
      working_days: Number(s.working || 0),
      days_present: Number(s.present || 0),
      days_absent: Number(s.absent || 0),
      deduction: Number(s.deduction || 0),
      ot_hours: Number(s.ot || 0),
      ot_amount: Number(s.otAmt || 0),
      advances_deducted: Number(s.adv || 0),
      net: Number(s.net || 0),
    }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

// update342: STAFF COST ON THE SITE SUMMARY DASHBOARD.
//
// Until now the board was labour-only, so HEAD OFFICE — a staff-only site — showed ₹0
// despite having full attendance. Staff now appear alongside labour, which needs a rule
// for putting ONE monthly salary against SEVERAL sites. The rule, stated plainly:
//
//   BASIC  is split pro-rata by PAID DAYS at each site.
//          earned = monthly_salary − deduction   (what the month actually cost)
//          site share = earned × (days at that site ÷ that person's total paid days)
//   OT     is NOT pro-rata. OT hours are recorded per day per site, so OT amount is split
//          by the ACTUAL OT hours at each site — exact, not apportioned.
//
// For anyone who worked a single site all month — every Head Office staff member — the
// split is 100% to that site and nothing is approximated at all. Only a genuinely
// multi-site person (Kishan, Satyendra) is apportioned, and only their basic.
//
// A staff member with a generated salary but NO attendance anywhere is charged wholly to
// their primary assigned site; their salary was still paid and has to land somewhere.
export function mergeStaffIntoSites({ sites, people, staffPayouts, staffPrimarySite }) {
  const bySite = {};
  (sites || []).forEach(s => {
    bySite[s.site_id] = { ...s, staff: 0, staffDays: 0, staffBasic: 0, staffOtH: 0, staffOtAmt: 0 };
  });
  const touch = (id, name) => {
    if (!bySite[id]) bySite[id] = { site_id: id, site: name || ("Site " + id), workers: 0, days: 0, basic: 0, otH: 0, otAmt: 0, total: 0, staff: 0, staffDays: 0, staffBasic: 0, staffOtH: 0, staffOtAmt: 0 };
    return bySite[id];
  };

  // update343: HEADCOUNT AND DAYS COME FROM ATTENDANCE, MONEY COMES FROM THE PAYOUTS.
  // 342 walked the payout rows for everything, so a staff member with attendance but no
  // generated salary row was invisible: Head Office read 5 staff / 16 days while its own
  // attendance sheet listed 6 people and 17 days. Attendance is the record of who worked;
  // a missing payout means the salary has not been generated yet, not that nobody was there.
  const staffPeople = (people || []).filter(p => p.isStaff);
  staffPeople.forEach(p => p.rows.forEach(r => {
    const s = touch(r.sid, r.site);
    if (Number(r.daysPaid || 0) > 0) s.staff += 1;
    s.staffDays += Number(r.daysPaid || 0);
    s.staffOtH += Number(r.otTotal || 0);
  }));

  const byUid = {};
  staffPeople.forEach(p => { if (p.uid) byUid[p.uid] = p; });

  let staffEarnedTotal = 0, unattributed = 0;
  const paidUids = new Set();

  (staffPayouts || []).forEach(sp => {
    const earned = Math.max(Number(sp.monthly_salary ?? sp.salary ?? 0) - Number(sp.deduction || 0), 0);
    const otAmt = Number(sp.ot_amount ?? sp.otAmt ?? 0);
    staffEarnedTotal += earned + otAmt;
    paidUids.add(Number(sp.user_id));

    const person = byUid[Number(sp.user_id)];
    const rows = person?.rows || [];
    const totalDays = rows.reduce((n, r) => n + Number(r.daysPaid || 0), 0);
    const totalOtH = rows.reduce((n, r) => n + Number(r.otTotal || 0), 0);

    if (!rows.length || totalDays <= 0) {
      // salary generated but no attendance to split against — charge it to the primary site
      const pid = staffPrimarySite?.[Number(sp.user_id)];
      if (pid != null) { const s = touch(pid); s.staffBasic += earned; s.staffOtAmt += otAmt; }
      else { unattributed += earned + otAmt; }
      return;
    }
    rows.forEach(r => {
      const s = touch(r.sid, r.site);
      const dayShare = Number(r.daysPaid || 0) / totalDays;
      const otShare = totalOtH > 0 ? Number(r.otTotal || 0) / totalOtH : dayShare;
      s.staffBasic += earned * dayShare;
      s.staffOtAmt += otAmt * otShare;
    });
  });

  // staff who worked but whose salary has not been generated — their days show, their cost
  // cannot, and the screen has to say so rather than quietly under-reporting the month.
  const awaitingPayroll = staffPeople.filter(p => p.uid && !paidUids.has(Number(p.uid))
    && p.rows.some(r => Number(r.daysPaid || 0) > 0)).map(p => p.worker);

  const out = Object.values(bySite).map(s => {
    const basic = +(Number(s.basic || 0) + s.staffBasic).toFixed(2);
    const otAmt = +(Number(s.otAmt || 0) + s.staffOtAmt).toFixed(2);
    return {
      ...s,
      headcount: Number(s.workers || 0) + s.staff,
      days: +(Number(s.days || 0) + s.staffDays).toFixed(2),
      otH: +(Number(s.otH || 0) + s.staffOtH).toFixed(2),
      basic, otAmt,
      total: +(basic + otAmt).toFixed(2),
      staffDays: +s.staffDays.toFixed(2),
      staffBasic: +s.staffBasic.toFixed(2),
      staffOtAmt: +s.staffOtAmt.toFixed(2),
    };
  }).sort((a, b) => a.site.localeCompare(b.site));

  const grand = {
    workers: out.reduce((n, s) => n + Number(s.workers || 0), 0),
    staff: out.reduce((n, s) => n + s.staff, 0),
    headcount: out.reduce((n, s) => n + s.headcount, 0),
    days: +out.reduce((n, s) => n + s.days, 0).toFixed(2),
    otH: +out.reduce((n, s) => n + s.otH, 0).toFixed(2),
    basic: +out.reduce((n, s) => n + s.basic, 0).toFixed(2),
    otAmt: +out.reduce((n, s) => n + s.otAmt, 0).toFixed(2),
    total: +out.reduce((n, s) => n + s.total, 0).toFixed(2),
    staffEarned: +staffEarnedTotal.toFixed(2),
    unattributed: +unattributed.toFixed(2),
    awaitingPayroll,
  };
  return { sites: out, grand };
}
