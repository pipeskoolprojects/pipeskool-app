"use client";
// update480: browser side of "Send to site" — talks to /api/dn/* with the staff Bearer token.
// update482: every call has a 10 s timeout and returns { ok, status, code, error, detail } so the panel can show the
// real reason (and IT can copy it); the PDF falls back to building it in the browser when the server cannot.
import { supabase } from "./supabase";
export const DN_TIMEOUT_MS = 10_000;
async function bearer() { try { const { data } = await supabase.auth.getSession(); return data?.session?.access_token || null; } catch { return null; } }
async function req(path, { method = "GET", body, raw = false } = {}) {
  const t = await bearer();
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), DN_TIMEOUT_MS);
  let r;
  try { r = await fetch(path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: ctl.signal }); }
  catch (e) { clearTimeout(timer); const to = e?.name === "AbortError"; return { ok: false, status: 0, code: to ? "DN_TIMEOUT" : "DN_NETWORK", error: to ? "The server did not answer in 10 seconds." : "Network error — check the connection.", detail: `${method} ${path} · ${e?.message || e}` }; }
  clearTimeout(timer);
  if (raw && r.ok) return { ok: true, status: r.status, res: r };
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, code: j.code || "DN_HTTP_" + r.status, error: j.error || `Request failed (${r.status})`, detail: `${method} ${path} → ${r.status} ${j.code || ""} ${j.detail || ""}`.trim(), ...j, ok: false };
  return { status: r.status, ...j };
}
export const dnLink = challanId => req("/api/dn/link", { method: "POST", body: { challan_id: challanId } });
export const dnRevoke = challanId => req("/api/dn/revoke", { method: "POST", body: { challan_id: challanId } });
export const dnRecord = (challanId, channel, extra = {}) => req("/api/dn/send", { method: "POST", body: { challan_id: challanId, channel, ...extra } });
export const dnHistory = challanId => req("/api/dn/history?challan_id=" + challanId);
export const dnContacts = siteId => req("/api/dn/contacts?site_id=" + (siteId || ""));
/** the PDF as a Blob: server first; if the server fails, the same document is built in the browser */
export async function dnPdfBlob(challanId, note) {
  const r = await req("/api/dn/pdf?challan_id=" + challanId, { raw: true });
  if (r.ok) return { ok: true, blob: await r.res.blob(), source: "server" };
  if (note) { try { const { buildDnPdf } = await import("./dnPdf"); const { bytes } = await buildDnPdf(note); return { ok: true, blob: new Blob([bytes], { type: "application/pdf" }), source: "browser", serverError: r }; } catch (e) { return { ok: false, code: "DN_PDF_FAILED", error: "The PDF could not be generated.", detail: String(e?.message || e) }; } }
  return r;
}
/** a readable one-liner for the panel: "Could not create the link (403 – no permission) [DN_NO_RIGHT]" */
const WHY = { 401: "login expired", 403: "no permission", 404: "not found", 409: "conflict", 422: "invalid data", 429: "too many requests", 500: "server error", 502: "email service", 503: "database unreachable", 0: "no answer" };
export const errLine = (what, r) => `Could not ${what} (${r.status || "—"} – ${WHY[r.status] || "error"}): ${r.error || ""}`.trim();
