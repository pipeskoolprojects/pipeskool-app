"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getTodaySummary } from "@/lib/data";
import { isDemo } from "@/lib/supabase";

export default function Dashboard() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [s, setS] = useState(null);

  useEffect(() => { getTodaySummary(date).then(setS); }, [date]);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Attendance dashboard</h1>
          <div className="filters">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — showing sample data. Connect Supabase to see live site data.</div>}

        {!s ? <div className="muted">Loading…</div> : (
          <>
            <div className="cards">
              <div className="card">
                <div className="label">Present today</div>
                <div className="value">{s.present} <small>/ {s.total}</small></div>
              </div>
              <div className="card">
                <div className="label">Overtime logged</div>
                <div className="value">{s.otHours} <small>hrs</small></div>
              </div>
              <div className="card">
                <div className="label">Proxy punches</div>
                <div className="value" style={{ color: s.proxyPct > 15 ? "var(--red)" : "var(--amber)" }}>{s.proxyPct}%</div>
              </div>
              <div className="card">
                <div className="label">Pending verification</div>
                <div className="value" style={{ color: s.pending > 0 ? "var(--red)" : "var(--green)" }}>{s.pending}</div>
              </div>
            </div>

            <div className="panel">
              <h2>Site-wise strength today</h2>
              <table>
                <thead>
                  <tr>
                    <th>Site</th><th>Supervisor</th>
                    <th className="num">Present</th><th className="num">Half</th>
                    <th className="num">Absent</th><th className="num">Proxy</th>
                    <th style={{ width: "26%" }}>Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {s.sites.map(site => {
                    const tot = site.p + site.h + site.a;
                    const pct = tot ? Math.round((site.p / tot) * 100) : 0;
                    return (
                      <tr key={site.name}>
                        <td style={{ fontWeight: 600 }}>{site.name}</td>
                        <td className="muted">{site.sup}</td>
                        <td className="num"><span className="badge p">{site.p}</span></td>
                        <td className="num"><span className="badge h">{site.h}</span></td>
                        <td className="num"><span className="badge a">{site.a}</span></td>
                        <td className="num">{site.proxy > 3
                          ? <span className="badge warn">{site.proxy} ⚠</span>
                          : <span className="badge gray">{site.proxy}</span>}</td>
                        <td>
                          <div className="bar-track"><div className="bar-fill" style={{ width: pct + "%" }} /></div>
                          <div className="muted" style={{ marginTop: 3 }}>{pct}% present</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
