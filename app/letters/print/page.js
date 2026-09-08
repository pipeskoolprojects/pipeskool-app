"use client";
// update329: LETTER PRINT — the same pattern as every other Pipeskool document
// (/wages/print, PO, vouchers): a letterhead page, then Print -> Save as PDF, which
// works on Android through the share sheet and needs no PDF library.
//
// THE ONE RULE THIS PAGE ENFORCES: it prints letters.rendered_body and nothing else.
// It never re-renders from the template or the current company rules — an issued
// letter reproduces exactly what was signed, however the rules have changed since.
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { getLetter, getCompany, fmtDate } from "@/lib/letters";

export default function LetterPrint() {
  const [l, setL] = useState(null);
  const [c, setC] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id) { setErr("No letter selected."); return; }
        const [row, comp] = await Promise.all([getLetter(id), getCompany()]);
        if (!row) { setErr("That letter was not found, or you do not have rights to open it."); return; }
        setL(row); setC(comp);
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  if (err) return <div style={{ padding: 24 }}><div className="error" style={{ whiteSpace: "pre-wrap" }}>{err}</div></div>;
  if (!l || !c) return <div style={{ padding: 24 }} className="muted">Loading…</div>;

  const cancelled = l.status === "cancelled";
  const byEmployee = /DECLARATION|WHOMSOEVER/i.test(l.heading) && /^I, /m.test(l.rendered_body);

  return (
    <div className="lt-doc" style={{ maxWidth: 820, margin: "0 auto", padding: 28, background: "#fff", color: "#111", fontFamily: "Inter, Arial, sans-serif", position: "relative", minHeight: "100vh" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          @page { size: A4; margin: 14mm; }
        }
        @media screen and (max-width: 640px) { .lt-doc { padding: 12px !important; } }
        .lt-wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
                 font-size: 78px; font-weight: 800; color: rgba(220,38,38,0.10);
                 transform: rotate(-30deg); pointer-events: none; z-index: 5; letter-spacing: 0.05em; }
      `}</style>

      {cancelled && <div className="lt-wm">CANCELLED</div>}

      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="primary" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <button onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/letters"); }}>← Back</button>
      </div>

      {cancelled && (
        <div className="no-print" style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12.5 }}>
          This letter was cancelled{l.cancel_reason ? ` — ${l.cancel_reason}` : ""}. It is not valid.
        </div>
      )}

      {/* -------- letterhead -------- */}
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", borderBottom: "3px solid #FF7A1A", paddingBottom: 10 }}>
        <div style={{ border: "1px solid #d7dbe0", borderRadius: 4, padding: "10px 14px", background: "#f7f8f9" }}>
          <Logo height={26} color="#FF7A1A" wordColor="#0F1419" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 19, color: "#1f2a4b", letterSpacing: "-0.01em" }}>{c.name}</div>
          <div style={{ fontSize: 11.5, color: "#6b7280", fontStyle: "italic", lineHeight: 1.5, marginTop: 2 }}>{c.address}</div>
        </div>
      </div>

      {/* -------- heading -------- */}
      <div style={{ textAlign: "center", margin: "22px 0 6px" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1f2a4b", letterSpacing: "0.02em" }}>{l.heading}</div>
      </div>
      <div style={{ borderBottom: "1.5px solid #b8860b", marginBottom: 20 }} />

      {/* -------- the frozen body -------- */}
      <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.85, position: "relative", zIndex: 6 }}>
        {l.rendered_body}
      </div>

      {/* -------- signatures -------- */}
      {!byEmployee && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 40, marginTop: 46, fontSize: 12.5 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#1f2a4b", marginBottom: 40 }}>For, {c.name.replace(/PVT LTD\.?$/i, "Private Limited")}</div>
            <div style={{ borderTop: "1px solid #333", width: 210, paddingTop: 4, fontStyle: "italic", color: "#374151" }}>
              {c.signatory_name ? <><b style={{ fontStyle: "normal" }}>{c.signatory_name}</b><br /></> : null}
              {c.signatory_title || "Authorized Signatory"}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#1f2a4b", marginBottom: 40 }}>Accepted</div>
            <div style={{ borderTop: "1px solid #333", width: 210, paddingTop: 4, fontStyle: "italic", color: "#374151" }}>
              {l.subject_name}<br />Employee Signature
            </div>
          </div>
        </div>
      )}

      {/* -------- footer -------- */}
      <div style={{ marginTop: 46, paddingTop: 8, borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 9.5, fontWeight: 700, color: "#4b5563", lineHeight: 1.7 }}>
        <div>CIN No: {c.cin} &nbsp; GSTIN: {c.gstin}</div>
        <div>Email ID: {c.email}</div>
        <div style={{ fontWeight: 400, color: "#9ca3af", marginTop: 4 }}>
          {l.letter_no} · issued {fmtDate(l.issue_date)}{l.created_by_name ? ` by ${l.created_by_name}` : ""}
        </div>
      </div>
    </div>
  );
}
