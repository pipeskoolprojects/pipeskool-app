"use client";
import { supabase, isDemo } from "./supabase";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
export { inr };

export const CATEGORIES = ["Machine", "Power tool", "Testing", "Scaffolding", "Vehicle-mount", "Other"];

const STATUS = {
  idle: ["Idle", "gray"], in_use: ["In use", "info"],
  needs_repair: ["Needs repair", "h"], under_repair: ["In repair", "a"], lost: ["Lost", "a"],
  // legacy values (pre-redesign) map to the new model
  available: ["Idle", "gray"], in_transit: ["Idle", "gray"], scrapped: ["Retired", "gray"],
};
export const statusInfo = s => STATUS[s] || ["—", "gray"];
export const REPAIR_STATUSES = ["needs_repair", "under_repair"];

let demoAssets = [
  { id: 1, code: "PSK-TM-001", name: 'Threading machine 4"', category: "Machine", make: "Ridgid 300", cost: 185000, status: "in_use", site: "KEI Sanand", site_id: 1, custodian: "S. Desai", calib: false, calib_due: null, last: "2026-06-12" },
  { id: 2, code: "PSK-GM-001", name: "Grooving machine", category: "Machine", make: "Victaulic VG26", cost: 240000, status: "in_use", site: "KEI Sanand", site_id: 1, custodian: "S. Desai", calib: false, calib_due: null, last: "2026-06-10" },
  { id: 3, code: "PSK-WS-001", name: "Welding set 400A", category: "Machine", make: "ESAB Buddy", cost: 62000, status: "in_use", site: "KEI Sanand", site_id: 1, custodian: "S. Desai", calib: false, calib_due: null, last: "2026-06-12" },
  { id: 4, code: "PSK-WS-002", name: "Welding set 400A", category: "Machine", make: "ESAB Buddy", cost: 62000, status: "idle", site: "SOUL Campus", site_id: 2, custodian: null, calib: false, calib_due: null, last: "2026-05-20" },
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
    .select("id, asset_code, name, category, make_model, purchase_cost, status, current_site_id, custodian_name, calibration_required, calibration_due, sites(name), app_users(full_name)")
    .eq("is_active", true);
  if (siteId && siteId !== "all") q = q.eq("current_site_id", siteId);
  const { data } = await q;
  return (data || []).map(a => ({ id: a.id, code: a.asset_code, name: a.name, category: a.category,
    make: a.make_model, cost: Number(a.purchase_cost), status: a.status, site: a.sites?.name, site_id: a.current_site_id,
    custodian: a.custodian_name || a.app_users?.full_name || null, calib: a.calibration_required, calib_due: a.calibration_due }));
}

// staff name suggestions for the custodian field
export async function getStaffNames() {
  if (isDemo) return ["S. Desai", "M. Joshi", "R. Mehta", "Director"];
  const { data } = await supabase.from("app_users").select("full_name");
  return [...new Set((data || []).map(u => u.full_name).filter(Boolean))];
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

export const ASSET_TEMPLATE_HEADERS = ["asset_code", "name", "category", "site", "custodian", "make_model", "purchase_cost", "calibration_required", "calibration_due"];

// Resolve a free-typed site cell (e.g. "KEI", "soul campus", "The Creek", or "1") to a site id.
export function resolveSite(cell, sites) {
  const c = (cell || "").trim().toLowerCase();
  if (!c) return null;
  const byId = sites.find(s => String(s.id) === c);
  if (byId) return byId.id;
  const hit = sites.find(s => {
    const n = (s.name || "").toLowerCase();
    return n.includes(c) || c.includes(n.split(/[\s,]+/)[0]);
  });
  return hit ? hit.id : null;
}

// Bulk import assets from a CSV. Each row carries its own `site`, so one file
// can load tools across every site in one go.
export async function bulkImportAssets(rows, sites) {
  const errors = []; const payload = [];
  rows.forEach((r, i) => {
    const code = (r.asset_code || "").trim(), name = (r.name || "").trim(), category = (r.category || "").trim();
    if (!code || !name || !category) { errors.push(`Row ${i + 2}: asset_code, name and category are required`); return; }
    const siteId = resolveSite(r.site, sites);
    if (!siteId) { errors.push(`Row ${i + 2}: site "${r.site || "(blank)"}" not recognised`); return; }
    const custodian = (r.custodian || "").trim() || null;
    payload.push({ asset_code: code, name, category,
      make_model: (r.make_model || "").trim() || null,
      purchase_cost: r.purchase_cost ? Number(r.purchase_cost) : null,
      current_site_id: siteId, custodian_name: custodian,
      status: custodian ? "in_use" : "idle",
      calibration_required: /^(y|yes|true|1)$/i.test((r.calibration_required || "").trim()),
      calibration_due: (r.calibration_due || "").trim() || null });
  });
  if (isDemo) {
    payload.forEach(p => demoAssets.push({ id: Date.now() + Math.random(), code: p.asset_code, name: p.name,
      category: p.category, make: p.make_model, cost: Number(p.purchase_cost || 0), status: p.status,
      site: ({ 1: "KEI Sanand", 2: "SOUL Campus", 3: "The Creek" })[p.current_site_id] || "—",
      site_id: p.current_site_id, custodian: p.custodian_name, calib: p.calibration_required, calib_due: p.calibration_due }));
    return { ok: errors.length === 0, created: payload.length, errors };
  }
  if (payload.length) {
    const { error } = await supabase.from("assets").insert(payload);
    if (error) return { ok: false, error: error.message, created: 0, errors: [...errors, error.message] };
  }
  return { ok: errors.length === 0, created: payload.length, errors };
}

// ---- explicit state transitions (app owns status/site/custodian) ----
async function logTxn(row) {
  const { error } = await supabase.from("asset_txns").insert(row);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Immediate transfer: move site + reassign custodian on the spot.
export async function transferAsset(assetId, fromSiteId, toSiteId, custodianName, byUser = 1) {
  if (isDemo) {
    demoAssets = demoAssets.map(x => x.id === assetId ? { ...x, site_id: toSiteId,
      site: ({ 1: "KEI Sanand", 2: "SOUL Campus", 3: "The Creek" })[toSiteId] || x.site,
      custodian: custodianName || null, status: custodianName ? "in_use" : "idle" } : x);
    return { ok: true };
  }
  const { error } = await supabase.from("assets").update({
    current_site_id: toSiteId, custodian_name: custodianName || null,
    status: custodianName ? "in_use" : "idle" }).eq("id", assetId);
  if (error) return { ok: false, error: error.message };
  return logTxn({ asset_id: assetId, txn_type: "transfer", from_site_id: fromSiteId, to_site_id: toSiteId, custodian_name: custodianName || null, done_by: byUser });
}

// Flag a tool as needing repair (still physically on site, awaiting storekeeper decision).
export async function flagNeedsRepair(assetId, issue, byUser = 1) {
  if (isDemo) { demoAssets = demoAssets.map(x => x.id === assetId ? { ...x, status: "needs_repair" } : x); return { ok: true }; }
  const { error } = await supabase.from("assets").update({ status: "needs_repair" }).eq("id", assetId);
  if (error) return { ok: false, error: error.message };
  return logTxn({ asset_id: assetId, txn_type: "needs_repair", repair_issue: issue || null, done_by: byUser });
}

// Storekeeper sends it out for repair.
export async function sendForRepair(assetId, vendor, byUser = 1) {
  if (isDemo) { demoAssets = demoAssets.map(x => x.id === assetId ? { ...x, status: "under_repair" } : x); return { ok: true }; }
  const { error } = await supabase.from("assets").update({ status: "under_repair" }).eq("id", assetId);
  if (error) return { ok: false, error: error.message };
  return logTxn({ asset_id: assetId, txn_type: "repair_out", repair_vendor: vendor || null, done_by: byUser });
}

// Storekeeper decides it does NOT need to go out — back to service.
export async function cancelRepair(assetId, custodianName, byUser = 1) {
  const status = custodianName ? "in_use" : "idle";
  if (isDemo) { demoAssets = demoAssets.map(x => x.id === assetId ? { ...x, status } : x); return { ok: true }; }
  const { error } = await supabase.from("assets").update({ status }).eq("id", assetId);
  if (error) return { ok: false, error: error.message };
  return logTxn({ asset_id: assetId, txn_type: "repair_cancel", done_by: byUser });
}

// Repair finished — capture the cost, return to service.
export async function repairDone(assetId, cost, custodianName, byUser = 1) {
  const status = custodianName ? "in_use" : "idle";
  if (isDemo) { demoAssets = demoAssets.map(x => x.id === assetId ? { ...x, status } : x); return { ok: true }; }
  const { error } = await supabase.from("assets").update({ status }).eq("id", assetId);
  if (error) return { ok: false, error: error.message };
  return logTxn({ asset_id: assetId, txn_type: "repair_in", repair_cost: cost ? Number(cost) : null, done_by: byUser });
}

export async function reportLost(assetId, reason, byUser = 1) {
  if (isDemo) { demoAssets = demoAssets.map(x => x.id === assetId ? { ...x, status: "lost" } : x); return { ok: true }; }
  const { error } = await supabase.from("assets").update({ status: "lost" }).eq("id", assetId);
  if (error) return { ok: false, error: error.message };
  return logTxn({ asset_id: assetId, txn_type: "report_loss", loss_reason: reason || null, done_by: byUser });
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
  return assets.filter(a => a.status === "idle");
}
