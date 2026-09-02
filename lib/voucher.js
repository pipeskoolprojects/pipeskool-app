"use client";
// update247: CASH VOUCHER — data for the printable voucher.
// One voucher covers one or more APPROVED expense claims by the same claimant. Nothing is
// written to the database: the voucher is a view of rows that already exist, so it can never
// change a balance or a ledger.
import { supabase, isDemo } from "./supabase";
import { billUrl } from "./bills";

const two = n => String(n).padStart(2, "0");

// update252: every voucher prints "Bank" as the payment mode regardless of how the money
// actually moved (cash, own pocket, petty cash). Director's decision, 29 Aug. The real source
// is still recorded in the database and still shown on the voucher body — the cash voucher's
// "and Debit" line and its per-line [Petty]/[Own] markers.
export const PRINTED_PAY_MODE = "Bank";

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
    .select("id, expense_date, category, amount, paid_to, note, funding_source, status, bill_photo_url, claimant_user_id, sites(name), claimant:claimant_user_id(full_name), reviewer:reviewed_by(full_name), expense_bills(path)")   // update284: who approved
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
    // update284: the person(s) who actually approved these claims — printed under "Authorised By"
    approvedBy: [...new Set(rows.map(r => r.reviewer?.full_name).filter(Boolean))].join(", "),
  };
}

// ---------------------------------------------------------------------------
// update249: ADVANCE SALARY VOUCHER
// One voucher per advance request. Like the cash voucher it writes nothing — it is a view of
// a row that already exists, so printing can never change a balance.
// The voucher number IS the request number (ADV/2/2608/017); no second series to keep in sync.
// ---------------------------------------------------------------------------
export async function getAdvanceVoucher(id) {
  if (isDemo || !id) return null;

  const { data: r, error } = await supabase.from("advance_salary_requests")
    .select("id, req_no, site_id, beneficiary_worker_id, beneficiary_user_id, beneficiary_name, beneficiary_kind, amount, approved_amount, reason, bank_on_file, status, reviewed_at, created_at, paid, settled, sites(name), reviewer:reviewed_by(full_name), raiser:raised_by(full_name, role)")
    .eq("id", Number(id)).maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) return null;

  // the figure that matters is what was APPROVED (update242), falling back to what was asked
  const amount = r.approved_amount != null ? Number(r.approved_amount) : Number(r.amount || 0);
  const pkey = r.beneficiary_worker_id ? "w" + r.beneficiary_worker_id
    : r.beneficiary_user_id ? "u" + r.beneficiary_user_id : null;

  // role + contact come from whichever master this beneficiary lives in
  let role = "", contact = "";
  if (r.beneficiary_worker_id) {
    const { data: w } = await supabase.from("workers")
      .select("category, labour_type, mobile").eq("id", r.beneficiary_worker_id).maybeSingle();
    role = [w?.labour_type === "own" ? "Labour" : w?.labour_type ? "Contract" : "Labour", w?.category]
      .filter(Boolean).join(" \u2014 ");
    contact = w?.mobile || "";
  } else if (r.beneficiary_user_id) {
    const { data: u } = await supabase.from("app_users")
      .select("role, mobile").eq("id", r.beneficiary_user_id).maybeSingle();
    role = String(u?.role || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    contact = u?.mobile || "";
  }

  // outstanding: every OTHER approved advance for this person, minus everything payroll has
  // already recovered from them. Computed the same way the Advance salary ledger does it.
  let priorOutstanding = 0;
  if (pkey) {
    const { data: mine } = await supabase.from("advance_salary_requests")
      .select("id, amount, approved_amount, status, created_at")
      .eq("status", "approved")
      .eq(r.beneficiary_worker_id ? "beneficiary_worker_id" : "beneficiary_user_id",
          r.beneficiary_worker_id || r.beneficiary_user_id);
    const takenBefore = (mine || [])
      .filter(x => Number(x.id) !== Number(r.id))
      .reduce((t, x) => t + Number(x.approved_amount != null ? x.approved_amount : x.amount || 0), 0);

    const tbl = r.beneficiary_worker_id ? "wage_payouts" : "staff_payouts";
    const col = r.beneficiary_worker_id ? "worker_id" : "user_id";
    const { data: rec } = await supabase.from(tbl).select("advances_deducted")
      .eq(col, r.beneficiary_worker_id || r.beneficiary_user_id).gt("advances_deducted", 0);
    const recovered = (rec || []).reduce((t, x) => t + Number(x.advances_deducted || 0), 0);
    priorOutstanding = Math.max(0, takenBefore - recovered);
  }

  // update250: voucher serial. The request number (ADV/26/2345) is an internal reference and
  // reads like a random code on a printed document, so the voucher carries its own running
  // number instead. It counts every advance request ever raised with an id up to this one,
  // which means it is STABLE: it is fixed the moment the request is created and can never
  // renumber, even if a later advance is withdrawn (update242).
  const { count: serial } = await supabase.from("advance_salary_requests")
    .select("id", { count: "exact", head: true }).lte("id", Number(r.id));

  // recovery starts with the payroll run AFTER the approval month
  // update284: reviewed_at is a UTC timestamp — slicing it dated early-morning approvals one day
  // back. The voucher date is the approval date in Asia/Kolkata.
  const istDay = ts => ts ? new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "";
  const base = istDay(r.reviewed_at || r.created_at);
  const d = base ? new Date(base + "T00:00:00") : new Date();
  d.setMonth(d.getMonth() + 1);
  const nextCycle = d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  return {
    id: r.id,
    no: "ADV/" + String(serial || 1).padStart(4, "0"),
    reqNo: r.req_no || "",          // kept as the audit link back to the request
    date: base,
    site: r.sites?.name || "",
    name: r.beneficiary_name || "",
    kind: r.beneficiary_kind === "staff" ? "Staff" : "Labour",
    role, contact,
    approvedBy: r.reviewer?.full_name || "",
    reason: r.reason || "",
    asked: Number(r.amount || 0),
    amount,
    partial: r.approved_amount != null && Number(r.approved_amount) !== Number(r.amount),
    words: rupeesInWords(amount),
    payMode: PRINTED_PAY_MODE,   // update252: fixed on the printed document (Director, 29 Aug)
    bankOnFile: !!r.bank_on_file,   // still in the data, no longer printed
    status: r.status,
    paid: !!r.paid,
    settled: !!r.settled,
    priorOutstanding,
    newOutstanding: priorOutstanding + amount,
    nextCycle,
  };
}
