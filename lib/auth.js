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
  ["billing", "BOQ & RA billing"],
  ["letters", "Letters & documents"],   // update329
  ["attendance_override", "Attendance override"],   // update335: manual attendance without a punch
  ["indent_edit", "Indent edit (any raiser)"],   // update337
  ["boq_material", "BOQ materials (kits)"],   // update369: Billing Engineer, IT, Director
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
// update225: digits-only, last-10 matching — "+91 98250 00000", "098250…" and
// "9825000000" are all the same account. Works with lookup fn v2; fallback scans client-side.
const normMobile = m => String(m || "").replace(/\D/g, "").slice(-10);
async function staffLookup(mobile) {
  const { data: rows, error } = await supabase.rpc("fn_staff_login_lookup", { p_mobile: String(mobile || "").trim() });
  if (!error && rows && (Array.isArray(rows) ? rows[0] : rows)) return Array.isArray(rows) ? rows[0] : rows;
  const { data: list } = await supabase.from("app_users")
    .select("id, full_name, mobile, role, site_id, auth_id, auth_email, auth_version, is_active")
    .eq("is_active", true).limit(400);
  const want = normMobile(mobile);
  return want.length === 10 ? (list || []).find(u => normMobile(u.mobile) === want) || null : null;
}

export async function loginByMobile(mobile) {
  if (isDemo) { setSession(demoSession); return { ok: true, session: demoSession }; }
  const u = await staffLookup(mobile);
  if (!u) return { ok: false, error: "This mobile number is not registered in Pipeskool. Check the number, or ask the Director/Admin to add you." };
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
  if (!u) return { ok: false, error: "This mobile number is not registered in Pipeskool. Check the number, or ask the Director/Admin to add you." };
  return { ok: true, mode: u.auth_id ? "password" : "set" };
}

// first login: create the password (creates the Supabase Auth account and links it)
export async function createPasswordAndLogin(mobile, password) {
  if (isDemo) { setSession(demoSession); return { ok: true, session: demoSession }; }
  if (!password || password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  const u = await staffLookup(mobile);
  if (!u) return { ok: false, error: "This mobile number is not registered in Pipeskool. Check the number, or ask the Director/Admin to add you." };
  if (u.auth_id) return { ok: false, error: "A password is already set for this number. Use Sign in." };
  const email = idEmail(u);
  const { data: su, error: se } = await supabase.auth.signUp({ email, password });
  if (se) return { ok: false, error: se.message };
  const uid = su?.user?.id;
  if (!uid) return { ok: false, error: "Could not create the account. In Supabase: Authentication → Providers → Email → turn OFF 'Confirm email', then retry." };
  { // link the fresh account to the staff row — RLS-safe RPC first, direct update as fallback
    const { error: le } = await supabase.rpc("fn_link_staff_auth", { p_mobile: String(mobile).trim(), p_auth: uid, p_email: email });
    if (le) {
      const { error: lke } = await supabase.rpc("fn_link_staff_auth", { p_mobile: mobile, p_email: email });
      if (lke) await supabase.from("app_users").update({ auth_id: uid, auth_email: email }).eq("id", u.id);
    }
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
  if (!u) return { ok: false, error: "This mobile number is not registered in Pipeskool. Check the number, or ask the Director/Admin to add you." };
  if (!u.auth_id) return { ok: false, error: "No password set yet for this number — use 'First time? Create password'." };
  // try: stored account email -> id-based -> legacy mobile-based (auto-heals old accounts)
  const candidates = Array.from(new Set([u.auth_email, idEmail(u), legacyEmail(mobile)].filter(Boolean)));
  let lastErr = null;
  for (const email of candidates) {
    const { error: ie } = await supabase.auth.signInWithPassword({ email, password });
    if (!ie) {
      if (u.auth_email !== email) {
        const { error: se2 } = await supabase.rpc("fn_link_staff_auth", { p_mobile: mobile, p_email: email });
        if (se2) await supabase.from("app_users").update({ auth_email: email }).eq("id", u.id);
      }
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
  // assigned sites — update189: Directors always get the FULL live site master (central
  // source), never a user_sites snapshot; a site added later must appear without any
  // assignment step. Staff keep their assigned list.
  let sites;
  if (u.role === "director") {
    const { data: allS } = await supabase.from("sites").select("id, name").eq("is_active", true).order("id");
    sites = (allS || []).map(r => ({ id: r.id, name: r.name }));
  } else {
    const { data: us } = await supabase.from("user_sites").select("site_id, sites(name)").eq("user_id", u.id);
    sites = (us || []).map(r => ({ id: r.site_id, name: r.sites?.name || ("Site " + r.site_id) }));
    if (sites.length === 0 && u.site_id) sites = [{ id: u.site_id, name: "Site " + u.site_id }];
  }

  // per-site permissions
  const { data: perms } = await supabase.from("permissions")
    .select("site_id, module, action").eq("user_id", u.id).eq("allowed", true);
  const permsBySite = {};
  (perms || []).forEach(p => {
    permsBySite[p.site_id] = permsBySite[p.site_id] || {};
    (permsBySite[p.site_id][p.module] = permsBySite[p.site_id][p.module] || []).push(p.action);
  });

  // update238: admin capabilities (admin_rights) travel in the session too, so the UI can
  // mirror fn_has_admin() — e.g. view_all_money, which grants READ of money records but
  // never the right to approve anything.
  const { data: caps } = await supabase.from("admin_rights")
    .select("capability").eq("user_id", u.id).eq("allowed", true);

  const session = {
    id: u.id, name: u.full_name, mobile: u.mobile || null, role: u.role, requires_punch: u.requires_punch !== false, sites, permsBySite,
    caps: (caps || []).map(c => c.capability),
    currentSite: sites[0]?.id || null,
  };
  setSession(session);
  return { ok: true, session };
}

// ---- LIVE RIGHTS REFRESH (update138) ----
// The session snapshot is built at login; Access Rights changes made later must
// reach every already-logged-in device WITHOUT re-login. Sidebar (web) and
// MobileNav (mobile) call this on mount: re-pulls role, punch flag, sites and
// permissions and rewrites the stored session. Web and mobile therefore always
// show the same rights as the Access grid after a simple refresh.
export async function refreshSessionRights() {
  if (isDemo) return getSession();
  const sess = getSession();
  if (!sess?.id) return sess;
  try {
    // update311: wait for the auth token to be RESTORED from storage before any RLS read —
    // on a fresh page load (worst right after a deploy) this query used to race ahead of
    // token restoration, come back empty, and be misread as "user deactivated" → logout.
    let { data: authData } = await supabase.auth.getSession();
    if (!authData?.session) {
      // update328: a missing auth session is NOT proof of expiry — token refresh can hiccup
      // (network blip, multi-tab rotation race). Retry the refresh ONCE, explicitly; the shared
      // storage also lets this pick up a sibling tab's newer token. Log out only on a
      // DEFINITIVE invalid/expired/revoked answer; anything transient keeps the user in.
      const { data: rf, error: rfErr } = await supabase.auth.refreshSession();
      if (rf?.session) { authData = rf; }
      else {
        const msg = (rfErr?.message || "").toLowerCase();
        if (/invalid|expired|revoked|not.?found|already.?used/.test(msg)) { await logoutAuth(); return null; }  // genuine → real logout
        return sess;   // transient → stay logged in; rights refresh on the next navigation
      }
    }
    const { data: u, error: ue } = await supabase.from("app_users")
      .select("id, full_name, mobile, role, requires_punch, is_active, site_id")
      .eq("id", sess.id).maybeSingle();
    // update311: a FAILED read is not a deactivated user. Network hiccups / aborted fetches
    // during navigation keep the session; rights simply refresh on the next load. Every
    // server action stays definer-gated regardless, so failing open here is safe.
    if (ue) return sess;
    if (!u || u.is_active === false) { await logoutAuth(); return null; }  // definitive answer → session dies
    let sites;   // update189: same central-source rule as login — directors = all live sites
    if (u.role === "director") {
      const { data: allS } = await supabase.from("sites").select("id, name").eq("is_active", true).order("id");
      sites = (allS || []).map(r => ({ id: r.id, name: r.name }));
    } else {
      const { data: us } = await supabase.from("user_sites").select("site_id, sites(name)").eq("user_id", u.id);
      sites = (us || []).map(r => ({ id: r.site_id, name: r.sites?.name || ("Site " + r.site_id) }));
      if (sites.length === 0 && u.site_id) sites = [{ id: u.site_id, name: "Site " + u.site_id }];
    }
    const { data: perms } = await supabase.from("permissions")
      .select("site_id, module, action").eq("user_id", u.id).eq("allowed", true);
    const permsBySite = {};
    (perms || []).forEach(p => {
      permsBySite[p.site_id] = permsBySite[p.site_id] || {};
      (permsBySite[p.site_id][p.module] = permsBySite[p.site_id][p.module] || []).push(p.action);
    });
    const { data: caps } = await supabase.from("admin_rights")
      .select("capability").eq("user_id", u.id).eq("allowed", true);
    const cur = sites.some(s => Number(s.id) === Number(sess.currentSite)) ? sess.currentSite : (sites[0]?.id || null);
    const next = { ...sess, name: u.full_name, mobile: u.mobile || sess.mobile, role: u.role,
      requires_punch: u.requires_punch !== false, sites, permsBySite,
      caps: (caps || []).map(c => c.capability), currentSite: cur };
    setSession(next);
    // update391: tell every mounted view (dashboard, headers) the session/site/rights changed —
    // previously only the caller (nav bar / sidebar) saw the refreshed copy.
    try { window.dispatchEvent(new CustomEvent("psk-session", { detail: next })); } catch {}
    return next;
  } catch { return sess; }   // offline / transient error — keep last known session, never lock the app
}

// ---- SITE SCOPING (update139) ----
// Non-director staff must only ever see their ASSIGNED sites — in every
// dropdown and every cross-site data fetch. Returns null when there is no
// restriction (director, or no staff session), else the array of allowed ids.
export function assignedSiteIds() {
  try {
    const s = getSession();
    if (!s || s.role === "director") return null;
    const ids = (s.sites || []).map(x => Number(x.id)).filter(n => !isNaN(n));
    return ids.length ? ids : (s.currentSite ? [Number(s.currentSite)] : []);
  } catch { return null; }
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
// update238: mirrors fn_has_admin() in the database. Directors always pass.
export function hasAdminCap(session, cap) {
  if (!session) return false;
  if (session.role === "director") return true;
  return (session.caps || []).includes(cap);
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
