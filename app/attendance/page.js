"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { getAttendance, getSites } from "@/lib/data";
import { todayLocal } from "@/lib/today";
import { isDemo } from "@/lib/supabase";

const statusBadge = s =>
  s === "present" ? <span className="badge p">P</span> :
  s === "half_day" ? <span className="badge h">½</span> :
  s === "absent" ? <span className="badge a">A</span> :
  <span className="badge gray">…</span>;

export default function AttendancePage() {
  const [date, setDate] = useState(() => todayLocal());
  const [site, setSite] = useState("all");
  const [sites, setSites] = useState([]);
  const [rows, setRows] = useState(null);

  useEffect(() => { getSites().then(setSites); }, []);
  useEffect(() => { getAttendance(date, site).then(setRows); }, [date, site]);

  const columns = [
    { key: "worker", label: "Worker", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.worker}</span> },
    { key: "category", label: "Category", filter: "select" },
    { key: "contractor", label: "Labour", filter: "select", render: r => <span className="muted">{r.contractor}</span> },
    { key: "in", label: "In", type: "num" },
    { key: "out", label: "Out", type: "num" },
    { key: "hours", label: "Hrs", type: "num", render: r => r.hours ?? "—" },
    { key: "status", label: "Status", filter: "select", render: r => statusBadge(r.status), exportValue: r => r.status },
    { key: "ot", label: "OT", type: "num", render: r => r.ot > 0 ? r.ot + "h" : "—" },
    { key: "punch", label: "Punch", filter: "select",
      render: r => r.punch === "proxy" ? <span className="badge warn">Proxy 📷</span> : <span className="badge gray">Self</span> },
    { key: "verify", label: "Verification", filter: "select",
      render: r => r.verify === "verified" ? <span className="badge p">Verified</span> :
        r.verify === "corrected" ? <span className="badge info">Corrected</span> : <span className="badge warn">Pending</span> },
  ];

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
          {!rows ? <div className="muted">Loading…</div> :
            <DataTable columns={columns} rows={rows} exportName={"attendance_" + date} />}
        </div>
        <div className="muted">The date and site pickers above set the day; the filters below the heading search and sort within it.</div>
      </main>
    </div>
  );
}
