"use client";
// update329: LETTERS & DOCUMENTS
//
// Three moving parts, deliberately kept separate:
//   1. letter_templates  — the WORDING of each document type (staff + labour families)
//   2. company_clauses   — the RULES, written once, referenced by every template as
//                          {{clause.<key>}}. Change a rule here and every letter
//                          generated FROM NOW ON carries the new wording.
//   3. letters           — the issued register. rendered_body is FROZEN at issue.
//
// THE FREEZE RULE (Director, 8 Sep): an issued letter never re-renders. Kishan's
// August offer letter must keep saying whatever it said when he signed it, even
// after the notice period changes. Same principle as "amendments freeze old bills"
// in RA billing. Reprint always reads letters.rendered_body — never the template.
//
// Rendering happens HERE, in the browser, and the finished text is sent to
// fn_issue_letter which assigns the number atomically and stores the text as-is.
// The function refuses any body still containing "{{" so a half-filled letter can
// never be issued.
import { supabase, isDemo, fetchAll } from "./supabase";
import { isoLocal } from "./payrollSettings";

export const FAMILIES = [["staff", "Staff"], ["labour", "Labour"]];

// ---------------------------------------------------------------- dates
export function fmtDate(d) {                       // yyyy-mm-dd -> DD/MM/YYYY
  if (!d) return "";
  const [y, m, dd] = String(d).slice(0, 10).split("-");
  if (!y || !m || !dd) return String(d);
  return `${dd}/${m}/${y}`;
}
export function todayIso() { return isoLocal(new Date()); }

// "1 year 3 months" — used by Experience and Relieving letters
export function tenureText(from, to) {
  if (!from || !to) return "";
  const a = new Date(from + "T00:00:00"), b = new Date(to + "T00:00:00");
  if (isNaN(a) || isNaN(b) || b < a) return "";
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  const y = Math.floor(months / 12), m = months % 12;
  const parts = [];
  if (y) parts.push(y + (y === 1 ? " year" : " years"));
  if (m) parts.push(m + (m === 1 ? " month" : " months"));
  if (!parts.length) return "less than a month";
  return parts.join(" ");
}

// ------------------------------------------------- rupees in words (Indian)
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function under100(n) { return n < 20 ? ONES[n] : (TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "")); }
function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? under100(r) : "");
}
// Indian grouping: crore, lakh, thousand, hundred
export function rupeesInWords(amount) {
  let n = Math.floor(Math.abs(Number(amount) || 0));
  if (!n) return "Rupees Zero Only";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000);   n %= 100000;
  const thou = Math.floor(n / 1000);     n %= 1000;
  const rest = n;
  const parts = [];
  if (crore) parts.push(under1000(crore) + " Crore");
  if (lakh)  parts.push(under1000(lakh) + " Lakh");
  if (thou)  parts.push(under1000(thou) + " Thousand");
  if (rest)  parts.push(under1000(rest));
  return "Rupees " + parts.join(" ").replace(/\s+/g, " ").trim() + " Only";
}

// ---------------------------------------------------------------- company
export async function getCompany() {
  const fallback = { name: "PIPESKOOL PROJECTS PVT LTD.", address: "", cin: "", gstin: "", email: "", place: "Ahmedabad", signatory_name: "", signatory_title: "Authorized Signatory",
    mobile: "", state: "", state_code: "", logo_url: "", footer_line: "" };   // update450: letterhead fields
  if (isDemo) return fallback;
  const { data, error } = await supabase.from("app_settings").select("key, value").like("key", "company.%");
  if (error) throw new Error("Could not load company details: " + error.message);
  const out = { ...fallback };
  (data || []).forEach(r => { out[r.key.replace(/^company\./, "")] = r.value ?? ""; });
  return out;
}

// Company details are plain app_settings rows (same table as payroll settings and
// the GSTIN from update 300). The DB policy on app_settings is the gate.
export async function saveCompany(c) {
  if (isDemo) return { ok: true };
  const keys = ["name", "address", "cin", "gstin", "email", "place", "signatory_name", "signatory_title", "mobile", "state", "state_code", "logo_url", "footer_line"];   // update450
  const rows = keys.filter(k => k in c).map(k => ({ key: "company." + k, value: String(c[k] ?? "").trim(), updated_at: new Date().toISOString() }));
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: /row-level security/i.test(error.message) ? "Only a Director can change company details." : error.message };
  return { ok: true };
}

// update450: Director uploads the company logo once; every letterhead reads company.logo_url.
// The official artwork in /public stays the default — an empty logo_url means "use the official file".
export async function uploadCompanyLogo(file) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  if (!file) return { ok: false, error: "Choose a PNG / JPG / SVG file." };
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext)) return { ok: false, error: "Logo must be PNG, JPG, SVG or WEBP." };
  const path = `company/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("attendance-photos").upload(path, file, { contentType: file.type || undefined });
  if (error) return { ok: false, error: error.message };
  const r = await saveCompany({ logo_url: path });
  return r.ok ? { ok: true, path } : r;
}

// update450: that month's generated staff payroll row, if any — pre-fills the salary slip
export async function getStaffPayoutMonth(userId, ym) {
  if (isDemo || !userId || !ym) return null;
  const { data } = await supabase.from("staff_payouts")
    .select("pay_month, monthly_salary, working_days, days_present, days_absent, deduction, ot_hours, ot_amount, holiday_paid_days, holiday_amount, advances_deducted, pf_amount, pt_amount, other_deduction, net, status")
    .eq("user_id", Number(userId)).eq("pay_month", ym + "-01").maybeSingle();
  return data || null;
}

// ---------------------------------------------------------------- clauses
export async function getClauses(includeInactive = false) {
  if (isDemo) return [];
  let q = supabase.from("company_clauses").select("id, ckey, title, body, sort_order, is_active, updated_by_name, updated_at").order("sort_order").order("ckey");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(runFirst(error, "Could not load company rules"));
  return data || [];
}

export async function saveClause({ ckey, title, body, sort_order, is_active, note }) {
  if (isDemo) return { ok: true };
  const { data, error } = await supabase.rpc("fn_save_clause", {
    p_key: ckey, p_title: title, p_body: body,
    p_sort: sort_order === "" || sort_order == null ? null : Number(sort_order),
    p_active: is_active !== false, p_note: note || null,
  });
  if (error) return { ok: false, error: cleanErr(error) };
  return { ok: true, version: data?.version };
}

export async function getClauseHistory(ckey) {
  if (isDemo) return [];
  const { data, error } = await supabase.from("company_clause_history")
    .select("id, version, title, body, is_active, change_note, changed_by_name, changed_at")
    .eq("ckey", ckey).order("changed_at", { ascending: false });
  if (error) throw new Error(runFirst(error, "Could not load the rule history"));
  return data || [];
}

// -------------------------------------------------------------- templates
export async function getTemplates() {
  if (isDemo) return [];
  const { data, error } = await supabase.from("letter_templates")
    .select("id, code, family, name, heading, series_prefix, issued_by, body, version, is_active, sort_order, icon, accent, description, is_custom, updated_by_name, updated_at")   // update330: card metadata
    .eq("is_active", true).order("sort_order");
  if (error) throw new Error(runFirst(error, "Could not load letter templates"));
  return data || [];
}

export async function saveTemplate({ code, family, name, heading, body, note }) {
  if (isDemo) return { ok: true };
  const { data, error } = await supabase.rpc("fn_save_template", {
    p_code: code, p_family: family, p_name: name, p_heading: heading, p_body: body, p_note: note || null,
  });
  if (error) return { ok: false, error: cleanErr(error) };
  return { ok: true, version: data?.version };
}

export async function getTemplateHistory(code, family) {
  if (isDemo) return [];
  const { data, error } = await supabase.from("letter_template_history")
    .select("id, version, name, heading, body, change_note, changed_by_name, changed_at")
    .eq("code", code).eq("family", family).order("changed_at", { ascending: false });
  if (error) throw new Error(runFirst(error, "Could not load the template history"));
  return data || [];
}

// ------------------------------------------------------------- the people
// Staff come from app_users (the Staff tab of Workers & Staff Master).
export async function getStaffPeople() {
  if (isDemo) return [];
  const { data, error } = await fetchAll(() => supabase.from("app_users")
    .select("id, full_name, mobile, role, monthly_salary, joining_date, last_working_day, exit_reason, is_active, pan_no, pf_no, pf_uan, esi_no, department")   // update450
    .order("full_name"));
  if (error) throw new Error(runFirst(error, "Could not load staff"));
  return (data || []).map(r => ({ ...r, kind: "staff" }));
}

// Labour come from workers.
export async function getLabourPeople() {
  if (isDemo) return [];
  const { data, error } = await fetchAll(() => supabase.from("workers")
    .select("id, full_name, mobile, category, labour_type, daily_wage, site_id, joining_date, last_working_day, exit_reason, is_active, sites!workers_site_id_fkey(name)")
    .order("full_name"));
  if (error) throw new Error(runFirst(error, "Could not load labour"));
  return (data || []).map(r => ({ ...r, kind: "labour", site_name: r.sites?.name || "" }));
}

// role code -> printed designation ("it_engineer" -> "IT Engineer")
export async function getRoleLabels() {
  if (isDemo) return {};
  const { data } = await supabase.from("staff_roles").select("code, label");
  const map = {};
  (data || []).forEach(r => { map[r.code] = r.label; });
  return map;
}

// -------------------------------------------------------- token assembly
// Every value a template can reference. Blank values are left blank here and
// surface as "missing" at render time — they are never silently dropped.
export function buildTokens({ person, family, company, clauses, roleLabels, issueDate, letterNo }) {
  const t = {};
  // company
  Object.entries(company || {}).forEach(([k, v]) => { t["company." + k] = v || ""; });
  t["company.name"] = company?.name || "";
  t["place"] = company?.place || "";
  // letter
  t["letter.date"] = fmtDate(issueDate);
  t["letter.no"] = letterNo || "";
  // clauses
  (clauses || []).forEach(c => { t["clause." + c.ckey] = c.body || ""; });

  if (!person) return t;

  const join = person.joining_date || "";
  const lwd = person.last_working_day || "";
  t["emp.name"] = person.full_name || "";
  t["emp.mobile"] = person.mobile || "";
  t["emp.joining_date"] = fmtDate(join);
  t["emp.last_working_day"] = fmtDate(lwd);
  t["emp.tenure"] = tenureText(join, lwd);
  t["emp.exit_reason"] = person.exit_reason || "";

  if (family === "staff") {
    const label = (roleLabels || {})[person.role] || prettyRole(person.role);
    t["emp.designation"] = label;
    t["emp.department"] = label;          // departments = roles (locked rule since 203)
    t["emp.pan"] = person.pan_no || "";
    const sal = Number(person.monthly_salary) || 0;
    t["emp.salary"] = sal ? formatIndian(sal) : "";
    t["emp.salary_words"] = sal ? rupeesInWords(sal) : "";
  } else {
    t["emp.category"] = person.category || person.labour_type || "";
    t["emp.site"] = person.site_name || "";
    const w = Number(person.daily_wage) || 0;
    t["emp.daily_wage"] = w ? formatIndian(w) : "";
    t["emp.daily_wage_words"] = w ? rupeesInWords(w) : "";
  }
  return t;
}

function prettyRole(code) {
  return String(code || "").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function formatIndian(n) {
  const x = Math.round(Number(n) || 0);
  const s = String(x);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3), rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

// ------------------------------------------------------------- rendering
// Replace every {{token}}. Returns the text AND the list of tokens that had no
// value, so the screen can ask for them instead of printing "{{emp.salary}}".
export function renderTemplate(body, tokens, overrides = {}) {
  const missing = [];
  const text = String(body || "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (whole, key) => {
    const ov = overrides[key];
    if (ov != null && String(ov).trim() !== "") return String(ov);
    const v = tokens[key];
    if (v == null || String(v).trim() === "") { if (!missing.includes(key)) missing.push(key); return whole; }
    return String(v);
  });
  return { text, missing };
}

// Which clause keys a template actually uses — so the snapshot stores only those
export function clauseKeysUsed(body) {
  const out = [];
  String(body || "").replace(/\{\{\s*clause\.([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => { if (!out.includes(k)) out.push(k); return ""; });
  return out;
}

export const TOKEN_LABELS = {
  "emp.name": "Employee name", "emp.designation": "Designation", "emp.department": "Department",
  "emp.mobile": "Mobile", "emp.salary": "Monthly salary", "emp.salary_words": "Salary in words",
  "emp.daily_wage": "Daily wage", "emp.daily_wage_words": "Daily wage in words",
  "emp.category": "Labour category", "emp.site": "Site", "emp.pan": "PAN",
  "emp.joining_date": "Joining date", "emp.last_working_day": "Last working day",
  "emp.tenure": "Total service", "emp.exit_reason": "Reason for exit",
  "letter.no": "Letter number", "letter.date": "Letter date", "place": "Place",
};
export function tokenLabel(k) {
  if (TOKEN_LABELS[k]) return TOKEN_LABELS[k];
  // update330: {{input.x}} belongs to no master — it is typed for THIS letter. This is how
  // a new document type gets its own fields without a schema change anywhere.
  if (k.startsWith("input.")) {
    const w = k.slice(6).replace(/_/g, " ");
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  if (k.startsWith("clause.")) return "Company rule: " + k.slice(7).replace(/_/g, " ");
  if (k.startsWith("company.")) return "Company " + k.slice(8).replace(/_/g, " ");
  return k;
}

// Where a missing value should be fixed — a letter is not the place to invent a salary
export function fixHint(key) {
  if (key.startsWith("input.")) return "";   // update330: typed per letter — nothing to fix at source
  if (key.startsWith("clause.")) return "Add this rule in the Company Rules tab.";
  if (key.startsWith("company.")) return "Set this in the Company Rules tab (company details).";
  if (key === "emp.last_working_day" || key === "emp.exit_reason")
    return "Fill the exit details on the employee's record in Workers & Staff Master.";
  if (key === "emp.tenure") return "Needs both a joining date and a last working day on the employee's record.";
  return "Fill this on the employee's record in Workers & Staff Master.";
}

// ---------------------------------------------------------------- issuing
export async function issueLetter({ code, family, person, issueDate, body, tokens, clauses, wasEdited }) {
  if (isDemo) return { ok: true, letter_no: "PSP/DEMO/2026-27/001" };
  const used = {};
  (clauses || []).forEach(c => { used[c.ckey] = c.body; });
  const { data, error } = await supabase.rpc("fn_issue_letter", {
    p_code: code, p_family: family,
    p_staff_id: family === "staff" ? Number(person.id) : null,
    p_worker_id: family === "labour" ? Number(person.id) : null,
    p_issue_date: issueDate, p_body: body,
    p_tokens: tokens || {}, p_clauses: used, p_was_edited: !!wasEdited,
  });
  if (error) return { ok: false, error: cleanErr(error) };
  return { ok: true, id: data?.id, letter_no: data?.letter_no };
}

// ---------------------------------------------------------------- register
export async function getLetters({ from, to, family, code } = {}) {
  if (isDemo) return [];
  const { data, error } = await fetchAll(() => {
    let q = supabase.from("letters")
      .select("id, letter_no, template_code, family, heading, subject_name, issue_date, status, cancel_reason, created_by_name, created_at, staff_id, worker_id, was_edited")   // update330
      .order("issue_date", { ascending: false }).order("id", { ascending: false });
    if (from) q = q.gte("issue_date", from);
    if (to) q = q.lte("issue_date", to);
    if (family) q = q.eq("family", family);
    if (code) q = q.eq("template_code", code);
    return q;
  });
  if (error) throw new Error(runFirst(error, "Could not load the letter register"));
  return data || [];
}

export async function getLetter(id) {
  if (isDemo) return null;
  const { data, error } = await supabase.from("letters")
    .select("id, letter_no, template_code, family, heading, subject_name, issue_date, rendered_body, status, cancel_reason, created_by_name, created_at")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(runFirst(error, "Could not open that letter"));
  return data;
}

export async function cancelLetter(id, reason) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.rpc("fn_cancel_letter", { p_id: Number(id), p_reason: reason });
  if (error) return { ok: false, error: cleanErr(error) };
  return { ok: true };
}

// --------------------------------------------------------------- errors
// update272 lesson: a loader that depends on new SQL must SAY SO, never return []
function runFirst(error, what) {
  const m = String(error?.message || "");
  if (/letter|clause|schema cache|does not exist|relation/i.test(m))
    return `${what}. Run pipeskool_letters.sql (update 329) in Supabase first.\n\n${m}`;
  return `${what}: ${m}`;
}
function cleanErr(error) {
  const m = String(error?.message || "Something went wrong");
  if (/fn_save_clause|fn_save_template|fn_issue_letter|fn_cancel_letter|schema cache/i.test(m))
    return "Run pipeskool_letters.sql (update 329) in Supabase first.";
  if (/row-level security/i.test(m)) return "You do not have rights for this. Ask a Director for the Letters grant.";
  return m.replace(/^.*?ERROR:\s*/i, "");
}


// update330: a Director can add a whole new document type from the page. The card grid
// reads letter_templates, so the new type appears as a card with no code change.
export async function addTemplate(t) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.rpc("fn_add_template", {
    p_code: t.code, p_family: t.family, p_name: t.name, p_heading: t.heading,
    p_prefix: t.series_prefix, p_body: t.body,
    p_icon: t.icon || "\ud83d\udcc4", p_accent: t.accent || "slate", p_description: t.description || null,
  });
  if (error) return { ok: false, error: cleanErr(error) };
  return { ok: true };
}

// update330: split the unresolved tokens into the two kinds that need different handling —
// details TYPED for this letter ({{input.x}}) versus details MISSING from a master record.
export function splitTokens(keys) {
  const typed = [], missing = [];
  (keys || []).forEach(k => { if (k === "letter.no") return; (k.startsWith("input.") ? typed : missing).push(k); });
  return { typed, missing };
}

// update330: card tint keys -> the navy/orange palette. One place, so a new accent value
// added in SQL only needs a line here.
export const ACCENTS = {
  orange: { bg: "#fff1e6", fg: "#c2410c" },
  blue:   { bg: "#e8f0fe", fg: "#1e40af" },
  green:  { bg: "#e7f7ee", fg: "#15803d" },
  purple: { bg: "#f1ecfd", fg: "#6d28d9" },
  red:    { bg: "#fdecec", fg: "#b91c1c" },
  amber:  { bg: "#fff6e0", fg: "#b45309" },
  teal:   { bg: "#e4f6f6", fg: "#0f766e" },
  slate:  { bg: "#eef1f5", fg: "#334155" },
};
export const accentOf = a => ACCENTS[a] || ACCENTS.slate;
