"use client";
import { supabase, isDemo } from "./supabase";
import { MODULES, ACTIONS } from "./auth";

let demoStaff = [
  { id: 1, full_name: "Keyal Shah", mobile: "9000000001", role: "director", site_id: null },
  { id: 2, full_name: "Accountant", mobile: "9000000002", role: "ho_admin", site_id: null },
  { id: 3, full_name: "S. Desai", mobile: "9000000003", role: "supervisor", site_id: 1 },
];
let demoPerms = {}; // {userId: {module: [actions]}}

export async function getStaff() {
  if (isDemo) return demoStaff;
  const { data } = await supabase.from("app_users")
    .select("id, full_name, mobile, role, site_id, sites(name)").eq("is_active", true).order("full_name");
  return (data || []).map(u => ({ id: u.id, full_name: u.full_name, mobile: u.mobile,
    role: u.role, site_id: u.site_id, site_name: u.sites?.name }));
}

export async function getUserPermissions(userId) {
  if (isDemo) return demoPerms[userId] || {};
  const { data } = await supabase.from("permissions")
    .select("module, action, allowed").eq("user_id", userId).eq("allowed", true);
  const map = {};
  (data || []).forEach(p => { (map[p.module] = map[p.module] || []).push(p.action); });
  return map;
}

export async function setPermission(userId, module, action, allowed) {
  if (isDemo) {
    demoPerms[userId] = demoPerms[userId] || {};
    const arr = new Set(demoPerms[userId][module] || []);
    if (allowed) arr.add(action); else arr.delete(action);
    demoPerms[userId][module] = [...arr];
    return { ok: true };
  }
  const { error } = await supabase.from("permissions")
    .upsert({ user_id: userId, module, action, allowed }, { onConflict: "user_id,module,action" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function applyRoleDefaults(userId, role) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.rpc("fn_seed_permissions", { p_user_id: userId, p_role: role });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addStaff(p) {
  if (isDemo) {
    demoStaff = [...demoStaff, { id: Date.now(), ...p }];
    return { ok: true };
  }
  const { data, error } = await supabase.from("app_users")
    .insert({ full_name: p.full_name, mobile: p.mobile, role: p.role, site_id: p.site_id || null })
    .select().single();
  if (error) return { ok: false, error: error.message };
  // link site + seed default permissions
  if (p.site_id) await supabase.from("user_sites").upsert({ user_id: data.id, site_id: p.site_id }, { onConflict: "user_id,site_id" });
  await supabase.rpc("fn_seed_permissions", { p_user_id: data.id, p_role: p.role });
  return { ok: true };
}

export { MODULES, ACTIONS };
