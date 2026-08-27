import { supabase, isDemo } from "./supabase";

// Staff monthly salary from punches. Rules (Director, 20 Jul 2026):
// per-day = monthly_salary / 30 (fixed). Sundays are paid; absence on
// working days (Mon-Sat) deducts at per-day. OT only when ot_eligible,
// from APPROVED OT hours at per-day/8. Approved salary advances in the
// month are deducted. Regeneration touches drafts only.

const monthMeta = m => {
  const [y, mo] = m.split("-").map(Number);
  const from = `${m}-01`;
  const days = new Date(y, mo, 0).getDate();
  const to = new Date(y, mo, 1).toLocaleDateString("en-CA");
  let working = 0;
  for (let d = 1; d <= days; d++) if (new Date(y, mo - 1, d).getDay() !== 0) working++;
  return { from, to, working };
};

export async function generateStaffPayouts(monthStr) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { from, to, working } = monthMeta(monthStr);
  const [{ data: staff }, { data: existing }] = await Promise.all([
    supabase.from("app_users").select("id, full_name, mobile, monthly_salary, ot_eligible, annual_paid_leaves, joining_date").eq("is_active", true),
    supabase.from("staff_payouts").select("id, user_id, status").eq("pay_month", from),
  ]);
  const paid = (staff || []).filter(u => Number(u.monthly_salary) > 0);
  if (!paid.length) return { ok: false, error: "No staff have a monthly salary set. Enter salaries in Workers & Staff Master → Edit staff." };
  const { data: wrows } = await supabase.from("workers").select("id, mobile").in("mobile", paid.map(u => String(u.mobile)));
  const wByMobile = {}; (wrows || []).forEach(w => wByMobile[w.mobile] = w.id);
  const ids = Object.values(wByMobile);
  const { data: att } = ids.length ? await supabase.from("attendance")
    .select("worker_id, att_date, status, ot_approved, ot_approved_hours").in("worker_id", ids)
    .gte("att_date", from).lt("att_date", to) : { data: [] };
  const byW = {}; (att || []).forEach(a => {
    const x = byW[a.worker_id] = byW[a.worker_id] || { full: 0, half: 0, ot: 0, attended: new Set() };
    if (a.status === "present") { x.full++; x.attended.add(a.att_date); }
    else if (a.status === "half_day") { x.half++; x.attended.add(a.att_date); }
    if (a.ot_approved) x.ot += Number(a.ot_approved_hours || 0);
  });
  const { data: adv } = await supabase.from("advance_salary_requests")
    .select("beneficiary_user_id, amount").eq("status", "approved")
    .gte("reviewed_at", from).lt("reviewed_at", to);
  const advBy = {}; (adv || []).forEach(a => { if (a.beneficiary_user_id) advBy[a.beneficiary_user_id] = (advBy[a.beneficiary_user_id] || 0) + Number(a.amount || 0); });

  // Leave year runs 1 April – 31 March (Director's policy, 20 Jul 2026).
  const yy = Number(from.slice(0, 4)), mm = Number(from.slice(5, 7));
  const lyStart = (mm >= 4 ? yy : yy - 1) + "-04-01";
  const inH1 = mm >= 4 && mm <= 9;                       // Apr–Sep window
  const { data: prior } = await supabase.from("staff_payouts")
    .select("user_id, pay_month, leaves_used").gte("pay_month", lyStart).lt("pay_month", from);
  const usedBy = {}, usedH1By = {};
  (prior || []).forEach(r => {
    const n = Number(r.leaves_used || 0), pm = Number(String(r.pay_month).slice(5, 7));
    usedBy[r.user_id] = (usedBy[r.user_id] || 0) + n;
    if (pm >= 4 && pm <= 9) usedH1By[r.user_id] = (usedH1By[r.user_id] || 0) + n;
  });

  const exBy = {}; (existing || []).forEach(e => exBy[e.user_id] = e);
  let created = 0, updated = 0, skippedFinal = 0;
  for (const u of paid) {
    const ex = exBy[u.id];
    if (ex && ex.status !== "draft") { skippedFinal++; continue; }
    const a = byW[wByMobile[String(u.mobile)]] || { full: 0, half: 0, ot: 0 };
    const present = a.full + a.half * 0.5;
    const absent = Math.max(0, working - present);
    const perDay = Number(u.monthly_salary) / 30;
    // POLICY (Director, 20 Jul 2026): leave year Apr–Mar.
    // Apr–Sep: cumulative leaves capped at 50% of annual entitlement.
    // Oct–Mar: full remaining balance available. Max 10 leaves at a stretch.
    // Proportionate entitlement for mid-year joiners (Director, 21 Jul 2026):
    // months from joining month (or leave-year start) through March, ÷ 12.
    let annual = Number(u.annual_paid_leaves || 0);
    if (u.joining_date && u.joining_date > lyStart) {
      const jm = Number(String(u.joining_date).slice(5, 7));            // 1..12
      const joinIdx = jm >= 4 ? jm - 3 : jm + 9;                        // Apr=1 .. Mar=12
      annual = +(annual * (12 - joinIdx + 1) / 12).toFixed(1);
    }
    const yearBal = Math.max(0, annual - (usedBy[u.id] || 0));
    const h1Cap = Math.max(0, annual * 0.5 - (usedH1By[u.id] || 0));
    const available = inH1 ? Math.min(yearBal, h1Cap) : yearBal;
    // absence runs this month (Sundays bridge a run but are paid, not leaves)
    const attended = a.attended || new Set();
    const dim = new Date(yy, mm, 0).getDate();
    let runs = [], run = 0;
    for (let d = 1; d <= dim; d++) {
      const dt = new Date(yy, mm - 1, d);
      const iso = dt.toLocaleDateString("en-CA");
      if (dt.getDay() === 0) continue;                    // Sunday: paid, ignored
      if (attended.has(iso)) { if (run) runs.push(run); run = 0; }
      else run++;
    }
    if (run) runs.push(run);
    const stretchEligible = runs.reduce((t, r) => t + Math.min(r, 10), 0);
    const leavesUsed = Math.min(absent, available, stretchEligible);
    const deductDays = absent - leavesUsed;
    const deduction = +(deductDays * perDay).toFixed(2);
    const otAmt = u.ot_eligible ? +((a.ot * perDay) / 8).toFixed(2) : 0;
    const advDed = Math.min(advBy[u.id] || 0, Number(u.monthly_salary));
    const net = +(Number(u.monthly_salary) - deduction + otAmt - advDed).toFixed(2);
    const row = { user_id: u.id, pay_month: from, monthly_salary: Number(u.monthly_salary),
      working_days: working, days_present: present, days_absent: absent, deduction,
      ot_hours: u.ot_eligible ? +a.ot.toFixed(2) : 0, ot_amount: otAmt,
      leaves_used: +leavesUsed.toFixed(1), leave_balance: +(yearBal - leavesUsed).toFixed(1),
      advances_deducted: advDed, net, status: "draft" };
    const q = ex ? supabase.from("staff_payouts").update(row).eq("id", ex.id)
                 : supabase.from("staff_payouts").insert(row);
    const { error } = await q;
    if (error) return { ok: false, error: error.message };
    ex ? updated++ : created++;
  }
  return { ok: true, created, updated, skippedFinal };
}

export async function getStaffPayouts(monthStr) {
  if (isDemo) return [];
  // update240: staff_payouts has TWO foreign keys to app_users (user_id and approved_by).
  // A bare app_users(...) embed is ambiguous, so PostgREST rejected the whole query and this
  // function returned [] — for EVERYONE, Director included. Name the column, as the rest of
  // the codebase already does (e.g. reviewer:reviewed_by(full_name) in lib/money.js).
  const { data, error } = await supabase.from("staff_payouts")
    .select("id, monthly_salary, working_days, days_present, days_absent, deduction, ot_hours, ot_amount, leaves_used, leave_balance, advances_deducted, net, status, staff:user_id(full_name, role, bank_account_no, bank_ifsc, pan_no)")
    .eq("pay_month", monthStr + "-01").order("id");
  // update240: never swallow the error — a failed read must not look like "no data"
  if (error) throw new Error(error.message);
  return (data || []).map(p => ({ id: p.id, name: p.staff?.full_name || "", role: p.staff?.role || "",
    salary: Number(p.monthly_salary), working: Number(p.working_days), present: Number(p.days_present),
    absent: Number(p.days_absent), deduction: Number(p.deduction), ot: Number(p.ot_hours),
    leaves: Number(p.leaves_used || 0), leaveBal: Number(p.leave_balance || 0),
    otAmt: Number(p.ot_amount), adv: Number(p.advances_deducted), net: Number(p.net), status: p.status,
    bankAc: p.staff?.bank_account_no || "", ifsc: p.staff?.bank_ifsc || "", pan: p.staff?.pan_no || "" }));
}

export async function approveStaffPayouts(monthStr, byUser) {
  if (isDemo) return { ok: true };
  const { error, count } = await supabase.from("staff_payouts")
    .update({ status: "approved", approved_by: byUser || null, approved_at: new Date().toISOString() }, { count: "exact" })
    .eq("pay_month", monthStr + "-01").eq("status", "draft");
  return error ? { ok: false, error: error.message } : { ok: true, count: count || 0 };
}

export async function markStaffPayoutsPaid(monthStr) {
  if (isDemo) return { ok: true };
  const { error, count } = await supabase.from("staff_payouts")
    .update({ status: "paid", paid_at: new Date().toISOString() }, { count: "exact" })
    .eq("pay_month", monthStr + "-01").eq("status", "approved");
  return error ? { ok: false, error: error.message } : { ok: true, count: count || 0 };
}
