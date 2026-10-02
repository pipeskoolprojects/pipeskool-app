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
  // update444: only lines still pending on challans (short-closed excluded), fetched in pages — the old single query hit the
  // 1,000-row API cap across 400 POs, so many POs came back with no items and were kept in the picker as if pending.
  const items = []; let e2 = null;
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from("v_po_item_pending_dc")
      .select("po_item_id, po_id, item_id, item_name, unit, ordered_qty, received_qty, dc_qty, pending_qty, rate, line_status")
      .in("po_id", ids).gt("pending_qty", 0).neq("line_status", "short_closed").order("po_item_id").range(from, from + 999);
    if (error) { e2 = error; break; }
    items.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  if (e2) return [];
  return approved.map(p => {
    const its = items.filter(i => i.po_id === p.id).map(i => ({ ...i, ordered_qty: Number(i.ordered_qty), received_qty: Number(i.received_qty), on_dc_qty: Number(i.dc_qty), pending_qty: Number(i.pending_qty), remaining_qty: Number(i.pending_qty), line_status: i.line_status }));
    return { id: p.id, po_no: p.po_no, vendor: p.vendor_name, site: p.sites?.name || "", site_id: p.site_id,
      date: p.created_at?.slice(0, 10), delivery_status: p.delivery_status,
      items: its, pending_items: its.length, item_count: its.length };
  }).filter(p => p.pending_items > 0);   // update444: a PO with nothing pending on challans never appears
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
  // update271: re-check remaining AT SAVE TIME against GRNs + unconverted DCs — two people with
  // the page open (or a stale tab) can no longer challan the same material twice.
  if (header.po_id) {
    const { data: cur } = await supabase.from("v_po_item_pending_dc").select("po_item_id, item_name, unit, pending_qty").eq("po_id", header.po_id);   // update441
    const pend = {}; (cur || []).forEach(r => { pend[r.po_item_id] = { qty: Number(r.pending_qty), name: r.item_name, unit: r.unit || "" }; });
    for (const l of valid) {
      if (!l.po_item_id || !pend[l.po_item_id]) continue;   // free-typed lines stay allowed, as before
      const rem = Math.max(0, pend[l.po_item_id].qty);
      if (Number(l.received_qty) > rem + 1e-9) {
        return { ok: false, error: rem <= 0
          ? `${pend[l.po_item_id].name}: already fully covered by earlier challans — nothing pending on this line.`
          : `${pend[l.po_item_id].name}: only ${rem} ${pend[l.po_item_id].unit} is pending (ordered − earlier challans). Over-receipt is blocked; use Exchange/return for excess.` };
      }
    }
  }
  const mismatch = valid.some(l => Number(l.received_qty) !== Number(l.ordered_qty || 0));
  const status = !header.po_id ? "pending" : mismatch ? "partial" : "matched";   // update441: a shipment smaller than pending is a PARTIAL delivery, not a mismatch
  const uid = await me();
  let dc = null, dcRef = "";
  const manualRef = String(header.dc_ref || "").trim();   // update393: typed DC number wins over the series
  for (let attempt = 0; attempt < 3; attempt++) {   // same collision-proof pattern as indent/GRN numbering
    if (manualRef) dcRef = manualRef;
    else {
      const { data: no, error: noErr } = await supabase.rpc("fn_next_dc_no", { p_site_id: header.site_id });
      if (noErr) return { ok: false, error: /fn_next_dc_no|schema cache/i.test(noErr.message) ? "Run pipeskool_delivery_challans.sql (update 215) first." : noErr.message };
      dcRef = no || ("DC/" + header.site_id + "/" + Date.now());
    }
    const { data: created, error } = await supabase.from("delivery_challans").insert({
      dc_ref: dcRef, site_id: Number(header.site_id), vendor_name: header.vendor_name || "",
      vendor_dc_no: header.vendor_dc_no || null, dc_date: header.dc_date || new Date().toISOString().slice(0, 10),
      po_id: header.po_id || null, source: header.source || "manual", status,
      confidence: header.confidence || null, proof_path: header.proof_path || null, created_by: uid,
      client_id: header.client_id ? Number(header.client_id) : null,   // update393
    }).select().single();
    if (!error) { dc = created; break; }
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      if (manualRef) return { ok: false, error: `DC number ${manualRef} already exists — use another number or leave blank for the next series number.` };
    } else return { ok: false, error: /client_id|schema cache/i.test(error.message) ? "Run pipeskool_clients.sql (update 393) first." : error.message };
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
  const { data, error } = await supabase.from("delivery_challans")
    .select("id, dc_ref, vendor_name, vendor_dc_no, dc_date, source, status, confidence, proof_path, grn_no, created_at, site_id, cancel_reason, posted_to_tally, posted_at, poster:posted_by(full_name), canceller:cancelled_by(full_name), sites(name, client_name), clients(id, name, company_name, gstin, bill_line1, bill_line2, bill_city, bill_state, bill_state_code, bill_pincode, ship_same, ship_line1, ship_line2, ship_city, ship_state, ship_state_code, ship_pincode, contact_name, mobile), purchase_orders(po_no), creator:created_by(full_name), delivery_challan_items(item_name, unit, ordered_qty, received_qty, item_id, po_item_id)")
    .order("created_at", { ascending: false }).limit(800);
  if (error) {   // update272b: NEVER a silent empty list — a missing column reads as "all challans gone"
    if (/clients|client_id/i.test(error.message))
      throw new Error("Run pipeskool_clients.sql (update 393) in Supabase first — the challan list needs the client link.");
    if (/posted_to_tally|posted_by/i.test(error.message))
      throw new Error("Run pipeskool_dc_tally.sql (update 435) in Supabase first — the challan list needs the Tally-status columns.");
    if (/cancel_reason|cancelled_by|schema cache/i.test(error.message))
      throw new Error("Run pipeskool_dc_cancel.sql (update 272) in Supabase first — the challan list needs its new columns.");
    throw new Error("Could not load delivery challans: " + error.message);
  }
  // update453: latest "sent to supervisor" record per challan (best-effort — the list never fails on it)
  const lastSend = {};
  try {
    const { data: sl } = await supabase.from("dc_send_log").select("challan_id, recipients, lang, channel, sent_at, sent_by_name").in("challan_id", (data || []).map(d => d.id)).order("sent_at", { ascending: false });
    (sl || []).forEach(r => { if (!lastSend[r.challan_id]) lastSend[r.challan_id] = r; });
  } catch {}
  return (data || []).map(d => {
    const lines = d.delivery_challan_items || [];
    const snd = lastSend[d.id];
    return {
      sent: snd ? { to: (snd.recipients || []).map(x => x.name).join(", "), at: String(snd.sent_at).slice(0, 16).replace("T", " "), lang: snd.lang, channel: snd.channel, by: snd.sent_by_name } : null,   // update453
      id: d.id, dc_ref: d.dc_ref, date: d.dc_date, site: d.sites?.name || "", site_id: d.site_id, client: d.clients?.name || d.sites?.client_name || null, client_id: d.client_id || d.clients?.id || null, clientRow: d.clients || null,   // update393
      vendor: d.vendor_name, vendor_dc_no: d.vendor_dc_no || "", po_no: d.purchase_orders?.po_no || "", po_id: d.po_id,
      source: d.source, status: d.status, confidence: d.confidence, proof: d.proof_path, grn_no: d.grn_no || "",
      by: d.creator?.full_name || "", lines,   // update272c: named embed — cancelled_by added a 2nd FK to app_users
      cancel_reason: d.cancel_reason || "", cancelled_by: d.canceller?.full_name || "",   // update272
      posted: !!d.posted_to_tally, posted_at: d.posted_at ? String(d.posted_at).slice(0, 16).replace("T", " ") : "", posted_by: d.poster?.full_name || "",   // update435
      recv: lines.reduce((t, l) => t + Number(l.received_qty), 0),
      ord: lines.reduce((t, l) => t + Number(l.ordered_qty), 0),
    };
  });
}

// update453: who should receive a challan's "count before GRN" message — the Supervisors / Site Incharges
// allotted to that site, plus the other staff on the site (unticked) so the sender can add them.
export async function getSiteRecipients(siteId) {
  if (isDemo || !siteId) return { supervisors: [], others: [] };
  const { data } = await supabase.from("user_sites").select("user_id, app_users!inner(id, full_name, mobile, role, is_active, preferred_lang)").eq("site_id", Number(siteId));
  const people = (data || []).map(r => r.app_users).filter(u => u && u.is_active && u.mobile);
  const isSup = u => ["supervisor", "site_incharge"].includes(String(u.role || "").toLowerCase());
  return { supervisors: people.filter(isSup), others: people.filter(u => !isSup(u)) };
}
export async function getAllStaffForSend() {
  if (isDemo) return [];
  const { data } = await supabase.from("app_users").select("id, full_name, mobile, role, preferred_lang").eq("is_active", true).not("mobile", "is", null).order("full_name");
  return data || [];
}
export async function logDcSend(challanId, recipients, lang, channel, message) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_dc_send_log", { p_challan_id: Number(challanId), p_recipients: recipients, p_lang: lang, p_channel: channel, p_message: message });
  if (error) return { ok: false, error: /fn_dc_send_log|schema cache|Could not find/i.test(error.message) ? "Run pipeskool_dc_send.sql (update 453) in Supabase first." : error.message };
  return data?.ok ? { ok: true, sent_at: data.sent_at } : { ok: false, error: data?.error || "Could not record the send." };
}

// update393: edit an unconverted, uncancelled challan header — DC No. (manual, unique), date, client, vendor ref.
export async function editDeliveryChallan(dcId, { dc_ref, dc_date, client_id, vendor_dc_no }) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.rpc("fn_edit_dc", { p_dc_id: dcId, p_dc_ref: dc_ref, p_dc_date: dc_date || null,
    p_client_id: client_id ? Number(client_id) : null, p_vendor_dc_no: vendor_dc_no || null });
  return error ? { ok: false, error: /fn_edit_dc|schema cache/i.test(error.message) ? "Run pipeskool_clients.sql (update 393) first." : error.message } : { ok: true };
}

// update272: cancel an UNCONVERTED challan (reason mandatory; DB enforces who may).
export async function cancelDeliveryChallan(dcId, reason) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_cancel_dc", { p_dc_id: dcId, p_reason: reason || "" });
  if (error) return { ok: false, error: /fn_cancel_dc|schema cache/i.test(error.message) ? "Run pipeskool_dc_cancel.sql (update 272) first." : error.message };
  return data || { ok: false, error: "No response from server." };
}

// Convert -> GRN through the SAME atomic RPC the GRN Register uses (zero duplication).
export async function convertDcToGrn(dc) {
  if (dc.status === "cancelled") return { ok: false, error: dc.dc_ref + " is cancelled — it cannot be converted to a GRN." };   // update272
  if (dc.grn_no) return { ok: false, error: "Already converted to " + dc.grn_no + "." };
  const res = await recordMultiGRN(
    { site_id: dc.site_id, po_id: dc.po_id || null, vendor: dc.vendor,
      challan_no: dc.vendor_dc_no || dc.dc_ref, challan_date: dc.date,
      note: "From Delivery Challan " + dc.dc_ref },
    await (async () => { const ids = dc.lines.map(l => l.po_item_id).filter(Boolean); const { data } = ids.length ? await supabase.from("po_items").select("id, rate").in("id", ids) : { data: [] }; const by = {}; (data || []).forEach(r => { by[r.id] = Number(r.rate || 0); });   // update442: PO net rate travels with each line
      return dc.lines.map(l => ({ item_id: l.item_id, item_name: l.item_name, unit: l.unit, rate: l.po_item_id ? (by[l.po_item_id] || 0) : 0,
        challan_qty: Number(l.received_qty), received_qty: Number(l.received_qty), po_item_id: l.po_item_id || null })); })(),
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

// update435: manual Tally posting status (single or bulk); every flip is logged with who/when
export async function setChallanPosted(ids, posted, note) {
  const { data, error } = await supabase.rpc("fn_dc_set_posted", { p_ids: (Array.isArray(ids) ? ids : [ids]).map(Number), p_posted: !!posted, p_note: note || null });
  if (error) return { ok: false, error: /fn_dc_set_posted/.test(error.message) ? "Run pipeskool_dc_tally.sql (update 435) first." : error.message };
  return data?.ok ? { ok: true, changed: data.changed } : { ok: false, error: data?.error || "Could not update." };
}

// update441: challan history for a PO (every DC, date, items, qty, GRN state)
export async function getPoChallanHistory(poId) { const { data } = await supabase.rpc("fn_po_challan_history", { p_po_id: Number(poId) }); return Array.isArray(data) ? data : []; }
export async function getPoDcPending(poIds) { if (!poIds?.length) return {}; const { data } = await supabase.from("v_po_dc_pending").select("*").in("po_id", poIds); const m = {}; (data || []).forEach(r => { m[r.po_id] = r; }); return m; }
