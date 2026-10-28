"use client";
// update480: "Send to site" — send one Delivery Note straight to a person (WhatsApp / email / SMS number), share it,
// copy the secure link or download the PDF. Every tap is recorded (history + audit).
// update482: the link is created as soon as the panel opens and shown with its expiry; a failure shows the real reason
// with a code (+ Copy error details, Retry) and NEVER blocks sending — WhatsApp / SMS go without the link (the text says
// the PDF comes separately), Email / Share attach the PDF, Download PDF works on its own (built in the browser if the
// server cannot). Numbers are normalised (+91, spaces, leading 0); the "(link is created when you send)" placeholder is
// never sent.
import { useEffect, useRef, useState } from "react";
import { dnLink, dnRevoke, dnRecord, dnHistory, dnContacts, dnPdfBlob, errLine } from "@/lib/dnSend";
import { dnMessage, dnSubject, isMobile, isEmail, normMobile, maskMobile, waUrl, smsUrl, mailtoUrl, safeFileName, CHANNEL_LABEL, DN_LINK_DAYS, LINK_TOKEN, finalText } from "@/lib/dnModel";

const fmtWhen = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }); };
const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); };
const isPhone = () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)")?.matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

export default function DnSendPanel({ dc, note, canSend, onToast }) {
  const [mobile, setMobile] = useState(""); const [email, setEmail] = useState(""); const [msg, setMsg] = useState("");
  const [attach, setAttach] = useState(true); const [eMob, setEMob] = useState(""); const [eMail, setEMail] = useState("");
  const [link, setLink] = useState(null);            // { url, expires_at, link_id, email_mode }
  const [linkState, setLinkState] = useState("creating");   // creating | live | failed | none
  const [linkErr, setLinkErr] = useState(null);      // { status, code, error, detail }
  const [hist, setHist] = useState({ sends: [], link: null }); const [histErr, setHistErr] = useState(null); const [contacts, setContacts] = useState([]);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(null); const [smsText, setSmsText] = useState("");
  const edited = useRef(false);
  const say = m => onToast ? onToast(m) : window.alert(m);

  const refresh = () => dnHistory(dc.id).then(h => { if (h.ok) { setHist(h); setHistErr(null); } else setHistErr(h); });
  const makeLink = async () => {
    setLinkState("creating"); setLinkErr(null);
    const r = await dnLink(dc.id);
    if (r.ok) { setLink(r); setLinkState("live"); if (!edited.current) setMsg(dnMessage(note, r.url)); return r; }
    setLink(null); setLinkErr(r); setLinkState("failed"); if (!edited.current) setMsg(dnMessage(note, LINK_TOKEN)); return null;
  };
  useEffect(() => { if (!canSend) return; setMsg(dnMessage(note, LINK_TOKEN)); makeLink(); refresh(); dnContacts(dc.site_id).then(c => setContacts(c.contacts || [])); }, [dc.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const okMob = () => { const v = normMobile(mobile); if (!v) { setEMob("Type the mobile number first"); return null; } if (!isMobile(v)) { setEMob("Enter a valid 10-digit mobile number"); return null; } setEMob(""); if (v !== mobile) setMobile(v); return v; };
  const okMail = () => { const v = email.trim(); if (!v) { setEMail("Type the email address first"); return null; } if (!isEmail(v)) { setEMail("Enter a valid email address"); return null; } setEMail(""); return v; };
  /** the link if we have it, else one more quick try — never throws, never blocks */
  const linkNow = async () => link?.url ? link : (linkState === "creating" ? null : await makeLink());
  const text = l => finalText(edited.current ? msg : dnMessage(note, l?.url || LINK_TOKEN), l?.url || "");
  const record = async (channel, extra = {}) => { const r = await dnRecord(dc.id, channel, extra); if (r.history) setHist(r.history); else if (r.ok) refresh(); if (!r.ok) setErr({ what: "record this send in the history", ...r }); else if (r.record_error) setErr({ what: "record this send in the history", ...r.record_error, status: 500 }); return r; };
  const run = async (what, fn) => { if (busy) return; setErr(null); setBusy(what); try { await fn(); } catch (e) { setErr({ what, status: 0, code: "DN_CLIENT", error: e?.message || String(e), detail: String(e?.stack || e).slice(0, 300) }); } finally { setBusy(""); } };
  const pdfFile = async () => { const p = await dnPdfBlob(dc.id, note); return p.ok ? new File([p.blob], safeFileName(note.no), { type: "application/pdf" }) : null; };

  const onWhatsApp = () => { const m = okMob(); if (!m) return; run("whatsapp", async () => {
    const w = window.open("about:blank", "_blank");   // opened inside the tap so pop-up blockers allow it; the address is set below
    const l = await linkNow(); const url = waUrl(m, text(l));
    if (w) { try { w.opener = null; w.location.href = url; } catch { window.open(url, "_blank", "noopener"); } } else window.location.href = url;
    await record("whatsapp", { mobile: m });
    say(l ? `WhatsApp opened for +91 ${maskMobile(m)} — tap Send there` : `WhatsApp opened without the link (it could not be created) — send the PDF with Share… or Download PDF`);
  }); };
  const onEmail = () => { const e = okMail(); if (!e) return; run("email", async () => {
    const l = await linkNow(); const mode = l?.email_mode || hist.email_mode || "mailto";
    if (mode === "server") { const r = await record("email", { email: e, attach }); if (r.ok) say(`Email sent to ${e}${attach ? " with the PDF" : ""}`); return; }
    if (attach && navigator.share) { const f = await pdfFile(); if (f && navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: dnSubject(note), text: text(l) }); await record("email", { email: e, attach: true }); say("Pick your mail app in the share sheet — the PDF is attached"); return; } catch (x) { if (x?.name === "AbortError") return; } } }
    window.location.href = mailtoUrl(e, dnSubject(note), text(l));
    await record("email", { email: e, attach: false });
    say(attach ? "Your email app opened — attach the PDF from Download PDF (mail links cannot carry files)" : "Your email app opened");
  }); };
  const onSms = () => { const m = okMob(); if (!m) return; run("sms", async () => {
    const l = await linkNow();
    if (isPhone()) { window.location.href = smsUrl(m, text(l)); await record("sms", { mobile: m }); say(`SMS app opened for +91 ${maskMobile(m)}`); }
    else { setSmsText(text(l)); try { await navigator.clipboard.writeText(text(l)); say("Message copied — paste it into your SMS app"); } catch { say("Copy the message below into your SMS app"); } await record("sms", { mobile: m }); }
  }); };
  const onShare = () => run("share", async () => {
    const l = await linkNow(); const t = text(l);
    if (navigator.share) {
      let files = null; if (attach || !l) { const f = await pdfFile(); if (f && navigator.canShare?.({ files: [f] })) files = [f]; }
      try { await navigator.share(files ? { files, title: dnSubject(note), text: t } : { title: dnSubject(note), text: t, ...(l ? { url: l.url } : {}) }); } catch (e) { if (e?.name === "AbortError") return; throw e; }
      await record("share", { attach: !!files }); say(files ? "Shared with the PDF" : "Shared (message + link)");
    } else { try { await navigator.clipboard.writeText(t); say("Copied — this browser has no share sheet"); } catch { window.prompt("Copy this message:", t); } await record("copy"); }
  });
  const onCopy = () => run("copy", async () => {
    const l = await linkNow(); if (!l) { setErr({ what: "copy the link", ...(linkErr || { status: 0, error: "No link yet" }) }); return; }
    try { await navigator.clipboard.writeText(l.url); say("Link copied"); } catch { window.prompt("Copy this link:", l.url); }
    await record("copy");
  });
  const onPdf = () => run("download", async () => {
    const p = await dnPdfBlob(dc.id, note); if (!p.ok) { setErr({ what: "make the PDF", ...p }); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(p.blob); a.download = safeFileName(note.no); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(p.source === "browser" ? "PDF downloaded (made on this device — the server could not)" : "PDF downloaded");
    record("download");   // history is best-effort here: the file is already on the device
  });
  const onRevoke = () => { if (!window.confirm("Disable the current link? People who already have it will see 'no longer available'. A new link is made straight away for the next send.")) return; run("revoke", async () => { const r = await dnRevoke(dc.id); if (!r.ok) { setErr({ what: "disable the link", ...r }); return; } setLink(null); edited.current = false; say("Link disabled"); await makeLink(); refresh(); }); };
  const copyDetails = async (e) => { const t = [`Delivery note ${note.no} (challan ${dc.id})`, `What: ${e.what || "create the link"}`, `Status: ${e.status ?? "—"}`, `Code: ${e.code || "—"}`, `Message: ${e.error || ""}`, `Detail: ${e.detail || ""}`, `Time: ${new Date().toISOString()}`, `Browser: ${navigator.userAgent}`].join("\n"); try { await navigator.clipboard.writeText(t); say("Error details copied — paste them to IT"); } catch { window.prompt("Copy these details:", t); } };

  if (!canSend) return <aside className="panel2" id="dn-panel"><h3>Send to site</h3><div className="sub">You do not have the &quot;Send delivery note to site&quot; right. A Director can grant it under Access Rights → Delivery Challans.</div></aside>;
  const mailMode = link?.email_mode || hist.email_mode || "mailto";
  const ErrBox = ({ e, retry }) => <div className="err" role="alert" style={{ marginTop: 8 }} data-code={e.code}>{errLine(e.what || "create the link", e)} <span style={{ opacity: .8 }}>[{e.code}]</span>
    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>{retry && <button type="button" className="chip" disabled={!!busy || linkState === "creating"} onClick={retry}>Retry</button>}<button type="button" className="chip" onClick={() => copyDetails(e)}>Copy error details</button></div></div>;
  return (
    <aside className="panel2" id="dn-panel" aria-label="Send to site">
      <h3>Send to site</h3><div className="sub">Send this delivery note straight to a person, not to a group.</div>
      <label className="lbl" htmlFor="dn-mob">Mobile number (WhatsApp / SMS)</label>
      <div className="num"><span>+91</span><input id="dn-mob" inputMode="tel" maxLength={16} placeholder="10-digit mobile number" autoComplete="off" value={mobile} onChange={e => { setMobile(e.target.value.replace(/[^\d+\s-]/g, "").slice(0, 16)); setEMob(""); }} onBlur={() => { const v = normMobile(mobile); if (v && v !== mobile && v.length === 10) setMobile(v); }} /></div>
      {contacts.length > 0 && <div className="chips" role="group" aria-label="Saved contacts">{contacts.map(c => <button type="button" key={c.mobile} className={"chip " + (normMobile(mobile) === c.mobile ? "on" : "")} onClick={() => { setMobile(c.mobile); setEMob(""); }}>{c.label} · {maskMobile(c.mobile)}</button>)}</div>}
      <div className="hint">Any number works (+91, spaces and a leading 0 are fine), saved site contacts are only shortcuts. WhatsApp opens a direct chat with this number.</div>
      <div className="err" role="alert">{eMob}</div>
      <label className="lbl" htmlFor="dn-mail">Email (optional)</label>
      <input id="dn-mail" type="email" inputMode="email" placeholder="name@company.com" autoComplete="off" value={email} onChange={e => { setEmail(e.target.value); setEMail(""); }} /><div className="err" role="alert">{eMail}</div>
      <label className="lbl" htmlFor="dn-msg">Message</label>
      <textarea id="dn-msg" value={msg} onChange={e => { edited.current = true; setMsg(e.target.value); }} />
      <div className="sw"><label htmlFor="dn-attach">Attach the delivery note PDF</label><input id="dn-attach" type="checkbox" checked={attach} onChange={e => setAttach(e.target.checked)} /></div>
      <div className="hint">{attach ? "The PDF goes with Share… (and Email on phones that can share files). WhatsApp and SMS carry the message with the secure download link." : "Only the message and the link are sent."}{mailMode === "mailto" ? " On a computer, Email opens your mail app — attach the PDF from Download PDF there." : ""}</div>
      <div className="ch">
        <button type="button" className="wa" disabled={!!busy} onClick={onWhatsApp}>{busy === "whatsapp" ? "Opening…" : "Send on WhatsApp"}</button>
        <button type="button" className="em" disabled={!!busy} onClick={onEmail}>{busy === "email" ? "Sending…" : "Send by Email"}</button>
        <button type="button" disabled={!!busy} onClick={onSms}>{busy === "sms" ? "Opening…" : "Send SMS"}</button>
        <button type="button" disabled={!!busy} onClick={onShare}>{busy === "share" ? "Preparing…" : "Share…"}</button>
        <button type="button" disabled={!!busy || linkState !== "live"} title={linkState !== "live" ? "The link is not available" : ""} onClick={onCopy}>Copy link</button>
        <button type="button" className="full" disabled={busy === "download"} onClick={onPdf}>{busy === "download" ? "Preparing PDF…" : "Download PDF"}</button>
      </div>
      {smsText && <div style={{ marginTop: 10 }}><div className="hint">On a computer SMS cannot be opened — copy the message to your phone:</div><textarea readOnly value={smsText} style={{ minHeight: 110 }} /><button type="button" className="chip" onClick={async () => { try { await navigator.clipboard.writeText(smsText); say("Message copied"); } catch {} }}>Copy message</button></div>}
      {err && <ErrBox e={err} />}
      <div className="linkrow" data-link-state={linkState}>
        {linkState === "creating" && <span>Creating the secure link…</span>}
        {linkState === "live" && link?.url && <><span>Secure link · valid till {fmtDay(link.expires_at)} ({DN_LINK_DAYS} days){hist.link?.open_count ? ` · opened ${hist.link.open_count}×` : ""}:</span><code>{link.url}</code><button type="button" className="chip" disabled={!!busy} onClick={onRevoke}>Disable link</button></>}
        {linkState === "failed" && linkErr && <><ErrBox e={{ ...linkErr, what: "create the link" }} retry={makeLink} /><span>You can still send: WhatsApp and SMS go without the link, Share… and Download PDF carry the PDF itself.</span></>}
      </div>
      <div className="hist"><h4>Sent history for this note</h4>
        {histErr && <ErrBox e={{ ...histErr, what: "load the history" }} retry={refresh} />}
        {!histErr && hist.sends.length === 0 ? <div className="hint">Nothing sent yet.</div> : hist.sends.map(s => <div className="hi" key={s.id}><span>{CHANNEL_LABEL[s.channel] || s.channel} · {s.recipient_masked || "—"}<small>{s.sent_by_name} · {fmtWhen(s.sent_at)}{s.no_link ? " · without link" : ""}</small></span><i style={s.status === "Failed" ? { color: "var(--red)" } : undefined}>{s.status}</i></div>)}
      </div>
    </aside>
  );
}
