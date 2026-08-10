import { supabase, isDemo } from "./supabase";
import { assignedSiteIds } from "./auth";

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

export async function getSites() {
  if (isDemo) return demoSites;
  const { data, error } = await supabase.from("sites").select("id, code, name").eq("is_active", true);
  const scope = assignedSiteIds();   // non-directors: assigned sites only (update139)
  if (scope && data) return data.filter(x => scope.includes(Number(x.id)));
  if (error || !data) return [];   // update144: real error -> honest empty, never demo rows
  return data;
}

export async function getTodaySummary(dateStr) {
  if (isDemo) return demoSummary;
  const { data: att, error } = await supabase
    .from("attendance")
    .select("status, punch_in, punch_out, ot_hours, punch_type, verify_status, site_id, sites!attendance_site_id_fkey(name)")
    .eq("att_date", dateStr);
  const scopeT = assignedSiteIds();
  if (error || !att) return { present: 0, total: 0, otHours: 0, proxyPct: 0, pending: 0, sites: [] };   // update144
  const attS = scopeT ? att.filter(a => scopeT.includes(Number(a.site_id))) : att;
  let wq = supabase.from("workers").select("id", { count: "exact", head: true }).eq("is_active", true);
  if (scopeT) wq = wq.in("site_id", scopeT);
  const { count: total } = await wq;
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
  if (isDemo) return { rows: demoAttendance };
  let q = supabase
    .from("attendance")
    .select("id, site_id, punch_out_site_id, punch_in_distance_m, punch_out_distance_m, punch_in, punch_out, hours_worked, status, ot_hours, ot_approved, ot_approved_hours, punch_type, verify_status, punch_in_selfie_url, punch_out_selfie_url, proxy_photo_url, sites!attendance_site_id_fkey(name), workers(full_name, mobile, category, labour_type, contractors(name))")
    .eq("att_date", dateStr);
  const scopeA = assignedSiteIds();
  if (scopeA) q = q.in("site_id", scopeA);        // non-directors never read other sites (update139)
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const [{ data, error }, { data: staffRows }] = await Promise.all([q,
    supabase.from("app_users").select("mobile, role").eq("is_active", true)]);
  if (error) return { rows: [], error: error.message || "Could not load attendance." };   // update147: errors surfaced
  if (!data) return { rows: [] };
  // staff punching shows their real staff role, never the punch-profile's category
  const staffRole = {}; (staffRows || []).forEach(u => staffRole[String(u.mobile)] =
    String(u.role || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
  const t = ts => ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
  const url = p => { if (!p) return null; if (p.startsWith("http")) return p; try { return supabase.storage.from("attendance-photos").getPublicUrl(p).data.publicUrl; } catch { return null; } };
  return { rows: data.map(a => ({
    id: a.id,
    worker: a.workers?.full_name || "",
    category: staffRole[String(a.workers?.mobile)] || cap(a.workers?.category),
    contractor: staffRole[String(a.workers?.mobile)] ? "Staff" : (a.workers?.labour_type === "contractor" ? (a.workers?.contractors?.name || "Contractor") : "Own"),
    site: a.sites?.name || ("Site " + a.site_id),
    site_id: a.site_id, out_site_id: a.punch_out_site_id, in_dist: a.punch_in_distance_m, out_dist: a.punch_out_distance_m,
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
  return rows.map(w => ({
    id: w.id, worker: w.workers?.full_name || "", category: cap(w.workers?.category),
    bank: w.pay_mode === "bank", days: Number(w.days_total), ot: Number(w.ot_hours),
    rate: Number(w.daily_rate), gross: Number(w.gross),
    adv: Number(w.advances_deducted), net: Number(w.net),
  }));
}

export async function getWorkers() {
  if (isDemo) return demoWorkers;
  const [{ data, error }, { data: staffRows }] = await Promise.all([
    supabase.from("workers")
      .select("id, full_name, mobile, category, labour_type, daily_wage, profile_complete, is_active, site_id, contractor_id, aadhaar_doc_url, bank_account_no, bank_ifsc, sites(code), contractors(name)")
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
    type: w.labour_type === "own" ? "Own" : "Contractor",
    contractor: w.contractors?.name || "—",
    // raw fields for editing
    raw: { full_name: w.full_name, mobile: w.mobile, category: w.category, labour_type: w.labour_type,
      daily_wage: w.daily_wage, site_id: w.site_id, contractor_id: w.contractor_id, is_active: w.is_active,
      aadhaar_doc_url: w.aadhaar_doc_url, bank_account_no: w.bank_account_no, bank_ifsc: w.bank_ifsc },
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
    bank_account_no: String(form.bank_account_no || "").trim() || null,
    bank_ifsc: String(form.bank_ifsc || "").trim().toUpperCase() || null };
  if (form.aadhaar_doc_url) row.aadhaar_doc_url = form.aadhaar_doc_url;
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
  if (isDemo) return { ok: false, error: "Demo mode." };
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `aadhaar/${workerKey}-${Date.now()}.${ext}`;
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
