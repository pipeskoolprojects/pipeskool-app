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
  ["rentals", "Machines & rooms on rent"],
  ["workers", "Worker master"],
  ["notices", "Notice board"],
  ["leave", "Leave management"],
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

// Pre-auth staff lookup — via RLS-safe RPC, falling back to a direct read
// (fallback keeps login working if the SQL function isn't installed yet).
async function staffLookup(mobile) {
  const { data: rows, error } = await supabase.rpc("fn_staff_login_lookup", { p_mobile: String(mobile || "").trim() });
  if (!error && rows) return Array.isArray(rows) ? (rows[0] || null) : rows;
  const { data: u } = await supabase.from("app_users")
    .select("id, full_name, mobile, role, site_id, auth_id, auth_email, auth_version")
    .eq("mobile", String(mobile || "").trim()).eq("is_active", true).maybeSingle();
  return u || null;
}

export async function loginByMobile(mobile) {
  if (isDemo) { setSession(demoSession); return { ok: true, session: demoSession }; }
  const u = await staffLookup(mobile);
  if (!u) return { ok: false, error: "Mobile number not registered as staff. Ask the Director to add you." };
  return buildSession(u);
}

// ---------- Password login (Phase 2: Supabase Auth) ----------
// Staff identity = synthetic email tied to the PERMANENT staff id (not the mobile,
// which can be edited), so the DATABASE knows who is logged in (auth.uid()).
const idEmail = u => (u.auth_version || 1) > 1 ? `staff-${u.id}-v${u.auth_version}@staff.pipeskool.app` : `staff-${u.id}@staff.pipeskool.app`;
const legacyEmail = mobile => `${String(mobile).trim()}@staff.pipeskool.app`;

// what state is this mobile in? -> { ok, mode: 'set' | 'password' } | { ok:false }
export async function checkLoginState(mobile) {
  if (isDemo) return { ok: true, mode: "password" };
  const u = await staffLookup(mobile);   // RLS-safe RPC (update112) — the web login's Next button now survives the lock
  if (!u) return { ok: false, error: "Mobile number not registered as staff. Ask the Director to add you." };
  return { ok: true, mode: u.auth_id ? "password" : "set" };
}

// first login: create the password (creates the Supabase Auth account and links it)
export async function createPasswordAndLogin(mobile, password) {
  if (isDemo) { setSession(demoSession); return { ok: true, session: demoSession }; }
  if (!password || password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  const u = await staffLookup(mobile);
  if (!u) return { ok: false, error: "Mobile number not registered as staff." };
  if (u.auth_id) return { ok: false, error: "A password is already set for this number. Use Sign in." };
  const email = idEmail(u);
  const { data: su, error: se } = await supabase.auth.signUp({ email, password });
  if (se) return { ok: false, error: se.message };
  const uid = su?.user?.id;
  if (!uid) return { ok: false, error: "Could not create the account. In Supabase: Authentication → Providers → Email → turn OFF 'Confirm email', then retry." };
  { // link the fresh account to the staff row — RLS-safe RPC first, direct update as fallback
    const { error: le } = await supabase.rpc("fn_link_staff_auth", { p_mobile: String(mobile).trim(), p_auth: uid, p_email: email });
    if (le) await supabase.from("app_users").update({ auth_id: uid, auth_email: email }).eq("id", u.id);
  }
  if (!su.session) {
    const { error: ie } = await supabase.auth.signInWithPassword({ email, password });
    if (ie) return { ok: false, error: "Password created but sign-in failed: " + ie.message };
  }
  return buildSession(u);
}

export async function loginByMobilePassword(mobile, password) {
  if (isDemo) { setSession(demoSession); return { ok: true, session: demoSession }; }
  const u = await staffLookup(mobile);
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
    id: u.id, name: u.full_name, mobile: u.mobile || null, role: u.role, requires_punch: u.requires_punch !== false, sites, permsBySite,
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
// has a specific right on ANY assigned site (for company-wide master data)
export function canAnySite(session, module, action) {
  if (!session) return false;
  if (session.role === "director") return true;
  return Object.values(session.permsBySite || {}).some(mp => mp?.[module]?.includes(action));
}

// heal older sessions that were created before `mobile` was stored in them
export async function refreshSessionMobile(sess) {
  if (isDemo || !sess?.id) return null;
  const { data } = await supabase.from("app_users").select("mobile").eq("id", sess.id).maybeSingle();
  if (data?.mobile) { setSession({ ...sess, mobile: data.mobile }); return data.mobile; }
  return null;
}
