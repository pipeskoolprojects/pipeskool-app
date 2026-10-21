import test from "node:test";
import assert from "node:assert/strict";
import { approvedExpenseTotal, countOpenIndents, progressPercent } from "./supervisor-dashboard.mjs";

test("approvedExpenseTotal counts only approved expenses in the selected month", () => {
  assert.equal(approvedExpenseTotal([
    { expense_date: "2026-10-01", status: "approved", amount: "1250" },
    { date: "2026-10-14", status: "pending", amount: 900 },
    { date: "2026-09-30", status: "approved", amount: 400 },
  ], "2026-10"), 1250);
  assert.equal(approvedExpenseTotal(null, "2026-10"), null);
});

test("countOpenIndents includes only current open workflow states", () => {
  assert.equal(countOpenIndents([{status:"open"},{status:"quoting"},{status:"pending"},{status:"issued"}]), 3);
  assert.equal(countOpenIndents(null), null);
});

test("progressPercent handles empty, invalid, over-complete, and real progress", () => {
  assert.equal(progressPercent(13, 20), 65);
  assert.equal(progressPercent(4, 0), null);
  assert.equal(progressPercent(120, 100), 100);
  assert.equal(progressPercent(-4, 100), 0);
});
