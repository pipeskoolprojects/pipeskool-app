"use client";
// update445: own-pocket reimbursement ledger — reads approved own-pocket expenses, records what the company paid back
import { supabase, isDemo } from "./supabase";
const clean = e => /own_pocket|v_own_pocket|schema cache/i.test(String(e?.message || "")) ? "Run pipeskool_own_pocket_ledger.sql (update 445) first." : (e?.message || "Failed.");
export async function getOwnPocketLedger() {
  if (isDemo) return { rows: [] };
  const { data, error } = await supabase.from("v_own_pocket_ledger").select("*").order("balance", { ascending: false });
  if (error) return { rows: [], error: clean(error) };
  return { rows: (data || []).map(r => ({ ...r, approved_total: Number(r.approved_total), paid_total: Number(r.paid_total), balance: Number(r.balance), pending_total: Number(r.pending_total),
    last_paid_amount: r.last_paid_amount != null ? Number(r.last_paid_amount) : null,
    oldest_days: r.oldest_unpaid ? Math.max(0, Math.round((Date.now() - new Date(r.oldest_unpaid).getTime()) / 86400000)) : null })) };
}
// statement: expenses (+) and payments (−) merged by date, running balance; each expense tagged with how much of it is still unpaid (oldest-first)
export async function getOwnPocketStatement(userId) {
  const [{ data: ex, error: e1 }, { data: pay, error: e2 }, { data: pend }] = await Promise.all([
    supabase.from("v_own_pocket_lines").select("*").eq("user_id", userId).order("expense_date").order("expense_id"),
    supabase.from("own_pocket_reimbursements").select("*").eq("user_id", userId).order("paid_on").order("id"),
    supabase.from("expenses").select("id, expense_date, amount, category, paid_to, note, status, sites(name)").eq("claimant_user_id", userId).eq("funding_source", "own_pocket").in("status", ["pending", "queried"]).order("expense_date"),
  ]);
  if (e1 || e2) return { lines: [], error: clean(e1 || e2) };
  const paidTotal = (pay || []).filter(p => !p.voided_at).reduce((t, p) => t + Number(p.amount), 0);
  let cover = paidTotal; const unpaid = [];
  (ex || []).forEach(e => { const a = Number(e.amount); if (a <= 0) { cover -= a; return; } const used = Math.min(a, Math.max(0, cover)); cover -= used; if (a - used > 0.004) unpaid.push({ expense_id: e.expense_id, date: e.expense_date, label: `${e.category || "Expense"}${e.paid_to ? " · " + e.paid_to : ""}`, amount: a, unpaid: Math.round((a - used) * 100) / 100 }); });
  const rows = [
    ...(ex || []).map(e => ({ kind: "exp", date: e.expense_date, sort: 0, id: e.expense_id, text: `${e.category || "Expense"}${e.paid_to ? " · " + e.paid_to : ""}${e.note ? " — " + e.note : ""}`, site: e.site_name, plus: Number(e.amount), status: e.status, reversal: !!e.reversal_of })),
    ...(pay || []).map(p => ({ kind: "pay", date: p.paid_on, sort: 1, id: p.id, text: `Reimbursed · ${String(p.mode).toUpperCase()}${p.reference ? " · ref " + p.reference : ""}${p.paid_by_name ? " · by " + p.paid_by_name : ""}${p.note ? " — " + p.note : ""}`, minus: p.voided_at ? 0 : Number(p.amount), voided: !!p.voided_at, void_reason: p.void_reason, raw: p })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.sort - b.sort || a.id - b.id);
  let bal = 0; rows.forEach(r => { bal += (r.plus || 0) - (r.minus || 0); r.balance = Math.round(bal * 100) / 100; });
  return { lines: rows, unpaid, pending: (pend || []).map(p => ({ date: p.expense_date, text: `${p.category || "Expense"}${p.paid_to ? " · " + p.paid_to : ""}`, amount: Number(p.amount), site: p.sites?.name || "", status: p.status })) };
}
export async function payOwnPocket(userId, amount, paidOn, mode, reference, note, expenseIds) {
  const { data, error } = await supabase.rpc("fn_own_pocket_pay", { p_user_id: Number(userId), p_amount: Number(amount), p_paid_on: paidOn || null, p_mode: mode, p_reference: reference || null, p_note: note || null, p_expense_ids: (expenseIds || []).map(Number) });
  if (error) return { ok: false, error: clean(error) }; return data?.ok ? { ok: true, ...data } : { ok: false, error: data?.error || "Could not record." };
}
export async function voidOwnPocketPayment(id, reason) {
  const { data, error } = await supabase.rpc("fn_own_pocket_void", { p_id: Number(id), p_reason: reason });
  if (error) return { ok: false, error: clean(error) }; return data?.ok ? { ok: true } : { ok: false, error: data?.error };
}
