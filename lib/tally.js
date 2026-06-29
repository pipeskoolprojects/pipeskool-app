import { supabase, isDemo } from "./supabase";

const DEFAULTS = {
  id: 1, company_name: "", home_state_code: "24", default_gst_pct: 18,
  purchase_ledger: "Purchase", cgst_ledger: "Input CGST", sgst_ledger: "Input SGST", igst_ledger: "Input IGST",
  round_off_ledger: "Round Off", cash_ledger: "Cash", bank_ledger: "Bank", default_expense_ledger: "Site Expenses",
  voucher_purchase: "Purchase", voucher_payment: "Payment", voucher_stockjrnl: "Stock Journal", auto_create_party: true,
};

export async function getTallySettings() {
  if (isDemo) return { ...DEFAULTS };
  const { data } = await supabase.from("tally_settings").select("*").eq("id", 1).maybeSingle();
  return data || { ...DEFAULTS };
}

export async function saveTallySettings(s) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("tally_settings").upsert({ ...s, id: 1 }, { onConflict: "id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Purchases (issued POs) in a date range, with vendor GSTIN + line items.
export async function getPurchasesForTally(fromDate, toDate, onlyUnexported) {
  if (isDemo) return [];
  let q = supabase.from("purchase_orders")
    .select("id, po_no, vendor_name, vendor_id, total_amount, created_at, tally_exported_at, status, vendors(gstin)")
    .neq("status", "cancelled").order("created_at", { ascending: true });
  if (fromDate) q = q.gte("created_at", fromDate + "T00:00:00");
  if (toDate) q = q.lte("created_at", toDate + "T23:59:59");
  if (onlyUnexported) q = q.is("tally_exported_at", null);
  const { data: pos } = await q;
  if (!pos || !pos.length) return [];
  const ids = pos.map(p => p.id);
  const { data: items } = await supabase.from("po_items").select("po_id, item_name, qty, unit, rate").in("po_id", ids);
  const byPo = {}; (items || []).forEach(i => (byPo[i.po_id] = byPo[i.po_id] || []).push(i));
  return pos.map(p => {
    const lines = byPo[p.id] || [];
    const subtotal = lines.length ? lines.reduce((s, l) => s + Number(l.qty) * Number(l.rate), 0) : Number(p.total_amount || 0);
    return { id: p.id, po_no: p.po_no, vendor: p.vendor_name, gstin: p.vendors?.gstin || "",
      date: (p.created_at || "").slice(0, 10), subtotal: +subtotal.toFixed(2),
      exported: !!p.tally_exported_at, items: lines };
  });
}

export async function markPurchasesExported(poIds) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("purchase_orders").update({ tally_exported_at: new Date().toISOString() }).in("id", poIds);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---- GST split from vendor GSTIN vs home state ----
export function gstParts(gstin, homeCode, taxable, pct) {
  const code = (gstin || "").trim().slice(0, 2);
  const inter = code && code !== String(homeCode);
  const gst = +(Number(taxable) * Number(pct) / 100).toFixed(2);
  if (inter) return { igst: gst, cgst: 0, sgst: 0 };
  return { igst: 0, cgst: +(gst / 2).toFixed(2), sgst: +(gst / 2).toFixed(2) };
}

const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ymd = d => (d || "").replace(/-/g, "");

function ledgerEntry(name, isDebit, amount) {
  // Tally: debit => ISDEEMEDPOSITIVE Yes, AMOUNT negative; credit => No, AMOUNT positive
  const amt = isDebit ? -Math.abs(amount) : Math.abs(amount);
  return `<ALLLEDGERENTRIES.LIST>
  <LEDGERNAME>${esc(name)}</LEDGERNAME>
  <ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
  <AMOUNT>${amt.toFixed(2)}</AMOUNT>
 </ALLLEDGERENTRIES.LIST>`;
}

function partyMaster(name, gstin) {
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <LEDGER NAME="${esc(name)}" ACTION="Create">
  <NAME>${esc(name)}</NAME>
  <PARENT>Sundry Creditors</PARENT>
  <ISBILLWISEON>Yes</ISBILLWISEON>
  ${gstin ? `<PARTYGSTIN>${esc(gstin)}</PARTYGSTIN>` : ""}
 </LEDGER>
</TALLYMESSAGE>`;
}

// Build a TallyPrime import XML of Purchase vouchers (accounting).
export function buildPurchaseXml(purchases, s) {
  const messages = [];
  const seenParty = new Set();
  purchases.forEach(p => {
    if (s.auto_create_party && p.vendor && !seenParty.has(p.vendor)) {
      seenParty.add(p.vendor);
      messages.push(partyMaster(p.vendor, p.gstin));
    }
    const pct = Number(s.default_gst_pct) || 0;
    const { cgst, sgst, igst } = gstParts(p.gstin, s.home_state_code, p.subtotal, pct);
    const total = +(p.subtotal + cgst + sgst + igst).toFixed(2);
    const narr = (p.items || []).map(i => `${i.item_name} ${i.qty}${i.unit || ""} @${i.rate}`).join("; ");
    const entries = [
      ledgerEntry(p.vendor, false, total),                 // party credit
      ledgerEntry(s.purchase_ledger, true, p.subtotal),    // purchase debit
    ];
    if (igst) entries.push(ledgerEntry(s.igst_ledger, true, igst));
    else {
      if (cgst) entries.push(ledgerEntry(s.cgst_ledger, true, cgst));
      if (sgst) entries.push(ledgerEntry(s.sgst_ledger, true, sgst));
    }
    messages.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <VOUCHER VCHTYPE="${esc(s.voucher_purchase)}" ACTION="Create" OBJVIEW="Accounting Voucher View">
  <DATE>${ymd(p.date)}</DATE>
  <EFFECTIVEDATE>${ymd(p.date)}</EFFECTIVEDATE>
  <VOUCHERTYPENAME>${esc(s.voucher_purchase)}</VOUCHERTYPENAME>
  <REFERENCE>${esc(p.po_no)}</REFERENCE>
  <PARTYLEDGERNAME>${esc(p.vendor)}</PARTYLEDGERNAME>
  <NARRATION>${esc(p.po_no + " — " + narr)}</NARRATION>
  ${entries.join("\n  ")}
 </VOUCHER>
</TALLYMESSAGE>`);
  });

  return `<ENVELOPE>
<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC>
<REPORTNAME>Vouchers</REPORTNAME>
<STATICVARIABLES><SVCURRENTCOMPANY>${esc(s.company_name)}</SVCURRENTCOMPANY></STATICVARIABLES>
</REQUESTDESC>
<REQUESTDATA>
${messages.join("\n")}
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>`;
}
