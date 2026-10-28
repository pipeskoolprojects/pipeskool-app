// update480: server side of "Send to site" — secure links, sends history, the public note, the PDF, audit.
// Service-role access to Supabase (never exposed to the browser); every staff action is checked against the
// challan.send capability (Directors always pass). Relative imports with extensions so node tests can load this file.
import { createHash, randomBytes } from "node:crypto";
import { noteFromChallan, DN_LINK_DAYS, maskMobile, maskEmail, isMobile, isEmail, dnMessage, dnSubject, safeFileName } from "../dnModel.js";
import { buildDnPdf } from "../dnPdf.js";

const SB = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const H = () => ({ apikey: SERVICE(), authorization: `Bearer ${SERVICE()}`, "content-type": "application/json" });
export const RATE_LIMIT = { perMinute: 60 };
export const CAP = "challan.send";

// update482: every database failure carries the HTTP status and PostgREST code, so the route can say WHAT failed
async function dbFail(r, what) {
  let body = {}; try { body = await r.json(); } catch {}
  const e = new Error(`${what} failed (${r.status}${body.code ? " " + body.code : ""}): ${String(body.message || "").slice(0, 160)}`);
  e.status = r.status; e.pgCode = body.code || ""; e.pgMessage = String(body.message || ""); return e;
}
export async function sbGet(path) { const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: H(), cache: "no-store" }); if (!r.ok) throw await dbFail(r, "db read " + path.split("?")[0]); return r.json(); }
export async function sbPost(table, body) { const r = await fetch(`${SB()}/rest/v1/${table}`, { method: "POST", headers: { ...H(), prefer: "return=representation" }, body: JSON.stringify(body) }); if (!r.ok) throw await dbFail(r, "db write " + table); const j = await r.json(); return Array.isArray(j) ? j[0] : j; }
export async function sbPatch(table, filter, body) { const r = await fetch(`${SB()}/rest/v1/${table}?${filter}`, { method: "PATCH", headers: { ...H(), prefer: "return=representation" }, body: JSON.stringify(body) }); if (!r.ok) throw await dbFail(r, "db update " + table); return r.json(); }

/** update482: a thrown error → { status, code, error } the panel can show to IT (full detail goes to the server log) */
export function classify(e, stage = "link") {
  const m = String(e?.message || e || ""), pg = e?.pgCode || "";
  if (!SERVICE()) return { status: 500, code: "DN_ENV_SERVICE_KEY", error: "Server setting missing: SUPABASE_SERVICE_ROLE_KEY is not set on Vercel." };
  if (pg === "PGRST205" || pg === "42P01" || /does not exist|Could not find the table|schema cache/i.test(e?.pgMessage || m)) return { status: 500, code: "DN_TABLE_MISSING", error: "The delivery-note tables are missing — run pipeskool_delivery_note_send.sql (update 480) in Supabase." };
  if (pg === "PGRST204" || pg === "42703") return { status: 500, code: "DN_COLUMN_MISSING", error: "A delivery-note column is missing — re-run pipeskool_delivery_note_send.sql (update 482)." };
  if (e?.status === 401 || e?.status === 403 || pg === "42501") return { status: 500, code: "DN_DB_DENIED", error: "The server's database key was refused — check SUPABASE_SERVICE_ROLE_KEY on Vercel." };
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(m)) return { status: 503, code: "DN_DB_UNREACHABLE", error: "The database could not be reached from the server — try again." };
  if (stage === "pdf") return { status: 500, code: "DN_PDF_FAILED", error: "The PDF could not be generated." };
  return { status: 500, code: "DN_" + stage.toUpperCase() + "_FAILED", error: "Could not " + ({ link: "create the link", send: "record the send", history: "load the history", revoke: "disable the link" }[stage] || stage) + "." };
}
export function failResponse(e, stage) {
  const c = classify(e, stage);
  console.error("DN_" + stage.toUpperCase() + "_FAILED", c.code, String(e?.message || e).slice(0, 300));
  return Response.json({ ok: false, code: c.code, error: c.error, detail: String(e?.message || e).slice(0, 300), stage, at: new Date().toISOString() }, { status: c.status });
}

// ---- identity + right ----
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export async function staffFromReq(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: ANON(), authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) return null;
  const u = await r.json(); if (!u?.id) return null;
  const rows = await sbGet(`app_users?select=id,full_name,role,is_active&auth_id=eq.${encodeURIComponent(u.id)}&limit=1`);
  const s = rows?.[0]; return s && s.is_active !== false ? s : null;
}
export async function canSend(staff) {
  if (!staff) return false;
  if (staff.role === "director") return true;
  const rows = await sbGet(`admin_rights?select=allowed&user_id=eq.${staff.id}&capability=eq.${CAP}&allowed=eq.true&limit=1`);
  return (rows || []).length > 0;
}
export const forbid = (msg = "You do not have the \"Send delivery note to site\" right. A Director can grant it under Access Rights → Delivery Challans.") => Response.json({ ok: false, code: "DN_NO_RIGHT", error: msg }, { status: 403 });

// ---- the note (sanitised: the vendor never leaves the database) ----
export async function loadChallan(id) {
  const rows = await sbGet(`delivery_challans?select=id,dc_ref,dc_date,status,site_id,po_id,client_id,created_at,sites(name,client_name),purchase_orders(po_no),clients(*),delivery_challan_items(id,item_id,item_name,unit,ordered_qty,received_qty)&id=eq.${Number(id)}&limit=1`);
  const d = rows?.[0]; if (!d) return null;
  const lines = (d.delivery_challan_items || []).sort((a, b) => a.id - b.id);
  const ids = [...new Set(lines.map(l => l.item_id).filter(Boolean))]; const hsn = {};
  if (ids.length) { try { (await sbGet(`item_master?select=id,hsn_code&id=in.(${ids.join(",")})`)).forEach(r => { if (r.hsn_code) hsn[r.id] = r.hsn_code; }); } catch {} }
  const dc = { id: d.id, dc_ref: d.dc_ref, date: d.dc_date, site: d.sites?.name || "", site_id: d.site_id, client: d.clients?.name || d.sites?.client_name || null, clientRow: d.clients || null, po_no: d.purchase_orders?.po_no || "", po_id: d.po_id, status: d.status, lines };
  return { dc, note: noteFromChallan(dc, hsn) };
}
export const noteVersion = note => createHash("sha256").update(JSON.stringify(note)).digest("hex").slice(0, 16);

// ---- links ----
export const newToken = () => randomBytes(24).toString("base64url");   // 192 bits, URL-safe
export const tokenOk = t => /^[A-Za-z0-9_-]{24,64}$/.test(String(t || ""));
export const linkUrl = (origin, token) => `${origin}/dn/${token}`;
export const isLive = l => l && !l.revoked_at && new Date(l.expires_at).getTime() > Date.now();
export async function activeLink(challanId) {
  const rows = await sbGet(`delivery_note_links?select=*&challan_id=eq.${Number(challanId)}&revoked_at=is.null&order=created_at.desc&limit=1`);
  const l = rows?.[0]; return isLive(l) ? l : null;
}
export async function getOrCreateLink(challanId, staff) {
  const cur = await activeLink(challanId); if (cur) return { link: cur, created: false };
  const link = await sbPost("delivery_note_links", { challan_id: Number(challanId), token: newToken(), created_by: staff.id, expires_at: new Date(Date.now() + DN_LINK_DAYS * 86400e3).toISOString() });
  await audit("dn_link_created", challanId, staff, { link_id: link.id, expires_at: link.expires_at });
  return { link, created: true };
}
export async function revokeLinks(challanId, staff) {
  const rows = await sbPatch("delivery_note_links", `challan_id=eq.${Number(challanId)}&revoked_at=is.null`, { revoked_at: new Date().toISOString(), revoked_by: staff.id });
  await audit("dn_link_revoked", challanId, staff, { links: (rows || []).length });
  return (rows || []).length;
}

// ---- public access ----
const buckets = new Map();   // ip → { n, at }  (per server instance; see DN_LOG.md)
export function rateLimited(ip, now = Date.now()) {
  const b = buckets.get(ip); if (!b || now - b.at > 60_000) { buckets.set(ip, { n: 1, at: now }); return false; }
  b.n++; return b.n > RATE_LIMIT.perMinute;
}
export const clientIp = req => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "0.0.0.0";
export async function publicNote(token) {
  if (!tokenOk(token)) return { status: "invalid" };
  const rows = await sbGet(`delivery_note_links?select=*&token=eq.${encodeURIComponent(token)}&limit=1`);
  const l = rows?.[0]; if (!l) return { status: "invalid" };
  if (l.revoked_at) return { status: "revoked" };
  if (new Date(l.expires_at).getTime() <= Date.now()) return { status: "expired" };
  const data = await loadChallan(l.challan_id); if (!data) return { status: "invalid" };
  return { status: "ok", link: l, ...data };
}
export async function logOpen(link) {
  try { await sbPatch("delivery_note_links", `id=eq.${link.id}`, { open_count: Number(link.open_count || 0) + 1, first_opened_at: link.first_opened_at || new Date().toISOString(), last_opened_at: new Date().toISOString() }); } catch {}
}

// ---- sends history ----
const hash = s => createHash("sha256").update(String(s)).digest("hex");
export function recipientFor(channel, { mobile, email }) {
  if (channel === "whatsapp" || channel === "sms") { if (!isMobile(mobile)) return { error: "Enter a valid 10-digit mobile number." }; return { masked: maskMobile(mobile), hash: hash("m:" + mobile) }; }
  if (channel === "email") { if (!isEmail(email)) return { error: "Enter a valid email address." }; return { masked: maskEmail(email), hash: hash("e:" + String(email).trim().toLowerCase()) }; }
  return { masked: channel === "share" ? "phone share sheet" : channel === "copy" ? "link copied" : "downloaded", hash: null };
}
export async function recordSend(challanId, staff, channel, rec, status, meta = {}, linkId = null) {
  // duplicate taps: the same person, channel and recipient within 10 s → one row
  const recent = await sbGet(`delivery_note_sends?select=id,sent_at&challan_id=eq.${Number(challanId)}&channel=eq.${channel}&sent_by=eq.${staff.id}${rec.hash ? "&recipient_hash=eq." + rec.hash : ""}&order=sent_at.desc&limit=1`);
  const last = recent?.[0]; if (last && Date.now() - new Date(last.sent_at).getTime() < 10_000) return { row: last, duplicate: true };
  const row = await sbPost("delivery_note_sends", { challan_id: Number(challanId), channel, recipient_masked: rec.masked, recipient_hash: rec.hash, sent_by: staff.id, sent_by_name: staff.full_name, status, meta, ...(linkId ? { link_id: linkId } : {}) });
  await audit("dn_sent", challanId, staff, { channel, recipient: rec.masked, status });
  return { row, duplicate: false };
}
const VIA = { whatsapp: "WhatsApp", sms: "SMS", email: "email", share: "share sheet" };
export function sendLabel(s, linksById) {
  if (s.status === "failed") return "Failed";
  if (s.status === "done") return "Done";
  const l = s.link_id ? linksById[s.link_id] : null;
  if (l?.first_opened_at && VIA[s.channel]) return "Sent via " + VIA[s.channel] + " · link opened";
  if (s.status === "sent") return "Sent via email (server)";
  return VIA[s.channel] ? "Sent via " + VIA[s.channel] : s.status;
}
export async function history(challanId) {
  const [sends, links] = await Promise.all([
    sbGet(`delivery_note_sends?select=id,channel,recipient_masked,sent_by_name,sent_at,status,link_id,meta&challan_id=eq.${Number(challanId)}&order=sent_at.desc&limit=50`),
    sbGet(`delivery_note_links?select=id,created_at,expires_at,revoked_at,first_opened_at,last_opened_at,open_count&challan_id=eq.${Number(challanId)}&order=created_at.desc&limit=20`),
  ]);
  const byId = {}; (links || []).forEach(l => { byId[l.id] = l; });
  const live = (links || []).find(isLive) || null;
  return { sends: (sends || []).map(s => ({ id: s.id, channel: s.channel, recipient_masked: s.recipient_masked, sent_by_name: s.sent_by_name, sent_at: s.sent_at, link_id: s.link_id || null, no_link: !!s.meta?.no_link, raw_status: s.status, status: sendLabel(s, byId) })),
    link: live ? { id: live.id, expires_at: live.expires_at, open_count: live.open_count, first_opened_at: live.first_opened_at } : null };
}
async function audit(action, refId, staff, meta) {
  try { await sbPost("module_audit_log", { module: "challan", action, ref_id: Number(refId), staff_id: staff?.id || null, meta }); } catch {}
}

// ---- PDF (cached per note version) ----
const pdfCache = new Map();   // key → { at, bytes }
export async function pdfBytes(note) {
  const key = note.id + ":" + noteVersion(note);
  const hit = pdfCache.get(key); if (hit) return hit.bytes;
  const { bytes } = await buildDnPdf(note);
  if (pdfCache.size > 200) pdfCache.clear();
  pdfCache.set(key, { at: Date.now(), bytes });
  return bytes;
}
export const pdfResponse = (bytes, note, download = true) => new Response(bytes, { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `${download ? "attachment" : "inline"}; filename="${safeFileName(note.no)}"`, "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } });

// ---- email (server-side only when a sender is configured; otherwise the panel falls back to mailto:) ----
export const emailMode = () => (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) ? "server" : "mailto";
export async function sendEmail({ to, note, link, pdf }) {
  if (emailMode() !== "server") return { ok: false, error: "No email sender is configured (RESEND_API_KEY / EMAIL_FROM)." };
  const body = { from: process.env.EMAIL_FROM, to: [to], subject: dnSubject(note), text: dnMessage(note, link), attachments: pdf ? [{ filename: safeFileName(note.no), content: Buffer.from(pdf).toString("base64") }] : [] };
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) return { ok: false, error: `Email service refused (${r.status}).` };
  return { ok: true };
}
