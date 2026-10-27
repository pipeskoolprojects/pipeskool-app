"use client";
// update453: "Send to supervisor" for one delivery challan — the count-before-GRN message.
//   • recipients = Supervisors / Site Incharges allotted to the challan's site (pre-ticked); other staff on the
//     site unticked; no supervisor → warning + the full staff list to pick from
//   • language = recipient's profile preference (Staff Master / phone choice), else Hindi; pills to override
//   • channels = WhatsApp (wa.me link — opens the chat with the message ready, the sender taps Send) and/or
//     push + in-app bell (delivered by the app itself)
//   • every send is logged (fn_dc_send_log) and the row shows "Sent to … · time · language"
// update454: THE DOCUMENT GOES WITH THE MESSAGE. Before anything is sent, the Delivery Note for this DC (the
//   same layout as 🖨 Print / PDF) is rendered to a PDF, uploaded to Storage, and its link is written into the
//   message ("📎 Delivery challan (PDF): …") and into the push notification (tapping the bell opens the PDF).
//   If the PDF cannot be made or uploaded, NOTHING is sent and nothing is recorded — "Sent" always means
//   message + document together. On phones that can share files, the PDF itself can also be attached.
import { useEffect, useMemo, useRef, useState } from "react";
import { getSiteRecipients, getAllStaffForSend, logDcSend, getHsnMap, uploadDcPdf } from "@/lib/challan";
import DnDoc, { DN_CSS } from "@/components/DnDoc";   // update480: the redesigned note (no vendor) goes with the message
import { noteFromChallan } from "@/lib/dnModel";
import { buildDcMessage, LANG_LABEL } from "@/lib/dcMessage";
import { notifyUsers } from "@/lib/notify";
import { waLink } from "@/lib/enquiry";

export default function DcSendBox({ dc, onClose, onSent }) {
  const [sup, setSup] = useState(null); const [others, setOthers] = useState([]); const [all, setAll] = useState([]);
  const [picked, setPicked] = useState({});       // user id -> true
  const [lang, setLang] = useState(null);         // null = per recipient's profile
  const [chan, setChan] = useState({ whatsapp: true, push: true });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [hsn, setHsn] = useState({});            // update454: HSN codes for the rendered Delivery Note
  const [pdf, setPdf] = useState(null);          // update454: { path, url, filename, blob } once generated
  const [stage, setStage] = useState("");        // update454: progress text while sending
  const docRef = useRef(null);

  useEffect(() => { getHsnMap((dc.lines || []).map(l => l.item_id)).then(setHsn); }, [dc.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    getSiteRecipients(dc.site_id).then(r => {
      setSup(r.supervisors); setOthers(r.others);
      setPicked(Object.fromEntries(r.supervisors.map(u => [u.id, true])));
      if (!r.supervisors.length) { setShowAll(true); getAllStaffForSend().then(setAll); }
    }).catch(e => { setErr(e.message); setSup([]); });
  }, [dc.site_id]);

  const pool = useMemo(() => { const m = new Map(); [...(sup || []), ...others, ...all].forEach(u => m.set(u.id, u)); return [...m.values()]; }, [sup, others, all]);
  const recips = pool.filter(u => picked[u.id]);
  const langOf = u => lang || u.preferred_lang || "hi";
  const msgFor = (u, doc) => buildDcMessage(langOf(u), { name: u.full_name, site: dc.site, vendor: dc.vendor, dcRef: dc.dc_ref, poNo: dc.po_no, lines: dc.lines, pdfUrl: (doc || pdf)?.url || "" });
  const preview = recips[0] || pool[0];
  const PREVIEW_URL = "https://…/" + String(dc.dc_ref).replace(/[^A-Za-z0-9]+/g, "-") + ".pdf";   // shown in the preview until the real link exists

  // update454: render the Delivery Note (hidden, same layout as Print / PDF) → PDF → Storage. Once per open box.
  async function ensurePdf() {
    if (pdf) return pdf;
    setStage("Preparing the challan PDF…");
    const el = docRef.current;
    if (!el) throw new Error("The challan document is not ready yet — try again in a moment.");
    const html2pdf = (await import("html2pdf.js")).default;
    const blob = await html2pdf().set({
      margin: [12, 12, 14, 12], image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] },
    }).from(el).outputPdf("blob");
    setStage("Uploading the challan PDF…");
    const up = await uploadDcPdf(dc.dc_ref, blob);
    if (!up.ok) throw new Error(up.error);
    const doc = { ...up, blob };
    setPdf(doc);
    return doc;
  }

  async function send(mode) {   // mode: "both" | "push"
    setErr("");
    if (!recips.length) { setErr("Tick at least one recipient."); return; }
    const useWa = mode === "both" && chan.whatsapp, usePush = chan.push || mode === "push";
    if (!useWa && !usePush) { setErr("Choose WhatsApp, push, or both."); return; }
    setBusy(true);
    try {
      // 0. update454: the document FIRST — no PDF, no send, no record
      let doc;
      try { doc = await ensurePdf(); } catch (e) { setErr("Not sent — " + (e?.message || e)); return; }
      setStage("Sending…");
      // 1. WhatsApp: one chat per recipient — the first opens now; the rest get their own buttons below.
      //    The message carries the 📎 PDF link (wa.me cannot pre-attach a file; the link opens the document in one tap).
      if (useWa) window.open(waLink(recips[0].mobile, msgFor(recips[0], doc)), "_blank", "noopener");
      // 2. push + bell, delivered by the app — the notification's link IS the challan PDF (update454)
      if (usePush) await notifyUsers({ userIds: recips.map(u => u.id), kind: "dc", requestId: dc.id, siteId: dc.site_id, link: doc.url,
        title: `Delivery at ${dc.site} — count before GRN (${dc.dc_ref})`, body: (msgFor(recips[0], doc).split("\n").slice(1, 3).join(" ").slice(0, 150) + " 📎 Tap to open the challan PDF.") });
      // 3. the record — written with the PDF path/link; the row's "Sent" tag comes from this
      const channel = useWa && usePush ? "whatsapp+push" : useWa ? "whatsapp" : "push";
      const r = await logDcSend(dc.id, recips.map(u => ({ id: u.id, name: u.full_name, mobile: u.mobile, lang: langOf(u) })), lang || (recips[0].preferred_lang || "hi"), channel, msgFor(recips[0], doc), doc);
      if (!r.ok) { setErr(r.error); return; }
      setDone({ channel, useWa });
      onSent && onSent();
    } finally { setBusy(false); setStage(""); }
  }

  // update454: phones that can share files — hand WhatsApp the actual PDF (the user picks the chat in the share sheet)
  const canShareFile = typeof navigator !== "undefined" && !!navigator.share && !!navigator.canShare && pdf?.blob && navigator.canShare({ files: [new File([pdf.blob], pdf.filename, { type: "application/pdf" })] });
  async function shareFile(u) {
    try {
      const file = new File([pdf.blob], pdf.filename, { type: "application/pdf" });
      await navigator.share({ files: [file], title: `Delivery challan ${dc.dc_ref}`, text: msgFor(u) });
    } catch (e) { if (e?.name !== "AbortError") setErr("Could not share the file: " + (e?.message || e)); }
  }

  const row = (u, def) => (
    <label key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, margin: "5px 0", fontSize: 13, cursor: "pointer", opacity: picked[u.id] ? 1 : 0.75 }}>
      <span><input type="checkbox" checked={!!picked[u.id]} onChange={e => setPicked(p => ({ ...p, [u.id]: e.target.checked }))} style={{ accentColor: "var(--copper)", marginRight: 8 }} />
        <b>{u.full_name}</b> · {String(u.role || "").replace(/_/g, " ")} · {u.mobile}</span>
      <span className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{def ? "allotted" : ""} · {LANG_LABEL[u.preferred_lang] || "हिन्दी (default)"}</span>
    </label>);

  return (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }}>
      <div onClick={e => e.stopPropagation()} className="panel" style={{ width: "min(960px,100%)", margin: 0, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>📨 Send challan to site supervisor</h2><button type="button" onClick={onClose}>✕</button>
        </div>
        <div className="muted" style={{ fontSize: 12.5, margin: "4px 0 12px" }}>{dc.dc_ref} · {dc.vendor} · {dc.site}{dc.po_no ? " · " + dc.po_no : ""} · {dc.lines.length} item(s)</div>
        {done ? (
          <div className="note" style={{ background: "#ECFDF5", border: "1px solid #6ee7b7", color: "#065f46" }}>
            <b>Recorded.</b> Sent to {recips.map(u => u.full_name).join(", ")} · {done.channel} · with the challan PDF {pdf?.url && <a href={pdf.url} target="_blank" rel="noreferrer">📎 open</a>}.
            {canShareFile && <div style={{ marginTop: 8 }}>Attach the PDF file itself (phone share sheet → WhatsApp):
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>{recips.map(u => <button key={u.id} type="button" onClick={() => shareFile(u)} style={{ fontSize: 12 }}>📎 Share file to {u.full_name}</button>)}</div></div>}
            {done.useWa && recips.length > 1 && <div style={{ marginTop: 8 }}>WhatsApp opens one chat at a time — open the rest:
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>{recips.slice(1).map(u => <a key={u.id} href={waLink(u.mobile, msgFor(u))} target="_blank" rel="noreferrer"><button type="button" style={{ fontSize: 12, background: "#25D366", color: "#fff", border: "none", borderRadius: 8 }}>💬 {u.full_name}</button></a>)}</div></div>}
            <div style={{ marginTop: 10 }}><button type="button" onClick={onClose}>Close</button></div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Recipients — supervisors allotted to <b>{dc.site}</b> in Workers &amp; Staff Master</div>
              {sup === null ? <div className="muted">Loading…</div> : sup.length === 0 ? (
                <div className="note amber" style={{ fontSize: 12.5 }}>⚠ No Supervisor / Site Incharge is allotted to {dc.site}. Pick someone below, and allot a supervisor in Workers &amp; Staff Master → Edit staff → sites so this fills itself next time.</div>
              ) : sup.map(u => row(u, true))}
              {others.length > 0 && <>
                <div className="muted" style={{ fontSize: 11.5, margin: "8px 0 2px" }}>Other staff on this site (optional)</div>
                {others.map(u => row(u, false))}</>}
              {!showAll ? <button type="button" style={{ fontSize: 11.5, marginTop: 6 }} onClick={() => { setShowAll(true); if (!all.length) getAllStaffForSend().then(setAll); }}>+ Someone else</button>
                : all.length > 0 && <>
                  <div className="muted" style={{ fontSize: 11.5, margin: "8px 0 2px" }}>All staff</div>
                  <div style={{ maxHeight: 180, overflowY: "auto" }}>{all.filter(u => !(sup || []).some(s => s.id === u.id) && !others.some(s => s.id === u.id)).map(u => row(u, false))}</div></>}
              <div style={{ marginTop: 12 }}><div className="muted" style={{ fontSize: 12 }}>Language</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {[[null, "Each person's own (profile)"], ["en", "English"], ["hi", "हिन्दी"], ["gu", "ગુજરાતી"]].map(([v, l]) => (
                    <button key={String(v)} type="button" onClick={() => setLang(v)} style={{ fontSize: 12, borderRadius: 999, borderColor: lang === v ? "var(--copper)" : undefined, color: lang === v ? "var(--copper)" : undefined, fontWeight: lang === v ? 800 : 500, background: lang === v ? "#fff4e5" : undefined }}>{l}</button>))}
                </div></div>
              <div style={{ marginTop: 12 }}><div className="muted" style={{ fontSize: 12 }}>Channel</div>
                <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 13 }}>
                  <label><input type="checkbox" checked={chan.whatsapp} onChange={e => setChan(c => ({ ...c, whatsapp: e.target.checked }))} style={{ accentColor: "var(--copper)" }} /> 💬 WhatsApp (opens with the message ready)</label>
                  <label><input type="checkbox" checked={chan.push} onChange={e => setChan(c => ({ ...c, push: e.target.checked }))} style={{ accentColor: "var(--copper)" }} /> 🔔 Push + in-app bell</label>
                </div></div>
              {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
              {busy && stage && <div className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>⏳ {stage}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <button type="button" disabled={busy || !recips.length || !chan.whatsapp} onClick={() => send("both")} style={{ background: "#25D366", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, opacity: !recips.length || !chan.whatsapp ? .5 : 1 }}>💬 Open WhatsApp &amp; send{chan.push ? " (+ push)" : ""}</button>
                <button type="button" disabled={busy || !recips.length} onClick={() => send("push")}>🔔 Push only</button>
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Message preview{preview ? ` — ${LANG_LABEL[langOf(preview)]} · to ${preview.full_name}` : ""}</div>
              <div style={{ background: "#e7ffdb", border: "1px solid #c7e9b4", borderRadius: 12, padding: "12px 14px", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", minHeight: 200 }}>
                {preview ? (pdf ? msgFor(preview) : msgFor(preview, { url: PREVIEW_URL })) : "Pick a recipient to see the message."}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Each recipient gets the message in their own language with their own name. Item names stay as in the Item Master. The 📎 link is created when you press send — it opens this challan&apos;s Delivery Note (PDF), exactly as Print / PDF shows it.</div>
              <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                <div className="muted" style={{ fontSize: 11, padding: "4px 8px", background: "#f7f7f7" }}>📄 Document that goes with the message (Delivery Note {dc.dc_ref})</div>
                <div style={{ maxHeight: 240, overflow: "auto", zoom: 0.6 }}><style>{DN_CSS}</style><div ref={docRef}><DnDoc note={noteFromChallan(dc, hsn)} /></div></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
