// update485: Direct Vendor Payment print — page plan for the attached bills
import test from "node:test";
import assert from "node:assert/strict";
import { planPages, firstPageSpace, attachedLine, fileNameOf, gridSlotMm } from "../lib/billLayout.mjs";

const plan = (n, vh = 120) => planPages(n, vh).map(p => p.slots.length);
test("0 bills → voucher page only", () => assert.deepEqual(plan(0), [0]));
test("1 and 2 bills fit on page 1", () => { assert.deepEqual(plan(1), [1]); assert.deepEqual(plan(2), [2]); });
test("3, 4, 5, 7 bills: 2 on page 1, then 4 per page", () => {
  assert.deepEqual(plan(3), [2, 1]); assert.deepEqual(plan(4), [2, 2]); assert.deepEqual(plan(5), [2, 3]); assert.deepEqual(plan(7), [2, 4, 1]);
});
test("tall voucher → bills start on page 2", () => {
  assert.ok(firstPageSpace(200) < 70);
  assert.deepEqual(plan(2, 200), [0, 2]); assert.deepEqual(plan(7, 200), [0, 4, 3]);
});
test("slot indexes are in order and never repeated", () => {
  const all = planPages(11, 100).flatMap(p => p.slots); assert.deepEqual(all, [...Array(11).keys()]);
});
test("attached-bills line", () => {
  assert.equal(attachedLine([], false), "No bills attached");
  assert.equal(attachedLine(["bill1.jpg", "bill2.pdf"], true), "Attached bills: 2 file(s) – bill1.jpg, bill2.pdf. See below.");
  assert.match(attachedLine(["a.jpg"], false), /See next page/);
});
test("file names and fixed slot height", () => {
  assert.equal(fileNameOf("bills/1792575968213_1un9.jpg", null), "1792575968213_1un9.jpg");
  assert.equal(fileNameOf("bills/x.jpg", "Ashapur bill.jpg"), "Ashapur bill.jpg");
  assert.ok(gridSlotMm() > 120 && gridSlotMm() < 130);
});
