"use client";
// update484: Excel / CSV material list → indent → draft POs (browser side). The SQL functions (pipeskool_excel_indent_import.sql)
// check every right; this file only calls them. The indent itself is created with the normal createIndent() so
// numbering, duplicate guard, BOQ checks and notifications stay exactly as for a typed indent.
import { supabase, isDemo } from "./supabase";
import { fileStore } from "./files";
import { createIndent } from "./stock";
import { notifyRequest } from "./notify";
import { analyseSheet } from "./importParse.mjs";
import { unitNorm } from "./importMatch.mjs";

const SETUP = "Run pipeskool_excel_indent_import.sql (update 484) in Supabase first.";
const clean = e => { const m = String(e?.message || e || ""); return /fn_import|indent_import|item_alias|schema cache|does not exist/i.test(m) && /not find|does not exist|schema cache/i.test(m) ? SETUP : (m || "Failed."); };
async function rpc(fn, args) {
  if (isDemo) return { data: null, error: "Not available in demo mode." };
  const { data, error } = await supabase.rpc(fn, args);
  return error ? { data: null, error: clean(error) } : { data, error: null };
}
async function bearer() { try { const { data } = await supabase.auth.getSession(); return data?.session?.access_token || null; } catch { return null; } }
async function api(path, body) {
  const t = await bearer();
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 65000);
  try {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.ok !== false ? j : { ok: false, error: j.error || `Server error (${r.status})` };
  } catch (e) { return { ok: false, error: e?.name === "AbortError" ? "The server took too long." : String(e?.message || e) }; }
  finally { clearTimeout(timer); }
}

// ---------------------------------------------------------------- file reading
export const ACCEPT = ".xlsx,.xls,.csv";
export async function sha256(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
/** file → [{name, rows (array of arrays), analysis}] */
export async function readFile(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv ? XLSX.read(new TextDecoder().decode(buf), { type: "string" }) : XLSX.read(buf, { type: "array" });
  const sheets = wb.SheetNames.map(name => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true, blankrows: true });
    return { name, rows, analysis: analyseSheet(rows) };
  }).filter(s => s.rows.some(r => (r || []).some(c => String(c ?? "").trim())));
  return { buf, sheets };
}

// ---------------------------------------------------------------- import lifecycle
export async function checkDuplicate(hash) { const { data } = await rpc("fn_import_check_hash", { p_hash: hash }); return data || null; }
export async function uploadOriginal(file) {
  const key = `indent-imports/${Date.now()}_${String(file.name).replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80)}`;
  const { error } = await fileStore.from("indent-imports").upload(key, file, { contentType: file.type || "application/octet-stream" });
  return error ? { path: null, error: error.message } : { path: key };
}
export async function createImport(head, lines) {
  const { data, error } = await rpc("fn_import_create", { p_head: head, p_rows: lines });
  if (error) return { ok: false, error };
  return data?.ok ? { ok: true, import_id: data.import_id } : { ok: false, error: data?.error || "Could not save the import." };
}
export const matchFast = importId => api("/api/indent-import/match", { import_id: importId, phase: "fast" });
export const matchAI = importId => api("/api/indent-import/match", { import_id: importId, phase: "ai" });
export const buildEmbeddings = (limit = 300) => api("/api/indent-import/embed", { limit });
export async function aiStatus() { try { const r = await fetch("/api/indent-import/match"); return await r.json(); } catch { return { ai: false }; } }
export async function getImport(id) { const { data, error } = await rpc("fn_import_get", { p_import_id: Number(id) }); return error ? { error } : (data || { error: "Not found or not allowed." }); }
export async function listImports() { const { data } = await rpc("fn_import_list", { p_limit: 30 }); return data || []; }
export async function getSettings() { const { data } = await rpc("fn_import_settings", {}); return data; }

export async function confirmRow(rowId, itemId, action = "yes") { const { data, error } = await rpc("fn_import_confirm", { p_row_id: rowId, p_item_id: itemId, p_action: action }); return error ? { ok: false, error } : data; }
export async function acceptGreen(importId) { const { data, error } = await rpc("fn_import_accept_green", { p_import_id: importId, p_min: null }); return error ? { ok: false, error } : { ok: true, n: data }; }
export async function markRow(rowId, status) { const { data, error } = await rpc("fn_import_mark", { p_row_id: rowId, p_status: status }); return error ? { ok: false, error } : data; }
export async function setQty(rowId, qty, unit) { const { data, error } = await rpc("fn_import_set_qty", { p_row_id: rowId, p_qty: Number(qty), p_unit: unit || null }); return error ? { ok: false, error } : data; }
export async function requestItem(rowId, note) { const { data, error } = await rpc("fn_import_request_item", { p_row_id: rowId, p_note: note || null }); return error ? { ok: false, error } : data; }
export async function cancelImport(id) { const { data, error } = await rpc("fn_import_cancel", { p_import_id: id }); return error ? { ok: false, error } : data; }
export async function overlap(siteId, itemIds) { const { data } = await rpc("fn_import_overlap", { p_site_id: siteId, p_item_ids: itemIds }); return data || []; }
export async function itemDetails(ids) { const { data } = await rpc("fn_import_items", { p_ids: ids }); return data || []; }

/** lines that go into the indent, in row order */
export function indentLines(rows) {
  return rows.filter(r => r.status === "auto" || r.status === "accepted" || r.status === "to_source").map(r => {
    if (r.status === "to_source") return { row_id: r.id, item_id: null, item_name: r.item_text, qty: Number(r.qty), unit: r.unit || "Nos",
      spec: ("Not in Item Master — to be sourced (Excel import)" + (r.remarks ? " · " + r.remarks : "")).slice(0, 300), purpose: null };
    const itemUnit = r.final_unit || r.suggested_unit;
    const unit = !r.unit || unitNorm(r.unit) === unitNorm(itemUnit) ? (itemUnit || r.unit || "Nos") : r.unit;
    return { row_id: r.id, item_id: r.final_item_id, item_name: r.final_name, qty: Number(r.qty), unit, spec: r.remarks || null, purpose: null, item_type: r.final_item_type || null };
  });
}
export function blockers(rows) {
  const open = rows.filter(r => ["pending", "confirm", "not_found"].includes(r.status)).length;
  const badQty = rows.filter(r => r.status !== "pending" && !(Number(r.qty) > 0)).length;
  return { open, badQty, ok: !open && !badQty && rows.some(r => ["auto", "accepted", "to_source"].includes(r.status)) };
}

/** create the indent with the normal function, then link it to the import (match log + audit) */
export async function createIndentFromImport(imp, rows, session, { allowDuplicate = false } = {}) {
  const lines = indentLines(rows);
  const res = await createIndent({ site_id: imp.site_id, raised_by: session.id, required_by: imp.required_by, urgency: imp.urgency || "normal",
    note: `Excel import: ${imp.file_name || "file"} (${lines.length} lines)`, allow_duplicate: allowDuplicate }, lines);
  if (!res.ok) return res;
  const { data: ind } = await supabase.from("material_indents").select("id, indent_no").eq("indent_no", res.indent_no).eq("site_id", imp.site_id).order("id", { ascending: false }).limit(1).maybeSingle();
  if (!ind?.id) return { ok: true, indent_no: res.indent_no, warning: "Indent created, but it could not be linked back to the import." };
  const { data: its } = await supabase.from("material_indent_items").select("id").eq("indent_id", ind.id).order("id");
  const links = lines.map((l, i) => ({ row_id: l.row_id, indent_item_id: its?.[i]?.id || null })).filter(x => x.indent_item_id);
  const { data: lk, error } = await rpc("fn_import_link_indent", { p_import_id: imp.id, p_indent_id: ind.id, p_links: links });
  return { ok: true, indent_no: ind.indent_no, indent_id: ind.id, warning: error || (lk && !lk.ok ? lk.error : null) };
}

// ---------------------------------------------------------------- rates + draft POs (pure SQL on the server)
export async function computeRates(indentId) { const { data, error } = await rpc("fn_import_compute_rates", { p_indent_id: Number(indentId) }); return error ? { ok: false, error } : data; }
export async function lineRates(indentId) { const { data } = await rpc("fn_import_line_rates", { p_indent_id: Number(indentId) }); return data || []; }
export async function createDraftPOs(indentId) {
  const { data, error } = await rpc("fn_import_draft_pos", { p_indent_id: Number(indentId) });
  if (error) return { ok: false, error };
  if (!data?.ok) return { ok: false, error: data?.error || "Could not create draft POs." };
  const n = (data.pos || []).length;
  if (n) notifyRequest({ kind: "po_approval", requestId: data.pos[0].po_id, siteId: data.site_id,
    title: `${n} draft PO${n === 1 ? "" : "s"} awaiting approval`,
    body: `${data.indent_no} · ${data.pos.map(p => p.po_no + " " + p.vendor).join(", ").slice(0, 200)} — prepared from past rates, check before approving.` });
  return data;
}

// ---------------------------------------------------------------- admin
export async function saveSettings(s) { const { data, error } = await rpc("fn_import_settings_save", { p: s }); return error ? { ok: false, error } : data; }
export async function getAliases(q) { const { data } = await rpc("fn_import_aliases", { p_q: q || null, p_limit: 300 }); return data || []; }
export async function editAlias(id, action, itemId = null) { const { data, error } = await rpc("fn_import_alias_edit", { p_id: id, p_action: action, p_item_id: itemId }); return error ? { ok: false, error } : data; }
export async function getAccuracy(days = 30) { const { data, error } = await rpc("fn_import_accuracy", { p_days: days }); return error ? { error } : data; }
export async function embedStatus() { const { data } = await rpc("fn_import_embed_status", {}); return data; }
export async function canImportAny() { const { data } = await rpc("fn_imp_can_any", {}); return !!data; }
