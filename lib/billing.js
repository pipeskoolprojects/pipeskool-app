import { supabase, isDemo } from "./supabase";

export const BILL_STATUS = {
  draft: ["Draft", "gray"], submitted: ["Submitted", "info"],
  certified: ["Certified", "p"], paid: ["Paid", "p"],
};
export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// line value helpers (cumulative) given a mode + split %
export function lineCum(line, mode, matPct, instPct) {
  const rate = Number(line.rate) || 0;
  if (mode === "split") {
    return (Number(line.cum_material_qty) || 0) * rate * (Number(matPct) || 0) / 100
         + (Number(line.cum_install_qty) || 0) * rate * (Number(instPct) || 0) / 100;
  }
  return (Number(line.cum_qty) || 0) * rate;
}
export function linePrev(line, mode, matPct, instPct) {
  const rate = Number(line.rate) || 0;
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
    .select("id, item_code, description, unit, section, boq_qty, rate").eq("site_id", siteId).order("item_code");
  const { data: lines } = await supabase.from("ra_bill_lines")
    .select("boq_item_id, cum_qty, cum_material_qty, cum_install_qty, ra_bills!inner(site_id, bill_no)")
    .eq("ra_bills.site_id", siteId).lt("ra_bills.bill_no", beforeBillNo);
  const prevBy = {};
  (lines || []).forEach(l => {
    const bn = l.ra_bills.bill_no;
    if (!prevBy[l.boq_item_id] || bn > prevBy[l.boq_item_id]._bn)
      prevBy[l.boq_item_id] = { _bn: bn, cum_qty: Number(l.cum_qty), cum_material_qty: Number(l.cum_material_qty), cum_install_qty: Number(l.cum_install_qty) };
  });
  return (boq || []).map(b => {
    const p = prevBy[b.id] || { cum_qty: 0, cum_material_qty: 0, cum_install_qty: 0 };
    return { boq_item_id: b.id, item_code: b.item_code, description: b.description, unit: b.unit, section: b.section,
      boq_qty: Number(b.boq_qty), rate: Number(b.rate),
      prev_qty: p.cum_qty, prev_material_qty: p.cum_material_qty, prev_install_qty: p.cum_install_qty,
      cum_qty: p.cum_qty, cum_material_qty: p.cum_material_qty, cum_install_qty: p.cum_install_qty };
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
    cum_qty: Number(l.cum_qty) || 0, cum_material_qty: Number(l.cum_material_qty) || 0, cum_install_qty: Number(l.cum_install_qty) || 0 }));
  if (payload.length) { const { error } = await supabase.from("ra_bill_lines").insert(payload); if (error) return { ok: false, error: error.message }; }
  await supabase.rpc("fn_apply_ra_progress", { p_site_id: siteId });
  return { ok: true };
}

export async function getRaBill(billId, siteId) {
  if (isDemo) return { hdr: null, lines: [] };
  const { data: hdr } = await supabase.from("ra_bills").select("*").eq("id", billId).single();
  const ws = await getBillWorksheet(siteId, hdr.bill_no);
  const { data: saved } = await supabase.from("ra_bill_lines").select("*").eq("ra_bill_id", billId);
  const savedBy = {}; (saved || []).forEach(s => { savedBy[s.boq_item_id] = s; });
  const lines = ws.map(l => {
    const s = savedBy[l.boq_item_id];
    return s ? { ...l, cum_qty: Number(s.cum_qty), cum_material_qty: Number(s.cum_material_qty), cum_install_qty: Number(s.cum_install_qty) } : l;
  });
  return { hdr, lines };
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
    supabase.from("ra_bill_lines").select("ra_bill_id, boq_item_id, cum_qty, cum_material_qty, cum_install_qty, ra_bills!inner(site_id)").eq("ra_bills.site_id", siteId),
    supabase.from("boq_items").select("id, rate").eq("site_id", siteId),
  ]);
  const rate = {}; (boq || []).forEach(b => rate[b.id] = Number(b.rate) || 0);
  const byBill = {}; (lines || []).forEach(l => (byBill[l.ra_bill_id] = byBill[l.ra_bill_id] || []).push(l));
  const cumOf = b => (byBill[b.id] || []).reduce((s, l) => {
    if (b.billing_mode === "split")
      return s + (Number(l.cum_material_qty) || 0) * rate[l.boq_item_id] * (Number(b.material_pct) || 0) / 100
               + (Number(l.cum_install_qty) || 0) * rate[l.boq_item_id] * (Number(b.install_pct) || 0) / 100;
    return s + (Number(l.cum_qty) || 0) * rate[l.boq_item_id];
  }, 0);
  const sorted = (bills || []).sort((a, b) => a.bill_no - b.bill_no);
  const out = {}; let prev = 0;
  sorted.forEach(b => { const cum = cumOf(b); out[b.id] = { cum: Math.round(cum), thisBill: Math.round(cum - prev) }; prev = cum; });
  return out;
}
