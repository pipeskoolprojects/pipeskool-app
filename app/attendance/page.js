"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { getPunchFailures, getAttendance, getSites, approveOt, verifyAttendanceRow, editAttendanceRow, getNotPunched, markNotPunched, overrideAbsentMark, getAbsentMarks, getSiteCutoffs, setSiteCutoff } from "@/lib/data";   // update277/438
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
  const [np, setNp] = useState({ rows: [] }); const [marks, setMarks] = useState([]); const [cutoffs, setCutoffs] = useState([]);   // update438
  const load = () => { getAttendance(date, site).then(res => { setRows(res.rows || []); setLoadErr(res.error || ""); }); getNotPunched(date, site).then(setNp); getAbsentMarks(date, site && site !== "all" ? [Number(site)] : null).then(setMarks); getSiteCutoffs().then(setCutoffs); };
  async function actNp(r, status) {
    const reason = window.prompt(`${status === "present" ? "Mark PRESENT" : status === "leave" ? "Mark LEAVE" : "Mark ABSENT"} — ${r.worker} · ${r.site} · ${date}\n\nReason (required, logged with your name):`); if (reason == null) return; if (!reason.trim()) { window.alert("A reason is required."); return; }
    const x = await markNotPunched(r.id, date, status, reason.trim()); if (!x.ok) { window.alert(x.error); return; } load();
  }
  async function overrideMark(m, status) {
    const reason = window.prompt(`Override ${m.workers?.full_name}'s ${m.auto ? "AUTO-absent" : "absent"} on ${date} → ${status.toUpperCase()}\n\nReason (required, logged):`); if (reason == null) return; if (!reason.trim()) { window.alert("A reason is required."); return; }
    const x = await overrideAbsentMark(m.id, status, reason.trim()); if (!x.ok) { window.alert(x.error); return; } load();
  }
  // update378: three category tabs, same split as Muster Roll & Wages
  const [tab, setTab] = useState(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "notpunched") ? "notpunched" : "labour");   // update438 deep link from reminders
  // update378b: if the current tab is empty and another has rows, land on the one that does
  useEffect(() => {
    if (!rows) return;
    const c = { office: rows.filter(r => r.isStaff && r.isOffice).length,
                site_staff: rows.filter(r => r.isStaff && !r.isOffice).length,
                labour: rows.filter(r => !r.isStaff).length };
    if (tab !== "notpunched" && c[tab] === 0) setTab(c.labour ? "labour" : c.site_staff ? "site_staff" : "office");
  }, [rows]);   // eslint-disable-line
  const tabRows = (rows || []).filter(r =>
    tab === "office" ? (r.isStaff && r.isOffice) :
    tab === "site_staff" ? (r.isStaff && !r.isOffice) :
    !r.isStaff);
  const counts = { office: (rows || []).filter(r => r.isStaff && r.isOffice).length,
                   site_staff: (rows || []).filter(r => r.isStaff && !r.isOffice).length,
                   labour: (rows || []).filter(r => !r.isStaff).length };
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
          {r.site_manual && <div style={{ fontSize: 10, color: "#b45309", fontWeight: 700 }}>📍 site set by supervisor</div>}{/* update286 */}
          {photoThumb(r.photoIn, "punch-in") || <span className="muted" style={{ fontSize: 11 }}>no photo</span>}
          {photoThumb(r.photoOut, "punch-out")}
        </span>
      ) },
    { key: "verify", label: "Verification", filter: "select",
      render: r => r.verify === "verified" ? <span className="badge p">Verified</span> :
        r.verify === "corrected" ? <span className="badge info">Corrected</span> :
        canVerify ? <button style={{ fontSize: 11.5 }} title="Mark this punch as verified"
          onClick={() => doVerify(r)}>✓ Verify</button> : <span className="badge warn">Pending</span> },
    { key: "_edit", label: "", sortable: false, render: r => canVerify ? <button style={{ fontSize: 11.5 }} title="Correct in/out time or status" onClick={() => editRow(r)}>✎</button> : null },   // update277
  ];

  // update277: manual correction — times (HH:MM) drive hours/status/OT; a chosen status is kept
  async function editRow(r) {
    const hhmm = v => (v && v !== "—") ? v : "";
    const inT = prompt(`${r.worker} — punch-IN time (HH:MM, 24h). Leave blank to keep:`, hhmm(r.in)); if (inT === null) return;
    const outT = prompt(`${r.worker} — punch-OUT time (HH:MM, 24h). Leave blank to keep:`, hhmm(r.out)); if (outT === null) return;
    const st = prompt("Force status? Type present / half_day / absent — or leave blank to compute from the times:", ""); if (st === null) return;
    const note = prompt("Reason for the correction (logged):", ""); if (note === null) return;
    const res = await editAttendanceRow(r.id, { inHHMM: inT.trim(), outHHMM: outT.trim(), status: st.trim() || null, note });
    if (!res.ok) { setLoadErr(res.error); return; }
    alert(`${r.worker}: corrected → ${res.hours} h, ${String(res.status).replace("_", " ")}${res.ot > 0 ? ", OT " + res.ot + " h" : ""}.`);
    load();
  }

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
          {/* update378: category tabs, same order as Muster Roll & Wages */}
          {rows && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {[
                ["office",     "🏢 Office Staff",     counts.office],
                ["site_staff", "👷 Site Staff",       counts.site_staff],
                ["labour",     "🧰 Workers / Labour", counts.labour],
                ["notpunched", "🚫 Not punched",      (np.rows || []).length],   // update438
              ].map(([k, label, n]) => (
                <button key={k} onClick={() => setTab(k)}
                  style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 999,
                    border: "1px solid " + (tab === k ? "var(--copper)" : "var(--border)"),
                    background: tab === k ? "var(--copper)" : "#fff",
                    color: tab === k ? "#fff" : "inherit", fontWeight: tab === k ? 700 : 500, cursor: "pointer" }}>
                  {label} · {n}
                </button>
              ))}
            </div>
          )}
          {tab === "notpunched" ? (
            <div>{/* update438: expected roster with no punch-in for the date */}
              {np.error && <div className="note amber" style={{ marginBottom: 8 }}>⚠ {np.error}</div>}
              {(() => { const s0 = cutoffs.find(x => String(x.id) === String(site)) || null; const cut = s0 ? String(s0.auto_absent_time).slice(0, 5) : null; const today = new Date().toISOString().slice(0, 10);
                const left = (() => { if (!cut || date !== today) return null; const [h, m] = cut.split(":").map(Number); const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); const mins = h * 60 + m - (now.getHours() * 60 + now.getMinutes()); return mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : "cutoff passed — auto-absent applied by the scheduler"; })();
                return (
                  <div style={{ background: "#FFF7E6", borderRadius: 10, padding: "9px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 12.5 }}>
                    <span style={{ color: "#92400E" }}>⏰ Auto-absent at <b>{cut ? cut : "each site's cutoff (default 18:00)"}</b> IST if no punch-in{left ? ` · ${left}` : ""} · never on Sundays / festivals / approved leave</span>
                    {(sess0?.role === "director" || sess0?.role === "it_executive" || sess0?.role === "hr") && (
                      <button style={{ fontSize: 11.5 }} onClick={async () => { const sid = site && site !== "all" ? Number(site) : Number(window.prompt("Site id to configure (pick a site in the filter to skip this):", "")); if (!sid) return; const sc = cutoffs.find(x => x.id === sid); const cutoff = window.prompt("Auto-absent cutoff (HH:MM, IST):", sc ? String(sc.auto_absent_time).slice(0, 5) : "18:00"); if (!cutoff) return; const rem = window.prompt("First reminder time (HH:MM, IST):", sc ? String(sc.reminder_time).slice(0, 5) : "11:00"); if (!rem) return; const x = await setSiteCutoff(sid, cutoff, rem); if (!x.ok) window.alert(x.error); load(); }}>⚙ Cutoff &amp; reminder times</button>)}
                  </div>); })()}
              <DataTable columns={[
                { key: "worker", label: "Worker", render: r => <span><b>{r.worker}</b>{r.isStaff ? <span className="badge gray" style={{ marginLeft: 6, fontSize: 10 }}>{r.role || "staff"}</span> : null}<div className="muted" style={{ fontSize: 11 }}>{r.category}</div></span> },
                { key: "category", label: "Category", filter: "select" }, { key: "site", label: "Site", filter: "select" }, { key: "labour", label: "Labour", filter: "select" },
                { key: "actions", label: "Action", render: r => <span style={{ whiteSpace: "nowrap", display: "inline-flex", gap: 5 }}>
                  <button style={{ fontSize: 11, background: "#DCFCE7", color: "#15803D", border: "none", borderRadius: 7, padding: "5px 9px" }} onClick={() => actNp(r, "present")}>Present</button>
                  <button style={{ fontSize: 11, padding: "5px 9px" }} onClick={() => actNp(r, "leave")}>Leave</button>
                  <button style={{ fontSize: 11, padding: "5px 9px", color: "var(--red,#c0392b)" }} onClick={() => actNp(r, "absent")}>Absent</button>
                  {r.mobile && <a href={`https://wa.me/91${String(r.mobile).replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`${r.worker}, aapka aaj (${date}) ka punch-in nahi hua hai. Kripya punch karein ya supervisor ko batayein.`)}`} target="_blank" rel="noreferrer" title="WhatsApp" style={{ fontSize: 12, padding: "4px 7px", border: "1px solid var(--border)", borderRadius: 7, textDecoration: "none" }}>💬</a>}
                  {r.mobile && <a href={`tel:${r.mobile}`} title="Call" style={{ fontSize: 12, padding: "4px 7px", border: "1px solid var(--border)", borderRadius: 7, textDecoration: "none" }}>📞</a>}
                </span> },
              ]} rows={np.rows || []} exportName={"not_punched_" + date} />
              {marks.length > 0 && (
                <div className="card" style={{ marginTop: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Marked absent / leave on {date} · {marks.length}</div>
                  {marks.map(m => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: "1px solid var(--border,#e3e3de)", fontSize: 12.5, flexWrap: "wrap" }}>
                      <span style={{ flex: 1, minWidth: 200 }}><b>{m.workers?.full_name}</b> · {m.workers?.category || ""} · {m.sites?.name || ""}{m.workers?.contractors?.name ? " · " + m.workers.contractors.name : ""}</span>
                      <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: m.auto ? "#FEE2E2" : "#F3F4F6", color: m.auto ? "#B91C1C" : "#374151" }} title={m.reason || ""}>{m.auto ? "🤖 Absent (auto)" : (String(m.reason || "").startsWith("leave") ? "Leave" : "Absent")}{m.marker?.full_name ? " · " + m.marker.full_name : ""}</span>
                      {m.overridden_at && <span className="muted" style={{ fontSize: 11 }}>overridden by {m.overrider?.full_name}: {m.override_reason}</span>}
                      <button style={{ fontSize: 11 }} onClick={() => overrideMark(m, "present")}>Override → Present</button>
                      {m.auto && <button style={{ fontSize: 11 }} onClick={() => overrideMark(m, "leave")}>→ Leave</button>}
                    </div>))}
                </div>)}
            </div>
          ) : !rows ? <div className="muted">Loading…</div> :
            <DataTable columns={columns} rows={tabRows} exportName={"attendance_" + date + "_" + tab} />}
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
