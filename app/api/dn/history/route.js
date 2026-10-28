// update480: GET ?challan_id → sends history + live link (staff with challan.send)
import { staffFromReq, canSend, forbid, history, emailMode , failResponse } from "@/lib/server/dn";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, code: "DN_NO_LOGIN", error: "Your login has expired — sign in again." }, { status: 401 });
    if (!(await canSend(staff))) return forbid();
    const id = Number(new URL(req.url).searchParams.get("challan_id")); if (!id) return Response.json({ ok: false, error: "challan_id required" }, { status: 400 });
    return Response.json({ ok: true, ...(await history(id)), email_mode: emailMode() });
  } catch (e) { return failResponse(e, "history"); }
}
