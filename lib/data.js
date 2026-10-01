import { supabase, isDemo } from "./supabase";
import { assignedSiteIds } from "./auth";
import { scoped, isScoped } from "./scope";   // update438b
import { todayLocal } from "./today";   // update449

// ---------- DEMO DATA (shown until Supabase is connected) ----------
const demoSites = [
  { id: 1, code: "KEI", name: "KEI Industries, Sanand" },
  { id: 2, code: "SOUL", name: "SOUL Campus, GIFT City" },
  { id: 3, code: "CREEK", name: "The Creek" },
];

const demoSummary = {
  present: 142, total: 156, otHours: 38, proxyPct: 9, pending: 5,
  sites: [
    { name: "KEI Industries, Sanand", sup: "S. Desai", proxy: 2, p: 58, h: 2, a: 4 },
    { name: "SOUL Campus, GIFT City", sup: "M. Joshi", proxy: 6, p: 53, h: 3, a: 5 },
    { name: "The Creek", sup: "R. Mehta", proxy: 0, p: 31, h: 1, a: 5 },
  ],
};

const demoAttendance = [
  { id: 1, worker: "Ramesh Yadav", category: "Plumber", contractor: "Own", in: "08:02", out: "18:10", hours: 9.1, status: "present", ot: 1.1, punch: "self", verify: "verified" },
  { id: 2, worker: "Sunil Kumar", category: "Fitter", contractor: "RK Labour Co.", in: "08:15", out: "18:05", hours: 8.8, status: "present", ot: 0.8, punch: "proxy", verify: "verified" },
  { id: 3, worker: "Amit Sharma", category: "Helper", contractor: "RK Labour Co.", in: "08:05", out: "12:40", hours: 3.6, status: "half_day", ot: 0, punch: "self", verify: "verified" },
  { id: 4, worker: "Vijay Patel", category: "Welder", contractor: "Own", in: "08:20", out: "—", hours: null, status: null, ot: 0, punch: "self", verify: "pending" },
  { id: 5, worker: "Dinesh Rao", category: "Operator", contractor: "Own", in: "—", out: "—", hours: 0, status: "absent", ot: 0, punch: "self", verify: "verified" },
  { id: 6, worker: "Mahesh Gohil", category: "Helper", contractor: "Own", in: "07:58", out: "18:30", hours: 9.5, status: "present", ot: 1.5, punch: "self", verify: "corrected" },
];

const demoWages = [
  { id: 1, worker: "Ramesh Yadav", category: "Plumber", bank: true, days: 24.5, ot: 12, rate: 800, gross: 20800, adv: 3000, net: 17800 },
  { id: 2, worker: "Vijay Patel", category: "Welder", bank: false, days: 23, ot: 6, rate: 900, gross: 21375, adv: 5000, net: 16375 },
  { id: 3, worker: "Dinesh Rao", category: "Operator", bank: true, days: 20, ot: 0, rate: 850, gross: 17000, adv: 0, net: 17000 },
  { id: 4, worker: "Mahesh Gohil", category: "Helper", bank: false, days: 25.5, ot: 10, rate: 600, gross: 16050, adv: 1200, net: 14850 },
];

const demoWorkers = [
  { id: 1, name: "Ramesh Yadav", mobile: "98250 11111", category: "Plumber", type: "Own", contractor: "—", site: "KEI", wage: 800, complete: true },
  { id: 2, name: "Sunil Kumar", mobile: "98250 22222", category: "Fitter", type: "Contractor", contractor: "RK Labour Co.", site: "KEI", wage: 750, complete: true },
  { id: 3, name: "Vijay Patel", mobile: "98250 33333", category: "Welder", type: "Own", contractor: "—", site: "KEI", wage: 900, complete: false },
  { id: 4, name: "Mahesh Gohil", mobile: "98250 44444", category: "Helper", type: "Own", contractor: "—", site: "SOUL", wage: 600, complete: false },
  { id: 5, name: "Dinesh Rao", mobile: "98250 55555", category: "Operator", type: "Own", contractor: "—", site: "CREEK", wage: 850, complete: true },
];

// ---------- DATA FUNCTIONS (Supabase first, demo fallback) ----------

// ---- worker category master (update152) ----
export async function getWorkerCategories() {
  if (isDemo) return [{ code: "plumber", label: "Plumber" }, { code: "helper", label: "Helper" }];
  const { data, error } = await supabase.from("worker_categories")
    .select("code, label").eq("is_active", true).order("label");
  if (error || !data || !data.length) {
    // deploy window (SQL not yet run): fall back to the previous fixed list
    return ["plumber","fitter","helper","welder","supervisor","operator","electrician","mason","other"]
      .map(c => ({ code: c, label: c.charAt(0).toUpperCase() + c.slice(1) }));
  }
  return data;
}

export async function addWorkerCategory(label) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const clean = String(label || "").trim();
  if (!clean) return { ok: false, error: "Type the category name." };
  const code = clean.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!code) return { ok: false, error: "Invalid category name." };
  const { error } = await supabase.from("worker_categories").insert({ code, label: clean });
  if (error && /duplicate|unique/i.test(error.message || "")) return { ok: true, code };  // already there
  return error ? { ok: false, error: error.message } : { ok: true, code };
}

// update168: worker multi-site allotment
export async function getWorkerAllotments(workerId) {
  if (isDemo) return [];
  const { data } = await supabase.from("worker_sites").select("site_id").eq("worker_id", workerId);
  return (data || []).map(r => Number(r.site_id));
}

export async function setWorkerAllotments(workerId, siteIds) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error: e1 } = await supabase.from("worker_sites").delete().eq("worker_id", workerId);
  if (e1) return { ok: false, error: e1.message };
  const rows = (siteIds || []).map(id => ({ worker_id: workerId, site_id: Number(id) }));
  if (rows.length) {
    const { error: e2 } = await supabase.from("worker_sites").insert(rows);
    if (e2) return { ok: false, error: e2.message };
  }
  return { ok: true };
}

// update176: one-glance "needs action + money today" pulse for the dashboard
// update180: rejected punches for a date — silent failures made visible
export async function getPunchFailures(date) {
  if (isDemo) return [];
  const { data } = await supabase.from("punch_failures")
    .select("worker_name, reason, distance_m, at, sites(name)")
    .gte("at", date + "T00:00:00").lte("at", date + "T23:59:59")
    .order("at", { ascending: false }).limit(100);
  return (data || []).map(r => ({ name: r.worker_name || "Unknown", reason: r.reason,
    dist: r.distance_m, site: r.sites?.name || "", time: (r.at || "").slice(11, 16) }));
}

// update449: siteId filters every figure to one site ("all"/null = every site the caller may see).
// Dates are IST (todayLocal) — the old toISOString() showed yesterday's spend before 5:30 AM.
export async function getDirectorPulse(siteId = null) {
  if (isDemo) return null;
  const today = todayLocal();
  const one = siteId && siteId !== "all";
  const S = q => one ? q.eq("site_id", siteId) : q;
  const cnt = q => q.then(r => r.count || 0);
  const [advPend, expPend, pettyPend, retPend, openInd, pos, expToday, petty] = await Promise.all([
    cnt(S(supabase.from("advance_salary_requests").select("id", { count: "exact", head: true }).eq("status", "pending"))),
    cnt(S(supabase.from("expenses").select("id", { count: "exact", head: true }).eq("status", "pending").or("is_vendor_direct.is.null,is_vendor_direct.eq.false"))),
    cnt(S(supabase.from("petty_cash_requests").select("id", { count: "exact", head: true }).eq("status", "pending"))),
    cnt(S(supabase.from("petty_cash_returns").select("id", { count: "exact", head: true }).eq("status", "pending"))),
    cnt(S(supabase.from("material_indents").select("id", { count: "exact", head: true }).in("status", ["open", "quoting"]))),
    cnt(S(supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "issued"))),
    S(supabase.from("expenses").select("amount").eq("status", "approved").eq("expense_date", today))
      .then(r => (r.data || []).reduce((a, x) => a + Number(x.amount || 0), 0)),
    S(supabase.from("v_petty_cash_balance").select("balance"))
      .then(r => (r.data || []).reduce((a, x) => a + Number(x.balance || 0), 0)),
  ]);
  const pfToday = await S(supabase.from("punch_failures").select("id", { count: "exact", head: true })
    .gte("at", today + "T00:00:00")).then(r => r.count || 0).catch(() => 0);
  return { moneyPending: advPend + expPend + pettyPend + retPend, retPend, openInd, pos, expToday, pettyOut: petty, pfToday };
}

export async function getSites() {
  if (isDemo) return demoSites;
  const { data, error } = await supabase.from("sites").select("id, code, name").eq("is_active", true);
  const scope = assignedSiteIds();   // non-directors: assigned sites only (update139)
  if (scope && data) return data.filter(x => scope.includes(Number(x.id)));
  if (error || !data) return [];   // update144: real error -> honest empty, never demo rows
  return data;
}

// update449: siteId ("all"/null = every site) filters the cards AND the table. The "/ total" roll now
// counts a worker whose home site OR any allotted site (worker_sites) is in scope — many workers have
// no home site and were missed before.
export async function getTodaySummary(dateStr, siteId = null) {
  if (isDemo) return demoSummary;
  const one = siteId && siteId !== "all";
  let aq = supabase
    .from("attendance")
    .select("status, punch_in, punch_out, ot_hours, punch_type, verify_status, site_id, sites!attendance_site_id_fkey(name)")
    .eq("att_date", dateStr);
  if (one) aq = aq.eq("site_id", siteId);
  const { data: att, error } = await aq;
  const scopeT = assignedSiteIds();
  if (error || !att) return { present: 0, total: 0, otHours: 0, proxyPct: 0, pending: 0, sites: [] };   // update144
  const attS = scopeT ? att.filter(a => scopeT.includes(Number(a.site_id))) : att;
  const want = one ? [Number(siteId)] : scopeT;   // null = no site restriction
  const [{ data: wrows }, { data: ws }] = await Promise.all([
    supabase.from("workers").select("id, site_id").eq("is_active", true),
    supabase.from("worker_sites").select("worker_id, site_id"),
  ]);
  const extra = {}; (ws || []).forEach(r => { (extra[r.worker_id] = extra[r.worker_id] || []).push(Number(r.site_id)); });
  const total = (wrows || []).filter(w => !want || want.includes(Number(w.site_id)) || (extra[w.id] || []).some(x => want.includes(x))).length;
  // "On site / present" = anyone who has punched in and is not marked absent
  const onSite = a => a.punch_in && a.status !== "absent";
  const present = attS.filter(onSite).length;
  const otHours = attS.reduce((s, a) => s + Number(a.ot_hours || 0), 0);
  const proxy = attS.filter(a => a.punch_type === "proxy").length;
  const pending = attS.filter(a => a.verify_status === "pending").length;
  const bySite = {};
  attS.forEach(a => {
    const n = a.sites?.name || "Site " + a.site_id;
    bySite[n] = bySite[n] || { name: n, sup: "", proxy: 0, p: 0, h: 0, a: 0 };
    if (a.status === "half_day") bySite[n].h++;
    else if (a.status === "absent") bySite[n].a++;
    else if (a.punch_in) bySite[n].p++;   // present or on-site (punched in, awaiting punch-out)
    if (a.punch_type === "proxy") bySite[n].proxy++;
  });
  return {
    present, total: total || attS.length, otHours: Math.round(otHours),
    proxyPct: attS.length ? Math.round((proxy / attS.length) * 100) : 0,
    pending, sites: Object.values(bySite),
  };
}

// verify one attendance row from the web register (update155)
export async function verifyAttendanceRow(id) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("attendance")
    .update({ verify_status: "verified", verified_at: new Date().toISOString() })
    .eq("id", id).eq("verify_status", "pending");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getAttendance(dateStr, siteId) {
  siteId = scoped(siteId);   // update245
  if (isDemo) return { rows: demoAttendance };
  let q = supabase
    .from("attendance")
    .select("id, worker_id, site_id, punch_out_site_id, punch_in_distance_m, punch_out_distance_m, punch_in, punch_out, hours_worked, status, ot_hours, ot_approved, ot_approved_hours, punch_type, verify_status, auto_punched_out, review_status, site_manual, punch_in_selfie_url, punch_out_selfie_url, proxy_photo_url, sites!attendance_site_id_fkey(name), workers(full_name, mobile, category, labour_type, ot_eligible, contractors(name))")   // update275
    .eq("att_date", dateStr);
  const scopeA = assignedSiteIds();
  if (scopeA) q = q.in("site_id", scopeA);        // non-directors never read other sites (update139)
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const [{ data, error }, { data: staffRows }, { data: siteRows }, { data: assignRows }] = await Promise.all([q,
    supabase.from("app_users").select("id, mobile, role").eq("is_active", true),
    supabase.from("sites").select("id, name"),                                                          // update378: for the office/site-staff split
    supabase.from("user_sites").select("user_id, site_id"),
  ]);
  if (error) return { rows: [], error: error.message || "Could not load attendance." };   // update147: errors surfaced
  if (!data) return { rows: [] };
  // staff punching shows their real staff role, never the punch-profile's category
  const staffRole = {}; const staffUid = {};
  (staffRows || []).forEach(u => {
    staffRole[String(u.mobile)] = String(u.role || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    staffUid[String(u.mobile)] = u.id;
  });
  // update378: sites whose NAME reads Head Office / Office are the office sites, and every
  // OTHER staff member is Site Staff. Same rule the Muster & Wages tabs already use — kept
  // by name so it moves with Site Master edits (a stored flag can wait until the Director asks).
  const OFFICE_SITE_RE = /head\s*office|^\s*the\s+office\s*$|^\s*office\s*$/i;
  const officeSiteIds = new Set((siteRows || []).filter(s => OFFICE_SITE_RE.test(s.name || "")).map(s => s.id));
  const assignByUser = {}; (assignRows || []).forEach(r => { (assignByUser[r.user_id] = assignByUser[r.user_id] || new Set()).add(r.site_id); });
  const t = ts => ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
  const url = p => { if (!p) return null; if (p.startsWith("http")) return p; try { return supabase.storage.from("attendance-photos").getPublicUrl(p).data.publicUrl; } catch { return null; } };
  return { rows: data.map(a => ({
    auto_closed: !!a.auto_punched_out, review_status: a.review_status || null,   // update275
    site_manual: !!a.site_manual,   // update286
    id: a.id,
    worker: a.workers?.full_name || "",
    category: staffRole[String(a.workers?.mobile)] || cap(a.workers?.category),
    contractor: staffRole[String(a.workers?.mobile)] ? "Staff" : (a.workers?.labour_type === "contractor" ? (a.workers?.contractors?.name || "Contractor") : "Own"),
    site: a.sites?.name || ("Site " + a.site_id),
    // update378: attendance-register category split — labour, or staff (office/site)
    isStaff: !!staffRole[String(a.workers?.mobile)],
    // update378b: Office vs Site is decided by WHERE THE ROW WAS PUNCHED, not by the
    // person's assignments — a supervisor allotted to Head Office and to KEI who punches at
    // KEI is a Site Staff row that day. Otherwise every multi-site staff member with a
    // Head Office allotment sank into the Office tab, emptying Site Staff even when the
    // day was full of site punches (Satyam's screenshot: 10 Site Staff rows, tab said 0).
    isOffice: officeSiteIds.has(a.site_id),
    site_id: a.site_id, out_site_id: a.punch_out_site_id, in_dist: a.punch_in_distance_m, out_dist: a.punch_out_distance_m,
    otEligible: a.workers?.ot_eligible !== false,   // update190
    workerId: a.worker_id,   // update194: click-through to full profile/slip
    in: t(a.punch_in), out: t(a.punch_out),
    hours: a.hours_worked, status: a.status, ot: Number(a.ot_hours || 0),
    otApproved: a.ot_approved, otApprovedHours: a.ot_approved_hours == null ? null : Number(a.ot_approved_hours),
    punch: a.punch_type, verify: a.verify_status,
    photoIn: url(a.punch_in_selfie_url || a.proxy_photo_url), photoOut: url(a.punch_out_selfie_url),
  })) };
}

// ---- Site master: shift timings ----
export async function getSitesFull() {
  if (isDemo) return demoSites.map(s => ({ ...s, shift_start: "09:00", shift_end: "18:00", std_working_hours: 8, lunch_minutes: 60, geofence_lat: null, geofence_lng: null, geofence_radius_m: 200 }));
  const { data } = await supabase.from("sites").select("id, code, name, shift_start, shift_end, std_working_hours, lunch_minutes, geofence_lat, geofence_lng, geofence_radius_m").eq("is_active", true).order("id");
  return data || [];
}
export async function updateSiteTimings(siteId, shiftStart, shiftEnd) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("sites").update({ shift_start: shiftStart, shift_end: shiftEnd }).eq("id", siteId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function updateSiteGeofence(siteId, lat, lng, radius) {
  if (isDemo) return { ok: true };
  const upd = { geofence_radius_m: Number(radius) || 200 };
  if (lat !== "" && lat != null) upd.geofence_lat = Number(lat);
  if (lng !== "" && lng != null) upd.geofence_lng = Number(lng);
  const { error } = await supabase.from("sites").update(upd).eq("id", siteId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---- OT approval ----
export async function approveOt(attId, hours, byUser = 1) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("attendance").update({
    ot_approved: true, ot_approved_hours: Number(hours) || 0,
    ot_approved_by: byUser, ot_approved_at: new Date().toISOString() }).eq("id", attId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getWages(monthStr, siteId) {
  if (isDemo) return demoWages;
  let q = supabase
    .from("wage_payouts")
    .select("id, days_total, ot_hours, daily_rate, gross, advances_deducted, net, pay_mode, workers(full_name, category, profile_complete)")
    .eq("pay_month", monthStr + "-01");
  const scopeA = assignedSiteIds();
  if (scopeA) q = q.in("site_id", scopeA);        // non-directors never read other sites (update139)
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error || !data) return [];   // update144: empty month shows empty, never demo wages
  return data.map(w => ({          // update241: was `rows` — an undefined identifier
    id: w.id, worker_id: w.worker_id, worker: w.workers?.full_name || "", category: cap(w.workers?.category),
    bank: w.pay_mode === "bank", days: Number(w.days_total), ot: Number(w.ot_hours),
    rate: Number(w.daily_rate), gross: Number(w.gross),
    adv: Number(w.advances_deducted), net: Number(w.net),
  }));
}

export async function getWorkers() {
  if (isDemo) return demoWorkers;
  const [{ data, error }, { data: staffRows }] = await Promise.all([
    supabase.from("workers")
      .select("id, full_name, mobile, category, labour_type, daily_wage, ot_eligible, profile_complete, is_active, site_id, contractor_id, aadhaar_doc_url, bank_account_no, bank_ifsc, bank_name, payment_type, bank_doc_url, aadhaar_docs, proxy_authority, joining_date, last_working_day, exit_reason, emergency_name, emergency_relation, emergency_mobile, emergency_alt_mobile, emergency_address, sites!workers_site_id_fkey(code), contractors(name)")   // update329: dates · update336: emergency contact
      .eq("is_active", true).order("full_name"),
    supabase.from("app_users").select("mobile").eq("is_active", true),
  ]);
  if (error || !data) return [];   // update144: never demo rows in production
  const scopeW = assignedSiteIds();
  const dataS = scopeW ? data.filter(w => scopeW.includes(Number(w.site_id))) : data;   // update139
  // staff punch-profiles are attendance machinery, not labour — hide them here
  const staffMob = new Set((staffRows || []).map(u => String(u.mobile)));
  const rows = dataS.filter(w => !staffMob.has(String(w.mobile)));
  return rows.map(w => ({
    id: w.id, name: w.full_name, mobile: w.mobile, category: cap(w.category),
    bank: w.bank_name || "—",   // update359: filterable on the list
    payType: w.labour_type === "contractor" ? "Contractor" : (w.payment_type === "union" ? "Union" : "Direct"),   // update361
    type: w.labour_type === "own" ? "Own" : "Contractor",
    contractor: w.contractors?.name || "—",
    // raw fields for editing
    raw: { full_name: w.full_name, mobile: w.mobile, category: w.category, labour_type: w.labour_type,
      daily_wage: w.daily_wage, site_id: w.site_id, contractor_id: w.contractor_id, is_active: w.is_active, ot_eligible: w.ot_eligible !== false, proxy_authority: !!w.proxy_authority,   // update287
      aadhaar_doc_url: w.aadhaar_doc_url, bank_account_no: w.bank_account_no, bank_ifsc: w.bank_ifsc, bank_name: w.bank_name || "", payment_type: w.payment_type || "direct", bank_doc_url: w.bank_doc_url || null, aadhaar_docs: Array.isArray(w.aadhaar_docs) ? w.aadhaar_docs : [],   // update359/361/374/377
      joining_date: w.joining_date || "", last_working_day: w.last_working_day || "", exit_reason: w.exit_reason || "",   // update329
      emergency_name: w.emergency_name || "", emergency_relation: w.emergency_relation || "", emergency_mobile: w.emergency_mobile || "",
      emergency_alt_mobile: w.emergency_alt_mobile || "", emergency_address: w.emergency_address || "" },   // update336
    site: w.sites?.code || "", wage: Number(w.daily_wage), complete: w.profile_complete,
  }));
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ") : ""; }

export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

// web add/edit worker (insert when no id, update when id given)
export async function saveWorker(id, form) {
  if (isDemo) return { ok: true };
  const row = { full_name: form.full_name, mobile: String(form.mobile || "").trim(),
    category: form.category, labour_type: form.labour_type,
    daily_wage: Number(form.daily_wage) || 0, site_id: form.site_id ? Number(form.site_id) : null,
    contractor_id: form.labour_type === "contractor" && form.contractor_id ? Number(form.contractor_id) : null,
    is_active: form.is_active !== false,
    ot_eligible: form.ot_eligible !== false,   // update190: OT master switch (labour)
    proxy_authority: !!form.proxy_authority,   // update287: admin-granted, revocable
    bank_account_no: String(form.bank_account_no || "").trim() || null,
    bank_ifsc: String(form.bank_ifsc || "").trim().toUpperCase() || null,
    bank_name: String(form.bank_name || "").trim() || null,   // update359
    // update361: decides which sheet of the bank payment file they land in. Contractor
    // labour is paid through the contractor, so it follows labour_type automatically.
    payment_type: form.labour_type === "contractor" ? "contractor" : (form.payment_type || "direct"),
    // update329: dates the labour letters read
    joining_date: form.joining_date || null,
    last_working_day: form.last_working_day || null,
    exit_reason: String(form.exit_reason || "").trim() || null,
    // update336: emergency contact
    emergency_name: String(form.emergency_name || "").trim() || null,
    emergency_relation: String(form.emergency_relation || "").trim() || null,
    emergency_mobile: String(form.emergency_mobile || "").trim() || null,
    emergency_alt_mobile: String(form.emergency_alt_mobile || "").trim() || null,
    emergency_address: String(form.emergency_address || "").trim() || null };
  // update377: one field, an ARRAY of URLs. Legacy aadhaar_doc_url is left alone in the row.
  if (form.aadhaar_docs !== undefined) row.aadhaar_docs = Array.isArray(form.aadhaar_docs) ? form.aadhaar_docs : [];
  if (form.bank_doc_url    !== undefined) row.bank_doc_url    = form.bank_doc_url    || null;   // update374
  if (!row.full_name || !row.mobile || !row.daily_wage || !row.site_id)
    return { ok: false, error: "Name, mobile, daily wage and site are mandatory." };
  const q = id ? supabase.from("workers").update(row).eq("id", id) : supabase.from("workers").insert(row);
  const { error } = await q;
  return error ? { ok: false, error: error.message } : { ok: true };
}

// is this mobile a STAFF number? (used by worker login to redirect staff)
export async function isStaffMobile(mobile) {
  if (isDemo) return false;
  const { data: rows, error } = await supabase.rpc("fn_staff_login_lookup", { p_mobile: String(mobile).trim() });
  if (!error) return Array.isArray(rows) ? rows.length > 0 : !!rows;
  const { data } = await supabase.from("app_users").select("id").eq("mobile", String(mobile).trim()).eq("is_active", true).maybeSingle();
  return !!data;
}

// add a new site / office location (Site Master)
export async function addSite(form) {
  if (isDemo) return { ok: true };
  const name = String(form.name || "").trim();
  if (!name) return { ok: false, error: "Enter the site / office name." };
  const code = (form.code || name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 12);
  const m = String(form.coords || "").trim().match(/^(-?\d{1,3}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return { ok: false, error: "Paste the location coordinates — on Google Maps, right-click the site gate, click the numbers to copy, then paste here (e.g. 23.0225, 72.5714)." };
  const lat = Number(m[1]), lng = Number(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, error: "Those coordinates don't look right — latitude first, then longitude." };
  const { error } = await supabase.from("sites").insert({
    code, name, shift_start: form.shift_start || "09:00", shift_end: form.shift_end || "18:00",
    geofence_lat: lat, geofence_lng: lng,
    geofence_radius_m: Number(form.radius) || 200, is_active: true });
  return error ? { ok: false, error: error.message } : { ok: true };
}


// upload a worker's Aadhaar copy (image/pdf) -> public URL
export async function uploadAadhaarDoc(workerKey, file) {
  return uploadKycDoc("aadhaar", workerKey, file);
}

// update374: bank passbook / cancelled cheque, alongside the Aadhaar upload
export async function uploadBankDoc(workerKey, file) {
  return uploadKycDoc("bank", workerKey, file);
}

// update377: one bulk uploader — takes any number of files, returns an array of URLs
// in the same order. Each file lands in the shared aadhaar/ folder with a unique name so
// the same worker uploading twice on the same day never overwrites the first file.
export async function uploadAadhaarFiles(workerKey, files) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return { ok: true, urls: [] };
  const urls = []; const errors = [];
  for (let i = 0; i < list.length; i++) {
    const r = await uploadKycDoc("aadhaar", `${workerKey}-${i}`, list[i]);
    if (r.ok) urls.push(r.url); else errors.push(r.error);
  }
  if (errors.length && !urls.length) return { ok: false, error: errors.join("; ") };
  return { ok: true, urls, partial: errors.length ? errors : null };
}

// update374: one uploader, two folders — a passbook can never be filed as Aadhaar or vice
// versa. Same bucket the Aadhaar upload has always used.
async function uploadKycDoc(kind, workerKey, file) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${kind}/${workerKey}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("attendance-photos").upload(path, file, { upsert: true });
  if (error) return { ok: false, error: error.message };
  const { data } = supabase.storage.from("attendance-photos").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}


// Hard delete — allowed only when the person has NO history rows.
// FK violation (attendance, payouts, advances…) => tell the caller to deactivate instead.
export async function deleteWorker(id) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("workers").delete().eq("id", id);
  if (!error) return { ok: true };
  if (String(error.code) === "23503" || /foreign key/i.test(error.message))
    return { ok: false, hasHistory: true, error: "This worker has attendance/wage history. Records like these must be preserved — deactivate instead." };
  return { ok: false, error: error.message };
}

export async function deleteStaff(id) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("app_users").delete().eq("id", id);
  if (!error) return { ok: true };
  if (String(error.code) === "23503" || /foreign key/i.test(error.message))
    return { ok: false, hasHistory: true, error: "This staff member has approvals/records in their name. History must be preserved — untick Active instead (they can no longer sign in)." };
  return { ok: false, error: error.message };
}


// update277: manual correction of a punch row (supervisor/site in-charge/Director). Times drive
// hours/status/OT through the trigger; a forced status is kept (manual_status). Audited.
export async function editAttendanceRow(id, { inHHMM, outHHMM, status, note }) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_edit_attendance", { p_att_id: id, p_in_hhmm: inHHMM || null, p_out_hhmm: outHHMM || null, p_status: status || null, p_note: note || null });
  if (error) return { ok: false, error: /fn_edit_attendance|schema cache/i.test(error.message) ? "Run pipeskool_payroll_manual.sql (update 277) first." : error.message };
  return data || { ok: false, error: "No response." };
}


// update300: company GSTIN from app_settings (key company.gstin). Never show a masked
// placeholder on documents — absent/blank means the GSTIN line is simply omitted.
export async function getCompanyGstin() {
  try {
    const { data } = await supabase.from("app_settings").select("value").eq("key", "company.gstin").maybeSingle();
    const v = typeof data?.value === "string" ? data.value : (data?.value ?? "");
    const s = String(v).replace(/^"|"$/g, "").trim();
    return /X{4,}/i.test(s) ? "" : s;   // a masked placeholder is treated as unset
  } catch { return ""; }
}

// ===================== update438: Not-punched roster, manual marks, auto-absent override, per-site cutoff =====================
export async function getNotPunched(dateStr, siteId) {
  if (isDemo) return { rows: [] };
  try { return await _getNotPunched(dateStr, siteId); } catch (e) { return { rows: [], error: e?.message || String(e) }; }
}
async function _getNotPunched(dateStr, siteId) {
  siteId = scoped(siteId);
  const ids = isScoped(siteId) ? [Number(siteId)] : (assignedSiteIds() || null);
  const { data, error } = await supabase.rpc("fn_not_punched", { p_date: dateStr, p_site_ids: ids && ids.length ? ids : null });
  if (error) return { rows: [], error: /fn_not_punched/.test(error.message) ? "Run pipeskool_auto_absent.sql (update 438) first." : error.message };
  return { rows: (data || []).map(r => ({ id: r.worker_id, worker: r.full_name, category: r.category || "", site: r.site_name, site_id: r.site_id, labour: r.labour_type === "contractor" ? (r.contractor_name || "Contractor") : "Own", mobile: r.mobile || "", isStaff: !!r.is_staff, role: r.staff_role || "" })) };
}
export async function markNotPunched(workerId, dateStr, status, reason) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_mark_not_punched", { p_worker_id: workerId, p_date: dateStr, p_status: status, p_reason: reason });
  if (error) return { ok: false, error: error.message }; return data?.ok ? { ok: true } : { ok: false, error: data?.error || "Could not mark." };
}
export async function overrideAbsentMark(markId, newStatus, reason) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_override_absent", { p_mark_id: markId, p_new_status: newStatus, p_reason: reason });
  if (error) return { ok: false, error: error.message }; return data?.ok ? { ok: true } : { ok: false, error: data?.error || "Could not override." };
}
export async function getAbsentMarks(dateStr, siteIds) {
  if (isDemo) return [];
  let q = supabase.from("attendance_absent_marks").select("id, worker_id, site_id, reason, auto, marked_at, overridden_at, override_reason, marker:marked_by(full_name), overrider:overridden_by(full_name), workers(full_name, category, labour_type, contractors(name)), sites(name)").eq("att_date", dateStr);
  if (siteIds && siteIds.length) q = q.in("site_id", siteIds);
  const { data } = await q; return data || [];
}
export async function setSiteCutoff(siteId, cutoff, reminder) {
  const { data, error } = await supabase.rpc("fn_set_site_cutoff", { p_site_id: siteId, p_cutoff: cutoff || null, p_reminder: reminder || null });
  if (error) return { ok: false, error: error.message }; return data?.ok ? { ok: true } : { ok: false, error: data?.error };
}
export async function getSiteCutoffs() {
  if (isDemo) return [];
  const { data } = await supabase.from("sites").select("id, name, auto_absent_time, reminder_time").eq("is_active", true).order("name"); return data || [];
}

// ===================== update439: company exit =====================
export async function workerExitCheck(id) { const { data, error } = await supabase.rpc("fn_worker_exit_check", { p_worker_id: id }); return error ? { ok: false, error: error.message } : (data || { ok: false }); }
export async function workerExit(id, lastDay, designation, type, reason) {
  const { data, error } = await supabase.rpc("fn_worker_exit", { p_worker_id: id, p_last_day: lastDay, p_designation: designation || null, p_type: type, p_reason: reason || null });
  if (error) return { ok: false, error: /fn_worker_exit/.test(error.message) ? "Run pipeskool_company_exit.sql (update 439) first." : error.message }; return data?.ok ? { ok: true, effective: data.effective } : { ok: false, error: data?.error || "Could not mark exit." };
}
export async function workerRejoin(id, joiningDate) { const { data, error } = await supabase.rpc("fn_worker_rejoin", { p_worker_id: id, p_joining_date: joiningDate || null }); if (error) return { ok: false, error: error.message }; return data?.ok ? { ok: true } : { ok: false, error: data?.error }; }
export async function applyExits() { try { await supabase.rpc("fn_apply_exits"); } catch {} }
export async function getExitedWorkers() { if (isDemo) return []; const { data } = await supabase.from("v_exited_workers").select("*").order("last_working_day", { ascending: false }); return (data || []).map(r => ({ ...r, exited_at: r.exited_at ? String(r.exited_at).slice(0, 16).replace("T", " ") : "" })); }
