"use client";
import { supabase, isDemo } from "./supabase";
import { MODULES, ACTIONS } from "./auth";

let demoStaff = [
  { id: 1, full_name: "Keyal Shah", mobile: "9000000001", role: "director" },
  { id: 2, full_name: "Accountant", mobile: "9000000002", role: "ho_admin" },
  { id: 3, full_name: "S. Desai", mobile: "9000000003", role: "supervisor" },
];
let demoUserSites = { 3: [1] };
let demoPerms = {}; // {userId: {siteId: {module:[actions]}}}

const SITES = [{ id: 1, name: "KEI Industries, Sanand" }, { id: 2, name: "SOUL Campus, GIFT City" }, { id: 3, name: "The Creek" }];
export const ALL_SITES = SITES;

// ---- admin capabilities (update154): company-wide micro-permissions ----
export const ADMIN_CAPS = [
  { code: "manage_categories", label: "Manage worker categories",
    desc: "Add / rename worker categories from the Workers master (web + mobile)." },
  { code: "delete_indent", label: "Delete indents",
    desc: "Delete wrong or duplicate indents. Director, IT and Accountant always have this; the tick extends it to others." },
];

export async function getAdminRights(userId) {
  if (isDemo) return [];
  const { data } = await supabase.from("admin_rights")
    .select("capability, allowed").eq("user_id", userId);
  return (data || []).filter(r => r.allowed).map(r => r.capability);
}

export async function setAdminRight(userId, capability, allowed, grantedBy) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  if (allowed) {
    const { error } = await supabase.from("admin_rights")
      .upsert({ user_id: userId, capability, allowed: true, granted_by: grantedBy || null });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await supabase.from("admin_rights")
    .delete().eq("user_id", userId).eq("capability", capability);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---- notification routing (update157): who receives which request kinds ----
export async function getNotifyRoutes(userId) {
  if (isDemo) return [];
  const { data } = await supabase.from("notification_routes")
    .select("request_kind, allowed").eq("user_id", userId);
  return (data || []).filter(r => r.allowed).map(r => r.request_kind);
}

export async function setNotifyRoute(userId, kind, allowed) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  if (allowed) {
    const { error } = await supabase.from("notification_routes")
      .upsert({ request_kind: kind, user_id: userId, allowed: true });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await supabase.from("notification_routes")
    .delete().eq("user_id", userId).eq("request_kind", kind);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getStaff() {
  if (isDemo) return demoStaff;
  const { data } = await supabase.from("app_users")
    .select("id, full_name, mobile, role, monthly_salary, ot_eligible, annual_paid_leaves, joining_date, requires_punch, bank_account_no, bank_ifsc, pan_no").eq("is_active", true).order("full_name");
  return data || [];
}

export async function getUserSites(userId) {
  if (isDemo) return (demoUserSites[userId] || []).map(id => SITES.find(s => s.id === id));
  const { data } = await supabase.from("user_sites").select("site_id, sites(name)").eq("user_id", userId);
  return (data || []).map(r => ({ id: r.site_id, name: r.sites?.name || ("Site " + r.site_id) }));
}

export async function getSitePermissions(userId, siteId) {
  if (isDemo) return (demoPerms[userId]?.[siteId]) || {};
  const { data } = await supabase.from("permissions")
    .select("module, action").eq("user_id", userId).eq("site_id", siteId).eq("allowed", true);
  const map = {};
  (data || []).forEach(p => { (map[p.module] = map[p.module] || []).push(p.action); });
  return map;
}

export async function setSitePermission(userId, siteId, module, action, allowed) {
  if (isDemo) {
    demoPerms[userId] = demoPerms[userId] || {};
    demoPerms[userId][siteId] = demoPerms[userId][siteId] || {};
    const arr = new Set(demoPerms[userId][siteId][module] || []);
    if (allowed) arr.add(action); else arr.delete(action);
    demoPerms[userId][siteId][module] = [...arr];
    return { ok: true };
  }
  const { error } = await supabase.from("permissions")
    .upsert({ user_id: userId, site_id: siteId, module, action, allowed }, { onConflict: "user_id,site_id,module,action" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// assign a site to a user and seed default rights for their role on that site
export async function assignSite(userId, siteId, role) {
  if (isDemo) {
    demoUserSites[userId] = Array.from(new Set([...(demoUserSites[userId] || []), Number(siteId)]));
    return { ok: true };
  }
  await supabase.from("user_sites").upsert({ user_id: userId, site_id: siteId }, { onConflict: "user_id,site_id" });
  await supabase.rpc("fn_seed_site_permissions", { p_user_id: userId, p_role: role, p_site_id: siteId });
  return { ok: true };
}

export async function removeSite(userId, siteId) {
  if (isDemo) { demoUserSites[userId] = (demoUserSites[userId] || []).filter(s => s !== Number(siteId)); return { ok: true }; }
  await supabase.from("permissions").delete().eq("user_id", userId).eq("site_id", siteId);
  await supabase.from("user_sites").delete().eq("user_id", userId).eq("site_id", siteId);
  return { ok: true };
}

export async function resetSiteToRole(userId, siteId, role) {
  if (isDemo) { if (demoPerms[userId]) demoPerms[userId][siteId] = {}; return { ok: true }; }
  await supabase.rpc("fn_seed_site_permissions", { p_user_id: userId, p_role: role, p_site_id: siteId });
  return { ok: true };
}

// copy all ticks from one site to another for the same user
export async function copySitePermissions(userId, fromSite, toSite) {
  const src = await getSitePermissions(userId, fromSite);
  for (const m of Object.keys(src)) {
    for (const a of src[m]) await setSitePermission(userId, toSite, m, a, true);
  }
  return { ok: true };
}

export async function addStaff(p) {
  if (isDemo) { demoStaff = [...demoStaff, { id: Date.now(), full_name: p.full_name, mobile: p.mobile, role: p.role }];
    if (p.site_id) demoUserSites[Date.now()] = [Number(p.site_id)]; return { ok: true }; }
  const { data, error } = await supabase.from("app_users")
    .insert({ full_name: p.full_name, mobile: p.mobile, role: p.role, site_id: p.site_id || null }).select().single();
  if (error) return { ok: false, error: error.message };
  if (p.site_id) await assignSite(data.id, p.site_id, p.role);
  return { ok: true };
}

export { MODULES, ACTIONS };

// edit staff (name, mobile, role, active) — director only in UI
export async function updateStaff(id, p) {
  if (isDemo) return { ok: true };
  const row = { full_name: p.full_name, mobile: String(p.mobile || "").trim(), role: p.role, is_active: p.is_active !== false,
    monthly_salary: Number(p.monthly_salary) || 0, ot_eligible: !!p.ot_eligible, annual_paid_leaves: Number(p.annual_paid_leaves) || 0, joining_date: p.joining_date || null, requires_punch: p.requires_punch !== false,
    bank_account_no: String(p.bank_account_no || "").trim() || null,
    bank_ifsc: String(p.bank_ifsc || "").trim().toUpperCase() || null,
    pan_no: String(p.pan_no || "").trim().toUpperCase() || null };
  if (!row.full_name || !row.mobile) return { ok: false, error: "Name and mobile are mandatory." };
  const { error } = await supabase.from("app_users").update(row).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- Role master ----------
export async function getRoles() {
  if (isDemo) return [
    { code: "director", label: "Director" }, { code: "ho_admin", label: "Accountant / HO Admin" },
    { code: "site_engineer", label: "Site Engineer" }, { code: "supervisor", label: "Site Incharge / Supervisor" },
    { code: "storekeeper", label: "Storekeeper" }];
  const { data } = await supabase.from("staff_roles").select("code, label").eq("is_active", true).order("sort_order");
  return data || [];
}

export async function renameRole(code, newLabel) {
  if (isDemo) return { ok: true };
  const clean = String(newLabel || "").trim();
  if (!clean) return { ok: false, error: "Enter a role name." };
  const { error } = await supabase.from("staff_roles").update({ label: clean }).eq("code", code);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteRole(code) {
  if (isDemo) return { ok: true };
  if (code === "director") return { ok: false, error: "The Director role cannot be deleted." };
  const { count } = await supabase.from("app_users").select("id", { count: "exact", head: true }).eq("role", code);
  if (count > 0) return { ok: false, error: `${count} staff member(s) still have this role — reassign them first.` };
  const { error } = await supabase.from("staff_roles").delete().eq("code", code);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addRole(label) {
  if (isDemo) return { ok: true };
  const clean = String(label || "").trim();
  if (!clean) return { ok: false, error: "Enter a role name." };
  const code = clean.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!code) return { ok: false, error: "Enter a valid role name." };
  const { error } = await supabase.from("staff_roles").insert({ code, label: clean, sort_order: 100 });
  if (error) return { ok: false, error: error.message.includes("duplicate") ? "A role with this name already exists." : error.message };
  return { ok: true, code };
}


// Director: force-reset a staff member's password. Their old sign-in becomes
// useless for staff access; on next login they create a fresh password.
export async function resetStaffPassword(id) {
  if (isDemo) return { ok: true };
  const { data: u } = await supabase.from("app_users").select("auth_version").eq("id", id).maybeSingle();
  if (!u) return { ok: false, error: "Staff member not found." };
  const { error } = await supabase.from("app_users").update({
    auth_id: null, auth_email: null, auth_version: (u.auth_version || 1) + 1 }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
