"use client";
// update355: DIRECT VENDOR PAYMENT / LOCAL PURCHASE VOUCHER.
//
// A voucher IS an expense row — funding_source 'company_direct', a vendor_id, an optional
// set of line items, and a voucher number. Writing it into `expenses` is what makes it
// appear in site cost totals, the Tally export, the Excel export, the approvals queue and
// the bill viewer without any of those being touched. A separate table would have meant
// six more places to keep in step.
//
// 'company_direct' is deliberately NOT 'petty_cash' (which would move a petty cash balance
// that never moved) and NOT 'own_pocket' (which would owe the supervisor a reimbursement
// they never funded). The company paid the vendor; nobody is out of pocket.
import { supabase, isDemo, fetchAll } from "./supabase";
import { todayLocal } from "./today";
import { notifyDecision } from "./notify";   // update458: query / reply notifications
import { fileStore } from "./files";   // update460: files live in Cloudflare R2 (private)

export const PAY_MODES = [
  ["cash", "Cash"], ["bank", "Bank transfer"], ["cheque", "Cheque"], ["upi", "UPI"],
];
export const PAY_STATUS = [["paid", "Paid"], ["pending", "Payment pending"]];

function cleanErr(e) {
  const m = String(e?.message || e || "Something went wrong");
  // the one thing update 354's SQL could not do for me — say so plainly rather than
  // failing with a raw enum message the site staff cannot act on.
  if (/invalid input value for enum/i.test(m) && /company_direct/i.test(m))
    return "The database does not yet accept 'company_direct' as a funding source. Run STEP 1 of pipeskool_vendor_voucher.sql (update 354) — it is a single ALTER TYPE line.";
  if (/invalid input value for enum/i.test(m) && /(bank|cheque|upi)/i.test(m))
    return "The database does not yet accept that payment mode. Run STEP 1 of pipeskool_vendor_voucher.sql (update 354).";
  if (/vendor_id|payment_status|voucher_no|expense_items|fn_next_voucher_no|schema cache/i.test(m))
    return "Run pipeskool_vendor_voucher.sql (update 354) in Supabase first.";
  return m;
}

// ---------------------------------------------------------------------
export async function createVendorVoucher(p, files, actorId) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  // update356: typed by hand. A shop down the road is not in the Vendor Master, and making
  // someone create a master record for a one-off purchase is how that master fills with junk.
  if (!String(p.vendor_name || "").trim()) return { ok: false, error: "Enter the vendor / shop name." };
  if (!p.site_id) return { ok: false, error: "Pick the site." };

  const lines = (p.items || []).filter(l => String(l.item_name || "").trim());
  const lineTotal = +lines.reduce((n, l) => n + (Number(l.amount) || 0), 0).toFixed(2);
  const amount = lines.length ? lineTotal : +(Number(p.amount) || 0).toFixed(2);
  if (!(amount > 0)) return { ok: false, error: "Enter an amount, or at least one item with a value." };
  if (lines.length && Math.abs(amount - lineTotal) > 0.5)
    return { ok: false, error: "The total does not match the item lines." };
  // update389: the bill IS the description now — mandatory; the note defaults to the vendor name
  if (!Array.from(files || []).length) return { ok: false, error: "Attach the bill / receipt (photo or PDF)." };
  const note = String(p.note || "").trim() || `Direct vendor payment — ${String(p.vendor_name).trim()}`;   // update447: was "Local purchase — …", which read like an expense claim

  const date = p.expense_date || todayLocal();

  // number first — if this fails, nothing has been written yet
  const { data: vno, error: nErr } = await supabase.rpc("fn_next_voucher_no", { p_date: date });
  if (nErr) return { ok: false, error: cleanErr(nErr) };

  const { data: ins, error } = await supabase.from("expenses").insert({
    site_id: p.site_id,
    vendor_id: p.vendor_id ? Number(p.vendor_id) : null,   // optional — only if it IS a registered vendor
    is_vendor_direct: true,                                 // update356: what the list and exports filter on
    holder_user_id: actorId,
    claimant_user_id: Number(p.raised_by || actorId),        // may be another supervisor, if permitted
    vendor_address: String(p.vendor_address || "").trim() || null,
    remarks: String(p.remarks || "").trim() || null,
    expense_date: date, category: p.category || "local_material",
    amount, paid_to: String(p.vendor_name).trim(),   // the payee field every expense already has
    pay_mode: p.pay_mode || "cash",
    funding_source: "company_direct",
    payment_status: p.payment_status || "pending",
    paid_on: p.payment_status === "paid" ? (p.paid_on || date) : null,
    payment_ref: String(p.payment_ref || "").trim() || null,
    voucher_no: vno, note,
  }).select("id, voucher_no").single();
  if (error) return { ok: false, error: cleanErr(error) };

  if (lines.length) {
    const rows = lines.map((l, i) => ({
      expense_id: ins.id, item_name: String(l.item_name).trim(),
      qty: l.qty === "" ? null : Number(l.qty), unit: l.unit || null,
      rate: l.rate === "" ? null : Number(l.rate), amount: Number(l.amount) || 0, sort_order: i,
    }));
    const { error: iErr } = await supabase.from("expense_items").insert(rows);
    if (iErr) return { ok: true, id: ins.id, voucher_no: ins.voucher_no,
      warn: "Voucher saved, but the item lines failed: " + cleanErr(iErr) };
  }

  const up = await uploadBills(ins.id, files);
  if (!up.ok) return { ok: true, id: ins.id, voucher_no: ins.voucher_no, warn: "Voucher saved, but the bill upload failed: " + up.error };

  return { ok: true, id: ins.id, voucher_no: ins.voucher_no };
}

// same bucket and shape the expense claim already uses, so the bill viewer just works
export async function uploadBills(expenseId, files) {
  const list = Array.from(files || []);
  if (!list.length) return { ok: true, added: 0 };
  const paths = [], names = [];
  for (const f of list) {
    const ext = (f.name && f.name.includes(".") ? f.name.split(".").pop() : (f.type === "application/pdf" ? "pdf" : "jpg")).toLowerCase();
    const path = `bills/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const { error } = await fileStore.from("attendance-photos").upload(path, f, { contentType: f.type || undefined });
    if (error) return { ok: false, error: error.message };
    paths.push(path); names.push(String(f.name || "").slice(0, 200) || null);
  }
  // update485: keep the original file name for the printed voucher ("Attached bills: … – bill1.jpg, bill2.pdf")
  let { error } = await supabase.from("expense_bills").insert(paths.map((x, i) => ({ expense_id: expenseId, path: x, file_name: names[i] })));
  if (error && /file_name/i.test(error.message || "")) ({ error } = await supabase.from("expense_bills").insert(paths.map(x => ({ expense_id: expenseId, path: x }))));   // column not added yet
  if (error) return { ok: false, error: error.message };
  return { ok: true, added: paths.length };
}

// ---------------------------------------------------------------------
export async function listVendorVouchers({ siteId, from, to } = {}) {
  if (isDemo) return [];
  const build = () => {   // update447: a fresh query per page — fetchAll reads every voucher (the server caps one read at 1,000)
    let q = supabase.from("expenses")
      .select("id, voucher_no, expense_date, amount, category, note, remarks, paid_to, vendor_address, pay_mode, payment_status, paid_on, payment_ref, status, query_note, response_note, resubmitted_at, claimant_user_id, reviewed_by, reviewed_at, posted_to_tally, site_id, sites(name), claimant:claimant_user_id(full_name), reviewer:reviewed_by(full_name), expense_bills(path)")   // update447: posted_to_tally
      .eq("is_vendor_direct", true)   // update356
      .order("expense_date", { ascending: false }).order("id", { ascending: false });
    if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
    if (from) q = q.gte("expense_date", from);
    if (to) q = q.lte("expense_date", to);
    return q;
  };
  const { data, error } = await fetchAll(build);
  if (error) throw new Error(cleanErr(error));
  return (data || []).map(r => ({
    ...r, posted: !!r.posted_to_tally, vendor: r.paid_to || "—", site: r.sites?.name || "—",
    raisedBy: r.claimant?.full_name || "—", reviewedBy: r.reviewer?.full_name || "",
    bills: (r.expense_bills || []).map(b => b.path),
  }));
}

export async function getVendorVoucher(id) {
  if (isDemo) return null;
  const [{ data: e, error }, { data: items }] = await Promise.all([
    supabase.from("expenses")
      .select("id, voucher_no, expense_date, amount, category, note, remarks, paid_to, vendor_address, pay_mode, payment_status, paid_on, payment_ref, status, reviewed_at, site_id, sites(name), claimant:claimant_user_id(full_name), reviewer:reviewed_by(full_name)")
      .eq("id", id).maybeSingle(),
    supabase.from("expense_items").select("item_name, qty, unit, rate, amount").eq("expense_id", id).order("sort_order"),
  ]);
  if (error) throw new Error(cleanErr(error));
  if (!e) return null;
  // update485: the file names too (column added by pipeskool_dvp_bill_names.sql; works without it)
  let { data: bills, error: bErr } = await supabase.from("expense_bills").select("id, path, file_name").eq("expense_id", id).order("id");
  if (bErr) ({ data: bills } = await supabase.from("expense_bills").select("id, path").eq("expense_id", id).order("id"));
  return { ...e, vendor: e.paid_to || "—", site: e.sites?.name || "—",
           raisedBy: e.claimant?.full_name || "—", reviewedBy: e.reviewer?.full_name || "",
           items: items || [], bills: (bills || []).map(b => b.path), billFiles: (bills || []).map(b => ({ id: b.id, path: b.path, name: b.file_name || null })) };
}

// ---------------------------------------------------------------- update458: Query · Reply · Edit · Resubmit · timeline
const need458 = e => /fn_dvp_|expense_events|schema cache|Could not find/i.test(e || "") ? "Run pipeskool_dvp_query_edit.sql (update 458) in Supabase first." : cleanErr(e);
const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: need458(error.message) };
  return data?.ok ? data : { ok: false, error: data?.error || "No response." };
};
// who may edit this voucher right now (mirrors fn_dvp_can_edit — the database is the real gate)
export function canEditVoucher(sess, r) {
  if (!sess || !r) return false;
  if (!["pending", "queried"].includes(r.status) || r.payment_status === "paid") return false;
  return Number(r.claimant_user_id) === Number(sess.id) || ["director", "ho_admin", "it_executive"].includes(sess.role);
}
export async function queryVoucher(id, note) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const r = await rpc("fn_dvp_query", { p_id: Number(id), p_note: note });
  if (r.ok && r.claimant) notifyDecision({ toUserId: r.claimant, kind: "expense", requestId: Number(id), siteId: r.site_id, status: "queried",
    title: `Query on voucher ${r.voucher_no || "#" + id}`, body: String(note).slice(0, 180) });
  return r;
}
export async function replyVoucher(id, note) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const r = await rpc("fn_dvp_reply", { p_id: Number(id), p_note: note || null });
  if (r.ok && r.reviewer) notifyDecision({ toUserId: r.reviewer, kind: "expense", requestId: Number(id), siteId: r.site_id, status: "pending",
    title: `Reply on voucher ${r.voucher_no || "#" + id} — resubmitted`, body: String(note || "Resubmitted for approval").slice(0, 180) });
  return r;
}
// patch = { expense_date, paid_to, site_id, note, amount, pay_mode, remarks, vendor_address, reply } · resubmit = true when answering a query
export async function editVoucher(id, patch, resubmit) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const r = await rpc("fn_dvp_edit", { p_id: Number(id), p_patch: patch, p_resubmit: !!resubmit });
  if (r.ok && r.resubmitted && r.reviewer) notifyDecision({ toUserId: r.reviewer, kind: "expense", requestId: Number(id), siteId: r.site_id, status: "pending",
    title: `Voucher ${r.voucher_no || "#" + id} edited & resubmitted`, body: String(patch.reply || "Please review again").slice(0, 180) });
  return r;
}
export async function removeVoucherBill(id, path) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  return rpc("fn_dvp_remove_bill", { p_id: Number(id), p_path: path });
}
export async function addVoucherBills(id, files) {   // same upload as the form; the timeline gets a "bill_added" line
  const up = await uploadBills(id, files);
  if (up.ok && up.added) { try { await supabase.rpc("fn_dvp_log_bill_added", { p_id: Number(id), p_count: up.added }); } catch {} }
  return up;
}
export async function getVoucherEvents(id) {
  if (isDemo) return [];
  const { data } = await supabase.from("expense_events").select("id, event, note, changes, by_name, at").eq("expense_id", Number(id)).order("at");
  return data || [];
}

// Payment is separate from approval on purpose: an approved voucher may still be unpaid.
export async function setVoucherPayment(id, { payment_status, paid_on, payment_ref, pay_mode }) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const patch = {};
  if (payment_status) patch.payment_status = payment_status;
  if (pay_mode) patch.pay_mode = pay_mode;
  if (payment_ref !== undefined) patch.payment_ref = String(payment_ref || "").trim() || null;
  patch.paid_on = payment_status === "paid" ? (paid_on || todayLocal()) : null;
  const { error } = await supabase.from("expenses").update(patch).eq("id", id);
  if (error) return { ok: false, error: /Approve the voucher first|open query/i.test(error.message) ? error.message.replace(/^.*?:\s*/, "") : cleanErr(error) };   // update458: DB gate text as-is
  return { ok: true };
}


// update356: amount in words, Indian grouping — the voucher must carry it.
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const u100 = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
const u1000 = n => (Math.floor(n / 100) ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? u100(n % 100) : "");
export function amountInWords(amount) {
  const whole = Math.floor(Math.abs(Number(amount) || 0));
  const paise = Math.round((Math.abs(Number(amount) || 0) - whole) * 100);
  if (!whole && !paise) return "Rupees Zero Only";
  let n = whole; const parts = [];
  const cr = Math.floor(n / 10000000); n %= 10000000;
  const la = Math.floor(n / 100000);   n %= 100000;
  const th = Math.floor(n / 1000);     n %= 1000;
  if (cr) parts.push(u1000(cr) + " Crore");
  if (la) parts.push(u1000(la) + " Lakh");
  if (th) parts.push(u1000(th) + " Thousand");
  if (n)  parts.push(u1000(n));
  let out = "Rupees " + parts.join(" ").replace(/\s+/g, " ").trim();
  if (paise) out += " and " + u100(paise) + " Paise";
  return out + " Only";
}
