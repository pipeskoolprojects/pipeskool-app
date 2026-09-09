// update278: PAYROLL SUMMARY + SITE SUMMARY data — one loader, read live from wage_payouts
// (the payment record the engine produces from attendance; Settings-driven). Consolidates one
// row per worker across sites without double counting (PT already lands once per worker).
import { supabase, isDemo } from "./supabase";

export async function loadPayrollSummary(monthStr, siteId) {
  if (isDemo) return { workers: [], sites: [], grand: null, missingSites: [], month: monthStr };
  const from = monthStr + "-01";
  let q = supabase.from("wage_payouts")
    .select("id, worker_id, site_id, days_full, days_half, days_total, ot_hours, daily_rate, ot_rate, gross, advances_deducted, pf_amount, pt_amount, other_deduction, net, status, holiday_amount, wo_amount, manual_override, workers(full_name, category), sites(name)")
    .eq("pay_month", from);
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const [{ data, error }, { data: allSites }] = await Promise.all([q, supabase.from("sites").select("id, name").eq("is_active", true).order("name")]);
  if (error) throw new Error("Could not load payroll: " + error.message);
  const rows = (data || []).map(r => {
    const basic = +(( Number(r.days_full) + Number(r.days_half) * 0.5) * Number(r.daily_rate) + Number(r.holiday_amount || 0) + Number(r.wo_amount || 0)).toFixed(2);
    const otAmt = +(Number(r.ot_hours) * Number(r.ot_rate)).toFixed(2);
    return { ...r, basic, otAmt, gross: Number(r.gross), days: Number(r.days_total),
      pf: Number(r.pf_amount || 0), pt: Number(r.pt_amount || 0), other: Number(r.other_deduction || 0), adv: Number(r.advances_deducted || 0), net: Number(r.net),
      worker: r.workers?.full_name || ("#" + r.worker_id), designation: r.workers?.category || "", site: r.sites?.name || ("Site " + r.site_id) };
  });

  // one row per worker, summed across sites
  const byW = {};
  rows.forEach(r => {
    const w = byW[r.worker_id] = byW[r.worker_id] || { worker_id: r.worker_id, worker: r.worker, designation: r.designation, rate: Number(r.daily_rate),
      days: 0, basic: 0, otH: 0, otAmt: 0, gross: 0, pf: 0, pt: 0, other: 0, adv: 0, net: 0, sites: [], statuses: new Set(), manual: false };
    w.rate = Math.max(w.rate, Number(r.daily_rate));
    w.days += r.days; w.basic += r.basic; w.otH += Number(r.ot_hours); w.otAmt += r.otAmt; w.gross += r.gross;
    w.pf += r.pf; w.pt += r.pt; w.other += r.other; w.adv += r.adv; w.net += r.net;
    w.sites.push(`${r.site} ${r.days}d`); w.statuses.add(r.status); if (r.manual_override) w.manual = true;
  });
  const workers = Object.values(byW).map(w => ({ ...w, totalDed: +(w.pf + w.pt + w.other + w.adv).toFixed(2), status: [...w.statuses].join("/") }))
    .sort((a, b) => a.worker.localeCompare(b.worker));

  // per site
  const byS = {};
  rows.forEach(r => {
    const s = byS[r.site_id] = byS[r.site_id] || { site_id: r.site_id, site: r.site, workers: new Set(), days: 0, basic: 0, otH: 0, otAmt: 0 };   // update342: otH
    if (r.days > 0) s.workers.add(r.worker_id);
    s.days += r.days; s.basic += r.basic; s.otAmt += r.otAmt; s.otH += Number(r.ot_hours || 0);
  });
  // update339: EVERY active site appears every month. A site with nothing generated used to
  // vanish from this table, which reads as "cost nothing" — a zero row reads as "nothing
  // recorded", and only one of those is a statement you can act on. Head Office is an active
  // site, so it is included. Nothing else about the maths changes.
  (allSites || []).forEach(s => {
    if (siteId !== "all" && String(s.id) !== String(siteId)) return;
    if (!byS[s.id]) byS[s.id] = { site_id: s.id, site: s.name, workers: new Set(), days: 0, basic: 0, otH: 0, otAmt: 0 };
  });
  const sites = Object.values(byS).map(s => ({ ...s, workers: s.workers.size, otH: +s.otH.toFixed(2), total: +(s.basic + s.otAmt).toFixed(2) })).sort((a, b) => a.site.localeCompare(b.site));

  const grand = {
    workers: sites.reduce((n, s) => n + s.workers, 0), days: +sites.reduce((n, s) => n + s.days, 0).toFixed(1),
    basic: +sites.reduce((n, s) => n + s.basic, 0).toFixed(2), otAmt: +sites.reduce((n, s) => n + s.otAmt, 0).toFixed(2),
    total: +sites.reduce((n, s) => n + s.total, 0).toFixed(2),
    workerGross: +workers.reduce((n, w) => n + w.gross, 0).toFixed(2),   // reconciliation: must equal total
    workerNet: +workers.reduce((n, w) => n + w.net, 0).toFixed(2),
  };
  grand.reconciled = Math.abs(grand.workerGross - grand.total) < 0.5;

  // update339: the dashboard needs the raw per-(worker,site) rows so filters can be applied
  // and the site totals recomputed from the filtered set, and the full active-site list so
  // every site can be shown every month even with nothing generated.
  const covered = new Set(rows.map(r => r.site_id));
  const missingSites = (allSites || []).filter(s => !covered.has(s.id) && (siteId === "all" || String(s.id) === String(siteId))).map(s => s.name);
  return { workers, sites, grand, rows, missingSites, month: monthStr,
           allSites: (allSites || []).filter(s => siteId === "all" || String(s.id) === String(siteId)) };   // update339
}
