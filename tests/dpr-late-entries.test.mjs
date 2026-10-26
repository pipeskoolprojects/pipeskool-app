import test from "node:test";
import assert from "node:assert/strict";
import { classifyMonth, pendingDates, validateLateEntry, monthBounds, DPR_RANGE_MAX_DAYS } from "../lib/dpr-pending.mjs";

const TODAY = "2026-10-26";
test("pending = working days before today with no DPR; Sundays and holidays are not pending", () => {
  const p = pendingDates({ year: 2026, month: 10, filled: ["2026-10-01", "2026-10-02", "2026-10-24", "2026-10-25"], off: ["2026-10-20"], today: TODAY, startDate: "2026-09-01" });
  assert.ok(!p.includes("2026-10-04") && !p.includes("2026-10-11") && !p.includes("2026-10-18"), "Sundays excluded");
  assert.ok(!p.includes("2026-10-20"), "holiday excluded");
  assert.ok(!p.includes("2026-10-01") && !p.includes("2026-10-24"), "filled days excluded");
  assert.ok(!p.includes("2026-10-26") && !p.includes("2026-10-27"), "today and future excluded");
  assert.deepEqual(p.slice(0, 3), ["2026-10-03", "2026-10-05", "2026-10-06"]);
  assert.equal(p.length, 17);
});
test("a Sunday with a DPR is shown as done, never pending", () => {
  const d = classifyMonth({ year: 2026, month: 10, filled: ["2026-10-25"], pending: [], off: ["2026-10-04", "2026-10-25"], today: TODAY, startDate: "2026-09-01" });
  assert.equal(d.find(x => x.date === "2026-10-25").state, "done");
  assert.equal(d.find(x => x.date === "2026-10-04").state, "off");
});
test("site start date limits what can be pending; today/future are not selectable", () => {
  const p = pendingDates({ year: 2026, month: 10, filled: [], off: [], today: TODAY, startDate: "2026-10-20" });
  assert.deepEqual(p, ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
  const d = classifyMonth({ year: 2026, month: 10, filled: [], pending: p, off: [], today: TODAY, startDate: "2026-10-20" });
  assert.equal(d.find(x => x.date === "2026-10-19").state, "before");
  assert.equal(d.find(x => x.date === "2026-10-26").state, "future");
  assert.equal(d.find(x => x.date === "2026-10-26").isToday, true);
});
test("late-entry validation mirrors the server rules", () => {
  const ok = { dates: ["2026-10-20"], reason: "Forgot to fill", work: ["Pipe laying"], today: TODAY };
  assert.equal(validateLateEntry(ok), "");
  assert.match(validateLateEntry({ ...ok, dates: [] }), /at least one date/);
  assert.match(validateLateEntry({ ...ok, dates: ["2026-10-26"] }), /future|today/i);
  assert.match(validateLateEntry({ ...ok, dates: ["2026-10-30"] }), /future/i);
  assert.match(validateLateEntry({ ...ok, reason: "ok" }), /reason/);
  assert.match(validateLateEntry({ ...ok, work: ["  "] }), /work point/);
  const many = Array.from({ length: DPR_RANGE_MAX_DAYS + 1 }, (_, i) => `2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, "0")}`);
  assert.match(validateLateEntry({ ...ok, dates: many }), /at most 62/);
});
test("month bounds", () => { assert.deepEqual(monthBounds(2026, 2), { from: "2026-02-01", to: "2026-02-28" }); assert.deepEqual(monthBounds(2026, 10), { from: "2026-10-01", to: "2026-10-31" }); });
