"use client";
// update404: MATERIAL EXCHANGE — return received material and take a replacement from the same vendor
// in one server transaction (fn_exchange_confirm): stock return_vendor + grn, PO lines badged, PO total adjusted.
import { supabase, isDemo } from "./supabase";

const clean = e => { const m = String(e?.message || e || ""); return /material_exchange|fn_exchange_|fn_next_exc|returned_qty|schema cache/i.test(m) ? "Run pipeskool_material_exchange.sql (update 404) in Supabase first." : m.replace(/^.*?ERROR:\s*/i, ""); };

// POs at this site with at least one received line → [{ po_id, po_no, vendor, items:[{po_item_id,item_id,item_name,unit,rate,ordered,received,returned,max_return}] }]
export async function getExchangeablePOs(siteId) {
  if (isDemo) return [];
  const { data: recs, error } = await supabase.from("stock_txns").select("po_id, item_id, qty").eq("txn_type", "grn").eq("site_id", Number(siteId)).not("po_id", "is", null);
  if (error) throw new Error(clean(error));
  const recvBy = {}; (recs || []).forEach(t => { const k = t.po_id + ":" + t.item_id; recvBy[k] = (recvBy[k] || 0) + Number(t.qty || 0); });
  const poIds = [...new Set((recs || []).map(t => t.po_id))]; if (!poIds.length) return [];
  const [{ data: pos }, { data: items }] = await Promise.all([
    supabase.from("purchase_orders").select("id, po_no, vendor_name, status, total_amount").in("id", poIds).neq("status", "cancelled"),
    supabase.from("po_items").select("id, po_id, item_id, item_name, unit, qty, rate, returned_qty, line_kind, exchange_ref").in("po_id", poIds),
  ]);
  return (pos || []).map(p => {
    const its = (items || []).filter(i => i.po_id === p.id).map(i => { const received = recvBy[p.id + ":" + i.item_id] || 0; const returned = Number(i.returned_qty || 0);
      return { po_item_id: i.id, item_id: i.item_id, item_name: i.item_name, unit: i.unit, rate: Number(i.rate || 0), ordered: Number(i.qty), received, returned, max_return: Math.max(received - returned, 0), line_kind: i.line_kind }; });
    return { po_id: p.id, po_no: p.po_no, vendor: p.vendor_name, total: Number(p.total_amount || 0), items: its };
  }).filter(p => p.items.some(i => i.max_return > 0)).sort((a, b) => b.po_no.localeCompare(a.po_no));
}
export async function confirmExchange(p) { if (isDemo) return { ok: false, error: "Demo mode." }; const { data, error } = await supabase.rpc("fn_exchange_confirm", { p }); return error ? { ok: false, error: clean(error) } : { ok: true, ...data }; }
export async function getExchanges(siteId) {
  if (isDemo) return [];
  let q = supabase.from("material_exchanges").select("*, sites(name), purchase_orders(po_no), material_exchange_lines(id, item_name, unit, return_qty, rate)").order("id", { ascending: false });
  if (siteId && siteId !== "all") q = q.eq("site_id", Number(siteId));
  const { data, error } = await q; if (error) throw new Error(clean(error));
  return (data || []).map(e => ({ ...e, site: e.sites?.name || "", po_no: e.purchase_orders?.po_no || "", lines: e.material_exchange_lines || [] }));
}
