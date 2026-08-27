"use client";
// update247: CASH VOUCHER — data for the printable voucher.
// One voucher covers one or more APPROVED expense claims by the same claimant. Nothing is
// written to the database: the voucher is a view of rows that already exist, so it can never
// change a balance or a ledger.
import { supabase, isDemo } from "./supabase";
import { billUrl } from "./bills";

const two = n => String(n).padStart(2, "0");

// CV-YYMMDD-NNNN, derived from the voucher date and the lowest expense id in the set.
// Deterministic on purpose: reprinting the same expenses always gives the same number, and
// it needs no counter table, so there is nothing new to keep in sync.
export function voucherNo(dateStr, ids) {
  const d = String(dateStr || "").slice(2, 10).replace(/-/g, "");
  const seq = String(Math.min(...ids.map(Number))).padStart(4, "0");
  return "CV-" + d + "-" + seq;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function under100(n) { return n < 20 ? ONES[n] : (TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "")); }
function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? under100(r) : "");
}
// Indian numbering: crore / lakh / thousand
export function rupeesInWords(amount) {
  let n = Math.floor(Number(amount) || 0);
  const paise = Math.round(((Number(amount) || 0) - n) * 100);
  if (n === 0 && !paise) return "Zero Rupees Only";
  const parts = [];
  const cr = Math.floor(n / 10000000); n %= 10000000;
  const lk = Math.floor(n / 100000); n %= 100000;
  const th = Math.floor(n / 1000); n %= 1000;
  if (cr) parts.push(under1000(cr) + " Crore");
  if (lk) parts.push(under1000(lk) + " Lakh");
  if (th) parts.push(under1000(th) + " Thousand");
  if (n) parts.push(under1000(n));
  let out = parts.join(" ").replace(/\s+/g, " ").trim() + " Rupees";
  if (paise) out += " and " + under100(paise) + " Paise";
  return out + " Only";
}

// Load the selected expenses and shape them for the voucher.
export async function getVoucher(ids) {
  if (isDemo || !ids?.length) return null;
  const { data, error } = await supabase.from("expenses")
    .select("id, expense_date, category, amount, paid_to, note, funding_source, status, bill_photo_url, claimant_user_id, sites(name), claimant:claimant_user_id(full_name), expense_bills(path)")
    .in("id", ids.map(Number)).order("expense_date");
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (!rows.length) return null;

  // update248: an expense can hold the SAME file twice — once as an expense_bills row and
  // once in the legacy bill_photo_url column. Concatenating both printed the bill twice.
  // Storage paths are unique, so dedupe on the path, keeping the first occurrence.
  const proofs = [];
  const seenPath = new Set();
  rows.forEach(r => {
    const paths = [...((r.expense_bills || []).map(b => b.path)), ...(r.bill_photo_url ? [r.bill_photo_url] : [])];
    paths.forEach(p => {
      const key = String(p || "").trim();
      if (!key || seenPath.has(key)) return;
      seenPath.add(key);
      proofs.push({
        path: p, url: billUrl(p),
        isPdf: /\.pdf($|\?)/i.test(key),
        label: r.category, amount: Number(r.amount), paidTo: r.paid_to || "",
      });
    });
  });

  const total = rows.reduce((t, r) => t + Number(r.amount || 0), 0);
  const srcs = [...new Set(rows.map(r => r.funding_source))];
  // Director's rule: say where the money actually came from. Petty cash when it was spent from
  // petty cash, own pocket when the person paid themselves. Never a fixed caption.
  const debitTo = srcs.length > 1 ? "Petty Cash + Own pocket"
    : srcs[0] === "petty_cash" ? "Petty Cash" : "Own pocket (reimbursement)";

  const date = rows[0].expense_date;
  return {
    ids: rows.map(r => r.id),
    no: voucherNo(date, rows.map(r => r.id)),
    date,
    payTo: rows[0].claimant?.full_name || "",
    site: rows[0].sites?.name || "",
    being: [...new Set(rows.map(r => r.category))].join(", "),
    debitTo,
    lines: rows.map(r => ({
      id: r.id, label: r.category, paidTo: r.paid_to || "", note: r.note || "",
      amount: Number(r.amount || 0), date: r.expense_date, status: r.status,
      source: r.funding_source === "petty_cash" ? "Petty" : "Own",
    })),
    proofs,
    total,
    words: rupeesInWords(total),
    mixedClaimants: [...new Set(rows.map(r => r.claimant_user_id))].length > 1,
    notApproved: rows.filter(r => r.status !== "approved").length,
  };
}
