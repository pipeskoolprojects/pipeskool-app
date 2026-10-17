"use client";
// update463: PRICE VISIBILITY. The database decides (fn_can_view_prices) — this file only asks it,
// and fetches the price columns of mixed tables through the *_px views, which return rows ONLY to
// price viewers. Site roles never even make the price request.
import { useEffect, useState } from "react";
import { supabase, isDemo } from "./supabase";
import { getSession } from "./auth";

export const SITE_ROLES = ["site_engineer", "site_incharge", "supervisor", "storekeeper", "peon", "worker"];
export const isSiteRole = role => SITE_ROLES.includes(String(role || ""));

// price columns per mixed table (everything else on these tables stays readable to everyone)
export const PRICE_COLS = {
  po_items: ["rate", "amount", "list_rate", "discount_pct", "gst_pct"],
  purchase_orders: ["gst_pct", "subtotal", "gst_amount", "total", "total_amount"],
  stock_txns: ["rate"],
  item_master: ["last_rate"],
  material_exchange_lines: ["rate"],
  material_exchanges: ["replacement_rate", "return_value", "replacement_value", "net_difference"],
};
// readable columns of the mixed tables (used where a screen needs "every column", e.g. backup)
export const BASE_COLS = {
  po_items: "id, po_id, item_id, qty, received_qty, billed_qty, indent_item_id, item_name, unit, spec, short_closed, short_close_note, short_closed_by, short_closed_at, returned_qty, line_kind, exchange_ref",
  purchase_orders: "id, po_no, vendor_id, site_id, indent_id, po_date, payment_terms, delivery_address, status, amendment_no, amendment_note, created_by, created_at, vendor_name, is_lowest, non_lowest_reason, split_note, issued_by, expected_delivery, delivery_status, delivery_note, delivery_updated_at, tally_exported_at, tally_po_exported_at, approval_status, approved_by, approved_at, reject_reason",
  stock_txns: "id, item_id, site_id, txn_type, qty, txn_date, po_reference, supplier, challan_photo_url, condition_remarks, issued_to, activity_id, counterpart_site_id, vehicle_no, note, done_by, created_at, challan_no, challan_date, challan_qty, short_qty, grn_no, vendor, return_reason, worker_id, worker_name, purpose, tally_rn_exported_at, issue_ref, grn_ref, our_challan_no, po_id, po_item_id",
  item_master: "id, item_type, material, sub_type, size, item_class, make, unit, hsn_code, min_stock, display_name, is_active, created_by, created_at, preferred_vendor, pending_review",
  material_exchange_lines: "id, exchange_id, po_item_id, item_id, item_name, unit, return_qty",
  material_exchanges: "id, exc_no, site_id, po_id, vendor_name, exchange_date, reason, replacement_item_id, replacement_item_name, replacement_unit, replacement_qty, replacement_received, replacement_po_item_id, done_by, done_by_name, created_at",
};

let cache = { key: null, val: null, at: 0, p: null };
// true = this login may see material prices. Cached 5 minutes per user.
export async function canViewPrices() {
  if (isDemo) return true;
  const s = getSession();
  if (!s) return false;
  if (isSiteRole(s.role)) return false;   // site roles: never, not even a request
  const key = String(s.id);
  if (cache.key === key && cache.val !== null && Date.now() - cache.at < 300000) return cache.val;
  if (cache.key === key && cache.p) return cache.p;
  cache = { key, val: null, at: 0, p: null };
  cache.p = (async () => {
    const { data, error } = await supabase.rpc("fn_can_view_prices");
    // before update 463 SQL is run nothing is restricted in the DB; keep the role rule on screen
    const val = error ? !isSiteRole(s.role) : !!data;
    cache = { key, val, at: Date.now(), p: null };
    return val;
  })();
  return cache.p;
}
export function resetPriceAccessCache() { cache = { key: null, val: null, at: 0, p: null }; }

// React: null while checking, then true/false
export function useCanViewPrices() {
  const [v, setV] = useState(null);   // same on server and first client render (no hydration mismatch)
  useEffect(() => { let live = true; canViewPrices().then(x => { if (live) setV(x); }).catch(() => { if (live) setV(false); }); return () => { live = false; }; }, []);
  return v;
}

const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const missingView = e => /does not exist|schema cache|could not find|relation/i.test(String(e?.message || ""));

// Copy the price columns of `table` onto `rows` (matched on rows[idKey] = table.id). Rows are changed
// in place and also returned. Non-viewers: nothing is fetched and rows are returned untouched.
export async function attachPrices(table, rows, { idKey = "id", cols } = {}) {
  const list = (rows || []).filter(Boolean);
  if (!list.length || isDemo) return rows;
  if (!(await canViewPrices())) return rows;
  const want = cols || PRICE_COLS[table];
  const ids = [...new Set(list.map(r => r[idKey]).filter(x => x != null))];
  if (!ids.length) return rows;
  const map = {};
  let src = table + "_px";
  for (const part of chunks(ids, 200)) {
    let { data, error } = await supabase.from(src).select(["id", ...want].join(", ")).in("id", part);
    if (error && src !== table && missingView(error)) {   // update 463 SQL not run yet → columns still on the table
      src = table;
      ({ data, error } = await supabase.from(src).select(["id", ...want].join(", ")).in("id", part));
    }
    (data || []).forEach(x => { map[x.id] = x; });
  }
  list.forEach(r => { const x = map[r[idKey]]; if (x) want.forEach(c => { r[c] = x[c]; }); });
  return rows;
}

// Same, for children embedded in parents: attachNested("po_items", pos, "po_items")
export async function attachNested(table, parents, key) {
  const kids = []; (parents || []).forEach(p => (Array.isArray(p?.[key]) ? p[key] : p?.[key] ? [p[key]] : []).forEach(k => kids.push(k)));
  await attachPrices(table, kids);
  return parents;
}

// ₹ formatting that never prints a price to a non-viewer
export const inrOrDash = (n, can) => (can && n != null && n !== "" && isFinite(Number(n))) ? "₹" + Number(n).toLocaleString("en-IN") : "—";

// Query a *_px view directly (filters built by `build`), e.g.
//   pxQuery("po_items", "id, rate", q => q.in("po_id", ids))   → [] for non-viewers
export async function pxQuery(table, cols, build) {
  if (isDemo || !(await canViewPrices())) return [];
  let r = await build(supabase.from(table + "_px").select(cols));
  if (r.error && missingView(r.error)) r = await build(supabase.from(table).select(cols));
  return r.data || [];
}

// Admin & Access (Directors): who sees prices, and the tick for office users
const cleanPx = e => { const m = String(e?.message || e || ""); return /fn_price_access|price_access|schema cache/i.test(m) ? "Run pipeskool_price_visibility.sql (update 463) in Supabase first." : m.replace(/^.*?ERROR:\s*/i, ""); };
export async function listPriceAccess() { if (isDemo) return []; const { data, error } = await supabase.rpc("fn_price_access_list"); if (error) throw new Error(cleanPx(error)); return data || []; }
export async function setPriceAccess(userId, grant) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_price_access_set", { p_user_id: userId, p_grant: !!grant });
  resetPriceAccessCache();
  if (error) return { ok: false, error: cleanPx(error) };
  return data?.ok ? { ok: true } : { ok: false, error: data?.error || "Could not save." };
}
