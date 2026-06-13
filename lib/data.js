import { supabase, isDemo } from "./supabase";

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

export async function getSites() {
  if (isDemo) return demoSites;
  const { data, error } = await supabase.from("sites").select("id, code, name").eq("is_active", true);
  if (error || !data?.length) return demoSites;
  return data;
}

export async function getTodaySummary(dateStr) {
  if (isDemo) return demoSummary;
  const { data: att, error } = await supabase
    .from("attendance")
    .select("status, punch_in, punch_out, ot_hours, punch_type, verify_status, site_id, sites(name)")
    .eq("att_date", dateStr);
  if (error || !att) return demoSummary;
  const { count: total } = await supabase
    .from("workers").select("id", { count: "exact", head: true }).eq("is_active", true);
  // "On site / present" = anyone who has punched in and is not marked absent
  const onSite = a => a.punch_in && a.status !== "absent";
  const present = att.filter(onSite).length;
  const otHours = att.reduce((s, a) => s + Number(a.ot_hours || 0), 0);
  const proxy = att.filter(a => a.punch_type === "proxy").length;
  const pending = att.filter(a => a.verify_status === "pending").length;
  const bySite = {};
  att.forEach(a => {
    const n = a.sites?.name || "Site " + a.site_id;
    bySite[n] = bySite[n] || { name: n, sup: "", proxy: 0, p: 0, h: 0, a: 0 };
    if (a.status === "half_day") bySite[n].h++;
    else if (a.status === "absent") bySite[n].a++;
    else if (a.punch_in) bySite[n].p++;   // present or on-site (punched in, awaiting punch-out)
    if (a.punch_type === "proxy") bySite[n].proxy++;
  });
  return {
    present, total: total || att.length, otHours: Math.round(otHours),
    proxyPct: att.length ? Math.round((proxy / att.length) * 100) : 0,
    pending, sites: Object.values(bySite),
  };
}

export async function getAttendance(dateStr, siteId) {
  if (isDemo) return demoAttendance;
  let q = supabase
    .from("attendance")
    .select("id, punch_in, punch_out, hours_worked, status, ot_hours, punch_type, verify_status, workers(full_name, category, labour_type, contractors(name))")
    .eq("att_date", dateStr);
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error || !data) return demoAttendance;
  const t = ts => ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
  return data.map(a => ({
    id: a.id,
    worker: a.workers?.full_name || "",
    category: cap(a.workers?.category),
    contractor: a.workers?.labour_type === "contractor" ? (a.workers?.contractors?.name || "Contractor") : "Own",
    in: t(a.punch_in), out: t(a.punch_out),
    hours: a.hours_worked, status: a.status, ot: Number(a.ot_hours || 0),
    punch: a.punch_type, verify: a.verify_status,
  }));
}

export async function getWages(monthStr, siteId) {
  if (isDemo) return demoWages;
  let q = supabase
    .from("wage_payouts")
    .select("id, days_total, ot_hours, daily_rate, gross, advances_deducted, net, pay_mode, workers(full_name, category, profile_complete)")
    .eq("pay_month", monthStr + "-01");
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error || !data?.length) return demoWages;
  return data.map(w => ({
    id: w.id, worker: w.workers?.full_name || "", category: cap(w.workers?.category),
    bank: w.pay_mode === "bank", days: Number(w.days_total), ot: Number(w.ot_hours),
    rate: Number(w.daily_rate), gross: Number(w.gross),
    adv: Number(w.advances_deducted), net: Number(w.net),
  }));
}

export async function getWorkers() {
  if (isDemo) return demoWorkers;
  const { data, error } = await supabase
    .from("workers")
    .select("id, full_name, mobile, category, labour_type, daily_wage, profile_complete, sites(code), contractors(name)")
    .eq("is_active", true).order("full_name");
  if (error || !data) return demoWorkers;
  return data.map(w => ({
    id: w.id, name: w.full_name, mobile: w.mobile, category: cap(w.category),
    type: w.labour_type === "own" ? "Own" : "Contractor",
    contractor: w.contractors?.name || "—",
    site: w.sites?.code || "", wage: Number(w.daily_wage), complete: w.profile_complete,
  }));
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ") : ""; }

export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
