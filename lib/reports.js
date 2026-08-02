import { supabase, isDemo } from "./supabase";
import { assignedSiteIds } from "./auth";

export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const ist = d => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const today = () => ist(new Date());
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return ist(d); };
const monthStart = () => { const d = new Date(); return ist(new Date(d.getFullYear(), d.getMonth(), 1)); };

// Executive cross-site report. days = trend window (7 or 30).
export async function getDirectorReport(days = 7) {
  if (isDemo) return null;
  const t = today(), y = daysAgo(1), ms = monthStart(), from = daysAgo(days - 1);
  const [sitesQ, attQ, yQ, dprQ, indQ, poQ, expQ, boqQ, trendQ] = await Promise.all([
    supabase.from("sites").select("id, name").eq("is_active", true).order("id"),
    supabase.from("attendance").select("site_id, status, ot_hours, punch_type, verify_status").eq("att_date", t),
    supabase.from("attendance").select("site_id, status").eq("att_date", y),
    supabase.from("dpr").select("site_id, status").eq("dpr_date", t),
    supabase.from("material_indents").select("site_id, indent_no, urgency, created_at").in("status", ["open", "quoting"]),
    supabase.from("purchase_orders").select("site_id, po_no, vendor_name, delivery_status, expected_delivery, status").neq("status", "cancelled"),
    supabase.from("expenses").select("site_id, amount, status").gte("expense_date", ms).neq("status", "rejected"),
    supabase.from("boq_items").select("site_id, boq_qty, done_qty, rate"),
    supabase.from("attendance").select("att_date, site_id, status").gte("att_date", from),
  ]);

  const scope = assignedSiteIds();   // non-directors: assigned sites only (update139)
  const sites = scope ? (sitesQ.data || []).filter(x => scope.includes(Number(x.id))) : (sitesQ.data || []);
  const S = {}; sites.forEach(s => S[s.id] = { id: s.id, name: s.name, short: s.name.split(",")[0],
    present: 0, half: 0, onsite: 0, absent: 0, proxy: 0, ot: 0, pendingVerify: 0, ystrength: 0,
    dpr: "missing", indents: [], expenses: 0, boqValue: 0, boqDone: 0,
    deliv: { pending: 0, confirmed: 0, delayed: 0, dispatched: 0, delivered: 0 }, upcoming: [] });
  const g = id => S[id];

  (attQ.data || []).forEach(a => { const s = g(a.site_id); if (!s) return;
    if (a.status === "present") s.present++; else if (a.status === "half_day") s.half++;
    else if (a.status === "absent") s.absent++; else s.onsite++;
    s.ot += Number(a.ot_hours || 0);
    if (a.punch_type === "proxy") s.proxy++;
    if (a.verify_status === "pending") s.pendingVerify++;
  });
  (yQ.data || []).forEach(a => { const s = g(a.site_id); if (s && (a.status === "present" || a.status === "half_day" || !a.status)) s.ystrength++; });
  (dprQ.data || []).forEach(d => { const s = g(d.site_id); if (s) s.dpr = d.status === "draft" ? "draft" : "submitted"; });
  (indQ.data || []).forEach(i => { const s = g(i.site_id); if (!s) return;
    const age = Math.floor((new Date(t) - new Date(i.created_at.slice(0, 10))) / 86400000);
    s.indents.push({ no: i.indent_no, age, urgent: i.urgency === "urgent" }); });
  (poQ.data || []).forEach(p => { const s = g(p.site_id); if (!s) return;
    const ds = p.delivery_status || "pending";
    if (s.deliv[ds] !== undefined) s.deliv[ds]++;
    if (ds !== "delivered" && p.status !== "delivered" && p.status !== "closed")
      s.upcoming.push({ po: p.po_no, vendor: p.vendor_name, expected: p.expected_delivery, status: ds }); });
  (expQ.data || []).forEach(e => { const s = g(e.site_id); if (s) s.expenses += Number(e.amount || 0); });
  (boqQ.data || []).forEach(b => { const s = g(b.site_id); if (!s) return;
    s.boqValue += Number(b.boq_qty || 0) * Number(b.rate || 0);
    s.boqDone += Number(b.done_qty || 0) * Number(b.rate || 0); });

  // trend: per day, total + per site
  const trend = {};
  for (let i = days - 1; i >= 0; i--) trend[daysAgo(i)] = { total: 0, bySite: {} };
  (trendQ.data || []).forEach(a => { const d = trend[a.att_date]; if (!d) return;
    if (a.status === "present" || a.status === "half_day") { d.total++; d.bySite[a.site_id] = (d.bySite[a.site_id] || 0) + 1; } });

  const rows = sites.map(s => { const r = S[s.id];
    r.upcoming.sort((a, b) => (a.expected || "9999") < (b.expected || "9999") ? -1 : 1);
    return { ...r, strength: r.present + r.half + r.onsite,
      boqPct: r.boqValue ? Math.round(r.boqDone / r.boqValue * 100) : 0 }; });

  return { sites: rows, asOf: t,
    trend: Object.entries(trend).map(([d, v]) => ({ date: d.slice(5), ...v })) };
}
