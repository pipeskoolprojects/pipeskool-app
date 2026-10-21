// POST { key } (staff Bearer) → a no-login link for approved delivery or repair PDFs.
import { userFromToken, staffByAuthId, validKey, folderOf, SHARE_FOLDERS, shareSig } from "@/lib/server/fileAuth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { key } = await req.json().catch(() => ({}));
    if (!validKey(key) || !SHARE_FOLDERS.includes(folderOf(key)) || (folderOf(key) === "repairs" && !/^repairs\/receipts\/[A-Za-z0-9_-]+\.pdf$/i.test(String(key)))) return Response.json({ ok: false, error: "Only delivery and repair PDFs can be shared." }, { status: 400 });
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = await userFromToken(token);
    const staff = u ? await staffByAuthId(u.authId) : null;
    if (!staff) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
    const base = new URL(req.url).origin;
    return Response.json({ ok: true, url: `${base}/api/files/s?k=${encodeURIComponent(key)}&sig=${shareSig(key)}` });   // update461: query-string link
  } catch (e) {
    console.error("FILES_SHARE_FAILED", (e?.message || String(e)).slice(0, 160));
    return Response.json({ ok: false, error: "Could not create the link." }, { status: 500 });
  }
}
