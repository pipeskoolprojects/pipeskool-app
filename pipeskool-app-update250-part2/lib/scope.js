"use client";
// update245: THE PROJECT SCOPE — one place, not fifteen.
//
// WHY THIS EXISTS
// Site-scoping inside a project workspace was fixed three times (243 procure, 244 expenses +
// GRN) and broke again each time, because the fix was applied loader by loader and there are
// ~15 loaders that query a site-scoped table. Any loader I did not touch kept returning every
// site, and the project page kept promising "only this project's data".
//
// HOW IT WORKS NOW
// The project workspace publishes the site it is showing. Every site-scoped loader calls
// scoped() on its siteId argument. A loader that is given nothing therefore inherits the
// project's site automatically — no threading a prop through five layers, and no way to
// forget one.
//
// WHY IT CANNOT LEAK INTO THE STANDALONE PAGES
// getScopeSite() returns null unless the browser is actually on a /projects/<id> URL. So
// /expenses, /wages, /stock/grn and friends opened from the sidebar behave exactly as before
// (all sites), even if a stale value is left in sessionStorage by a hard refresh.
//
// EXPLICIT ALWAYS WINS: pass "all" to deliberately widen a query, or a real id to pin it.

const KEY = "psk_project_scope";

export function setScopeSite(siteId) {
  try { window.sessionStorage.setItem(KEY, String(siteId)); } catch {}
}

export function clearScopeSite() {
  try { window.sessionStorage.removeItem(KEY); } catch {}
}

// the active project site, or null when we are not inside a project workspace
export function getScopeSite() {
  if (typeof window === "undefined") return null;
  try {
    // A tab that is still rendered in an iframe has the MODULE's url (/wages, /dpr …), not
    // /projects/<id>, so the pathname test alone would miss it. The workspace stamps
    // &scope=<id> onto every embedded url, and that wins.
    const q = new URLSearchParams(window.location.search);
    const fromUrl = q.get("scope");
    if (fromUrl) return fromUrl;
    if (!window.location.pathname.startsWith("/projects/")) return null;
    const v = window.sessionStorage.getItem(KEY);
    return v ? v : null;
  } catch { return null; }
}

// use in every site-scoped loader: `siteId = scoped(siteId)`
// - caller passed a real id or "all"  -> honour it exactly
// - caller passed nothing             -> inherit the project scope (null outside a project)
export function scoped(siteId) {
  if (siteId !== undefined && siteId !== null && siteId !== "") return siteId;
  return getScopeSite();
}

// true when a query should be narrowed at all
export function isScoped(siteId) {
  const s = scoped(siteId);
  return !!s && s !== "all";
}
