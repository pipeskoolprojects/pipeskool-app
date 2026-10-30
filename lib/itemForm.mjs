// update487: the Item / Material Master "Add item" rules in ONE place, used by the Item Master page and by the
// in-page Add-item drawer of Excel import. Pure functions (no network) — the save itself is lib/stock.js addItem().
import { norm, unitNorm, attrs, tokenSet } from "./importMatch.mjs";

export const UNITS = ["Nos", "Rmt", "Mtr", "Kg", "Set", "Box", "Litre", "Bag"];
export const BLANK_ITEM = { item_type: "Pipe", material: "", sub_type: "", size: "", item_class: "", make: "", unit: "Rmt", hsn_code: "", min_stock: "", is_active: true, photo_url: null };

/** the name the database builds (generated column item_master.display_name) */
export function displayName(f) {
  const t = v => String(v ?? "").trim();
  return `${t(f.item_type)} - ${t(f.material)}${t(f.sub_type) ? " " + t(f.sub_type) : ""}${t(f.size) ? " " + t(f.size) : ""}${t(f.item_class) ? " (" + t(f.item_class) + ")" : ""}${t(f.make) ? " [" + t(f.make) + "]" : ""}`;
}
/** the row written to item_master — same as the Item Master page has always sent */
export function itemPayload(f) {
  return { item_type: f.item_type, material: String(f.material || "").trim(), sub_type: String(f.sub_type || "").trim() || null,
    size: String(f.size || "").trim() || null, item_class: String(f.item_class || "").trim() || null, make: String(f.make || "").trim() || null,
    unit: f.unit, hsn_code: String(f.hsn_code || "").trim() || null, min_stock: Number(f.min_stock || 0) };
}
export const MATERIAL_REQUIRED = "Material / name is required — it's the main part of the item name.";
export const DUPLICATE_MSG = "This item already exists in the master (same type, material, size, class and make).";
export function validateItem(f) { return String(f.material || "").trim() ? null : MATERIAL_REQUIRED; }
const nv = v => String(v || "").trim().toLowerCase();
/** same six fields as the unique index on item_master */
export const sameItem = (a, b) => nv(a.item_type) === nv(b.item_type) && nv(a.material) === nv(b.material) && nv(a.sub_type) === nv(b.sub_type)
  && nv(a.size) === nv(b.size) && nv(a.item_class) === nv(b.item_class) && nv(a.make) === nv(b.make);

// ---------------------------------------------------------------- pre-fill from an Excel row (update487)
const TYPE_WORDS = [
  ["Valve", /\b(valves?|cock|arv|nrv|prv|strainer|foot ?valve)\b/i],
  ["Fitting", /\b(elbow|tee|coupler|coupling|union|adaptor|adapter|mta|fta|bend|reducer|bush|nipple|socket|plug|cap|flange|wye|cross|trap|clip|saddle|connector)\b/i],
  ["Pipe", /\bpipes?\b/i],
  ["Hardware", /\b(nut|bolt|screw|washer|clamp|khilla|fastner|fastener|anchor|rod|wheel|bit|patti|wire|nail)\b/i],
  ["Pump", /\bpumps?\b/i], ["Tank", /\btanks?\b/i], ["Fixture", /\b(tap|faucet|shower|basin|wc|closet|mixer|spout|sink)\b/i],
  ["Consumable", /\b(solvent|cement|tape|teflon|thread|primer|sealant|grease|lubricant)\b/i],
];
const KEEP_UPPER = new Set(["CI", "GI", "MS", "SS", "PP", "PVC", "CPVC", "UPVC", "SWR", "HDPE", "PPR", "ARV", "NRV", "PRV", "MTA", "FTA", "DI", "GM", "RCC", "WC"]);
const titleWord = w => KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const UNIT_TO_MASTER = { nos: "Nos", mtr: "Mtr", kg: "Kg", set: "Set", box: "Box", ltr: "Litre", bag: "Bag" };

/**
 * Excel text → a pre-filled Add-item form. ctx: { unit, types[], makes[] (spelling as in the master), items[] (for HSN) }.
 * Returns { form, inferred: Set(field), missing: Set(field) } — missing fields are highlighted on the form.
 */
export function prefillItem(text, { unit = "", types = [], makes = [], items = [] } = {}) {
  let s = String(text || "").replace(/\s+/g, " ").trim();
  const inferred = new Set(), missing = new Set();
  const form = { ...BLANK_ITEM, unit: "Nos" };
  // make: a brand that is already in the master (whole word, longest first)
  const mk = [...makes].filter(Boolean).sort((a, b) => b.length - a.length).find(m => new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i").test(s));
  if (mk) { form.make = mk; inferred.add("make"); s = s.replace(new RegExp(mk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " "); }
  // size: 110x90 mm · 40 mm · 1 1/2" · 2 inch
  const sz = /(\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?\s*mm)|(\d+(?:\.\d+)?\s*mm)|(\d+(?:\s+\d\/\d|\/\d|\.\d+)?\s*(?:"|''|inch(?:es)?|in\b))/i.exec(s);
  if (sz) {
    const raw = sz[0]; const a = attrs(raw);
    form.size = sz[1] ? raw.replace(/\s+/g, "").replace(/[×*]/g, "x").toLowerCase() : sz[2] ? raw.replace(/\s+/g, "").toLowerCase() : norm(raw).replace(/\s/g, "");
    if (a.sizes.length || /inch/.test(form.size)) inferred.add("size");
    s = s.replace(raw, " ");
  }
  // class: SCH 40 / SDR 11 / PN 10 / heavy / medium / light
  const cl = /\b(sch(?:edule)?\s*-?\s*(\d+)|sdr\s*-?\s*(\d+(?:\.\d+)?)|pn\s*-?\s*(\d+)|heavy|medium|light)\b/i.exec(s);
  if (cl) {
    form.item_class = cl[2] ? "SCHEDULE " + cl[2] : cl[3] ? "SDR " + cl[3] : cl[4] ? "PN" + cl[4] : titleWord(cl[1]);
    inferred.add("item_class"); s = s.replace(cl[0], " ");
  }
  // type from keywords, if the master has that type
  const hit = TYPE_WORDS.find(([, re]) => re.test(s));
  const t = hit && (types.length ? types.find(x => x.toLowerCase() === hit[0].toLowerCase()) : hit[0]);
  if (t) { form.item_type = t; inferred.add("item_type"); } else { form.item_type = types.find(x => /^general$/i.test(x)) || types[0] || "Fitting"; missing.add("item_type"); }
  // material = what is left, title-cased (CPVC / GI / ARV kept upper case)
  form.material = s.replace(/[^\w\s./-]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).map(titleWord).join(" ");
  if (form.material) inferred.add("material"); else missing.add("material");
  // unit from the sheet
  const un = UNIT_TO_MASTER[unitNorm(unit)];
  if (unit && un) { form.unit = un; inferred.add("unit"); } else { form.unit = hit?.[0] === "Pipe" ? "Rmt" : "Nos"; if (!unit) missing.add("unit"); else missing.add("unit"); }
  // HSN: the closest existing item of the same type that has one
  const words = new Set(norm(form.material).split(" ").filter(w => w.length > 1));
  let best = null, bestScore = 0;
  for (const it of items) {
    if (!it.hsn_code || nv(it.item_type) !== nv(form.item_type)) continue;
    const iw = norm(`${it.material || ""} ${it.sub_type || ""}`).split(" "); let n = 0; iw.forEach(w => { if (words.has(w)) n++; });
    const sc = n + (nv(it.make) === nv(form.make) && form.make ? 0.5 : 0);
    if (sc > bestScore) { bestScore = sc; best = it; }
  }
  if (best && bestScore >= 1) { form.hsn_code = best.hsn_code; inferred.add("hsn_code"); } else missing.add("hsn_code");
  if (!form.size) missing.add("size");
  if (!form.make) missing.add("make");
  return { form, inferred, missing };
}

/** items in the master that look like this new item (for "Use this item instead"); exact = same six fields */
export function similarItems(f, items, limit = 4) {
  const name = displayName(f); const fa = attrs(name);
  const out = [];
  for (const it of items) {
    if (it.is_active === false) continue;
    const exact = sameItem(f, it);
    let sc = tokenSet(name, it.display_name);
    if (!exact && fa.sizes.length) { const ia = attrs(it.display_name); if (ia.sizes.length && !ia.sizes.some(s => s.some(x => fa.sizes.some(t => t.includes(x))))) sc *= 0.8; }
    if (exact || sc >= 0.5) out.push({ ...it, exact, score: exact ? 1 : Math.round(sc * 100) / 100 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
