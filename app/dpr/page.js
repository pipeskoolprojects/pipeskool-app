"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getDigest, getProgress, getHindranceRegister, reasonLabel } from "@/lib/dpr";
import { isDemo } from "@/lib/supabase";

export default function DPRPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [digest, setDigest] = useState(null);
  const [progress, setProgress] = useState([]);

  useEffect(() => { getDigest(date).then(setDigest); }, [date]);
  useEffect(() => { getProgress().then(setProgress); }, []);

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
              <div className="panel" key={d.site} style={{ marginBottom: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h2 style={{ marginBottom: 0 }}>{d.site}</h2>
                  {d.status === "submitted"
                    ? <span className="badge p">Submitted</span>
                    : <span className="badge warn">Draft</span>}
                </div>
                <div className="muted" style={{ marginBottom: 10 }}>
                  {d.engineer} · Manpower {d.manpower} · 📷 {d.photos} photos
                </div>
                {d.work.map((w, i) => (
                  <div key={i} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                    <b>{w.qty} {w.unit}</b> — {w.activity}
                    {w.loc && <span className="muted"> · {w.loc}</span>}
                  </div>
                ))}
                {d.hindrances.map((h, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: "var(--red)", padding: "5px 0" }}>
                    ⚠ {reasonLabel(h.reason)} — {h.hours}h lost. {h.desc}
                  </div>
                ))}
                {d.plan && <div className="muted" style={{ marginTop: 8 }}>→ Tomorrow: {d.plan}</div>}
              </div>
            ))}
          </div>
        )}

        <div className="panel">
          <h2>Progress vs BOQ &amp; productivity</h2>
          <table>
            <thead>
              <tr>
                <th>Site</th><th>Activity</th>
                <th className="num">BOQ qty</th><th className="num">Done</th>
                <th style={{ width: "20%" }}>% complete</th>
                <th className="num">Qty / manday</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((r, i) => {
                const pct = r.boq ? Math.min(100, Math.round((r.done / r.boq) * 100)) : 0;
                const prod = r.manDays ? (r.done / r.manDays).toFixed(2) : "—";
                return (
                  <tr key={i}>
                    <td><span className="badge gray">{r.site}</span></td>
                    <td style={{ fontWeight: 600 }}>{r.description}</td>
                    <td className="num">{r.boq.toLocaleString("en-IN")} {r.unit}</td>
                    <td className="num">{r.done.toLocaleString("en-IN")}</td>
                    <td>
                      <div className="bar-track"><div className="bar-fill"
                        style={{ width: pct + "%", background: pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--blue)" : "var(--amber)" }} /></div>
                      <div className="muted" style={{ marginTop: 3 }}>{pct}%</div>
                    </td>
                    <td className="num">{prod}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted" style={{ marginTop: 10 }}>
            Qty/manday compares the same activity across sites — a low number means
            investigate: front availability, supervision, or gang composition.
          </div>
        </div>
      </main>
    </div>
  );
}
