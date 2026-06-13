"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { todayLocal } from "@/lib/today";
import { getAttendance, getSites } from "@/lib/data";
import { isDemo } from "@/lib/supabase";

const statusBadge = s =>
  s === "present" ? <span className="badge p">P</span> :
  s === "half_day" ? <span className="badge h">½</span> :
  s === "absent" ? <span className="badge a">A</span> :
  <span className="badge gray">…</span>;

const verifyBadge = v =>
  v === "verified" ? <span className="badge p">Verified</span> :
  v === "corrected" ? <span className="badge info">Corrected</span> :
  <span className="badge warn">Pending</span>;

export default function AttendancePage() {
  const [date, setDate] = useState(() => todayLocal());
  const [site, setSite] = useState("all");
  const [sites, setSites] = useState([]);
  const [rows, setRows] = useState(null);

  useEffect(() => { getSites().then(setSites); }, []);
  useEffect(() => { getAttendance(date, site).then(setRows); }, [date, site]);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Attendance register</h1>
          <div className="filters">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">All sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — sample register shown.</div>}

        <div className="panel">
          {!rows ? <div className="muted">Loading…</div> : (
            <table>
              <thead>
                <tr>
                  <th>Worker</th><th>Category</th><th>Labour</th>
                  <th className="num">In</th><th className="num">Out</th>
                  <th className="num">Hrs</th><th>Status</th>
                  <th className="num">OT</th><th>Punch</th><th>Verification</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.worker}</td>
                    <td>{r.category}</td>
                    <td className="muted">{r.contractor}</td>
                    <td className="num">{r.in}</td>
                    <td className="num">{r.out}</td>
                    <td className="num">{r.hours ?? "—"}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td className="num">{r.ot > 0 ? r.ot + "h" : "—"}</td>
                    <td>{r.punch === "proxy"
                      ? <span className="badge warn">Proxy 📷</span>
                      : <span className="badge gray">Self</span>}</td>
                    <td>{verifyBadge(r.verify)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="muted">
          Proxy entries always carry a live photo of the worker. Pending rows must be verified
          by the site supervisor before the day&apos;s muster locks.
        </div>
      </main>
    </div>
  );
}
