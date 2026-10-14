"use client";
import { supabase, isDemo } from "./supabase";
import { notifyRequest, notifyDecision } from "./notify";
import { getIndents } from "./stock";
import { fileStore } from "./files";   // update460: files live in Cloudflare R2 (private)

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
export async function saveQuotes(indentId, rows) {
  if (isDemo) return { ok: true };
  // rows: [{indent_item_id, vendor_id, vendor_name, list_rate, discount_pct, rate}]
  // an allocated cell may have no rate yet (asked but not quoted) — keep it.
  const clean = (rows || []).filter(q => q.indent_item_id && q.vendor_name).map(q => ({
    indent_id: indentId, indent_item_id: q.indent_item_id,
    vendor_id: q.vendor_id || null, vendor_name: q.vendor_name,
    list_rate: q.list_rate != null && q.list_rate !== "" ? Number(q.list_rate) : null,
    discount_pct: q.discount_pct != null && q.discount_pct !== "" ? Number(q.discount_pct) : null,
    rate: q.rate != null && q.rate !== "" ? Number(q.rate) : null,
    _item_name: q.item_name || null,   // update299: not inserted (stripped below), used for rate memory
  }));
  if (clean.length === 0) return { ok: false, error: "Add at least one vendor and tick the items they should quote." };
  await supabase.from("indent_quotes").delete().eq("indent_id", indentId);
  const { error } = await supabase.from("indent_quotes").insert(clean.map(({ _item_name, ...q }) => q));   // update299
  if (error) return { ok: false, error: error.message };
  // update299: only an OPEN indent moves to "quoting" — saving rates on an indent whose PO
  // already exists must never reset its status (the PO itself was never touched, but the
  // indent looked "reset"; this closes that).
  await supabase.from("material_indents").update({ status: "quoting" }).eq("id", indentId).eq("status", "open");
  // remember the entered rates as the company's latest price per product (with vendor)
  try {
    const mem = clean.filter(q => q.rate > 0).map(q => ({ item_name: q._item_name, rate: q.rate, discount_pct: q.discount_pct, vendor_name: q.vendor_name, source: "quote" })).filter(m => m.item_name);
    if (mem.length) await supabase.rpc("fn_rate_remember", { p_rows: mem });
  } catch {}
  return { ok: true };
}

export async function getQuotes(indentId) {
  if (isDemo) return [];
  const { data } = await supabase.from("indent_quotes")
    .select("indent_item_id, vendor_id, vendor_name, rate, list_rate, discount_pct").eq("indent_id", indentId);
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
// update198: Director approve / reject a PO (DB enforces director-only)
export async function approvePO(poId, action, reason) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_po_approve", { p_po_id: poId, p_action: action, p_reason: reason || null });
  if (error) return { ok: false, error: /fn_po_approve|schema cache/i.test(error.message) ? "Approval workflow not enabled yet — run pipeskool_po_approval.sql (update 198)." : error.message };
  if (data?.ok) {
    try {   // update202: tell the person who prepared the PO
      const { data: p } = await supabase.from("purchase_orders").select("issued_by, po_no").eq("id", poId).single();
      if (p?.issued_by) notifyDecision({ toUserId: p.issued_by, kind: "po_approval", requestId: poId,
        title: "PO " + (action === "approved" ? "approved ✓" : "rejected ✗"),
        body: p.po_no + (action === "approved" ? " is approved — you can issue/print it now." : " was rejected" + (reason ? ": " + reason : ".")), status: action });
    } catch {}
    return { ok: true, po_no: data.po_no, by: data.by };
  }
  return { ok: false, error: data?.error || "Failed" };
}

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
    item_name: l.item_name, spec: l.spec || null, qty: Number(l.qty), unit: l.unit, rate: Number(l.rate),
    list_rate: l.list_rate ?? null, discount_pct: l.discount_pct ?? 0, gst_pct: l.gst_pct ?? 18 }));
  const { error: e2 } = await supabase.from("po_items").insert(rows);
  try {   // update299: an actual order is the strongest price signal — remember it
    const mem = rows.filter(r => Number(r.rate) > 0).map(r => ({ item_name: r.item_name, rate: Number(r.rate), discount_pct: r.discount_pct != null ? Number(r.discount_pct) : null, vendor_name: po.vendor_name, source: "po" }));
    if (mem.length) await supabase.rpc("fn_rate_remember", { p_rows: mem });
  } catch {}
  if (e2) return { ok: false, error: e2.message };
  // update170: PARTIAL POs — the indent stays open until every item is covered
  const [{ data: allIt }, { data: cov }] = await Promise.all([
    supabase.from("material_indent_items").select("id").eq("indent_id", po.indent_id),
    supabase.from("po_items").select("indent_item_id, purchase_orders!inner(id)")
      .eq("purchase_orders.indent_id", po.indent_id).neq("purchase_orders.status", "cancelled"),
  ]);
  const covered = new Set((cov || []).map(x => x.indent_item_id));
  const remaining = (allIt || []).filter(x => !covered.has(x.id)).length;
  await supabase.from("material_indents")
    .update({ status: remaining === 0 ? "po_issued" : "quoting" }).eq("id", po.indent_id);
  try {   // update202/209: notify directors a PO awaits approval (in-app bell + phone push)
    notifyRequest({ kind: "po_approval", requestId: head.id, siteId: po.site_id,
      title: "PO approval request", body: poNo + " · " + (po.vendor_name || "") + " · ₹" + total.toLocaleString("en-IN") + " — needs your approval." });
  } catch {}
  return { ok: true, po_no: poNo, remaining };
}

// update209: every indent ever raised, any status, with site + PO links
export async function getAllIndents() {
  if (isDemo) return [];
  const { data } = await supabase.from("material_indents")
    .select("id, indent_no, status, required_by, urgency, created_at, sites(name), app_users(full_name), material_indent_items(id), purchase_orders(po_no, status)")
    .order("created_at", { ascending: false }).limit(1000);
  return (data || []).map(i => ({
    id: i.id, indent_no: i.indent_no, status: i.status, site: i.sites?.name || "",
    by: i.app_users?.full_name || "", date: i.created_at?.slice(0, 10), required_by: i.required_by || "",
    urgency: i.urgency, items: (i.material_indent_items || []).length,
    pos: (i.purchase_orders || []).filter(p => p.status !== "cancelled").map(p => p.po_no),
  }));
}

export async function getPOs(siteId) {
  if (isDemo) return [];
  let q = supabase.from("purchase_orders")
    .select("id, po_no, indent_id, vendor_name, total_amount, is_lowest, non_lowest_reason, status, expected_delivery, delivery_status, delivery_note, created_at, approval_status, approved_at, reject_reason, approver:approved_by(full_name), site_id, sites(name), material_indents(indent_no, required_by, app_users(full_name))")
    .order("created_at", { ascending: false }).limit(400);   // update184: was 100; + indent raiser for PO filters
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data } = await q;
  // update185: receipt progress per PO (view from pipeskool_grn_po_link.sql; absent -> blank column)
  const rc = {};
  if (data?.length) {
    const { data: rv, error: rvErr } = await supabase.from("v_po_receipt").select("po_id, ordered_qty, received_qty, pending_qty, item_count, items_complete").in("po_id", data.map(p => p.id));
    if (!rvErr) (rv || []).forEach(r => { rc[r.po_id] = r; });
  }
  // update255: how many rate-comparison proofs sit behind each PO's indent, in ONE query.
  // Without this the list had no way to reach a proof at all — the only route was the
  // Director review page, which is why an uploaded proof looked like it had vanished.
  const proofCount = {};
  try {
    const indentIds = [...new Set((data || []).map(p => p.indent_id).filter(Boolean))];
    if (indentIds.length) {
      const { data: qp } = await supabase.from("quote_proofs").select("indent_id").in("indent_id", indentIds);
      (qp || []).forEach(x => { proofCount[x.indent_id] = (proofCount[x.indent_id] || 0) + 1; });
    }
  } catch {}

  return (data || []).map(p => ({ id: p.id, po_no: p.po_no, site_id: p.site_id, vendor: p.vendor_name, total: Number(p.total_amount),
    indent_id: p.indent_id, proof_count: proofCount[p.indent_id] || 0,
    approval: p.approval_status || "approved", approved_by: p.approver?.full_name || "",
    approved_at: p.approved_at ? p.approved_at.slice(0, 10) : "", reject_reason: p.reject_reason || "",
    received_pct: rc[p.id] && Number(rc[p.id].ordered_qty) > 0 ? Math.round(100 * Number(rc[p.id].received_qty) / Number(rc[p.id].ordered_qty)) : null,
    items_complete: rc[p.id]?.items_complete ?? null, item_count: rc[p.id]?.item_count ?? null,
    is_lowest: p.is_lowest, reason: p.non_lowest_reason, status: p.status,
    expected_delivery: p.expected_delivery || p.material_indents?.required_by || null,
    delivery_status: p.delivery_status || "pending", delivery_note: p.delivery_note || "",
    indent_no: p.material_indents?.indent_no, raised_by: p.material_indents?.app_users?.full_name || "", site: p.sites?.name, date: p.created_at?.slice(0,10) }));
}

export const DELIVERY_STATUS = {
  pending: ["Awaiting confirmation", "gray"], confirmed: ["Date confirmed", "info"],
  delayed: ["Delayed", "a"], dispatched: ["Out for delivery", "h"], partial: ["Partly received", "info"], delivered: ["Delivered", "p"],
};

export async function updatePODelivery(poId, fields) {
  if (isDemo) return { ok: true };
  const upd = { delivery_updated_at: new Date().toISOString() };
  if (fields.expected_delivery !== undefined) upd.expected_delivery = fields.expected_delivery || null;
  if (fields.delivery_status !== undefined) upd.delivery_status = fields.delivery_status;
  if (fields.delivery_note !== undefined) upd.delivery_note = fields.delivery_note || null;
  if (fields.delivery_status === "delivered") upd.status = "delivered";
  const { error } = await supabase.from("purchase_orders").update(upd).eq("id", poId);
  return error ? { ok: false, error: error.message } : { ok: true };
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
    .select("po_no, vendor_name, vendor_id, total_amount, status, approval_status, approved_at, approver:approved_by(full_name), created_at, sites(name, address)")
    .eq("id", poId).maybeSingle();
  if (!po) return null;
  const { data: items } = await supabase.from("po_items")
    .select("indent_item_id, item_name, spec, qty, unit, rate, list_rate, discount_pct, gst_pct, returned_qty, line_kind, exchange_ref").eq("po_id", poId);   // update253 · update404: exchange columns
  let vendor = { name: po.vendor_name, gstin: "", phone: "", contact: "" };
  if (po.vendor_id) {
    const { data: v } = await supabase.from("vendors").select("name, gstin, phone, contact").eq("id", po.vendor_id).maybeSingle();
    if (v) vendor = { name: v.name, gstin: v.gstin || "", phone: v.phone || "", contact: v.contact || "" };
  } else {
    const { data: v } = await supabase.from("vendors").select("name, gstin, phone, contact").ilike("name", (po.vendor_name||"").trim()).maybeSingle();
    if (v) vendor = { name: v.name, gstin: v.gstin || "", phone: v.phone || "", contact: v.contact || "" };
  }
  return { po_no: po.po_no, approval: po.approval_status || "approved", approved_by: po.approver?.full_name || "", approved_at: po.approved_at ? po.approved_at.slice(0, 10) : "", date: po.created_at?.slice(0,10), status: po.status,
    site: po.sites?.name, site_address: po.sites?.address,
    vendor, items: (items||[]).map(i => ({ item_name: i.item_name + (i.spec ? " — " + i.spec : ""), qty: Number(i.qty) - Number(i.returned_qty || 0), ordered_qty: Number(i.qty), returned_qty: Number(i.returned_qty || 0), line_kind: i.line_kind || null, exchange_ref: i.exchange_ref || null, unit: i.unit,
      rate: Number(i.rate), list_rate: i.list_rate != null ? Number(i.list_rate) : null,
      discount_pct: Number(i.discount_pct || 0), gst_pct: Number(i.gst_pct ?? 18) })) };
}

export async function cancelPO(poId) {
  if (isDemo) return { ok: true };
  // find the indent this PO belongs to
  const { data: po } = await supabase.from("purchase_orders").select("indent_id").eq("id", poId).maybeSingle();
  const { error } = await supabase.from("purchase_orders").update({ status: "cancelled" }).eq("id", poId);
  if (error) return { ok: false, error: error.message };
  // update173: recompute item coverage — cancelled PO's items REOPEN on the indent
  if (po?.indent_id) {
    const [{ data: allIt }, { data: cov }, { data: active }] = await Promise.all([
      supabase.from("material_indent_items").select("id").eq("indent_id", po.indent_id),
      supabase.from("po_items").select("indent_item_id, purchase_orders!inner(id)")
        .eq("purchase_orders.indent_id", po.indent_id).neq("purchase_orders.status", "cancelled"),
      supabase.from("purchase_orders").select("id").eq("indent_id", po.indent_id).neq("status", "cancelled"),
    ]);
    const covered = new Set((cov || []).map(x => x.indent_item_id));
    const uncovered = (allIt || []).filter(x => !covered.has(x.id)).length;
    if (uncovered > 0) {
      await supabase.from("material_indents")
        .update({ status: (active || []).length > 0 ? "quoting" : "open" }).eq("id", po.indent_id);
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// update253: RATE PROOFS — evidence behind a vendor's quoted rate.
// Stored in quote_proofs, keyed by (indent_item_id, vendor_name), NOT on indent_quotes —
// saveQuotes() wipes and re-inserts that table on every save, so a column there would be
// lost the moment anyone edited a rate. Optional throughout: a rate with no proof behaves
// exactly as it did before.
// ---------------------------------------------------------------------------
export async function uploadQuoteProof({ indentId, indentItemId = null, vendorName = null, file, note }, byUser) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  if (!file) return { ok: false, error: "No file chosen." };
  const okType = /^image\//.test(file.type) || /\.pdf$/i.test(file.name || "") || file.type === "application/pdf";
  if (!okType) return { ok: false, error: "Attach an image (JPG/PNG) or a PDF." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "File is over 10 MB — please compress it." };

  const ext = (file.name || "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  // update254: one proof set per QUOTATION, so the key is the indent, not an item
  const path = `quote-proofs/${indentId}/${indentItemId || "quotation"}_${Date.now()}.${ext}`;
  const { error: upErr } = await fileStore.from("attendance-photos")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { data, error } = await supabase.from("quote_proofs").insert({
    indent_id: indentId, indent_item_id: indentItemId, vendor_name: vendorName,
    path, mime: file.type || null, note: note || null, uploaded_by: byUser || null,
  }).select("id, path, mime, vendor_name, indent_item_id").single();
  if (error) {
    // update255: the file reached storage but the row did not — remove the orphan so a
    // failed upload leaves nothing behind, and say plainly WHY it failed.
    try { await fileStore.from("attendance-photos").remove([path]); } catch {}
    const m = error.message || "";
    if (/null value in column|not-null|violates not-null/i.test(m))
      return { ok: false, error: "Proof not saved: the database still has the older quote_proofs table. Run pipeskool_quote_proofs.sql (the update254 version) and try again." };
    if (/relation .*quote_proofs.* does not exist|schema cache/i.test(m))
      return { ok: false, error: "Proof not saved: the quote_proofs table is missing. Run pipeskool_quote_proofs.sql first." };
    if (/row-level security|permission denied/i.test(m))
      return { ok: false, error: "Proof not saved: you do not have permission to attach rate proofs (needs Indent create or manage)." };
    return { ok: false, error: "Proof not saved: " + m };
  }
  return { ok: true, proof: data };
}

// update254: the rate-comparison proofs for one indent — one set for the whole quotation.
// Rows left over from 253 (which had a proof per item/vendor) are still returned, so nothing
// uploaded under the old scheme disappears.
export async function getQuoteProofs(indentId) {
  if (isDemo || !indentId) return [];
  const { data, error } = await supabase.from("quote_proofs")
    .select("id, indent_item_id, vendor_name, path, mime, note, created_at")
    .eq("indent_id", indentId).order("created_at");
  if (error) return [];
  return data || [];
}

// update254: the rate-comparison proof behind a PO, found through the PO's indent.
// Returns { indentId, proofs } — the PO print does NOT embed these; they are a separate
// reference document (see /purchase/rate-proof).
export async function getPOProofs(poId) {
  if (isDemo || !poId) return { indentId: null, proofs: [] };
  const { data: po } = await supabase.from("purchase_orders")
    .select("indent_id").eq("id", poId).maybeSingle();
  if (!po?.indent_id) return { indentId: null, proofs: [] };
  const { data } = await supabase.from("quote_proofs")
    .select("id, indent_item_id, vendor_name, path, mime, note")
    .eq("indent_id", po.indent_id).order("created_at");
  return { indentId: po.indent_id, proofs: data || [] };
}

// header details for the standalone rate-comparison sheet
export async function getIndentProofSheet(indentId) {
  if (isDemo || !indentId) return null;
  const [{ data: ind }, proofs] = await Promise.all([
    supabase.from("material_indents").select("id, indent_no, created_at, sites(name)").eq("id", indentId).maybeSingle(),
    getQuoteProofs(indentId),
  ]);
  if (!ind) return null;
  return { indentNo: ind.indent_no || ("IND-" + ind.id), site: ind.sites?.name || "",
    date: String(ind.created_at || "").slice(0, 10), proofs };
}

export async function deleteQuoteProof(id, path) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("quote_proofs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  try { await fileStore.from("attendance-photos").remove([path]); } catch {}
  return { ok: true };
}


// update299: latest remembered price + vendor per product name. Returns a map keyed by
// lower(trim(name)) -> { rate, discount_pct, vendor_name, source, noted_at }.
export async function getRateSuggestions(names) {
  const keys = [...new Set((names || []).map(n => (n || "").trim().toLowerCase()).filter(Boolean))];
  if (!keys.length) return {};
  const { data, error } = await supabase.from("item_rate_memory")
    .select("item_key, rate, discount_pct, vendor_name, source, noted_at").in("item_key", keys);
  if (error) return {};   // memory is advisory — never block the flow on it
  const map = {};
  (data || []).forEach(r => { map[r.item_key] = r; });
  return map;
}


// update303: resolve Price-Master prices for a set of indent items (advisory — any
// failure returns {} and the screen simply behaves as before 302).
export async function getItemPriceMap(items) {
  const ids = [...new Set((items || []).map(i => i.item_id).filter(Boolean).map(Number))];
  if (!ids.length) return {};
  try {
    const res = await Promise.all(ids.map(id => supabase.rpc("fn_item_price", { p_item_id: id })));
    const map = {};
    res.forEach((r, i) => { if (!r.error && r.data?.ok) map[ids[i]] = r.data; });
    return map;
  } catch { return {}; }
}

// update408: PO rate editing with audit, vendor-specific last rate, duplicate
export async function canEditPoRates() { if (isDemo) return false; const { data } = await supabase.rpc("fn_po_can_edit_rates"); return !!data; }
export async function editPoRates(poId, lines, reason) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_po_edit_rates", { p_po_id: poId, p_lines: lines, p_reason: reason || null });
  if (error) return { ok: false, error: /fn_po_edit_rates|schema cache/i.test(error.message) ? "Run pipeskool_po_rate_edit.sql (update 408) first." : error.message.replace(/^.*?ERROR:\s*/i, "") };
  return { ok: true, ...data };
}
export async function lastRateForVendor(vendor, itemId, itemName) {
  if (isDemo || !vendor) return null;
  const { data, error } = await supabase.rpc("fn_last_rate_vendor", { p_vendor: vendor, p_item_id: itemId || null, p_item_name: itemName || null });
  if (error) return null; return (data && data[0]) || null;
}
export async function getPoRateLog(poId) { if (isDemo) return []; const { data } = await supabase.from("po_rate_log").select("*").eq("po_id", poId).order("changed_at", { ascending: false }); return data || []; }
export async function getPoLineIds(poId) { if (isDemo) return []; const { data } = await supabase.from("po_items").select("id, item_id, item_name, spec, qty, unit, rate, list_rate, discount_pct, gst_pct, returned_qty, line_kind").eq("po_id", poId).order("id"); return data || []; }
export async function duplicatePO(poId, issuedBy) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data: h, error } = await supabase.from("purchase_orders").select("id, indent_id, site_id, vendor_name, is_lowest, non_lowest_reason").eq("id", poId).single();
  if (error || !h) return { ok: false, error: error?.message || "PO not found" };
  const lines = await getPoLineIds(poId);
  const live = lines.filter(l => l.line_kind !== "exchanged");
  if (!live.length) return { ok: false, error: "No lines to copy." };
  return createPO({ indent_id: h.indent_id, site_id: h.site_id, vendor_name: h.vendor_name, is_lowest: h.is_lowest, non_lowest_reason: h.non_lowest_reason,
    split_note: "Duplicated from PO " + poId, lines: live.map(l => ({ indent_item_id: null, item_id: l.item_id, item_name: l.item_name, spec: l.spec, qty: Number(l.qty), unit: l.unit, rate: Number(l.rate), list_rate: l.list_rate, discount_pct: l.discount_pct, gst_pct: l.gst_pct })) }, issuedBy);
}

// ===================== update434: per-item delete with audit; close an emptied indent =====================
export async function deleteIndentItem(itemId, reason) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_indent_item_delete", { p_item_id: itemId, p_reason: reason || "" });
  if (error) return { ok: false, error: /fn_indent_item_delete/.test(error.message) ? "Run pipeskool_indent_sync.sql (update 434) first." : error.message };
  return data?.ok ? { ok: true, remaining: data.remaining, indent_no: data.indent_no } : { ok: false, error: data?.error || "Could not delete.", po_no: data?.po_no };
}
export async function closeEmptyIndent(indentId, reason) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_indent_close_empty", { p_indent_id: indentId, p_reason: reason || "" });
  if (error) return { ok: false, error: error.message };
  return data?.ok ? { ok: true } : { ok: false, error: data?.error || "Could not close." };
}
export async function getIndentItemDeletions(indentId) {
  if (isDemo) return [];
  let q = supabase.from("indent_item_deletions").select("id, indent_no, item_name, qty, unit, reason, deleted_by_name, deleted_at").order("deleted_at", { ascending: false }).limit(200);
  if (indentId) q = q.eq("indent_id", indentId);
  const { data } = await q; return data || [];
}
