// update460: WHO may upload / view which file — enforced on the server for every request.
//
// Identity:
//   • staff  — Supabase Auth user (Bearer token on POST routes; on GET the HttpOnly "psk_files" cookie that the
//              app sets right after login) → matched to an ACTIVE app_users row (re-checked, cached 60 s)
//   • workers (labour self-punch, worker-app proxy marker) have no staff login — without one, a caller may only
//     UPLOAD a punch photo named exactly like the app names them (selfies/<worker id>_<ts>.jpg,
//     proxy/<worker id>_[out_]<ts>.jpg) for a worker that exists and is active — the same thing the public
//     bucket allowed anonymously before. Such callers can view nothing.
// Rules by top-level folder of the key (the key is the same path the database already stores):
//   aadhaar/, bank/        → Director, HO Admin, IT Executive, or anyone holding a "Worker master" permission
//   every other app folder → any active staff member
//   anything else          → refused
import { hmac, safeEqual } from "./r2";

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const FOLDERS = ["selfies", "proxy", "bills", "dpr", "aadhaar", "bank", "grn", "dc", "challan", "contracts", "company",
  "leave", "notices", "tickets", "project-docs", "rentals", "quote-proofs", "repairs", "indent-imports"];   // update484: original Excel lists behind an import
export const SENSITIVE = ["aadhaar", "bank"];
const DATED = /^\d{4}-\d{2}-\d{2}$/;   // Assistant bill uploads (one folder per day)
export const ADMIN_ROLES = ["director", "ho_admin", "it_executive"];

export function folderOf(key) { return String(key || "").split("/")[0]; }
export function validKey(key) {
  const k = String(key || "");
  if (!k || k.length > 400 || k.startsWith("/") || k.includes("..") || k.includes("\\") || /[\u0000-\u001f]/.test(k)) return false;
  if (!k.includes("/")) return false;
  const f = folderOf(k);
  return FOLDERS.includes(f) || DATED.test(f);
}

// ---------------------------------------------------------------- Supabase lookups (service role, server only)
async function sb(path) {
  const r = await fetch(`${SB_URL()}/rest/v1/${path}`, { headers: { apikey: SERVICE(), authorization: `Bearer ${SERVICE()}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`lookup failed (${r.status})`);
  return r.json();
}
export async function userFromToken(token) {
  if (!token) return null;
  const r = await fetch(`${SB_URL()}/auth/v1/user`, { headers: { apikey: ANON(), authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { authId: u.id } : null;
}
const cache = new Map();   // authId -> { at, staff }
export async function staffByAuthId(authId) {
  const hit = cache.get(authId);
  if (hit && Date.now() - hit.at < 60000) return hit.staff;
  const rows = await sb(`app_users?select=id,full_name,role,is_active,site_id&auth_id=eq.${encodeURIComponent(authId)}&limit=1`);
  let staff = rows?.[0] && rows[0].is_active !== false ? rows[0] : null;
  if (staff && !ADMIN_ROLES.includes(staff.role)) {
    const p = await sb(`permissions?select=module&user_id=eq.${staff.id}&module=eq.workers&allowed=eq.true&limit=1`);
    staff = { ...staff, workerMaster: (p || []).length > 0 };
  } else if (staff) staff = { ...staff, workerMaster: true };
  cache.set(authId, { at: Date.now(), staff });
  return staff;
}
export async function activeWorker(workerId) {
  if (!/^\d+$/.test(String(workerId))) return false;
  const rows = await sb(`workers?select=id&is_active=eq.true&id=eq.${workerId}&limit=1`);
  return (rows || []).length > 0;
}

// ---------------------------------------------------------------- cookie session for <img>/<a>/<iframe> views
export const COOKIE = "psk_files";
const WEEK = 7 * 24 * 3600;
export function makeCookie(authId) {
  const payload = Buffer.from(JSON.stringify({ u: authId, e: Math.floor(Date.now() / 1000) + WEEK })).toString("base64url");
  const v = `${payload}.${hmac("files-cookie", payload)}`;
  return `${COOKIE}=${v}; Path=/api/files; HttpOnly; Secure; SameSite=Lax; Max-Age=${WEEK}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/api/files; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export function authIdFromCookie(req) {
  const raw = (req.headers.get("cookie") || "").split(/;\s*/).find(c => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!payload || !sig || !safeEqual(sig, hmac("files-cookie", payload))) return null;
  try { const p = JSON.parse(Buffer.from(payload, "base64url").toString()); return p.e > Date.now() / 1000 ? p.u : null; } catch { return null; }
}

// may this staff member VIEW this key?
export async function canView(staff, key) {
  if (!staff || !validKey(key)) return false;
  if (SENSITIVE.includes(folderOf(key))) return ADMIN_ROLES.includes(staff.role) || !!staff.workerMaster;
  if (folderOf(key) === "repairs") {
    const photo = await sb(`machine_repair_machines?select=request_id&photo_url=eq.${encodeURIComponent(key)}&limit=1`);
    const receipt = photo?.length ? [] : await sb(`machine_repair_receipts?select=request_id&pdf_path=eq.${encodeURIComponent(key)}&limit=1`);
    const requestId = photo?.[0]?.request_id || receipt?.[0]?.request_id;
    if (!requestId) return false;
    const request = await sb(`machine_repair_requests?select=site_id&id=eq.${encodeURIComponent(requestId)}&limit=1`);
    const siteId = request?.[0]?.site_id;
    if (!siteId) return false;
    if (ADMIN_ROLES.includes(staff.role)) return true;
    const rights = await sb(`permissions?select=id&user_id=eq.${encodeURIComponent(staff.id)}&site_id=eq.${encodeURIComponent(siteId)}&module=eq.machine_repair&allowed=eq.true&action=in.(view,create,approve,manage)&limit=1`);
    if (!rights?.length) return false;
    const assigned = await sb(`user_sites?select=site_id&user_id=eq.${encodeURIComponent(staff.id)}&site_id=eq.${encodeURIComponent(siteId)}&limit=1`);
    return !!assigned?.length || Number(staff.site_id) === Number(siteId);
  }
  return true;
}
// may this caller UPLOAD to this key?  (staff: any app folder · worker: own selfie only)
export function canUploadAsStaff(staff, key) { return !!staff && validKey(key); }
export function punchPhotoWorker(key) { const m = /^(?:selfies|proxy)\/(\d+)_(?:out_)?\d{10,14}\.jpg$/.exec(String(key || "")); return m ? m[1] : null; }

// ---------------------------------------------------------------- DC share links (WhatsApp) — no login, one file only
export const SHARE_FOLDERS = ["dc", "repairs"];
export const shareSig = key => hmac("share", key).slice(0, 32);
