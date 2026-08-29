"use client";
import { getSession } from "@/lib/auth";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getPODetail, getPOProofs } from "@/lib/procure";

function POView() {
  const params = useSearchParams();
  const poId = params.get("po");
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [proofs, setProofs] = useState({ indentId: null, proofs: [] });   // update254: rate-comparison reference

  useEffect(() => {
    if (!poId) { setLoading(false); return; }
    getPODetail(poId).then(d => { setPo(d); setLoading(false); });
    // update254: the rate-comparison proof is a SEPARATE document. We only look it up so the
    // Director preview can offer a link to it — nothing about the PO body changes.
    getPOProofs(poId).then(setProofs).catch(() => setProofs({ indentId: null, proofs: [] }));
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
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 36, background: "#fff", color: "#111", fontFamily: "Newsreader, Georgia, serif" }}>
      {draftReview && (<>
        {/* update221: DRAFT watermark + banner — approver's review copy of an unapproved PO */}
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 5 }}>
          <div style={{ transform: "rotate(-30deg)", fontSize: 92, fontWeight: 900, color: "rgba(220,38,38,0.13)", letterSpacing: 6, whiteSpace: "nowrap" }}>DRAFT — NOT APPROVED</div>
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
          <div style={{ fontSize: 11.5, color: "#555" }}>Ahmedabad, Gujarat · GSTIN: 24XXXXXXXXXXXZX</div>
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

      <div style={{ textAlign: "center", marginTop: 26 }} className="no-print">
        <button onClick={() => window.print()} style={{ padding: "10px 22px", fontSize: 14, background: "#FF7A1A", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>🖨 Print / Save as PDF</button>
      </div>
      <style>{`@media print { .no-print { display: none; } }`}</style>
    </div>
  );
}

export default function POGenerator() {
  return <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}><POView /></Suspense>;
}
