import { supabase, isDemo } from "./supabase";
import { attachPrices } from "./prices";   // update463
import { getGrns } from "./stock";

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
// flagCol picks which "exported" stamp to check/report: bill vs order.
export async function getPurchasesForTally(fromDate, toDate, onlyUnexported, flagCol = "tally_exported_at") {
  if (isDemo) return [];
  let q = supabase.from("purchase_orders")
    .select("id, po_no, vendor_name, vendor_id, created_at, tally_exported_at, tally_po_exported_at, status, vendors(gstin)")
    .neq("status", "cancelled").order("created_at", { ascending: true });
  if (fromDate) q = q.gte("created_at", fromDate + "T00:00:00");
  if (toDate) q = q.lte("created_at", toDate + "T23:59:59");
  if (onlyUnexported) q = q.is(flagCol, null);
  const { data: pos } = await q;
  if (!pos || !pos.length) return [];
  const ids = pos.map(p => p.id);
  const { data: items } = await supabase.from("po_items").select("id, po_id, item_name, qty, unit").in("po_id", ids);
  await Promise.all([attachPrices("purchase_orders", pos), attachPrices("po_items", items)]);   // update463: Tally needs prices → viewers only
  const byPo = {}; (items || []).forEach(i => (byPo[i.po_id] = byPo[i.po_id] || []).push(i));
  return pos.map(p => {
    const lines = byPo[p.id] || [];
    const subtotal = lines.length ? lines.reduce((s, l) => s + Number(l.qty) * Number(l.rate), 0) : Number(p.total_amount || 0);
    return { id: p.id, po_no: p.po_no, vendor: p.vendor_name, gstin: p.vendors?.gstin || "",
      date: (p.created_at || "").slice(0, 10), subtotal: +subtotal.toFixed(2),
      exported: !!p[flagCol], items: lines };
  });
}

export async function markPurchasesExported(poIds) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("purchase_orders").update({ tally_exported_at: new Date().toISOString() }).in("id", poIds);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function markPOsOrderExported(poIds) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("purchase_orders").update({ tally_po_exported_at: new Date().toISOString() }).in("id", poIds);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---- Goods receipts (GRN) -> Tally Receipt Note ----
export async function getGrnsForTally(from, to, onlyUnexported) {
  const all = await getGrns("all", from, to);
  return onlyUnexported ? all.filter(g => !g.exported) : all;
}

export async function markGrnsExported(grnNos) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("stock_txns").update({ tally_rn_exported_at: new Date().toISOString() }).in("grn_no", grnNos);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// update215: Delivery Challans as Tally "Delivery Note" vouchers — same envelope/party/esc
// helpers as every other export here, so the format stays consistent.
export function buildDeliveryNoteXml(dcs, s) {
  const msgs = []; const seen = new Set();
  dcs.forEach(d => {
    if (s.auto_create_party && d.vendor && !seen.has(d.vendor)) { seen.add(d.vendor); msgs.push(partyMaster(d.vendor, "")); }
    let total = 0;
    const inv = (d.lines || []).map(l => {
      const rate = Number(l.rate || 0);
      const amt = +(Number(l.received_qty) * rate).toFixed(2); total += amt;
      const u = esc(l.unit || "Nos");
      return `<ALLINVENTORYENTRIES.LIST>
   <STOCKITEMNAME>${esc(l.item_name)}</STOCKITEMNAME>
   <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
   <RATE>${rate}/${u}</RATE>
   <ACTUALQTY>${Number(l.received_qty)} ${u}</ACTUALQTY>
   <BILLEDQTY>${Number(l.received_qty)} ${u}</BILLEDQTY>
   <AMOUNT>-${amt.toFixed(2)}</AMOUNT>
   <ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>${esc(s.purchase_ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${amt.toFixed(2)}</AMOUNT></ACCOUNTINGALLOCATIONS.LIST>
  </ALLINVENTORYENTRIES.LIST>`;
    }).join("\n  ");
    total = +total.toFixed(2);
    msgs.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <VOUCHER VCHTYPE="Delivery Note" ACTION="Create" OBJVIEW="Invoice Voucher View">
  <DATE>${ymd(d.date)}</DATE>
  <VOUCHERTYPENAME>Delivery Note</VOUCHERTYPENAME>
  <REFERENCE>${esc(d.vendor_dc_no || d.dc_ref)}</REFERENCE>
  <PARTYLEDGERNAME>${esc(d.vendor)}</PARTYLEDGERNAME>
  <NARRATION>${esc(d.dc_ref + (d.po_no ? " · against " + d.po_no : "") + (d.grn_no ? " · GRN " + d.grn_no : ""))}</NARRATION>
  ${ledgerEntry(d.vendor, false, total)}
  ${inv}
 </VOUCHER>
</TALLYMESSAGE>`);
  });
  return envelope(msgs, s, "Vouchers");
}

export function buildReceiptNoteXml(grns, s) {
  const msgs = []; const seen = new Set();
  grns.forEach(g => {
    if (s.auto_create_party && g.vendor && !seen.has(g.vendor)) { seen.add(g.vendor); msgs.push(partyMaster(g.vendor, "")); }
    let total = 0;
    const inv = (g.lines || []).map(l => {
      const amt = +(Number(l.received_qty) * Number(l.rate)).toFixed(2); total += amt;
      const u = esc(l.unit || "Nos");
      return `<ALLINVENTORYENTRIES.LIST>
   <STOCKITEMNAME>${esc(l.item_name)}</STOCKITEMNAME>
   <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
   <RATE>${Number(l.rate)}/${u}</RATE>
   <ACTUALQTY>${Number(l.received_qty)} ${u}</ACTUALQTY>
   <BILLEDQTY>${Number(l.received_qty)} ${u}</BILLEDQTY>
   <AMOUNT>-${amt.toFixed(2)}</AMOUNT>
   <ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>${esc(s.purchase_ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${amt.toFixed(2)}</AMOUNT></ACCOUNTINGALLOCATIONS.LIST>
  </ALLINVENTORYENTRIES.LIST>`;
    }).join("\n  ");
    total = +total.toFixed(2);
    msgs.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <VOUCHER VCHTYPE="Receipt Note" ACTION="Create" OBJVIEW="Invoice Voucher View">
  <DATE>${ymd(g.date)}</DATE>
  <VOUCHERTYPENAME>Receipt Note</VOUCHERTYPENAME>
  <REFERENCE>${esc(g.challan_no || g.grn_no)}</REFERENCE>
  <PARTYLEDGERNAME>${esc(g.vendor)}</PARTYLEDGERNAME>
  <NARRATION>${esc(g.grn_no + (g.challan_no ? " · challan " + g.challan_no : ""))}</NARRATION>
  ${ledgerEntry(g.vendor, false, total)}
  ${inv}
 </VOUCHER>
</TALLYMESSAGE>`);
  });
  return envelope(msgs, s, "Vouchers");
}
export async function getStockMasters() {
  if (isDemo) return { items: [], units: [] };
  // Page through — Supabase caps queries at 1000 rows; master is larger now.
  const PAGE = 1000;
  let items = [], from = 0;
  for (;;) {
    const { data, error } = await supabase.from("item_master")
      .select("display_name, unit").eq("is_active", true).order("display_name")
      .range(from, from + PAGE - 1);
    if (error) break;
    const batch = data || [];
    items = items.concat(batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  const units = Array.from(new Set(items.map(i => (i.unit || "").trim()).filter(Boolean)));
  return { items, units };
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

function envelope(messages, s, reportName = "Vouchers") {
  return `<ENVELOPE>
<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC>
<REPORTNAME>${reportName}</REPORTNAME>
<STATICVARIABLES><SVCURRENTCOMPANY>${esc(s.company_name)}</SVCURRENTCOMPANY></STATICVARIABLES>
</REQUESTDESC>
<REQUESTDATA>
${messages.join("\n")}
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>`;
}

// Stock item + unit masters (run once / when items change)
export function buildMasterXml(items, units, s) {
  const msgs = [];
  units.forEach(u => msgs.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><UNIT NAME="${esc(u)}" ACTION="Create"><NAME>${esc(u)}</NAME><ISSIMPLEUNIT>Yes</ISSIMPLEUNIT></UNIT></TALLYMESSAGE>`));
  items.forEach(it => msgs.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKITEM NAME="${esc(it.display_name)}" ACTION="Create"><NAME>${esc(it.display_name)}</NAME>${it.unit ? `<BASEUNITS>${esc(it.unit)}</BASEUNITS>` : ""}</STOCKITEM></TALLYMESSAGE>`));
  return envelope(msgs, s, "All Masters");
}

// PO -> Tally Purchase Order voucher (inventory order; basic value, GST applied at billing)
export function buildPurchaseOrderXml(pos, s) {
  const msgs = []; const seen = new Set();
  pos.forEach(p => {
    if (s.auto_create_party && p.vendor && !seen.has(p.vendor)) { seen.add(p.vendor); msgs.push(partyMaster(p.vendor, p.gstin)); }
    const inv = (p.items || []).map(it => {
      const amt = +(Number(it.qty) * Number(it.rate)).toFixed(2);
      const u = esc(it.unit || "Nos");
      return `<ALLINVENTORYENTRIES.LIST>
   <STOCKITEMNAME>${esc(it.item_name)}</STOCKITEMNAME>
   <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
   <RATE>${Number(it.rate)}/${u}</RATE>
   <ACTUALQTY>${Number(it.qty)} ${u}</ACTUALQTY>
   <BILLEDQTY>${Number(it.qty)} ${u}</BILLEDQTY>
   <AMOUNT>-${amt.toFixed(2)}</AMOUNT>
   <ACCOUNTINGALLOCATIONS.LIST>
    <LEDGERNAME>${esc(s.purchase_ledger)}</LEDGERNAME>
    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
    <AMOUNT>-${amt.toFixed(2)}</AMOUNT>
   </ACCOUNTINGALLOCATIONS.LIST>
  </ALLINVENTORYENTRIES.LIST>`;
    }).join("\n  ");
    msgs.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <VOUCHER VCHTYPE="Purchase Order" ACTION="Create" OBJVIEW="Invoice Voucher View">
  <DATE>${ymd(p.date)}</DATE>
  <VOUCHERTYPENAME>Purchase Order</VOUCHERTYPENAME>
  <REFERENCE>${esc(p.po_no)}</REFERENCE>
  <BASICPURCHASEORDERNO>${esc(p.po_no)}</BASICPURCHASEORDERNO>
  <PARTYLEDGERNAME>${esc(p.vendor)}</PARTYLEDGERNAME>
  ${ledgerEntry(p.vendor, false, p.subtotal)}
  ${inv}
 </VOUCHER>
</TALLYMESSAGE>`);
  });
  return envelope(msgs, s, "Vouchers");
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
  return envelope(messages, s, "Vouchers");
}
