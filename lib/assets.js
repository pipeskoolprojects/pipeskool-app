"use client";
import { supabase, isDemo } from "./supabase";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
export { inr };

export const CATEGORIES = ["Machine", "Power tool", "Testing", "Scaffolding", "Vehicle-mount", "Other"];

const STATUS = {
  available: ["Available", "p"], in_use: ["In use", "info"], in_transit: ["In transit", "h"],
  under_repair: ["Under repair", "a"], lost: ["Lost", "a"], scrapped: ["Scrapped", "gray"],
};
export const statusInfo = s => STATUS[s] || ["", "gray"];

let demoAssets = [
  { id: 1, code: "PSK-TM-001", name: 'Threading machine 4"', category: "Machine", make: "Ridgid 300", cost: 185000, status: "in_use", site: "KEI Sanand", site_id: 1, custodian: "S. Desai", calib: false, calib_due: null, last: "2026-06-12" },
  { id: 2, code: "PSK-GM-001", name: "Grooving machine", category: "Machine", make: "Victaulic VG26", cost: 240000, status: "in_use", site: "KEI Sanand", site_id: 1, custodian: "S. Desai", calib: false, calib_due: null, last: "2026-06-10" },
  { id: 3, code: "PSK-WS-001", name: "Welding set 400A", category: "Machine", make: "ESAB Buddy", cost: 62000, status: "in_use", site: "KEI Sanand", site_id: 1, custodian: "S. Desai", calib: false, calib_due: null, last: "2026-06-12" },
  { id: 4, code: "PSK-WS-002", name: "Welding set 400A", category: "Machine", make: "ESAB Buddy", cost: 62000, status: "available", site: "SOUL Campus", site_id: 2, custodian: null, calib: false, calib_due: null, last: "2026-05-20" },
  { id: 5, code: "PSK-HP-001", name: "Hydro-test pump", category: "Testing", make: "Kirloskar 50bar", cost: 48000, status: "in_use", site: "KEI Sanand", site_id: 1, custodian: "S. Desai", calib: true, calib_due: "2026-07-15", last: "2026-06-11" },
  { id: 6, code: "PSK-PG-001", name: "Pressure gauge set", category: "Testing", make: "Wika 0-60bar", cost: 9500, status: "in_use", site: "KEI Sanand", site_id: 1, custodian: "S. Desai", calib: true, calib_due: "2026-06-25", last: "2026-06-11" },
  { id: 7, code: "PSK-CC-001", name: "Core cutting machine", category: "Power tool", make: "Hilti DD150", cost: 135000, status: "under_repair", site: "SOUL Campus", site_id: 2, custodian: null, calib: false, calib_due: null, last: "2026-06-02" },
  { id: 8, code: "PSK-SC-001", name: "Scaffolding set (50 units)", category: "Scaffolding", make: "—", cost: 95000, status: "in_use", site: "The Creek", site_id: 3, custodian: "R. Mehta", calib: false, calib_due: null, last: "2026-06-09" },
];

let demoTransfers = [
  { id: 1, code: "PSK-WS-002", name: "Welding set 400A", from: "SOUL Campus", to: "KEI Sanand", date: "2026-06-12", acknowledged: false },
];

const demoRepairHistory = [
  { code: "PSK-CC-001", name: "Core cutting machine", count: 3, total: 28500, cost: 135000 },
  { code: "PSK-GM-001", name: "Grooving machine", count: 1, total: 6500, cost: 240000 },
];

export async function getAssets(siteId) {
  if (isDemo) return siteId && siteId !== "all" ? demoAssets.filter(a => a.site_id === Number(siteId)) : demoAssets;
  let q = supabase.from("assets")
    .select("id, asset_code, name, category, make_model, purchase_cost, status, calibration_required, calibration_due, sites(name), app_users(full_name)")
    .eq("is_active", true);
  if (siteId && siteId !== "all") q = q.eq("current_site_id", siteId);
  const { data } = await q;
  return (data || []).map(a => ({ id: a.id, code: a.asset_code, name: a.name, category: a.category,
    make: a.make_model, cost: Number(a.purchase_cost), status: a.status, site: a.sites?.name,
    custodian: a.app_users?.full_name || null, calib: a.calibration_required, calib_due: a.calibration_due }));
}

export async function addAsset(payload) {
  if (isDemo) {
    demoAssets.push({ id: Date.now(), code: payload.asset_code, name: payload.name, category: payload.category,
      make: payload.make_model, cost: Number(payload.purchase_cost || 0), status: "available",
      site: "—", site_id: payload.current_site_id, custodian: null, calib: payload.calibration_required,
      calib_due: payload.calibration_due, last: new Date().toISOString().slice(0, 10) });
    return { ok: true };
  }
  const { error } = await supabase.from("assets").insert(payload);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export const ASSET_TEMPLATE_HEADERS = ["asset_code", "name", "category", "make_model", "purchase_cost", "calibration_required", "calibration_due"];

// Bulk import assets from a CSV (office initial load). Mirrors bulkImportBoq.
export async function bulkImportAssets(rows, siteId) {
  if (isDemo) {
    rows.forEach(r => demoAssets.push({ id: Date.now() + Math.random(), code: r.asset_code, name: r.name,
      category: r.category, make: r.make_model, cost: Number(r.purchase_cost || 0), status: "available",
      site: "—", site_id: siteId, custodian: null, calib: /^(y|yes|true|1)$/i.test(r.calibration_required || ""),
      calib_due: r.calibration_due || null, last: new Date().toISOString().slice(0, 10) }));
    return { ok: true, created: rows.length, errors: [] };
  }
  const errors = []; const payload = [];
  rows.forEach((r, i) => {
    const code = (r.asset_code || "").trim(), name = (r.name || "").trim(), category = (r.category || "").trim();
    if (!code || !name || !category) { errors.push(`Row ${i + 2}: asset_code, name and category are required`); return; }
    payload.push({ asset_code: code, name, category,
      make_model: (r.make_model || "").trim() || null,
      purchase_cost: r.purchase_cost ? Number(r.purchase_cost) : null,
      current_site_id: siteId,
      calibration_required: /^(y|yes|true|1)$/i.test((r.calibration_required || "").trim()),
      calibration_due: (r.calibration_due || "").trim() || null });
  });
  if (payload.length) {
    const { error } = await supabase.from("assets").insert(payload);
    if (error) return { ok: false, error: error.message, created: 0, errors: [...errors, error.message] };
  }
  return { ok: errors.length === 0, created: payload.length, errors };
}

export async function assetTxn(payload) {
  if (isDemo) {
    if (payload.txn_type === "transfer") {
      const a = demoAssets.find(x => x.id === payload.asset_id);
      demoTransfers = [{ id: Date.now(), code: a.code, name: a.name, from: a.site,
        to: "(target site)", date: new Date().toISOString().slice(0, 10), acknowledged: false }, ...demoTransfers];
      demoAssets = demoAssets.map(x => x.id === payload.asset_id ? { ...x, status: "in_transit" } : x);
    } else if (payload.txn_type === "repair_out") {
      demoAssets = demoAssets.map(x => x.id === payload.asset_id ? { ...x, status: "under_repair" } : x);
    } else if (payload.txn_type === "return") {
      demoAssets = demoAssets.map(x => x.id === payload.asset_id ? { ...x, status: "available", custodian: null } : x);
    } else if (payload.txn_type === "report_loss") {
      demoAssets = demoAssets.map(x => x.id === payload.asset_id ? { ...x, status: "lost" } : x);
    }
    return { ok: true };
  }
  const { error } = await supabase.from("asset_txns").insert(payload);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getPendingTransfers(siteId) {
  if (isDemo) return demoTransfers.filter(t => !t.acknowledged);
  const { data } = await supabase.from("asset_txns")
    .select("id, txn_date, acknowledged, assets(asset_code, name), from_site:from_site_id(name), to_site:to_site_id(name)")
    .eq("txn_type", "transfer").eq("acknowledged", false);
  return (data || []).map(t => ({ id: t.id, code: t.assets?.asset_code, name: t.assets?.name,
    from: t.from_site?.name, to: t.to_site?.name, date: t.txn_date, acknowledged: t.acknowledged }));
}

export async function acknowledgeTransfer(txnId, byUserId) {
  if (isDemo) { demoTransfers = demoTransfers.map(t => t.id === txnId ? { ...t, acknowledged: true } : t); return { ok: true }; }
  const { error } = await supabase.from("asset_txns")
    .update({ acknowledged: true, acknowledged_by: byUserId, acknowledged_at: new Date().toISOString() })
    .eq("id", txnId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getCalibrationDue() {
  if (isDemo) {
    const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    return demoAssets.filter(a => a.calib && a.calib_due && a.calib_due <= soon);
  }
  const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const { data } = await supabase.from("assets")
    .select("asset_code, name, calibration_due, sites(name)")
    .eq("calibration_required", true).lte("calibration_due", soon).eq("is_active", true);
  return (data || []).map(a => ({ code: a.asset_code, name: a.name, calib_due: a.calibration_due, site: a.sites?.name }));
}

export async function getRepairHistory() {
  if (isDemo) return demoRepairHistory;
  const { data } = await supabase.from("v_asset_repair_history").select("*").gt("repair_count", 0);
  return (data || []).map(r => ({ code: r.asset_code, name: r.name, count: r.repair_count,
    total: Number(r.total_repair_cost), cost: Number(r.purchase_cost) }));
}

export function idleAssets(assets, daysIdle = 14) {
  return assets.filter(a => a.status === "available");
}
