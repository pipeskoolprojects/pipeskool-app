// update203: PROJECT MANAGEMENT data layer. Sites ARE projects — this reads/extends
// the sites table plus project_docs/project_tasks, and derives financials & activity
// from existing module tables. No duplicate data anywhere.
import { supabase, isDemo } from "./supabase";
import { canViewPrices, attachPrices } from "./prices";   // update463
import { fileStore } from "./files";   // update460: files live in Cloudflare R2 (private)

export const PROJECT_STATUSES = [
  ["active", "Active", "var(--green)"],
  ["upcoming", "Upcoming", "#6b46c1"],
  ["on_hold", "On Hold", "var(--amber)"],
  ["delayed", "Delayed", "var(--red)"],
  ["completed", "Completed", "#2b6cb0"],
  ["idea", "Idea", "var(--muted)"],
];
export const stMeta = s => PROJECT_STATUSES.find(x => x[0] === s) || PROJECT_STATUSES[0];

export async function getProjects() {
  if (isDemo) return [];
  const [{ data: sites, error }, { data: bills }, { data: mgrs }] = await Promise.all([
    supabase.from("sites").select("*").order("id"),
    supabase.from("ra_bills").select("site_id, status, id").neq("status", "draft"),
    supabase.from("app_users").select("id, full_name, role").eq("is_active", true),
  ]);
  if (error) return { error: error.message, rows: [] };
  // invoiced amount per site (RA bill totals live in lines; use count + billing page for detail —
  // here we sum certified/paid bill grand totals via v if present, else leave 0)
  const invBy = {};
  try {
    const { data: tot } = await supabase.from("v_ra_bill_totals").select("site_id, grand_total");
    (tot || []).forEach(t => { invBy[t.site_id] = (invBy[t.site_id] || 0) + Number(t.grand_total || 0); });
  } catch { /* view may not exist; billing page remains source of truth */ }
  const mgrBy = {}; (mgrs || []).forEach(m => { mgrBy[m.id] = m.full_name; });
  const rows = (sites || []).map(s => ({
    ...s,
    status: s.project_status || "active",
    manager: mgrBy[s.manager_id] || "",
    invoiced: invBy[s.id] || 0,
    bills: (bills || []).filter(b => b.site_id === s.id).length,
    progress: s.contract_value > 0 ? Math.min(Math.round(((invBy[s.id] || 0) / Number(s.contract_value)) * 100), 100) : null,
  }));
  return { rows, staff: mgrs || [] };
}

export async function saveProject(id, form) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const payload = {
    name: String(form.name || "").trim(),
    code: String(form.code || "").trim().toUpperCase() || String(form.name || "").trim().slice(0, 6).toUpperCase(),
    address: form.address || null,
    client_name: form.client_name || null, client_contact: form.client_contact || null,
    manager_id: form.manager_id ? Number(form.manager_id) : null,
    project_status: form.project_status || "active",
    start_date: form.start_date || null, end_date: form.end_date || null,
    expected_start: form.expected_start || null,
    contract_value: form.contract_value ? Number(form.contract_value) : null,
    estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
    priority: form.priority || "medium", tags: form.tags || null, description: form.description || null,
    // upcoming / idea / completed projects stay OUT of operational dropdowns
    is_active: ["active", "on_hold", "delayed"].includes(form.project_status || "active"),
  };
  if (!payload.name) return { ok: false, error: "Project name is required." };
  if (id) {
    const { error } = await supabase.from("sites").update(payload).eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  // new sites need geofence NOT NULL columns — placeholder until site actually starts
  const { data, error } = await supabase.from("sites")
    .insert({ ...payload, geofence_lat: 0, geofence_lng: 0, geofence_radius_m: 200 }).select("id").single();
  return error ? { ok: false, error: /duplicate key.*code/i.test(error.message) ? "Site code already exists — pick a different short code." : error.message } : { ok: true, id: data.id };
}

export async function getProjectDocs(siteId) {
  if (isDemo) return [];
  const { data } = await supabase.from("project_docs")
    .select("id, name, path, created_at, app_users(full_name)").eq("site_id", siteId).order("id", { ascending: false });
  return data || [];
}
export async function uploadProjectDoc(siteId, file, uploadedBy) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `project-docs/${siteId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error: e1 } = await fileStore.from("attendance-photos").upload(path, file, { contentType: file.type || undefined });
  if (e1) return { ok: false, error: e1.message };
  const { error } = await supabase.from("project_docs").insert({ site_id: siteId, name: file.name, path, uploaded_by: uploadedBy || null });
  return error ? { ok: false, error: error.message } : { ok: true };
}
export function projectDocUrl(path) {
  return fileStore.from("attendance-photos").getPublicUrl(path).data?.publicUrl || "";
}
export async function deleteProjectDoc(id) {
  const { error } = await supabase.from("project_docs").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getTasks({ siteId, mine, staffId } = {}) {
  if (isDemo) return [];
  let q = supabase.from("project_tasks")
    .select("id, site_id, title, due_date, priority, done, assigned_to, sites(name), assignee:assigned_to(full_name)")
    .order("done").order("due_date", { ascending: true, nullsFirst: false }).limit(200);
  if (siteId) q = q.eq("site_id", siteId);
  if (mine && staffId) q = q.eq("assigned_to", staffId);
  const { data } = await q;
  return data || [];
}
export async function addTask({ site_id, title, due_date, priority, assigned_to, created_by }) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  if (!String(title || "").trim()) return { ok: false, error: "Task title required." };
  const { error } = await supabase.from("project_tasks").insert({
    site_id: site_id || null, title: title.trim(), due_date: due_date || null,
    priority: priority || "medium", assigned_to: assigned_to || null, created_by: created_by || null });
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function toggleTask(id, done) {
  const { error } = await supabase.from("project_tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Recent activity across existing modules for one site (or all) — derived, never stored twice
export async function getProjectActivity(siteId, limit = 12) {
  if (isDemo) return [];
  const site = q => siteId ? q.eq("site_id", siteId) : q;
  const [pos, grns, dprs, exps] = await Promise.all([
    site(supabase.from("purchase_orders").select("id, po_no, vendor_name, approval_status, created_at, sites(name)")).order("created_at", { ascending: false }).limit(limit),
    site(supabase.from("stock_txns").select("grn_no, vendor, created_at, sites!stock_txns_site_id_fkey(name)").eq("txn_type", "grn").not("grn_no", "is", null)).order("created_at", { ascending: false }).limit(limit),
    site(supabase.from("dpr").select("dpr_date, created_at, sites(name)")).order("created_at", { ascending: false }).limit(limit),
    site(supabase.from("expenses").select("amount, status, created_at, sites(name)")).order("created_at", { ascending: false }).limit(limit),
  ]);
  const acts = [];
  const seenGrn = new Set();
  const canPx = await canViewPrices(); if (canPx) await attachPrices("purchase_orders", pos.data);   // update463
  (pos.data || []).forEach(p => acts.push({ icon: "📄", at: p.created_at, site: p.sites?.name, text: `PO ${p.po_no} · ${p.vendor_name}${canPx ? " · ₹" + Number(p.total_amount || 0).toLocaleString("en-IN") : ""}${p.approval_status === "pending" ? " · awaiting approval" : ""}` }));
  (grns.data || []).forEach(g => { if (seenGrn.has(g.grn_no)) return; seenGrn.add(g.grn_no);
    acts.push({ icon: "📦", at: g.created_at, site: g.sites?.name, text: `GRN ${g.grn_no} received · ${g.vendor || ""}` }); });
  (dprs.data || []).forEach(d => acts.push({ icon: "📋", at: d.created_at, site: d.sites?.name, text: `DPR filed for ${d.dpr_date}` }));
  (exps.data || []).forEach(e => acts.push({ icon: "₹", at: e.created_at, site: e.sites?.name, text: `Expense ₹${Number(e.amount || 0).toLocaleString("en-IN")} · ${e.status}` }));
  return acts.sort((a, b) => a.at < b.at ? 1 : -1).slice(0, limit);
}
