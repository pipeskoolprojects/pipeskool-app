"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { getPunchFailures, getAttendance, getSites, approveOt, verifyAttendanceRow } from "@/lib/data";
import { getSession, canAnySite } from "@/lib/auth";
import { todayLocal } from "@/lib/today";
import { isDemo } from "@/lib/supabase";
import { fmtHM } from "@/lib/payroll";
import { getHolidayMap } from "@/lib/holidays";

const statusBadge = s =>
  s === "present" ? <span className="badge p">P</span> :
  s === "half_day" ? <span className="badge h">½</span> :
  s === "absent" ? <span className="badge a">A</span> :
  <span className="badge gray">…</span>;

export default function AttendancePage() {
  const [date, setDate] = useState(() => todayLocal());
  const [site, setSite] = useState("all");
  useEffect(() => {   // update206: project scoping — ?site= from a project workspace pre-filters this page
    try { const sp = new URLSearchParams(window.location.search).get("site"); if (sp) setSite(String(sp)); } catch {}
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [sites, setSites] = useState([]);
  const [rows, setRows] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [fails, setFails] = useState([]);                     // update180: rejected punches
  useEffect(() => { getPunchFailures(date).then(setFails); }, [date]);
  // update246: is the date being viewed a company holiday for this site?
  const [holName, setHolName] = useState("");
  useEffect(() => {
    const next = new Date(date + "T00:00:00"); next.setDate(next.getDate() + 1);
    getHolidayMap(site && site !== "all" ? site : null, date, next.toLocaleDateString("en-CA"))
      .then(m => setHolName(m[date] || "")).catch(() => setHolName(""));
  }, [date, site]);
  const sess0 = getSession();
  const canVerify = !!sess0 && (canAnySite(sess0, "attendance", "verify") || canAnySite(sess0, "attendance", "manage"));
  async function doVerify(r) {
    const res = await verifyAttendanceRow(r.id);
    if (!res.ok) { window.alert("Could not verify: " + res.error); return; }
    load();
  }
  const [lightbox, setLightbox] = useState(null);
  const [otEdit, setOtEdit] = useState(null);   // { id, worker, computed, value }
  const [busy, setBusy] = useState(false);

  useEffect(() => { getSites().then(setSites); }, []);
  const load = () => getAttendance(date, site).then(res => { setRows(res.rows || []); setLoadErr(res.error || ""); });
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
    { key: "date", label: "Date", render: () => <span className="muted">{date}</span>, exportValue: () => date },
    { key: "worker", label: "Worker", filter: "search", render: r => r.workerId
        ? <a href={"/attendance/slip?worker=" + r.workerId + "&month=" + String(date).slice(0, 7)} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }} title="Open full profile / slip">{r.worker}</a>
        : <span style={{ fontWeight: 600 }}>{r.worker}</span> },   // update194: click → full details
    { key: "category", label: "Category", filter: "select" },
    { key: "contractor", label: "Labour", filter: "select", render: r => <span className="muted">{r.contractor}</span> },
    { key: "site", label: "Site", filter: "select", render: r => <span className="muted">{r.site}{r.out_site_id && String(r.out_site_id) !== String(r.site_id || "") ? " → out @ other site" : ""}</span> },
    { key: "in_dist", label: "GPS", render: r => r.in_dist == null && r.out_dist == null ? <span className="muted">—</span>
        : <span className="muted" style={{ fontSize: 12 }}>{r.in_dist != null ? "in " + r.in_dist + "m" : ""}{r.out_dist != null ? (r.in_dist != null ? " · " : "") + "out " + r.out_dist + "m" : ""}</span>,
      exportValue: r => (r.in_dist != null ? "in " + r.in_dist + "m" : "") + (r.out_dist != null ? " out " + r.out_dist + "m" : "") },
    { key: "in", label: "In", type: "num" },
    { key: "out", label: "Out", type: "num" },
    { key: "hours", label: "Hrs", type: "num", render: r => r.hours ? fmtHM(r.hours) : "—", exportValue: r => r.hours ? fmtHM(r.hours) : "" },   // update194: exact h/m display
    { key: "status", label: "Status", filter: "select", render: r => <>{statusBadge(r.status)}
        {r.review_status === "needs_review" && <div style={{ fontSize: 10.5, color: "#b45309", fontWeight: 700 }}>⏱ Auto-closed — missing punch-out · held from payroll</div>}
        {r.auto_closed && r.review_status === "confirmed" && <div className="muted" style={{ fontSize: 10.5 }}>⏱ auto-closed · reviewed</div>}</>, exportValue: r => r.status + (r.review_status === "needs_review" ? " (auto-closed, needs review)" : "") },   // update275
    { key: "ot", label: "OT", render: r => {
        const dev = r.otApproved && r.otApprovedHours != null && r.otApprovedHours !== r.ot;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            {r.otEligible === false ? <span className="muted" title="Not OT-eligible (Workers & Staff Master)">n/e</span> : r.otApproved && Number(r.otApprovedHours) > 0 ? <b>{fmtHM(r.otApprovedHours)}</b> : (r.ot > 0 ? fmtHM(r.ot) : "—")}
            {r.otApproved && <span className="badge p" title="Approved">✓</span>}
            {dev && <span className="badge warn" title={`Time after shift end: ${fmtHM(r.ot)}`}>⚠ {fmtHM(r.ot)}</span>}
            {r.otEligible !== false && <button style={{ fontSize: 11, padding: "1px 6px" }}
              onClick={() => setOtEdit({ id: r.id, worker: r.worker, computed: r.ot, value: r.otApprovedHours ?? (Number(r.ot) <= 1 ? 0 : Math.round(Number(r.ot))) })}>
              {r.otApproved ? "edit" : "approve"}</button>}
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
        r.verify === "corrected" ? <span className="badge info">Corrected</span> :
        canVerify ? <button style={{ fontSize: 11.5 }} title="Mark this punch as verified"
          onClick={() => doVerify(r)}>✓ Verify</button> : <span className="badge warn">Pending</span> },
  ];

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Attendance register
            {/* update246: the register says out loud that this date is a paid holiday */}
            {holName && <span className="badge" style={{ marginLeft: 10, fontSize: 11, verticalAlign: "middle", color: "#b45309", border: "1px solid #b45309", background: "#fff7ed" }}>⭐ Holiday · {holName}</span>}
          </h1>
          <div className="filters">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">All sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        {loadErr && <div className="demo-banner" style={{ background: "#fdecea", color: "var(--red)" }}>
          ⚠ Could not load attendance from the database: {loadErr} — your data is NOT deleted. Screenshot this and send it.</div>}
        {fails.length > 0 && (
          <div className="demo-banner" style={{ background: "#FFF7ED", border: "1px solid var(--copper)", color: "#7c2d12" }}>
            ⚠ <b>{fails.length} punch attempt{fails.length > 1 ? "s" : ""} REJECTED on {date}</b> — tried but not on the register:{" "}
            {fails.slice(0, 12).map((f, i) => <span key={i}>{f.name} ({f.site} · {f.reason}{f.dist ? " " + f.dist + "m" : ""} · {f.time}){i < Math.min(fails.length, 12) - 1 ? ", " : ""}</span>)}
            {fails.length > 12 ? " +" + (fails.length - 12) + " more" : ""}
          </div>
        )}
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
