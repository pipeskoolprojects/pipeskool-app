"use client";
// update480: "Send to site" — send one Delivery Note straight to a person (WhatsApp / email / SMS number), share it,
// copy the secure link or download the PDF. Every tap is recorded (history + audit) with an honest label: the app
// can only know that it OPENED WhatsApp / SMS / the mail app; "Sent" is reserved for server-side email.
import { useEffect, useRef, useState } from "react";
import { dnLink, dnRevoke, dnRecord, dnHistory, dnContacts, dnPdfBlob } from "@/lib/dnSend";
import { dnMessage, dnSubject, isMobile, isEmail, maskMobile, waUrl, smsUrl, mailtoUrl, safeFileName, CHANNEL_LABEL, DN_LINK_DAYS } from "@/lib/dnModel";

const fmtWhen = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }); };
const isPhone = () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)")?.matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

export default function DnSendPanel({ dc, note, canSend, onToast }) {
  const [mobile, setMobile] = useState(""); const [email, setEmail] = useState(""); const [msg, setMsg] = useState("");
  const [attach, setAttach] = useState(true); const [eMob, setEMob] = useState(""); const [eMail, setEMail] = useState("");
  const [link, setLink] = useState(null);            // { url, expires_at, email_mode }
  const [hist, setHist] = useState({ sends: [], link: null }); const [contacts, setContacts] = useState([]);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [smsText, setSmsText] = useState(false);
  const edited = useRef(false);
  const say = m => onToast ? onToast(m) : window.alert(m);

  const refresh = () => dnHistory(dc.id).then(h => { if (h.ok) setHist(h); });
  useEffect(() => { if (!canSend) return; dnLink(dc.id).then(r => { if (r.ok) setLink(r); else setErr(r.error); }); refresh(); dnContacts(dc.site_id).then(c => setContacts(c.contacts || [])); }, [dc.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!edited.current) setMsg(dnMessage(note, link?.url || "(link is created when you send)")); }, [link, note]);

  const okMob = () => { const v = mobile.replace(/\D/g, ""); if (!isMobile(v)) { setEMob("Enter a valid 10-digit mobile number"); return null; } setEMob(""); return v; };
  const okMail = () => { const v = email.trim(); if (!isEmail(v)) { setEMail("Enter a valid email address"); return null; } setEMail(""); return v; };
  const ensureLink = async () => { if (link?.url) return link; const r = await dnLink(dc.id); if (!r.ok) { setErr(r.error); return null; } setLink(r); if (!edited.current) setMsg(dnMessage(note, r.url)); return r; };
  const text = l => edited.current ? msg.replace("(link is created when you send)", l?.url || "") : dnMessage(note, l?.url || "");
  const run = async (what, fn) => { if (busy) return; setErr(""); setBusy(what); try { await fn(); } catch (e) { setErr(e?.message || String(e)); } finally { setBusy(""); } };

  const onWhatsApp = () => { const m = okMob(); if (!m) return; run("whatsapp", async () => {
    const l = await ensureLink(); if (!l) return;
    const w = window.open(waUrl(m, text(l)), "_blank", "noopener,noreferrer");   // direct chat with this number, never a group
    const r = await dnRecord(dc.id, "whatsapp", { mobile: m }); if (!r.ok) { setErr(r.error); return; }
    if (r.history) setHist(r.history); say(`WhatsApp opened for +91 ${maskMobile(m)} — tap Send there`); if (!w) say("Allow pop-ups to open WhatsApp");
  }); };
  const onEmail = () => { const e = okMail(); if (!e) return; run("email", async () => {
    const l = await ensureLink(); if (!l) return;
    if ((l.email_mode || hist.email_mode) === "server") {
      const r = await dnRecord(dc.id, "email", { email: e, attach }); if (!r.ok) { setErr(r.error); if (r.history) setHist(r.history); return; }
      setHist(r.history); say(`Email sent to ${e}${attach ? " with the PDF" : ""}`);
    } else {
      window.location.href = mailtoUrl(e, dnSubject(note), text(l));
      const r = await dnRecord(dc.id, "email", { email: e }); if (r.ok && r.history) setHist(r.history);
      say("Your email app opened — the PDF is not attached automatically; use Share… or Download PDF to attach it");
    }
  }); };
  const onSms = () => { const m = okMob(); if (!m) return; run("sms", async () => {
    const l = await ensureLink(); if (!l) return;
    if (isPhone()) { window.location.href = smsUrl(m, text(l)); const r = await dnRecord(dc.id, "sms", { mobile: m }); if (r.ok && r.history) setHist(r.history); say(`SMS app opened for +91 ${maskMobile(m)}`); }
    else { setSmsText(true); try { await navigator.clipboard.writeText(text(l)); say("Message copied — paste it into your SMS app"); } catch { say("Copy the message below into your SMS app"); } const r = await dnRecord(dc.id, "sms", { mobile: m }); if (r.ok && r.history) setHist(r.history); }
  }); };
  const onShare = () => run("share", async () => {
    const l = await ensureLink(); if (!l) return; const t = text(l);
    if (navigator.share) {
      let files = null;
      if (attach) { const p = await dnPdfBlob(dc.id); if (p.ok) { const f = new File([p.blob], safeFileName(note.no), { type: "application/pdf" }); if (navigator.canShare?.({ files: [f] })) files = [f]; } }
      try { await navigator.share(files ? { files, title: dnSubject(note), text: t } : { title: dnSubject(note), text: t, url: l.url }); } catch (e) { if (e?.name === "AbortError") return; throw e; }
      const r = await dnRecord(dc.id, "share"); if (r.ok && r.history) setHist(r.history); say(files ? "Shared with the PDF" : "Shared (message + link)");
    } else { await navigator.clipboard.writeText(t); const r = await dnRecord(dc.id, "copy"); if (r.ok && r.history) setHist(r.history); say("Copied"); }
  });
  const onCopy = () => run("copy", async () => { const l = await ensureLink(); if (!l) return; try { await navigator.clipboard.writeText(l.url); say("Link copied"); } catch { window.prompt("Copy this link:", l.url); } const r = await dnRecord(dc.id, "copy"); if (r.ok && r.history) setHist(r.history); });
  const onPdf = () => run("download", async () => {
    const p = await dnPdfBlob(dc.id); if (!p.ok) { setErr(p.error + " — Print / Save as PDF still works."); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(p.blob); a.download = safeFileName(note.no); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const r = await dnRecord(dc.id, "download"); if (r.ok && r.history) setHist(r.history); say("PDF downloaded");
  });
  const onRevoke = () => { if (!window.confirm("Disable the current link? People who already have it will see 'no longer available'. A new link is made the next time you send.")) return; run("revoke", async () => { const r = await dnRevoke(dc.id); if (!r.ok) { setErr(r.error); return; } setLink(null); edited.current = false; refresh(); say("Link disabled"); }); };

  if (!canSend) return <aside className="panel2" id="dn-panel"><h3>Send to site</h3><div className="sub">You do not have the &quot;Send delivery note to site&quot; right. A Director can grant it under Access Rights → Delivery Challans.</div></aside>;
  const mailMode = link?.email_mode || hist.email_mode || "mailto";
  return (
    <aside className="panel2" id="dn-panel" aria-label="Send to site">
      <h3>Send to site</h3><div className="sub">Send this delivery note straight to a person, not to a group.</div>
      <label className="lbl" htmlFor="dn-mob">Mobile number (WhatsApp / SMS)</label>
      <div className="num"><span>+91</span><input id="dn-mob" inputMode="numeric" pattern="[0-9]*" maxLength={10} placeholder="10-digit mobile number" autoComplete="off" value={mobile} onChange={e => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setEMob(""); }} /></div>
      {contacts.length > 0 && <div className="chips" role="group" aria-label="Saved contacts">{contacts.map(c => <button type="button" key={c.mobile} className={"chip " + (mobile === c.mobile ? "on" : "")} onClick={() => { setMobile(c.mobile); setEMob(""); }}>{c.label} · {maskMobile(c.mobile)}</button>)}</div>}
      <div className="hint">Any number works, saved site contacts are only shortcuts. WhatsApp opens a direct chat with this number.</div>
      <div className="err" role="alert">{eMob}</div>
      <label className="lbl" htmlFor="dn-mail">Email (optional)</label>
      <input id="dn-mail" type="email" inputMode="email" placeholder="name@company.com" autoComplete="off" value={email} onChange={e => { setEmail(e.target.value); setEMail(""); }} /><div className="err" role="alert">{eMail}</div>
      <label className="lbl" htmlFor="dn-msg">Message</label>
      <textarea id="dn-msg" value={msg} onChange={e => { edited.current = true; setMsg(e.target.value); }} />
      <div className="sw"><label htmlFor="dn-attach">Attach the delivery note PDF</label><input id="dn-attach" type="checkbox" checked={attach} onChange={e => setAttach(e.target.checked)} /></div>
      <div className="hint">{attach ? "The PDF is attached to Email and the phone's Share sheet. WhatsApp and SMS carry the message with the secure download link." : "Only the message and the link are sent."}{mailMode === "mailto" ? " Email opens your mail app; the PDF is not attached automatically there." : ""}</div>
      <div className="ch">
        <button type="button" className="wa" disabled={!!busy} onClick={onWhatsApp}>{busy === "whatsapp" ? "Opening…" : "Send on WhatsApp"}</button>
        <button type="button" className="em" disabled={!!busy} onClick={onEmail}>{busy === "email" ? "Sending…" : "Send by Email"}</button>
        <button type="button" disabled={!!busy} onClick={onSms}>{busy === "sms" ? "Opening…" : "Send SMS"}</button>
        <button type="button" disabled={!!busy} onClick={onShare}>{busy === "share" ? "Preparing…" : "Share…"}</button>
        <button type="button" disabled={!!busy} onClick={onCopy}>Copy link</button>
        <button type="button" className="full" disabled={!!busy} onClick={onPdf}>{busy === "download" ? "Preparing PDF…" : "Download PDF"}</button>
      </div>
      {smsText && <div style={{ marginTop: 10 }}><div className="hint">On a desktop SMS cannot be opened — copy the message to your phone:</div><textarea readOnly value={text(link)} style={{ minHeight: 110 }} /><button type="button" className="chip" onClick={async () => { try { await navigator.clipboard.writeText(text(link)); say("Message copied"); } catch {} }}>Copy message</button></div>}
      {err && <div className="err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      <div className="linkrow">{link?.url ? <><span>Secure link (valid {DN_LINK_DAYS} days{link.expires_at ? ", till " + fmtWhen(link.expires_at).split(",")[0] : ""}{hist.link?.open_count ? ` · opened ${hist.link.open_count}×` : ""}):</span><code>{link.url}</code><button type="button" className="chip" disabled={!!busy} onClick={onRevoke}>Disable link</button></> : <span>No live link — one is created when you send.</span>}</div>
      <div className="hist"><h4>Sent history for this note</h4>
        {hist.sends.length === 0 ? <div className="hint">Nothing sent yet.</div> : hist.sends.map(s => <div className="hi" key={s.id}><span>{CHANNEL_LABEL[s.channel] || s.channel} · {s.recipient_masked || "—"}<small>{s.sent_by_name} · {fmtWhen(s.sent_at)}</small></span><i style={s.status === "failed" ? { color: "var(--red)" } : undefined}>{s.status === "failed" ? "Failed" : s.status === "done" ? "Done" : s.status}</i></div>)}
      </div>
    </aside>
  );
}
