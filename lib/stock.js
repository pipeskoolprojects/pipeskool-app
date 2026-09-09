"use client";
import { supabase, isDemo } from "./supabase";
import { notifyRequest } from "./notify";
import { getWorkers as _getWorkers } from "./data";
import { scoped } from "./scope";

export const ITEM_TYPES = ["Pipe", "Fitting", "Valve", "Fixture", "Consumable", "Pump", "Tank"];

// update163: types come from the item_types master; the const above is the
// deploy-window fallback only.
export async function getItemTypes() {
  if (isDemo) return ITEM_TYPES;
  const { data, error } = await supabase.from("item_types")
    .select("label").eq("is_active", true).order("label");
  if (error || !data || !data.length) return ITEM_TYPES;
  return data.map(x => x.label);
}

export async function addItemType(label) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const clean = String(label || "").trim();
  if (!clean) return { ok: false, error: "Type the material type name." };
  const { error } = await supabase.from("item_types").insert({ label: clean });
  if (error && /duplicate|unique/i.test(error.message || "")) return { ok: true, label: clean };
  return error ? { ok: false, error: error.message } : { ok: true, label: clean };
}

// ---------- demo data ----------
const demoItems = [
  { id: 1, display_name: "Pipe - CPVC 25mm (SDR 11) [Astral]", item_type: "Pipe", material: "CPVC", unit: "Rmt", min_stock: 200 },
  { id: 2, display_name: "Pipe - UPVC 110mm (SWR) [Dutron]", item_type: "Pipe", material: "UPVC", unit: "Rmt", min_stock: 300 },
  { id: 3, display_name: "Pipe - MS 350NB (Heavy)", item_type: "Pipe", material: "MS", unit: "Rmt", min_stock: 100 },
  { id: 4, display_name: "Pipe - MS 200NB (Heavy)", item_type: "Pipe", material: "MS", unit: "Rmt", min_stock: 150 },
  { id: 5, display_name: "Pipe - HDPE 160mm (PE-80) [Dutron]", item_type: "Pipe", material: "HDPE", unit: "Rmt", min_stock: 200 },
  { id: 6, display_name: "Fitting - CPVC Elbow 25mm [Astral]", item_type: "Fitting", material: "CPVC", unit: "Nos", min_stock: 100 },
  { id: 7, display_name: "Valve - Brass Gate valve 50mm (PN16) [Zoloto]", item_type: "Valve", material: "Brass", unit: "Nos", min_stock: 20 },
];

const demoBalance = [
  { item_id: 3, display_name: "Pipe - MS 350NB (Heavy)", item_type: "Pipe", unit: "Rmt", min_stock: 100, site_code: "KEI", site_name: "KEI Sanand", received: 600, issued: 512, returned: 0, consumed: 0, balance: 88, rate: 1850, value: 162800, last: "2026-06-12" },
  { item_id: 4, display_name: "Pipe - MS 200NB (Heavy)", item_type: "Pipe", unit: "Rmt", min_stock: 150, site_code: "KEI", site_name: "KEI Sanand", received: 400, issued: 318, returned: 0, consumed: 0, balance: 82, rate: 1120, value: 91840, last: "2026-06-11" },
  { item_id: 2, display_name: "Pipe - UPVC 110mm (SWR) [Dutron]", item_type: "Pipe", unit: "Rmt", min_stock: 300, site_code: "SOUL", site_name: "SOUL Campus", received: 2000, issued: 0, returned: 0, consumed: 1685, balance: 315, rate: 410, value: 129150, last: "2026-06-12" },
  { item_id: 6, display_name: "Fitting - CPVC Elbow 25mm [Astral]", item_type: "Fitting", unit: "Nos", min_stock: 100, site_code: "SOUL", site_name: "SOUL Campus", received: 800, issued: 0, returned: 0, consumed: 745, balance: 55, rate: 38, value: 2090, last: "2026-06-12" },
  { item_id: 5, display_name: "Pipe - HDPE 160mm (PE-80) [Dutron]", item_type: "Pipe", unit: "Rmt", min_stock: 200, site_code: "CREEK", site_name: "The Creek", received: 500, issued: 0, returned: 0, consumed: 372, balance: 128, rate: 620, value: 79360, last: "2026-06-11" },
  { item_id: 7, display_name: "Valve - Brass Gate valve 50mm (PN16) [Zoloto]", item_type: "Valve", unit: "Nos", min_stock: 20, site_code: "KEI", site_name: "KEI Sanand", received: 40, issued: 6, returned: 0, consumed: 0, balance: 34, rate: 720, value: 24480, last: "2026-05-28" },
];

const demoBoqNorm = [
  { item: "Pipe - UPVC 110mm SWR", site: "SOUL", boqQty: 2400, consumed: 1685, workPct: 70, unit: "Rmt" },
  { item: "Pipe - MS 350NB Heavy", site: "KEI", boqQty: 850, consumed: 512, workPct: 60, unit: "Rmt" },
  { item: "Pipe - CPVC 25mm", site: "SOUL", boqQty: 1800, consumed: 1620, workPct: 55, unit: "Rmt" },
  { item: "Pipe - HDPE 160mm", site: "CREEK", boqQty: 1100, consumed: 372, workPct: 34, unit: "Rmt" },
];

let demoRequests = [
  { id: 1, site: "KEI Sanand", item: "Pipe - MS 350NB (Heavy)", qty: 300, required_by: "2026-06-18", urgency: "urgent", status: "open" },
  { id: 2, site: "SOUL Campus", item: "Fitting - CPVC Elbow 25mm", qty: 200, required_by: "2026-06-20", urgency: "normal", status: "open" },
];

// ---------- item master ----------
// update166: SMART SEARCH — case-insensitive, multi-keyword, any order, any
// field, partial words. "pvc 25" finds "Pipe - CPVC 25mm"; "sch40" = "sch 40";
// "swr" finds every SWR item. Every material-selection box in the app uses this.
export function searchTokens(q) {
  return String(q || "").toLowerCase()
    .replace(/([a-z])([0-9])/g, "$1 $2").replace(/([0-9])([a-z])/g, "$1 $2")  // sch40 -> sch 40, 110mm -> 110 mm
    .split(/[^a-z0-9]+/).filter(Boolean).slice(0, 6);
}

const SEARCH_FIELDS = ["display_name", "item_type", "material", "sub_type", "size", "item_class", "make", "hsn_code"];
const tokenOr = t => SEARCH_FIELDS.map(f => f + ".ilike.%" + t + "%").join(",");

function rankItems(rows, tokens) {
  const joined = tokens.join(" ");
  const score = r => {
    const n = String(r.display_name || "").toLowerCase();
    let sc = n.includes(joined) ? 5 : 0;
    tokens.forEach(t => {
      const i = n.indexOf(t);
      if (i === 0) sc += 3;
      else if (i > 0 && /[^a-z0-9]/.test(n[i - 1])) sc += 2;   // token starts a word
      else if (i > 0) sc += 1;
    });
    return sc;
  };
  return rows.map(r => [score(r), r]).sort((a, b) => b[0] - a[0]
    || String(a[1].display_name).localeCompare(String(b[1].display_name))).map(x => x[1]);
}

export async function searchItems(q) {
  const tokens = searchTokens(q);
  if (isDemo) return demoItems.filter(i => tokens.every(t => i.display_name.toLowerCase().includes(t)));
  const build = withPending => {
    let query = supabase.from("item_master").select("id, display_name, item_type, material, unit, min_stock")
      .eq("is_active", true).limit(60);
    if (withPending) query = query.or("pending_review.is.null,pending_review.eq.false");   // pending hidden until approved
    tokens.forEach(t => { query = query.or(tokenOr(t)); });   // AND of per-token any-field matches
    return query;
  };
  let { data, error } = await build(true);
  if (error && /pending_review/i.test(error.message || "")) {
    ({ data, error } = await build(false));   // deploy window: column not visible yet
  }
  if (error || !data) return [];
  return tokens.length ? rankItems(data, tokens) : data;
}

// Full catalogue for the Item Master page (includes inactive rows)
// Supabase caps every query at 1000 rows — the master crossed that in Jul-2026,
// which made Pipes/Valves (alphabetically after "Fitting - …") silently disappear
// from the page. Fetch in pages of 1000 until a short page comes back.
export async function getAllItems() {
  if (isDemo) return demoItems.map(i => ({ ...i, is_active: true }));
  const PAGE = 1000;
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await supabase.from("item_master")
      .select("id, display_name, item_type, material, sub_type, size, item_class, make, unit, hsn_code, min_stock, is_active, pending_review")
      .order("display_name")
      .range(from, from + PAGE - 1);
    if (error) {
      if (/pending_review|schema cache|column/i.test(error.message || "")) {
        // update161: API cache lag — retry with guaranteed columns instead of failing
        const { data: d2, error: e2 } = await supabase.from("item_master")
          .select("id, display_name, item_type, material, unit, hsn_code, min_stock, is_active")
          .order("display_name").range(from, from + PAGE - 1);
        if (!e2) {
          all = all.concat(d2 || []);
          if ((d2 || []).length < PAGE) return { rows: all };
          from += PAGE; continue;
        }
      }
      return { rows: all, error: error.message };   // update161: surfaced, never silent
    }
    const batch = data || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  // update304/319: attach current Price-Master pricing (advisory — absent view = no columns filled).
  // v319: the view has grown past the API's 1,000-row-per-request cap, so read it in PAGES —
  // a single unpaged select silently dropped every row past 1,000 (newest categories vanished).
  try {
    const pv = [];
    let cols = "item_id, list_price_pcs, discount_pct, net_pcs, per_mtr, overridden";
    for (let from = 0; ; from += 1000) {
      let { data: chunk, error } = await supabase.from("v_item_current_price")
        .select(cols).order("item_id").range(from, from + 999);
      if (error && /overridden|schema cache|column/i.test(error.message || "") && cols.includes("overridden")) {
        // update326: view not yet upgraded (325 SQL pending / cache lag) — degrade, never blank
        cols = "item_id, list_price_pcs, discount_pct, net_pcs, per_mtr";
        ({ data: chunk, error } = await supabase.from("v_item_current_price").select(cols).order("item_id").range(from, from + 999));
      }
      if (error || !chunk) break;
      pv.push(...chunk);
      if (chunk.length < 1000) break;
    }
    if (pv && pv.length) {
      const pm = {}; pv.forEach(x => { pm[x.item_id] = x; });
      all.forEach(r => { const x = pm[r.id]; if (x) { r.rate = Number(x.list_price_pcs); r.disc_pct = Number(x.discount_pct); r.net_rate = Number(x.net_pcs); r.per_mtr = x.per_mtr != null ? Number(x.per_mtr) : null; r.overridden = !!x.overridden; } });   // update325
    }
  } catch {}
  return { rows: all };
}

// Edit an item's building blocks — display_name recomposes automatically (generated column)
export async function updateItem(id, f) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const row = {
    item_type: String(f.item_type || "").trim() || "GENERAL",
    material: String(f.material || "").trim(),
    sub_type: String(f.sub_type || "").trim() || null,
    size: String(f.size || "").trim() || null,
    item_class: String(f.item_class || "").trim() || null,
    make: String(f.make || "").trim() || null,
    unit: String(f.unit || "").trim() || "Nos",
    hsn_code: String(f.hsn_code || "").trim() || null,
    min_stock: Number(f.min_stock) || 0,
    is_active: f.is_active !== false,
  };
  if (!row.material) return { ok: false, error: "Material / name is required." };
  const { error } = await supabase.from("item_master").update(row).eq("id", id);
  if (!error) return { ok: true };
  if (/duplicate|unique/i.test(error.message))
    return { ok: false, error: "An identical item already exists (same type/material/size/class/make). Edit that one instead." };
  return { ok: false, error: error.message };
}

// update188: pending quick-added items, for the director approvals inbox
export async function listPendingItems() {
  if (isDemo) return [];
  const { data, error } = await supabase.from("item_master")
    .select("id, display_name, item_type, unit").eq("pending_review", true).order("id");
  return error ? [] : (data || []);
}
// update238: item review now goes through fn_approve_item (SECURITY DEFINER) so the
// permission check happens in the database, not just in the page that renders the button.
export async function rejectPendingItem(id) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_approve_item", { p_id: id, p_action: "reject" });
  if (error) return { ok: false, error: error.message };
  return data?.ok ? { ok: true } : { ok: false, error: data?.error || "Could not reject this item." };
}

// update150: approve a pending quick-added item into the master
export async function approveItem(id) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_approve_item", { p_id: id, p_action: "approve" });
  if (error) return { ok: false, error: error.message };
  return data?.ok ? { ok: true } : { ok: false, error: data?.error || "Could not approve this item." };
}

export async function toggleItemActive(id, active) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("item_master").update({ is_active: !!active }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Hard delete — only possible when the item has never been used (FK-protected).
export async function deleteItem(id) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("item_master").delete().eq("id", id);
  if (!error) return { ok: true };
  if (String(error.code) === "23503" || /foreign key/i.test(error.message))
    return { ok: false, error: "This item appears in indents, GRNs or stock records. History must be preserved — deactivate instead." };
  return { ok: false, error: error.message };
}

export async function addItem(payload) {
  if (isDemo) {
    const name = `${payload.item_type} - ${payload.material}${payload.sub_type ? " " + payload.sub_type : ""}${payload.size ? " " + payload.size : ""}${payload.item_class ? " (" + payload.item_class + ")" : ""}${payload.make ? " [" + payload.make + "]" : ""}`;
    demoItems.push({ id: Date.now(), display_name: name, item_type: payload.item_type, material: payload.material, unit: payload.unit, min_stock: Number(payload.min_stock || 0) });
    return { ok: true, name };
  }
  const { data, error } = await supabase.from("item_master").insert(payload).select("display_name").single();
  return error ? { ok: false, error: error.message } : { ok: true, name: data.display_name };
}

// ---------- transactions ----------
export async function recordTxn(payload) {
  if (isDemo) return { ok: true };
  let photoUrl = null;
  if (payload.challanFile) {
    const path = `challan/${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("attendance-photos").upload(path, payload.challanFile);
    if (!upErr) photoUrl = path;
  }
  const { challanFile, ...rest } = payload;
  const { error } = await supabase.from("stock_txns").insert({ ...rest, challan_photo_url: photoUrl });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function logConsumption(payload) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("stock_consumption").insert(payload);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function raiseRequest(payload) {
  if (isDemo) {
    demoRequests = [{ id: Date.now(), site: "KEI Sanand", item: payload.item_name, qty: payload.qty,
      required_by: payload.required_by, urgency: payload.urgency, status: "open" }, ...demoRequests];
    return { ok: true };
  }
  const { error } = await supabase.from("material_requests").insert({
    site_id: payload.site_id, item_id: payload.item_id, qty: payload.qty,
    required_by: payload.required_by, purpose: payload.purpose, urgency: payload.urgency,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getRequests() {
  if (isDemo) return demoRequests;
  const { data } = await supabase.from("material_requests")
    .select("id, qty, required_by, urgency, status, sites(name), item_master(display_name)")
    .eq("status", "open").order("created_at");
  return (data || []).map(r => ({ id: r.id, site: r.sites?.name, item: r.item_master?.display_name,
    qty: Number(r.qty), required_by: r.required_by, urgency: r.urgency, status: r.status }));
}

// ---------- balances & analytics ----------
export async function getBalances(siteCode) {
  if (isDemo) return siteCode && siteCode !== "all" ? demoBalance.filter(b => b.site_code === siteCode) : demoBalance;
  let q = supabase.from("v_stock_balance").select("*");
  const { data } = await q;
  let rows = (data || []).map(r => ({
    item_id: r.item_id, display_name: r.display_name, item_type: r.item_type, unit: r.unit,
    min_stock: Number(r.min_stock), site_code: r.site_code, site_name: r.site_name,
    received: Number(r.received), issued: Number(r.issued), returned: Number(r.returned), returned_vendor: Number(r.returned_vendor || 0),
    consumed: Number(r.consumed), balance: Number(r.balance), with_site: Number(r.with_site || 0), rate: Number(r.rate),
    value: Number(r.value), last: r.last_activity,
  }));
  if (siteCode && siteCode !== "all") rows = rows.filter(r => r.site_code === siteCode);
  return rows;
}

export async function getBoqNorms() {
  if (isDemo) return demoBoqNorm;
  // update143: the demo rows above were leaking into production ("test data"
  // the user rightly flagged). Real consumption-vs-norm needs the BOQ→item
  // mapping (parked with the Client Receivables work) — until then, honest empty.
  return [];
}

export function deadStock(balances, daysIdle = 21) {
  const cutoff = new Date(Date.now() - daysIdle * 864e5).toISOString().slice(0, 10);
  return balances.filter(b => b.balance > 0 && b.last && b.last < cutoff);
}

export function lowStock(balances) {
  return balances.filter(b => b.balance <= b.min_stock && b.min_stock > 0);
}

// ---------- BULK IMPORT (items + opening stock) ----------
// rows: [{ item_type, material, size, item_class, make, unit, min_stock, opening_qty, rate, supplier }]
// Creates the item if needed, then records an opening GRN for opening_qty.
export async function bulkImport(rows, siteId, doneBy) {
  let created = 0, received = 0, errors = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.item_type || !r.material) { errors.push(`Row ${i + 2}: item type & material required`); continue; }
    // create the item
    const itemRes = await addItem({
      item_type: r.item_type, material: r.material, sub_type: r.sub_type || null,
      size: r.size || null, item_class: r.item_class || null, make: r.make || null,
      unit: r.unit || "Nos", min_stock: Number(r.min_stock || 0),
    });
    if (!itemRes.ok) { errors.push(`Row ${i + 2}: ${itemRes.error}`); continue; }
    created++;
    // opening stock as a GRN
    const qty = Number(r.opening_qty || 0);
    if (qty > 0 && !isDemo) {
      // need the new item's id
      const { data: it } = await supabase.from("item_master")
        .select("id").eq("display_name", itemRes.name).order("id", { ascending: false }).limit(1).maybeSingle();
      if (it) {
        const { error } = await supabase.from("stock_txns").insert({
          site_id: siteId, item_id: it.id, txn_type: "grn", qty,
          rate: Number(r.rate || 0), supplier: r.supplier || "Opening stock", done_by: doneBy,
        });
        if (error) errors.push(`Row ${i + 2}: stock - ${error.message}`); else received++;
      }
    } else if (qty > 0) received++;
  }
  return { ok: errors.length === 0, created, received, errors };
}

export const BULK_TEMPLATE_HEADERS = ["item_type", "material", "size", "item_class", "make", "unit", "min_stock", "opening_qty", "rate", "supplier"];

// ---------- MULTI-ITEM GRN (one challan, many lines, with discrepancy) ----------
// header: { site_id, vendor, challan_no, challan_date, done_by }
// lines: [{ item_id, item_name, challan_qty, received_qty, rate }]
// update185: GRN via SECURITY DEFINER RPC fn_grn_create (atomic: header + lines + issues +
// material changes + docs + PO delivery + audit). Challan pages go to the PRIVATE bucket
// 'grn-docs' (fallback: public bucket if the SQL wasn't run). If the RPC itself is missing
// (pipeskool_grn_po_link.sql not run yet) we fall back to the pre-185 client-side path.
export const GRN_BUCKET = "grn-docs";
export const PUBLIC_BUCKET = "attendance-photos";

async function uploadGrnDocs(tag, docs) {
  const rows = [];
  for (const kind of ["supplier", "company"]) {
    for (const f of (docs?.[kind] || [])) {
      const ext = (f.name?.split(".").pop() || "jpg").toLowerCase();
      const path = "grn/" + tag + "-" + kind + "-" + rows.length + "-" + Date.now().toString().slice(-5) + "." + ext;
      let bucket = GRN_BUCKET;
      let { error: upErr } = await supabase.storage.from(GRN_BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: true });
      if (upErr) {   // private bucket missing / no policy -> public fallback (never lose the page)
        bucket = PUBLIC_BUCKET;
        ({ error: upErr } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: true }));
        if (upErr) return { error: "Challan upload failed: " + upErr.message };
      }
      rows.push({ kind, path, bucket });
    }
  }
  return { rows };
}

export async function recordMultiGRN(header, lines, docs) {
  if (isDemo) return { ok: true, grn_no: "GRN/DEMO" };
  const tag = "s" + header.site_id + "-" + Date.now().toString().slice(-6);
  const up = await uploadGrnDocs(tag, docs);
  if (up.error) return { ok: false, error: up.error };
  const payload = {
    site_id: header.site_id, po_id: header.po_id || null, vendor: header.vendor || null,
    challan_no: header.challan_no || null, our_challan_no: header.our_challan_no || null,
    challan_date: header.challan_date || null, note: header.note || null,
    lines: lines.map(l => ({ item_id: l.item_id, item_name: l.item_name, unit: l.unit,
      challan_qty: Number(l.challan_qty ?? l.received_qty ?? 0), received_qty: Number(l.received_qty ?? l.challan_qty ?? 0),
      po_item_id: l.po_item_id || null,
      change: l.change && l.change.received_item_id ? { received_item_id: l.change.received_item_id, received_name: l.change.received_name || null, reason: l.change.reason || null } : null })),
    docs: up.rows,
  };
  const { data, error } = await supabase.rpc("fn_grn_create", { p: payload });
  if (error) {
    // 42883 / PGRST202 = function not there yet -> legacy path (docs already uploaded; re-use them)
    if (/fn_grn_create|function|schema cache/i.test(error.message)) {
      const r = await recordMultiGRNLegacy(header, lines, null);
      if (r.ok && up.rows.length) {
        await supabase.from("grn_docs").insert(up.rows.map(d => ({ grn_ref: r.grn_no, site_id: header.site_id, kind: d.kind, path: d.path, uploaded_by: header.done_by || null })));
      }
      return r.ok ? { ...r, warn: (r.warn ? r.warn + " · " : "") + "Saved via old path — run pipeskool_grn_po_link.sql for PO-linked GRNs." } : r;
    }
    return { ok: false, error: error.message };
  }
  if (data && data.ok === false) return { ok: false, error: data.error };
  return { ok: true, grn_no: data.grn_no, discrepancies: data.discrepancies || 0, over_receipt: data.over_receipt || 0, changes: data.changes || 0 };
}

async function recordMultiGRNLegacy(header, lines, docs) {
  if (isDemo) return { ok: true, grn_no: "GRN/DEMO" };
  const grnNo = "GRN/" + header.site_id + "/" + Date.now().toString().slice(-6);
  // update176: docs = { supplier: File[], company: File[] } — challan pages (photos/PDF)
  const docRows = [];
  for (const kind of ["supplier", "company"]) {
    for (const f of (docs?.[kind] || [])) {
      const ext = (f.name?.split(".").pop() || "jpg").toLowerCase();
      const path = "grn/" + grnNo.replace(/\//g, "-") + "-" + kind + "-" + docRows.length + "." + ext;
      const { error: upErr } = await supabase.storage.from("attendance-photos")
        .upload(path, f, { contentType: f.type || undefined, upsert: true });
      if (upErr) return { ok: false, error: "Challan upload failed: " + upErr.message };
      docRows.push({ grn_ref: grnNo, site_id: header.site_id, kind, path, uploaded_by: header.done_by || null });
    }
  }
  const issues = [];
  for (const ln of lines) {
    const recv = Number(ln.received_qty ?? ln.challan_qty ?? 0);
    const chal = Number(ln.challan_qty ?? recv);
    const short = chal - recv;
    // rate is NOT entered at challan; value the stock using the item's last known rate (from PO / previous GRN)
    let rate = 0;
    if (ln.item_id) {
      const { data: im } = await supabase.from("item_master").select("last_rate").eq("id", ln.item_id).maybeSingle();
      rate = Number(im?.last_rate || 0);
    }
    const { error } = await supabase.from("stock_txns").insert({
      site_id: header.site_id, item_id: ln.item_id, txn_type: "grn",
      qty: recv, rate, supplier: header.vendor, vendor: header.vendor,
      challan_no: header.challan_no, challan_date: header.challan_date || null,
      grn_ref: grnNo, our_challan_no: header.our_challan_no || null,
      challan_qty: chal, short_qty: short, grn_no: grnNo, done_by: header.done_by,
    });
    if (error) return { ok: false, error: error.message };
    if (short !== 0) {
      issues.push({ grn_no: grnNo, site_id: header.site_id, item_id: ln.item_id, item_name: ln.item_name,
        challan_qty: chal, received_qty: recv, issue_note: "Short/excess by " + short, raised_by: header.done_by });
    }
  }
  if (issues.length) await supabase.from("grn_issues").insert(issues);
  if (docRows.length) {
    const { error: dErr } = await supabase.from("grn_docs").insert(docRows);
    if (dErr) return { ok: true, grn_no: grnNo, discrepancies: issues.length,
      warn: "GRN saved but challan pages not stored (" + dErr.message + ") — run pipeskool_grn_docs.sql." };
  }
  return { ok: true, grn_no: grnNo, discrepancies: issues.length };
}

// ---------- MULTI-ITEM INDENT (material request) ----------
// header: { site_id, raised_by, required_by, urgency, note }
// lines: [{ item_id, item_name, qty, unit, purpose }]
export async function createIndent(header, lines) {
  if (isDemo) {
    demoRequests = [{ id: Date.now(), site: "KEI Sanand", item: lines.length + " items", qty: lines.reduce((s,l)=>s+Number(l.qty||0),0),
      required_by: header.required_by, urgency: header.urgency, status: "open" }, ...demoRequests];
    return { ok: true, indent_no: "IND/DEMO" };
  }
  // update187: duplicate guard — an open/quoting indent at the same site raised in the last
  // 48 h with (nearly) the same items is almost always a re-raise instead of an edit.
  if (!header.allow_duplicate) {
    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: recent } = await supabase.from("material_indents")
      .select("id, indent_no, created_at, status, material_indent_items(item_id, item_name)")
      .eq("site_id", header.site_id).in("status", ["open", "quoting"]).gte("created_at", since);
    const mine = new Set(lines.map(l => String(l.item_id || l.item_name).toLowerCase()));
    for (const r of recent || []) {
      const theirs = new Set((r.material_indent_items || []).map(x => String(x.item_id || x.item_name).toLowerCase()));
      if (!theirs.size) continue;
      let common = 0; mine.forEach(k => { if (theirs.has(k)) common++; });
      const overlap = common / Math.max(mine.size, theirs.size);
      if (overlap >= 0.8) {
        return { ok: false, duplicate: r.indent_no,
          error: `Looks like a duplicate of ${r.indent_no} (raised ${new Date(r.created_at).toLocaleString("en-IN")}, ${common} of ${mine.size} items the same, still ${r.status}). Edit that indent instead of raising a new one.` };
      }
    }
  }
  // update208: number = max-in-month + 1 (fn v2); retry a couple of times if two people
  // raise at the exact same moment (unique-violation 23505) instead of failing the user.
  let ind = null, indentNo = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: noData } = await supabase.rpc("fn_next_indent_no", { p_site_id: header.site_id });
    indentNo = noData || ("IND/" + header.site_id + "/" + Date.now());
    const { data: created, error } = await supabase.from("material_indents").insert({
      indent_no: indentNo, site_id: header.site_id, raised_by: header.raised_by,
      required_by: header.required_by || null, urgency: header.urgency || "normal", note: header.note,
    }).select().single();
    if (!error) { ind = created; break; }
    if (error.code !== "23505" && !/duplicate key/i.test(error.message)) return { ok: false, error: error.message };
    if (attempt === 2) return { ok: false, error: "Could not get a free indent number after 3 tries — run pipeskool_indent_no_fix.sql (update 208) and try again." };
  }
  const rows = lines.map(l => ({ indent_id: ind.id, item_id: l.item_id || null, item_name: l.item_name,
    qty: Number(l.qty), unit: l.unit, purpose: l.purpose, spec: l.spec || null }));
  const { error: e2 } = await supabase.from("material_indent_items").insert(rows);
  if (e2) return { ok: false, error: e2.message };
  notifyRequest({ kind: "indent", requestId: ind.id, siteId: header.site_id,
    title: "Material indent " + indentNo,
    body: rows.length + " item" + (rows.length === 1 ? "" : "s")
      + (header.required_by ? " \u00b7 need by " + header.required_by : "") + " \u00b7 open" });
  return { ok: true, indent_no: indentNo };
}

// update337: the indent edit trail. Reads through a definer function, so the right is
// re-checked in the database rather than trusted from the browser.
export async function getIndentEditAudit(indentId = null, limit = 200) {
  if (isDemo) return [];
  const { data, error } = await supabase.rpc("fn_indent_edit_audit", { p_indent_id: indentId, p_limit: limit });
  if (error) throw new Error(/fn_indent_edit_audit|schema cache|does not exist/i.test(error.message || "")
    ? "Run pipeskool_indent_edit_perm.sql (update 337) in Supabase first."
    : error.message);
  return data || [];
}

export async function editIndent(indentId, header, lines) {
  if (isDemo) return { ok: true };
  // update161: edits go ONLY through the atomic server function. The old
  // delete-then-insert path silently skipped the delete for raisers without
  // the Manage tick (RLS) and DOUBLED the items on every edit.
  const payload = lines.map(l => ({ item_id: l.item_id || null, item_name: l.item_name,
    qty: Number(l.qty), unit: l.unit || null, purpose: l.purpose || null, spec: l.spec || null }));
  const { data, error } = await supabase.rpc("fn_edit_indent_items", {
    p_indent_id: indentId, p_required_by: header.required_by || null,
    p_urgency: header.urgency || "normal", p_note: header.note || null,
    p_lines: payload,
  });
  if (error) {
    return { ok: false, error: /fn_edit_indent_items|schema cache|does not exist/i.test(error.message || "")
      ? "Edit engine not installed — run pipeskool_indent_edit_fix.sql in Supabase, then retry."
      : error.message };
  }
  return data?.ok ? { ok: true } : { ok: false, error: data?.error || "Edit failed." };
}

// Director / IT Executive / Accountant only — enforced server-side (update148)
export async function deleteIndent(indentId) {
  if (isDemo) return { ok: true };
  const { data, error } = await supabase.rpc("fn_delete_indent", { p_indent_id: indentId });
  if (error) return { ok: false, error: error.message };
  return data?.ok ? { ok: true } : { ok: false, error: data?.error || "Delete failed." };
}

const catOf = (it) => it.item_master?.item_type || (it.item_name && it.item_name.includes(" - ") ? it.item_name.split(" - ")[0].trim() : "Other");

export async function getIndents(siteId) {
  if (isDemo) return demoRequests;
  siteId = scoped(siteId);   // update245
  let q = supabase.from("material_indents")
    .select("id, indent_no, site_id, required_by, urgency, status, note, created_at, edited_at, raised_by, sites(name), raiser:raised_by(full_name), material_indent_items(id, item_id, item_name, qty, unit, purpose, spec, received_qty, po_items(id, purchase_orders(status)), item_master(item_type)), purchase_orders(po_no, vendor_name, delivery_status, expected_delivery, status)")
    .order("created_at", { ascending: false }).limit(100);
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data } = await q;
  const istDay = ts => ts ? new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : null;
  const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return (data || []).map(i => ({ id: i.id, indent_no: i.indent_no, site: i.sites?.name, site_id: i.site_id,
    raised_by: i.raiser?.full_name, raised_by_id: i.raised_by, required_by: i.required_by, urgency: i.urgency,
    status: i.status, note: i.note, date: istDay(i.created_at), edited_at: i.edited_at,
    canEdit: (istDay(i.created_at) === todayIST) && (i.status === "open" || i.status === "quoting"),
    pos: (i.purchase_orders || []).map(p => ({ po_no: p.po_no, vendor: p.vendor_name, status: p.status || "issued",
      delivery_status: p.delivery_status || "pending", expected_delivery: p.expected_delivery })),
    items: (i.material_indent_items || []).map(it => ({ ...it, ordered: (it.po_items || []).some(pp => (pp.purchase_orders?.status || "") !== "cancelled"), category: catOf(it) })),
    item_count: (i.material_indent_items||[]).length }));
}

// indent + items (with category) for the printable enquiry route
export async function getIndentEnquiry(indentId) {
  if (isDemo) return null;
  const { data } = await supabase.from("material_indents")
    .select("id, indent_no, required_by, note, sites(name), material_indent_items(id, item_name, qty, unit, purpose, spec, po_items(id, purchase_orders(status)), item_master(item_type))")
    .eq("id", indentId).single();
  if (!data) return null;
  return { id: data.id, indent_no: data.indent_no, site: data.sites?.name, required_by: data.required_by, note: data.note,
    items: (data.material_indent_items || []).map(it => ({ id: it.id, item_name: it.item_name, qty: it.qty, unit: it.unit, purpose: it.purpose, spec: it.spec, ordered: (it.po_items || []).some(pp => (pp.purchase_orders?.status || "") !== "cancelled"), category: catOf(it) })) };
}

export async function getGrnIssues(siteId) {
  if (isDemo) return [];
  siteId = scoped(siteId);   // update245
  let q0 = supabase.from("grn_issues")
    .select("id, site_id, grn_no, item_name, challan_qty, received_qty, issue_note, status, sites(name)")
    .eq("status", "open").order("created_at", { ascending: false });
  if (siteId && siteId !== "all") q0 = q0.eq("site_id", siteId);
  const { data } = await q0;
  return (data || []).map(i => ({ id: i.id, grn_no: i.grn_no, item: i.item_name,
    challan_qty: Number(i.challan_qty), received_qty: Number(i.received_qty),
    note: i.issue_note, site: i.sites?.name }));
}

// ---------- Goods receipts (GRNs) grouped by grn_no, for challan + Tally ----------
function groupGrns(rows) {
  const map = {};
  (rows || []).forEach(t => {
    const g = map[t.grn_no] = map[t.grn_no] || {
      grn_no: t.grn_no, challan_no: t.challan_no, challan_date: t.challan_date,
      vendor: t.vendor || t.supplier || "", site: t.sites?.name, site_id: t.site_id,
      date: (t.created_at || "").slice(0, 10), exported: !!t.tally_rn_exported_at, lines: [],
    };
    g.lines.push({ item_id: t.item_id, item_name: t.item_master?.display_name || "", unit: t.item_master?.unit || "",
      challan_qty: Number(t.challan_qty ?? t.qty), received_qty: Number(t.qty), short_qty: Number(t.short_qty || 0), rate: Number(t.rate || 0) });
  });
  return Object.values(map);
}

export async function getGrns(siteId, from, to) {
  siteId = scoped(siteId);   // update245
  if (isDemo) return [];
  let q = supabase.from("stock_txns")
    .select("grn_no, challan_no, challan_date, vendor, supplier, qty, challan_qty, short_qty, rate, created_at, site_id, tally_rn_exported_at, item_id, sites!stock_txns_site_id_fkey(name), item_master(display_name, unit)")
    .eq("txn_type", "grn").order("created_at", { ascending: false }).limit(800);
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  if (from) q = q.gte("created_at", from + "T00:00:00");
  if (to) q = q.lte("created_at", to + "T23:59:59");
  const { data } = await q;
  return groupGrns(data);
}

export async function getGrnDetail(grnNo) {
  if (isDemo) return null;
  const { data } = await supabase.from("stock_txns")
    .select("grn_no, challan_no, our_challan_no, challan_date, vendor, supplier, qty, challan_qty, short_qty, rate, created_at, site_id, item_id, done_by, sites!stock_txns_site_id_fkey(name), item_master(display_name, unit), app_users(full_name)")
    .eq("txn_type", "grn").eq("grn_no", grnNo);
  const g = groupGrnsFull(data);
  if (!g[0]) return null;
  await attachGrnDocs(g);
  return g[0];
}

// ---------- update184: GRN REGISTER ----------
// Full grouping: header + entered-by + doc counts. Quantities are the ACTUAL txn rows
// (never recomputed from current stock) — a GRN is a historical transaction.
function groupGrnsFull(rows) {
  const map = {};
  (rows || []).forEach(t => {
    const g = map[t.grn_no] = map[t.grn_no] || {
      grn_no: t.grn_no, challan_no: t.challan_no || "", our_challan_no: t.our_challan_no || "", challan_date: t.challan_date || "",
      vendor: t.vendor || t.supplier || "", site: t.sites?.name || "", site_id: t.site_id,
      entered_by: t.app_users?.full_name || "", entered_by_id: t.done_by || null,
      entered_at: t.created_at, date: (t.created_at || "").slice(0, 10),
      exported: !!t.tally_rn_exported_at, lines: [], docs: [], items: 0, total_qty: 0, value: 0, short_lines: 0,
    };
    const recv = Number(t.qty || 0), chal = Number(t.challan_qty ?? t.qty), short = Number(t.short_qty || 0), rate = Number(t.rate || 0);
    g.lines.push({ item_id: t.item_id, item_name: t.item_master?.display_name || "", unit: t.item_master?.unit || "",
      challan_qty: chal, received_qty: recv, short_qty: short, rate, value: recv * rate });
    g.items += 1; g.total_qty += recv; g.value += recv * rate; if (short) g.short_lines += 1;
    if (t.created_at && (!g.entered_at || t.created_at < g.entered_at)) g.entered_at = t.created_at;   // earliest line = GRN time
  });
  return Object.values(map);
}

async function attachGrnDocs(grns) {
  const refs = grns.map(g => g.grn_no).filter(Boolean);
  const byNo = Object.fromEntries(grns.map(g => [g.grn_no, g]));
  grns.forEach(g => { g.status = "open"; g.po_no = ""; g.po_id = null; g.changes = []; g.cancel = null; });
  for (let i = 0; i < refs.length; i += 200) {
    const slice = refs.slice(i, i + 200);
    const { data } = await supabase.from("grn_docs").select("id, grn_ref, kind, path, bucket, uploaded_at").in("grn_ref", slice).order("id");
    (data || []).forEach(d => { const g = byNo[d.grn_ref]; if (g) g.docs.push(d); });
    // update185: headers (status / PO / cancel info) — table may not exist before the SQL runs
    const { data: hs, error: hErr } = await supabase.from("grn_headers")
      .select("grn_no, status, po_id, created_by, cancelled_at, cancel_reason, note, last_edited_at, purchase_orders!grn_headers_po_id_fkey(po_no), cb:app_users!grn_headers_cancelled_by_fkey(full_name), eb:app_users!grn_headers_last_edited_by_fkey(full_name)")
      .in("grn_no", slice);
    if (!hErr) (hs || []).forEach(h => { const g = byNo[h.grn_no]; if (!g) return;
      g.status = h.status; g.po_id = h.po_id; g.po_no = h.purchase_orders?.po_no || ""; g.note = h.note || ""; g.created_by = h.created_by;
      if (h.last_edited_at) g.last_edit = { at: h.last_edited_at, by: h.eb?.full_name || "" };
      if (h.status === "cancelled") g.cancel = { at: h.cancelled_at, by: h.cb?.full_name || "", reason: h.cancel_reason || "" }; });
    const { data: ch, error: cErr } = await supabase.from("grn_material_changes")
      .select("id, grn_no, ordered_name, received_name, qty, reason").in("grn_no", slice);
    if (!cErr) (ch || []).forEach(c => { const g = byNo[c.grn_no]; if (g) g.changes.push(c); });
  }
  // update191: vendor returns made against these GRNs (return rows carry the GRN in challan_no)
  for (let i = 0; i < refs.length; i += 200) {
    const { data: rets } = await supabase.from("stock_txns").select("challan_no, item_id, qty")
      .eq("txn_type", "return_vendor").in("challan_no", refs.slice(i, i + 200));
    (rets || []).forEach(t => { const g = byNo[t.challan_no]; if (!g) return;
      g.returned_qty = (g.returned_qty || 0) + Number(t.qty || 0);
      const ln = g.lines.find(l => l.item_id === t.item_id); if (ln) ln.returned = (ln.returned || 0) + Number(t.qty || 0); });
  }
  grns.forEach(g => { g.sup_docs = g.docs.filter(d => d.kind === "supplier").length; g.our_docs = g.docs.filter(d => d.kind === "company").length; g.returned_qty = g.returned_qty || 0; });
  return grns;
}

// Signed URL for private pages, public URL otherwise. downloadName -> browser saves with that name.
export async function getGrnDocUrl(doc, downloadName) {
  if (!doc?.path) return null;
  if (String(doc.path).startsWith("http")) return doc.path;
  if (doc.bucket === GRN_BUCKET) {
    const { data, error } = await supabase.storage.from(GRN_BUCKET).createSignedUrl(doc.path, 600, downloadName ? { download: downloadName } : undefined);
    if (!error && data?.signedUrl) return data.signedUrl;
    return null;
  }
  return grnDocUrl(doc.path, downloadName);
}

// update192: edit GRN header (creator / IT / Director) — DB enforces the same rule
export async function editGrnHeader(grnNo, fields) {
  if (isDemo) return { ok: true };
  const { data, error } = await supabase.rpc("fn_grn_edit", { p_grn_no: grnNo, p: fields });
  if (error) return { ok: false, error: /fn_grn_edit|schema cache/i.test(error.message) ? "Editing not enabled yet — run pipeskool_grn_edit.sql (update 192)." : error.message };
  return data?.ok ? { ok: true } : { ok: false, error: data?.error || "Edit failed" };
}

// upload extra challan pages to an EXISTING GRN (private bucket, public fallback)
export async function addGrnDocs(grnNo, siteId, docs, uploadedBy) {
  if (isDemo) return { ok: true };
  const tag = "s" + siteId + "-" + Date.now().toString().slice(-6);
  const up = await uploadGrnDocs(tag, docs);
  if (up.error) return { ok: false, error: up.error };
  if (!up.rows.length) return { ok: false, error: "No pages selected." };
  const { error } = await supabase.from("grn_docs").insert(up.rows.map(d => ({ grn_ref: grnNo, site_id: Number(siteId), kind: d.kind, path: d.path, bucket: d.bucket, uploaded_by: uploadedBy || null })));
  if (error) return { ok: false, error: error.message };
  return { ok: true, added: up.rows.length };
}

export async function cancelGrn(grnNo, reason) {
  if (isDemo) return { ok: true };
  const { data, error } = await supabase.rpc("fn_grn_cancel", { p_grn_no: grnNo, p_reason: reason });
  if (error) return { ok: false, error: error.message };
  return data?.ok ? { ok: true, reversed: data.reversed_lines } : { ok: false, error: data?.error || "Cancel failed" };
}

// live POs of a site with per-line ordered / received / pending (for "receive against PO")
export async function getOpenPOs(siteId) {
  if (isDemo || !siteId) return [];
  const { data: pos, error } = await supabase.from("purchase_orders")
    .select("id, po_no, vendor_name, created_at, status, delivery_status, approval_status, sites(name)")
    .eq("site_id", Number(siteId)).neq("status", "cancelled").order("created_at", { ascending: false }).limit(150);
  if (error || !pos?.length) return [];
  const approved = pos.filter(p => (p.approval_status || "approved") === "approved");   // update198: pending/rejected POs cannot receive material
  if (!approved.length) return [];
  const ids = approved.map(p => p.id);
  const { data: items, error: e2 } = await supabase.from("v_po_item_receipt")
    .select("po_item_id, po_id, item_id, item_name, unit, ordered_qty, received_qty, pending_qty, rate").in("po_id", ids);
  if (e2) return approved.map(p => ({ id: p.id, po_no: p.po_no, vendor: p.vendor_name, date: p.created_at?.slice(0, 10), items: [], pending_items: 0, sql_missing: true }));
  return approved.map(p => {
    const its = (items || []).filter(i => i.po_id === p.id).map(i => ({ ...i, ordered_qty: Number(i.ordered_qty), received_qty: Number(i.received_qty), pending_qty: Number(i.pending_qty) }));
    return { id: p.id, po_no: p.po_no, vendor: p.vendor_name, date: p.created_at?.slice(0, 10), delivery_status: p.delivery_status,
      items: its, pending_items: its.filter(i => i.pending_qty > 0).length, item_count: its.length };
  }).filter(p => p.items.length === 0 || p.pending_items > 0 || p.delivery_status !== "delivered");
}

// Director-only audit trail of one GRN (module_audit_log read policy = director)
export async function getGrnHistory(grnNo) {
  if (isDemo) return [];
  const { data, error } = await supabase.from("module_audit_log")
    .select("action, at, meta, app_users(full_name)").eq("module", "grn").contains("meta", { grn_no: grnNo }).order("at");
  if (error) return [];
  return (data || []).map(r => ({ action: r.action, at: r.at, by: r.app_users?.full_name || "", meta: r.meta || {} }));
}

// Director: move existing challan pages from the public bucket into the private one.
export async function migrateGrnDocsToPrivate(onProgress) {
  if (isDemo) return { ok: true, moved: 0 };
  const { data: docs, error } = await supabase.from("grn_docs").select("id, path, bucket").eq("bucket", PUBLIC_BUCKET).order("id");
  if (error) return { ok: false, error: error.message };
  let moved = 0, failed = 0; const errors = [];
  for (const d of (docs || [])) {
    try {
      const { data: blob, error: dErr } = await supabase.storage.from(PUBLIC_BUCKET).download(d.path);
      if (dErr || !blob) throw new Error(dErr?.message || "download failed");
      const { error: uErr } = await supabase.storage.from(GRN_BUCKET).upload(d.path, blob, { upsert: true, contentType: blob.type || undefined });
      if (uErr) throw new Error(uErr.message);
      const { error: rowErr } = await supabase.from("grn_docs").update({ bucket: GRN_BUCKET }).eq("id", d.id);
      if (rowErr) throw new Error(rowErr.message);
      await supabase.storage.from(PUBLIC_BUCKET).remove([d.path]);
      moved += 1;
    } catch (e) { failed += 1; if (errors.length < 5) errors.push(d.path + ": " + e.message); }
    onProgress?.(moved + failed, (docs || []).length);
  }
  return { ok: true, moved, failed, total: (docs || []).length, errors };
}

// site_id (number|"all"), from/to = YYYY-MM-DD on entry date
export async function getGrnRegister({ siteId, from, to } = {}) {
  siteId = scoped(siteId);   // update245
  if (isDemo) return [];
  let q = supabase.from("stock_txns")
    .select("grn_no, challan_no, our_challan_no, challan_date, vendor, supplier, qty, challan_qty, short_qty, rate, created_at, site_id, item_id, done_by, tally_rn_exported_at, sites!stock_txns_site_id_fkey(name), item_master(display_name, unit), app_users(full_name)")
    .eq("txn_type", "grn").not("grn_no", "is", null).order("created_at", { ascending: false }).limit(4000);
  if (siteId && siteId !== "all") q = q.eq("site_id", Number(siteId));
  if (from) q = q.gte("created_at", from + "T00:00:00");
  if (to) q = q.lte("created_at", to + "T23:59:59");
  const { data, error } = await q;
  if (error) return { error: error.message, rows: [] };
  const grns = groupGrnsFull(data);
  await attachGrnDocs(grns);
  return { rows: grns };
}

// Meaningful download filename: GRN-1-123456_Supplier-Challan-1.pdf
export function grnDocName(grnNo, kind, idx, path) {
  const ext = (String(path || "").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return String(grnNo || "GRN").replace(/\//g, "-") + "_" + (kind === "supplier" ? "Supplier" : "Our") + "-Challan-" + (idx + 1) + "." + ext;
}
export function grnDocUrl(path, downloadName) {
  if (!path) return null;
  if (String(path).startsWith("http")) return path;
  try { return supabase.storage.from("attendance-photos").getPublicUrl(path, downloadName ? { download: downloadName } : undefined).data.publicUrl; } catch { return null; }
}



// ---------- RETURNS ----------
// kind: 'return_store' (surplus back to store, adds) | 'return_vendor' (wrong/excess to vendor, subtracts)
// ---------- update191 (v2, GRN-BASED): VENDOR RETURN AGAINST A GRN ----------
// GRNs of a site with, per line, received qty / already returned against that GRN /
// current store balance. Returnable ceiling per line = min(received − already
// returned on this GRN, store balance) so stock never goes negative and a GRN
// can never be "over-returned". Cancelled GRNs are excluded.
export async function getReturnableGrns(siteId) {
  siteId = scoped(siteId);   // update245
  if (isDemo || !siteId) return [];
  const { data: recs, error } = await supabase.from("stock_txns")
    .select("id, grn_no, item_id, qty, vendor, supplier, challan_no, our_challan_no, created_at, po_id, item_master(display_name, unit), purchase_orders(po_no)")
    .eq("txn_type", "grn").eq("site_id", Number(siteId)).not("grn_no", "is", null)
    .order("created_at", { ascending: false }).limit(1200);
  if (error || !recs?.length) return [];
  const grnNos = [...new Set(recs.map(r => r.grn_no))];
  // exclude cancelled GRNs (grn_headers from update185; if table absent, treat all as open)
  let cancelled = new Set();
  const { data: hs, error: hErr } = await supabase.from("grn_headers").select("grn_no, status").in("grn_no", grnNos.slice(0, 400));
  if (!hErr) (hs || []).forEach(h => { if (h.status === "cancelled") cancelled.add(h.grn_no); });
  // returns already made against these GRNs (grn_ref = "RTV/... via <grn_no>" not used; we
  // link by return_src_grn stored in grn_ref suffix — simpler: return rows carry po_item-less
  // linkage via note. Cleanest available column without SQL: match return rows whose
  // return_src = grn_no held in the "challan_no" of the return row.)
  const { data: rets } = await supabase.from("stock_txns")
    .select("item_id, qty, challan_no").eq("txn_type", "return_vendor").eq("site_id", Number(siteId)).in("challan_no", grnNos);
  const retBy = {};   // grn_no -> item_id -> qty
  (rets || []).forEach(t => { if (!t.challan_no) return; retBy[t.challan_no] = retBy[t.challan_no] || {}; retBy[t.challan_no][t.item_id] = (retBy[t.challan_no][t.item_id] || 0) + Number(t.qty || 0); });
  const itemIds = [...new Set(recs.map(r => r.item_id))];
  const balBy = {};
  for (let i = 0; i < itemIds.length; i += 300) {
    const { data: bal } = await supabase.from("v_stock_balance").select("item_id, balance").eq("site_id", Number(siteId)).in("item_id", itemIds.slice(i, i + 300));
    (bal || []).forEach(b => { balBy[b.item_id] = Number(b.balance || 0); });
  }
  const map = {};
  recs.forEach(r => {
    if (cancelled.has(r.grn_no)) return;
    const g = map[r.grn_no] = map[r.grn_no] || { grn_no: r.grn_no, vendor: r.vendor || r.supplier || "", challan_no: r.challan_no || "",
      our_challan_no: r.our_challan_no || "",   // update192: returns are identified by OUR challan
      po_no: r.purchase_orders?.po_no || "", date: (r.created_at || "").slice(0, 10), items: [] };
    if (r.created_at && r.created_at.slice(0, 10) < g.date) g.date = r.created_at.slice(0, 10);
    const already = (retBy[r.grn_no] || {})[r.item_id] || 0;
    const ex = g.items.find(x => x.item_id === r.item_id);
    if (ex) { ex.received += Number(r.qty || 0); }
    else g.items.push({ item_id: r.item_id, item_name: r.item_master?.display_name || "", unit: r.item_master?.unit || "",
      received: Number(r.qty || 0), already_returned: already, store_balance: balBy[r.item_id] ?? 0 });
  });
  return Object.values(map).map(g => {
    g.items.forEach(i => { i.max_return = Math.max(Math.min(i.received - i.already_returned, i.store_balance), 0); });
    g.returnable_items = g.items.filter(i => i.max_return > 0).length;
    return g;
  }).filter(g => g.items.length > 0).sort((a, b) => a.date < b.date ? 1 : -1);
}

// One return transaction against a GRN — return rows carry the source GRN number in
// challan_no (so "already returned per GRN" is computable with no schema change) and a
// shared ref RTV/<site>/<stamp> in grn_ref for grouping in history.
export async function recordGrnReturn({ site_id, grn_no, vendor, reason, done_by, lines }) {
  if (isDemo) return { ok: true, ref: "RTV/DEMO" };
  const valid = (lines || []).filter(l => Number(l.qty) > 0);
  if (!valid.length) return { ok: false, error: "Enter a return quantity on at least one item." };
  for (const l of valid) {
    if (Number(l.qty) > Number(l.max_return)) return { ok: false, error: `${l.item_name}: return ${l.qty} exceeds the allowed ${l.max_return} (received on this GRN − already returned, limited by store balance).` };
  }
  const ref = "RTV/" + site_id + "/" + Date.now().toString().slice(-6);
  const rows = valid.map(l => ({
    site_id: Number(site_id), item_id: l.item_id, txn_type: "return_vendor", qty: Number(l.qty),
    vendor: vendor || null, supplier: vendor || null, return_reason: reason || null,
    challan_no: grn_no,           // source GRN — powers per-GRN returned qty + register display
    grn_ref: ref, done_by: done_by || null,
  }));
  const { error } = await supabase.from("stock_txns").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, ref, lines: rows.length, total_qty: rows.reduce((s, r) => s + r.qty, 0) };
}

// Complete return-to-vendor history (grouped: one row per return transaction)
export async function getVendorReturnHistory({ siteId, from, to } = {}) {
  if (isDemo) return [];
  let q = supabase.from("stock_txns")
    .select("id, site_id, item_id, qty, vendor, supplier, return_reason, grn_ref, challan_no, created_at, done_by, sites!stock_txns_site_id_fkey(name), item_master(display_name, unit), app_users(full_name)")
    .eq("txn_type", "return_vendor").order("created_at", { ascending: false }).limit(1500);
  if (siteId && siteId !== "all") q = q.eq("site_id", Number(siteId));
  if (from) q = q.gte("created_at", from + "T00:00:00");
  if (to) q = q.lte("created_at", to + "T23:59:59");
  const { data, error } = await q;
  if (error) return { error: error.message, rows: [] };
  const map = {};
  (data || []).forEach(t => {
    const key = t.grn_ref || ("single-" + t.id);
    const g = map[key] = map[key] || { ref: t.grn_ref || "—", date: t.created_at, site: t.sites?.name || "", vendor: t.vendor || t.supplier || "—",
      src_grn: t.challan_no || "", reason: t.return_reason || "", by: t.app_users?.full_name || "", lines: [], total_qty: 0 };
    g.lines.push({ item: t.item_master?.display_name || "", unit: t.item_master?.unit || "", qty: Number(t.qty || 0), item_id: t.item_id, src_grn: t.challan_no || "" });
    g.total_qty += Number(t.qty || 0);
    if (t.created_at < g.date) g.date = t.created_at;
  });
  const rows = Object.values(map).sort((a, b) => a.date < b.date ? 1 : -1);
  // update205: value each line from the SOURCE GRN's rate for that item; attach RTV status
  try {
    const grnNos = [...new Set(rows.map(r => r.src_grn).filter(Boolean))];
    let rateBy = {};
    if (grnNos.length) {
      const { data: gl } = await supabase.from("stock_txns").select("grn_no, item_id, rate")
        .eq("txn_type", "grn").in("grn_no", grnNos).limit(3000);
      (gl || []).forEach(x => { rateBy[x.grn_no + "|" + x.item_id] = Number(x.rate || 0); });
    }
    const { data: sts } = await supabase.from("rtv_status").select("ref, status, changed_at, app_users(full_name)");
    const stBy = {}; (sts || []).forEach(x => { stBy[x.ref] = x; });
    rows.forEach(r => {
      r.total_value = 0;
      r.lines.forEach(l => { l.rate = rateBy[(l.src_grn || r.src_grn) + "|" + l.item_id] || 0; l.value = l.rate * l.qty; r.total_value += l.value; });
      const st = stBy[r.ref];
      r.status = st?.status || "awaiting"; r.status_by = st?.app_users?.full_name || ""; r.status_at = st?.changed_at ? st.changed_at.slice(0, 10) : "";
    });
  } catch { rows.forEach(r => { r.total_value = 0; r.status = "awaiting"; r.status_by = ""; r.status_at = ""; r.lines.forEach(l => { l.rate = 0; l.value = 0; }); }); }
  return { rows };
}

// update205: change one RTV's status (director / IT / stock manage — enforced in DB)
export async function setRtvStatus(ref, status) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_rtv_set_status", { p_ref: ref, p_status: status });
  if (error) return { ok: false, error: /fn_rtv_set_status|schema cache/i.test(error.message) ? "Run pipeskool_rtv_status.sql (update 205) first." : error.message };
  return data?.ok ? { ok: true, by: data.by } : { ok: false, error: data?.error || "Failed" };
}

export async function recordReturn({ site_id, item_id, qty, kind, reason, vendor, done_by }) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("stock_txns").insert({
    site_id, item_id, txn_type: kind, qty: Number(qty),
    return_reason: reason || null, vendor: vendor || null, supplier: vendor || null, done_by,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- PER-WORKER ISSUE & SETTLEMENT ----------

export async function getWorkerList(siteCode) {
  const all = await _getWorkers();
  return (siteCode && siteCode !== "all") ? all.filter(w => w.site === siteCode) : all;
}

// issue material to a named worker
export async function issueToWorker({ site_id, item_id, qty, worker_id, worker_name, purpose, done_by }) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("stock_txns").insert({
    site_id, item_id, txn_type: "issue", qty: Number(qty),
    worker_id: worker_id || null, worker_name, purpose, done_by,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// issue MULTIPLE items to one worker in a single transaction (update141).
// Every line is saved in one insert and shares one issue_ref — the Issue ID.
export async function issueMultiToWorker({ site_id, worker_id, worker_name, lines, done_by }) {
  if (isDemo) return { ok: true, issue_ref: "ISS-DEMO-000001", count: (lines || []).length };
  const d = new Date();
  const issue_ref = "ISS-" + d.toISOString().slice(0, 10).replace(/-/g, "") + "-" + String(d.getTime()).slice(-6);
  const rows = (lines || [])
    .filter(l => l.item_id && Number(l.qty) > 0)
    .map(l => ({
      site_id, item_id: l.item_id, txn_type: "issue", qty: Number(l.qty),
      worker_id: worker_id || null, worker_name, purpose: l.remarks || null, done_by, issue_ref,
    }));
  if (!rows.length) return { ok: false, error: "Add at least one item with a quantity." };
  let { error } = await supabase.from("stock_txns").insert(rows);   // one insert = all-or-nothing
  if (error && /issue_ref/i.test(error.message || "")) {
    // deploy window: SQL not run yet — save the issue without the ref rather than losing it
    ({ error } = await supabase.from("stock_txns").insert(rows.map(({ issue_ref: _x, ...r }) => r)));
  }
  return error ? { ok: false, error: error.message } : { ok: true, issue_ref, count: rows.length };
}

// pending settlements (material held by workers)
export async function getHoldings(siteCode) {
  if (isDemo) return [];
  const { data } = await supabase.from("v_worker_holdings").select("*").order("days_outstanding", { ascending: false });
  let rows = (data || []).map(h => ({
    site_id: h.site_id, site_code: h.site_code, site_name: h.site_name,
    item_id: h.item_id, item: h.display_name, unit: h.unit,
    worker_id: h.worker_id, worker: h.worker_name,
    issued: Number(h.issued), used: Number(h.used), returned: Number(h.returned),
    held: Number(h.held), days: h.days_outstanding,
  }));
  if (siteCode && siteCode !== "all") rows = rows.filter(r => r.site_code === siteCode);
  return rows;
}

// settle a worker's holding: record used (consumption) + returned-to-store
export async function settleHolding({ site_id, item_id, worker_id, worker_name, used, returned, purpose, done_by }) {
  if (isDemo) return { ok: true };
  const u = Number(used || 0), r = Number(returned || 0);
  if (u > 0) {
    const { error: ce } = await supabase.from("stock_consumption").insert({
      site_id, item_id, qty: u, purpose, worker_id: worker_id || null, worker_name, done_by });
    if (ce) return { ok: false, error: ce.message };
  }
  if (r > 0) {
    const { error: re } = await supabase.from("stock_txns").insert({
      site_id, item_id, txn_type: "return_store", qty: r, worker_id: worker_id || null, worker_name, done_by });
    if (re) return { ok: false, error: re.message };
  }
  return { ok: true };
}


// Quick-add from the indent form: try richer shapes first, fall back gracefully.
export async function quickAddItem(name, unit) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const clean = String(name || "").trim();
  if (!clean) return { ok: false, error: "Type the item name first." };
  const shapes = [
    { display_name: clean, item_type: "GENERAL", material: clean, unit: unit || null, is_active: true, pending_review: true },
    { display_name: clean, unit: unit || null, is_active: true, pending_review: true },
    { item_type: "GENERAL", material: clean, unit: unit || null, is_active: true },
  ];
  let lastErr = "";
  for (const payload of shapes) {
    const { data, error } = await supabase.from("item_master").insert(payload).select("id, display_name, unit").single();
    if (!error) return { ok: true, item: data };
    lastErr = error.message;
    if (!/column|null value|generated/i.test(error.message)) break;  // real failure, stop probing
  }
  return { ok: false, error: lastErr };
}
