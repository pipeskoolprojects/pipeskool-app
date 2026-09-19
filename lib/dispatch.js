"use client";
// update403: INTERNAL DISPATCH CHALLANS — Office/warehouse → Site. Draft → In Transit → Delivered.
// Stock moves only on Delivered (server function): issue at source, receipt at destination.
import { supabase, isDemo } from "./supabase";

const clean = e => { const m = String(e?.message || e || ""); return /internal_dispatch|fn_idc_|schema cache/i.test(m) ? "Run pipeskool_internal_dispatch.sql (update 403) in Supabase first." : m.replace(/^.*?ERROR:\s*/i, ""); };
export const IDC_STATUS = { draft: ["Draft", "gray"], in_transit: ["In Transit", "warn"], delivered: ["Delivered", "p"], cancelled: ["Cancelled", "gray"] };

export async function getDispatches() {
  if (isDemo) return [];
  const { data, error } = await supabase.from("internal_dispatches")
    .select("*, from_site:from_site_id(name), to_site:to_site_id(name), creator:created_by(full_name), internal_dispatch_items(id, item_id, item_name, unit, qty, note)")
    .order("id", { ascending: false });
  if (error) throw new Error(clean(error));
  return (data || []).map(d => ({ ...d, from: d.from_site?.name || "—", to: d.to_site?.name || "—", items: d.internal_dispatch_items || [], creator_name: d.creator?.full_name || "" }));
}
export async function saveDispatch(id, p) { if (isDemo) return { ok: false, error: "Demo mode." }; const { data, error } = await supabase.rpc("fn_idc_save", { p_id: id || null, p }); return error ? { ok: false, error: clean(error) } : { ok: true, id: data }; }
export async function setDispatchStatus(id, status, reason) { if (isDemo) return { ok: false, error: "Demo mode." }; const { error } = await supabase.rpc("fn_idc_set_status", { p_id: id, p_status: status, p_reason: reason || null }); return error ? { ok: false, error: clean(error) } : { ok: true }; }
