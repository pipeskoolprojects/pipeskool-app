// update460: GET (Director / HO Admin / IT Bearer) → which backend is live and whether R2 answers. No secrets returned.
import { userFromToken, staffByAuthId, ADMIN_ROLES } from "@/lib/server/fileAuth";
import { backend, r2Configured, fallbackOn, ping } from "@/lib/server/r2";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const u = await userFromToken(token);
  const staff = u ? await staffByAuthId(u.authId) : null;
  if (!staff || !ADMIN_ROLES.includes(staff.role)) return Response.json({ ok: false, error: "Admins only." }, { status: 403 });
  const out = { ok: true, backend: backend(), r2Configured: r2Configured(), fallback: fallbackOn(), serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY, bucket: process.env.R2_BUCKET || null };
  if (r2Configured()) { try { out.r2 = await ping(); } catch (e) { out.r2 = { ok: false, error: (e?.message || "").slice(0, 120) }; } }
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
