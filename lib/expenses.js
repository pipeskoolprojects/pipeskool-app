"use client";
import { supabase, isDemo } from "./supabase";

export const CATEGORIES = [
  ["local_material", "Local material purchase"],
  ["transport", "Transport / tempo"],
  ["labour_advance", "Labour advance"],
  ["tea_food", "Tea / food"],
  ["consumables", "Consumables"],
  ["repairs", "Repairs"],
  ["loading_unloading", "Loading / unloading"],
  ["misc", "Miscellaneous"],
];
export const catLabel = k => (CATEGORIES.find(c => c[0] === k) || ["", k])[1];

// ---------- demo data ----------
let demoExpenses = [
  { id: 1, date: "2026-06-12", site: "KEI Sanand", holder: "S. Desai", category: "local_material", amount: 2350, paid_to: "Shree Hardware", mode: "upi", photo: true, status: "pending", worker: null },
  { id: 2, date: "2026-06-12", site: "KEI Sanand", holder: "S. Desai", category: "labour_advance", amount: 3000, paid_to: "Ramesh Yadav", mode: "cash", photo: false, status: "pending", worker: "Ramesh Yadav" },
  { id: 3, date: "2026-06-12", site: "SOUL Campus", holder: "M. Joshi", category: "transport", amount: 1800, paid_to: "Bharat Tempo", mode: "cash", photo: true, status: "pending", worker: null },
  { id: 4, date: "2026-06-12", site: "SOUL Campus", holder: "M. Joshi", category: "transport", amount: 1800, paid_to: "Bharat Tempo", mode: "cash", photo: true, status: "pending", worker: null },
  { id: 5, date: "2026-06-11", site: "The Creek", holder: "R. Mehta", category: "repairs", amount: 14500, paid_to: "Patel Machinery Works", mode: "upi", photo: true, status: "pending", worker: null },
  { id: 6, date: "2026-06-11", site: "KEI Sanand", holder: "S. Desai", category: "tea_food", amount: 420, paid_to: "Site canteen", mode: "cash", photo: false, status: "approved", worker: null },
  { id: 7, date: "2026-06-10", site: "SOUL Campus", holder: "M. Joshi", category: "consumables", amount: 1250, paid_to: "Gujarat Traders", mode: "upi", photo: true, status: "approved", worker: null },
];

let demoSalaryAdv = [
  { id: 1, date: "2026-06-11", name: "S. Desai", site: "KEI Sanand", amount: 10000, reason: "House rent deposit", status: "pending", outstanding: 5000 },
  { id: 2, date: "2026-06-09", name: "R. Mehta", site: "The Creek", amount: 5000, reason: "Medical", status: "approved", outstanding: 5000 },
];

const demoRecon = [
  { holder: "S. Desai", site: "KEI Sanand", transferred: 50000, approved: 31230, pending: 5350, inHand: 18770 },
  { holder: "M. Joshi", site: "SOUL Campus", transferred: 40000, approved: 28400, pending: 3600, inHand: 11600 },
  { holder: "R. Mehta", site: "The Creek", transferred: 30000, approved: 12800, pending: 14500, inHand: 17200 },
];

const demoCatSummary = [
  { category: "local_material", amount: 26800 }, { category: "transport", amount: 14200 },
  { category: "labour_advance", amount: 18500 }, { category: "consumables", amount: 6900 },
  { category: "repairs", amount: 14500 }, { category: "tea_food", amount: 3850 },
  { category: "loading_unloading", amount: 4100 }, { category: "misc", amount: 1450 },
];

// ---------- flags (duplicates, missing photo, unusual amount) ----------
export function computeFlags(rows) {
  const seen = {};
  const flagged = rows.map(r => ({ ...r, flags: [] }));
  flagged.forEach(r => {
    const key = [r.date, r.amount, (r.paid_to || "").toLowerCase().trim()].join("|");
    seen[key] = (seen[key] || 0) + 1;
  });
  flagged.forEach(r => {
    const key = [r.date, r.amount, (r.paid_to || "").toLowerCase().trim()].join("|");
    if (seen[key] > 1) r.flags.push("Possible duplicate");
    if (!r.photo) r.flags.push("No bill photo");
    if (r.amount >= 10000) r.flags.push("Unusual amount");
  });
  return flagged;
}

// ---------- mobile: my balances ----------
export async function getMyBalances(userId) {
  if (isDemo) return { imprestInHand: 18770, pendingEntries: 5350, salaryAdvOutstanding: 5000 };
  const { data: rec } = await supabase.from("v_imprest_reconciliation")
    .select("in_hand, pending_spend").eq("holder_user_id", userId);
  const { data: adv } = await supabase.from("salary_advances")
    .select("amount").eq("user_id", userId).eq("status", "approved").eq("settled", false);
  return {
    imprestInHand: (rec || []).reduce((s, r) => s + Number(r.in_hand || 0), 0),
    pendingEntries: (rec || []).reduce((s, r) => s + Number(r.pending_spend || 0), 0),
    salaryAdvOutstanding: (adv || []).reduce((s, r) => s + Number(r.amount), 0),
  };
}

export async function getMyRecent(userId) {
  if (isDemo) return demoExpenses.filter(e => e.holder === "S. Desai").slice(0, 5);
  const { data } = await supabase.from("expenses")
    .select("id, expense_date, category, amount, paid_to, status, query_note")
    .eq("holder_user_id", userId).order("created_at", { ascending: false }).limit(8);
  return (data || []).map(e => ({
    id: e.id, date: e.expense_date, category: e.category,
    amount: Number(e.amount), paid_to: e.paid_to, status: e.status, query: e.query_note,
  }));
}

export async function submitExpense(payload) {
  if (isDemo) {
    demoExpenses = [{ id: Date.now(), date: payload.expense_date, site: "KEI Sanand",
      holder: "S. Desai", category: payload.category, amount: payload.amount,
      paid_to: payload.paid_to, mode: payload.pay_mode, photo: !!payload.photoFile,
      status: "pending", worker: payload.worker_name || null }, ...demoExpenses];
    return { ok: true };
  }
  let photoUrl = null;
  if (payload.photoFile) {
    const path = `bills/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
    const { error: upErr } = await supabase.storage.from("attendance-photos").upload(path, payload.photoFile);
    if (!upErr) photoUrl = path;
  }
  const { error } = await supabase.from("expenses").insert({
    site_id: payload.site_id, holder_user_id: payload.holder_user_id,
    expense_date: payload.expense_date, category: payload.category,
    amount: payload.amount, paid_to: payload.paid_to, pay_mode: payload.pay_mode,
    bill_photo_url: photoUrl, note: payload.note, worker_id: payload.worker_id || null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function submitSalaryAdvance(payload) {
  if (isDemo) {
    demoSalaryAdv = [{ id: Date.now(), date: new Date().toISOString().slice(0, 10),
      name: "S. Desai", site: "KEI Sanand", amount: payload.amount,
      reason: payload.reason, status: "pending", outstanding: 5000 }, ...demoSalaryAdv];
    return { ok: true };
  }
  const { error } = await supabase.from("salary_advances").insert({
    user_id: payload.user_id, site_id: payload.site_id,
    amount: payload.amount, reason: payload.reason,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- web: approval queue / recon / summary ----------
export async function getApprovalQueue() {
  if (isDemo) return computeFlags(demoExpenses.filter(e => e.status === "pending"));
  const { data } = await supabase.from("expenses")
    .select("id, expense_date, category, amount, paid_to, pay_mode, bill_photo_url, status, sites(name), app_users!expenses_holder_user_id_fkey(full_name), workers(full_name)")
    .eq("status", "pending").order("created_at");
  return computeFlags((data || []).map(e => ({
    id: e.id, date: e.expense_date, site: e.sites?.name, holder: e.app_users?.full_name,
    category: e.category, amount: Number(e.amount), paid_to: e.paid_to,
    mode: e.pay_mode, photo: !!e.bill_photo_url, status: e.status,
    worker: e.workers?.full_name || null,
  })));
}

export async function reviewExpense(id, status, queryNote) {
  if (isDemo) {
    demoExpenses = demoExpenses.map(e => e.id === id ? { ...e, status, query: queryNote } : e);
    return { ok: true };
  }
  const { error } = await supabase.from("expenses")
    .update({ status, query_note: queryNote || null, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getSalaryAdvQueue() {
  if (isDemo) return demoSalaryAdv;
  const { data } = await supabase.from("salary_advances")
    .select("id, request_date, amount, reason, status, app_users!salary_advances_user_id_fkey(full_name), sites(name)")
    .order("created_at", { ascending: false }).limit(20);
  return (data || []).map(a => ({
    id: a.id, date: a.request_date, name: a.app_users?.full_name,
    site: a.sites?.name, amount: Number(a.amount), reason: a.reason, status: a.status,
  }));
}

export async function reviewSalaryAdvance(id, status) {
  if (isDemo) {
    demoSalaryAdv = demoSalaryAdv.map(a => a.id === id ? { ...a, status } : a);
    return { ok: true };
  }
  const { error } = await supabase.from("salary_advances")
    .update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getReconciliation() {
  if (isDemo) return demoRecon;
  const { data } = await supabase.from("v_imprest_reconciliation").select("*");
  return (data || []).map(r => ({
    holder: r.holder, site: r.site, transferred: Number(r.transferred),
    approved: Number(r.approved_spend), pending: Number(r.pending_spend), inHand: Number(r.in_hand),
  }));
}

export async function getCategorySummary(monthStr) {
  if (isDemo) return demoCatSummary;
  const from = monthStr + "-01";
  const to = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 0)
    .toISOString().slice(0, 10);
  const { data } = await supabase.from("expenses")
    .select("category, amount").eq("status", "approved")
    .gte("expense_date", from).lte("expense_date", to);
  const sum = {};
  (data || []).forEach(e => { sum[e.category] = (sum[e.category] || 0) + Number(e.amount); });
  return Object.entries(sum).map(([category, amount]) => ({ category, amount }));
}

export async function recordTransfer(payload) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("imprest_transfers").insert(payload);
  return error ? { ok: false, error: error.message } : { ok: true };
}
