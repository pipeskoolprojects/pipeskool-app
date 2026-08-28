// update215: DELIVERY CHALLAN module — records what arrived against the vendor's own
// challan, matched to an open PO, BEFORE it becomes a GRN. Chain: PO -> DC -> GRN.
import { supabase, isDemo } from "./supabase";
import { recordMultiGRN, PUBLIC_BUCKET } from "./stock";
import { buildDeliveryNoteXml } from "./tally";

// update215b: ALL-SITES approved-PO list for the challan picker. The GRN Register's
// getOpenPOs is deliberately single-site, so calling it here showed nothing — this
// loader applies the same eligibility rules (approved, not cancelled, items pending
// via v_po_item_receipt) across every site, with site name/id on each PO.
export async function getChallanPOs() {
  if (isDemo) return [];
  const { data: pos, error } = await supabase.from("purchase_orders")
    .select("id, po_no, vendor_name, site_id, created_at, status, delivery_status, approval_status, sites(name)")
    .neq("status", "cancelled").order("created_at", { ascending: false }).limit(400);
  if (error || !pos?.length) return [];
  const approved = pos.filter(p => (p.approval_status || "approved") === "approved");
  if (!approved.length) return [];
  const ids = approved.map(p => p.id);
  const { data: items, error: e2 } = await supabase.from("v_po_item_receipt")
    .select("po_item_id, po_id, item_id, item_name, unit, ordered_qty, received_qty, pending_qty, rate").in("po_id", ids);
  return approved.map(p => {
    const its = e2 ? [] : (items || []).filter(i => i.po_id === p.id).map(i => ({
      ...i, ordered_qty: Number(i.ordered_qty), received_qty: Number(i.received_qty), pending_qty: Number(i.pending_qty) }));
    return { id: p.id, po_no: p.po_no, vendor: p.vendor_name, site: p.sites?.name || "", site_id: p.site_id,
      date: p.created_at?.slice(0, 10), delivery_status: p.delivery_status,
      items: its, pending_items: its.filter(i => i.pending_qty > 0).length, item_count: its.length };
  }).filter(p => p.items.length === 0 || p.pending_items > 0 || p.delivery_status !== "delivered");
}

async function me() {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return null;
  const { data: u } = await supabase.from("app_users").select("id").eq("auth_id", data.user.id).maybeSingle();
  return u?.id || null;
}

export async function uploadDcProof(file, siteId) {
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const path = "dc/" + siteId + "-" + Date.now() + "." + ext;
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: true });
  return error ? { error: error.message } : { path };
}
export const dcProofUrl = path => path ? supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl : "";

// header: { site_id, vendor_name, vendor_dc_no, dc_date, po_id, source, confidence, proof_path }
// lines: [{ po_item_id, item_id, item_name, unit, ordered_qty, received_qty }]
export async function createDeliveryChallan(header, lines) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const valid = (lines || []).filter(l => Number(l.received_qty) > 0 && l.item_name);
  if (!valid.length) return { ok: false, error: "Enter a received quantity for at least one item." };
  const mismatch = valid.some(l => Number(l.received_qty) !== Number(l.ordered_qty || 0));
  const status = !header.po_id ? "pending" : mismatch ? "mismatch" : "matched";
  const uid = await me();
  let dc = null, dcRef = "";
  for (let attempt = 0; attempt < 3; attempt++) {   // same collision-proof pattern as indent/GRN numbering
    const { data: no, error: noErr } = await supabase.rpc("fn_next_dc_no", { p_site_id: header.site_id });
    if (noErr) return { ok: false, error: /fn_next_dc_no|schema cache/i.test(noErr.message) ? "Run pipeskool_delivery_challans.sql (update 215) first." : noErr.message };
    dcRef = no || ("DC/" + header.site_id + "/" + Date.now());
    const { data: created, error } = await supabase.from("delivery_challans").insert({
      dc_ref: dcRef, site_id: Number(header.site_id), vendor_name: header.vendor_name || "",
      vendor_dc_no: header.vendor_dc_no || null, dc_date: header.dc_date || new Date().toISOString().slice(0, 10),
      po_id: header.po_id || null, source: header.source || "manual", status,
      confidence: header.confidence || null, proof_path: header.proof_path || null, created_by: uid,
    }).select().single();
    if (!error) { dc = created; break; }
    if (error.code !== "23505" && !/duplicate key/i.test(error.message)) return { ok: false, error: error.message };
    if (attempt === 2) return { ok: false, error: "Could not get a free DC number — try again." };
  }
  const { error: liErr } = await supabase.from("delivery_challan_items").insert(valid.map(l => ({
    dc_id: dc.id, po_item_id: l.po_item_id || null, item_id: l.item_id || null,
    item_name: l.item_name, unit: l.unit || "", ordered_qty: Number(l.ordered_qty || 0), received_qty: Number(l.received_qty),
  })));
  if (liErr) return { ok: false, error: "Header saved but lines failed: " + liErr.message };
  return { ok: true, dc_ref: dcRef, id: dc.id, status };
}

export async function getDeliveryChallans() {
  if (isDemo) return [];
  const { data } = await supabase.from("delivery_challans")
    .select("id, dc_ref, vendor_name, vendor_dc_no, dc_date, source, status, confidence, proof_path, grn_no, created_at, site_id, sites(name, client_name), purchase_orders(po_no), app_users(full_name), delivery_challan_items(item_name, unit, ordered_qty, received_qty, item_id, po_item_id)")
    .order("created_at", { ascending: false }).limit(800);
  return (data || []).map(d => {
    const lines = d.delivery_challan_items || [];
    return {
      id: d.id, dc_ref: d.dc_ref, date: d.dc_date, site: d.sites?.name || "", site_id: d.site_id, client: d.sites?.client_name || null,
      vendor: d.vendor_name, vendor_dc_no: d.vendor_dc_no || "", po_no: d.purchase_orders?.po_no || "", po_id: d.po_id,
      source: d.source, status: d.status, confidence: d.confidence, proof: d.proof_path, grn_no: d.grn_no || "",
      by: d.app_users?.full_name || "", lines,
      recv: lines.reduce((t, l) => t + Number(l.received_qty), 0),
      ord: lines.reduce((t, l) => t + Number(l.ordered_qty), 0),
    };
  });
}

// Convert -> GRN through the SAME atomic RPC the GRN Register uses (zero duplication).
export async function convertDcToGrn(dc) {
  if (dc.grn_no) return { ok: false, error: "Already converted to " + dc.grn_no + "." };
  const res = await recordMultiGRN(
    { site_id: dc.site_id, po_id: dc.po_id || null, vendor: dc.vendor,
      challan_no: dc.vendor_dc_no || dc.dc_ref, challan_date: dc.date,
      note: "From Delivery Challan " + dc.dc_ref },
    dc.lines.map(l => ({ item_id: l.item_id, item_name: l.item_name, unit: l.unit,
      challan_qty: Number(l.received_qty), received_qty: Number(l.received_qty), po_item_id: l.po_item_id || null })),
    {});
  if (!res.ok) return res;
  await supabase.from("delivery_challans").update({ grn_no: res.grn_no }).eq("id", dc.id);
  return { ok: true, grn_no: res.grn_no };
}

// values priced from the PO's rates when linked (same honesty rule as RTV receipts)
export async function priceDcLines(dcs) {
  const poIds = [...new Set(dcs.map(d => d.po_id).filter(Boolean))];
  if (!poIds.length) return {};
  const { data } = await supabase.from("po_items").select("id, rate").in("po_id", poIds);
  const by = {}; (data || []).forEach(r => { by[r.id] = Number(r.rate || 0); });
  return by;   // po_item_id -> rate
}

export function dcTallyXml(dcs, settings) {
  return buildDeliveryNoteXml(dcs, settings);
}
