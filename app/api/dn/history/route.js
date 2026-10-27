// update480: GET ?challan_id → sends history + live link (staff with challan.send)
import { staffFromReq, canSend, forbid, history, emailMode } from "@/lib/server/dn";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
    if (!(await canSend(staff))) return forbid();
    const id = Number(new URL(req.url).searchParams.get("challan_id")); if (!id) return Response.json({ ok: false, error: "challan_id required" }, { status: 400 });
    return Response.json({ ok: true, ...(await history(id)), email_mode: emailMode() });
  } catch (e) { console.error("DN_HISTORY_FAILED", (e?.message || String(e)).slice(0, 160)); return Response.json({ ok: false, error: "Could not load the history." }, { status: 500 }); }
}
