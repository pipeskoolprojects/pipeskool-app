// update484: Excel → indent matching rules. Pure functions (no network, no database), shared by the API route
// and the tests. Layer 1–3 candidates come from SQL (fn_import_candidates); this file scores them, applies the
// deterministic guardrails (layer 6: size, angle, brand, material, class, unit) and decides auto / confirm / not found.
// AI output goes through exactly the same guardrails, and an AI-chosen id outside the candidate list is rejected.

export const DEFAULTS = { auto_threshold: 0.92, confirm_threshold: 0.6, shadow_mode: true, always_ask_ai: false };

// ----------------------------------------------------------------- normalising (close to SQL fn_imp_norm)
export function norm(t) {
  let s = String(t ?? "").toLowerCase();
  s = s.replace(/½/g, " 1/2").replace(/¼/g, " 1/4").replace(/¾/g, " 3/4").replace(/[”“″]/g, '"').replace(/[’‘′`]/g, "'").replace(/×/g, "x");
  s = s.replace(/(\d)\s+(\d\/\d)/g, "$1-$2");
  s = s.replace(/(\d)\s*(?:"|''|inches|inch|in)(?![a-z])/g, "$1inch");
  s = s.replace(/(\d)\s*(?:millimet(?:er|re)s?|mm)(?![a-z])/g, "$1mm");
  s = s.replace(/(\d)\s*(?:°|degrees?|deg)(?![a-z])/g, "$1deg");
  s = s.replace(/(\d)\s*(?:kgs?|kilograms?)(?![a-z])/g, "$1kg");
  s = s.replace(/(\d)\s*[x*]\s*(\d)/g, "$1x$2");
  s = s.replace(/sch(?:edule)?\s*-?\s*(\d+)/g, "sch$1");
  s = s.replace(/[^a-z0-9./-]+/g, " ");
  s = s.replace(/(^|\s)[-./]+(?=\s|$)/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
export function unitNorm(u) {
  const x = String(u ?? "").replace(/[^A-Za-z]/g, "").toLowerCase();
  if (["nos", "no", "pcs", "pc", "each", "unit", "units", "piece", "pieces", "number", "numbers", "ea", ""].includes(x)) return "nos";
  if (["mtr", "mtrs", "m", "meter", "meters", "metre", "metres", "rmt", "rm", "rmtr", "runningmeter", "rmtrs"].includes(x)) return "mtr";
  if (["kg", "kgs", "kilogram", "kilograms"].includes(x)) return "kg";
  if (["set", "sets"].includes(x)) return "set";
  if (["box", "boxes"].includes(x)) return "box";
  if (["packet", "packets", "pkt", "pkts", "pack", "packs"].includes(x)) return "packet";
  if (["bag", "bags"].includes(x)) return "bag";
  if (["roll", "rolls"].includes(x)) return "roll";
  if (["pair", "pairs"].includes(x)) return "pair";
  if (["ltr", "ltrs", "litre", "litres", "liter", "liters", "l"].includes(x)) return "ltr";
  if (["ton", "tons", "tonne", "tonnes"].includes(x)) return "ton";
  return x;
}

// ----------------------------------------------------------------- attributes (step 3)
// nominal pipe sizes: inch → the mm sizes used for it in Item Master names (CPVC / UPVC / SWR differ)
const INCH_MM = { 0.5: [15, 20], 0.75: [20, 25], 1: [25, 32], 1.25: [32, 40], 1.5: [40, 50], 2: [50, 63], 2.5: [65, 75], 3: [75, 80, 90],
  4: [100, 110], 5: [125, 140], 6: [150, 160], 8: [200], 10: [250], 12: [300] };
const inchValue = s => { const m = /^(\d+)-(\d)\/(\d)$/.exec(s); if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  const f = /^(\d)\/(\d)$/.exec(s); if (f) return Number(f[1]) / Number(f[2]); return Number(s); };
const MATERIALS = ["upvc", "cpvc", "swr", "gi", "ppr", "hdpe", "ms", "ci", "di", "gm", "brass", "ss", "pp", "pvc", "copper", "rcc", "agri", "drainpro", "silencio", "aquasafe"];
const PVC_FAMILY = ["upvc", "cpvc", "swr", "pvc", "agri", "drainpro", "silencio"];

export function attrs(text, { makes = [], make = null } = {}) {
  const s = norm(text);
  const sizes = [];   // each: array of acceptable mm values
  const takeMm = (v) => sizes.push([Number(v)]);
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?mm/g)) { takeMm(m[1]); takeMm(m[2]); if (m[3]) takeMm(m[3]); }
  const s2 = s.replace(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?mm/g, " ");
  for (const m of s2.matchAll(/(\d+(?:\.\d+)?)mm/g)) takeMm(m[1]);
  for (const m of s2.matchAll(/(?:^|\s)d(\d{2,3})(?=\s|$)/g)) takeMm(m[1]);
  for (const m of s2.matchAll(/(\d+(?:-\d\/\d|\/\d|\.\d+)?)inch/g)) {
    const v = inchValue(m[1]); if (!Number.isFinite(v) || v <= 0) continue;
    sizes.push(INCH_MM[v] || [Math.round(v * 25.4)]);
  }
  const angles = [...s.matchAll(/(\d+(?:\.\d+)?)deg/g)].map(m => Number(m[1]));
  const words = new Set(s.split(" "));
  const materials = MATERIALS.filter(m => words.has(m));
  const klass = [...s.matchAll(/(?:^|\s)(sch\d+|sdr\s?\d+(?:\.\d+)?)/g)].map(m => m[1].replace(/\s/g, ""));
  let brand = make ? String(make).trim().toUpperCase() : null;
  if (!brand) for (const mk of makes) { const k = norm(mk); if (k && (` ${s} `).includes(` ${k} `)) { brand = String(mk).toUpperCase(); break; } }
  return { norm: s, sizes, angles, materials, klass, brand };
}
export function itemAttrs(item, makes = []) {
  return attrs(item.name || item.display_name || "", { makes, make: item.make || brandFromName(item.name || item.display_name) });
}
export const brandFromName = n => { const m = /\[([^\]]+)\]\s*$/.exec(String(n || "")); return m ? m[1].trim().toUpperCase() : null; };

const near = (a, b) => Math.abs(a - b) <= Math.max(0.5, 0.03 * Math.max(a, b));
const sizeMatch = (a, b) => a.some(x => b.some(y => near(x, y)));

/**
 * Layer 6. Compare a row with one item. Returns { hard: [reasons], cap: number|null, soft: [reasons] }.
 * hard → never accept this item for this row. cap → the row lacks something the item has: confidence is capped.
 */
export function guard(rowA, itemA, { rowUnit = null, itemUnit = null, ambiguousBrand = false } = {}) {
  const hard = [], soft = []; let cap = null;
  const capAt = v => { cap = cap == null ? v : Math.min(cap, v); };
  // size
  if (rowA.sizes.length && itemA.sizes.length) {
    const missing = rowA.sizes.filter(rs => !itemA.sizes.some(is => sizeMatch(rs, is)));
    if (missing.length) hard.push(`size ${fmtSize(rowA.sizes)} vs ${fmtSize(itemA.sizes)}`);
    else if (itemA.sizes.some(is => !rowA.sizes.some(rs => sizeMatch(rs, is)))) { capAt(0.85); soft.push("item has an extra size"); }
  } else if (!rowA.sizes.length && itemA.sizes.length) { capAt(0.85); soft.push("size not given in the Excel row"); }
  // angle
  if (rowA.angles.length && itemA.angles.length) {
    if (rowA.angles.some(a => !itemA.angles.some(b => Math.abs(a - b) < 0.01))) hard.push(`angle ${rowA.angles.join("/")}° vs ${itemA.angles.join("/")}°`);
  } else if (!rowA.angles.length && itemA.angles.length) { capAt(0.85); soft.push("angle not given"); }
  // brand
  if (rowA.brand && itemA.brand && rowA.brand !== itemA.brand) hard.push(`brand ${rowA.brand} vs ${itemA.brand}`);
  else if (!rowA.brand && itemA.brand && ambiguousBrand) { capAt(0.85); soft.push("brand not given, and the item exists in more than one brand"); }
  // material
  if (rowA.materials.length && itemA.materials.length && !rowA.materials.some(m => itemA.materials.includes(m))) {
    const generic = rowA.materials.every(m => m === "pvc") && itemA.materials.some(m => PVC_FAMILY.includes(m));
    if (!generic) hard.push(`material ${rowA.materials.join("/").toUpperCase()} vs ${itemA.materials.join("/").toUpperCase()}`);
  }
  // pressure class (SCH 40 / SCH 80, SDR)
  if (rowA.klass.length && itemA.klass.length && !rowA.klass.some(k => itemA.klass.includes(k))) hard.push(`class ${rowA.klass.join("/").toUpperCase()} vs ${itemA.klass.join("/").toUpperCase()}`);
  else if (!rowA.klass.length && itemA.klass.length) { capAt(0.88); soft.push("class (SCH/SDR) not given"); }
  // unit
  if (rowUnit && itemUnit && unitNorm(rowUnit) !== unitNorm(itemUnit)) { capAt(0.85); soft.push(`unit ${rowUnit} vs ${itemUnit}`); }
  return { hard, cap, soft };
}
const fmtSize = list => list.map(x => x.length > 1 ? x.join("|") + "mm" : x[0] + "mm").join(" x ");

// ----------------------------------------------------------------- scoring (layer 3)
export function tokenCover(a, b) {   // share of the row's words found in the item name (order-free)
  const A = new Set(norm(a).split(" ").filter(Boolean)), B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size) return 0; let n = 0; A.forEach(t => { if (B.has(t)) n++; }); return n / A.size;
}
export function tokenSet(a, b) {     // token-set ratio: shared words over the union
  const A = new Set(norm(a).split(" ").filter(Boolean)), B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0; let n = 0; A.forEach(t => { if (B.has(t)) n++; }); return n / (A.size + B.size - n);
}
export function fuzzyScore(rowText, itemName, ws = 0, s = 0) {
  const cover = tokenCover(rowText, itemName), set = tokenSet(rowText, itemName);
  return Math.min(1, 0.45 * Number(ws || 0) + 0.15 * Number(s || 0) + 0.3 * cover + 0.1 * set + (cover === 1 ? 0.06 : 0));
}

// ----------------------------------------------------------------- decision (layers 1–3 and 6)
/**
 * row: one entry of fn_import_candidates ({row_id, norm, text, remarks, unit, alias[], exact[], fuzzy[{item_id, ws, s}]})
 * items: Map(id → item {id, name, unit, make, ...}). makes: all brands in Item Master.
 * Returns {row_id, status, layer, confidence, item_id, candidates[{item_id, score, hard?, soft?}], reason, guard, unresolved}
 */
export function decideFast(row, items, makes, settings = DEFAULTS) {
  const st = { ...DEFAULTS, ...settings };
  const text = [row.text, row.remarks].filter(Boolean).join(" ");
  const rowA = attrs(text, { makes });
  const out = { row_id: row.row_id, status: "not_found", layer: null, confidence: 0, item_id: null, candidates: [], reason: "", guard: "", unresolved: true };
  // layer 1: alias memory — a human confirmed this exact text before
  const aliasIds = [...new Set((row.alias || []).map(a => Number(a.item_id)))].filter(id => items.has(id));
  if (aliasIds.length === 1) {
    return { ...out, status: "auto", layer: "alias", confidence: 1, item_id: aliasIds[0], candidates: [{ item_id: aliasIds[0], score: 1 }],
             reason: "Confirmed before for this text", unresolved: false };
  }
  if (aliasIds.length > 1) {
    return { ...out, status: "confirm", layer: "alias", confidence: 0.7, item_id: aliasIds[0], candidates: aliasIds.map(id => ({ item_id: id, score: 0.7 })),
             reason: `This text was confirmed as ${aliasIds.length} different items before — choose the right one`, unresolved: false };
  }
  // layers 2 + 3 → scored candidate list
  const cand = new Map();
  for (const id of row.exact || []) if (items.has(Number(id))) cand.set(Number(id), { item_id: Number(id), score: 0.97, layer: "exact" });
  for (const f of row.fuzzy || []) {
    const id = Number(f.item_id); if (!items.has(id) || cand.has(id)) continue;
    cand.set(id, { item_id: id, score: round(fuzzyScore(text, items.get(id).name, f.ws, f.s)), layer: "fuzzy" });
  }
  const list = scoreWithGuards([...cand.values()], rowA, row.unit, items, makes);
  return finish(out, list, st, false);
}

/** guardrails over a candidate list; returns it sorted, with hard/soft notes and capped scores */
export function scoreWithGuards(list, rowA, rowUnit, items, makes) {
  const brandsBySig = new Map();   // same item apart from brand → several brands = ambiguous brand
  const sig = it => norm(String(it.name || "").replace(/\[[^\]]*\]\s*$/, ""));
  for (const c of list) { const it = items.get(c.item_id); if (!it) continue; const k = sig(it); const set = brandsBySig.get(k) || new Set(); set.add(it.make || brandFromName(it.name) || ""); brandsBySig.set(k, set); }
  const brandsAll = new Set(list.map(c => { const it = items.get(c.item_id); return it ? (it.make || brandFromName(it.name) || "") : ""; }).filter(Boolean));
  for (const c of list) {
    const it = items.get(c.item_id); if (!it) { c.hard = ["item missing"]; continue; }
    const g = guard(rowA, itemAttrs(it, makes), { rowUnit, itemUnit: it.unit, ambiguousBrand: (brandsBySig.get(sig(it))?.size || 0) > 1 || brandsAll.size > 1 });
    c.raw = c.score; c.hard = g.hard; c.soft = g.soft;
    if (g.cap != null) c.score = Math.min(c.score, g.cap);
    if (g.hard.length) c.score = Math.min(c.score, 0.3);
  }
  return list.sort((a, b) => (a.hard?.length ? 1 : 0) - (b.hard?.length ? 1 : 0) || b.score - a.score);
}

function finish(out, list, st, fromAI, layerOverride = null) {
  out.candidates = list.slice(0, 8).map(c => ({ item_id: c.item_id, score: round(c.score), ...(c.hard?.length ? { hard: c.hard } : {}), ...(c.soft?.length ? { soft: c.soft } : {}) }));
  const ok = list.filter(c => !c.hard?.length);
  const top = ok[0];
  if (!top) {
    out.status = "not_found"; out.reason = list.length ? "Every close item differs in size, angle, brand, material or class" : "No similar item in Item Master";
    out.guard = list[0]?.hard?.join("; ") || ""; out.layer = layerOverride || (list[0]?.layer ?? null); return out;
  }
  let conf = top.score;
  const second = ok[1];
  if (second && second.score >= conf - 0.03 && conf < 0.97) { conf = Math.min(conf, 0.85); out.reason = "Two items score almost the same"; }   // too close to call
  out.item_id = top.item_id; out.confidence = round(conf); out.layer = layerOverride || top.layer;
  out.guard = (top.soft || []).join("; ");
  if (conf >= st.auto_threshold) {
    if (st.shadow_mode) { out.status = "confirm"; out.reason = out.reason || "Strong match — shadow mode: only remembered items are accepted automatically"; }
    else if (fromAI && st.always_ask_ai) { out.status = "confirm"; out.reason = out.reason || "AI match — set to always ask"; }
    else { out.status = "auto"; out.reason = out.reason || (out.layer === "exact" ? "Same name as Item Master" : "Very close match"); }
  } else if (conf >= st.confirm_threshold) { out.status = "confirm"; out.reason = out.reason || "Please confirm"; }
  else { out.status = "not_found"; out.reason = out.reason || "Only weak matches"; }
  out.unresolved = out.status !== "auto";
  return out;
}

/**
 * Layers 4–5 result for one row. fast = decideFast output; vector = [{item_id, sim}]; ai = {chosen_item_id, confidence, reason} | null.
 * Candidate union: fast candidates + vector (max 8). AI may only pick from that list.
 */
export function decideAI(row, fast, vector, ai, items, makes, settings = DEFAULTS) {
  const st = { ...DEFAULTS, ...settings };
  const text = [row.text, row.remarks].filter(Boolean).join(" ");
  const rowA = attrs(text, { makes });
  const merged = new Map();
  for (const c of fast.candidates || []) merged.set(Number(c.item_id), { item_id: Number(c.item_id), score: Number(c.score) || 0, layer: fast.layer || "fuzzy" });
  for (const v of vector || []) {
    const id = Number(v.item_id); if (!items.has(id)) continue;
    const sc = round(Math.min(0.85, Number(v.sim) || 0));   // a vector hit alone is never enough to auto-accept
    if (!merged.has(id)) merged.set(id, { item_id: id, score: sc, layer: "vector" }); else merged.get(id).score = Math.max(merged.get(id).score, sc);
  }
  let list = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  const allowed = new Set(list.map(c => c.item_id));
  const out = { row_id: row.row_id, status: "not_found", layer: null, confidence: 0, item_id: null, candidates: [], reason: "", guard: "", unresolved: true };
  let aiNote = "";
  if (ai?.rejected_id != null) aiNote = "AI picked an item outside the candidate list — ignored";
  else if (ai && ai.chosen_item_id != null) {
    const id = Number(ai.chosen_item_id);
    if (!allowed.has(id)) aiNote = "AI picked an item outside the candidate list — ignored";
    else { const c = list.find(x => x.item_id === id); c.score = Math.max(0, Math.min(1, Number(ai.confidence) || 0)); c.layer = "ai"; c.ai = true;
      list = [c, ...list.filter(x => x !== c)]; }
  } else if (ai) aiNote = "AI found no matching item";
  list = scoreWithGuards(list, rowA, row.unit, items, makes);
  const aiTop = list[0]?.ai && !list[0].hard?.length;
  const res = finish(out, list, st, aiTop, aiTop ? "ai" : null);
  if (ai?.reason && aiTop) res.reason = String(ai.reason).slice(0, 200);
  if (aiNote) res.reason = aiNote + (res.reason ? " · " + res.reason : "");
  const aiC = list.find(c => c.ai);
  if (aiC?.hard?.length) res.reason = "AI choice failed the size / angle / brand check (" + aiC.hard.join("; ") + ")" + (res.item_id ? " · suggesting the next item" : "");
  return res;
}

// ----------------------------------------------------------------- AI judge prompt + strict parse
export function judgePrompt(batch) {
  const system = [
    "You match lines from a construction material list (plumbing / piping) to items in a company's Item Master.",
    "For each row you get the row text and a numbered candidate list (id + name + unit). Choose the ONE candidate that is the same item, or null.",
    "Rules: choose only from the given candidate ids; never invent an id or an item. Size, angle, brand, material and pressure class must agree.",
    "If unsure, return null. Confidence is 0 to 1. Reply with JSON only: {\"results\":[{\"row_id\":number,\"chosen_item_id\":number|null,\"confidence\":number,\"reason\":string}]}",
  ].join("\n");
  const user = JSON.stringify({ rows: batch.map(r => ({ row_id: r.row_id, text: r.text, unit: r.unit || null,
    candidates: r.candidates.map(c => ({ id: c.item_id, name: c.name, unit: c.unit })), examples: (r.examples || []).slice(0, 5) })) });
  return { system, user };
}
export function parseJudge(text, batch) {
  let j = null;
  try { j = JSON.parse(String(text || "").replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { const m = /\{[\s\S]*\}/.exec(String(text || "")); if (m) { try { j = JSON.parse(m[0]); } catch {} } }
  const list = Array.isArray(j) ? j : Array.isArray(j?.results) ? j.results : [];
  const byRow = new Map(batch.map(r => [Number(r.row_id), new Set(r.candidates.map(c => Number(c.item_id)))]));
  const out = new Map();
  for (const x of list) {
    const rid = Number(x?.row_id); if (!byRow.has(rid)) continue;
    let id = x.chosen_item_id == null || x.chosen_item_id === "" ? null : Number(x.chosen_item_id);
    const inList = id == null || byRow.get(rid).has(id);
    out.set(rid, { chosen_item_id: inList ? id : null, rejected_id: inList ? null : id, confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)), reason: String(x.reason || "").slice(0, 200) });
  }
  return out;
}
export const round = v => Math.round(Number(v || 0) * 1000) / 1000;
