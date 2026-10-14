// update460: POST (Bearer = Supabase session) → sets the HttpOnly "psk_files" cookie used by <img>/<a>/<iframe> file views.
// DELETE → clears it (logout). The cookie only proves WHO you are; every view re-checks that the account is active.
import { userFromToken, staffByAuthId, makeCookie, clearCookie } from "@/lib/server/fileAuth";
import { backend } from "@/lib/server/r2";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = await userFromToken(token);
    if (!u) return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
    const staff = await staffByAuthId(u.authId);
    if (!staff) return Response.json({ ok: false, error: "No active staff account for this login." }, { status: 403 });
    return new Response(JSON.stringify({ ok: true, backend: backend() }), { status: 200, headers: { "content-type": "application/json", "set-cookie": makeCookie(u.authId), "cache-control": "no-store" } });
  } catch (e) {
    console.error("FILES_SESSION_FAILED", (e?.message || String(e)).slice(0, 160));
    return Response.json({ ok: false, error: "Could not start a file session." }, { status: 500 });
  }
}
export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json", "set-cookie": clearCookie() } });
}
