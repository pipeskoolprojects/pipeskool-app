"use client";
import { supabase, isDemo } from "./supabase";
import { searchItems } from "./stock";

export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
export const BOQ_TEMPLATE_HEADERS = ["item_code", "description", "unit", "boq_qty", "rate", "section"];

let demoBoq = [
  { id: 1, site_id: 1, item_code: "WS-01", description: "MS 350NB header piping", unit: "Rmt", boq_qty: 850, rate: 1850, section: "Water Supply", done_qty: 512 },
  { id: 2, site_id: 1, item_code: "DR-04", description: "UPVC 110mm SWR pipe laying", unit: "Rmt", boq_qty: 2400, rate: 420, section: "Drainage", done_qty: 1685 },
];

export async function getBoqItems(siteId) {
  if (isDemo) return demoBoq.filter(b => !siteId || b.site_id === siteId);
  let q = supabase.from("v_boq_progress").select("*").order("item_code");
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data } = await q;
  return (data || []).map(b => ({ id: b.id, site_id: b.site_id, site: b.site_name, item_code: b.item_code,
    description: b.description, short_name: b.short_name || "", display: b.short_name || b.description, unit: b.unit, section: b.section, boq_qty: Number(b.boq_qty),
    done_qty: Number(b.done_qty), pct: Number(b.pct) }));
}

export async function saveBoqItem(v) {
  if (isDemo) { if (v.id) demoBoq = demoBoq.map(x => x.id === v.id ? { ...x, ...v } : x); else demoBoq = [...demoBoq, { ...v, id: Date.now(), done_qty: 0 }]; return { ok: true }; }
  const payload = { site_id: v.site_id, item_code: v.item_code || null, description: v.description,
    short_name: (v.short_name || "").trim() || null,
    unit: v.unit || null, boq_qty: Number(v.boq_qty || 0), rate: v.rate ? Number(v.rate) : null, section: v.section || null };
  let error;
  if (v.id) ({ error } = await supabase.from("boq_items").update(payload).eq("id", v.id));
  else ({ error } = await supabase.from("boq_items").insert(payload));
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function bulkImportBoq(rows, siteId) {
  if (isDemo) return { ok: true, created: rows.length, errors: [] };
  let created = 0; const errors = [];
  const payload = [];
  rows.forEach((r, i) => {
    if (!r.description) { errors.push(`Row ${i + 2}: description required`); return; }
    payload.push({ site_id: siteId, item_code: r.item_code || null, description: r.description,
      unit: r.unit || null, boq_qty: Number(r.boq_qty || 0), rate: r.rate ? Number(r.rate) : null, section: r.section || null });
  });
  if (payload.length) {
    const { error } = await supabase.from("boq_items").insert(payload);
    if (error) return { ok: false, error: error.message, created: 0, errors };
    created = payload.length;
  }
  return { ok: errors.length === 0, created, errors };
}

// combined search for DPR dropdown: BOQ lines + material master
export async function searchWorkItems(siteId, query) {
  const out = [];
  const boq = await getBoqItems(siteId);
  const q = (query || "").toLowerCase();
  boq.filter(b => !q || (b.description + " " + (b.short_name || "") + " " + (b.item_code || "")).toLowerCase().includes(q))
     .slice(0, 8)
     .forEach(b => out.push({ kind: "boq", boq_item_id: b.id, label: (b.item_code ? b.item_code + " · " : "") + (b.short_name || b.description),
       unit: b.unit, boq_qty: b.boq_qty, done_qty: b.done_qty, pct: b.pct }));
  if (q.length >= 2) {
    const items = await searchItems(query);
    (items || []).slice(0, 6).forEach(i => out.push({ kind: "material", item_id: i.id, label: i.display_name, unit: i.unit }));
  }
  return out;
}


// Auto-generate concise short names for lines that lack one.
// Heuristic: text up to the first sentence break after ~25 chars, capped ~70.
export function makeShortName(desc) {
  let t = String(desc || "").replace(/\s+/g, " ").trim();
  t = t.replace(/\[[^\]]*\]\s*$/, "").trim();                 // drop trailing [MAKE]
  const cut = t.slice(25).search(/[.,;(]/);
  if (cut >= 0) t = t.slice(0, 25 + cut);
  if (t.length > 70) t = t.slice(0, 70).replace(/\s+\S*$/, "");
  return t.trim();
}

export async function autoShortenBoq(siteId) {
  if (isDemo) return { ok: true, count: 0 };
  const { data: items } = await supabase.from("boq_items")
    .select("id, description, short_name").eq("site_id", siteId).eq("is_active", true);
  const todo = (items || []).filter(i => !i.short_name);
  for (const i of todo) {
    const { error } = await supabase.from("boq_items").update({ short_name: makeShortName(i.description) }).eq("id", i.id);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, count: todo.length };
}
