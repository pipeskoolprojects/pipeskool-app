// update480/482: POST { challan_id, channel, mobile?, email?, attach?, no_link? } → records the send (history + audit).
// update482: the link is OPTIONAL here — if it cannot be made the send is still recorded (meta.no_link) so the user is
// never blocked; channel email is sent from the server with the PDF when a sender is configured, else the caller
// opens mailto: and the row says "Sent via email". Duplicate taps within 10 s are one row. Every failure has a code.
import { staffFromReq, canSend, forbid, loadChallan, getOrCreateLink, linkUrl, recipientFor, recordSend, emailMode, sendEmail, pdfBytes, history, failResponse, classify } from "@/lib/server/dn";
import { CHANNELS } from "@/lib/dnModel";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function POST(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, code: "DN_NO_LOGIN", error: "Your login has expired — sign in again." }, { status: 401 });
    if (!(await canSend(staff))) return forbid();
    const b = await req.json().catch(() => ({}));
    const channel = String(b.channel || ""); if (!CHANNELS.includes(channel)) return Response.json({ ok: false, code: "DN_BAD_CHANNEL", error: "Unknown channel." }, { status: 400 });
    const data = await loadChallan(b.challan_id); if (!data) return Response.json({ ok: false, code: "DN_NOT_FOUND", error: "This challan was not found (it may have been deleted)." }, { status: 404 });
    const rec = recipientFor(channel, { mobile: b.mobile, email: b.email }); if (rec.error) return Response.json({ ok: false, code: "DN_BAD_RECIPIENT", error: rec.error }, { status: 422 });
    let link = null, url = "", linkErr = null;
    try { link = (await getOrCreateLink(b.challan_id, staff)).link; url = linkUrl(new URL(req.url).origin, link.token); } catch (e) { linkErr = classify(e, "link"); console.error("DN_SEND_LINK_FAILED", linkErr.code, String(e?.message || e).slice(0, 200)); }
    let status = "opened", mode = null, emailErr = "";
    if (channel === "email") {
      mode = emailMode();
      if (mode === "server") {
        let pdf = null; if (b.attach !== false) { try { pdf = await pdfBytes(data.note); } catch (e) { console.error("DN_SEND_PDF_FAILED", String(e?.message || e).slice(0, 200)); } }
        const r = await sendEmail({ to: String(b.email).trim(), note: data.note, link: url, pdf }); if (!r.ok) { emailErr = r.error; status = "failed"; } else status = "sent";
      }
    } else if (channel === "copy" || channel === "download") status = "done";
    let duplicate = false, recErr = null;
    try { ({ duplicate } = await recordSend(b.challan_id, staff, channel, rec, status, { mode, no_link: !link, link_error: linkErr?.code || null, attach: b.attach !== false }, link?.id || null)); }
    catch (e) { recErr = classify(e, "send"); console.error("DN_SEND_RECORD_FAILED", recErr.code, String(e?.message || e).slice(0, 200)); }
    let hist = null; try { hist = await history(b.challan_id); } catch {}
    if (emailErr) return Response.json({ ok: false, code: "DN_EMAIL_FAILED", error: emailErr, history: hist }, { status: 502 });
    return Response.json({ ok: true, status, mode, duplicate, url, link_error: linkErr, record_error: recErr, history: hist });
  } catch (e) { return failResponse(e, "send"); }
}
