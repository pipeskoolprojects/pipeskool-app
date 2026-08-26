"use client";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getDirectorReport, inr } from "@/lib/reports";
import { isDemo } from "@/lib/supabase";

const COL = { present: "#1a7f4f", half: "#e0a400", onsite: "#8a96a0", proxy: "#FF7A1A" };
const DELIV_LABEL = { pending: "Awaiting", confirmed: "Confirmed", delayed: "Delayed", dispatched: "Out for delivery", delivered: "Delivered" };

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="panel" style={{ margin: 0, padding: "14px 16px", borderTop: `3px solid ${accent || "var(--copper)"}` }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11.5 }}>{sub}</div>}
    </div>
  );
}

function StackBar({ s, max }) {
  const total = s.strength || 0; const w = v => total ? (v / Math.max(max, 1)) * 100 : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 60px", gap: 10, alignItems: "center" }}>
      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.short}</div>
      <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", background: "var(--bg)" }}>
        <div title={`Present ${s.present}`} style={{ width: w(s.present) + "%", background: COL.present }} />
        <div title={`Half ${s.half}`} style={{ width: w(s.half) + "%", background: COL.half }} />
        <div title={`On-site ${s.onsite}`} style={{ width: w(s.onsite) + "%", background: COL.onsite }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, textAlign: "right" }}>{total}{s.proxy ? <span style={{ color: COL.proxy, fontSize: 10.5 }}> ⚠{s.proxy}</span> : null}</div>
    </div>
  );
}

function Donut({ pct, label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ width: 110, height: 110, borderRadius: "50%", margin: "0 auto",
        background: `conic-gradient(#1a7f4f ${pct * 3.6}deg, #e8e8e2 0deg)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 78, height: 78, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{pct}%</div>
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 6 }}>{label}</div>
      <div className="muted" style={{ fontSize: 11 }}>{value}</div>
    </div>
  );
}

function Area({ points }) {
  const w = 640, h = 150, pad = 26;
  const max = Math.max(...points.map(p => p.total), 1);
  const step = (w - 2 * pad) / Math.max(points.length - 1, 1);
  const xy = points.map((p, i) => [pad + i * step, h - pad - (p.total / max) * (h - 2 * pad)]);
  const line = xy.map(p => p.join(",")).join(" ");
  const area = `${pad},${h - pad} ` + line + ` ${pad + (points.length - 1) * step},${h - pad}`;
  const every = points.length > 10 ? Math.ceil(points.length / 10) : 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%" }}>
      <polygon points={area} fill="rgba(255,122,26,0.12)" />
      <polyline fill="none" stroke="var(--copper)" strokeWidth="2.5" points={line} />
      {xy.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="3" fill="var(--copper)" />
          {i % every === 0 && <text x={p[0]} y={h - 8} textAnchor="middle" fontSize="9.5" fill="#888">{points[i].date}</text>}
          <text x={p[0]} y={p[1] - 7} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#333">{points[i].total || ""}</text>
        </g>
      ))}
    </svg>
  );
}

export default function ReportsPage() {
  const [days, setDays] = useState(7);
  const [siteId, setSiteId] = useState("all");
  useEffect(() => {   // update207: project scoping
    try { const sp = new URLSearchParams(window.location.search).get("site"); if (sp) setSiteId(String(sp)); } catch {}
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); getDirectorReport(days).then(d => { setR(d); setLoading(false); }); }, [days]);

  const view = useMemo(() => {
    if (!r) return null;
    const sites = siteId === "all" ? r.sites : r.sites.filter(s => String(s.id) === String(siteId));
    const T = sites.reduce((x, s) => ({
      strength: x.strength + s.strength, ystrength: x.ystrength + s.ystrength, ot: x.ot + s.ot,
      proxy: x.proxy + s.proxy, verify: x.verify + s.pendingVerify, exp: x.exp + s.expenses,
      indents: x.indents + s.indents.length, urgent: x.urgent + s.indents.filter(i => i.urgent).length,
      aged: x.aged + s.indents.filter(i => i.age >= 3).length,
      delayed: x.delayed + s.deliv.delayed, transit: x.transit + s.deliv.pending + s.deliv.confirmed + s.deliv.delayed + s.deliv.dispatched,
      dprDone: x.dprDone + (s.dpr === "submitted" ? 1 : 0),
    }), { strength: 0, ystrength: 0, ot: 0, proxy: 0, verify: 0, exp: 0, indents: 0, urgent: 0, aged: 0, delayed: 0, transit: 0, dprDone: 0 });
    const trend = r.trend.map(p => ({ date: p.date, total: siteId === "all" ? p.total : (p.bySite[siteId] || 0) }));
    const alerts = [];
    sites.forEach(s => { if (s.dpr === "missing") alerts.push(`❌ ${s.short}: DPR not filed today`); });
    if (T.delayed) alerts.push(`🚚 ${T.delayed} delivery${T.delayed > 1 ? "ies" : ""} marked DELAYED`);
    if (T.aged) alerts.push(`⏳ ${T.aged} indent${T.aged > 1 ? "s" : ""} waiting 3+ days without PO`);
    if (T.proxy) alerts.push(`⚠ ${T.proxy} proxy punch${T.proxy > 1 ? "es" : ""} today — photos on register`);
    if (T.verify) alerts.push(`🕓 ${T.verify} attendance entr${T.verify > 1 ? "ies" : "y"} pending EOD verification`);
    const delta = T.strength - T.ystrength;
    return { sites, T, trend, alerts, delta };
  }, [r, siteId]);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        {/* update235: consistent way back to the 4-card Director Home (no floating Back/✕) */}
        <a href="/home" style={{ fontSize: 12.5, color: "var(--copper)", fontWeight: 700, textDecoration: "none" }}>← Director Home</a>
        <div className="page-head">
          <h1>Site reports</h1>
          <div className="filters">
            <select value={siteId} onChange={e => setSiteId(e.target.value)}>
              <option value="all">All sites</option>
              {(r?.sites || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={days} onChange={e => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — reports need a live database.</div>}
        {loading ? <div className="muted">Loading report…</div> : !view ? <div className="muted">No data.</div> : (
          <>
            {/* needs your attention */}
            <div className="panel" style={{ borderLeft: "4px solid " + (view.alerts.length ? "var(--red)" : "#1a7f4f") }}>
              <h2 style={{ marginBottom: 6 }}>{view.alerts.length ? "Needs your attention" : "All clear"}</h2>
              {view.alerts.length === 0 ? <div className="muted">No DPR gaps, no delayed deliveries, no aged indents, nothing pending verification.</div> :
                view.alerts.map((a, i) => <div key={i} style={{ padding: "3px 0", fontSize: 13.5 }}>{a}</div>)}
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
              <Kpi label="Manpower today" value={view.T.strength} accent={COL.present}
                   sub={view.delta === 0 ? "same as yesterday" : (view.delta > 0 ? "▲ +" : "▼ ") + view.delta + " vs yesterday"} />
              <Kpi label="DPR filed" value={view.T.dprDone + " / " + view.sites.length} accent={view.T.dprDone === view.sites.length ? COL.present : "var(--red)"} sub="today" />
              <Kpi label="OT today" value={view.T.ot.toFixed(1) + " h"} sub={view.T.proxy + " proxy punches"} />
              <Kpi label="Open indents" value={view.T.indents} sub={view.T.urgent + " urgent · " + view.T.aged + " aged 3d+"} accent={view.T.aged ? "var(--red)" : undefined} />
              <Kpi label="Deliveries in transit" value={view.T.transit} sub={view.T.delayed + " delayed"} accent={view.T.delayed ? "var(--red)" : undefined} />
              <Kpi label="Expenses this month" value={inr(view.T.exp)} sub="approved + pending" />
            </div>

            {/* manpower composition */}
            <div className="panel">
              <h2>Manpower today — composition</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {view.sites.map(s => <StackBar key={s.id} s={s} max={Math.max(...view.sites.map(x => x.strength), 1)} />)}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11.5 }} className="muted">
                {Object.entries({ Present: COL.present, "Half day": COL.half, "On site (not out yet)": COL.onsite }).map(([l, c]) =>
                  <span key={l}><span style={{ display: "inline-block", width: 10, height: 10, background: c, borderRadius: 2, marginRight: 5 }} />{l}</span>)}
                <span><span style={{ color: COL.proxy }}>⚠n</span> = proxy punches</span>
              </div>
            </div>

            <div className="panel">
              <h2>Manpower trend — last {days} days</h2>
              <Area points={view.trend} />
            </div>

            {/* money + progress */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="panel" style={{ margin: 0 }}>
                <h2>Expenses this month</h2>
                {view.sites.map(s => {
                  const max = Math.max(...view.sites.map(x => x.expenses), 1);
                  return (
                    <div key={s.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr 100px", gap: 10, alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.short}</div>
                      <div style={{ background: "var(--bg)", borderRadius: 6, height: 20 }}>
                        <div style={{ width: Math.max(s.expenses / max * 100, s.expenses ? 2 : 0) + "%", background: "var(--copper)", height: "100%", borderRadius: 6 }} />
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, textAlign: "right" }}>{inr(s.expenses)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="panel" style={{ margin: 0 }}>
                <h2>BOQ progress (value, from RA bills)</h2>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "space-around" }}>
                  {view.sites.map(s => <Donut key={s.id} pct={s.boqPct} label={s.short} value={inr(s.boqDone) + " / " + inr(s.boqValue)} />)}
                </div>
              </div>
            </div>

            {/* procurement detail */}
            <div className="panel">
              <h2>Procurement & deliveries</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {Object.keys(DELIV_LABEL).filter(k => k !== "delivered").map(k => {
                  const n = view.sites.reduce((x, s) => x + s.deliv[k], 0);
                  return <span key={k} className={"badge " + (k === "delayed" ? "a" : k === "dispatched" ? "h" : "gray")} style={{ fontSize: 12 }}>{DELIV_LABEL[k]}: <b>{n}</b></span>;
                })}
              </div>
              <table className="dt-compact">
                <thead><tr><th>Site</th><th>PO</th><th>Vendor</th><th>Status</th><th>Expected</th></tr></thead>
                <tbody>
                  {view.sites.flatMap(s => s.upcoming.slice(0, 6).map(u => (
                    <tr key={s.id + u.po}>
                      <td className="muted">{s.short}</td>
                      <td style={{ fontWeight: 600 }}>{u.po}</td>
                      <td>{u.vendor}</td>
                      <td><span className={"badge " + (u.status === "delayed" ? "a" : u.status === "dispatched" ? "h" : "gray")}>{DELIV_LABEL[u.status]}</span></td>
                      <td className="muted">{u.expected || "—"}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
              {view.T.indents > 0 && (
                <div className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
                  Open indents: {view.sites.flatMap(s => s.indents.map(i => `${i.no}${i.urgent ? " (URGENT)" : ""} · ${i.age}d`)).join("  |  ")}
                </div>
              )}
            </div>

            <div className="muted" style={{ fontSize: 11.5 }}>As of {r.asOf} · Expenses = this month, approved + pending · BOQ % moves with saved RA bills · ⚠ proxy = supervisor punched on behalf, photo on register.</div>
          </>
        )}
      </main>
    </div>
  );
}
