"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getAssets, getCalibrationDue, getRepairHistory, idleAssets, statusInfo, inr } from "@/lib/assets";

export default function AssetsPage() {
  const [site, setSite] = useState("all");
  const [assets, setAssets] = useState(null);
  const [calib, setCalib] = useState([]);
  const [repairs, setRepairs] = useState([]);

  useEffect(() => { getAssets(site).then(setAssets); }, [site]);
  useEffect(() => { getCalibrationDue().then(setCalib); getRepairHistory().then(setRepairs); }, []);

  const idle = assets ? idleAssets(assets) : [];
  const totalValue = (assets || []).reduce((s, a) => s + a.cost, 0);
  const underRepair = (assets || []).filter(a => a.status === "under_repair").length;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Tools &amp; assets register</h1>
          <div className="filters">
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">All sites</option>
              <option value="1">KEI Sanand</option>
              <option value="2">SOUL Campus</option>
              <option value="3">The Creek</option>
            </select>
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — sample asset register.</div>}

        <div className="cards">
          <div className="card"><div className="label">Total assets</div><div className="value">{assets?.length ?? "—"}</div></div>
          <div className="card"><div className="label">Asset value</div><div className="value">{inr(totalValue)}</div></div>
          <div className="card"><div className="label">Calibration due (30d)</div><div className="value" style={{ color: calib.length ? "var(--red)" : "var(--green)" }}>{calib.length}</div></div>
          <div className="card"><div className="label">Under repair</div><div className="value" style={{ color: underRepair ? "var(--amber)" : "var(--green)" }}>{underRepair}</div></div>
        </div>

        {calib.length > 0 && (
          <div className="panel">
            <h2>🔧 Calibration due soon</h2>
            <table>
              <thead><tr><th>Asset</th><th>Name</th><th>Site</th><th>Due date</th></tr></thead>
              <tbody>
                {calib.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{c.code}</td>
                    <td>{c.name}</td>
                    <td className="muted">{c.site}</td>
                    <td style={{ color: "var(--red)" }}>{c.calib_due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ marginTop: 8 }}>Hydro-test gauges and pumps need valid calibration certificates — clients ask for these during testing.</div>
          </div>
        )}

        <div className="panel">
          <h2>Asset location &amp; status — all sites</h2>
          <table>
            <thead>
              <tr><th>Code</th><th>Asset</th><th>Category</th><th>Site</th><th>Custodian</th><th className="num">Value</th><th>Status</th></tr>
            </thead>
            <tbody>
              {!assets ? <tr><td colSpan="7" className="muted">Loading…</td></tr> :
                assets.map(a => {
                  const [label, color] = statusInfo(a.status);
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.code}</td>
                      <td>{a.name}<div className="muted">{a.make}</div></td>
                      <td>{a.category}</td>
                      <td><span className="badge gray">{a.site}</span></td>
                      <td className="muted">{a.custodian || "—"}</td>
                      <td className="num">{inr(a.cost)}</td>
                      <td><span className={"badge " + color}>{label}</span></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
          {idle.length > 0 && (
            <div className="panel" style={{ marginBottom: 0 }}>
              <h2>Idle assets (available, unused)</h2>
              <table>
                <thead><tr><th>Code</th><th>Asset</th><th>Site</th><th className="num">Value</th></tr></thead>
                <tbody>
                  {idle.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.code}</td>
                      <td>{a.name}</td>
                      <td className="muted">{a.site}</td>
                      <td className="num">{inr(a.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="muted" style={{ marginTop: 8 }}>Idle at one site while another may be hiring — move before renting.</div>
            </div>
          )}

          {repairs.length > 0 && (
            <div className="panel" style={{ marginBottom: 0 }}>
              <h2>Repair cost history</h2>
              <table>
                <thead><tr><th>Asset</th><th className="num">Repairs</th><th className="num">Repair cost</th><th className="num">vs Purchase</th></tr></thead>
                <tbody>
                  {repairs.map((r, i) => {
                    const pct = r.cost ? Math.round(r.total / r.cost * 100) : 0;
                    return (
                      <tr key={i}>
                        <td><div style={{ fontWeight: 600 }}>{r.code}</div><div className="muted">{r.name}</div></td>
                        <td className="num">{r.count}</td>
                        <td className="num">{inr(r.total)}</td>
                        <td className="num" style={{ color: pct > 25 ? "var(--red)" : "inherit" }}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="muted" style={{ marginTop: 8 }}>When repair cost crosses ~25–30% of purchase value, consider replacing.</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
