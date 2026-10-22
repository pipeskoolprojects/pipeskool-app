import { supabase, isDemo, fetchAll } from "./supabase";   // update320
import { scoped, isScoped } from "./scope";
import { withStaffSalary } from "./payPrivacy";   // update471
import { getHolidayMap, getHolidayContext, resolveHoliday } from "./holidays";   // update386

// Staff monthly salary from punches. Rules (Director, 20 Jul 2026):
// update375: per-day = monthly_salary / ACTUAL days in month (30 in Sep, 31 in Oct,
// 28 or 29 in Feb). The old fixed /30 quietly paid staff for ~1.03 days a month too many
// in a 31-day month and ~1.07 too few in February. Sundays are paid; absence on
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
  return { from, to, working, daysInMonth: days };   // update375
};

export async function generateStaffPayouts(monthStr) {
  // update245: generation stays company-wide on purpose — a staff_payouts row is per person
  // per month, not per site, so generating "for one site" would be meaningless. The project
  // tab narrows what you SEE (getStaffPayouts), not what gets calculated.
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { from, to, working, daysInMonth } = monthMeta(monthStr);   // update375
  const [{ data: staffRaw }, { data: existing }] = await Promise.all([
    supabase.from("app_users").select("id, full_name, mobile, ot_eligible, annual_paid_leaves, joining_date, last_working_day").or(`is_active.eq.true,last_working_day.gte.${from}`),   // update452: exited staff stay in the month of their last working day (final settlement), never after — same rule as labour (439)
    supabase.from("staff_payouts").select("id, user_id, status, advances_deducted, pf_amount, pt_amount, other_deduction").eq("pay_month", from),   // update295/348: keep the manual entries
  ]);
  const staff = await withStaffSalary(staffRaw || []);   // update471: salary via staff_pay
  const paid = (staff || []).filter(u => Number(u.monthly_salary) > 0);
  if (!paid.length) return { ok: false, error: "No staff have a monthly salary set. Enter salaries in Workers & Staff Master → Edit staff." };
  const { data: wrows } = await supabase.from("workers").select("id, mobile").in("mobile", paid.map(u => String(u.mobile)));
  const wByMobile = {}; (wrows || []).forEach(w => wByMobile[w.mobile] = w.id);
  const ids = Object.values(wByMobile);
  const { data: att } = ids.length ? await fetchAll(() => supabase.from("attendance")
    .select("worker_id, att_date, status, ot_approved, ot_approved_hours, holiday_multiplier, site_id").in("worker_id", ids)   // update382
    .gte("att_date", from).lt("att_date", to).order("id")) : { data: [] };   // update320: paged
  // update246: company holidays for this month. Staff payroll is company-wide, so a holiday
  // with no site_ids (the default — "All sites") applies to everyone.
  const holAll = await getHolidayMap(null, from, to, "staff");   // update293: Office-column holidays only
  // update386: for the category-aware resolver we also need the full context, per-user
  // pay-day overrides, and the site→category split (same as lib/data.js OFFICE_SITE_RE).
  const holCtx = await getHolidayContext(from, to);
  const OFFICE_SITE_RE = /head\s*office|^\s*the\s+office\s*$|^\s*office\s*$/i;
  const [{ data: sitesRows }, { data: usRows }, { data: spd }] = await Promise.all([
    supabase.from("sites").select("id, name"),
    supabase.from("user_sites").select("user_id, site_id"),
    supabase.from("staff_pay_days").select("user_id, on_date, multiplier").gte("on_date", from).lt("on_date", to),
  ]);
  const officeSiteIds = new Set((sitesRows || []).filter(s => OFFICE_SITE_RE.test(s.name || "")).map(s => s.id));
  const officeStaff = new Set();
  (usRows || []).forEach(r => { if (officeSiteIds.has(r.site_id)) officeStaff.add(r.user_id); });
  const spdMap = {}; (spd || []).forEach(r => { spdMap[r.user_id + "|" + r.on_date] = Number(r.multiplier); });

  const byW = {}; (att || []).forEach(a => {
    const x = byW[a.worker_id] = byW[a.worker_id] ||
      { full: 0, half: 0, ot: 0, attended: new Set(), hDouble: 0, hHalf: 0 };
    if (a.status === "present") { x.full++; x.attended.add(a.att_date); }
    else if (a.status === "half_day") { x.half++; x.attended.add(a.att_date); }
    if (a.ot_approved) x.ot += Number(a.ot_approved_hours || 0);
    // update246: worked ON a holiday. Salary already covers the day, so 2x means ONE extra
    // day's pay; a half day on a holiday is worth 1x, i.e. no extra.
    if (a.att_date) {
      // update386: staff category = office_staff if this user is assigned to a HEAD OFFICE
      // site, else site_staff. resolveHoliday returns the per-category multiplier from the
      // holiday row (category_rules > type_code > audience). staff_pay_days is the per-user
      // per-day override (mirror of attendance.holiday_multiplier for workers).
      const cat = officeStaff.has(a.worker_id) ? "office_staff" : "site_staff";
      const spdOverride = spdMap[a.worker_id + "|" + a.att_date];
      const rowOverride = a.holiday_multiplier != null ? Number(a.holiday_multiplier) : undefined;
      const override = spdOverride != null ? spdOverride : rowOverride;
      const rv = resolveHoliday(holCtx, a.att_date, a.site_id || null, cat, a.status, override);
      if (rv && rv.units != null) {
        // salary already covers 1×; hExtra is the amount ABOVE 1.
        const extra = Math.max(0, Number(rv.units) - 1);
        x.hExtra = (x.hExtra || 0) + extra;
      } else if (holAll[a.att_date]) {
        // pre-386 fallback path (backward compatible)
        if (a.status === "present") x.hDouble++;
        else if (a.status === "half_day") x.hHalf++;
      }
    }
  });
  // update295 (Director, 3 Sep): advances are NEVER auto-deducted. Recovery is a manual
  // per-month entry on the salary sheet; whatever is not recovered stays outstanding on the
  // Advance Salary Ledger and carries forward. (The old code deducted the full approved
  // amount in its month — that is what produced negative nets like -42,000.)

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
    const a = byW[wByMobile[String(u.mobile)]] || { full: 0, half: 0, ot: 0, hDouble: 0, hHalf: 0 };
    const present = a.full + a.half * 0.5;
    const perDay = Number(u.monthly_salary) / daysInMonth;
    // update246: a company holiday is PAID. Not attending one is not an absence, so it
    // never deducts and never consumes a paid leave. Sundays are already excluded.
    const holWorkdays = Object.keys(holAll).filter(d => {
      const dt = new Date(d + "T00:00:00");
      return dt.getDay() !== 0 && !(a.attended || new Set()).has(d);
    }).length;
    const absent = Math.max(0, working - present - holWorkdays);
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
      if (holAll[iso]) { if (run) runs.push(run); run = 0; continue; }   // update246: holiday = paid
      if (attended.has(iso)) { if (run) runs.push(run); run = 0; }
      else run++;
    }
    if (run) runs.push(run);
    const stretchEligible = runs.reduce((t, r) => t + Math.min(r, 10), 0);
    const leavesUsed = Math.min(absent, available, stretchEligible);
    const deductDays = absent - leavesUsed;
    const deduction = +(deductDays * perDay).toFixed(2);
    const otAmt = u.ot_eligible ? +((a.ot * perDay) / 8).toFixed(2) : 0;
    // update246: worked a holiday -> 2x. Salary already pays the day once, so add ONE more.
    const holAmount = +(((a.hDouble || 0) + Number(a.hExtra || 0)) * perDay).toFixed(2);   // update382
    const advDed = ex ? Number(ex.advances_deducted || 0) : 0;   // update295: manual entry preserved; new rows start at 0
    // update348: PF / PT / Other are typed by hand — a refresh must never wipe them.
    const pfAmt = ex ? Number(ex.pf_amount || 0) : 0;
    const ptAmt = ex ? Number(ex.pt_amount || 0) : 0;
    const othAmt = ex ? Number(ex.other_deduction || 0) : 0;
    const net = staffNet({ monthly_salary: Number(u.monthly_salary), deduction, ot_amount: otAmt,
      holiday_amount: holAmount, pf_amount: pfAmt, pt_amount: ptAmt, other_deduction: othAmt,
      advances_deducted: advDed });
    const row = { user_id: u.id, pay_month: from, monthly_salary: Number(u.monthly_salary),
      working_days: working, days_present: present, days_absent: absent, deduction,
      ot_hours: u.ot_eligible ? +a.ot.toFixed(2) : 0, ot_amount: otAmt,
      leaves_used: +leavesUsed.toFixed(1), leave_balance: +(yearBal - leavesUsed).toFixed(1),
      holiday_paid_days: holWorkdays, holiday_double_days: a.hDouble || 0,   // update246
      holiday_half_days: a.hHalf || 0, holiday_amount: holAmount,
      advances_deducted: advDed, pf_amount: pfAmt, pt_amount: ptAmt, other_deduction: othAmt,   // update348
      net, status: "draft" };
    const q = ex ? supabase.from("staff_payouts").update(row).eq("id", ex.id)
                 : supabase.from("staff_payouts").insert(row);
    const { error } = await q;
    if (error) return { ok: false, error: error.message };
    ex ? updated++ : created++;
  }
  return { ok: true, created, updated, skippedFinal };
}

export async function getStaffPayouts(monthStr, siteId) {
  if (isDemo) return [];
  siteId = scoped(siteId);   // update245: inherits the project workspace's site
  // update240: staff_payouts has TWO foreign keys to app_users (user_id and approved_by).
  // A bare app_users(...) embed is ambiguous, so PostgREST rejected the whole query and this
  // function returned [] — for EVERYONE, Director included. Name the column, as the rest of
  // the codebase already does (e.g. reviewer:reviewed_by(full_name) in lib/money.js).
  // update245: staff_payouts has NO site_id — a staff member belongs to sites through
  // user_sites. So scoping means "the staff assigned to this project", resolved first.
  let allowed = null;
  if (isScoped(siteId)) {
    const { data: us } = await supabase.from("user_sites").select("user_id").eq("site_id", siteId);
    allowed = new Set((us || []).map(r => Number(r.user_id)));
  }
  const { data, error } = await supabase.from("staff_payouts")
    .select("id, user_id, monthly_salary, working_days, days_present, days_absent, deduction, ot_hours, ot_amount, leaves_used, leave_balance, advances_deducted, pf_amount, pt_amount, other_deduction, net, status, holiday_paid_days, holiday_double_days, holiday_half_days, holiday_amount, staff:user_id(full_name, role, bank_account_no, bank_ifsc, pan_no)")   // update348
    .eq("pay_month", monthStr + "-01").order("id");
  // update240: never swallow the error — a failed read must not look like "no data"
  if (error) throw new Error(error.message);
  // update295/296: per-person outstanding for the Advances hint. v296: read through the
  // DEFINER function so every role allowed on this screen gets the same answer (a direct
  // table read could return nothing under a non-approver login — the Satyam case).
  const ids = (data || []).map(p => p.user_id);
  const takenBy = {}, dedBy = {};
  if (ids.length) {
    const { data: ost, error: oe } = await supabase.rpc("fn_staff_advance_outstanding", { p_user_ids: ids });
    if (!oe && Array.isArray(ost)) {
      ost.forEach(x => { takenBy[x.user_id] = Number(x.taken || 0); dedBy[x.user_id] = Number(x.deducted || 0); });
    } else {   // fn not yet run — fall back to direct reads (pre-296 behaviour)
      const [{ data: allAdv }, { data: allDed }] = await Promise.all([
        supabase.from("advance_salary_requests").select("beneficiary_user_id, amount, approved_amount").eq("status", "approved").in("beneficiary_user_id", ids),
        supabase.from("staff_payouts").select("user_id, advances_deducted").in("user_id", ids).gt("advances_deducted", 0),
      ]);
      (allAdv || []).forEach(a => { takenBy[a.beneficiary_user_id] = (takenBy[a.beneficiary_user_id] || 0) + Number(a.approved_amount ?? a.amount ?? 0); });
      (allDed || []).forEach(r => { dedBy[r.user_id] = (dedBy[r.user_id] || 0) + Number(r.advances_deducted || 0); });
    }
  }
  // update341: user_id was being DROPPED here. The Payroll Summary staff tabs match these
  // rows against the attendance grid by user_id, so every row failed the match and both
  // staff tabs read "No generated staff salary" while the generator reported 16 drafts.
  return (data || []).filter(p => !allowed || allowed.has(Number(p.user_id))).map(p => ({ id: p.id, user_id: Number(p.user_id), name: p.staff?.full_name || "", role: p.staff?.role || "",
    salary: Number(p.monthly_salary), working: Number(p.working_days), present: Number(p.days_present),
    absent: Number(p.days_absent), deduction: Number(p.deduction), ot: Number(p.ot_hours),
    leaves: Number(p.leaves_used || 0), leaveBal: Number(p.leave_balance || 0),
    otAmt: Number(p.ot_amount), adv: Number(p.advances_deducted), net: Number(p.net), status: p.status,
    pf: Number(p.pf_amount || 0), pt: Number(p.pt_amount || 0), other: Number(p.other_deduction || 0),   // update348
    outstanding: Math.max((takenBy[p.user_id] || 0) - (dedBy[p.user_id] || 0), 0),   // update295: incl. this row entry
    holPaid: Number(p.holiday_paid_days || 0), holDouble: Number(p.holiday_double_days || 0),
    holHalf: Number(p.holiday_half_days || 0), holAmt: Number(p.holiday_amount || 0),   // update246
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


// update295: manual monthly advance recovery on a DRAFT staff payout. Clamped to what is
// actually outstanding (counting this row's current entry), net recomputed, preserved by
// Generate. The ledger carries the rest forward automatically.
// update348: ONE definition of staff net. It used to be spelled out separately in the
// generator and in the advance setter; adding PF/PT/Other would have meant getting the same
// formula right in three places, which is how the two views drifted apart before.
export function staffNet(p, over = {}) {
  const n = k => Number(over[k] ?? p[k] ?? 0);
  return +(n("monthly_salary") - n("deduction") + n("ot_amount") + n("holiday_amount")
           - n("pf_amount") - n("pt_amount") - n("other_deduction") - n("advances_deducted")).toFixed(2);
}

// update348: PF / PT / Other for staff — typed in, never computed. Draft rows only.
export async function setStaffStatutory(id, pf, pt, other) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data: p, error: e1 } = await supabase.from("staff_payouts")
    .select("id, status, monthly_salary, deduction, ot_amount, holiday_amount, advances_deducted, pf_amount, pt_amount, other_deduction")
    .eq("id", id).single();
  if (e1 || !p) return { ok: false, error: e1?.message || "Staff payout not found." };
  if (p.status !== "draft") return { ok: false, error: "Only draft salary rows can be changed — approved/paid are locked." };
  const v = x => Math.max(Number(x) || 0, 0);
  const over = { pf_amount: v(pf), pt_amount: v(pt), other_deduction: v(other) };
  const net = staffNet(p, over);
  if (net < 0) return { ok: false, error: "Those deductions exceed the salary — net would be negative." };
  const { error } = await supabase.from("staff_payouts").update({ ...over, net }).eq("id", id);
  if (error) {
    if (/pf_amount|pt_amount|other_deduction|schema cache/i.test(error.message))
      return { ok: false, error: "Run pipeskool_staff_deductions.sql (update 348) in Supabase first." };
    return { ok: false, error: error.message };
  }
  return { ok: true, net };
}

export async function setStaffAdvance(id, amount) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data: p, error: e1 } = await supabase.from("staff_payouts")
    .select("id, user_id, monthly_salary, deduction, ot_amount, holiday_amount, advances_deducted, status, pf_amount, pt_amount, other_deduction").eq("id", id).single();
  if (e1 || !p) return { ok: false, error: e1?.message || "Payout not found." };
  if (p.status !== "draft") return { ok: false, error: "Only draft rows can be edited — reopen an approved row first; paid rows are locked." };
  const v = Math.max(Number(amount) || 0, 0);
  // update296: clamp from the same definer source as the hint — role-independent
  let taken = 0, dedAll = 0;
  const { data: ost, error: oe } = await supabase.rpc("fn_staff_advance_outstanding", { p_user_ids: [p.user_id] });
  if (!oe && Array.isArray(ost) && ost[0]) { taken = Number(ost[0].taken || 0); dedAll = Number(ost[0].deducted || 0); }
  else {
    const [{ data: allAdv }, { data: allDed }] = await Promise.all([
      supabase.from("advance_salary_requests").select("amount, approved_amount").eq("status", "approved").eq("beneficiary_user_id", p.user_id),
      supabase.from("staff_payouts").select("id, advances_deducted").eq("user_id", p.user_id).gt("advances_deducted", 0),
    ]);
    taken = (allAdv || []).reduce((t, a) => t + Number(a.approved_amount ?? a.amount ?? 0), 0);
    dedAll = (allDed || []).reduce((t, r) => t + Number(r.advances_deducted || 0), 0);
  }
  const dedOther = Math.max(dedAll - Number(p.advances_deducted || 0), 0);
  const maxNow = Math.max(taken - dedOther, 0);
  if (v > maxNow) return { ok: false, error: "Only ₹" + maxNow.toLocaleString("en-IN") + " is outstanding for this person \u2014 cannot recover more than that." };
  const net = staffNet(p, { advances_deducted: v });   // update348: includes PF / PT / Other
  const { error } = await supabase.from("staff_payouts").update({ advances_deducted: v, net }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, net, remaining: +(maxNow - v).toFixed(2) };
}
