"use client";
// update365: CONTRACTOR ADVANCES — the ledger and the netting.
//
// Director's flow: the worker asks his contractor, the contractor asks the company, the
// company pays the CONTRACTOR, who hands it on. So an advance is held against the
// contractor and recovered from the contractor's next payment — never from a worker's wage.
// A contractor worker cannot raise one at all; the database refuses it (update363 trigger).
//
// Option A: a Director or site in-charge raises it on the contractor's behalf and it goes
// through the normal pending -> approved chain, so there is always a record of who asked.
import { supabase, isDemo } from "./supabase";
import { monthBounds } from "./payrollSettings";

export const ADV_STATUS = [
  ["pending", "Pending"], ["approved", "Approved"], ["paid", "Paid"], ["rejected", "Rejected"],
];

function clean(e) {
  const m = String(e?.message || e || "Something went wrong");
  // update366: "schema cache" appears in TWO different PostgREST errors — a genuinely
  // missing table, and an embed it cannot resolve because a foreign key is absent. Mapping
  // both to "run update 363" sent the Director to Supabase three times for a file that was
  // already installed. Say what is actually missing instead of guessing a filename.
  if (/could not find a relationship|no relationship/i.test(m))
    return "The database is missing a link between two tables, so this list cannot be read: " + m;
  if (/relation .*contractor_advances.* does not exist|fn_raise_contractor_advance|fn_review_contractor_advance|v_contractor_advance_outstanding/i.test(m))
    return "Run pipeskool_contractor_advances.sql (update 363) in Supabase first.";
  if (/schema cache/i.test(m))
    return "The database API has not picked up a recent change yet. Run  notify pgrst, 'reload schema';  in Supabase, or restart the API under Settings -> API.\n\n" + m;
  if (/row-level security/i.test(m)) return "You do not have rights for this.";
  return m.replace(/^.*?ERROR:\s*/i, "");
}

export async function getContractors() {
  if (isDemo) return [];
  const { data, error } = await supabase.from("contractors")
    .select("id, name, bank_account_no, bank_ifsc, bank_name").eq("is_active", true).order("name");
  if (error) throw new Error(clean(error));
  return data || [];
}

export async function raiseContractorAdvance({ contractorId, amount, reason, forWorkers, siteId }) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_raise_contractor_advance", {
    p_contractor_id: Number(contractorId), p_amount: Number(amount),
    p_reason: reason || null, p_for_workers: forWorkers || null,
    p_site_id: siteId ? Number(siteId) : null,
  });
  if (error) return { ok: false, error: clean(error) };
  return { ok: true, req_no: data?.req_no };
}

export async function reviewContractorAdvance(id, action, amount, note) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.rpc("fn_review_contractor_advance", {
    p_id: Number(id), p_action: action,
    p_amount: amount === "" || amount == null ? null : Number(amount), p_note: note || null,
  });
  if (error) return { ok: false, error: clean(error) };
  return { ok: true };
}

export async function listContractorAdvances(contractorId = null) {
  if (isDemo) return [];
  let q = supabase.from("contractor_advances")
    .select("id, req_no, contractor_id, contractor_name, site_id, amount, approved_amount, reason, for_workers, status, raised_by_name, raised_at, reviewed_by_name, reviewed_at, review_note, paid_on, recovered, kind, for_worker_id, requested_by_worker_id, pay_to, pay_to_worker_id, recipient_name, sites(name), for_worker:for_worker_id(full_name)")
    .order("raised_at", { ascending: false });
  if (contractorId) q = q.eq("contractor_id", contractorId);
  const { data, error } = await q;
  if (error) throw new Error(clean(error));
  return (data || []).map(r => ({ ...r, site: r.sites?.name || "—", for_worker_name: r.for_worker?.full_name || "",
    given: Number(r.approved_amount ?? r.amount) || 0 }));
}

export async function getOutstanding() {
  if (isDemo) return [];
  const [{ data, error }, { data: act }] = await Promise.all([
    supabase.from("v_contractor_advance_outstanding").select("contractor_id, contractor_name, advanced, recovered, outstanding").order("contractor_name"),
    supabase.from("contractors").select("id, name").eq("is_active", true),
  ]);
  if (error) throw new Error(clean(error));
  // update437: drop deactivated/merged duplicates ("X (merged into #3)") and collapse to one row per contractor id
  const active = new Map((act || []).map(c => [Number(c.id), c.name]));
  const byId = new Map();
  (data || []).forEach(r => { const id = Number(r.contractor_id); if (!active.has(id)) return; const cur = byId.get(id) || { contractor_id: id, contractor_name: active.get(id), advanced: 0, recovered: 0, outstanding: 0 };
    cur.advanced += Number(r.advanced || 0); cur.recovered += Number(r.recovered || 0); cur.outstanding += Number(r.outstanding || 0); byId.set(id, cur); });
  return [...byId.values()].sort((a, b) => a.contractor_name.localeCompare(b.contractor_name));
}

// ---------------------------------------------------------------------
// THE NETTING.
// What the company owes a contractor this month = the wages their workers earned
// (the company never pays those workers directly) MINUS what has already been advanced
// to that contractor and not yet recovered.
//
// Wages come from the GENERATED labour payroll, never recomputed here — the same rule the
// salary slip follows, so this figure and the wages sheet can never disagree.
// ---------------------------------------------------------------------
export async function getContractorNetting(monthStr) {
  if (isDemo) return [];
  const { from } = monthBounds(monthStr);

  const [{ data: pay, error: e1 }, out] = await Promise.all([
    supabase.from("wage_payouts")
      .select("worker_id, gross, net, days_total, status, workers!inner(contractor_id, labour_type, full_name)")
      .eq("pay_month", from),
    getOutstanding(),
  ]);
  if (e1) throw new Error(clean(e1));

  const byC = {};
  (pay || []).forEach(p => {
    const w = p.workers;
    if (!w || w.labour_type !== "contractor" || !w.contractor_id) return;
    const c = byC[w.contractor_id] = byC[w.contractor_id] || { contractor_id: w.contractor_id, workers: new Set(), wages: 0, days: 0 };
    c.workers.add(p.worker_id);
    c.wages += Number(p.gross || 0);
    c.days += Number(p.days_total || 0);
  });

  const outBy = {}; (out || []).forEach(o => { outBy[o.contractor_id] = o; });
  const ids = new Set([...Object.keys(byC).map(Number), ...(out || []).map(o => o.contractor_id)]);

  return [...ids].map(id => {
    const c = byC[id] || { workers: new Set(), wages: 0, days: 0 };
    const o = outBy[id] || {};
    const wages = +Number(c.wages || 0).toFixed(2);
    const outstanding = +Number(o.outstanding || 0).toFixed(2);
    return {
      contractor_id: id,
      contractor_name: o.contractor_name || "Contractor " + id,
      workers: c.workers.size,
      days: +Number(c.days || 0).toFixed(2),
      wages,
      advanced: +Number(o.advanced || 0).toFixed(2),
      recovered: +Number(o.recovered || 0).toFixed(2),
      outstanding,
      // never negative: you cannot pay a contractor less than nothing. Anything still owed
      // beyond this month's wages stays outstanding and carries into the next run.
      netPayable: +Math.max(wages - outstanding, 0).toFixed(2),
      carryForward: +Math.max(outstanding - wages, 0).toFixed(2),
    };
  }).sort((a, b) => a.contractor_name.localeCompare(b.contractor_name));
}

// ===================== update436: explicit "Pay to", worker-raised requests, per-worker balances =====================
export async function setContractorAdvanceRecipient(id, payTo, workerId = null) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_contractor_advance_set_recipient", { p_id: Number(id), p_pay_to: payTo, p_worker_id: workerId ? Number(workerId) : null });
  if (error) return { ok: false, error: /fn_contractor_advance_set_recipient/.test(error.message) ? "Run pipeskool_contractor_pay_to.sql (update 436) first." : clean(error) };
  return data?.ok ? { ok: true, recipient: data.recipient } : { ok: false, error: data?.error || "Could not set recipient." };
}
export async function setContractorAdvanceForWorker(id, workerId) {
  const { data, error } = await supabase.rpc("fn_contractor_advance_set_for_worker", { p_id: Number(id), p_worker_id: Number(workerId) });
  if (error) return { ok: false, error: clean(error) }; return data?.ok ? { ok: true } : { ok: false, error: data?.error };
}
export async function getContractorWorkers(contractorId) {
  if (isDemo) return [];
  const { data } = await supabase.from("workers").select("id, full_name, site_id, profile_complete, sites(name)").eq("contractor_id", Number(contractorId)).eq("is_active", true).order("full_name");
  return (data || []).map(w => ({ id: w.id, name: w.full_name, site: w.sites?.name || "", bank: !!w.profile_complete }));
}
export async function getContractorWorkerBalances(contractorId = null) {
  if (isDemo) return [];
  let q = supabase.from("v_contractor_worker_balance").select("*").order("contractor_name").order("worker_name"); if (contractorId) q = q.eq("contractor_id", Number(contractorId));
  const { data } = await q; return data || [];
}
