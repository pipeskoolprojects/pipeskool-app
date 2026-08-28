"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { todayLocal } from "@/lib/today";
import { getDigest, getHindranceRegister, reasonLabel } from "@/lib/dpr";
import { isDemo } from "@/lib/supabase";

export default function DPRPage() {
  const [lightbox, setLightbox] = useState(null);
  const [detail, setDetail] = useState(null);     // the DPR opened in the full-view modal
  const [date, setDate] = useState(() => todayLocal());
  const [digest, setDigest] = useState(null);

  useEffect(() => { getDigest(date).then(setDigest); }, [date]);

  async function exportHindrances() {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
    const rows = await getHindranceRegister(from, to);
    const head = "Date,Site,Hindrance,Hours lost,Description\n";
    const body = rows.map(r =>
      [r.date, r.site, reasonLabel(r.reason), r.hours, '"' + (r.desc || "").replace(/"/g, "'") + '"'].join(",")
    ).join("\n");
    const total = rows.reduce((s, r) => s + r.hours, 0);
    const blob = new Blob([head + body + `\nTOTAL,,,${total},`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Pipeskool_hindrance_register_${from}_to_${to}.csv`;
    a.click();
  }

  const photoCount = d => (Array.isArray(d.photos) ? d.photos.length : 0);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Daily progress — all sites</h1>
          <div className="filters">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            <button onClick={exportHindrances}>⬇ Hindrance register (30 days)</button>
            <button onClick={() => window.open("/dpr/report", "_blank")}>🖨 Weekly client report</button>
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — sample DPRs shown.</div>}

        {!digest ? <div className="muted">Loading…</div> : digest.length === 0 ? (
          <div className="panel"><span className="muted">No DPRs submitted for this date yet.</span></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 14, marginBottom: 20 }}>
            {digest.map(d => (
              <div className="panel dpr-card" key={d.site} onClick={() => setDetail(d)}
                style={{ marginBottom: 0, cursor: "pointer", transition: "border-color .15s, box-shadow .15s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h2 style={{ marginBottom: 0 }}>{d.site}</h2>
                  {d.status === "submitted"
                    ? <span className="badge p">Submitted</span>
                    : <span className="badge warn">Draft</span>}
                </div>
                <div className="muted" style={{ marginBottom: 10 }}>
                  {d.engineer}{d.engineer ? " · " : ""}Manpower {d.manpower} · 📷 {photoCount(d)} photos · {d.work.length} {d.work.length === 1 ? "activity" : "activities"}
                </div>
                {d.work.slice(0, 2).map((w, i) => (
                  <div key={i} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                    <b>{w.activity}</b> — {w.qty}{w.unit ? " " + w.unit : ""}{w.loc && <span className="muted"> — {w.loc}</span>}
                  </div>
                ))}
                {d.work.length > 2 && <div className="muted" style={{ fontSize: 12.5, padding: "5px 0" }}>+ {d.work.length - 2} more…</div>}
                {d.hindrances.length > 0 && (
                  <div style={{ fontSize: 12.5, color: "var(--red)", padding: "5px 0" }}>
                    ⚠ {d.hindrances.length} hindrance{d.hindrances.length > 1 ? "s" : ""} logged
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--copper-deep)", fontWeight: 600 }}>
                  Open full report →
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- full DPR detail modal ---- */}
        {detail && (
          <div onClick={() => setDetail(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 90, padding: "40px 16px", overflowY: "auto" }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "var(--vapor, #fff)", borderRadius: 14, maxWidth: 720, width: "100%", padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div>
                  <h2 style={{ marginBottom: 4 }}>{detail.site}</h2>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {date}{detail.engineer ? " · " + detail.engineer : ""} · Manpower {detail.manpower}
                  </div>
                </div>
                <button onClick={() => setDetail(null)} style={{ fontSize: 18, lineHeight: 1, padding: "2px 10px" }}>✕</button>
              </div>
              <div style={{ margin: "6px 0 16px" }}>
                {detail.status === "submitted"
                  ? <span className="badge p">Submitted</span>
                  : <span className="badge warn">Draft</span>}
              </div>

              <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Work done</h3>
              {detail.work.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No work lines.</div> :
                detail.work.map((w, i) => (
                  <div key={i} style={{ fontSize: 13.5, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                    <b>{w.activity}</b> — {w.qty}{w.unit ? " " + w.unit : ""}{w.loc && <span className="muted"> — {w.loc}</span>}
                  </div>
                ))}

              {detail.hindrances.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>Hindrances</h3>
                  {detail.hindrances.map((h, i) => (
                    <div key={i} style={{ fontSize: 13, color: "var(--red)", padding: "5px 0" }}>
                      ⚠ {reasonLabel(h.reason)} — {h.hours}h lost{h.desc ? ". " + h.desc : ""}
                    </div>
                  ))}
                </>
              )}

              <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>Site photos ({photoCount(detail)})</h3>
              {photoCount(detail) === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>No photos saved with this DPR.</div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {detail.photos.map((p, i) => p.url && (
                    <div key={i}>
                      <img src={p.url} alt={p.caption || "site photo"} onClick={() => setLightbox(p.url)}
                        style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", cursor: "zoom-in" }} />
                      {p.caption && <div className="muted" style={{ fontSize: 11, maxWidth: 110, marginTop: 2 }}>{p.caption}</div>}
                    </div>
                  ))}
                </div>
              )}

              {detail.plan && <div className="muted" style={{ marginTop: 16, fontSize: 13.5 }}>→ Tomorrow: {detail.plan}</div>}
            </div>
          </div>
        )}

        {/* ---- photo lightbox (sits above the modal) ---- */}
        {lightbox && (
          <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, cursor: "zoom-out" }}>
            <img src={lightbox} alt="enlarged" style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 8 }} />
          </div>
        )}
      </main>
    </div>
  );
}
