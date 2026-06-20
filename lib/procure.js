"use client";
import { supabase, isDemo } from "./supabase";
import { getIndents } from "./stock";

export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

// ---- open indents with their item lines (office view) ----
export async function getOpenIndents(siteId) {
  const all = await getIndents(siteId);
  return all;
}

export async function getVendorsList() {
  if (isDemo) return [{ id: 1, name: "Turakhia Steel" }, { id: 2, name: "Shree Pipe Traders" }, { id: 3, name: "Gujarat Fittings Co" }];
  const { data } = await supabase.from("vendors").select("id, name").eq("is_active", true).order("name");
  return data || [];
}

// ---- save a set of quotes for an indent (office types them) ----
// quotes: [{ indent_item_id, vendor_name, rate }]
export async function saveQuotes(indentId, quotes) {
  if (isDemo) return { ok: true };
  const rows = quotes.filter(q => q.rate).map(q => ({
    indent_id: indentId, indent_item_id: q.indent_item_id,
    vendor_name: q.vendor_name, rate: Number(q.rate),
  }));
  if (rows.length === 0) return { ok: false, error: "Enter at least one rate." };
  // clear old quotes for this indent then insert fresh
  await supabase.from("indent_quotes").delete().eq("indent_id", indentId);
  const { error } = await supabase.from("indent_quotes").insert(rows);
  if (error) return { ok: false, error: error.message };
  await supabase.from("material_indents").update({ status: "quoting" }).eq("id", indentId);
  return { ok: true };
}

export async function getQuotes(indentId) {
  if (isDemo) return [];
  const { data } = await supabase.from("indent_quotes")
    .select("indent_item_id, vendor_name, rate").eq("indent_id", indentId);
  return data || [];
}

// ---- comparison: build vendor totals + best split + gap ----
// items: [{id, item_name, qty}]  quotes: [{indent_item_id, vendor_name, rate}]
export function buildComparison(items, quotes) {
  const vendors = Array.from(new Set(quotes.map(q => q.vendor_name)));
  // matrix[itemId][vendor] = rate
  const matrix = {};
  quotes.forEach(q => { (matrix[q.indent_item_id] = matrix[q.indent_item_id] || {})[q.vendor_name] = Number(q.rate); });

  // whole-indent total per vendor (only counts items that vendor quoted; missing => not eligible for whole)
  const vendorTotals = vendors.map(v => {
    let total = 0, complete = true;
    items.forEach(it => {
      const r = matrix[it.id]?.[v];
      if (r == null) complete = false; else total += r * Number(it.qty || 0);
    });
    return { vendor: v, total, complete };
  });
  const eligibleWhole = vendorTotals.filter(v => v.complete).sort((a, b) => a.total - b.total);
  const bestWhole = eligibleWhole[0] || null;

  // best split: cheapest vendor per item
  let splitTotal = 0; const splitChoice = {};
  items.forEach(it => {
    const rates = matrix[it.id] || {};
    let bestV = null, bestR = Infinity;
    Object.entries(rates).forEach(([v, r]) => { if (r < bestR) { bestR = r; bestV = v; } });
    if (bestV) { splitTotal += bestR * Number(it.qty || 0); splitChoice[it.id] = { vendor: bestV, rate: bestR }; }
  });

  const gap = bestWhole ? bestWhole.total - splitTotal : 0;
  const gapPct = splitTotal ? Math.round((gap / splitTotal) * 100) : 0;
  return { vendors, matrix, vendorTotals: eligibleWhole, bestWhole, splitTotal, splitChoice, gap, gapPct };
}

// ---- create PO(s) ----
// po: { indent_id, site_id, vendor_name, is_lowest, non_lowest_reason, split_note, lines:[{indent_item_id, item_id, item_name, qty, unit, rate}] }
export async function createPO(po, issuedBy) {
  if (isDemo) return { ok: true, po_no: "PO/DEMO" };
  const { data: noData } = await supabase.rpc("fn_next_po_no", { p_site_id: po.site_id });
  const poNo = noData || ("PO/" + Date.now());
  const total = po.lines.reduce((s, l) => s + Number(l.qty) * Number(l.rate), 0);
  const vendorId = await resolveVendorId(po.vendor_name);
  const { data: head, error } = await supabase.from("purchase_orders").insert({
    po_no: poNo, indent_id: po.indent_id, site_id: po.site_id, vendor_name: po.vendor_name, vendor_id: vendorId,
    total_amount: total, is_lowest: po.is_lowest, non_lowest_reason: po.non_lowest_reason || null,
    split_note: po.split_note || null, status: "issued", issued_by: issuedBy,
  }).select().single();
  if (error) return { ok: false, error: error.message };
  const rows = po.lines.map(l => ({ po_id: head.id, indent_item_id: l.indent_item_id, item_id: l.item_id || null,
    item_name: l.item_name, qty: Number(l.qty), unit: l.unit, rate: Number(l.rate) }));
  const { error: e2 } = await supabase.from("po_items").insert(rows);
  if (e2) return { ok: false, error: e2.message };
  await supabase.from("material_indents").update({ status: "po_issued" }).eq("id", po.indent_id);
  return { ok: true, po_no: poNo };
}

export async function getPOs(siteId) {
  if (isDemo) return [];
  let q = supabase.from("purchase_orders")
    .select("id, po_no, vendor_name, total_amount, is_lowest, non_lowest_reason, status, created_at, sites(name), material_indents(indent_no)")
    .order("created_at", { ascending: false }).limit(100);
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data } = await q;
  return (data || []).map(p => ({ id: p.id, po_no: p.po_no, vendor: p.vendor_name, total: Number(p.total_amount),
    is_lowest: p.is_lowest, reason: p.non_lowest_reason, status: p.status,
    indent_no: p.material_indents?.indent_no, site: p.sites?.name, date: p.created_at?.slice(0,10) }));
}

// ---- resolve vendor master id by name (so PO links to vendor details) ----
async function resolveVendorId(name) {
  if (isDemo || !name) return null;
  const { data } = await supabase.from("vendors").select("id").ilike("name", name.trim()).maybeSingle();
  return data?.id || null;
}

// ---- full PO detail for the printable letterhead ----
export async function getPODetail(poId) {
  if (isDemo) {
    return { po_no: "PO/DEMO", date: new Date().toISOString().slice(0,10), site: "KEI Industries, Sanand",
      vendor: { name: "Demo Vendor", gstin: "24XXXXXXX", phone: "9800000000", contact: "" },
      items: [{ item_name: "Pipe - MS 350NB (Heavy)", qty: 300, unit: "Rmt", rate: 1795 }], gst_pct: 18 };
  }
  const { data: po } = await supabase.from("purchase_orders")
    .select("po_no, vendor_name, vendor_id, total_amount, status, created_at, sites(name, address)")
    .eq("id", poId).maybeSingle();
  if (!po) return null;
  const { data: items } = await supabase.from("po_items")
    .select("item_name, qty, unit, rate").eq("po_id", poId);
  let vendor = { name: po.vendor_name, gstin: "", phone: "", contact: "" };
  if (po.vendor_id) {
    const { data: v } = await supabase.from("vendors").select("name, gstin, phone, contact").eq("id", po.vendor_id).maybeSingle();
    if (v) vendor = { name: v.name, gstin: v.gstin || "", phone: v.phone || "", contact: v.contact || "" };
  } else {
    const { data: v } = await supabase.from("vendors").select("name, gstin, phone, contact").ilike("name", (po.vendor_name||"").trim()).maybeSingle();
    if (v) vendor = { name: v.name, gstin: v.gstin || "", phone: v.phone || "", contact: v.contact || "" };
  }
  return { po_no: po.po_no, date: po.created_at?.slice(0,10), status: po.status,
    site: po.sites?.name, site_address: po.sites?.address,
    vendor, items: (items||[]).map(i => ({ item_name: i.item_name, qty: Number(i.qty), unit: i.unit, rate: Number(i.rate) })), gst_pct: 18 };
}

export async function cancelPO(poId) {
  if (isDemo) return { ok: true };
  // find the indent this PO belongs to
  const { data: po } = await supabase.from("purchase_orders").select("indent_id").eq("id", poId).maybeSingle();
  const { error } = await supabase.from("purchase_orders").update({ status: "cancelled" }).eq("id", poId);
  if (error) return { ok: false, error: error.message };
  // if the indent now has no remaining active (non-cancelled) POs, reopen it
  if (po?.indent_id) {
    const { data: active } = await supabase.from("purchase_orders")
      .select("id").eq("indent_id", po.indent_id).neq("status", "cancelled");
    if (!active || active.length === 0) {
      await supabase.from("material_indents").update({ status: "open" }).eq("id", po.indent_id);
    }
  }
  return { ok: true };
}
