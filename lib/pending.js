"use client";
// update256: PENDING DELIVERIES — a reporting layer over data that already exists.
// Every quantity here comes from v_po_item_pending, which is derived from v_po_item_receipt
// (PO lines vs stock_txns from GRNs). Nothing is entered by hand and nothing is stored twice,
// so recording a GRN or Delivery Challan updates these numbers on its own.
import { supabase, isDemo } from "./supabase";
import { scoped, isScoped } from "./scope";

// aging bands — change these two numbers to retune the colour coding
export const AGE_AMBER = 7;
export const AGE_RED = 15;
export function ageBand(days) {
  if (days >= AGE_RED) return { key: "red", label: "escalate", color: "var(--red)" };
  if (days >= AGE_AMBER) return { key: "amber", label: "needs follow-up", color: "var(--amber)" };
  return { key: "green", label: "on track", color: "var(--green)" };
}

export const LINE_STATUS = {
  pending:      ["Pending", "gray"],
  partial:      ["Partially Received", "warn"],
  received:     ["Fully Received", "p"],
  excess:       ["Excess", "h"],
  short_closed: ["Short-closed", "gray"],
};

// rows for the register. `open` = only lines that still owe something.
export async function getPendingDeliveries({ siteId = null, vendor = "", from = "", to = "", status = "open" } = {}) {
  if (isDemo) return [];
  const site = scoped(siteId);
  let q = supabase.from("v_po_item_pending").select("*").order("days_pending", { ascending: false });
  if (isScoped(site)) q = q.eq("site_id", site);
  if (vendor) q = q.eq("vendor_name", vendor);
  if (from) q = q.gte("po_date", from);
  if (to) q = q.lte("po_date", to + "T23:59:59");
  if (status && status !== "all") {
    if (status === "open") q = q.in("line_status", ["pending", "partial"]);
    else q = q.eq("line_status", status);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(r => ({ ...r,
    ordered_qty: Number(r.ordered_qty || 0), received_qty: Number(r.received_qty || 0),
    pending_qty: Number(r.pending_qty || 0), excess_qty: Number(r.excess_qty || 0),
    pending_value: Number(r.pending_value || 0), days_pending: Number(r.days_pending || 0) }));
}

// headline numbers for the register and the Quick Access badge
export async function getPendingSummary(opts = {}) {
  const rows = await getPendingDeliveries({ ...opts, status: "open" }).catch(() => []);
  const pos = new Set(rows.map(r => r.po_id));
  const vendors = new Set(rows.map(r => r.vendor_name));
  return {
    lines: rows.length,
    pos: pos.size,
    vendors: vendors.size,
    value: rows.reduce((t, r) => t + r.pending_value, 0),
    green: rows.filter(r => ageBand(r.days_pending).key === "green").length,
    amber: rows.filter(r => ageBand(r.days_pending).key === "amber").length,
    red: rows.filter(r => ageBand(r.days_pending).key === "red").length,
  };
}

// just the count, for the tile badge — cheap enough to call on the dashboard
export async function getPendingCount(siteId = null) {
  if (isDemo) return 0;
  const site = scoped(siteId);
  let q = supabase.from("v_po_item_pending").select("po_item_id", { count: "exact", head: true })
    .in("line_status", ["pending", "partial"]);
  if (isScoped(site)) q = q.eq("site_id", site);
  const { count } = await q;
  return count || 0;
}

// the per-line breakdown shown inside a single PO
export async function getPOItemStatus(poId) {
  if (isDemo || !poId) return [];
  const { data } = await supabase.from("v_po_item_pending").select("*").eq("po_id", poId).order("po_item_id");
  return data || [];
}

export async function getFollowups(poItemId) {
  if (isDemo || !poItemId) return [];
  const { data } = await supabase.from("po_item_followups")
    .select("id, note, promised_by, created_at, author:created_by(full_name)")
    .eq("po_item_id", poItemId).order("created_at", { ascending: false });
  return data || [];
}

export async function addFollowup({ poItemId, poId, note, promisedBy }, byUser) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  if (!String(note || "").trim()) return { ok: false, error: "Write what the vendor said." };
  const { error } = await supabase.from("po_item_followups").insert({
    po_item_id: poItemId, po_id: poId, note: note.trim(),
    promised_by: promisedBy || null, created_by: byUser || null });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// short-close goes through the RPC so the permission check is server-side and the
// reason is enforced there, not just in the form
export async function shortClose(poItemId, note, undo = false) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_short_close_po_item",
    { p_po_item_id: poItemId, p_note: note || null, p_undo: !!undo });
  if (error) return { ok: false, error: error.message };
  return data?.ok ? { ok: true, ...data } : { ok: false, error: data?.error || "Could not update this line." };
}

// update257: the register groups by PO. Quantities are untouched — this only folds the
// already-derived line rows into one summary row per PO.
export function groupByPO(rows) {
  const byPo = new Map();
  (rows || []).forEach(r => {
    const g = byPo.get(r.po_id) || {
      po_id: r.po_id, po_no: r.po_no, vendor_name: r.vendor_name,
      site_id: r.site_id, site_name: r.site_name, po_date: r.po_date,
      items: [], pending_value: 0, days_pending: 0,
      pending_lines: 0, excess_lines: 0, closed_lines: 0, received_lines: 0,
    };
    g.items.push(r);
    g.pending_value += Number(r.pending_value || 0);
    // the PO ages by its OLDEST outstanding line — that is what needs chasing
    if (Number(r.pending_qty) > 0 && r.line_status !== "short_closed")
      g.days_pending = Math.max(g.days_pending, Number(r.days_pending || 0));
    if (r.line_status === "short_closed") g.closed_lines++;
    else if (r.line_status === "excess") g.excess_lines++;
    else if (r.line_status === "received") g.received_lines++;
    else g.pending_lines++;
    byPo.set(r.po_id, g);
  });
  return [...byPo.values()].map(g => ({
    ...g,
    item_count: g.items.length,
    pct_received: g.items.length
      ? Math.round(g.items.reduce((t, i) => t + Number(i.pct_received || 0), 0) / g.items.length) : 0,
    po_status: g.pending_lines > 0
      ? (g.items.some(i => Number(i.received_qty) > 0) ? "partial" : "pending")
      : g.excess_lines > 0 ? "excess"
      : g.closed_lines > 0 && g.received_lines === 0 ? "short_closed" : "received",
  })).sort((a, b) => b.days_pending - a.days_pending);
}

// everything the printable follow-up letter needs, for ONE po
export async function getFollowupDoc(poId) {
  if (isDemo || !poId) return null;
  const { data, error } = await supabase.from("v_po_item_pending").select("*").eq("po_id", poId).order("po_item_id");
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (!rows.length) return null;
  const open = rows.filter(r => Number(r.pending_qty) > 0 && r.line_status !== "short_closed");
  const h = rows[0];
  return {
    po_id: poId, po_no: h.po_no, vendor: h.vendor_name, site: h.site_name || "",
    po_date: String(h.po_date || "").slice(0, 10),
    items: open.map(r => ({
      name: r.item_name, unit: r.unit,
      ordered: Number(r.ordered_qty), received: Number(r.received_qty),
      pending: Number(r.pending_qty), days: Number(r.days_pending || 0),
    })),
    pending_value: open.reduce((t, r) => t + Number(r.pending_value || 0), 0),
    oldest: open.reduce((m, r) => Math.max(m, Number(r.days_pending || 0)), 0),
  };
}
