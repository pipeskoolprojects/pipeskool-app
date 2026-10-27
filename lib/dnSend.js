"use client";
// update480: browser side of "Send to site" — talks to /api/dn/* with the staff Bearer token.
import { supabase } from "./supabase";
async function bearer() { try { const { data } = await supabase.auth.getSession(); return data?.session?.access_token || null; } catch { return null; } }
async function call(path, { method = "GET", body } = {}) {
  const t = await bearer();
  const r = await fetch(path, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).catch(() => null);
  if (!r) return { ok: false, error: "Network error — check the connection and try again." };
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: j.error || `Request failed (${r.status})`, ...j };
  return j;
}
export const dnLink = challanId => call("/api/dn/link", { method: "POST", body: { challan_id: challanId } });
export const dnRevoke = challanId => call("/api/dn/revoke", { method: "POST", body: { challan_id: challanId } });
export const dnRecord = (challanId, channel, extra = {}) => call("/api/dn/send", { method: "POST", body: { challan_id: challanId, channel, ...extra } });
export const dnHistory = challanId => call("/api/dn/history?challan_id=" + challanId);
export const dnContacts = siteId => call("/api/dn/contacts?site_id=" + (siteId || ""));
/** the server-built PDF as a Blob (staff) */
export async function dnPdfBlob(challanId) {
  const t = await bearer();
  const r = await fetch("/api/dn/pdf?challan_id=" + challanId, { headers: t ? { authorization: `Bearer ${t}` } : {}, cache: "no-store" }).catch(() => null);
  if (!r?.ok) { let e = "The PDF could not be generated."; try { e = (await r.json()).error || e; } catch {} return { ok: false, error: e }; }
  return { ok: true, blob: await r.blob() };
}
