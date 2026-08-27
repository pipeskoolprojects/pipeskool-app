import { supabase, isDemo } from "./supabase";
import { scoped } from "./scope";

// ---------- Payroll: generate monthly wage payouts from attendance ----------
// Own labour only. OT counts ONLY when approved (ot_approved_hours), never raw punch OT.
// update190: OT rounding rule (business): <=1h -> 0; above 1h, round half-up to the
// nearest hour. 1:45->2, 2:15->2, 2:30->3, 3:10->3, 3:30->4. Suggested value wherever
// OT is approved; the approver can still override.
// v2 (update195): <=1h -> 0; else full hours + 1 only when the extra minutes EXCEED 30.
// 1:45->2, 2:15->2, 2:30->2, 2:35->3, 3:10->3, 3:30->3, 3:40->4.
export function otRound(h) {
  const min = Math.round((Number(h) || 0) * 60);
  if (min <= 60) return 0;
  return Math.floor(min / 60) + (min % 60 > 30 ? 1 : 0);
}
// update194: single display rule for durations everywhere — "3h 42m", never "3.7h".
export function fmtHM(hours) {
  const m = Math.round((Number(hours) || 0) * 60);
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}
// Regeneration updates DRAFT rows (preserving manually entered advances/pay mode)
// and never touches approved/paid rows.

const monthRange = m => {
  const [y, mo] = m.split("-").map(Number);
  const from = `${m}-01`;
  const to = new Date(y, mo, 1).toLocaleDateString("en-CA");
  return { from, to };
};

export async function generatePayouts(siteId, monthStr) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  if (!siteId || siteId === "all") return { ok: false, error: "Pick a specific site to generate payouts." };
  const { from, to } = monthRange(monthStr);

  const [{ data: site }, { data: workers }, { data: att }, { data: existing }] = await Promise.all([
    supabase.from("sites").select("std_working_hours").eq("id", siteId).single(),
    supabase.from("workers").select("id, mobile, daily_wage, ot_eligible").eq("site_id", siteId).eq("labour_type", "own").eq("is_active", true),
    supabase.from("attendance").select("worker_id, status, ot_approved, ot_approved_hours")
      .eq("site_id", siteId).gte("att_date", from).lt("att_date", to),
    supabase.from("wage_payouts").select("id, worker_id, status, advances_deducted, pay_mode, pf_amount, pt_amount")
      .eq("site_id", siteId).eq("pay_month", from),
  ]);

  // staff punch-profiles are never labour — exclude them from labour payroll
  const { data: staffRows } = await supabase.from("app_users").select("mobile").eq("is_active", true);
  const staffMob = new Set((staffRows || []).map(u => String(u.mobile)));
  const payWorkers = (workers || []).filter(w => !staffMob.has(String(w.mobile)));

  const stdHrs = Number(site?.std_working_hours) || 8;
  const byWorker = {};
  (att || []).forEach(a => {
    const w = byWorker[a.worker_id] = byWorker[a.worker_id] || { full: 0, half: 0, ot: 0 };
    if (a.status === "present") w.full += 1;
    else if (a.status === "half_day") w.half += 1;
    if (a.ot_approved) w.ot += Number(a.ot_approved_hours || 0);
  });

  const existBy = {}; (existing || []).forEach(e => existBy[e.worker_id] = e);
  let created = 0, updated = 0, skippedFinal = 0, skippedNoWage = 0;

  for (const w of workers || []) {
    const a = byWorker[w.id];
    if (!a || (a.full === 0 && a.half === 0)) continue;          // no attendance -> no payout row
    const rate = Number(w.daily_wage) || 0;
    if (rate <= 0) { skippedNoWage++; continue; }                 // staff auto-enrolled at ₹0 etc.
    const ex = existBy[w.id];
    if (ex && ex.status !== "draft") { skippedFinal++; continue; } // approved/paid untouchable
    const otH = w.ot_eligible === false ? 0 : a.ot;               // update190: OT master switch — OFF = ₹0 even with approved rows
    const otRate = +(rate / stdHrs).toFixed(2);
    const gross = +((a.full + a.half * 0.5) * rate + otH * otRate).toFixed(2);
    const adv = ex ? Number(ex.advances_deducted || 0) : 0;
    const row = {
      worker_id: w.id, site_id: Number(siteId), pay_month: from,
      days_full: a.full, days_half: a.half, ot_hours: +otH.toFixed(2),
      daily_rate: rate, ot_rate: otRate, gross,
      pf_amount: Number(ex?.pf_amount || 0), pt_amount: Number(ex?.pt_amount || 0),   // update194: manual statutory kept on regenerate
      advances_deducted: adv, net: +(gross - adv - Number(ex?.pf_amount || 0) - Number(ex?.pt_amount || 0)).toFixed(2),
      pay_mode: ex?.pay_mode || "cash", status: "draft",
    };
    const q = ex
      ? supabase.from("wage_payouts").update(row).eq("id", ex.id)
      : supabase.from("wage_payouts").insert(row);
    const { error } = await q;
    if (error) return { ok: false, error: error.message };
    ex ? updated++ : created++;
  }
  return { ok: true, created, updated, skippedFinal, skippedNoWage };
}

export async function getPayouts(monthStr, siteId) {
  siteId = scoped(siteId);   // update245
  if (isDemo) return [];
  let q = supabase.from("wage_payouts")
    .select("id, worker_id, days_full, days_half, days_total, ot_hours, daily_rate, ot_rate, gross, advances_deducted, pf_amount, pt_amount, net, pay_mode, status, workers(full_name, category, bank_account_no, bank_ifsc), sites(name)")
    .eq("pay_month", monthStr + "-01").order("id");
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data } = await q;
  return (data || []).map(w => ({
    id: w.id, worker: w.workers?.full_name || "", category: w.workers?.category || "",
    site: w.sites?.name || "", daysFull: Number(w.days_full), daysHalf: Number(w.days_half),
    days: Number(w.days_total), ot: Number(w.ot_hours), rate: Number(w.daily_rate),
    otRate: Number(w.ot_rate), gross: Number(w.gross), adv: Number(w.advances_deducted),
    pf: Number(w.pf_amount || 0), pt: Number(w.pt_amount || 0),
    net: Number(w.net), mode: w.pay_mode, status: w.status,
    bankAc: w.workers?.bank_account_no || "", ifsc: w.workers?.bank_ifsc || "",
  }));
}

export async function setPayoutAdvance(id, amount) {
  if (isDemo) return { ok: true };
  const { data: p } = await supabase.from("wage_payouts").select("gross, status").eq("id", id).single();
  if (!p || p.status !== "draft") return { ok: false, error: "Only draft payouts can be edited." };
  const adv = Number(amount) || 0;
  if (adv < 0 || adv > Number(p.gross)) return { ok: false, error: "Advance must be between 0 and the gross amount." };
  const { data: cur } = await supabase.from("wage_payouts").select("pf_amount, pt_amount").eq("id", id).single();
  const { error } = await supabase.from("wage_payouts").update({ advances_deducted: adv, net: +(Number(p.gross) - adv - Number(cur?.pf_amount || 0) - Number(cur?.pt_amount || 0)).toFixed(2) }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setPayoutMode(id, mode) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("wage_payouts").update({ pay_mode: mode }).eq("id", id).eq("status", "draft");
  return error ? { ok: false, error: error.message } : { ok: true };
}

// update239: BULK GENERATE across every site the user can see.
// generatePayouts() is per-site by design (it reads that site's std_working_hours, its own
// labour list and its attendance window), so bulk is a loop over it rather than a rewritten
// query. It is idempotent for the same reason a single-site run is: approved/paid rows are
// never touched, drafts are refreshed in place.
// onProgress(done, total, siteName) lets the page show live feedback instead of a dead button.
export async function generatePayoutsAll(sites, monthStr, onProgress) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const list = (sites || []).filter(s => s && s.id != null);
  if (list.length === 0) return { ok: false, error: "No sites available to generate for." };

  const total = { created: 0, updated: 0, skippedFinal: 0, skippedNoWage: 0 };
  const failed = [];
  let done = 0;
  for (const s of list) {
    if (onProgress) onProgress(done, list.length, s.name);
    const r = await generatePayouts(s.id, monthStr);
    if (!r.ok) failed.push((s.name || ("Site " + s.id)) + ": " + r.error);
    else {
      total.created += r.created; total.updated += r.updated;
      total.skippedFinal += r.skippedFinal; total.skippedNoWage += r.skippedNoWage;
    }
    done++;
  }
  if (onProgress) onProgress(done, list.length, null);
  // a failure on one site must not hide the sites that DID generate
  return { ok: true, ...total, sites: list.length, failedSites: failed };
}

export async function approvePayouts(monthStr, siteId, byUser) {
  if (isDemo) return { ok: true };
  if (!siteId || siteId === "all") return { ok: false, error: "Pick a specific site." };
  const { error, count } = await supabase.from("wage_payouts")
    .update({ status: "approved", approved_by: byUser || null, approved_at: new Date().toISOString() }, { count: "exact" })
    .eq("pay_month", monthStr + "-01").eq("site_id", siteId).eq("status", "draft");
  return error ? { ok: false, error: error.message } : { ok: true, count: count || 0 };
}

export async function markPayoutsPaid(monthStr, siteId) {
  if (isDemo) return { ok: true };
  if (!siteId || siteId === "all") return { ok: false, error: "Pick a specific site." };
  const { error, count } = await supabase.from("wage_payouts")
    .update({ status: "paid", paid_at: new Date().toISOString() }, { count: "exact" })
    .eq("pay_month", monthStr + "-01").eq("site_id", siteId).eq("status", "approved");
  return error ? { ok: false, error: error.message } : { ok: true, count: count || 0 };
}

// update194: PF / Professional Tax — manual, draft payouts only; net recomputed
export async function setPayoutStatutory(id, pf, pt) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data: p, error: e1 } = await supabase.from("wage_payouts").select("gross, advances_deducted, status").eq("id", id).single();
  if (e1 || !p) return { ok: false, error: e1?.message || "Payout not found." };
  if (p.status !== "draft") return { ok: false, error: "Only draft payouts can be changed — approved/paid are locked." };
  const pfN = Math.max(Number(pf) || 0, 0), ptN = Math.max(Number(pt) || 0, 0);
  const net = +(Number(p.gross) - Number(p.advances_deducted) - pfN - ptN).toFixed(2);
  if (net < 0) return { ok: false, error: "PF + PT + advances exceed gross — net would be negative." };
  const { error } = await supabase.from("wage_payouts").update({ pf_amount: pfN, pt_amount: ptN, net }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true, net };
}
