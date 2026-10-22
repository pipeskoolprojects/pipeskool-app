// Leave Request Management — update130
// Balances mirror lib/staffpay.js policy exactly (Director, 20-21 Jul 2026):
// leave year Apr–Mar; Apr–Sep cumulative cap = 50% of annual entitlement;
// Oct–Mar full remaining balance; max 10 leaves per stretch; joiner proration
// = months from joining month through March ÷ 12; salary ÷ 30 per day;
// Sundays are paid and never counted as leave. Usage source = staff_payouts.
import { supabase, isDemo } from "./supabase";
import { notifyUsers, notifyDecision } from "./notify";
import { canAnySite } from "./auth";
import { staffSalaries } from "./payPrivacy";   // update471
import { fileStore } from "./files";   // update460: files live in Cloudflare R2 (private)

export const LEAVE_TYPES = [
  ["paid", "Paid Leave"], ["sick", "Sick Leave"], ["casual", "Casual Leave"],
  ["emergency", "Emergency Leave"], ["half_day", "Half Day"], ["lwp", "Leave Without Pay"],
];
export const typeLabel = t => (LEAVE_TYPES.find(x => x[0] === t) || ["", t])[1];

const iso = d => d.toLocaleDateString("en-CA");
export function leaveYearStart(today = new Date()) {
  const y = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  return `${y}-04-01`;
}
const inH1 = (today = new Date()) => { const m = today.getMonth() + 1; return m >= 4 && m <= 9; };

export async function getHolidays() {
  const { data } = await supabase.from("company_holidays").select("*").order("on_date");
  return data || [];
}
export async function addHoliday(on_date, name, kind = "holiday") {
  const { error } = await supabase.from("company_holidays").insert({ on_date, name, kind });
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function deleteHoliday(id) {
  const { error } = await supabase.from("company_holidays").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// working days between two dates: skips Sundays and company holidays
export function countLeaveDays(from, to, holidaySet, halfDay = false) {
  if (halfDay) return 0.5;
  let n = 0;
  for (let d = new Date(from + "T00:00:00"); iso(d) <= to; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) continue;
    if (holidaySet.has(iso(d))) continue;
    n++;
  }
  return n;
}

// -------- balance context (same math as payroll) --------
export async function getLeaveContext(staffId) {
  const lyStart = leaveYearStart();
  const [{ data: u }, { data: pay }, { data: reqs }] = await Promise.all([
    supabase.from("app_users").select("id, full_name, annual_paid_leaves, joining_date").eq("id", staffId).single(),   // update471: salary via staff_pay
    supabase.from("staff_payouts").select("pay_month, leaves_used").eq("user_id", staffId).gte("pay_month", lyStart),
    supabase.from("leave_requests").select("*").eq("staff_id", staffId).order("applied_at", { ascending: false }),
  ]);
  if (!u) return null;
  u.monthly_salary = (await staffSalaries([u.id]))[u.id] ?? null;   // update471: own salary, or a pay-authorised viewer
  let annual = Number(u.annual_paid_leaves || 0);
  if (u.joining_date && u.joining_date > lyStart) {
    const jm = Number(String(u.joining_date).slice(5, 7));
    const joinIdx = jm >= 4 ? jm - 3 : jm + 9;
    annual = +(annual * (12 - joinIdx + 1) / 12).toFixed(1);
  }
  const used = (pay || []).reduce((s, r) => s + Number(r.leaves_used || 0), 0);
  const usedH1 = (pay || []).filter(r => { const m = Number(String(r.pay_month).slice(5, 7)); return m >= 4 && m <= 9; })
    .reduce((s, r) => s + Number(r.leaves_used || 0), 0);
  // approved future paid requests reserve balance ahead of payroll
  const today = iso(new Date());
  const reserved = (reqs || []).filter(r => r.status === "approved" && r.from_date >= today && r.leave_type !== "lwp")
    .reduce((s, r) => s + Number(r.days || 0), 0);
  const yearBal = Math.max(0, annual - used - reserved);
  const h1Cap = Math.max(0, annual * 0.5 - usedH1 - (inH1() ? reserved : 0));
  const availableNow = inH1() ? Math.min(yearBal, h1Cap) : yearBal;
  return {
    staff: u, annual, used: +used.toFixed(1), reserved: +reserved.toFixed(1),
    remaining: +yearBal.toFixed(1),
    availableNow: +availableNow.toFixed(1),
    unlockingOct: inH1() ? +Math.max(0, yearBal - availableNow).toFixed(1) : 0,
    // update375: divisor = days in the current month, not a fixed 30
    perDay: +(Number(u.monthly_salary || 0) / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()).toFixed(2),
    requests: reqs || [],
    inH1: inH1(), lyStart,
  };
}

// -------- validation + apply --------
export async function validateLeave(ctx, v, holidaySet) {
  const errs = [], warns = [];
  const today = iso(new Date());
  if (!v.from_date || !v.to_date) errs.push("Select the dates.");
  else {
    if (v.to_date < v.from_date) errs.push("To-date is before from-date.");
    if (v.leave_type === "half_day" && v.from_date !== v.to_date) errs.push("Half day must be a single date.");
    if (v.from_date < today && !["sick", "emergency"].includes(v.leave_type))
      errs.push("Past dates are allowed only for Sick / Emergency leave.");
    if (ctx.staff.joining_date && v.from_date < ctx.staff.joining_date)
      errs.push("Leave starts before your joining date.");
  }
  const days = v.from_date && v.to_date ? countLeaveDays(v.from_date, v.to_date, holidaySet, v.leave_type === "half_day") : 0;
  if (days === 0 && !errs.length) errs.push("Selected dates are only Sundays/holidays — no leave needed.");
  if (days > 10 && v.leave_type !== "lwp") errs.push("Maximum 10 leaves at a stretch (company policy). Split the request or use Leave Without Pay.");
  // overlap with own pending/approved
  const clash = (ctx.requests || []).some(r => ["pending", "approved", "info_needed"].includes(r.status)
    && !(v.to_date < r.from_date || v.from_date > r.to_date));
  if (clash) errs.push("You already have a request covering these dates.");
  // balance & salary impact
  let unpaidDays = 0;
  if (v.leave_type === "lwp") unpaidDays = days;
  else if (days > ctx.availableNow) {
    unpaidDays = +(days - ctx.availableNow).toFixed(1);
    warns.push(`Only ${ctx.availableNow} paid leave${ctx.inH1 ? " (50% first-half cap)" : ""} available — ${unpaidDays} day(s) will be unpaid (₹${(unpaidDays * ctx.perDay).toFixed(0)} salary impact).`);
  }
  return { errs, warns, days, unpaidDays, impact: +(unpaidDays * ctx.perDay).toFixed(2) };
}

export async function getApprovalChain() {
  const { data } = await supabase.from("leave_approval_config").select("*").eq("is_active", true).order("level");
  return data || [];
}
export async function saveApprovalLevel(level, approver_role, approver_staff, is_active) {
  const { error } = await supabase.from("leave_approval_config").upsert(
    { level, approver_role: approver_role || null, approver_staff: approver_staff || null, is_active }, { onConflict: "level" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function notifyLevel(cfgRow, req, staffName) {
  try {
    let ids = [];
    if (cfgRow.approver_staff) ids = [cfgRow.approver_staff];
    else if (cfgRow.approver_role) {
      const { data } = await supabase.from("app_users").select("id").eq("role", cfgRow.approver_role).eq("is_active", true);
      ids = (data || []).map(x => x.id);
    }
    if (ids.length) await notifyUsers({ userIds: ids, kind: "leave", requestId: req.id || null,
      siteId: req.site_id || null, status: "pending",
      title: `Leave request from ${staffName}`,
      body: `${req.from_date} → ${req.to_date} (${req.days} day${req.days === 1 ? "" : "s"})` });
  } catch {}
}
async function notifyStaff(staffId, title, body) {
  try { await notifyDecision({ toUserId: staffId, kind: "leave", title, body }); } catch {}
}

export async function applyLeave(sess, v, days, docFile) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  let doc_url = null;
  if (docFile) {
    const path = `leave/${sess.id}/${Date.now()}_${docFile.name.replace(/[^\w.\-]/g, "_")}`;
    const up = await fileStore.from("attendance-photos").upload(path, docFile, { upsert: true });
    if (!up.error) doc_url = fileStore.from("attendance-photos").getPublicUrl(path).data.publicUrl;
  }
  const chain = await getApprovalChain();
  const firstLevel = chain[0]?.level || 1;
  const { data: r, error } = await supabase.from("leave_requests").insert({
    staff_id: sess.id, leave_type: v.leave_type, from_date: v.from_date, to_date: v.to_date,
    days, reason: v.reason || null, emergency_contact: v.emergency_contact || null,
    doc_url, status: "pending", current_level: firstLevel,
  }).select("*").single();
  if (error) return { ok: false, error: error.message };
  if (chain[0]) await notifyLevel(chain[0], r, sess.name || "staff");
  try { await supabase.from("module_audit_log").insert({ module: "leave", action: "created", ref_id: r.id, staff_id: sess.id }); } catch {}
  return { ok: true, id: r.id };
}

export async function cancelLeave(sess, req) {
  const { error } = await supabase.from("leave_requests").update({
    status: "cancelled", decided_at: new Date().toISOString(), cancel_note: "Cancelled by employee",
  }).eq("id", req.id).eq("staff_id", sess.id);
  try { await supabase.from("module_audit_log").insert({ module: "leave", action: "cancelled", ref_id: req.id, staff_id: sess.id }); } catch {}
  return error ? { ok: false, error: error.message } : { ok: true };
}

// -------- approvals --------
export function canApprove(sess, chain, req) {
  if (!sess || !req) return false;
  if (sess.role === "director") return true;
  // update238: same module gate as lib/perms (adds 'manage'); the chain check below stands
  if (!(canAnySite(sess, "leave", "approve") || canAnySite(sess, "leave", "manage"))) return false;
  const lvl = chain.find(c => c.level === req.current_level);
  if (!lvl) return false;
  return (lvl.approver_staff && Number(lvl.approver_staff) === Number(sess.id))
      || (lvl.approver_role && lvl.approver_role === sess.role);
}

export async function actOnLeave(sess, req, action, note) {
  const chain = await getApprovalChain();
  await supabase.from("leave_approvals").insert({
    request_id: req.id, level: req.current_level, approver_id: sess.id, action, note: note || null,
    device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : null,
  });
  let patch;
  if (action === "rejected") patch = { status: "rejected", decided_at: new Date().toISOString() };
  else if (action === "info_requested") patch = { status: "info_needed" };
  else {
    const idx = chain.findIndex(c => c.level === req.current_level);
    const next = chain[idx + 1];
    patch = next ? { current_level: next.level } : { status: "approved", decided_at: new Date().toISOString() };
    if (next) { await notifyLevel(next, req, req.staff_name || "staff"); }
  }
  const { error } = await supabase.from("leave_requests").update(patch).eq("id", req.id);
  if (error) return { ok: false, error: error.message };
  if (patch.status === "approved") await notifyStaff(req.staff_id, "Leave approved ✅", `${req.from_date} → ${req.to_date}`);
  if (patch.status === "rejected") await notifyStaff(req.staff_id, "Leave rejected ❌", note || `${req.from_date} → ${req.to_date}`);
  if (patch.status === "info_needed") await notifyStaff(req.staff_id, "Leave — more information needed", note || "Please contact your approver.");
  try { await supabase.from("module_audit_log").insert({ module: "leave", action, ref_id: req.id, staff_id: sess.id }); } catch {}
  return { ok: true };
}

export async function getApprovalQueue() {
  const { data } = await supabase.from("leave_requests")
    .select("*, app_users(full_name, role)").eq("status", "pending").order("applied_at");
  return (data || []).map(r => ({ ...r, staff_name: r.app_users?.full_name }));
}

// -------- calendar + reports --------
export async function getMonthCalendar(yy, mm) {   // mm 1..12
  const first = `${yy}-${String(mm).padStart(2, "0")}-01`;
  const last = iso(new Date(yy, mm, 0));
  const [{ data: reqs }, { data: hols }, { data: staff }] = await Promise.all([
    supabase.from("leave_requests").select("*, app_users(full_name)")
      .in("status", ["approved", "pending"]).lte("from_date", last).gte("to_date", first),
    supabase.from("company_holidays").select("*").gte("on_date", first).lte("on_date", last),
    supabase.from("app_users").select("full_name, dob").eq("is_active", true).not("dob", "is", null),
  ]);
  const bdays = (staff || []).filter(s => Number(String(s.dob).slice(5, 7)) === mm)
    .map(s => ({ day: Number(String(s.dob).slice(8, 10)), name: s.full_name }));
  return { reqs: reqs || [], hols: hols || [], bdays };
}

export async function getLeaveRegister(fromDate, toDate) {
  const { data } = await supabase.from("leave_requests")
    .select("*, app_users(full_name, role)")
    .gte("from_date", fromDate).lte("from_date", toDate).order("from_date");
  return (data || []).map(r => ({ ...r, staff_name: r.app_users?.full_name, staff_role: r.app_users?.role }));
}

export function exportCSV(rows, cols, filename) {
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.map(c => esc(c[1])).join(",")]
    .concat(rows.map(r => cols.map(c => esc(typeof c[0] === "function" ? c[0](r) : r[c[0]])).join(","))).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
