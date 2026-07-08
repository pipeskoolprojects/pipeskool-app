"use client";
import { supabase, isDemo } from "./supabase";

const SESSION_KEY = "psk_session";

export const MODULES = [
  ["attendance", "Attendance & muster"],
  ["dpr", "Daily progress (DPR)"],
  ["money", "Money / expenses"],
  ["wages", "Muster roll & wages"],
  ["stock", "Material stock"],
  ["indent", "Indent & purchase"],
  ["assets", "Tools & assets"],
  ["workers", "Worker master"],
];
export const ACTIONS = [
  ["view", "View"],
  ["create", "Create / raise"],
  ["approve", "Approve"],
  ["verify", "Verify"],
  ["manage", "Manage / admin"],
];

const demoPerms = Object.fromEntries(MODULES.map(m => [m[0], ["view", "create", "approve", "verify", "manage"]]));
const demoSession = {
  id: 1, name: "Keyal Shah (demo)", role: "director",
  sites: [{ id: 1, name: "KEI Industries, Sanand" }, { id: 2, name: "SOUL Campus, GIFT City" }, { id: 3, name: "The Creek" }],
  permsBySite: { 1: demoPerms, 2: demoPerms, 3: demoPerms },
  currentSite: 1,
};

export function getSession() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
export function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
export function clearSession() { localStorage.removeItem(SESSION_KEY); }
export function setCurrentSite(siteId) {
  const s = getSession(); if (!s) return;
  s.currentSite = Number(siteId); setSession(s);
}

export async function loginByMobile(mobile) {
  if (isDemo) { setSession(demoSession); return { ok: true, session: demoSession }; }
  const { data: u } = await supabase.from("app_users")
    .select("id, full_name, role, site_id").eq("mobile", mobile.trim()).eq("is_active", true).maybeSingle();
  if (!u) return { ok: false, error: "Mobile number not registered as staff. Ask the Director to add you." };
  return buildSession(u);
}

// ---------- Password login (Phase 2: Supabase Auth) ----------
// Staff identity = synthetic email tied to the PERMANENT staff id (not the mobile,
// which can be edited), so the DATABASE knows who is logged in (auth.uid()).
const idEmail = u => `staff-${u.id}@staff.pipeskool.app`;
const legacyEmail = mobile => `${String(mobile).trim()}@staff.pipeskool.app`;

// what state is this mobile in? -> { ok, mode: 'set' | 'password' } | { ok:false }
export async function checkLoginState(mobile) {
  if (isDemo) return { ok: true, mode: "password" };
  const { data: u } = await supabase.from("app_users")
    .select("id, auth_id").eq("mobile", mobile.trim()).eq("is_active", true).maybeSingle();
  if (!u) return { ok: false, error: "Mobile number not registered as staff. Ask the Director to add you." };
  return { ok: true, mode: u.auth_id ? "password" : "set" };
}

// first login: create the password (creates the Supabase Auth account and links it)
export async function createPasswordAndLogin(mobile, password) {
  if (isDemo) { setSession(demoSession); return { ok: true, session: demoSession }; }
  if (!password || password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  const { data: u } = await supabase.from("app_users")
    .select("id, full_name, role, site_id, auth_id, auth_email").eq("mobile", mobile.trim()).eq("is_active", true).maybeSingle();
  if (!u) return { ok: false, error: "Mobile number not registered as staff." };
  if (u.auth_id) return { ok: false, error: "A password is already set for this number. Use Sign in." };
  const email = idEmail(u);
  const { data: su, error: se } = await supabase.auth.signUp({ email, password });
  if (se) return { ok: false, error: se.message };
  const uid = su?.user?.id;
  if (!uid) return { ok: false, error: "Could not create the account. In Supabase: Authentication → Providers → Email → turn OFF 'Confirm email', then retry." };
  await supabase.from("app_users").update({ auth_id: uid, auth_email: email }).eq("id", u.id);
  if (!su.session) {
    const { error: ie } = await supabase.auth.signInWithPassword({ email, password });
    if (ie) return { ok: false, error: "Password created but sign-in failed: " + ie.message };
  }
  return buildSession(u);
}

export async function loginByMobilePassword(mobile, password) {
  if (isDemo) { setSession(demoSession); return { ok: true, session: demoSession }; }
  const { data: u } = await supabase.from("app_users")
    .select("id, full_name, role, site_id, auth_id, auth_email").eq("mobile", mobile.trim()).eq("is_active", true).maybeSingle();
  if (!u) return { ok: false, error: "Mobile number not registered as staff." };
  if (!u.auth_id) return { ok: false, error: "No password set yet for this number — use 'First time? Create password'." };
  // try: stored account email -> id-based -> legacy mobile-based (auto-heals old accounts)
  const candidates = Array.from(new Set([u.auth_email, idEmail(u), legacyEmail(mobile)].filter(Boolean)));
  let lastErr = null;
  for (const email of candidates) {
    const { error: ie } = await supabase.auth.signInWithPassword({ email, password });
    if (!ie) {
      if (u.auth_email !== email) await supabase.from("app_users").update({ auth_email: email }).eq("id", u.id);
      return buildSession(u);
    }
    lastErr = ie;
  }
  return { ok: false, error: lastErr?.message === "Invalid login credentials" ? "Wrong password. Try again." : (lastErr?.message || "Sign-in failed.") };
}

export async function logoutAuth() {
  clearSession();
  if (!isDemo) { try { await supabase.auth.signOut(); } catch {} }
}

async function buildSession(u) {
  // assigned sites
  const { data: us } = await supabase.from("user_sites").select("site_id, sites(name)").eq("user_id", u.id);
  let sites = (us || []).map(r => ({ id: r.site_id, name: r.sites?.name || ("Site " + r.site_id) }));
  if (sites.length === 0 && u.site_id) sites = [{ id: u.site_id, name: "Site " + u.site_id }];

  // per-site permissions
  const { data: perms } = await supabase.from("permissions")
    .select("site_id, module, action").eq("user_id", u.id).eq("allowed", true);
  const permsBySite = {};
  (perms || []).forEach(p => {
    permsBySite[p.site_id] = permsBySite[p.site_id] || {};
    (permsBySite[p.site_id][p.module] = permsBySite[p.site_id][p.module] || []).push(p.action);
  });

  const session = {
    id: u.id, name: u.full_name, role: u.role, sites, permsBySite,
    currentSite: sites[0]?.id || null,
  };
  setSession(session);
  return { ok: true, session };
}

// permission for a SPECIFIC site (defaults to currentSite)
export function can(session, module, action, siteId) {
  if (!session) return false;
  if (session.role === "director") return true;
  const sid = siteId || session.currentSite;
  return !!session.permsBySite?.[sid]?.[module]?.includes(action);
}
// can see module on the current site
export function canSeeModule(session, module, siteId) {
  if (!session) return false;
  if (session.role === "director") return true;
  const sid = siteId || session.currentSite;
  return !!session.permsBySite?.[sid]?.[module]?.length;
}
// can see module on ANY assigned site (for sidebar visibility)
export function canSeeModuleAnySite(session, module) {
  if (!session) return false;
  if (session.role === "director") return true;
  return Object.values(session.permsBySite || {}).some(mp => mp?.[module]?.length);
}
