"use client";
// update369: BOQ <-> MATERIAL KITS.
//
// Each BOQ line owns a kit: Item Master materials with a quantity PER BOQ UNIT. The site's
// approved material list, and how much of each is allowed, is DERIVED from the kits
// (v_site_allowed_materials) — nobody maintains a second list.
//
//   allowed_qty  = Σ boq_qty × qty_per_unit  over the site's active BOQ lines
//   remaining    = allowed_qty − qty already on live indents at that site
//
// Strict categories (pipe, fitting, valve, fixture, sanitary) may only indent kit items
// without a Director-approved deviation. Open categories are untouched.
import { supabase, isDemo } from "./supabase";
import { searchItems, searchTokens } from "./stock";   // update371

function clean(e) {
  const m = String(e?.message || e || "Something went wrong");
  if (/could not find a relationship|no relationship/i.test(m)) return "A table link is missing: " + m;
  if (/boq_item_materials|v_site_allowed|fn_set_boq_kit|fn_remove_boq_kit|fn_copy_boq_kits|fn_review_deviation|boq_strict/i.test(m))
    return "Run pipeskool_boq_materials.sql (update 369) in Supabase first.";
  if (/schema cache/i.test(m)) return "The database API has not picked up a recent change — run  notify pgrst, 'reload schema';  in Supabase.\n\n" + m;
  return m.replace(/^.*?ERROR:\s*/i, "");
}

// ---- kits on a site's BOQ ----
export async function getBoqKits(siteId) {
  if (isDemo) return {};
  const { data, error } = await supabase.from("boq_item_materials")
    .select("id, boq_item_id, item_id, qty_per_unit, note, added_by_name, added_at, boq_items!inner(site_id), item_master(display_name, item_type, unit)")
    .eq("boq_items.site_id", siteId);
  if (error) throw new Error(clean(error));
  const by = {};
  (data || []).forEach(r => {
    (by[r.boq_item_id] = by[r.boq_item_id] || []).push({
      ...r, name: r.item_master?.display_name || "#" + r.item_id,
      type: r.item_master?.item_type || "", unit: r.item_master?.unit || "",
    });
  });
  return by;
}

export async function setBoqKit(boqItemId, itemId, qtyPerUnit, note) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.rpc("fn_set_boq_kit", {
    p_boq_item_id: Number(boqItemId), p_item_id: Number(itemId),
    p_qty_per_unit: Number(qtyPerUnit) || 1, p_note: note || null,
  });
  return error ? { ok: false, error: clean(error) } : { ok: true };
}

export async function removeBoqKit(boqItemId, itemId) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.rpc("fn_remove_boq_kit", { p_boq_item_id: Number(boqItemId), p_item_id: Number(itemId) });
  return error ? { ok: false, error: clean(error) } : { ok: true };
}

export async function copyBoqKits(fromSite, toSite) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_copy_boq_kits", { p_from_site: Number(fromSite), p_to_site: Number(toSite) });
  return error ? { ok: false, error: clean(error) } : { ok: true, copied: data?.copied || 0 };
}

// ---- suggestions: Item Master rows whose name shares words with the BOQ description ----
export async function suggestMaterials(description, limit = 6) {
  if (isDemo || !description) return [];
  // the BOQ description is long and wordy; keep the tokens that describe the MATERIAL and
  // drop the ones that describe the WORK ("providing", "laying", "complete")
  const words = searchTokens(String(description)).filter(w => w.length >= 2 && !STOP.has(w)).slice(0, 5);
  if (!words.length) return [];
  // any-of search (a description rarely contains every token of one item name), then rank
  const rows = await searchItems(words.join(" "), 40).catch(() => []);
  const fallback = rows.length ? rows : (await Promise.all(words.slice(0, 3).map(w => searchItems(w, 20).catch(() => [])))).flat();
  const seen = new Set();
  const score = n => words.reduce((s, w) => s + (String(n).toLowerCase().includes(w) ? 1 : 0), 0);
  return fallback.filter(x => !seen.has(x.id) && seen.add(x.id))
    .map(x => ({ ...x, score: score(x.display_name) })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, limit);
}
const STOP = new Set(["and", "the", "with", "for", "including", "supply", "fixing", "providing", "laying", "complete", "all", "etc", "nos", "rmt", "per", "as", "of"]);

// update371: THE SAME SEARCH THE INDENT FORM USES. searchItems() tokenises the query, so
// "15mm cpvc", "cpvc 15mm" and "cpvc pipe 15" all find "Pipe - CPVC 15mm", and it matches
// on type, material, size, make and HSN as well as the name. 370's version was my own
// substring search and needed the words in the item's order — the one screen in the app
// that did. Never again: item search is searchItems(), full stop.
export async function searchMaterials(q, limit = 200) {
  if (isDemo || !q) return [];
  const rows = await searchItems(q, limit);
  // group-stable order for the kit editor: type first, then the ranked order within a type
  return rows.map((r, i) => ({ ...r, _i: i }))
    .sort((a, b) => String(a.item_type || "").localeCompare(String(b.item_type || "")) || a._i - b._i);
}

// ---- what a site may buy, and how much is left ----
export async function getSiteAllowance(siteId) {
  if (isDemo) return { allowed: {}, usage: {}, strictTypes: new Set() };
  const [{ data: allowed, error: e1 }, { data: usage, error: e2 }, { data: types }] = await Promise.all([
    supabase.from("v_site_allowed_materials").select("*").eq("site_id", siteId),
    supabase.from("v_site_material_usage").select("*").eq("site_id", siteId),
    supabase.from("item_types").select("label, boq_strict"),
  ]);
  if (e1) throw new Error(clean(e1));
  if (e2) throw new Error(clean(e2));
  const a = {}; (allowed || []).forEach(r => { a[r.item_id] = r; });
  const u = {}; (usage || []).forEach(r => { u[r.item_id] = Number(r.indented_qty || 0); u["name:" + r.item_name_key] = Number(r.indented_qty || 0); });
  const strictTypes = new Set((types || []).filter(t => t.boq_strict).map(t => String(t.label).toLowerCase()));
  return { allowed: a, usage: u, strictTypes, hasKits: Object.keys(a).length > 0 };
}

// Classify one indent line for a site. Returns null when nothing is wrong.
//   { kind: 'off_boq' | 'over_qty', message, remaining }
export function checkLine(allowance, line) {
  if (!allowance?.hasKits) return null;                              // site has no kits yet: nothing to enforce
  const type = String(line.item_type || "").toLowerCase();
  const strict = allowance.strictTypes.has(type);
  const a = line.item_id ? allowance.allowed[line.item_id] : null;
  if (!a) {
    return strict
      ? { kind: "off_boq", message: `Not in this site's BOQ (${line.item_type || "material"} is a strict category)`, remaining: 0 }
      : null;
  }
  const used = Number(allowance.usage[line.item_id] || 0);
  const remaining = +(Number(a.allowed_qty) - used).toFixed(3);
  if (Number(line.qty) > remaining) {
    return { kind: "over_qty", message: `Exceeds BOQ — ${a.boq_refs} allows ${Number(a.allowed_qty)} ${a.unit || ""}, ${remaining} remaining`, remaining };
  }
  return null;
}

// ---- deviations ----
export async function listPendingDeviations() {
  if (isDemo) return [];
  const { data, error } = await supabase.from("material_indent_items")
    .select("id, item_name, qty, unit, deviation_kind, deviation_reason, deviation_status, material_indents!inner(indent_no, site_id, sites(name), raised:raised_by(full_name))")
    .eq("deviation_status", "pending");
  if (error) throw new Error(clean(error));
  return (data || []).map(r => ({ ...r, indent_no: r.material_indents?.indent_no,
    site: r.material_indents?.sites?.name || "—", raisedBy: r.material_indents?.raised?.full_name || "—" }));
}

export async function reviewDeviation(lineId, action, note) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.rpc("fn_review_deviation", { p_line_id: Number(lineId), p_action: action, p_note: note || null });
  return error ? { ok: false, error: clean(error) } : { ok: true };
}
