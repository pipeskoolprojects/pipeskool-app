"use client";
import { supabase, isDemo } from "./supabase";

const SESSION_KEY = "psk_session";

export const MODULES = [
  ["dashboard", "Dashboard"],
  ["attendance", "Attendance & muster"],
  ["dpr", "Daily progress (DPR)"],
  ["money", "Money / expenses"],
  ["wages", "Muster roll & wages"],
  ["stock", "Material stock"],
  ["indent", "Indent & purchase"],
  ["assets", "Tools & assets"],
  ["workers", "Worker master"],
  ["access_rights", "Access rights (admin)"],
];
export const ACTIONS = [
  ["view", "View"],
  ["create", "Create / raise"],
  ["approve", "Approve"],
  ["verify", "Verify"],
  ["manage", "Manage / admin"],
];

// ---- demo session (used when DB not connected) ----
const demoSession = {
  id: 1, name: "Keyal Shah (demo)", role: "director", siteIds: [1, 2, 3],
  perms: Object.fromEntries(MODULES.map(m => [m[0], ["view", "create", "approve", "verify", "manage"]])),
};

export function getSession() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
export function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
export function clearSession() { localStorage.removeItem(SESSION_KEY); }

// ---- login by mobile number ----
export async function loginByMobile(mobile) {
  if (isDemo) { setSession(demoSession); return { ok: true, session: demoSession }; }
  const { data: u } = await supabase.from("app_users")
    .select("id, full_name, role, site_id").eq("mobile", mobile.trim()).eq("is_active", true).maybeSingle();
  if (!u) return { ok: false, error: "Mobile number not registered as staff. Ask the Director to add you." };

  // sites this user handles
  let siteIds = [];
  const { data: us } = await supabase.from("user_sites").select("site_id").eq("user_id", u.id);
  siteIds = (us || []).map(r => r.site_id);
  if (u.role === "director" || u.role === "ho_admin") {
    const { data: all } = await supabase.from("sites").select("id").eq("is_active", true);
    siteIds = (all || []).map(r => r.id);
  } else if (siteIds.length === 0 && u.site_id) {
    siteIds = [u.site_id];
  }

  // permissions
  const { data: perms } = await supabase.from("permissions")
    .select("module, action, allowed").eq("user_id", u.id).eq("allowed", true);
  const permMap = {};
  (perms || []).forEach(p => { (permMap[p.module] = permMap[p.module] || []).push(p.action); });

  const session = { id: u.id, name: u.full_name, role: u.role, siteIds, perms: permMap };
  setSession(session);
  return { ok: true, session };
}

// ---- permission helpers ----
export function can(session, module, action) {
  if (!session) return false;
  if (session.role === "director") return true;       // director always allowed
  return !!session.perms?.[module]?.includes(action);
}
export function canSeeModule(session, module) {
  if (!session) return false;
  if (session.role === "director") return true;
  return !!session.perms?.[module]?.length;
}
