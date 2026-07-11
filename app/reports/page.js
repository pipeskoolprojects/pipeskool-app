"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getDirectorReport, inr } from "@/lib/reports";
import { isDemo } from "@/lib/supabase";

// simple dependency-free bar chart
function Bars({ data, format = v => v, color = "var(--copper)" }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {data.map(d => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr 90px", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.label}</div>
          <div style={{ background: "var(--bg)", borderRadius: 6, height: 22 }}>
            <div style={{ width: Math.max((d.value / max) * 100, d.value ? 2 : 0) + "%", background: color, height: "100%", borderRadius: 6, transition: "width .4s" }} />
          </div>
          <div style={{ fontSize: 12.5, textAlign: "right", fontWeight: 700 }}>{format(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

function TrendLine({ points }) {
  const w = 560, h = 120, pad = 24;
  const max = Math.max(...points.map(p => p.value), 1);
  const xy = points.map((p, i) => [pad + i * ((w - 2 * pad) / Math.max(points.length - 1, 1)), h - pad - (p.value / max) * (h - 2 * pad)]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: 640 }}>
      <polyline fill="none" stroke="var(--copper)" strokeWidth="2.5" points={xy.map(p => p.join(",")).join(" ")} />
      {xy.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="3.5" fill="var(--copper)" />
          <text x={p[0]} y={h - 6} textAnchor="middle" fontSize="10" fill="#888">{points[i].date}</text>
          <text x={p[0]} y={p[1] - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill="#333">{points[i].value}</text>
        </g>
      ))}
    </svg>
  );
}

export default function ReportsPage() {
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getDirectorReport().then(d => { setR(d); setLoading(false); }); }, []);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Site reports — all sites</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — reports need a live database.</div>}
        {loading ? <div className="muted">Loading report…</div> : !r ? <div className="muted">No data.</div> : (
          <>
            {/* company snapshot */}
            <div className="cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
              {[["Manpower today", r.totals.strength], ["DPR submitted", r.totals.dprDone + " / " + r.sites.length],
                ["OT today", r.totals.ot.toFixed(1) + " h"], ["Open indents", r.totals.indents],
                ["Deliveries in transit", r.totals.deliveries], ["Expenses this month", inr(r.totals.expenses)]].map(([l, v]) => (
                <div key={l} className="panel" style={{ margin: 0, padding: "12px 14px" }}>
                  <div className="muted" style={{ fontSize: 11 }}>{l}</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div>
                </div>
              ))}
            </div>

            <div className="panel">
              <h2>Manpower today — site-wise</h2>
              <Bars data={r.sites.map(s => ({ label: s.name.split(",")[0], value: s.strength }))} />
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>{r.sites.map(s => `${s.name.split(",")[0]}: P ${s.present} · ½ ${s.half} · on-site ${s.onsite} · proxy ${s.proxy}`).join("   |   ")}</div>
            </div>

            <div className="panel">
              <h2>Manpower trend — last 7 days (all sites)</h2>
              <TrendLine points={r.trend} />
            </div>

            <div className="panel">
              <h2>Expenses this month — site-wise</h2>
              <Bars data={r.sites.map(s => ({ label: s.name.split(",")[0], value: s.expenses }))} format={inr} />
            </div>

            <div className="panel">
              <h2>BOQ progress (from RA bills)</h2>
              <Bars data={r.sites.map(s => ({ label: s.name.split(",")[0], value: s.boqPct }))} format={v => v + "%"} color="#1a7f4f" />
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Progress moves when RA bills are saved in Commercial → RA Billing.</div>
            </div>

            <div className="panel">
              <h2>Operations status today</h2>
              <table>
                <thead><tr><th>Site</th><th>DPR</th><th className="num">Open indents</th><th className="num">Deliveries in transit</th><th>Next expected</th></tr></thead>
                <tbody>
                  {r.sites.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td>{s.dpr === "submitted" ? <span className="badge p">Submitted</span> : s.dpr === "draft" ? <span className="badge h">Draft</span> : <span className="badge a">Missing</span>}</td>
                      <td className="num">{s.indents}</td>
                      <td className="num">{s.deliveries}</td>
                      <td className="muted">{s.nextDelivery || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
