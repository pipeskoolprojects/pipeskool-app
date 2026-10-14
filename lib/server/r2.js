// update460: Cloudflare R2 access for the SERVER ONLY (API routes). Never import this from a page or component —
// it reads the R2 secret from the environment. Requests are signed with AWS SigV4 (aws4fetch); files never pass
// through Vercel: the browser receives a short-lived presigned URL and talks to R2 directly.
//
// Environment (Vercel → Settings → Environment Variables, server-only — no NEXT_PUBLIC_ prefix):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (= pipeskool-files)
//   FILE_BACKEND   = "r2" (default when the four R2 values exist) | "supabase" (instant rollback switch)
//   FILE_FALLBACK  = "1" (default) — a file not yet in R2 is served from Supabase; set "0" after Supabase cleanup
import { AwsClient } from "aws4fetch";
import crypto from "crypto";

const env = k => (process.env[k] || "").trim();
export const r2Configured = () => !!(env("R2_ACCOUNT_ID") && env("R2_ACCESS_KEY_ID") && env("R2_SECRET_ACCESS_KEY") && env("R2_BUCKET"));
export const backend = () => (env("FILE_BACKEND") === "supabase" || !r2Configured()) ? "supabase" : "r2";
export const fallbackOn = () => env("FILE_FALLBACK") !== "0";

let _client = null;
function client() {
  if (!_client) _client = new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" });
  return _client;
}
const encKey = key => String(key).split("/").map(encodeURIComponent).join("/");
// R2_ENDPOINT is optional (only for local testing against an S3 emulator); production uses the account endpoint
const endpoint = () => (env("R2_ENDPOINT") || `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`).replace(/\/$/, "");
const objectUrl = key => `${endpoint()}/${encodeURIComponent(env("R2_BUCKET"))}/${encKey(key)}`;

// presigned GET (download=true → browser saves instead of showing; filename optional)
export async function presignGet(key, { ttl = 300, download = false, filename = "" } = {}) {
  const u = new URL(objectUrl(key));
  u.searchParams.set("X-Amz-Expires", String(ttl));
  if (download) u.searchParams.set("response-content-disposition", `attachment${filename ? `; filename="${String(filename).replace(/["\r\n]/g, "")}"` : ""}`);
  const signed = await client().sign(new Request(u, { method: "GET" }), { aws: { signQuery: true } });
  return signed.url;
}
// presigned PUT — the browser uploads straight to R2
export async function presignPut(key, { ttl = 300 } = {}) {
  const u = new URL(objectUrl(key));
  u.searchParams.set("X-Amz-Expires", String(ttl));
  const signed = await client().sign(new Request(u, { method: "PUT" }), { aws: { signQuery: true } });
  return signed.url;
}
// does the object exist in R2? (used only while FILE_FALLBACK is on)
export async function headObject(key) {
  const r = await client().fetch(objectUrl(key), { method: "HEAD" });
  return r.status === 200 ? { ok: true, size: Number(r.headers.get("content-length") || 0), etag: r.headers.get("etag") } : { ok: false, status: r.status };
}
// health check for the admin status route: one cheap LIST of 1 key
export async function ping() {
  const u = new URL(`${endpoint()}/${encodeURIComponent(env("R2_BUCKET"))}`);
  u.searchParams.set("list-type", "2"); u.searchParams.set("max-keys", "1");
  const r = await client().fetch(u, { method: "GET" });
  return { ok: r.ok, status: r.status };
}

// ---------------------------------------------------------------- HMAC secrets (derived, so no extra env var)
// Rotating the R2 secret signs everyone out of file viewing (they get a fresh session on the next page load)
// and invalidates DC share links issued before the rotation.
export function hmac(label, data) {
  const base = env("FILE_LINK_SECRET") || env("R2_SECRET_ACCESS_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  return crypto.createHmac("sha256", base + "|" + label).update(String(data)).digest("base64url");
}
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
