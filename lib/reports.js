import { supabase, isDemo } from "./supabase";

export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA"); };
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("en-CA"); };

// Cross-site director report: today's strength, DPR, indents, deliveries,
// month expenses, BOQ progress, and a 7-day manpower trend.
export async function getDirectorReport() {
  if (isDemo) return null;
  const t = today(), ms = monthStart(), wk = daysAgo(6);
  const [sitesQ, attQ, dprQ, indQ, poQ, expQ, boqQ, trendQ] = await Promise.all([
    supabase.from("sites").select("id, name").eq("is_active", true).order("id"),
    supabase.from("attendance").select("site_id, status, ot_hours, punch_type").eq("att_date", t),
    supabase.from("dpr").select("site_id, status").eq("dpr_date", t),
    supabase.from("material_indents").select("site_id, status").in("status", ["open", "quoting"]),
    supabase.from("purchase_orders").select("site_id, delivery_status, expected_delivery, status")
      .neq("status", "cancelled").not("delivery_status", "in", '("delivered")'),
    supabase.from("expenses").select("site_id, amount, status").gte("expense_date", ms).neq("status", "rejected"),
    supabase.from("boq_items").select("site_id, boq_qty, done_qty, rate"),
    supabase.from("attendance").select("att_date, status").gte("att_date", wk),
  ]);

  const sites = sitesQ.data || [];
  const bySite = {}; sites.forEach(s => bySite[s.id] = {
    id: s.id, name: s.name, present: 0, half: 0, absent: 0, onsite: 0, ot: 0, proxy: 0,
    dpr: "missing", indents: 0, deliveries: 0, nextDelivery: null, expenses: 0, boqValue: 0, boqDone: 0,
  });
  const g = id => bySite[id];

  (attQ.data || []).forEach(a => { const s = g(a.site_id); if (!s) return;
    if (a.status === "present") s.present++;
    else if (a.status === "half_day") s.half++;
    else if (a.status === "absent") s.absent++;
    else s.onsite++;
    s.ot += Number(a.ot_hours || 0);
    if (a.punch_type === "proxy") s.proxy++;
  });
  (dprQ.data || []).forEach(d => { const s = g(d.site_id); if (s) s.dpr = d.status === "draft" ? "draft" : "submitted"; });
  (indQ.data || []).forEach(i => { const s = g(i.site_id); if (s) s.indents++; });
  (poQ.data || []).forEach(p => { const s = g(p.site_id); if (!s) return;
    s.deliveries++;
    if (p.expected_delivery && (!s.nextDelivery || p.expected_delivery < s.nextDelivery)) s.nextDelivery = p.expected_delivery;
  });
  (expQ.data || []).forEach(e => { const s = g(e.site_id); if (s) s.expenses += Number(e.amount || 0); });
  (boqQ.data || []).forEach(b => { const s = g(b.site_id); if (!s) return;
    s.boqValue += Number(b.boq_qty || 0) * Number(b.rate || 0);
    s.boqDone += Number(b.done_qty || 0) * Number(b.rate || 0);
  });

  // 7-day manpower trend (all sites): present + half per day
  const trend = {};
  for (let i = 6; i >= 0; i--) trend[daysAgo(i)] = 0;
  (trendQ.data || []).forEach(a => {
    if (trend[a.att_date] === undefined) return;
    if (a.status === "present" || a.status === "half_day") trend[a.att_date]++;
  });

  const rows = sites.map(s => { const r = bySite[s.id];
    return { ...r, strength: r.present + r.half + r.onsite,
      boqPct: r.boqValue ? Math.round(r.boqDone / r.boqValue * 100) : 0 };
  });

  const totals = rows.reduce((x, r) => ({
    strength: x.strength + r.strength, ot: x.ot + r.ot, proxy: x.proxy + r.proxy,
    indents: x.indents + r.indents, deliveries: x.deliveries + r.deliveries, expenses: x.expenses + r.expenses,
    dprDone: x.dprDone + (r.dpr === "submitted" ? 1 : 0),
  }), { strength: 0, ot: 0, proxy: 0, indents: 0, deliveries: 0, expenses: 0, dprDone: 0 });

  return { sites: rows, totals, trend: Object.entries(trend).map(([d, v]) => ({ date: d.slice(5), value: v })), asOf: t };
}
