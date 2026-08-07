"use client";
import { supabase, isDemo } from "./supabase";
import { assignedSiteIds } from "./auth";
import { notifyRequest, notifyDecision } from "./notify";
import { billUrl } from "./bills";
import { todayLocal } from "./today";

export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

// resolve a real staff user id to attribute actions to (testing-safe)
let _cachedActorId = undefined;
export async function resolveActorId(preferUserId) {
  if (isDemo) return preferUserId || 1;
  if (_cachedActorId !== undefined) return _cachedActorId;
  // prefer the given id if it exists
  if (preferUserId) {
    const { data } = await supabase.from("app_users").select("id").eq("id", preferUserId).maybeSingle();
    if (data) { _cachedActorId = data.id; return _cachedActorId; }
  }
  // else first available staff user, else null
  const { data } = await supabase.from("app_users").select("id").order("id").limit(1).maybeSingle();
  _cachedActorId = data ? data.id : null;
  return _cachedActorId;
}


export const EXPENSE_CATEGORIES = [
  ["local_material", "Local material purchase"],
  ["transport", "Transport / tempo"],
  ["tea_food", "Tea / food"],
  ["consumables", "Consumables"],
  ["repairs", "Repairs"],
  ["loading_unloading", "Loading / unloading"],
  ["misc", "Miscellaneous"],
];
export const catLabel = k => (EXPENSE_CATEGORIES.find(c => c[0] === k) || ["", k])[1];

// ---------------- DEMO STATE ----------------
let demoAdvReqs = [];
let demoExpenses = [];
const demoBalances = { petty: 0 };

// people the supervisor can raise advance for (own site workers + self/staff)
const demoBeneficiaries = [
  { kind: "staff", id: 1, name: "SATYENDRA (me)", bank: false },
];

// ---------------- BENEFICIARIES (for advance salary dropdown) ----------------
export async function getBeneficiaries(userId, siteIds) {
  if (isDemo) {
    // include any demo workers added
    return demoBeneficiaries;
  }
  // update146: BOTH staff and labour from the requester's assigned sites only.
  const out = [];
  const passed = (siteIds || []).map(Number).filter(n => !isNaN(n) && n > 0);
  const scopeB = assignedSiteIds();
  const siteScope = passed.length ? passed : scopeB;   // null => director => all sites

  let sq = supabase.from("sites").select("id, name").eq("is_active", true);
  if (siteScope && siteScope.length) sq = sq.in("id", siteScope);
  const { data: sites } = await sq;
  const sname = {}; (sites || []).forEach(x => { sname[x.id] = x.name; });

  // STAFF assigned to those sites (requester first); directors excluded (they approve)
  const [{ data: staffRows }, { data: usRows }] = await Promise.all([
    supabase.from("app_users").select("id, full_name, mobile, role, bank_complete").eq("is_active", true),
    supabase.from("user_sites").select("user_id, site_id"),
  ]);
  const sitesOf = {}; (usRows || []).forEach(r => (sitesOf[r.user_id] = sitesOf[r.user_id] || []).push(Number(r.site_id)));
  const staff = (staffRows || []).filter(u => u.role !== "director" &&
    (!siteScope || (sitesOf[u.id] || []).some(sid => siteScope.includes(sid))));
  staff.sort((a, b) => a.id === userId ? -1 : b.id === userId ? 1 : String(a.full_name).localeCompare(String(b.full_name)));
  staff.forEach(u => out.push({ kind: "staff", id: u.id, name: u.full_name, site_id: (sitesOf[u.id] || [])[0] || null,
    label: u.full_name + (u.id === userId ? " (me)" : "") + " \u00b7 Staff", bank: !!u.bank_complete }));

  // LABOUR at those sites (staff punch-profiles excluded — they are staff, not labour)
  let wq = supabase.from("workers").select("id, full_name, mobile, profile_complete, site_id").eq("is_active", true);
  if (siteScope && siteScope.length) wq = wq.in("site_id", siteScope);
  const { data: workers } = await wq;
  const staffMob = new Set((staffRows || []).map(u => String(u.mobile)));
  (workers || [])
    .filter(w => !staffMob.has(String(w.mobile)))
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)))
    .forEach(w => out.push({ kind: "labour", id: w.id, name: w.full_name, site_id: w.site_id,
      label: w.full_name + " \u00b7 Labour \u00b7 " + (sname[w.site_id] || ("Site " + w.site_id)), bank: !!w.profile_complete }));
  return out;
}

// ---------------- ADVANCE SALARY ----------------
export async function raiseAdvanceSalary(p) {
  if (isDemo) {
    demoAdvReqs = [{ id: Date.now(), req_no: "ADV/" + (demoAdvReqs.length + 1),
      beneficiary_name: p.beneficiary_name, beneficiary_kind: p.beneficiary_kind,
      amount: p.amount, reason: p.reason, bank_on_file: p.bank_on_file,
      status: "pending", date: todayLocal() }, ...demoAdvReqs];
    return { ok: true };
  }
  const raisedBy = await resolveActorId(p.raised_by);
  const payload = {
    req_no: "ADV/" + new Date().getFullYear().toString().slice(2) + "/" + Date.now().toString().slice(-4),
    site_id: p.site_id, amount: p.amount, reason: p.reason,
    beneficiary_name: p.beneficiary_name, beneficiary_kind: p.beneficiary_kind,
    bank_on_file: p.bank_on_file, raised_by: raisedBy,
  };
  if (p.beneficiary_kind === "labour") payload.beneficiary_worker_id = p.beneficiary_id;
  else payload.beneficiary_user_id = p.beneficiary_id;
  const { data: ins, error } = await supabase.from("advance_salary_requests").insert(payload).select("id").single();
  if (error) return { ok: false, error: error.message };
  notifyRequest({ kind: "advance", requestId: ins?.id, siteId: p.site_id,
    title: "Advance salary — " + p.beneficiary_name + " (" + (p.beneficiary_kind === "labour" ? "Labour" : "Staff") + ")",
    body: "\u20b9" + p.amount + (p.reason ? " \u00b7 " + p.reason : "") + " \u00b7 pending approval" });
  return { ok: true };
}

export async function getAdvanceQueue() {
  if (isDemo) return demoAdvReqs;
  const { data } = await supabase.from("advance_salary_requests")
    .select("id, req_no, beneficiary_name, beneficiary_kind, amount, reason, bank_on_file, status, query_note, response_note, reviewed_at, posted_to_tally, request_date:created_at, sites(name), reviewer:reviewed_by(full_name)")
    .order("created_at", { ascending: false }).limit(200);
  return (data || []).map(r => ({ id: r.id, req_no: r.req_no, beneficiary_name: r.beneficiary_name,
    beneficiary_kind: r.beneficiary_kind, amount: Number(r.amount), reason: r.reason,
    bank_on_file: r.bank_on_file, status: r.status, site: r.sites?.name,
    query: r.query_note, response: r.response_note,
    approved_on: r.reviewed_at ? r.reviewed_at.slice(0,10) : "",
    approved_by: r.reviewer?.full_name || "",
    posted: r.posted_to_tally,
    date: r.request_date ? r.request_date.slice(0,10) : "" }));
}

export async function reviewAdvance(id, status, note, reviewerId) {
  if (isDemo) { demoAdvReqs = demoAdvReqs.map(r => r.id === id ? { ...r, status } : r); return { ok: true }; }
  const { error } = await supabase.from("advance_salary_requests")
    .update({ status, query_note: note || null, reviewed_at: new Date().toISOString(), reviewed_by: reviewerId || null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  try {
    const { data: r } = await supabase.from("advance_salary_requests")
      .select("raised_by, beneficiary_name, amount, site_id").eq("id", id).maybeSingle();
    if (r?.raised_by) notifyDecision({ toUserId: r.raised_by, kind: "advance", requestId: id, siteId: r.site_id,
      status, title: "Advance for " + r.beneficiary_name + " " + status,
      body: "\u20b9" + r.amount + (note ? " \u00b7 " + note : "") });
  } catch {}
  return { ok: true };
}

// ---------------- SITE EXPENSE CLAIM ----------------
export async function claimExpense(p) {
  if (isDemo) {
    demoExpenses = [{ id: Date.now(), date: todayLocal(), category: p.category, amount: p.amount,
      paid_to: p.paid_to, funding_source: p.funding_source, photo: !!p.photoFile, status: "pending" }, ...demoExpenses];
    return { ok: true };
  }
  // update159: multiple bills, images AND PDFs, original file type preserved
  const files = (p.billFiles && p.billFiles.length ? Array.from(p.billFiles) : (p.photoFile ? [p.photoFile] : []));
  const paths = [];
  for (const f of files) {
    const ext = (f.name && f.name.includes(".") ? f.name.split(".").pop() : (f.type === "application/pdf" ? "pdf" : "jpg")).toLowerCase();
    const path = `bills/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("attendance-photos")
      .upload(path, f, { contentType: f.type || undefined });
    if (!upErr) paths.push(path);
  }
  const photoUrl = paths[0] || null;
  const actor = await resolveActorId(p.user_id);
  const { data: ins, error } = await supabase.from("expenses").insert({
    site_id: p.site_id, holder_user_id: actor, claimant_user_id: actor,
    expense_date: todayLocal(), category: p.category, amount: p.amount, paid_to: p.paid_to,
    pay_mode: "cash", funding_source: p.funding_source, bill_photo_url: photoUrl,
    bank_on_file: p.bank_on_file, note: p.note,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  if (ins?.id && paths.length) {
    try { await supabase.from("expense_bills").insert(paths.map(x => ({ expense_id: ins.id, path: x }))); } catch {}
  }
  notifyRequest({ kind: "expense", requestId: ins?.id, siteId: p.site_id,
    title: "Expense claim \u2014 " + p.category,
    body: "\u20b9" + p.amount + " to " + (p.paid_to || "\u2014") + " \u00b7 pending approval" });
  return { ok: true };
}

// ---------------- ADVANCE PETTY CASH REQUESTS (update159) ----------------
export async function requestPettyCash(p) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const actor = await resolveActorId(p.user_id);
  const { data: ins, error } = await supabase.from("petty_cash_requests").insert({
    site_id: p.site_id, requested_by: actor, amount: Number(p.amount),
    purpose: p.purpose, required_date: p.required_date || null, remarks: p.remarks || null,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  notifyRequest({ kind: "petty", requestId: ins?.id, siteId: p.site_id,
    title: "Petty cash request \u2014 " + (p.requester_name || "staff"),
    body: "\u20b9" + p.amount + " \u00b7 " + p.purpose
      + (p.required_date ? " \u00b7 needed " + p.required_date : "") + " \u00b7 pending approval" });
  return { ok: true };
}

export async function getPettyRequestQueue() {
  if (isDemo) return [];
  const { data } = await supabase.from("petty_cash_requests")
    .select("id, amount, purpose, required_date, remarks, status, query_note, created_at, reviewed_at, sites(name), requester:requested_by(full_name), reviewer:reviewed_by(full_name)")
    .order("created_at", { ascending: false }).limit(300);
  return (data || []).map(r => ({ id: r.id, amount: Number(r.amount), purpose: r.purpose,
    required_date: r.required_date, remarks: r.remarks, status: r.status, query: r.query_note,
    date: r.created_at?.slice(0, 10), site: r.sites?.name || "", requester: r.requester?.full_name || "",
    reviewer: r.reviewer?.full_name || "" }));
}

export async function reviewPettyRequest(id, status, note) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_approve_petty", { p_id: id, p_status: status, p_note: note || null });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error || "Could not review." };
  notifyDecision({ toUserId: data.requested_by, kind: "petty", requestId: id, siteId: data.site_id,
    status, title: "Petty cash request " + status,
    body: "\u20b9" + data.amount + " \u00b7 " + (data.purpose || "") + (note ? " \u00b7 " + note : "")
      + (status === "approved" ? " \u00b7 added to your petty balance" : "") });
  return { ok: true };
}

export async function getMyRecentMoney(userId) {
  if (isDemo) return [...demoAdvReqs.map(r => ({ id: r.id, type: "Advance", name: r.beneficiary_name, amount: r.amount, status: r.status, query: r.query_note, date: r.date })),
                      ...demoExpenses.map(e => ({ id: e.id, type: "Expense", name: e.paid_to, amount: e.amount, status: e.status, query: e.query_note, date: e.date }))].slice(0, 8);
  const { data: adv } = await supabase.from("advance_salary_requests")
    .select("id, beneficiary_name, amount, status, query_note, created_at").eq("raised_by", userId).order("created_at", {ascending:false}).limit(8);
  const { data: exp } = await supabase.from("expenses")
    .select("id, paid_to, amount, status, query_note, expense_date").eq("claimant_user_id", userId).order("created_at", {ascending:false}).limit(8);
  const { data: pet } = await supabase.from("petty_cash_requests")
    .select("id, amount, purpose, status, query_note, created_at").eq("requested_by", userId).order("created_at", {ascending:false}).limit(8);
  return [...(adv||[]).map(r => ({ id: r.id, type: "Advance", name: r.beneficiary_name, amount: Number(r.amount), status: r.status, query: r.query_note, date: r.created_at?.slice(0,10) })),
          ...(exp||[]).map(e => ({ id: e.id, type: "Expense", name: e.paid_to, amount: Number(e.amount), status: e.status, query: e.query_note, date: e.expense_date })),
          ...(pet||[]).map(r => ({ id: r.id, type: "Petty cash", name: r.purpose, amount: Number(r.amount), status: r.status, query: r.query_note, date: r.created_at?.slice(0,10) }))];
}

// ---------------- PETTY CASH BALANCE ----------------
export async function getPettyBalance(userId) {
  if (isDemo) return demoBalances.petty;
  const { data } = await supabase.from("v_petty_cash_balance").select("balance").eq("user_id", userId);
  return (data || []).reduce((s, r) => s + Number(r.balance || 0), 0);
}

// ---------------- WEB: expense claim queue + reconciliation ----------------
export async function getExpenseClaimQueue() {
  if (isDemo) return demoExpenses.filter(e => e.status === "pending");
  const { data } = await supabase.from("expenses")
    .select("id, expense_date, category, amount, paid_to, funding_source, bill_photo_url, bank_on_file, status, query_note, response_note, reviewed_at, posted_to_tally, sites(name), claimant:claimant_user_id(full_name), reviewer:reviewed_by(full_name), expense_bills(path)")
    .order("created_at", { ascending: false }).limit(300);
  return (data || []).map(e => ({ id: e.id, date: e.expense_date, category: e.category,
    amount: Number(e.amount), paid_to: e.paid_to, funding_source: e.funding_source,
    photo: !!e.bill_photo_url || (e.expense_bills || []).length > 0,
    bills: Array.from(new Set([...(e.expense_bills || []).map(b => b.path), ...(e.bill_photo_url ? [e.bill_photo_url] : [])])),
    bank_on_file: e.bank_on_file, status: e.status,
    query: e.query_note, response: e.response_note,
    approved_on: e.reviewed_at ? e.reviewed_at.slice(0,10) : "",
    approved_by: e.reviewer?.full_name || "",
    posted: e.posted_to_tally,
    site: e.sites?.name, claimant: e.claimant?.full_name }));
}

export async function reviewExpenseClaim(id, status, note, reviewerId) {
  if (isDemo) { demoExpenses = demoExpenses.map(e => e.id === id ? { ...e, status } : e); return { ok: true }; }
  const { error } = await supabase.from("expenses")
    .update({ status, query_note: note || null, reviewed_at: new Date().toISOString(), reviewed_by: reviewerId || null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  try {
    const { data: r } = await supabase.from("expenses")
      .select("claimant_user_id, category, amount, site_id").eq("id", id).maybeSingle();
    if (r?.claimant_user_id) notifyDecision({ toUserId: r.claimant_user_id, kind: "expense", requestId: id, siteId: r.site_id,
      status, title: "Expense claim (" + r.category + ") " + status,
      body: "\u20b9" + r.amount + (note ? " \u00b7 " + note : "") });
  } catch {}
  return { ok: true };
}

export async function getPettyReconciliation() {
  if (isDemo) return [];
  const { data } = await supabase.from("v_petty_cash_balance").select("*");
  return (data || []).map(r => ({ holder: r.full_name, site: r.site_name,
    granted: Number(r.granted), spent: Number(r.spent_from_petty), balance: Number(r.balance) }));
}


// ---------------- RESPOND TO A QUERY & RESUBMIT ----------------
export async function respondAdvance(id, responseNote, newAmount) {
  if (isDemo) { demoAdvReqs = demoAdvReqs.map(r => r.id === id ? { ...r, status: "pending", query_note: null } : r); return { ok: true }; }
  const patch = { status: "pending", response_note: responseNote || null, resubmitted_at: new Date().toISOString() };
  if (newAmount) patch.amount = Number(newAmount);
  const { error } = await supabase.from("advance_salary_requests").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function respondExpense(id, responseNote, newAmount, photoFile) {
  if (isDemo) { demoExpenses = demoExpenses.map(e => e.id === id ? { ...e, status: "pending", query_note: null } : e); return { ok: true }; }
  let photoUrl;
  if (photoFile) {
    const path = `bills/${Date.now()}_${Math.random().toString(36).slice(2,6)}.jpg`;
    const { error: upErr } = await supabase.storage.from("attendance-photos").upload(path, photoFile);
    if (!upErr) photoUrl = path;
  }
  const patch = { status: "pending", response_note: responseNote || null, resubmitted_at: new Date().toISOString() };
  if (newAmount) patch.amount = Number(newAmount);
  if (photoUrl) patch.bill_photo_url = photoUrl;
  const { error } = await supabase.from("expenses").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}


// ---------------- MARK PAID / POSTED TO TALLY ----------------
export async function markAdvancePosted(id, posted, byUserId) {
  if (isDemo) { demoAdvReqs = demoAdvReqs.map(r => r.id === id ? { ...r, posted } : r); return { ok: true }; }
  const { error } = await supabase.from("advance_salary_requests")
    .update({ posted_to_tally: posted, posted_at: posted ? new Date().toISOString() : null, posted_by: posted ? (byUserId || null) : null }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function markExpensePosted(id, posted, byUserId) {
  if (isDemo) { demoExpenses = demoExpenses.map(e => e.id === id ? { ...e, posted } : e); return { ok: true }; }
  const { error } = await supabase.from("expenses")
    .update({ posted_to_tally: posted, posted_at: posted ? new Date().toISOString() : null, posted_by: posted ? (byUserId || null) : null }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
