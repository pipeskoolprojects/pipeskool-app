// update480: POST { challan_id } (staff Bearer, challan.send) → the secure public link for one delivery note (reused while live)
import { staffFromReq, canSend, forbid, getOrCreateLink, loadChallan, linkUrl, emailMode, pdfBytes, failResponse } from "@/lib/server/dn";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function POST(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, code: "DN_NO_LOGIN", error: "Your login has expired — sign in again." }, { status: 401 });
    if (!(await canSend(staff))) return forbid();
    const { challan_id } = await req.json().catch(() => ({}));
    const data = await loadChallan(challan_id); if (!data) return Response.json({ ok: false, code: "DN_NOT_FOUND", error: "This challan was not found (it may have been deleted)." }, { status: 404 });
    const { link, created } = await getOrCreateLink(challan_id, staff);
    let pdf_ok = true; try { await pdfBytes(data.note); } catch (e) { pdf_ok = false; console.error("DN_LINK_PDF_FAILED", String(e?.message || e).slice(0, 200)); }   // warm the cache; the link works even if the PDF does not
    return Response.json({ ok: true, url: linkUrl(new URL(req.url).origin, link.token), link_id: link.id, expires_at: link.expires_at, created, pdf_ok, email_mode: emailMode() });
  } catch (e) { return failResponse(e, "link"); }
}
