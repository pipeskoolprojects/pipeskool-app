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
    supabase.from("app_users").select("id, full_name, mobile, monthly_salary, ot_eligible, annual_paid_leaves").eq("is_active", true),
    supabase.from("staff_payouts").select("id, user_id, status").eq("pay_month", from),
  ]);
  const paid = (staff || []).filter(u => Number(u.monthly_salary) > 0);
  if (!paid.length) return { ok: false, error: "No staff have a monthly salary set. Enter salaries in Workers & Staff Master → Edit staff." };
  const { data: wrows } = await supabase.from("workers").select("id, mobile").in("mobile", paid.map(u => String(u.mobile)));
  const wByMobile = {}; (wrows || []).forEach(w => wByMobile[w.mobile] = w.id);
  const ids = Object.values(wByMobile);
  const { data: att } = ids.length ? await supabase.from("attendance")
    .select("worker_id, status, ot_approved, ot_approved_hours").in("worker_id", ids)
    .gte("att_date", from).lt("att_date", to) : { data: [] };
  const byW = {}; (att || []).forEach(a => {
    const x = byW[a.worker_id] = byW[a.worker_id] || { full: 0, half: 0, ot: 0 };
    if (a.status === "present") x.full++;
    else if (a.status === "half_day") x.half++;
    if (a.ot_approved) x.ot += Number(a.ot_approved_hours || 0);
  });
  const { data: adv } = await supabase.from("advance_salary_requests")
    .select("beneficiary_user_id, amount").eq("status", "approved")
    .gte("reviewed_at", from).lt("reviewed_at", to);
  const advBy = {}; (adv || []).forEach(a => { if (a.beneficiary_user_id) advBy[a.beneficiary_user_id] = (advBy[a.beneficiary_user_id] || 0) + Number(a.amount || 0); });

  // leaves already used earlier this calendar year (from prior monthly sheets)
  const yearStart = from.slice(0, 4) + "-01-01";
  const { data: prior } = await supabase.from("staff_payouts")
    .select("user_id, leaves_used").gte("pay_month", yearStart).lt("pay_month", from);
  const usedBy = {}; (prior || []).forEach(r => usedBy[r.user_id] = (usedBy[r.user_id] || 0) + Number(r.leaves_used || 0));

  const exBy = {}; (existing || []).forEach(e => exBy[e.user_id] = e);
  let created = 0, updated = 0, skippedFinal = 0;
  for (const u of paid) {
    const ex = exBy[u.id];
    if (ex && ex.status !== "draft") { skippedFinal++; continue; }
    const a = byW[wByMobile[String(u.mobile)]] || { full: 0, half: 0, ot: 0 };
    const present = a.full + a.half * 0.5;
    const absent = Math.max(0, working - present);
    const perDay = Number(u.monthly_salary) / 30;
    const leaveBal = Math.max(0, Number(u.annual_paid_leaves || 0) - (usedBy[u.id] || 0));
    const leavesUsed = Math.min(absent, leaveBal);
    const deductDays = absent - leavesUsed;
    const deduction = +(deductDays * perDay).toFixed(2);
    const otAmt = u.ot_eligible ? +((a.ot * perDay) / 8).toFixed(2) : 0;
    const advDed = Math.min(advBy[u.id] || 0, Number(u.monthly_salary));
    const net = +(Number(u.monthly_salary) - deduction + otAmt - advDed).toFixed(2);
    const row = { user_id: u.id, pay_month: from, monthly_salary: Number(u.monthly_salary),
      working_days: working, days_present: present, days_absent: absent, deduction,
      ot_hours: u.ot_eligible ? +a.ot.toFixed(2) : 0, ot_amount: otAmt,
      leaves_used: +leavesUsed.toFixed(1), leave_balance: +(leaveBal - leavesUsed).toFixed(1),
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
  const { data } = await supabase.from("staff_payouts")
    .select("id, monthly_salary, working_days, days_present, days_absent, deduction, ot_hours, ot_amount, leaves_used, leave_balance, advances_deducted, net, status, app_users(full_name, role)")
    .eq("pay_month", monthStr + "-01").order("id");
  return (data || []).map(p => ({ id: p.id, name: p.app_users?.full_name || "", role: p.app_users?.role || "",
    salary: Number(p.monthly_salary), working: Number(p.working_days), present: Number(p.days_present),
    absent: Number(p.days_absent), deduction: Number(p.deduction), ot: Number(p.ot_hours),
    leaves: Number(p.leaves_used || 0), leaveBal: Number(p.leave_balance || 0),
    otAmt: Number(p.ot_amount), adv: Number(p.advances_deducted), net: Number(p.net), status: p.status }));
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
