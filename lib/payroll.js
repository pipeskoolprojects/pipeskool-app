import { supabase, isDemo } from "./supabase";

// ---------- Payroll: generate monthly wage payouts from attendance ----------
// Own labour only. OT counts ONLY when approved (ot_approved_hours), never raw punch OT.
// update190: OT rounding rule (business): <=1h -> 0; above 1h, round half-up to the
// nearest hour. 1:45->2, 2:15->2, 2:30->3, 3:10->3, 3:30->4. Suggested value wherever
// OT is approved; the approver can still override.
export function otRound(h) { h = Number(h) || 0; return h <= 1 ? 0 : Math.round(h); }
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
    supabase.from("wage_payouts").select("id, worker_id, status, advances_deducted, pay_mode")
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
      advances_deducted: adv, net: +(gross - adv).toFixed(2),
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
  if (isDemo) return [];
  let q = supabase.from("wage_payouts")
    .select("id, worker_id, days_full, days_half, days_total, ot_hours, daily_rate, ot_rate, gross, advances_deducted, net, pay_mode, status, workers(full_name, category, bank_account_no, bank_ifsc), sites(name)")
    .eq("pay_month", monthStr + "-01").order("id");
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data } = await q;
  return (data || []).map(w => ({
    id: w.id, worker: w.workers?.full_name || "", category: w.workers?.category || "",
    site: w.sites?.name || "", daysFull: Number(w.days_full), daysHalf: Number(w.days_half),
    days: Number(w.days_total), ot: Number(w.ot_hours), rate: Number(w.daily_rate),
    otRate: Number(w.ot_rate), gross: Number(w.gross), adv: Number(w.advances_deducted),
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
  const { error } = await supabase.from("wage_payouts").update({ advances_deducted: adv, net: +(Number(p.gross) - adv).toFixed(2) }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setPayoutMode(id, mode) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("wage_payouts").update({ pay_mode: mode }).eq("id", id).eq("status", "draft");
  return error ? { ok: false, error: error.message } : { ok: true };
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
