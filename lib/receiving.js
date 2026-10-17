// update462: SITE MATERIAL DELIVERY & CHALLAN RECEIVING.
// Chain: site indent → PO → office Delivery Challan(s) → site receipt(s) → GRN + stock (existing fn_grn_create).
// Every write goes through ONE database function (fn_dc_receive) that locks the challan, refuses over-receipt
// and double submits, saves the receipt + photos and creates the GRN in the same transaction.
// Nothing in this file reads a rate, value, amount or price.
import { supabase, isDemo } from "./supabase";
import { fileStore } from "./files";
import { GRN_BUCKET } from "./stock";
import { notifyUsers } from "./notify";

const n = v => Number(v || 0);
const SQL_HINT = "Run pipeskool_site_receiving.sql (update 462) in Supabase first.";
const missing = e => /v_dc_line_receipt|v_indent_item_progress|v_dc_receipt_state|dc_receipt|fn_dc_|schema cache|does not exist/i.test(e?.message || "");

// ---- the five quantities per indent line + every challan and receipt for the site ----
export async function getSiteDeliveries(siteId) {
  if (isDemo || !siteId) return { indents: [], challans: [], error: null };
  const sid = Number(siteId);
  const [ind, prog, lines, recs] = await Promise.all([
    supabase.from("material_indents").select("id, indent_no, status, required_by, urgency, created_at, raiser:raised_by(full_name)")
      .eq("site_id", sid).neq("status", "cancelled").order("created_at", { ascending: false }).limit(150),
    supabase.from("v_indent_item_progress").select("indent_item_id, indent_id, item_id, item_name, unit, ordered_qty, po_qty, po_nos, dispatched_qty, received_qty, damaged_qty, pending_delivery_qty, pending_receipt_qty").eq("site_id", sid).limit(5000),
    supabase.from("v_dc_line_receipt").select("dc_item_id, dc_id, dc_ref, dc_date, po_id, vendor_name, dc_status, po_item_id, item_id, item_name, unit, dispatched_qty, good_qty, damaged_qty, received_qty, open_qty, legacy_converted, receipt_count").eq("site_id", sid).neq("dc_status", "cancelled").order("dc_id", { ascending: false }).limit(5000),
    supabase.from("dc_receipts").select("id, rcv_no, dc_id, received_at, remarks, grn_no, status, receiver:received_by(full_name), dc_receipt_items(dc_item_id, item_name, unit, open_before, good_qty, damaged_qty, short_qty, remark), dc_receipt_files(id, kind, path, bucket, name)")
      .eq("site_id", sid).eq("status", "posted").order("received_at", { ascending: false }).limit(1000),
  ]);
  const err = [ind, prog, lines, recs].find(r => r.error)?.error;
  if (err) return { indents: [], challans: [], error: missing(err) ? SQL_HINT : err.message };

  // PO → indent (one PO belongs to one indent; challans hang off the PO)
  const poIds = [...new Set((lines.data || []).map(l => l.po_id).filter(Boolean))];
  const { data: pos } = poIds.length ? await supabase.from("purchase_orders").select("id, po_no, indent_id").in("id", poIds) : { data: [] };
  const poMap = {}; (pos || []).forEach(p => { poMap[p.id] = p; });

  const recByDc = {};
  (recs.data || []).forEach(r => { (recByDc[r.dc_id] = recByDc[r.dc_id] || []).push({
    id: r.id, rcv_no: r.rcv_no, at: r.received_at, by: r.receiver?.full_name || "", remarks: r.remarks || "", grn_no: r.grn_no || "",
    lines: r.dc_receipt_items || [], files: r.dc_receipt_files || [] }); });

  const dcMap = {};
  (lines.data || []).forEach(l => {
    const d = dcMap[l.dc_id] = dcMap[l.dc_id] || { id: l.dc_id, dc_ref: l.dc_ref, date: l.dc_date, vendor: l.vendor_name, po_id: l.po_id,
      po_no: poMap[l.po_id]?.po_no || "", indent_id: poMap[l.po_id]?.indent_id || null, legacy: false, lines: [], receipts: recByDc[l.dc_id] || [] };
    d.legacy = d.legacy || !!l.legacy_converted;
    d.lines.push({ dc_item_id: l.dc_item_id, po_item_id: l.po_item_id, item_id: l.item_id, item_name: l.item_name, unit: l.unit || "",
      dispatched: n(l.dispatched_qty), good: n(l.good_qty), damaged: n(l.damaged_qty), received: n(l.received_qty), open: n(l.open_qty) });
  });
  const challans = Object.values(dcMap).map(d => {
    const disp = d.lines.reduce((t, l) => t + l.dispatched, 0), recv = d.lines.reduce((t, l) => t + l.received, 0), open = d.lines.reduce((t, l) => t + l.open, 0);
    return { ...d, dispatched: disp, received: recv, open, state: open <= 0 ? "received" : recv > 0 ? "partial" : "awaiting" };
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);

  const progBy = {}; (prog.data || []).forEach(p => { (progBy[p.indent_id] = progBy[p.indent_id] || []).push({
    indent_item_id: p.indent_item_id, item_id: p.item_id, item_name: p.item_name, unit: p.unit || "", po_nos: p.po_nos || "",
    ordered: n(p.ordered_qty), dispatched: n(p.dispatched_qty), received: n(p.received_qty), damaged: n(p.damaged_qty),
    pending_delivery: n(p.pending_delivery_qty), pending_receipt: n(p.pending_receipt_qty) }); });
  const indents = (ind.data || []).map(i => {
    const items = progBy[i.id] || [];
    const dcs = challans.filter(c => c.indent_id === i.id);
    const pendRec = items.reduce((t, x) => t + x.pending_receipt, 0), pendDel = items.reduce((t, x) => t + x.pending_delivery, 0);
    const anyRecv = items.some(x => x.received > 0);
    return { id: i.id, indent_no: i.indent_no, status: i.status, date: String(i.created_at || "").slice(0, 10), required_by: i.required_by, urgency: i.urgency,
      raised_by: i.raiser?.full_name || "", items, challans: dcs,
      state: !items.length ? "empty" : pendRec <= 0 && pendDel <= 0 ? "complete" : pendRec > 0 ? "to_receive" : anyRecv ? "partly" : "waiting" };
  });
  const orphan = challans.filter(c => !c.indent_id);   // challans on POs raised without an indent (direct office POs)
  return { indents, challans, orphan, error: null };
}

export async function getChallanForReceive(dcId) {
  if (isDemo || !dcId) return null;
  const { data: l, error } = await supabase.from("v_dc_line_receipt").select("dc_item_id, dc_id, dc_ref, dc_date, site_id, po_id, vendor_name, vendor_dc_no, dc_status, item_id, item_name, unit, dispatched_qty, received_qty, damaged_qty, open_qty").eq("dc_id", Number(dcId));
  if (error) return { error: missing(error) ? SQL_HINT : error.message };
  if (!l?.length) return { error: "Challan not found." };
  const { data: exc } = await supabase.from("dc_receipt_exceptions").select("id, dc_item_id, extra_qty, status, reason").eq("dc_id", Number(dcId)).in("status", ["pending", "approved"]);
  const h = l[0];
  return { id: h.dc_id, dc_ref: h.dc_ref, date: h.dc_date, site_id: h.site_id, po_id: h.po_id, vendor: h.vendor_name, cancelled: h.dc_status === "cancelled",
    lines: l.map(x => ({ dc_item_id: x.dc_item_id, item_id: x.item_id, item_name: x.item_name, unit: x.unit || "", dispatched: n(x.dispatched_qty), received: n(x.received_qty), open: n(x.open_qty),
      approved_extra: (exc || []).filter(e => e.dc_item_id === x.dc_item_id && e.status === "approved").reduce((t, e) => t + n(e.extra_qty), 0),
      pending_request: (exc || []).some(e => e.dc_item_id === x.dc_item_id && e.status === "pending") })) };
}

// photo / PDF straight from the phone camera or gallery → private R2 (same bucket as GRN documents)
export async function uploadReceiptFile(file, siteId, kind = "photo") {
  if (isDemo) return { ok: true, path: "demo.jpg", bucket: GRN_BUCKET, kind, name: file?.name };
  const ext = ((file?.name || "").split(".").pop() || (file?.type === "application/pdf" ? "pdf" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `grn/rcv-s${siteId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await fileStore.from(GRN_BUCKET).upload(path, file, { contentType: file?.type || undefined, upsert: false });
  if (error) return { ok: false, error: "Upload failed: " + error.message };
  return { ok: true, path, bucket: GRN_BUCKET, kind: kind === "doc" ? "doc" : "photo", name: file?.name || "" };
}
export const receiptFileUrl = f => f?.path ? fileStore.from(f.bucket || GRN_BUCKET).getPublicUrl(f.path).data.publicUrl : "";

export function newReceiptToken() {
  try { return crypto.randomUUID(); } catch { return "r" + Date.now() + "-" + Math.random().toString(36).slice(2); }
}

// lines: [{ dc_item_id, good_qty, damaged_qty, remark }] · files: [{ path, bucket, kind, name }]
export async function submitReceipt({ dcId, token, remarks, lines, files }) {
  if (isDemo) return { ok: true, rcv_no: "RCV/DEMO" };
  const { data, error } = await supabase.rpc("fn_dc_receive", { p: { dc_id: Number(dcId), token, remarks: remarks || "",
    lines: (lines || []).map(l => ({ dc_item_id: l.dc_item_id, good_qty: n(l.good_qty), damaged_qty: n(l.damaged_qty), remark: l.remark || "" })),
    files: (files || []).map(f => ({ path: f.path, bucket: f.bucket, kind: f.kind, name: f.name || "" })) } });
  if (error) return { ok: false, error: missing(error) ? SQL_HINT : error.message };
  if (!data?.ok) return { ok: false, error: data?.error || "Could not save the receipt.", code: data?.code, dc_item_id: data?.dc_item_id, open_qty: data?.open_qty };
  if (!data.duplicate && data.dc_created_by) {   // the office person who raised the challan hears about it (best-effort)
    notifyUsers({ userIds: [data.dc_created_by], kind: "dc", requestId: Number(dcId), siteId: data.site_id,
      title: `Received at site: ${data.dc_ref}`, body: `${data.rcv_no}${data.grn_no ? " · " + data.grn_no : ""}`, link: `/go?to=challans&dc=${dcId}` });
  }
  return { ok: true, ...data };
}

// ---- over-receipt exception ----
export async function requestOverReceipt(dcItemId, extraQty, reason) {
  if (isDemo) return { ok: true };
  const { data, error } = await supabase.rpc("fn_dc_exception_request", { p_dc_item_id: Number(dcItemId), p_extra_qty: n(extraQty), p_reason: reason || "" });
  if (error) return { ok: false, error: missing(error) ? SQL_HINT : error.message };
  if (data?.ok) {
    try {
      const { data: dirs } = await supabase.from("app_users").select("id").eq("is_active", true).or("role.eq.director,director_access.eq.true");
      notifyUsers({ userIds: (dirs || []).map(d => d.id), kind: "dc", siteId: data.site_id, title: `Over-receipt approval: ${data.dc_ref}`,
        body: `${data.item_name}: +${n(extraQty)} — ${reason}`, link: `/go?to=challans` });
    } catch {}
  }
  return data || { ok: false, error: "No response." };
}
export async function getPendingExceptions() {
  if (isDemo) return [];
  const { data, error } = await supabase.from("dc_receipt_exceptions")
    .select("id, dc_id, dc_item_id, extra_qty, reason, requested_at, requester:requested_by(full_name), delivery_challans(dc_ref, site_id, sites(name)), delivery_challan_items(item_name, unit, received_qty)")
    .eq("status", "pending").order("requested_at", { ascending: true });
  if (error) return [];
  return (data || []).map(e => ({ id: e.id, dc_id: e.dc_id, dc_ref: e.delivery_challans?.dc_ref || "", site: e.delivery_challans?.sites?.name || "",
    item_name: e.delivery_challan_items?.item_name || "", unit: e.delivery_challan_items?.unit || "", on_challan: n(e.delivery_challan_items?.received_qty),
    extra: n(e.extra_qty), reason: e.reason, at: String(e.requested_at || "").slice(0, 16).replace("T", " "), by: e.requester?.full_name || "" }));
}
export async function decideException(id, approve, note) {
  if (isDemo) return { ok: true };
  const { data, error } = await supabase.rpc("fn_dc_exception_decide", { p_id: Number(id), p_approve: !!approve, p_note: note || "" });
  if (error) return { ok: false, error: missing(error) ? SQL_HINT : error.message };
  if (data?.ok && data.requested_by) notifyUsers({ userIds: [data.requested_by], kind: "dc", title: approve ? "Over-receipt approved" : "Over-receipt rejected", body: note || "", link: "/go?to=deliveries" });
  return data || { ok: false, error: "No response." };
}

// office list: receipt state per challan (awaiting / partial / received)
export async function getReceiptStates(dcIds) {
  const ids = [...new Set((dcIds || []).filter(Boolean))]; const m = {};
  if (isDemo || !ids.length) return m;
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase.from("v_dc_receipt_state").select("dc_id, dispatched_qty, received_qty, open_qty, receipt_count, receipt_status, legacy_converted").in("dc_id", ids.slice(i, i + 300));
    if (error) return m;   // SQL not run yet → the list simply shows no receipt column
    (data || []).forEach(r => { m[r.dc_id] = { state: r.receipt_status, open: n(r.open_qty), received: n(r.received_qty), dispatched: n(r.dispatched_qty), receipts: r.receipt_count || 0, legacy: !!r.legacy_converted }; });
  }
  return m;
}

// a new office challan → the site's supervisors / storekeepers / site engineers hear about it straight away
export async function notifySiteOfChallan({ id, dc_ref, site_id, lines }) {
  if (isDemo || !site_id) return;
  try {
    const { data } = await supabase.from("user_sites").select("user_id, app_users!inner(id, role, is_active)").eq("site_id", Number(site_id));
    const ids = [...new Set((data || []).map(r => r.app_users).filter(u => u && u.is_active && ["supervisor", "site_incharge", "storekeeper", "site_engineer"].includes(String(u.role || "").toLowerCase())).map(u => u.id))];
    if (!ids.length) return;
    const qty = (lines || []).reduce((t, l) => t + n(l.received_qty), 0);
    await notifyUsers({ userIds: ids, kind: "dc", requestId: Number(id), siteId: Number(site_id), title: `Material dispatched: ${dc_ref}`,
      body: `${(lines || []).length} item(s), ${qty} qty — check and receive it in Site Deliveries.`, link: `/go?to=deliveries&dc=${id}` });
  } catch {}
}
