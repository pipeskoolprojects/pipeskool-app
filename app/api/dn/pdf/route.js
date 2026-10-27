// update480: GET ?challan_id (staff Bearer) → the Delivery Note PDF (server-built, cached per note version)
import { staffFromReq, loadChallan, pdfBytes, pdfResponse } from "@/lib/server/dn";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
    const id = Number(new URL(req.url).searchParams.get("challan_id"));
    const data = await loadChallan(id); if (!data) return Response.json({ ok: false, error: "Challan not found." }, { status: 404 });
    return pdfResponse(await pdfBytes(data.note), data.note, new URL(req.url).searchParams.get("inline") !== "1");
  } catch (e) { console.error("DN_PDF_FAILED", (e?.message || String(e)).slice(0, 160)); return Response.json({ ok: false, error: "The PDF could not be generated. Print / Save as PDF still works." }, { status: 500 }); }
}
