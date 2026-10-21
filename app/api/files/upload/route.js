// update460: POST { key, bucket, contentType } → { backend: "r2", url } (5-minute presigned PUT) or { backend: "supabase" }.
// Staff (Bearer) may upload to any app folder. Without a staff login only a punch photo named the way the app names
// it (selfies/<worker>_<ts>.jpg, proxy/<worker>_[out_]<ts>.jpg) for an ACTIVE worker is accepted.
import { userFromToken, staffByAuthId, authIdFromCookie, validKey, punchPhotoWorker, activeWorker } from "@/lib/server/fileAuth";
import { backend, presignPut } from "@/lib/server/r2";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { key } = await req.json().catch(() => ({}));
    if (!validKey(key)) return Response.json({ ok: false, error: "This file path is not allowed." }, { status: 400 });
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = token ? await userFromToken(token) : null;
    // PDF / receipt uploads may happen after the short-lived bearer token expires.
    // Fall back to the signed, HttpOnly file-session cookie and re-check active staff.
    const authId = u?.authId || authIdFromCookie(req);
    const staff = authId ? await staffByAuthId(authId) : null;
    if (!staff) {
      const wid = punchPhotoWorker(key);
      if (!wid || !(await activeWorker(wid))) return Response.json({ ok: false, error: "Sign in to upload files." }, { status: 401 });
    }
    if (backend() === "supabase") return Response.json({ ok: true, backend: "supabase" });
    return Response.json({ ok: true, backend: "r2", url: await presignPut(key, { ttl: 300 }) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("FILES_UPLOAD_SIGN_FAILED", (e?.message || String(e)).slice(0, 160));
    return Response.json({ ok: false, error: "Could not prepare the upload." }, { status: 500 });
  }
}
