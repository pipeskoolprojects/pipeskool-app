"use client";
import { getSession } from "@/lib/auth";
import { useEffect, useState, Suspense } from "react";
import { getCompanyGstin } from "@/lib/data";   // update300
import { useSearchParams } from "next/navigation";
import { getPODetail, getPOProofs } from "@/lib/procure";
import { getPOItemStatus, LINE_STATUS } from "@/lib/pending";

function POView() {
  const params = useSearchParams();
  const poId = params.get("po");
  const [po, setPo] = useState(null);
  const [gstin, setGstin] = useState("");   // update300: the real saved GSTIN — never a mask
  useEffect(() => { getCompanyGstin().then(setGstin); }, []);
  const [loading, setLoading] = useState(true);
  const [proofs, setProofs] = useState({ indentId: null, proofs: [] });   // update254: rate-comparison reference
  const [recv, setRecv] = useState([]);   // update256: per-line ordered / received / pending
  const [sending, setSending] = useState(false); const [sendMsg, setSendMsg] = useState("");   // update390

  // update390: the browser's PDF header/filename comes from document.title — make it the PO,
  // not the app name. Restored on leave so the rest of the app is untouched.
  useEffect(() => {
    if (!po?.po_no) return;
    const prev = document.title;
    document.title = `PO ${po.po_no} · ${po.date}`;
    return () => { document.title = prev; };
  }, [po?.po_no, po?.date]);

  // update390: SEND PO — the same document rendered to an A4 PDF in the browser and handed to
  // the phone / OS share sheet (WhatsApp, mail, Drive…). No download step. Where the browser
  // cannot share files (most desktops), the PDF is saved instead and the user is told so.
  async function sendPo() {
    setSending(true); setSendMsg("");
    try {
      const el = document.querySelector(".po-doc");
      const html2pdf = (await import("html2pdf.js")).default;
      const fname = "PO_" + String(po.po_no).replace(/[^A-Za-z0-9]+/g, "-") + ".pdf";
      document.body.classList.add("po-rendering");
      let blob;
      try {
        blob = await html2pdf().set({
          margin: [12, 12, 14, 12], filename: fname,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff",
                         ignoreElements: n => n.classList && (n.classList.contains("no-print") || n.classList.contains("po-back")) },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".po-keep"] },
        }).from(el).outputPdf("blob");
      } finally { document.body.classList.remove("po-rendering"); }
      const file = new File([blob], fname, { type: "application/pdf" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `PO ${po.po_no}`, text: `Purchase Order ${po.po_no} dated ${po.date} — Pipeskool Projects Pvt. Ltd.` });
        setSendMsg("Shared.");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        setSendMsg("This browser cannot share files directly — the PDF was saved as " + fname + ". Attach it from your Downloads.");
      }
    } catch (e) {
      if (e && e.name === "AbortError") setSendMsg("");           // user closed the share sheet
      else setSendMsg("Could not create the PDF: " + (e?.message || e));
    }
    setSending(false);
  }

  useEffect(() => {
    if (!poId) { setLoading(false); return; }
    getPODetail(poId).then(d => { setPo(d); setLoading(false); });
    // update254: the rate-comparison proof is a SEPARATE document. We only look it up so the
    // Director preview can offer a link to it — nothing about the PO body changes.
    getPOProofs(poId).then(setProofs).catch(() => setProofs({ indentId: null, proofs: [] }));
    // update256: delivery status per line, derived from GRNs. Screen only — the printed PO
    // is the commercial document and must not change.
    getPOItemStatus(poId).then(setRecv).catch(() => setRecv([]));
  }, [poId]);

  // update241: was a require() swallowed by try/catch — a throw silently hid the control
  const isApprover = (typeof window !== "undefined" && getSession()?.role === "director");
  const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading PO…</div>;

  const draftReview = po && po.approval === "pending" && isApprover;   // update221: approver reviews drafts
  if (po && po.approval && po.approval !== "approved" && !draftReview) return (

    <div style={{ maxWidth: 560, margin: "60px auto", textAlign: "center", fontFamily: "system-ui" }}>

      <h2>{po.approval === "rejected" ? "❌ PO rejected" : "⏳ Waiting for Director approval"}</h2>

      <p style={{ color: "#666" }}>{po.po_no} cannot be issued or downloaded {po.approval === "rejected" ? "— it was rejected" + (po.approved_by ? " by " + po.approved_by : "") + "." : "until a Director approves it. Ask a Director to open Procurement → PO list → ✓ Approve."}</p>

    </div>);
  if (!po) return <div style={{ padding: 40, textAlign: "center" }}>PO not found. Open this from Procurement → Purchase orders → View/Print.</div>;

  const items = po.items || [];
  // update178: per-line GST — tax summarised per rate bracket
  const items178 = po.items || [];
  const subtotal = items178.reduce((s, i) => s + i.qty * i.rate, 0);
  const byGst = {};
  items178.forEach(i => { const g = Number(i.gst_pct ?? 18); byGst[g] = (byGst[g] || 0) + i.qty * i.rate; });
  const gst = Object.entries(byGst).reduce((s, [g, base]) => s + Math.round(base * Number(g) / 100), 0);
  const total = subtotal + gst;

  return (
    <div className="po-doc" style={{ maxWidth: 820, margin: "0 auto", padding: 36, background: "#fff", color: "#111", fontFamily: "Newsreader, Georgia, serif" }}>
      {/* update265: phone-fit rules (screen only — print/A4 untouched) + a Back control for the
          installed app, where this document opens in the same window from Approvals. */}
      <style>{`
        @media screen and (max-width: 640px) {
          .po-doc { padding: 14px 10px !important; }
          .po-doc table { font-size: 11px !important; }
          .po-doc table th, .po-doc table td { padding: 4px 3px !important; }
          .po-doc .po-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .po-doc .po-wm { font-size: 34px !important; letter-spacing: 2px !important; color: rgba(220,38,38,0.07) !important; }
          .po-doc .po-back { display: inline-flex !important; }
        }
        @media print { .po-doc .po-back { display: none !important; } }
        /* update390: A4, print-ready — no browser header/footer (they live in the page margin,
           which is 0), the document carries its own margin instead */
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .po-doc { max-width: none !important; margin: 0 !important; padding: 14mm 14mm 16mm !important; }
          .po-doc table tr { page-break-inside: avoid; }
        }
        body.po-rendering .po-doc .po-wm { display: none; }
      `}</style>
      <button type="button" className="po-back" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/m/approvals"); }}
        style={{ display: "none", alignItems: "center", gap: 6, marginBottom: 10, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", fontSize: 13 }}>← Back to approvals</button>
      {draftReview && (<>
        {/* update221: DRAFT watermark + banner — approver's review copy of an unapproved PO */}
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 5 }}>
          <div className="po-wm" style={{ transform: "rotate(-30deg)", fontSize: 92, fontWeight: 900, color: "rgba(220,38,38,0.10)", letterSpacing: 6, whiteSpace: "nowrap" }}>DRAFT — NOT APPROVED</div>
        </div>
        <div style={{ background: "#fff7ed", border: "1.5px solid #f59e0b", color: "#92400e", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          ⚠ DRAFT — NOT YET APPROVED. Review copy for the approving Director; not valid for issue to vendor.</div>
      </>)}
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "3px solid #FF7A1A", paddingBottom: 14 }}>
        <div>
          <svg width="46" height="5" viewBox="0 0 46 5" style={{ display: "block", marginBottom: 7 }}>
            <rect x="0" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
            <rect x="16.5" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
            <rect x="33" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
          </svg>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0F1419", letterSpacing: "-0.02em" }}>PIPESKOOL PROJECTS PVT. LTD.</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Specialist Plumbing &amp; Piping Contractors</div>
          <div style={{ fontSize: 11.5, color: "#555" }}>Ahmedabad, Gujarat{gstin ? ` · GSTIN: ${gstin}` : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>PURCHASE ORDER</div>
          <div style={{ fontSize: 12 }}>PO No: <b>{po.po_no}</b></div>
          <div style={{ fontSize: 12 }}>Date: {po.date}</div>
          {po.status === "cancelled" && <div style={{ color: "#b91c1c", fontWeight: 700, marginTop: 4 }}>CANCELLED</div>}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", margin: "18px 0", fontSize: 12.5 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Vendor</div>
          {po.vendor.name}<br />
          {po.vendor.contact && <>{po.vendor.contact} · </>}{po.vendor.phone}<br />
          {po.vendor.gstin && <>GSTIN: {po.vendor.gstin}</>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Deliver to</div>
          {po.site} Site{po.site_address && <><br />{po.site_address}</>}<br />
          Pipeskool Site Store
        </div>
      </div>

      <div className="po-scroll">{/* update265 */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: "#FEF2EC" }}>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "left" }}>Sr No</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "left" }}>Description</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Qty</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px" }}>Unit</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Rate</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Disc %</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Net Rate</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>GST %</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px" }}>{i + 1}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px" }}>{it.item_name}{it.spec ? " — " + it.spec : ""}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{it.qty}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px" }}>{it.unit}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{it.list_rate != null ? inr(it.list_rate) : inr(it.rate)}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{it.discount_pct ? it.discount_pct + "%" : "—"}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{inr(it.rate)}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{Number(it.gst_pct ?? 18)}%</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{inr(it.qty * it.rate)}</td>
            </tr>
          ))}
          <tr><td colSpan="8" style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Subtotal (net)</td><td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{inr(subtotal)}</td></tr>
          {Object.entries(byGst).sort((a, b) => Number(a[0]) - Number(b[0])).map(([g, base]) => (
            <tr key={g}><td colSpan="8" style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>GST @ {g}% (on {inr(base)})</td><td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{inr(Math.round(base * Number(g) / 100))}</td></tr>
          ))}
          <tr style={{ background: "#FEF2EC", fontWeight: 700 }}><td colSpan="8" style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Total</td><td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{inr(total)}</td></tr>
        </tbody>
      </table>
      </div>{/* /po-scroll (update265) */}

      <div style={{ marginTop: 18, fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Terms &amp; Conditions</div>
        1. Material to be supplied as per approved make and specifications.<br />
        2. Delivery at site within agreed lead time; delays may attract penalty.<br />
        3. Material subject to inspection &amp; testing at site; rejected material to be replaced at vendor cost.<br />
        4. Payment as per agreed terms against GST-compliant invoice and delivery challan.<br />
        5. This PO is governed by Pipeskool standard procurement terms.
      </div>

      <div style={{ marginTop: 50, textAlign: "right", fontSize: 12.5 }}>
        For Pipeskool Projects Pvt. Ltd.
        {po.approved_by && <div style={{ fontSize: 11, color: "#555" }}>Approved by {po.approved_by}{po.approved_at ? " on " + po.approved_at : ""}</div>}
        <div style={{ marginTop: 40, borderTop: "1px solid #999", display: "inline-block", paddingTop: 4 }}>Authorised Signatory</div>
      </div>

      {/* update254: rate-comparison proof, opened as its own document. Screen only, so the
          printed PO is byte-for-byte what it always was. */}
      {/* update255: always shown when the PO came from an indent. Previously this whole block
          disappeared when the count was 0, so "no proof attached" and "the lookup failed"
          looked identical and an uploaded proof seemed to vanish. */}
      {proofs.indentId && (
        <div className="no-print" style={{ textAlign: "center", marginTop: 18, fontSize: 12.5 }}>
          <a href={"/purchase/rate-proof?indent=" + proofs.indentId} target="_blank" rel="noreferrer"
             style={{ fontWeight: 700, color: proofs.proofs?.length ? "#a4551f" : "#6b7280",
               border: "1px solid " + (proofs.proofs?.length ? "#a4551f" : "#c9d0d8"), borderRadius: 8,
               padding: "6px 12px", textDecoration: "none" }}>
            📎 Rate comparison proof ({proofs.proofs?.length || 0}) — opens separately
          </a>
          <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>
            {proofs.proofs?.length
              ? "Reference only · not part of this purchase order"
              : "No proof attached to this indent yet"}
          </div>
        </div>
      )}

      {/* update256: what is still outstanding on this PO. Hidden from print. */}
      {recv.length > 0 && recv.some(r => Number(r.pending_qty) > 0 || Number(r.excess_qty) > 0) && (
        <div className="no-print" style={{ maxWidth: 860, margin: "20px auto 0", border: "1px solid #e2d2c5", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: "#a4551f" }}>Delivery status — what is still outstanding</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ textAlign: "left", color: "#6b7280" }}>
              <th style={{ padding: "4px 6px" }}>Item</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Ordered</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Received</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Pending</th>
              <th style={{ padding: "4px 6px" }}>Status</th>
            </tr></thead>
            <tbody>
              {recv.map(r => {
                const st = LINE_STATUS[r.line_status] || [r.line_status, "gray"];
                const pend = Number(r.pending_qty), exc = Number(r.excess_qty);
                return (
                  <tr key={r.po_item_id} style={{ borderTop: "1px solid #f1e7de" }}>
                    <td style={{ padding: "5px 6px" }}>{r.item_name}</td>
                    <td style={{ padding: "5px 6px", textAlign: "right" }}>{Number(r.ordered_qty)} {r.unit}</td>
                    <td style={{ padding: "5px 6px", textAlign: "right" }}>{Number(r.received_qty)} {r.unit}</td>
                    <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700,
                      color: exc > 0 ? "#a4551f" : pend > 0 ? "#b91c1c" : "#15803d" }}>
                      {exc > 0 ? "+" + exc : pend} {r.unit}</td>
                    <td style={{ padding: "5px 6px" }}><span className={"badge " + st[1]}>{st[0]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 11.5 }}>
            <a href="/procure/pending" target="_blank" rel="noreferrer" style={{ color: "#a4551f", fontWeight: 700 }}>
              Open the Pending deliveries register →</a>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 26, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }} className="no-print">
        <button onClick={() => window.print()} style={{ padding: "10px 22px", fontSize: 14, background: "#fff", color: "#0F1419", border: "1.5px solid #0F1419", borderRadius: 8, cursor: "pointer" }}>🖨 Print / Save as PDF</button>
        {!draftReview && (
          <button onClick={sendPo} disabled={sending} style={{ padding: "10px 22px", fontSize: 14, background: "#FF7A1A", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: sending ? .6 : 1 }}>
            {sending ? "Preparing PDF…" : "📤 Send PO"}</button>
        )}
      </div>
      {sendMsg && <div className="no-print" style={{ textAlign: "center", marginTop: 8, fontSize: 12.5, color: "#555" }}>{sendMsg}</div>}
      <style>{`@media print { .no-print { display: none; } }`}</style>
    </div>
  );
}

export default function POGenerator() {
  return <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}><POView /></Suspense>;
}
