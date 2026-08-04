"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { getAttendance, getSites, approveOt } from "@/lib/data";
import { getSession } from "@/lib/auth";
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
  const [lightbox, setLightbox] = useState(null);
  const [otEdit, setOtEdit] = useState(null);   // { id, worker, computed, value }
  const [busy, setBusy] = useState(false);

  useEffect(() => { getSites().then(setSites); }, []);
  const load = () => getAttendance(date, site).then(setRows);
  useEffect(() => { load(); }, [date, site]);

  async function saveOt() {
    setBusy(true); const res = await approveOt(otEdit.id, otEdit.value, getSession()?.id || 1); setBusy(false);
    if (!res.ok) return;
    setOtEdit(null); load();
  }

  const photoThumb = (url, label) => url ? (
    <img src={url} alt={label} onClick={() => setLightbox(url)}
      style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 5, border: "1px solid var(--border)", cursor: "zoom-in" }} />
  ) : null;

  const columns = [
    { key: "worker", label: "Worker", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.worker}</span> },
    { key: "category", label: "Category", filter: "select" },
    { key: "contractor", label: "Labour", filter: "select", render: r => <span className="muted">{r.contractor}</span> },
    { key: "site", label: "Site", filter: "select", render: r => <span className="muted">{r.site}</span> },
    { key: "in", label: "In", type: "num" },
    { key: "out", label: "Out", type: "num" },
    { key: "hours", label: "Hrs", type: "num", render: r => r.hours ?? "—" },
    { key: "status", label: "Status", filter: "select", render: r => statusBadge(r.status), exportValue: r => r.status },
    { key: "ot", label: "OT", render: r => {
        const dev = r.otApproved && r.otApprovedHours != null && r.otApprovedHours !== r.ot;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            {r.otApproved && Number(r.otApprovedHours) > 0 ? <b>{r.otApprovedHours}h</b> : (r.ot > 0 ? r.ot + "h" : "—")}
            {r.otApproved && <span className="badge p" title="Approved">✓</span>}
            {dev && <span className="badge warn" title={`Punch shows ${r.ot}h`}>⚠ {r.ot}h</span>}
            <button style={{ fontSize: 11, padding: "1px 6px" }}
              onClick={() => setOtEdit({ id: r.id, worker: r.worker, computed: r.ot, value: r.otApprovedHours ?? r.ot })}>
              {r.otApproved ? "edit" : "approve"}</button>
          </span>
        );
      }, exportValue: r => (r.otApproved ? r.otApprovedHours : r.ot) },
    { key: "punch", label: "Punch / photo", filter: "select", exportValue: r => r.punch,
      render: r => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {r.punch === "proxy" ? <span className="badge warn">Proxy</span> : <span className="badge gray">Self</span>}
          {photoThumb(r.photoIn, "punch-in") || <span className="muted" style={{ fontSize: 11 }}>no photo</span>}
          {photoThumb(r.photoOut, "punch-out")}
        </span>
      ) },
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
        <div className="muted">OT is the time worked after the site's shift end. Tap a photo to enlarge. ⚠ means approved OT differs from what the punch-out time shows.</div>

        {/* photo lightbox */}
        {lightbox && (
          <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, cursor: "zoom-out" }}>
            <img src={lightbox} alt="enlarged" style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 8 }} />
          </div>
        )}

        {/* OT approve / edit modal */}
        {otEdit && (
          <div onClick={() => setOtEdit(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 380, width: "100%", padding: 22 }}>
              <h2 style={{ marginBottom: 2 }}>Approve OT</h2>
              <div className="muted" style={{ marginBottom: 14 }}>{otEdit.worker}</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>From punch-out time: <b>{otEdit.computed}h</b></div>
              <label className="muted">Approved OT hours</label>
              <input style={{ width: "100%" }} value={otEdit.value} onChange={e => setOtEdit(o => ({ ...o, value: e.target.value }))} />
              {Number(otEdit.value) !== otEdit.computed && <div className="note amber" style={{ fontSize: 12, marginTop: 8 }}>⚠ This differs from the {otEdit.computed}h the punch-out shows — it'll be flagged.</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="primary" disabled={busy} onClick={saveOt}>{busy ? "Saving…" : "Approve OT"}</button>
                <button onClick={() => setOtEdit(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
