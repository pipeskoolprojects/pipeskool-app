// update480: POST { challan_id } → disable every live link of this note
import { staffFromReq, canSend, forbid, revokeLinks , failResponse } from "@/lib/server/dn";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function POST(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, code: "DN_NO_LOGIN", error: "Your login has expired — sign in again." }, { status: 401 });
    if (!(await canSend(staff))) return forbid();
    const { challan_id } = await req.json().catch(() => ({}));
    const n = await revokeLinks(challan_id, staff);
    return Response.json({ ok: true, revoked: n });
  } catch (e) { return failResponse(e, "revoke"); }
}
