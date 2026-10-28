// update480: GET ?challan_id (staff Bearer) → the Delivery Note PDF (server-built, cached per note version)
import { staffFromReq, loadChallan, pdfBytes, pdfResponse , failResponse } from "@/lib/server/dn";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, code: "DN_NO_LOGIN", error: "Your login has expired — sign in again." }, { status: 401 });
    const id = Number(new URL(req.url).searchParams.get("challan_id"));
    const data = await loadChallan(id); if (!data) return Response.json({ ok: false, code: "DN_NOT_FOUND", error: "This challan was not found (it may have been deleted)." }, { status: 404 });
    return pdfResponse(await pdfBytes(data.note), data.note, new URL(req.url).searchParams.get("inline") !== "1");
  } catch (e) { return failResponse(e, "pdf"); }
}
