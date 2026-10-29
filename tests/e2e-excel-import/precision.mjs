// update484: precision check of layers 2–3 + guardrails against a synthetic Item Master (live naming pattern).
// Variants of real-looking site wording; "trap" rows change the size/angle/brand so the true item does NOT exist.
import { execFileSync } from "node:child_process";
import { decideFast } from "/home/claude/work/it475/lib/importMatch.mjs";
const PSQL = ["-h", "/home/claude/work/pg", "-p", "5433", "-U", "postgres", "-d", "t484", "-At", "-v", "ON_ERROR_STOP=1"];
const q = sql => execFileSync("psql", [...PSQL, "-c", "select set_config('app.uid','00000000-0000-0000-0000-000000000001',false);", "-c", sql], { maxBuffer: 1e8 }).toString().split("\n").slice(1).join("\n").trim();
const items = JSON.parse(q("select json_agg(json_build_object('id', id, 'name', display_name, 'unit', unit, 'make', make, 'material', material, 'sub_type', sub_type, 'size', size, 'item_class', item_class, 'item_type', item_type)) from item_master"));
const byId = new Map(items.map(i => [i.id, i])); const makes = JSON.parse(q("select fn_import_makes()"));
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const MM_IN = { 15: '1/2"', 20: '3/4"', 25: '1"', 32: '1 1/4"', 40: '1 1/2"', 50: '2"', 110: '4"', 75: '3"', 160: '6"' };
function variant(it, kind) {
  const brand = it.make ? (rnd() < 0.5 ? it.make.toLowerCase() : it.make) : "";
  let size = it.size || "";
  if (kind === "inch" && MM_IN[parseInt(size)]) size = MM_IN[parseInt(size)];
  const cls = it.item_class ? it.item_class.replace("SCHEDULE ", "sch ") : "";
  let parts = [it.material, it.sub_type, size, cls, kind === "nobrand" ? "" : brand].filter(Boolean);
  if (kind === "reorder") parts = [parts[1], parts[0], ...parts.slice(2)].filter(Boolean);
  let t = parts.join(" ");
  if (kind === "typo") t = t.replace(/([a-z]{4,})/i, w => w.slice(0, 2) + w[3] + w[2] + w.slice(4));
  if (kind === "lower") t = t.toLowerCase();
  return t;
}
const KINDS = ["plain", "inch", "reorder", "typo", "lower", "nobrand"];
const rows = []; const sample = items.filter(i => i.item_type === "Fitting" || i.item_type === "Pipe" || i.item_type === "Valve");
for (let i = 0; i < 250; i++) { const it = pick(sample); const k = pick(KINDS); rows.push({ text: variant(it, k), expect: it.id, kind: k }); }
// traps: a size that does not exist for that product, or the wrong angle
for (let i = 0; i < 60; i++) { const it = pick(sample.filter(x => /^\d+mm$/.test(x.size || ""))); const t = variant(it, "plain").replace(it.size, "999mm"); rows.push({ text: t, expect: null, kind: "trap-size" }); }
for (let i = 0; i < 30; i++) { const it = pick(sample.filter(x => /87\.5°/.test(x.sub_type || ""))); rows.push({ text: variant(it, "plain").replace("87.5°", "30°"), expect: null, kind: "trap-angle" }); }
const payload = JSON.stringify(rows.map((r, i) => ({ row_no: i + 1, item_text: r.text, qty: 1, unit: "Nos" }))).replace(/'/g, "''");
const imp = JSON.parse(q(`select fn_import_create('{"site_id":12,"file_name":"precision.xlsx"}'::jsonb, '${payload}'::jsonb)`));
const t0 = Date.now(); const cands = JSON.parse(q(`select fn_import_candidates(${imp.import_id})`)); const ms = Date.now() - t0;
const st = { auto_threshold: 0.92, confirm_threshold: 0.6, shadow_mode: false };
let auto = 0, autoOK = 0, confirmTop = 0, confirm = 0, nf = 0, trapAuto = 0; const bad = []; const perKind = {};
cands.forEach((c, i) => {
  const r = rows[i]; const d = decideFast(c, byId, makes, st); const pk = perKind[r.kind] = perKind[r.kind] || { n: 0, auto: 0, autoOK: 0, top: 0 }; pk.n++;
  if (d.status === "auto") { auto++; pk.auto++; if (d.item_id === r.expect) { autoOK++; pk.autoOK++; } else { if (r.expect == null) trapAuto++; bad.push({ text: r.text, got: byId.get(d.item_id)?.name, want: r.expect ? byId.get(r.expect).name : "(none)" }); } }
  else if (d.status === "confirm") { confirm++; if (d.item_id === r.expect) { confirmTop++; pk.top++; } } else nf++;
});
console.log(`rows ${rows.length} · candidates SQL ${ms} ms (incl. psql start)`);
console.log(`auto ${auto} · auto correct ${autoOK} → precision ${(autoOK / Math.max(1, auto) * 100).toFixed(1)}% · traps auto-matched ${trapAuto}`);
console.log(`confirm ${confirm} (right item suggested first: ${confirmTop}) · not found ${nf}`);
console.log(JSON.stringify(perKind));
if (bad.length) console.log("wrong autos:", JSON.stringify(bad.slice(0, 10), null, 1));
