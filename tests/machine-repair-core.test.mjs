import test from "node:test";
import assert from "node:assert/strict";
import { deriveRepairStatus, paginateRepairMachines, incompleteRepairMachines, repairTabMatches } from "../lib/machine-repair-core.mjs";

test("repair status is derived from dispatch and received machines", () => {
  assert.equal(deriveRepairStatus({ sent_at: null }, [{},{}]), "Requested");
  assert.equal(deriveRepairStatus({ sent_at: "now" }, [{},{}]), "Sent to vendor");
  assert.equal(deriveRepairStatus({ sent_at: "now" }, [{ received_at: "today" },{}]), "Partially received");
  assert.equal(deriveRepairStatus({ sent_at: "now" }, [{ received_at: "today" }]), "Received");
  assert.equal(repairTabMatches("With vendor", "Partially received"), true);
});
test("receipt pages hold exactly four machines without dropping the last group", () => {
  for (const [n,pages] of [[1,1],[2,1],[4,1],[5,2],[8,2],[9,3]]) {
    const groups = paginateRepairMachines(Array.from({length:n},(_,i)=>i+1));
    assert.equal(groups.length,pages);
    assert.ok(groups.every(g=>g.length<=4));
    assert.equal(groups.flat().length,n);
  }
});
test("validation identifies missing fields on the right machine", () => {
  assert.deepEqual(incompleteRepairMachines([{photo:{},name:"Drill",problem:"Motor"}]),[]);
  assert.deepEqual(incompleteRepairMachines([{name:"",problem:""},{photo:{},name:"Grinder",problem:""}]),[
    {number:1,missing:["photo","name","problem"]},
    {number:2,missing:["problem"]},
  ]);
});
