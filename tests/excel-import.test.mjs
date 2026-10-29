// update484: Excel → indent import — parsing, attributes, guardrails, decisions, AI output checks
import test from "node:test";
import assert from "node:assert/strict";
import { analyseSheet, parseQty } from "../lib/importParse.mjs";
import { attrs, guard, decideFast, decideAI, parseJudge, norm, unitNorm } from "../lib/importMatch.mjs";

const ITEMS = new Map([
  [1, { id: 1, name: "Fitting - PVC SWR BEND 87.5° 110mm (SELFIT) [ASTRAL]", unit: "Nos", make: "ASTRAL" }],
  [2, { id: 2, name: "Fitting - PVC SWR BEND 45° 110mm (SELFIT) [ASTRAL]", unit: "Nos", make: "ASTRAL" }],
  [3, { id: 3, name: "Fitting - PVC SWR BEND 87.5° 90mm (SELFIT) [ASTRAL]", unit: "Nos", make: "ASTRAL" }],
  [4, { id: 4, name: "Fitting - CPVC Tee 20mm [ASTRAL]", unit: "Nos", make: "ASTRAL" }],
  [5, { id: 5, name: "Fitting - CPVC Tee 25mm [ASTRAL]", unit: "Nos", make: "ASTRAL" }],
  [6, { id: 6, name: "Fitting - UPVC Coupler 50mm (SCHEDULE 40) [ASTRAL]", unit: "Nos", make: "ASTRAL" }],
  [7, { id: 7, name: "Fitting - UPVC Coupler 50mm (SCHEDULE 80) [ASTRAL]", unit: "Nos", make: "ASTRAL" }],
  [8, { id: 8, name: "Fitting - PVC SWR BEND 87.5° 110mm (SELFIT) [SUPREME]", unit: "Nos", make: "SUPREME" }],
]);
const MAKES = ["ASTRAL", "SUPREME", "RB"];
const ST = { auto_threshold: 0.92, confirm_threshold: 0.6, shadow_mode: false, always_ask_ai: false };

test("header detection, blank / total rows skipped, qty validated", () => {
  const rows = [["Pipeskool material list"], [], ["Sr", "Description", "Size", "Make", "Qty", "Unit", "Remarks"],
    [1, "CPVC Tee", "20mm", "Astral", 10, "Nos", "urgent"], [2, "SWR bend 87.5", "110 mm", "", "5", "nos", ""], [], [3, "Gi nut 10mm", "", "", "abc", "kg", ""],
    ["", "Total", "", "", 15, "", ""], [4, "UPVC coupler sch 40", "50mm", "", "-2", "", ""]];
  const r = analyseSheet(rows);
  assert.equal(r.header_row, 2); assert.equal(r.needs_mapping, false);
  assert.equal(r.lines.length, 4); assert.equal(r.skipped.total, 1); assert.ok(r.skipped.blank >= 1);
  assert.equal(r.lines[0].item_text, "CPVC Tee 20mm Astral"); assert.equal(r.lines[0].qty, 10); assert.equal(r.lines[0].remarks, "urgent");
  assert.match(r.lines[2].problems[0], /quantity/); assert.equal(r.lines[2].qty, null);
  assert.match(r.lines[3].problems[0], /more than 0/);
});
test("no header → content guess + mapping needed", () => {
  const r = analyseSheet([["CPVC Tee 20mm", 10], ["CPVC Tee 25mm", 4]]);
  assert.equal(r.needs_mapping, true); assert.equal(r.map.item, 0); assert.equal(r.map.qty, 1); assert.equal(r.lines.length, 2);
});
test("qty text with unit", () => { assert.deepEqual(parseQty("1,200 nos"), { qty: 1200, unit: "nos" }); assert.equal(parseQty("x").qty, null); });
test("normalising units and symbols", () => {
  assert.equal(norm('CPVC Elbow 1 1/2" 90° Sch-40'), "cpvc elbow 1-1/2inch 90deg sch40");
  assert.equal(norm("110 MM swr"), "110mm swr"); assert.equal(unitNorm("Rmt"), "mtr"); assert.equal(unitNorm("PCS"), "nos");
});
test("inch sizes map to the mm sizes used in Item Master", () => {
  const a = attrs('SWR bend 4" 87.5 deg'); assert.deepEqual(a.sizes, [[100, 110]]); assert.deepEqual(a.angles, [87.5]);
  assert.equal(guard(a, attrs(ITEMS.get(1).name)).hard.length, 0);
});
test("guardrails: size and angle mismatches are hard", () => {
  const item = attrs(ITEMS.get(1).name, { make: "ASTRAL" });
  assert.match(guard(attrs("swr bend 87.5° 90mm"), item).hard.join(), /size/);
  assert.match(guard(attrs("swr bend 45 deg 110mm"), item).hard.join(), /angle/);
  assert.match(guard(attrs("swr bend 87.5° 110mm", { makes: MAKES }), attrs(ITEMS.get(8).name, { make: "SUPREME" })).hard.join() || "", /^$/);
  assert.match(guard(attrs("swr bend 87.5° 110mm supreme", { makes: MAKES }), item).hard.join(), /brand/);
  assert.match(guard(attrs("upvc coupler 50mm sch 80"), attrs(ITEMS.get(6).name)).hard.join(), /class/);
  assert.match(guard(attrs("cpvc coupler 50mm"), attrs(ITEMS.get(6).name)).hard.join(), /material/);
});
test("missing attribute caps instead of rejecting", () => {
  const g = guard(attrs("swr bend 110mm"), attrs(ITEMS.get(1).name));
  assert.equal(g.hard.length, 0); assert.ok(g.cap <= 0.85);
});
test("size mismatch never auto-matches, even with a high score", () => {
  const d = decideFast({ row_id: 1, text: "SWR bend 87.5 deg 90mm astral", alias: [], exact: [], fuzzy: [{ item_id: 1, ws: 1, s: 0.9 }] }, ITEMS, MAKES, ST);
  assert.notEqual(d.status, "auto"); assert.notEqual(d.item_id, 1);
});
test("alias hit auto-accepts; two remembered items → ask", () => {
  assert.equal(decideFast({ row_id: 1, text: "x", alias: [{ item_id: 4 }] }, ITEMS, MAKES, ST).status, "auto");
  const two = decideFast({ row_id: 1, text: "x", alias: [{ item_id: 4 }, { item_id: 5 }] }, ITEMS, MAKES, ST);
  assert.equal(two.status, "confirm"); assert.equal(two.candidates.length, 2);
});
test("exact match auto-accepts outside shadow mode, needs a Yes in shadow mode", () => {
  const row = { row_id: 1, text: "Fitting - CPVC Tee 20mm [ASTRAL]", alias: [], exact: [4], fuzzy: [{ item_id: 5, ws: 0.8, s: 0.7 }] };
  assert.equal(decideFast(row, ITEMS, MAKES, ST).status, "auto");
  assert.equal(decideFast(row, ITEMS, MAKES, { ...ST, shadow_mode: true }).status, "confirm");
});
test("LLM id outside the candidate list is rejected", () => {
  const batch = [{ row_id: 9, candidates: [{ item_id: 4 }, { item_id: 5 }] }];
  const p = parseJudge('{"results":[{"row_id":9,"chosen_item_id":777,"confidence":0.99,"reason":"x"}]}', batch);
  assert.equal(p.get(9).chosen_item_id, null); assert.equal(p.get(9).rejected_id, 777);
  const fast = { candidates: [{ item_id: 4, score: 0.7 }, { item_id: 5, score: 0.69 }], layer: "fuzzy" };
  const d = decideAI({ row_id: 9, text: "cpvc tee 20mm astral" }, fast, [], p.get(9), ITEMS, MAKES, ST);
  assert.notEqual(d.layer, "ai"); assert.match(d.reason, /outside the candidate list/);
});
test("AI choice still goes through the guardrails", () => {
  const fast = { candidates: [{ item_id: 1, score: 0.7 }, { item_id: 3, score: 0.7 }], layer: "fuzzy" };
  const d = decideAI({ row_id: 2, text: "swr bend 87.5 90mm" }, fast, [], { chosen_item_id: 1, confidence: 0.99, reason: "bend" }, ITEMS, MAKES, ST);
  assert.notEqual(d.item_id, 1); assert.match(d.reason, /failed/);
});
test("AI outage: no AI result → the row needs a human, import still completes", () => {
  const fast = { candidates: [{ item_id: 4, score: 0.75 }], layer: "fuzzy" };
  const d = decideAI({ row_id: 3, text: "cpvc tee 20mm" }, fast, [], null, ITEMS, MAKES, ST);
  assert.equal(d.status, "confirm"); assert.equal(d.item_id, 4);
});
