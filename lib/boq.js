"use client";
import { supabase, isDemo } from "./supabase";
import { searchItems, searchTokens } from "./stock";
import { getSiteAllowance } from "./boqMaterials";   // update372

export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
export const BOQ_TEMPLATE_HEADERS = ["item_code", "description", "unit", "boq_qty", "rate", "section", "basic_rate"];   // update260: basic_rate optional — CP/sanitary lines only

let demoBoq = [
  { id: 1, site_id: 1, item_code: "WS-01", description: "MS 350NB header piping", unit: "Rmt", boq_qty: 850, rate: 1850, section: "Water Supply", done_qty: 512 },
  { id: 2, site_id: 1, item_code: "DR-04", description: "UPVC 110mm SWR pipe laying", unit: "Rmt", boq_qty: 2400, rate: 420, section: "Drainage", done_qty: 1685 },
];

export async function getBoqItems(siteId) {
  if (isDemo) return demoBoq.filter(b => !siteId || b.site_id === siteId);
  let q = supabase.from("v_boq_progress").select("*").order("item_code");
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data } = await q;
  const out = (data || []).map(b => ({ id: b.id, site_id: b.site_id, site: b.site_name, item_code: b.item_code,
    description: b.description, short_name: b.short_name || "", display: b.short_name || b.description, unit: b.unit, section: b.section, boq_qty: Number(b.boq_qty),
    rate: b.rate != null ? Number(b.rate) : null,                                    // update260
    is_extra: !!b.is_extra, extra_status: b.extra_status || null,                    // update260: non-tender items
    basic_rate: b.basic_rate != null ? Number(b.basic_rate) : null, item_id: b.item_id || null,   // update260: basic-rate diff
    done_qty: Number(b.done_qty), pct: Number(b.pct) }));
  // update260: show the linked item's NAME (not just an id) on the BOQ edit form
  const ids = [...new Set(out.filter(r => r.item_id).map(r => r.item_id))];
  if (ids.length) {
    const { data: names } = await supabase.from("item_master").select("id, display_name").in("id", ids);
    const nm = {}; (names || []).forEach(n => { nm[n.id] = n.display_name; });
    out.forEach(r => { if (r.item_id) r.item_name = nm[r.item_id] || ""; });
  }
  return out;
}

export async function saveBoqItem(v) {
  if (isDemo) { if (v.id) demoBoq = demoBoq.map(x => x.id === v.id ? { ...x, ...v } : x); else demoBoq = [...demoBoq, { ...v, id: Date.now(), done_qty: 0 }]; return { ok: true }; }
  const payload = { site_id: v.site_id, item_code: v.item_code || null, description: v.description,
    short_name: (v.short_name || "").trim() || null,
    unit: v.unit || null, boq_qty: Number(v.boq_qty || 0), rate: v.rate ? Number(v.rate) : null, section: v.section || null,
    is_extra: !!v.is_extra,                                                          // update260
    extra_status: v.is_extra ? (v.extra_status || "pending") : null,                 // update260: approval applies to extras only
    basic_rate: v.basic_rate !== "" && v.basic_rate != null ? Number(v.basic_rate) : null,
    item_id: v.item_id || null };
  // update260: a saved bill freezes qty & rate for its own lines, so editing here only
  // affects FUTURE bills — but amendments (with reason) should go through fn_amend_boq.
  let error;
  if (v.id) ({ error } = await supabase.from("boq_items").update(payload).eq("id", v.id));
  else ({ error } = await supabase.from("boq_items").insert(payload));
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function bulkImportBoq(rows, siteId, importId) {   // update455: importId optional
  if (isDemo) return { ok: true, created: rows.length, errors: [] };
  let created = 0; const errors = [];
  const payload = [];
  rows.forEach((r, i) => {
    if (!r.description) { errors.push(`Row ${i + 2}: description required`); return; }
    payload.push({ site_id: siteId, item_code: r.item_code || null, description: r.description,
      unit: r.unit || null, boq_qty: Number(r.boq_qty || 0), rate: r.rate ? Number(r.rate) : null, section: r.section || null,
      basic_rate: r.basic_rate ? Number(r.basic_rate) : null,   // update260
      ...(importId ? { import_id: importId } : {}) });            // update455: which import run created the line
  });
  if (payload.length) {
    // update455: 1,000-row inserts can hit the request limit — write in pages
    for (let f = 0; f < payload.length; f += 400) {
      const { error } = await supabase.from("boq_items").insert(payload.slice(f, f + 400));
      if (error) return { ok: false, error: error.message, created, errors };
      created += Math.min(400, payload.length - f);
    }
  }
  return { ok: errors.length === 0, created, errors };
}

// ---------------------------------------------------------------- update455: smart import — per-site templates, log, contract terms
const needSql = e => /boq_import_templates|boq_imports|site_contract_terms|fn_boq_|fn_site_terms|schema cache|Could not find/i.test(e || "") ? "Run pipeskool_boq_smart_import.sql (update 455) in Supabase first." : e;
export async function getBoqTemplate(siteId) {
  if (isDemo || !siteId) return null;
  const { data } = await supabase.from("boq_import_templates").select("id, site_id, name, client_name, template, source_file, updated_at, created_by_name").eq("site_id", Number(siteId)).maybeSingle();
  return data || null;
}
export async function getUnassignedBoqTemplates() {
  if (isDemo) return [];
  const { data } = await supabase.from("boq_import_templates").select("id, name, client_name, source_file").is("site_id", null).order("id");
  return data || [];
}
export async function saveBoqTemplate(siteId, name, template, clientName, sourceFile) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_boq_template_save", { p_site_id: Number(siteId), p_name: name, p_template: template, p_client_name: clientName || null, p_source_file: sourceFile || null });
  if (error) return { ok: false, error: needSql(error.message) };
  return data?.ok ? { ok: true, id: data.id } : { ok: false, error: data?.error || "Could not save the template." };
}
export async function assignBoqTemplate(templateId, siteId) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_boq_template_assign", { p_template_id: Number(templateId), p_site_id: Number(siteId) });
  if (error) return { ok: false, error: needSql(error.message) };
  return data?.ok ? { ok: true } : { ok: false, error: data?.error };
}
export async function logBoqImport(siteId, templateId, info) {
  if (isDemo) return { ok: true, id: null };
  const { data, error } = await supabase.rpc("fn_boq_import_log", { p_site_id: Number(siteId), p_template_id: templateId || null, p_info: info });
  if (error) return { ok: false, error: needSql(error.message) };
  return data?.ok ? { ok: true, id: data.id } : { ok: false, error: data?.error };
}
export async function getBoqImports(siteId) {
  if (isDemo || !siteId) return [];
  const { data } = await supabase.from("boq_imports").select("*").eq("site_id", Number(siteId)).order("imported_at", { ascending: false }).limit(20);
  return data || [];
}
export async function getSiteTerms(siteId) {
  if (isDemo || !siteId) return null;
  const { data } = await supabase.from("site_contract_terms").select("*").eq("site_id", Number(siteId)).maybeSingle();
  return data || null;
}
export async function saveSiteTerms(siteId, terms) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_site_terms_save", { p_site_id: Number(siteId), p_terms: terms });
  if (error) return { ok: false, error: needSql(error.message) };
  return data?.ok ? { ok: true } : { ok: false, error: data?.error };
}
// the LOI / work order PDF for the Contract Terms card → attendance-photos/contracts/<site>-<ts>.pdf (public bucket, like bills)
export async function uploadLoi(siteId, file) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  // update456: the original file name travels in the path (after "__") so the card can show it back
  const base = String(file.name).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9 _.-]+/g, "-").trim().slice(0, 80) || "LOI";
  const path = `contracts/site-${siteId}-loi-${Date.now()}__${base}.${ext}`;
  const { error } = await supabase.storage.from("attendance-photos").upload(path, file, { contentType: file.type || undefined });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}
// update456: { name, date } shown on the Contract Terms card for a stored LOI path
export function loiInfo(path) {
  if (!path) return null;
  const file = String(path).split("/").pop();
  const m = file.match(/^site-\d+-loi-(\d+)(?:__(.+?))?(\.[A-Za-z0-9]+)?$/);
  const ts = m ? Number(m[1]) : null;
  const name = m ? `${m[2] || "LOI document"}${m[3] || ""}` : file;   // files attached before 456 carry no original name
  return { name, date: ts ? new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "" };
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


// Indent autocomplete: material master + this site's BOQ, one list.
export async function searchIndentCatalog(siteId, q) {
  const [items, allowance] = await Promise.all([
    searchItems(q, 80),
    siteId ? getSiteAllowance(siteId).catch(() => null) : Promise.resolve(null),
  ]);
  const out = [];
  // update372: THE SITE'S BOQ KIT DECIDES WHAT IS OFFERED.
  //   strict category (pipe/fitting/valve…) at a site with kits -> ONLY kit items are listed,
  //   each tagged ✓ BOQ with its line and remaining quantity. SDR-13.5 does not appear at
  //   SOUL because SOUL's kit says SDR-11.
  //   open category, or a site with no kits yet -> everything, as before.
  //   The picker is convenience; the deviation check on submit and the PO block are the
  //   controls — someone can still type an off-BOQ item, and it will be flagged.
  const hasKits = !!allowance?.hasKits;
  (items || []).forEach(i => {
    const a = hasKits ? allowance.allowed[i.id] : null;
    const strict = hasKits && allowance.strictTypes.has(String(i.item_type || "").toLowerCase());
    if (strict && !a) return;                                  // not in this site's BOQ: not offered
    const used = a ? Number(allowance.usage[i.id] || 0) : 0;
    const remaining = a ? +(Number(a.allowed_qty) - used).toFixed(3) : null;
    out.push({ kind: "item", item_id: i.id, label: i.display_name, unit: i.unit, item_type: i.item_type,
               boq: !!a, boqRefs: a?.boq_refs || "", allowed: a ? Number(a.allowed_qty) : null, remaining });
  });
  // BOQ-approved items first, then the rest
  out.sort((x, y) => Number(y.boq) - Number(x.boq));
  out.splice(8);
  // update373: BOQ LINES ARE NO LONGER OFFERED AS PICKS. Update 166 mixed them in so an
  // indent could be raised "against" a BOQ line. With kits, the line already resolves to
  // its materials, and picking the line itself produced an indent with no item_id — which
  // the BOQ check cannot evaluate and a PO cannot be priced from. Only Item Master items.
  return out;
}


// ---------------- update260: BOQ AMENDMENTS ----------------
// Qty / rate / basic-rate changes with a mandatory reason. The DB logs old -> new
// (boq_amendments) and past bills stay frozen because every bill line snapshots
// its own rate — the amended figures apply from the NEXT bill only.
export async function amendBoqItem(boqId, { boq_qty, rate, basic_rate, reason }) {
  if (isDemo) return { ok: true };
  const { data, error } = await supabase.rpc("fn_amend_boq", {
    p_boq_id: boqId,
    p_qty: boq_qty === "" || boq_qty == null ? null : Number(boq_qty),
    p_rate: rate === "" || rate == null ? null : Number(rate),
    p_basic_rate: basic_rate === "" || basic_rate == null ? null : Number(basic_rate),
    p_reason: reason || "",
  });
  if (error) return { ok: false, error: error.message };
  return data || { ok: false, error: "No response from server." };
}

export async function getBoqAmendments(siteId, boqItemId) {
  if (isDemo) return [];
  let q = supabase.from("boq_amendments")
    .select("id, boq_item_id, field, old_value, new_value, reason, amended_at, by:amended_by(full_name)")
    .eq("site_id", siteId).order("amended_at", { ascending: false }).limit(300);
  if (boqItemId) q = q.eq("boq_item_id", boqItemId);
  const { data, error } = await q;
  if (error) throw new Error("Could not load amendment history: " + error.message);
  return data || [];
}
