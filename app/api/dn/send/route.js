// update480: POST { challan_id, channel, mobile?, email?, attach? } → records the send (history + audit).
// channel email: sent from the server with the PDF attached when a sender is configured; otherwise the caller opens
// mailto: and the row is recorded as "opened email app". Duplicate taps within 10 s are one row.
import { staffFromReq, canSend, forbid, loadChallan, getOrCreateLink, linkUrl, recipientFor, recordSend, emailMode, sendEmail, pdfBytes, history } from "@/lib/server/dn";
import { CHANNELS } from "@/lib/dnModel";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function POST(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
    if (!(await canSend(staff))) return forbid();
    const b = await req.json().catch(() => ({}));
    const channel = String(b.channel || ""); if (!CHANNELS.includes(channel)) return Response.json({ ok: false, error: "Unknown channel." }, { status: 400 });
    const data = await loadChallan(b.challan_id); if (!data) return Response.json({ ok: false, error: "Challan not found." }, { status: 404 });
    const rec = recipientFor(channel, { mobile: b.mobile, email: b.email }); if (rec.error) return Response.json({ ok: false, error: rec.error }, { status: 400 });
    const { link } = await getOrCreateLink(b.challan_id, staff); const url = linkUrl(new URL(req.url).origin, link.token);
    let status = "opened", mode = null, emailErr = "";
    if (channel === "email") {
      mode = emailMode();
      if (mode === "server") { const r = await sendEmail({ to: String(b.email).trim(), note: data.note, link: url, pdf: b.attach === false ? null : await pdfBytes(data.note) }); if (!r.ok) { emailErr = r.error; status = "failed"; } else status = "sent"; }
    } else if (channel === "copy" || channel === "download") status = "done";
    const { duplicate } = await recordSend(b.challan_id, staff, channel, rec, status, { mode });
    if (emailErr) return Response.json({ ok: false, error: emailErr, history: await history(b.challan_id) }, { status: 502 });
    return Response.json({ ok: true, status, mode, duplicate, url, history: await history(b.challan_id) });
  } catch (e) { console.error("DN_SEND_FAILED", (e?.message || String(e)).slice(0, 160)); return Response.json({ ok: false, error: "Could not record the send." }, { status: 500 }); }
}
