// update480: POST { challan_id } → disable every live link of this note
import { staffFromReq, canSend, forbid, revokeLinks } from "@/lib/server/dn";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function POST(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
    if (!(await canSend(staff))) return forbid();
    const { challan_id } = await req.json().catch(() => ({}));
    const n = await revokeLinks(challan_id, staff);
    return Response.json({ ok: true, revoked: n });
  } catch (e) { console.error("DN_REVOKE_FAILED", (e?.message || String(e)).slice(0, 160)); return Response.json({ ok: false, error: "Could not disable the link." }, { status: 500 }); }
}
