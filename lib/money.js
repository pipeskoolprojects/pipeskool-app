"use client";
import { supabase, isDemo } from "./supabase";
import { todayLocal } from "./today";

export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

export const EXPENSE_CATEGORIES = [
  ["local_material", "Local material purchase"],
  ["transport", "Transport / tempo"],
  ["tea_food", "Tea / food"],
  ["consumables", "Consumables"],
  ["repairs", "Repairs"],
  ["loading_unloading", "Loading / unloading"],
  ["misc", "Miscellaneous"],
];
export const catLabel = k => (EXPENSE_CATEGORIES.find(c => c[0] === k) || ["", k])[1];

// ---------------- DEMO STATE ----------------
let demoAdvReqs = [];
let demoExpenses = [];
const demoBalances = { petty: 0 };

// people the supervisor can raise advance for (own site workers + self/staff)
const demoBeneficiaries = [
  { kind: "staff", id: 1, name: "SATYENDRA (me)", bank: false },
];

// ---------------- BENEFICIARIES (for advance salary dropdown) ----------------
export async function getBeneficiaries(userId, siteIds) {
  if (isDemo) {
    // include any demo workers added
    return demoBeneficiaries;
  }
  // staff self + workers at the sites this user handles
  const out = [];
  const { data: me } = await supabase.from("app_users")
    .select("id, full_name, bank_complete").eq("id", userId).maybeSingle();
  if (me) out.push({ kind: "staff", id: me.id, name: me.full_name + " (me)", bank: !!me.bank_complete });
  let wq = supabase.from("workers")
    .select("id, full_name, profile_complete, site_id").eq("is_active", true);
  if (siteIds && siteIds.length) wq = wq.in("site_id", siteIds);
  const { data: workers } = await wq;
  (workers || []).forEach(w => out.push({ kind: "labour", id: w.id, name: w.full_name, bank: !!w.profile_complete }));
  return out;
}

// ---------------- ADVANCE SALARY ----------------
export async function raiseAdvanceSalary(p) {
  if (isDemo) {
    demoAdvReqs = [{ id: Date.now(), req_no: "ADV/" + (demoAdvReqs.length + 1),
      beneficiary_name: p.beneficiary_name, beneficiary_kind: p.beneficiary_kind,
      amount: p.amount, reason: p.reason, bank_on_file: p.bank_on_file,
      status: "pending", date: todayLocal() }, ...demoAdvReqs];
    return { ok: true };
  }
  const payload = {
    req_no: "ADV/" + new Date().getFullYear().toString().slice(2) + "/" + Date.now().toString().slice(-4),
    site_id: p.site_id, amount: p.amount, reason: p.reason,
    beneficiary_name: p.beneficiary_name, beneficiary_kind: p.beneficiary_kind,
    bank_on_file: p.bank_on_file, raised_by: p.raised_by,
  };
  if (p.beneficiary_kind === "labour") payload.beneficiary_worker_id = p.beneficiary_id;
  else payload.beneficiary_user_id = p.beneficiary_id;
  const { error } = await supabase.from("advance_salary_requests").insert(payload);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getAdvanceQueue() {
  if (isDemo) return demoAdvReqs;
  const { data } = await supabase.from("advance_salary_requests")
    .select("id, req_no, beneficiary_name, beneficiary_kind, amount, reason, bank_on_file, status, request_date:created_at, sites(name)")
    .order("created_at", { ascending: false }).limit(50);
  return (data || []).map(r => ({ id: r.id, req_no: r.req_no, beneficiary_name: r.beneficiary_name,
    beneficiary_kind: r.beneficiary_kind, amount: Number(r.amount), reason: r.reason,
    bank_on_file: r.bank_on_file, status: r.status, site: r.sites?.name,
    date: r.request_date ? r.request_date.slice(0,10) : "" }));
}

export async function reviewAdvance(id, status, note) {
  if (isDemo) { demoAdvReqs = demoAdvReqs.map(r => r.id === id ? { ...r, status } : r); return { ok: true }; }
  const { error } = await supabase.from("advance_salary_requests")
    .update({ status, query_note: note || null, reviewed_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------------- SITE EXPENSE CLAIM ----------------
export async function claimExpense(p) {
  if (isDemo) {
    demoExpenses = [{ id: Date.now(), date: todayLocal(), category: p.category, amount: p.amount,
      paid_to: p.paid_to, funding_source: p.funding_source, photo: !!p.photoFile, status: "pending" }, ...demoExpenses];
    return { ok: true };
  }
  let photoUrl = null;
  if (p.photoFile) {
    const path = `bills/${Date.now()}_${Math.random().toString(36).slice(2,6)}.jpg`;
    const { error: upErr } = await supabase.storage.from("attendance-photos").upload(path, p.photoFile);
    if (!upErr) photoUrl = path;
  }
  const { error } = await supabase.from("expenses").insert({
    site_id: p.site_id, holder_user_id: p.user_id, claimant_user_id: p.user_id,
    expense_date: todayLocal(), category: p.category, amount: p.amount, paid_to: p.paid_to,
    pay_mode: "cash", funding_source: p.funding_source, bill_photo_url: photoUrl,
    bank_on_file: p.bank_on_file, note: p.note,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getMyRecentMoney(userId) {
  if (isDemo) return [...demoAdvReqs.map(r => ({ type: "Advance", name: r.beneficiary_name, amount: r.amount, status: r.status, date: r.date })),
                      ...demoExpenses.map(e => ({ type: "Expense", name: e.paid_to, amount: e.amount, status: e.status, date: e.date }))].slice(0, 8);
  const { data: adv } = await supabase.from("advance_salary_requests")
    .select("beneficiary_name, amount, status, created_at").eq("raised_by", userId).order("created_at", {ascending:false}).limit(5);
  const { data: exp } = await supabase.from("expenses")
    .select("paid_to, amount, status, expense_date").eq("claimant_user_id", userId).order("created_at", {ascending:false}).limit(5);
  return [...(adv||[]).map(r => ({ type: "Advance", name: r.beneficiary_name, amount: Number(r.amount), status: r.status, date: r.created_at?.slice(0,10) })),
          ...(exp||[]).map(e => ({ type: "Expense", name: e.paid_to, amount: Number(e.amount), status: e.status, date: e.expense_date }))];
}

// ---------------- PETTY CASH BALANCE ----------------
export async function getPettyBalance(userId) {
  if (isDemo) return demoBalances.petty;
  const { data } = await supabase.from("v_petty_cash_balance").select("balance").eq("user_id", userId);
  return (data || []).reduce((s, r) => s + Number(r.balance || 0), 0);
}

// ---------------- WEB: expense claim queue + reconciliation ----------------
export async function getExpenseClaimQueue() {
  if (isDemo) return demoExpenses.filter(e => e.status === "pending");
  const { data } = await supabase.from("expenses")
    .select("id, expense_date, category, amount, paid_to, funding_source, bill_photo_url, bank_on_file, status, sites(name), app_users:claimant_user_id(full_name)")
    .eq("status", "pending").order("created_at");
  return (data || []).map(e => ({ id: e.id, date: e.expense_date, category: e.category,
    amount: Number(e.amount), paid_to: e.paid_to, funding_source: e.funding_source,
    photo: !!e.bill_photo_url, bank_on_file: e.bank_on_file, status: e.status,
    site: e.sites?.name, claimant: e.app_users?.full_name }));
}

export async function reviewExpenseClaim(id, status, note) {
  if (isDemo) { demoExpenses = demoExpenses.map(e => e.id === id ? { ...e, status } : e); return { ok: true }; }
  const { error } = await supabase.from("expenses")
    .update({ status, query_note: note || null, reviewed_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getPettyReconciliation() {
  if (isDemo) return [];
  const { data } = await supabase.from("v_petty_cash_balance").select("*");
  return (data || []).map(r => ({ holder: r.full_name, site: r.site_name,
    granted: Number(r.granted), spent: Number(r.spent_from_petty), balance: Number(r.balance) }));
}
