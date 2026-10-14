"use client";
// update460: ONE place for every file the ERP stores — Cloudflare R2, private, authorised on the server.
//
// fileStore.from(bucket) is a drop-in for supabase.storage.from(bucket) with the same call shapes
// ({ data, error }), so every module keeps its own logic and the SAME path it always stored:
//   .upload(path, file, opts)        → asks /api/files/upload for a 5-minute presigned URL, PUTs the file straight to R2
//   .getPublicUrl(path, opts)        → /api/files/v/<path> (same-origin; the server checks the login cookie and the
//                                      folder rules, then redirects to a 5-minute R2 link) — synchronous, like before
//   .createSignedUrl(path, ttl, opts)→ same URL (the server signs per view)
//   .remove(paths)                   → NO-OP on purpose: nothing is deleted from storage by the app during the
//                                      migration window (an orphaned file costs less than a lost one)
//   .download(path)                  → fetch through the same authorised URL
// Files are keyed by their existing path in ONE R2 bucket (pipeskool-files) — verified 14 Oct: no path exists in
// both Supabase buckets. If the server says the R2 backend is off (FILE_BACKEND=supabase, or R2 not configured),
// uploads go to Supabase exactly as before — that is the rollback switch.
import { supabase } from "./supabase";

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

export function viewUrl(path, opts = {}) {
  if (!path) return null;
  const q = [];
  if (opts.download) { q.push("download=1"); if (typeof opts.download === "string") q.push("name=" + encodeURIComponent(opts.download)); }
  // update461: query-string form (/api/files/v?k=…) — no "[...key]" route folder needed on the server
  const k = String(path).replace(/^\/+/, "");
  return `${origin()}/api/files/v?k=${encodeURIComponent(k)}${q.length ? "&" + q.join("&") : ""}`;
}

// any stored value → a link that works after the migration:
//   "bills/1.jpg" (path) · "https://<ref>.supabase.co/storage/v1/object/public/attendance-photos/aadhaar/x.jpg" (legacy
//   full URL written by older code) · "https://pipeskool-app.vercel.app/api/files/v/…" (new) · any other http link as-is
const LEGACY = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/([^?#]+)/;
export function fileHref(value, opts = {}) {
  if (!value) return null;
  const v = String(value);
  const m = LEGACY.exec(v);
  if (m) return viewUrl(decodeURIComponent(m[1]), opts);
  // update461: path-style links made by 460 (/api/files/v/<path>, /api/files/s/<path>?sig=…) → query-string form
  const pv = /\/api\/files\/v\/([^?#]+)/.exec(v);
  if (pv) return viewUrl(decodeURIComponent(pv[1]), opts);
  const ps = /\/api\/files\/s\/([^?#]+)\?sig=([A-Za-z0-9_-]+)/.exec(v);
  if (ps) return `${origin()}/api/files/s?k=${encodeURIComponent(decodeURIComponent(ps[1]))}&sig=${ps[2]}`;
  if (/^https?:\/\//i.test(v) || v.startsWith("/api/files/")) return v;
  return viewUrl(v, opts);
}
export const isLegacyStorageUrl = v => LEGACY.test(String(v || ""));

async function bearer() {
  try { const { data } = await supabase.auth.getSession(); return data?.session?.access_token || null; } catch { return null; }
}

// the HttpOnly cookie that lets <img>, <a> and <iframe> open files — refreshed at most every 3 days per tab
let sessionPromise = null;
export function ensureFileSession(force = false) {
  if (typeof window === "undefined") return Promise.resolve(false);
  try {
    const at = Number(localStorage.getItem("psk_files_at") || 0);
    if (!force && Date.now() - at < 3 * 24 * 3600 * 1000) return Promise.resolve(true);
  } catch {}
  if (sessionPromise && !force) return sessionPromise;
  sessionPromise = (async () => {
    const t = await bearer(); if (!t) return false;
    const r = await fetch("/api/files/session", { method: "POST", headers: { authorization: `Bearer ${t}` } }).catch(() => null);
    if (r?.ok) { try { localStorage.setItem("psk_files_at", String(Date.now())); } catch {} return true; }
    return false;
  })().finally(() => setTimeout(() => { sessionPromise = null; }, 5000));
  return sessionPromise;
}
export async function endFileSession() {
  try { localStorage.removeItem("psk_files_at"); } catch {}
  try { await fetch("/api/files/session", { method: "DELETE" }); } catch {}
}

class Bucket {
  constructor(bucket) { this.bucket = bucket; }
  async upload(path, file, opts = {}) {
    try {
      const t = await bearer();
      const r = await fetch("/api/files/upload", { method: "POST", headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ key: path, bucket: this.bucket, contentType: opts.contentType || file?.type || "" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { data: null, error: { message: j.error || `Upload refused (${r.status})` } };
      if (j.backend === "supabase") return supabase.storage.from(this.bucket).upload(path, file, opts);   // rollback mode
      const put = await fetch(j.url, { method: "PUT", body: file, headers: { "content-type": opts.contentType || file?.type || "application/octet-stream" } });
      if (!put.ok) return { data: null, error: { message: `Upload to file storage failed (${put.status})` } };
      if (t) ensureFileSession();   // so the fresh file can be previewed straight away
      return { data: { path, id: path, fullPath: path }, error: null };
    } catch (e) { return { data: null, error: { message: e?.message || "Upload failed" } }; }
  }
  getPublicUrl(path, opts = {}) { return { data: { publicUrl: viewUrl(path, opts) } }; }
  async createSignedUrl(path, _ttl, opts = {}) { await ensureFileSession(); return { data: { signedUrl: viewUrl(path, opts), signedURL: viewUrl(path, opts) }, error: null }; }
  async remove() { return { data: [], error: null }; }
  async download(path) {
    await ensureFileSession();
    const r = await fetch(viewUrl(path), { credentials: "same-origin" }).catch(() => null);
    if (!r?.ok) return { data: null, error: { message: `Download failed (${r?.status || "network"})` } };
    return { data: await r.blob(), error: null };
  }
}
export const fileStore = { from: bucket => new Bucket(bucket) };

// a link anyone can open WITHOUT logging in, for one Delivery Challan PDF (sent on WhatsApp). Unguessable,
// valid for that file only. Staff session required to create it.
export async function shareLink(path) {
  const t = await bearer();
  const r = await fetch("/api/files/share", { method: "POST", headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ key: path }) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  return r?.ok && j.url ? j.url : null;
}
