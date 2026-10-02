"use client";
// update450: BLANK LETTERHEAD — the company header + footer on every page, body empty, for hand-written
// notes. ?pages=1|2|5. Print → Save as PDF like every other document.
import { useEffect, useState } from "react";
import { Letterhead, LetterFoot, letterheadCss } from "@/components/Letterhead";
import { getCompany } from "@/lib/letters";

export default function BlankLetterhead() {
  const [c, setC] = useState(null); const [err, setErr] = useState(""); const [pages, setPages] = useState(1);
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("pages") || 1);
    setPages([1, 2, 5].includes(n) ? n : 1);
    getCompany().then(setC).catch(e => setErr(e.message));
  }, []);
  if (err) return <div style={{ padding: 24 }}><div className="error">{err}</div></div>;
  if (!c) return <div style={{ padding: 24 }} className="muted">Loading…</div>;
  return (
    <div style={{ background: "#fff", color: "#111", fontFamily: "Inter, Arial, sans-serif" }}>
      <style>{letterheadCss + `
        .bl-page { height: 262mm; padding: 0; position: relative; overflow: hidden; }
        .bl-page .lh-foot { position: absolute; bottom: 0; left: 0; right: 0; }   /* per-page footer, never the fixed one */
        @media screen { .bl-page { max-width: 820px; margin: 0 auto 18px; padding: 28px; border: 1px solid #e5e7eb; box-shadow: 0 4px 14px rgba(0,0,0,0.06); } }
      `}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, padding: "14px 20px", alignItems: "center", flexWrap: "wrap", maxWidth: 820, margin: "0 auto" }}>
        <button className="primary" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <span className="muted" style={{ fontSize: 12 }}>Blank letterhead ·</span>
        {[1, 2, 5].map(n => <button key={n} onClick={() => { setPages(n); window.history.replaceState(null, "", "?pages=" + n); }} style={{ fontSize: 12, fontWeight: pages === n ? 800 : 400, borderColor: pages === n ? "var(--copper)" : undefined }}>{n} page{n > 1 ? "s" : ""}</button>)}
        <button onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/letters"); }}>← Back</button>
      </div>
      {Array.from({ length: pages }, (_, i) => (
        <div key={i} className="bl-page lh-page">
          <Letterhead company={c} />
          <LetterFoot company={c} right={`Page ${i + 1} of ${pages}`} />
        </div>
      ))}
    </div>
  );
}
