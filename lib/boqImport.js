// lib/boqImport.js — update455: SMART BOQ IMPORT.
// Every client's BOQ Excel is laid out differently (KEI, SOUL, Brigade…). This module reads ANY workbook:
//   1. finds the header row on each sheet (title rows above it are kept as metadata, not rejected),
//   2. names every column by header words AND by what its cells contain (long text = description, unit
//      vocabulary = unit, the numeric column that equals qty × rate = amount …), each with a confidence,
//   3. classifies every row: section heading / line item / parent heading with a-b-c children / spec or
//      make line / total row / blank — and uses the client's own TOTAL rows to cross-check our sums,
//   4. turns the result into boq_items rows, and into a TEMPLATE that is saved per SITE so the next
//      revision of that site's BOQ imports silently with the same mapping.
// Pure functions — no Supabase here; app/boq uses them and lib/boq.js persists.
import * as XLSX from "xlsx";

export const ROLES = [
  ["description", "Description"], ["qty", "Quantity"], ["rate", "Rate"], ["unit", "Unit"], ["code", "Code / S.No."],
  ["amount", "Amount"], ["section", "Section"], ["basic_rate", "Basic rate"], ["remarks", "Remarks"], ["ignore", "Ignore"],
];
export const REQUIRED = ["description", "qty", "unit"];   // rate is strongly expected but a BOQ can be unpriced

// header vocabulary — lower-cased, punctuation stripped; each role lists words that identify it
const HEAD = {
  code: ["sno", "sno.", "s.no", "s.no.", "slno", "sl", "sl.no", "sr", "srno", "sr.no", "itemno", "item no", "code", "itemcode", "ref", "no"],
  description: ["description", "item description", "descriptionofwork", "description of work", "particulars", "item", "items", "scope", "scope of work", "workdescription", "description of goods", "nameofwork"],
  unit: ["uom", "unit", "units", "unit of measurement", "u.o.m", "um"],
  qty: ["qty", "quantity", "qnty", "quant", "boq qty", "tender qty", "nos"],
  rate: ["rate", "unit rate", "rate rs", "rate (rs)", "rate inr", "unitprice", "unit price", "price", "quoted rate"],
  amount: ["amount", "amt", "total", "total amount", "value", "amount rs", "amount (rs)", "total value"],
  basic_rate: ["basic rate", "basic", "basic price", "landed rate"],
  remarks: ["remarks", "remark", "ramarks", "make", "makes", "brand", "specification", "spec", "note", "notes"],
  section: ["section", "part", "head", "group", "category", "block", "floor", "tower"],
};
const UNITS = ["nos", "no", "no.", "nos.", "each", "ea", "rmt", "rm", "mtr", "mtrs", "m", "mt", "metre", "meter", "lm", "sqm", "sq.m", "sqmt", "sq m", "sqft", "sq.ft", "cum", "cu.m", "cft", "kg", "kgs", "ton", "mt", "ltr", "lit", "litre", "set", "sets", "pair", "pr", "lot", "ls", "l.s", "lumpsum", "lump sum", "job", "point", "pt", "pts", "brass", "bag", "bags", "box", "roll", "rolls", "length", "lgth", "day", "days", "month", "months", "hr", "hrs", "visit", "trip", "sq.mt", "rft", "r.ft", "r.mt", "rmtr", "sheet", "pcs", "pc", "unit"];
const UNIT_SET = new Set(UNITS);

const norm = s => String(s ?? "").replace(/\s+/g, " ").trim();
const low = s => norm(s).toLowerCase();
const key = s => low(s).replace(/[^a-z0-9. ]/g, "").trim();
const isNum = v => v !== null && v !== "" && v !== undefined && Number.isFinite(Number(String(v).replace(/,/g, "")));
const num = v => Number(String(v ?? "").replace(/,/g, ""));
const isUnit = v => UNIT_SET.has(low(v).replace(/[^a-z. ]/g, "").trim());
// "1", "1.1", "7.10", "a", "b)", "(c)", "i", "ii", "A", "Part II", "2.1.3"
const CODE_RE = /^(\(?[a-z]\)?|\(?[ivx]{1,4}\)?|[A-Z]|\d{1,3}(\.\d{1,3}){0,3}\.?|part\s*[ivx]+|part\s*\d+)$/i;
const isCode = v => CODE_RE.test(norm(v));
const isSectionCode = v => /^(\d{1,3}|[A-Z]|[A-Z]\)|part\s*[ivx]+|part\s*\d+)$/i.test(norm(v)) && !/^[a-z]\)?$/.test(norm(v));   // "a" is a child, "A" a section
const isChildCode = v => /^\(?([a-z]|[a-z]\d{1,2}|[ivx]{1,4})\)?$/.test(norm(v));   // a, (b), c), a1, i, ii
const isRoman = v => /^\(?[ivx]{1,4}\)?$/.test(norm(v));
const TOTAL_RE = /^\W*((sub|grand)?\s*t\s*o\s*t\s*a\s*l\b|carried\s*(over|forward)|c\/o\b|b\/f\b|amount\s+c\/o)/i;   // starts with TOTAL / T O T A L / carried over — not a description that merely contains the word
const TERMS_RE = /\b(payment\s*terms?|milestone|mobili[sz]ation|retention|advance|against\s+(delivery|installation|commissioning|handing)|%\s*of\s*(contract|item|order)|on\s+(delivery|completion|handover))\b/i;

// ---------------------------------------------------------------- 1. read
export function readWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: true });
    // drop fully empty trailing rows/cols
    while (rows.length && rows[rows.length - 1].every(c => c === null || c === "")) rows.pop();
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
    return { name, rows: rows.map(r => { const o = r.slice(0, width); while (o.length < width) o.push(null); return o; }), width };
  });
}

// ---------------------------------------------------------------- 2. header row
function headerHits(row) {
  let hits = 0; const roles = new Set();
  row.forEach(c => { const k = key(c); if (!k) return; for (const [role, words] of Object.entries(HEAD)) if (words.includes(k) || words.includes(k.replace(/\./g, "")) || words.some(w => k.startsWith(w + " ") || k.startsWith(w + "("))) { hits++; roles.add(role); break; } });
  return { hits, roles };
}
export function detectHeaderRow(rows, maxScan = 40) {
  let best = { idx: -1, hits: 0, roles: new Set() };
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const h = headerHits(rows[i]);
    if (h.hits >= 3 && h.roles.has("description") && h.hits > best.hits) best = { idx: i, ...h };
  }
  if (best.idx >= 0) return best.idx;
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) { const h = headerHits(rows[i]); if (h.hits >= 3) return i; }
  return -1;
}

// ---------------------------------------------------------------- 3. columns
export function profileColumns(rows, headerIdx) {
  const body = rows.slice(headerIdx + 1); const width = rows[0]?.length || 0; const out = [];
  for (let c = 0; c < width; c++) {
    const cells = body.map(r => r[c]).filter(v => v !== null && v !== "" && v !== undefined);
    const n = cells.length || 1;
    const nums = cells.filter(isNum); const texts = cells.filter(v => !isNum(v));
    const avgLen = texts.length ? texts.reduce((t, v) => t + norm(v).length, 0) / texts.length : 0;
    out.push({
      col: c, header: norm(rows[headerIdx]?.[c]), filled: cells.length, fillRate: cells.length / Math.max(1, body.length),
      pNum: nums.length / n, pText: texts.length / n, avgLen,
      pUnit: cells.filter(isUnit).length / n, pCode: cells.filter(isCode).length / n,
      median: nums.length ? [...nums.map(num)].sort((a, b) => a - b)[Math.floor(nums.length / 2)] : 0,
      pInt: nums.length ? nums.filter(v => Number.isInteger(num(v))).length / nums.length : 0,
    });
  }
  return out;
}

function headerRole(h) {
  const k = key(h); if (!k) return null;
  for (const [role, words] of Object.entries(HEAD)) if (words.includes(k) || words.includes(k.replace(/\./g, "")) || words.some(w => k.startsWith(w + " ") || k.startsWith(w + "("))) return role;
  return null;
}

// score every column for every role → best role + confidence (0-100) per column; resolves the qty/rate/amount
// triangle with arithmetic (amount ≈ qty × rate on most rows)
export function mapColumns(rows, headerIdx) {
  const prof = profileColumns(rows, headerIdx); const body = rows.slice(headerIdx + 1);
  const score = prof.map(p => {
    const s = {}; const hr = headerRole(p.header);
    if (p.filled === 0) { return { col: p.col, header: p.header, role: "ignore", conf: 100, scores: s, profile: p }; }
    s.description = p.pText * 50 + Math.min(p.avgLen, 60) / 60 * 40 + (hr === "description" ? 30 : 0) - p.pNum * 40;
    s.unit = p.pUnit * 80 + (hr === "unit" ? 30 : 0) - (p.avgLen > 12 ? 30 : 0);
    s.code = p.pCode * 60 + (hr === "code" ? 30 : 0) + (p.col === 0 ? 10 : 0) - (p.avgLen > 10 ? 30 : 0);
    const numeric = p.pNum * 60 - p.pText * 40;
    s.qty = numeric + (hr === "qty" ? 40 : 0);
    s.rate = numeric + (hr === "rate" ? 40 : 0);
    s.amount = numeric + (hr === "amount" ? 40 : 0);
    s.basic_rate = numeric * 0.5 + (hr === "basic_rate" ? 60 : 0) - 20;
    s.remarks = p.pText * 20 + (hr === "remarks" ? 50 : 0) + (p.fillRate < 0.3 ? 15 : 0) - (hr && hr !== "remarks" ? 40 : 0);
    s.section = (hr === "section" ? 70 : 0) + (p.pText * 10) - 10;
    return { col: p.col, header: p.header, scores: s, profile: p };
  });
  // arithmetic: for each numeric triple (a,b,c) count rows where c ≈ a*b
  const numCols = score.filter(x => x.profile.pNum > 0.6 && x.profile.filled >= 3).map(x => x.col);
  let bestTriple = null;
  for (const a of numCols) for (const b of numCols) for (const c of numCols) {
    if (a >= b || c === a || c === b) continue;
    let ok = 0, tried = 0;
    body.forEach(r => { if (isNum(r[a]) && isNum(r[b]) && isNum(r[c]) && num(r[c]) !== 0) { tried++; if (Math.abs(num(r[a]) * num(r[b]) - num(r[c])) <= Math.max(1, Math.abs(num(r[c])) * 0.005)) ok++; } });
    if (tried >= 3 && ok / tried >= 0.8 && (!bestTriple || ok > bestTriple.ok)) bestTriple = { a, b, c, ok, tried };
  }
  if (bestTriple) {
    const { a, b, c } = bestTriple;
    score[c].scores.amount += 60; score[c].scores.qty -= 30; score[c].scores.rate -= 30;
    // between a and b: header first, else the smaller-median / more-integer column is qty
    const ha = headerRole(score[a].header), hb = headerRole(score[b].header);
    let q = a, r = b;
    if (ha === "rate" || hb === "qty") { q = b; r = a; }
    else if (!(ha === "qty" || hb === "rate")) { if (score[a].profile.median > score[b].profile.median) { q = b; r = a; } }
    score[q].scores.qty += 45; score[q].scores.rate -= 20; score[r].scores.rate += 45; score[r].scores.qty -= 20;
  }
  // assign: each column takes its best role; a role may be held by one column — the strongest keeps it
  const taken = {};
  score.forEach(x => { if (x.role) return; const e = Object.entries(x.scores).sort((p, q) => q[1] - p[1]); x.ranked = e; x.role = e[0][0]; x.conf = clamp(e[0][1] - Math.max(0, e[1][1]) * 0.4 + 30); if (x.conf < 35 || e[0][1] < 20) x.role = "ignore"; });
  for (const role of ["description", "qty", "rate", "amount", "unit", "code"]) {
    const cands = score.filter(x => x.role === role).sort((p, q) => q.scores[role] - p.scores[role]);
    cands.slice(1).forEach(x => { const alt = (x.ranked || []).find(([r]) => r !== role && !taken[r] && r !== "ignore"); x.role = alt && alt[1] > 20 ? alt[0] : "ignore"; x.conf = alt ? clamp(alt[1]) : 60; });
    if (cands[0]) taken[role] = cands[0].col;
  }
  // confidence shading: competing columns lower both
  const columns = score.map(x => ({ col: x.col, header: x.header, role: x.role, conf: Math.round(x.conf ?? 100), profile: x.profile }));
  const roleOf = Object.fromEntries(columns.filter(c => c.role !== "ignore").map(c => [c.role, c.col]));
  return { columns, roleOf, arithmetic: bestTriple ? { ok: bestTriple.ok, tried: bestTriple.tried } : null };
}
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

// ---------------------------------------------------------------- 4. rows
// returns tagged rows + built items + totals check. map = { roleOf: {role: colIndex} }
export function classifyRows(rows, headerIdx, roleOf, opts = {}) {
  const C = roleOf; const out = []; const items = [];
  let section = null, sectionCode = null, parent = null, sub = null, specSub = null;
  // parent = numbered heading ("7.10 Supplying … Y-strainer") whose lettered children follow
  // sub = lettered sub-heading under it ("a) RCC beams" → a1, a2 items) · specSub = a text line between two
  // child groups ("For rain water (Shaft Pipes)") that re-scopes the children that follow it
  let runSum = 0, totalsOk = 0, totalsBad = 0; const checks = [];
  const get = (r, role) => (C[role] != null ? r[C[role]] : null);
  const strip = c => c.replace(/[()]/g, "");
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]; const code = norm(get(r, "code")); const desc = norm(get(r, "description"));
    const qty = get(r, "qty"), rate = get(r, "rate"), amount = get(r, "amount"), unit = norm(get(r, "unit"));
    const hasQty = isNum(qty) && num(qty) !== 0, hasRate = isNum(rate), hasAmt = isNum(amount);
    const empty = !code && !desc && !hasQty && !hasRate && !hasAmt && !unit;
    let tag;
    if (empty) tag = "blank";
    else if (TOTAL_RE.test(desc) && !hasQty && !unit && !/\d\.\d/.test(code) && (hasAmt || /c\/o|carried|summary|^\W*((sub|grand)\s*)?t\s*o\s*t\s*a\s*l\s*[-–:]?\s*$/i.test(desc))) tag = "total";   // "Total head: 140 m" is a spec line, not a total
    else if (TERMS_RE.test(desc) && !hasQty && !unit) tag = "terms";
    else if (hasQty || (unit && hasRate)) tag = hasQty ? "item" : "rate_only";
    else if (desc && isSectionCode(code) && !unit) tag = "section";
    else if (desc && code && isChildCode(code) && parent && !unit) tag = "subhead";
    else if (desc && code && !isChildCode(code) && !unit) tag = "parent";
    else if (desc) tag = "spec";
    else tag = "blank";
    const row = { i, excelRow: i + 1, tag, code, desc, unit, qty: hasQty ? num(qty) : null, rate: hasRate ? num(rate) : null, amount: hasAmt ? num(amount) : null };
    if (tag === "section") { section = desc; sectionCode = code; parent = null; sub = null; specSub = null; }
    if (tag === "parent") { parent = { code, text: desc }; sub = null; specSub = null; }
    if (tag === "subhead") { sub = { code: `${parent.code}${strip(code)}`, text: `${parent.text} — ${desc}` }; specSub = null; }
    if (tag === "spec" && parent && items.length && items[items.length - 1].parentCode === parent.code) specSub = { code: parent.code, text: `${parent.text} — ${desc}` };
    if (tag === "item" || tag === "rate_only") {
      let itemCode = code, description = desc, parentCode = null;
      if (parent && isChildCode(code)) {
        const under = sub || specSub || parent;
        itemCode = sub ? `${sub.code}.${strip(code)}` : `${parent.code}${strip(code)}`;
        description = `${under.text} — ${desc}`; parentCode = parent.code;
      }
      else if (parent && code === parent.code) { description = desc || parent.text; parentCode = parent.code; }   // same code repeated on the priced row
      else if (!code && parent) { itemCode = parent.code; description = desc ? `${parent.text} — ${desc}` : parent.text; parentCode = parent.code; }
      else if (!desc && parent) { description = parent.text; itemCode = itemCode || parent.code; parentCode = parent.code; }
      else { parent = null; sub = null; specSub = null; }
      const it = { item_code: itemCode || null, description, unit: unit || null, boq_qty: row.qty || 0, rate: row.rate, amount: row.amount, rate_only: tag === "rate_only", parentCode,
        section: section ? (opts.sectionWithCode && sectionCode ? `${sectionCode} · ${section}` : section) : null, excelRow: row.excelRow, sheet: opts.sheet || null };
      if (C.basic_rate != null && isNum(r[C.basic_rate])) it.basic_rate = num(r[C.basic_rate]);
      if (C.remarks != null && norm(r[C.remarks])) it.remarks = norm(r[C.remarks]);
      items.push(it); row.item = it;
      runSum += row.amount != null ? row.amount : (row.rate != null && row.qty != null ? row.qty * row.rate : 0);
    }
    if (tag === "spec" && items.length && opts.attachSpecs) { const last = items[items.length - 1]; last.spec = (last.spec ? last.spec + "\n" : "") + desc; }
    if (tag === "total" && row.amount != null) {
      const ok = Math.abs(runSum - row.amount) <= Math.max(1, row.amount * 0.001);
      const grand = /grand|summary/i.test(desc) && !/c\/o/i.test(desc);
      if (!grand) { checks.push({ label: desc, theirs: row.amount, ours: runSum, ok, excelRow: row.excelRow }); if (ok) totalsOk++; else totalsBad++; runSum = 0; }
      else checks.push({ label: desc, theirs: row.amount, ours: 0, ok: null, grand: true, excelRow: row.excelRow });
      row.check = checks[checks.length - 1];
    }
    out.push(row);
  }
  // a code used twice (two child groups under one heading) gets -2, -3 … so every line is addressable
  const seen = {};
  items.forEach(it => { if (!it.item_code) return; const n = (seen[it.item_code] = (seen[it.item_code] || 0) + 1); if (n > 1) it.item_code = `${it.item_code}-${n}`; });
  const grandOurs = items.reduce((t, x) => t + (x.amount ?? (x.rate != null ? x.boq_qty * x.rate : 0)), 0);
  const rateOnly = items.filter(x => x.rate_only).length;
  checks.forEach(c => { if (c.grand) { c.ours = grandOurs; c.ok = Math.abs(c.ours - c.theirs) <= Math.max(1, c.theirs * 0.001); } });
  const sections = [...new Set(items.map(x => x.section).filter(Boolean))];
  return { rows: out, items, sections, checks, totalsOk, totalsBad, grandTotal: grandOurs, rateOnly, counts: countTags(out) };
}
const countTags = rows => rows.reduce((m, r) => { m[r.tag] = (m[r.tag] || 0) + 1; return m; }, {});

// ---------------------------------------------------------------- 5. the whole workbook
// analyse every sheet; returns per-sheet detection (header, mapping, classification) + overall confidence
export function analyseWorkbook(sheets, template) {
  const res = sheets.map(sh => {
    let headerIdx = template?.header_row != null && template.header_row >= 0 && headerMatches(sh.rows[template.header_row], template) ? template.header_row : detectHeaderRow(sh.rows);
    let noHeader = false;
    if (headerIdx < 0) {
      // no header words at all (some clients send bare columns) → read the columns by CONTENT alone; if the first
      // filled row is itself data, there is no header row and the table starts at row 1
      const first = sh.rows.findIndex(r => r.some(v => v !== null && norm(v)));
      if (first < 0) return { name: sh.name, headerIdx: -1, include: false, reason: "empty sheet" };
      const probe = mapColumns(sh.rows, first);
      if (probe.roleOf.description == null || probe.roleOf.qty == null) return { name: sh.name, headerIdx: -1, include: false, reason: "no BOQ table found (no description / quantity columns)" };
      const firstIsData = probe.roleOf.qty != null && isNum(sh.rows[first][probe.roleOf.qty]);
      headerIdx = firstIsData ? first - 1 : first; noHeader = firstIsData;
    }
    const auto = mapColumns(sh.rows, headerIdx);
    let columns = auto.columns, source = "detected";
    const tplApplies = template && (headerIdx >= 0 ? headerMatches(sh.rows[headerIdx], template) : (template.header_row === -1 && Object.keys(template.columns || {}).length === columns.length));
    if (tplApplies) {   // the site's saved mapping wins when the header (or, header-less, the column count) matches
      columns = auto.columns.map(c => ({ ...c, role: template.columns[String(c.col)] || "ignore", conf: 100 })); source = "template";
    }
    const roleOf = Object.fromEntries(columns.filter(c => c.role !== "ignore").map(c => [c.role, c.col]));
    const cls = classifyRows(sh.rows, headerIdx, roleOf, { sheet: sh.name, attachSpecs: template?.rules?.attach_specs ?? false, sectionWithCode: template?.rules?.section_with_code ?? false });
    const title = sh.rows.slice(0, Math.max(0, headerIdx)).flat().filter(v => v !== null && norm(v)).map(norm).join(" · ").slice(0, 160);
    // update457: a renamed sheet ("PHE BOQ" → "PHE ") still imports — the template's sheet list only EXCLUDES when it names a sheet that exists
    const listed = template?.sheets?.include || [];
    const include = listed.length && sheets.some(x => listed.includes(x.name)) ? listed.includes(sh.name) : cls.items.length > 0;
    return { name: sh.name, headerIdx, noHeader, columns, roleOf, source, cls, title, include, arithmetic: auto.arithmetic, rows: sh.rows };
  });
  const probs = [];
  res.filter(s => s.include).forEach(s => {
    REQUIRED.forEach(r => { if (s.roleOf[r] == null) probs.push(`${s.name}: no ${r} column`); });
    s.columns.filter(c => ["description", "qty", "rate", "unit", "code", "amount"].includes(c.role) && c.conf < 85 && s.source !== "template").forEach(c => probs.push(`${s.name}: column "${c.header || "#" + (c.col + 1)}" read as ${c.role} with only ${c.conf}% confidence`));
    if (s.cls.totalsBad) probs.push(`${s.name}: ${s.cls.totalsBad} total row(s) do not match our sum`);
    if (s.cls.counts.terms) probs.push(`${s.name}: ${s.cls.counts.terms} row(s) look like payment terms — kept out of the BOQ grid`);
  });
  if (!res.some(s => s.include)) probs.push("No sheet with BOQ line items found");
  return { sheets: res, problems: probs, confident: probs.length === 0, items: res.filter(s => s.include).flatMap(s => s.cls.items), usedTemplate: res.some(s => s.source === "template") };
}
function headerMatches(row, template) {
  if (!row || !template?.header_signature) return false;
  const sig = row.map(key).filter(Boolean); const want = template.header_signature;
  const hit = want.filter(w => sig.includes(w)).length;
  return want.length > 0 && hit >= Math.max(3, Math.ceil(want.length * 0.7));
}

// build the per-site template from a confirmed mapping
export function templateFrom(sheetRes, allSheets, rules = {}) {
  const s = sheetRes;
  return {
    header_row: s.headerIdx,
    header_signature: s.headerIdx >= 0 ? s.rows[s.headerIdx].map(key).filter(Boolean) : [],
    columns: Object.fromEntries(s.columns.map(c => [String(c.col), c.role])),
    sheets: { include: allSheets.filter(x => x.include).map(x => x.name) },
    rules: { attach_specs: !!rules.attach_specs, section_with_code: !!rules.section_with_code, child_codes: "letters_under_parent", total_rows: "skip_and_check" },
  };
}

// apply a confirmed column map to one sheet (after the user changes a dropdown)
export function reclassify(sheetRes, columns, rules = {}) {
  const roleOf = Object.fromEntries(columns.filter(c => c.role !== "ignore").map(c => [c.role, c.col]));
  const cls = classifyRows(sheetRes.rows, sheetRes.headerIdx, roleOf, { sheet: sheetRes.name, attachSpecs: !!rules.attach_specs, sectionWithCode: !!rules.section_with_code });
  return { ...sheetRes, columns, roleOf, cls, source: "manual" };
}

export const fmtInr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
