"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getWages, getSites, inr } from "@/lib/data";
import { isDemo } from "@/lib/supabase";

export default function WagesPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [site, setSite] = useState("all");
  const [sites, setSites] = useState([]);
  const [rows, setRows] = useState(null);

  useEffect(() => { getSites().then(setSites); }, []);
  useEffect(() => { getWages(month, site).then(setRows); }, [month, site]);

  const totals = (rows || []).reduce(
    (t, r) => ({
      days: t.days + r.days, ot: t.ot + r.ot, gross: t.gross + r.gross,
      adv: t.adv + r.adv, net: t.net + r.net,
    }),
    { days: 0, ot: 0, gross: 0, adv: 0, net: 0 }
  );
  const cashCount = (rows || []).filter(r => !r.bank).length;

  function exportCSV() {
    const head = "Worker,Category,Pay mode,Days,OT hrs,Daily rate,Gross,Advance,Net\n";
    const body = (rows || []).map(r =>
      [r.worker, r.category, r.bank ? "Bank" : "Cash", r.days, r.ot, r.rate, r.gross, r.adv, r.net].join(",")
    ).join("\n");
    const total = `\nTOTAL,,,${totals.days},${totals.ot},,${totals.gross},${totals.adv},${totals.net}`;
    const blob = new Blob([head + body + total], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Pipeskool_muster_roll_${month}.csv`;
    a.click();
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Muster roll &amp; wage register</h1>
          <div className="filters">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">All sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={exportCSV}>⬇ Excel muster roll</button>
            <button className="primary">✓ Approve payout</button>
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — sample wage register shown (own labour only; contractor labour flows to Subcontractor Bills).</div>}

        <div className="panel">
          {!rows ? <div className="muted">Loading…</div> : (
            <table>
              <thead>
                <tr>
                  <th>Worker</th><th>Pay mode</th>
                  <th className="num">Days</th><th className="num">OT hrs</th>
                  <th className="num">Rate</th><th className="num">Gross</th>
                  <th className="num">Advance</th><th className="num">Net payable</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.worker}</div>
                      <div className="muted">{r.category}</div>
                    </td>
                    <td>{r.bank
                      ? <span className="badge gray">Bank</span>
                      : <span className="badge warn">Cash — no bank</span>}</td>
                    <td className="num">{r.days}</td>
                    <td className="num">{r.ot}</td>
                    <td className="num">{inr(r.rate)}</td>
                    <td className="num">{inr(r.gross)}</td>
                    <td className="num" style={{ color: "var(--red)" }}>{r.adv ? "−" + inr(r.adv) : "0"}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{inr(r.net)}</td>
                  </tr>
                ))}
                <tr style={{ background: "var(--gray-bg)" }}>
                  <td style={{ fontWeight: 700 }}>Total ({(rows || []).length} workers)</td>
                  <td></td>
                  <td className="num" style={{ fontWeight: 700 }}>{totals.days}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{totals.ot}</td>
                  <td></td>
                  <td className="num" style={{ fontWeight: 700 }}>{inr(totals.gross)}</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--red)" }}>−{inr(totals.adv)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{inr(totals.net)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        {cashCount > 0 && (
          <div className="demo-banner">
            {cashCount} worker{cashCount > 1 ? "s" : ""} flagged for cash payment — bank details pending in their profiles.
          </div>
        )}
      </main>
    </div>
  );
}
