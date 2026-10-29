// update484: read a material list (rows from an .xlsx / .xls / .csv sheet as arrays) — find the header row, map
// the columns by fuzzy header names, skip blank / total / repeated-header rows, validate quantities.
// Pure functions: the page turns the file into arrays with the xlsx package and calls these.

const ROLE_RE = {
  item: /^(item|items|item name|item description|description|desc|description of (the )?(item|material|work)s?|material|materials|material description|material name|particulars?|product|name of (the )?(item|material)|specification|item details)$/,
  qty: /^(qty|qnty|qty\.?|quantity|quantities|req(uired)?\.? ?qty|qty req(uired)?|quantity required|required quantity|order qty|nos\.?)$/,
  unit: /^(unit|units|uom|u\.?o\.?m\.?|u\/m|unit of measure(ment)?)$/,
  attr: /^(size|sizes|dia|diameter|brand|make|maker|spec|specs|class|grade|type|model|colour|color)$/,
  remarks: /^(remark|remarks|note|notes|comment|comments|purpose|location|area)$/,
};
const clean = v => String(v ?? "").replace(/\s+/g, " ").trim();
const headKey = v => clean(v).toLowerCase().replace(/[^a-z0-9 ./]/g, "").replace(/\s+/g, " ").trim();
export function roleOf(cell) {
  const k = headKey(cell); if (!k) return null;
  for (const [role, re] of Object.entries(ROLE_RE)) if (re.test(k)) return role;
  if (/\b(qty|quantity)\b/.test(k)) return "qty";
  if (/\b(description|particular|material|item)\b/.test(k) && !/\b(code|no|number|sr)\b/.test(k)) return "item";
  if (/\b(remark|note)\b/.test(k)) return "remarks";
  if (/\b(size|brand|make)\b/.test(k)) return "attr";
  if (/\bunit\b|\buom\b/.test(k)) return "unit";
  return null;
}

/** header row + column map. map = {item, qty, unit, attrs[], remarks[]} (column indexes) */
export function detectHeader(rows, maxScan = 30) {
  let best = null;
  for (let r = 0; r < Math.min(rows.length, maxScan); r++) {
    const map = { item: null, qty: null, unit: null, attrs: [], remarks: [] };
    (rows[r] || []).forEach((cell, c) => {
      const role = roleOf(cell); if (!role) return;
      if (role === "attr") map.attrs.push(c); else if (role === "remarks") map.remarks.push(c);
      else if (map[role] == null) map[role] = c;
    });
    if (map.item != null && map.qty != null) { best = { header_row: r, map }; break; }
  }
  return best;
}

/** fallback: guess from the content — longest-text column = item, mostly-numeric column = qty */
export function guessMap(rows) {
  const cols = Math.max(0, ...rows.slice(0, 60).map(r => (r || []).length));
  const stat = [];
  for (let c = 0; c < cols; c++) {
    const vals = rows.slice(0, 60).map(r => r?.[c]).filter(v => clean(v) !== "");
    const num = vals.filter(v => parseQty(v).qty != null).length;
    const len = vals.reduce((s, v) => s + clean(v).length, 0) / Math.max(1, vals.length);
    stat.push({ c, n: vals.length, numRatio: vals.length ? num / vals.length : 0, len });
  }
  const item = [...stat].filter(s => s.n && s.numRatio < 0.5).sort((a, b) => b.len - a.len)[0]?.c ?? null;
  const qty = [...stat].filter(s => s.n && s.c !== item && s.numRatio > 0.7).sort((a, b) => b.n - a.n)[0]?.c ?? null;
  return { item, qty, unit: null, attrs: [], remarks: [] };
}

export function parseQty(v) {
  if (typeof v === "number") return { qty: Number.isFinite(v) ? v : null, unit: null };
  const s = clean(v).replace(/,/g, "");
  const m = /^(-?\d+(?:\.\d+)?)\s*([A-Za-z.]+)?$/.exec(s);
  if (!m) return { qty: null, unit: null };
  return { qty: Number(m[1]), unit: m[2] ? m[2].replace(/\.$/, "") : null };
}
const TOTAL_RE = /^(grand\s+|sub\s*-?\s*)?total\b/i;

/** rows + map → material lines. Skips blank, total and repeated header rows; flags bad quantities. */
export function extractLines(rows, headerRow, map) {
  const lines = [], skipped = { blank: 0, total: 0, header: 0, no_item: 0 };
  for (let r = (headerRow ?? -1) + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const cells = row.map(clean);
    if (!cells.some(Boolean)) { skipped.blank++; continue; }
    if (cells.some(c => TOTAL_RE.test(c))) { skipped.total++; continue; }
    if (map.item != null && roleOf(row[map.item]) === "item" && map.qty != null && roleOf(row[map.qty]) === "qty") { skipped.header++; continue; }
    const desc = map.item != null ? cells[map.item] : "";
    const attrsTxt = (map.attrs || []).map(c => cells[c]).filter(Boolean);
    const itemText = [desc, ...attrsTxt].filter(Boolean).join(" ").trim();
    if (!desc) { skipped.no_item++; continue; }
    const pq = map.qty != null ? parseQty(row[map.qty]) : { qty: null, unit: null };
    const unit = (map.unit != null ? cells[map.unit] : "") || pq.unit || "";
    const problems = [];
    if (pq.qty == null) problems.push("quantity missing or not a number");
    else if (!(pq.qty > 0)) problems.push("quantity must be more than 0");
    lines.push({ row_no: r + 1, item_text: itemText.slice(0, 500), qty: pq.qty != null && pq.qty > 0 ? pq.qty : null, unit: unit.slice(0, 30),
                 remarks: (map.remarks || []).map(c => cells[c]).filter(Boolean).join(" · ").slice(0, 300),
                 raw_text: cells.filter(Boolean).join(" | ").slice(0, 1000), problems });
  }
  return { lines, skipped };
}

/** one sheet → {header_row, map, lines, skipped, needs_mapping} */
export function analyseSheet(rows) {
  const h = detectHeader(rows);
  if (!h) { const map = guessMap(rows); return { header_row: null, map, needs_mapping: true, ...extractLines(rows, -1, map) }; }
  return { header_row: h.header_row, map: h.map, needs_mapping: false, ...extractLines(rows, h.header_row, h.map) };
}
