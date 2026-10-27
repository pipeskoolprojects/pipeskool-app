// update480: POST { challan_id } (staff Bearer, challan.send) → the secure public link for one delivery note (reused while live)
import { staffFromReq, canSend, forbid, getOrCreateLink, loadChallan, linkUrl, emailMode } from "@/lib/server/dn";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function POST(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
    if (!(await canSend(staff))) return forbid();
    const { challan_id } = await req.json().catch(() => ({}));
    const data = await loadChallan(challan_id); if (!data) return Response.json({ ok: false, error: "Challan not found." }, { status: 404 });
    const { link, created } = await getOrCreateLink(challan_id, staff);
    return Response.json({ ok: true, url: linkUrl(new URL(req.url).origin, link.token), expires_at: link.expires_at, created, email_mode: emailMode() });
  } catch (e) { console.error("DN_LINK_FAILED", (e?.message || String(e)).slice(0, 160)); return Response.json({ ok: false, error: "Could not create the link." }, { status: 500 }); }
}
