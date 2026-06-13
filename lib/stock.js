"use client";
import { supabase, isDemo } from "./supabase";

export const ITEM_TYPES = ["Pipe", "Fitting", "Valve", "Fixture", "Consumable", "Pump", "Tank"];

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
export async function searchItems(q) {
  if (isDemo) return demoItems.filter(i => !q || i.display_name.toLowerCase().includes(q.toLowerCase()));
  let query = supabase.from("item_master").select("id, display_name, item_type, material, unit, min_stock").eq("is_active", true).limit(50);
  if (q) query = query.ilike("display_name", "%" + q + "%");
  const { data } = await query;
  return data || [];
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
    received: Number(r.received), issued: Number(r.issued), returned: Number(r.returned),
    consumed: Number(r.consumed), balance: Number(r.balance), rate: Number(r.rate),
    value: Number(r.value), last: r.last_activity,
  }));
  if (siteCode && siteCode !== "all") rows = rows.filter(r => r.site_code === siteCode);
  return rows;
}

export async function getBoqNorms() {
  if (isDemo) return demoBoqNorm;
  return demoBoqNorm; // wired fully when BOQ module (7) links activity->item
}

export function deadStock(balances, daysIdle = 21) {
  const cutoff = new Date(Date.now() - daysIdle * 864e5).toISOString().slice(0, 10);
  return balances.filter(b => b.balance > 0 && b.last && b.last < cutoff);
}

export function lowStock(balances) {
  return balances.filter(b => b.balance <= b.min_stock && b.min_stock > 0);
}
