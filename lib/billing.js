import { supabase, isDemo } from "./supabase";

export const BILL_STATUS = {
  draft: ["Draft", "gray"], submitted: ["Submitted", "info"],
  certified: ["Certified", "p"], paid: ["Paid", "p"],
};
export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// line value helpers (cumulative) given a mode + split %
export function lineCum(line, mode, matPct, instPct) {
  const rate = Number(line.rate) || 0;
  if (mode === "staged") {
    return (Number(line.cum_material_qty) || 0) * rate * (Number(line.sup_pct) || 0) / 100
         + (Number(line.cum_install_qty) || 0) * rate * (Number(line.ins_pct) || 0) / 100
         + (Number(line.cum_tc_qty) || 0) * rate * (Number(line.tc_pct) || 0) / 100;
  }
  if (mode === "split") {
    return (Number(line.cum_material_qty) || 0) * rate * (Number(matPct) || 0) / 100
         + (Number(line.cum_install_qty) || 0) * rate * (Number(instPct) || 0) / 100;
  }
  return (Number(line.cum_qty) || 0) * rate;
}
export function linePrev(line, mode, matPct, instPct) {
  const rate = Number(line.rate) || 0;
  if (mode === "staged") {
    return (Number(line.prev_material_qty) || 0) * rate * (Number(line.sup_pct) || 0) / 100
         + (Number(line.prev_install_qty) || 0) * rate * (Number(line.ins_pct) || 0) / 100
         + (Number(line.prev_tc_qty) || 0) * rate * (Number(line.tc_pct) || 0) / 100;
  }
  if (mode === "split") {
    return (Number(line.prev_material_qty) || 0) * rate * (Number(matPct) || 0) / 100
         + (Number(line.prev_install_qty) || 0) * rate * (Number(instPct) || 0) / 100;
  }
  return (Number(line.prev_qty) || 0) * rate;
}

export async function getRaSettings(siteId) {
  const fallback = { site_id: siteId, billing_mode: "simple", material_pct: 70, install_pct: 30 };
  if (isDemo) return fallback;
  const { data } = await supabase.from("ra_settings").select("*").eq("site_id", siteId).maybeSingle();
  return data || fallback;
}

export async function saveRaSettings(s) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("ra_settings").upsert({
    site_id: s.site_id, billing_mode: s.billing_mode,
    material_pct: Number(s.material_pct) || 0, install_pct: Number(s.install_pct) || 0,
    gst_pct: Number(s.gst_pct) || 0,
    updated_at: new Date().toISOString() }, { onConflict: "site_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getRaBills(siteId) {
  if (isDemo) return [];
  const { data } = await supabase.from("ra_bills").select("*").eq("site_id", siteId).order("bill_no", { ascending: false });
  return data || [];
}

// Build the editor worksheet: every BOQ line + previous cumulative (from bills before beforeBillNo).
export async function getBillWorksheet(siteId, beforeBillNo) {
  if (isDemo) return [];
  const { data: boq } = await supabase.from("boq_items")
    .select("id, item_code, description, short_name, unit, section, boq_qty, rate, is_extra, extra_status, basic_rate, item_id, sort_order, ra_payment_groups(name, supply_pct, install_pct, tc_pct)")
    .eq("site_id", siteId).eq("is_active", true)
    .order("is_extra").order("sort_order", { nullsFirst: false }).order("item_code");   // update260: extras after tender · update457: BOQ sequence
  const { data: lines } = await supabase.from("ra_bill_lines")
    .select("boq_item_id, cum_qty, cum_material_qty, cum_install_qty, cum_tc_qty, ra_bills!inner(site_id, bill_no)")
    .eq("ra_bills.site_id", siteId).lt("ra_bills.bill_no", beforeBillNo);
  const prevBy = {};
  (lines || []).forEach(l => {
    const bn = l.ra_bills.bill_no;
    if (!prevBy[l.boq_item_id] || bn > prevBy[l.boq_item_id]._bn)
      prevBy[l.boq_item_id] = { _bn: bn, cum_qty: Number(l.cum_qty), cum_material_qty: Number(l.cum_material_qty), cum_install_qty: Number(l.cum_install_qty), cum_tc_qty: Number(l.cum_tc_qty || 0) };
  });
  return (boq || []).map(b => {
    const p = prevBy[b.id] || { cum_qty: 0, cum_material_qty: 0, cum_install_qty: 0, cum_tc_qty: 0 };
    const g = b.ra_payment_groups;
    return { boq_item_id: b.id, item_code: b.item_code, description: b.description, display: b.short_name || b.description, unit: b.unit,
      section: b.is_extra ? "Extra / Non-tender items" : b.section,   // update260
      is_extra: !!b.is_extra, extra_status: b.extra_status || null,
      basic_rate: b.basic_rate != null ? Number(b.basic_rate) : null, item_id: b.item_id || null,
      purchase_rate: null,
      boq_qty: Number(b.boq_qty), rate: Number(b.rate),
      group_name: g?.name || null, sup_pct: g ? Number(g.supply_pct) : null, ins_pct: g ? Number(g.install_pct) : null, tc_pct: g ? Number(g.tc_pct) : null,
      prev_qty: p.cum_qty, prev_material_qty: p.cum_material_qty, prev_install_qty: p.cum_install_qty, prev_tc_qty: p.cum_tc_qty,
      cum_qty: p.cum_qty, cum_material_qty: p.cum_material_qty, cum_install_qty: p.cum_install_qty, cum_tc_qty: p.cum_tc_qty };
  });
}

export async function createRaBill(siteId, mode, matPct, instPct) {
  if (isDemo) return { ok: true, billId: 1, billNo: 1 };
  const { data: last } = await supabase.from("ra_bills").select("bill_no").eq("site_id", siteId).order("bill_no", { ascending: false }).limit(1);
  const billNo = ((last && last[0]?.bill_no) || 0) + 1;
  const { data, error } = await supabase.from("ra_bills").insert({
    site_id: siteId, bill_no: billNo, billing_mode: mode,
    material_pct: matPct, install_pct: instPct, status: "draft" }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, billId: data.id, billNo };
}

// Save a bill's lines + header meta, then recompute BOQ progress.
export async function saveRaBill(billId, siteId, lines, meta) {
  if (isDemo) return { ok: true };
  if (meta && Object.keys(meta).length) await supabase.from("ra_bills").update(meta).eq("id", billId);
  await supabase.from("ra_bill_lines").delete().eq("ra_bill_id", billId);
  const payload = lines.map(l => ({ ra_bill_id: billId, boq_item_id: l.boq_item_id,
    cum_qty: Number(l.cum_qty) || 0, cum_material_qty: Number(l.cum_material_qty) || 0, cum_install_qty: Number(l.cum_install_qty) || 0,
    cum_tc_qty: Number(l.cum_tc_qty) || 0,
    rate: l.rate != null && l.rate !== "" ? Number(l.rate) : null,                                   // update260: rate FROZEN into the bill
    basic_rate: l.basic_rate != null && l.basic_rate !== "" ? Number(l.basic_rate) : null,           // update260
    purchase_rate: l.purchase_rate != null && l.purchase_rate !== "" ? Number(l.purchase_rate) : null,
    sup_pct: l.sup_pct != null ? Number(l.sup_pct) : null, ins_pct: l.ins_pct != null ? Number(l.ins_pct) : null, tc_pct: l.tc_pct != null ? Number(l.tc_pct) : null }));
  if (payload.length) { const { error } = await supabase.from("ra_bill_lines").insert(payload); if (error) return { ok: false, error: error.message }; }
  await supabase.rpc("fn_apply_ra_progress", { p_site_id: siteId });
  return { ok: true };
}

export async function getRaBill(billId, siteId) {
  if (isDemo) return { hdr: null, lines: [] };
  const { data: hdr } = await supabase.from("ra_bills").select("*").eq("id", billId).single();
  const { data: st } = await supabase.from("ra_settings").select("gst_pct").eq("site_id", siteId).maybeSingle();
  const ws = await getBillWorksheet(siteId, hdr.bill_no);
  const { data: saved } = await supabase.from("ra_bill_lines").select("*").eq("ra_bill_id", billId);
  const savedBy = {}; (saved || []).forEach(s => { savedBy[s.boq_item_id] = s; });
  const lines = ws.map(l => {
    const s = savedBy[l.boq_item_id];
    return s ? { ...l, cum_qty: Number(s.cum_qty), cum_material_qty: Number(s.cum_material_qty), cum_install_qty: Number(s.cum_install_qty),
      cum_tc_qty: Number(s.cum_tc_qty || 0),
      rate: s.rate != null ? Number(s.rate) : l.rate,                                 // update260: a saved bill keeps ITS rate, not today's
      basic_rate: s.basic_rate != null ? Number(s.basic_rate) : l.basic_rate,
      purchase_rate: s.purchase_rate != null ? Number(s.purchase_rate) : l.purchase_rate,
      sup_pct: s.sup_pct != null ? Number(s.sup_pct) : l.sup_pct, ins_pct: s.ins_pct != null ? Number(s.ins_pct) : l.ins_pct, tc_pct: s.tc_pct != null ? Number(s.tc_pct) : l.tc_pct } : l;
  });
  return { hdr, lines, gst_pct: st ? Number(st.gst_pct) : 18 };
}

export async function deleteRaBill(billId, siteId) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("ra_bills").delete().eq("id", billId);
  if (error) return { ok: false, error: error.message };
  await supabase.rpc("fn_apply_ra_progress", { p_site_id: siteId });
  return { ok: true };
}

// Value totals per bill for a site: cumulative ₹ and this-bill ₹ (cum − previous bill's cum).
export async function getRaBillTotals(siteId) {
  if (isDemo) return {};
  const [{ data: bills }, { data: lines }, { data: boq }] = await Promise.all([
    supabase.from("ra_bills").select("id, bill_no, billing_mode, material_pct, install_pct").eq("site_id", siteId),
    supabase.from("ra_bill_lines").select("ra_bill_id, boq_item_id, cum_qty, cum_material_qty, cum_install_qty, cum_tc_qty, rate, sup_pct, ins_pct, tc_pct, ra_bills!inner(site_id)").eq("ra_bills.site_id", siteId),
    supabase.from("boq_items").select("id, rate").eq("site_id", siteId),
  ]);
  const rate = {}; (boq || []).forEach(b => rate[b.id] = Number(b.rate) || 0);
  const byBill = {}; (lines || []).forEach(l => (byBill[l.ra_bill_id] = byBill[l.ra_bill_id] || []).push(l));
  const cumOf = b => (byBill[b.id] || []).reduce((s, l) => {
    const r = l.rate != null ? Number(l.rate) : (rate[l.boq_item_id] || 0);   // update260: frozen line rate wins
    if (b.billing_mode === "staged")
      return s + r * ((Number(l.cum_material_qty) || 0) * (Number(l.sup_pct) || 0)
        + (Number(l.cum_install_qty) || 0) * (Number(l.ins_pct) || 0)
        + (Number(l.cum_tc_qty) || 0) * (Number(l.tc_pct) || 0)) / 100;
    if (b.billing_mode === "split")
      return s + (Number(l.cum_material_qty) || 0) * r * (Number(b.material_pct) || 0) / 100
               + (Number(l.cum_install_qty) || 0) * r * (Number(b.install_pct) || 0) / 100;
    return s + (Number(l.cum_qty) || 0) * r;
  }, 0);
  const sorted = (bills || []).sort((a, b) => a.bill_no - b.bill_no);
  const out = {}; let prev = 0;
  sorted.forEach(b => { const cum = cumOf(b); out[b.id] = { cum: Math.round(cum), thisBill: Math.round(cum - prev) }; prev = cum; });
  return out;
}


// ---------- Payment groups (staged mode) ----------
export async function getPaymentGroups(siteId) {
  if (isDemo) return [];
  const [{ data: groups }, { data: items }] = await Promise.all([
    supabase.from("ra_payment_groups").select("*").eq("site_id", siteId).order("id"),
    supabase.from("boq_items").select("id, payment_group_id").eq("site_id", siteId).eq("is_active", true),   // update260c: retired BOQ lines don't count
  ]);
  const counts = {}; let unassigned = 0;
  (items || []).forEach(i => { if (i.payment_group_id) counts[i.payment_group_id] = (counts[i.payment_group_id] || 0) + 1; else unassigned++; });
  return { groups: (groups || []).map(g => ({ ...g, items: counts[g.id] || 0 })), unassigned, totalItems: (items || []).length };
}

export async function savePaymentGroup(siteId, g) {
  if (isDemo) return { ok: true };
  const row = { site_id: siteId, name: (g.name || "").trim(),
    supply_pct: Number(g.supply_pct) || 0, install_pct: Number(g.install_pct) || 0, tc_pct: Number(g.tc_pct) || 0 };
  if (!row.name) return { ok: false, error: "Give the group a name (e.g. 60/30/10)." };
  if (Math.abs(row.supply_pct + row.install_pct + row.tc_pct - 100) > 0.01)
    return { ok: false, error: "Supply + Installation + T&C must total 100%." };
  const q = g.id ? supabase.from("ra_payment_groups").update(row).eq("id", g.id) : supabase.from("ra_payment_groups").insert(row);
  const { error } = await q;
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Assign items to a group by code ranges: "1.01-1.34, 2.01, 2.04-2.15"
// Sub-items (2.01.3) follow their parent (2.01).
export async function assignGroupByCodes(siteId, groupId, codesText) {
  if (isDemo) return { ok: true, count: 0 };
  const ranges = [];
  for (const part of String(codesText || "").split(",")) {
    const t = part.trim(); if (!t) continue;
    const m = t.match(/^([0-9]+\.[0-9]+)\s*(?:-|to)\s*([0-9]+\.[0-9]+)$/i);
    if (m) ranges.push([parseFloat(m[1]), parseFloat(m[2])]);
    else if (/^[0-9]+\.[0-9]+$/.test(t)) { const v = parseFloat(t); ranges.push([v, v]); }
    else return { ok: false, error: `Could not read "${t}" — use codes like 1.01 or ranges like 1.01-1.34.` };
  }
  if (!ranges.length) return { ok: false, error: "Enter at least one code or range." };
  const { data: items } = await supabase.from("boq_items").select("id, item_code").eq("site_id", siteId).eq("is_active", true);   // update260c: never assign retired lines
  const ids = (items || []).filter(i => {
    const segs = String(i.item_code).split(".");
    const base = parseFloat(segs.slice(0, 2).join("."));
    if (isNaN(base)) return false;
    return ranges.some(([a, b]) => Math.floor(base) === Math.floor(a) && base >= a - 1e-9 && base <= b + 1e-9);
  }).map(i => i.id);
  if (!ids.length) return { ok: false, error: "No BOQ items matched those codes." };
  const { error } = await supabase.from("boq_items").update({ payment_group_id: groupId }).in("id", ids);
  return error ? { ok: false, error: error.message } : { ok: true, count: ids.length };
}


// ---------------- update260: BASIC RATE DIFFERENCE ----------------
// SOUL-style deduction: (tender basic rate − actual purchase rate) × THIS bill's
// INSTALLED qty (Director decision 29 Aug, matches RA-3: 1,893 × 137 = 2,59,341).
// Positive = deducted from our bill; negative would mean we purchased ABOVE basic.
export function lineBasicDiff(l, mode) {
  const basic = Number(l.basic_rate), buy = Number(l.purchase_rate);
  if (!isFinite(basic) || !isFinite(buy) || l.basic_rate == null || l.purchase_rate == null || l.purchase_rate === "") return 0;
  const thisQty = mode === "simple"
    ? (Number(l.cum_qty) || 0) - (Number(l.prev_qty) || 0)
    : (Number(l.cum_install_qty) || 0) - (Number(l.prev_install_qty) || 0);
  return (basic - buy) * thisQty;
}

// Latest APPROVED purchase rate per item for a site (view over PO lines).
// Returns { item_id: { rate, po_no, po_date } } for auto-suggestion — the
// Director confirms/overrides before the bill is saved; nothing applies silently.
export async function getLatestPoRates(siteId) {
  if (isDemo) return {};
  const { data, error } = await supabase.from("v_item_latest_po_rate")
    .select("item_id, purchase_rate, po_no, po_date").eq("site_id", siteId);
  if (error) throw new Error("Could not load purchase rates: " + error.message);
  const map = {};
  (data || []).forEach(r => { map[r.item_id] = { rate: Number(r.purchase_rate), po_no: r.po_no, po_date: r.po_date }; });
  return map;
}
