"use client";
// update186: supervisor Daily Muster — verify / OT / absent per row, worker detail sheet,
// global cross-site protection, bottom "Verify all" bar. Worker-side app untouched.
import { useEffect, useMemo, useState } from "react";
import MobileNav from "@/components/MobileNav";
import CameraCapture from "@/components/CameraCapture";
import { isDemo } from "@/lib/supabase";
import { getMuster, proxyPunch, proxyPunchOut, getSiteGeo, getPosition, distanceMeters, verifyDay, verifyOne, markAbsent, unmarkAbsent, getWorkerMonth } from "@/lib/mobile";
import { approveOt } from "@/lib/data";
import { otRound, fmtHM } from "@/lib/payroll";
import { getSession, setCurrentSite, can } from "@/lib/auth";

const initials = n => (n || "?").split(" ").map(x => x[0]).slice(0, 2).join("");
const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const ymNow = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const ymLabel = ym => { const [y, m] = ym.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" }); };
const shiftYm = (ym, d) => { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"); };
const btn = { fontSize: 11.5, padding: "6px 9px", borderRadius: 8, whiteSpace: "nowrap" };
const sheetBox = { background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 430, padding: 18 };
const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end", justifyContent: "center" };

export default function MusterScreen() {
  const [rows, setRows] = useState(null);
  const [target, setTarget] = useState(null);
  const [mode, setMode] = useState("in");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [geo, setGeo] = useState(null);
  const [showCam, setShowCam] = useState(false);
  const [q, setQ] = useState("");
  const [otFor, setOtFor] = useState(null); const [otHrs, setOtHrs] = useState("");
  const [absFor, setAbsFor] = useState(null); const [absReason, setAbsReason] = useState("");
  const [sheet, setSheet] = useState(null);
  const [sheetData, setSheetData] = useState(null); const [sheetYm, setSheetYm] = useState(ymNow());
  const [showAbsent, setShowAbsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const sess = typeof window !== "undefined" ? getSession() : null;
  useEffect(() => { if (typeof window !== "undefined" && !getSession()) window.location.replace("/m"); }, []);
  const siteId = sess?.currentSite || sess?.sites?.[0]?.id || 1;
  const isDirector = sess?.role === "director";
  const canProxy = sess && (isDirector || can(sess, "attendance", "create", siteId));
  const canVerify = sess && (isDirector || can(sess, "attendance", "verify", siteId) || can(sess, "attendance", "manage", siteId) || can(sess, "attendance", "approve", siteId));
  const canEditLocked = sess && (isDirector || can(sess, "attendance", "manage", siteId));
  const siteName = sess?.sites?.find(x => x.id === siteId)?.name || "";
  const markedBy = sess?.name || "Supervisor";

  const load = () => getMuster(siteId).then(setRows);
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    (async () => {
      if (isDirector) { if (alive) setGeo({ director: true }); return; }
      const g = await getSiteGeo(siteId);
      if (!g || g.geofence_lat == null) { if (alive) setGeo({ unset: true }); return; }
      const p = await getPosition();
      if (!p) { if (alive) setGeo({ nogps: true }); return; }
      const dist = Math.round(distanceMeters(p.lat, p.lng, g.geofence_lat, g.geofence_lng));
      if (alive) setGeo({ dist, inside: dist <= (g.geofence_radius_m || 200) });
    })();
    return () => { alive = false; };
  }, [siteId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (sheet) { setSheetData(null); setShowAbsent(false); getWorkerMonth(sheet.workerId, sheetYm).then(setSheetData); } }, [sheet, sheetYm]);

  function flash(ok, text) { if (ok) { setMsg(text); setErr(""); } else { setErr(text); setMsg(""); } }
  function startProxy(r, m) {
    if (!canProxy) { flash(false, "Only the site supervisor / incharge can mark on behalf."); return; }
    if (m === "in" && r.elsewhere) { flash(false, `${r.name} is already present at ${r.elsewhere.site} (in ${r.elsewhere.time}).`); return; }
    setTarget(r); setMode(m); setErr(""); setMsg("");
    setShowCam(true);   // live camera only — locked rule
  }
  async function onPhoto(file) {
    setShowCam(false);
    if (!file || !target) return;
    const res = mode === "out" ? await proxyPunchOut(target.id, siteId, file) : await proxyPunch(target.id, siteId, file, markedBy);
    if (!res.ok) { flash(false, res.error); return; }
    flash(true, `Proxy punch-${mode} saved for ${target.name} — photo attached, flagged in records.`);
    setTarget(null); load();
  }
  async function doVerify(r) {
    if (!canVerify) return;
    setBusy(true); const res = await verifyOne(r.attId); setBusy(false);
    if (!res.ok) { flash(false, res.error); return; }
    flash(true, `${r.name} verified.`); load();
  }
  async function doVerifyAll() {
    const n = pending.length;
    if (!n || !confirm(`Verify all ${n} pending record(s) for today at ${siteName}? They lock after this.`)) return;
    setBusy(true); const res = await verifyDay(siteId, rows); setBusy(false);
    if (!res.ok) { flash(false, res.error); return; }
    flash(true, `${res.count ?? n} record(s) verified and locked.`); load();
  }
  async function saveOt() {
    const h = Number(otHrs);
    if (!(h >= 0) || h > 12) { flash(false, "Enter OT hours between 0 and 12."); return; }
    setBusy(true); const res = await approveOt(otFor.attId, h, sess?.id); setBusy(false);
    if (!res.ok) { flash(false, res.error); return; }
    flash(true, `OT ${h} h approved for ${otFor.name}.`); setOtFor(null); setOtHrs(""); load();
  }
  async function saveAbsent() {
    setBusy(true); const res = await markAbsent(absFor.id, siteId, sess?.id, absReason.trim() || null); setBusy(false);
    if (!res.ok) { flash(false, res.error); return; }
    flash(true, `${absFor.name} marked absent for today.`); setAbsFor(null); setAbsReason(""); load();
  }
  async function undoAbsent(r) {
    const res = await unmarkAbsent(r.absentMark.id);
    if (!res.ok) { flash(false, res.error); return; }
    flash(true, `Absent mark removed for ${r.name}.`); load();
  }

  const shown = useMemo(() => (rows || []).filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.cat || "").toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const counts = (rows || []).reduce((c, r) => {
    if (r.elsewhere) c.else++;
    else if (r.status === "present" || (r.in && !r.out)) c.p++;
    else if (r.status === "half_day") c.h++;
    else if (r.status === "absent" || r.absentMark) c.a++;
    else c.pend++;
    return c;
  }, { p: 0, h: 0, a: 0, pend: 0, else: 0 });
  const pending = (rows || []).filter(r => r.attId && r.verify === "pending" && !r.elsewhere);
  const noPunch = (rows || []).filter(r => !r.attId && !r.absentMark && !r.elsewhere).length;

  const exportCsv = () => {
    if (!sheetData) return;
    const esc = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ["Date", "Site", "In", "Out", "Hours", "Status", "OT (punch)", "OT approved", "Punch", "Verify"];
    const body = sheetData.days.map(d => [d.date, d.site, d.in, d.out, d.hours, d.status, d.ot, d.otApproved, d.punch, d.verify].map(esc).join(","));
    const w = sheetData.worker;
    const sum = ["", `Worker,${w.name}`, `Month,${sheetData.month}`, `Present,${sheetData.present}`, `Half,${sheetData.half}`, `Absent,${sheetData.absent}`, `Total hours,${sheetData.totalHours}`, `OT hours,${sheetData.otHours}`, `OT rate,${w.otRate}`, `OT amount,${sheetData.otAmt}`, `Daily wage,${w.wage}`, `Days pay,${sheetData.earned}`, `Gross,${sheetData.gross}`];
    const blob = new Blob([head.join(",") + "\n" + body.join("\n") + "\n" + sum.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${w.name.replace(/\s+/g, "_")}_${sheetData.month}_attendance.csv`; a.click();
  };

  return (
    <div className="m-wrap" style={{ paddingBottom: 116 }}>
      <div className="m-head">
        <div>
          <div className="title">Daily muster</div>
          {sess?.sites?.length > 1 ? (
            <select value={siteId} onChange={e => { setCurrentSite(e.target.value); window.location.reload(); }}
              style={{ marginTop: 2, fontSize: 12.5, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "3px 8px" }}>
              {sess.sites.map(s => <option key={s.id} value={s.id} style={{ color: "#000" }}>{s.name}</option>)}
            </select>
          ) : (
            <div className="sub">{siteName || "Site"} · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
          )}
        </div>
        {geo?.director ? null :
          !geo ? <span className="geo-chip geo-wait" style={{ fontSize: 11 }}>📍 Checking location…</span> :
          geo.unset ? <span className="geo-chip geo-wait" style={{ fontSize: 11 }}>📍 Location not set</span> :
          geo.nogps ? <span className="geo-chip geo-wait" style={{ fontSize: 11 }}>📍 GPS off</span> :
          geo.inside ? <span className="geo-chip geo-ok" style={{ fontSize: 11 }}>📍 Inside site</span> :
          <span className="geo-chip geo-bad" style={{ fontSize: 11 }}>📍 {geo.dist} m from site</span>}
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — sample muster.</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
          <span className="badge p">P {counts.p}</span>
          <span className="badge h">½ {counts.h}</span>
          <span className="badge a">A {counts.a}</span>
          <span className="badge gray">Pending {counts.pend}</span>
          {counts.else > 0 && <span className="badge info">Elsewhere {counts.else}</span>}
          <span className="muted" style={{ marginLeft: "auto", fontSize: 11.5 }}>{rows ? rows.length : "…"} workers</span>
        </div>
        <input placeholder="🔎 Search worker / role…" value={q} onChange={e => setQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
        {msg && <div className="note green">{msg}</div>}
        {err && <div className="note red">{err}</div>}
        {rows?.[0]?.marksUnavailable && canProxy && <div className="note amber">Absent marking not enabled yet — run pipeskool_muster_absent.sql (update 186).</div>}

        {!rows ? <div className="muted">Loading…</div> : shown.length === 0 ? <div className="muted">No workers match.</div> : shown.map(r => {
          const locked = r.verify === "verified";
          return (
            <div className="m-row" key={r.id} style={{ flexWrap: "wrap", rowGap: 6 }}>
              <div className="avatar" onClick={() => setSheet({ workerId: r.id, name: r.name })} style={{ cursor: "pointer" }}>{initials(r.name)}</div>
              <div className="info" onClick={() => setSheet({ workerId: r.id, name: r.name })} style={{ cursor: "pointer" }}>
                <div className="nm">{r.name} <span className="muted" style={{ fontWeight: 400 }}>›</span></div>
                <div className="dt">{r.cat} · {r.lab}{r.in ? ` · In ${r.in}` : ""}{r.out ? ` — Out ${r.out}` : ""}{r.hours ? ` · ${fmtHM(r.hours)}` : ""}{r.otEligible === false ? "" : r.otApproved ? ` · OT ${fmtHM(r.otApprovedHours)} ✓` : r.ot ? ` · extra ${fmtHM(r.ot)} after shift (no OT unless approved)` : ""}</div>
                {r.punch === "proxy" && <div className="flag">📷 Proxy punch — photo on file</div>}
                {r.elsewhere && <div style={{ fontSize: 12, color: "var(--green)", marginTop: 2 }}>🟢 Present at another site<br /><span className="muted">Site: {r.elsewhere.site} | Time: {r.elsewhere.time}</span></div>}
                {r.absentMark && !r.attId && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 2 }}>Marked absent{r.absentMark.by ? ` by ${r.absentMark.by}` : ""} · {r.absentMark.at}{r.absentMark.reason ? ` · ${r.absentMark.reason}` : ""}</div>}
                {r.absentMark && r.attId && <div className="muted" style={{ fontSize: 11.5 }}>(Was marked absent, later punched — punch wins)</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                {r.elsewhere ? <span className="badge p">P · elsewhere</span>
                  : r.status === "present" ? <span className="badge p">P</span>
                  : r.status === "half_day" ? <span className="badge h">½</span>
                  : r.status === "absent" || r.absentMark ? <span className="badge a">A</span>
                  : r.in && !r.out ? <span className="badge gray">On site</span>
                  : <span className="badge gray">Pending</span>}
                {locked ? <span className="badge p" style={{ fontSize: 10 }}>✓ Verified</span> : r.attId && !r.elsewhere ? <span className="badge warn" style={{ fontSize: 10 }}>Unverified</span> : null}
              </div>
              <div style={{ flexBasis: "100%", display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 48 }}>
                {r.elsewhere ? (
                  <span className="muted" style={{ fontSize: 11.5 }}>Absent / proxy disabled — attendance already recorded at {r.elsewhere.site}.</span>
                ) : (
                  <>
                    {r.attId && canVerify && !locked && <button style={{ ...btn, borderColor: "var(--green)", color: "var(--green)" }} disabled={busy} onClick={() => doVerify(r)}>✓ Verify</button>}
                    {r.otEligible !== false && r.attId && (canVerify || canProxy) && (!locked || canEditLocked) && <button style={btn} onClick={() => { setOtFor(r); setOtHrs(String(r.otApprovedHours ?? otRound(r.ot))); }}>+ OT</button>}
                    {r.in && !r.out && canProxy && <button style={btn} onClick={() => startProxy(r, "out")}>Mark out</button>}
                    {!r.attId && canProxy && <button style={{ ...btn, background: "var(--brand)", color: "#fff", border: 0 }} onClick={() => startProxy(r, "in")}>📷 Mark present</button>}
                    {!r.attId && !r.absentMark && canProxy && <button style={{ ...btn, borderColor: "var(--red)", color: "var(--red)" }} onClick={() => { setAbsFor(r); setAbsReason(""); }}>Absent</button>}
                    {!r.attId && r.absentMark && canProxy && <button style={btn} onClick={() => undoAbsent(r)}>Undo absent</button>}
                    {locked && !canEditLocked && <span className="muted" style={{ fontSize: 11 }}>Locked after verification — office can edit.</span>}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {showCam && <CameraCapture facing="environment" title={`Live photo of ${target?.name || "worker"} at site`} onCapture={onPhoto} onCancel={() => { setShowCam(false); setTarget(null); }} />}
        <div className="note amber" style={{ marginTop: 14 }}>
          "Mark present" needs a live photo of the worker at site (camera only, flagged as proxy). Attendance is one record per worker per day across all sites.
          After verification the row locks — corrections need Office Admin / Director.
        </div>
      </div>

      {canVerify && rows && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 56, maxWidth: 430, margin: "0 auto", background: "#fff", borderTop: "1px solid var(--border)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, zIndex: 40 }}>
          <div style={{ fontSize: 12.5 }}><b>{pending.length}</b> pending verification<div className="muted" style={{ fontSize: 11 }}>{rows.filter(r => r.verify === "verified" && !r.elsewhere).length} verified · {noPunch} no punch yet</div></div>
          <button className="primary" style={{ marginLeft: "auto", padding: "10px 16px", fontSize: 14 }} disabled={busy || pending.length === 0} onClick={doVerifyAll}>✓ Verify all ({pending.length})</button>
        </div>
      )}

      {otFor && (
        <div onClick={() => setOtFor(null)} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={sheetBox}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>+ OT · {otFor.name}</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Extra time after shift end: {fmtHM(otFor.ot)} → suggested OT {otRound(otFor.ot)} h (rule: up to 1 h = 0, then round half-hour up). Wages use only what you approve here.</div>
            <input type="number" inputMode="decimal" step="0.5" min="0" max="12" value={otHrs} onChange={e => setOtHrs(e.target.value)} placeholder="OT hours" style={{ width: "100%", fontSize: 18 }} autoFocus />
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{[0, otRound(otFor.ot), 1, 2, 3].filter((v, i, a) => a.indexOf(v) === i).map(h => <button key={h} style={h === otRound(otFor.ot) && h > 0 ? { ...btn, borderColor: "var(--copper)", color: "var(--copper-deep)", fontWeight: 700 } : btn} onClick={() => setOtHrs(String(h))}>{h} h{h === otRound(otFor.ot) && h > 0 ? " ★" : ""}</button>)}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="primary" style={{ flex: 1 }} disabled={busy} onClick={saveOt}>Save OT</button>
              <button onClick={() => setOtFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {absFor && (
        <div onClick={() => setAbsFor(null)} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={sheetBox}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Mark absent · {absFor.name}</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Today at {siteName}. If the worker later punches in at any site, the punch overrides this mark.</div>
            <input value={absReason} onChange={e => setAbsReason(e.target.value)} placeholder="Reason (optional)" style={{ width: "100%" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="primary" style={{ flex: 1, background: "var(--red)", borderColor: "var(--red)" }} disabled={busy} onClick={saveAbsent}>Mark absent</button>
              <button onClick={() => setAbsFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {sheet && (
        <div onClick={() => setSheet(null)} style={{ ...overlay, zIndex: 80, background: "rgba(0,0,0,0.5)" }}>
          <div onClick={e => e.stopPropagation()} style={{ ...sheetBox, maxHeight: "92vh", overflowY: "auto", padding: "14px 14px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="avatar">{initials(sheet.name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{sheet.name}</div>
                {sheetData && <div className="muted" style={{ fontSize: 12 }}>ID {sheetData.worker.id} · {sheetData.worker.category} · {sheetData.worker.labour} · {sheetData.worker.site}{sheetData.worker.joined ? ` · since ${sheetData.worker.joined}` : ""}</div>}
              </div>
              <button style={btn} onClick={() => setSheet(null)}>✕</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 0", flexWrap: "wrap" }}>
              <button style={btn} onClick={() => setSheetYm(shiftYm(sheetYm, -1))}>‹</button>
              <div style={{ fontWeight: 600 }}>{ymLabel(sheetYm)}</div>
              <button style={btn} onClick={() => setSheetYm(shiftYm(sheetYm, 1))} disabled={sheetYm >= ymNow()}>›</button>
              <button style={{ ...btn, marginLeft: "auto" }} onClick={exportCsv} disabled={!sheetData}>⬇ Report</button>
              <a href={`/attendance/slip?worker=${sheet.workerId}&month=${sheetYm}`} target="_blank" rel="noreferrer"><button style={btn} disabled={!sheetData}>🖨 Slip / PDF</button></a>
            </div>
            {!sheetData ? <div className="muted">Loading…</div> : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                  {[["Present", sheetData.present + (sheetData.half ? ` +${sheetData.half}½` : ""), "var(--green)", null],
                    ["Absent ▾", sheetData.absent, "var(--red)", "absent"],
                    ...(sheetData.worker.otEligible ? [["OT ✓", fmtHM(sheetData.otHours), "var(--brand-dark)", null]] : []),
                    ["Earned", inr(sheetData.gross), "var(--text)", null]].map(([l, v, c, click]) => (
                    <div key={l} onClick={click === "absent" ? () => setShowAbsent(x => !x) : undefined} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 6px", textAlign: "center", cursor: click ? "pointer" : "default" }}><div className="muted" style={{ fontSize: 10.5 }}>{l}</div><div style={{ fontWeight: 700, fontSize: 15, color: c }}>{v}</div></div>
                  ))}
                </div>
                <div className="muted" style={{ fontSize: 11.5, margin: "8px 0" }}>
                  Absent = {sheetData.absentRows} recorded + {sheetData.noRecord} no-punch days of {sheetData.daysElapsed} (incl. {sheetData.sundays} Sundays) · Hours {fmtHM(sheetData.totalHours)} · Daily wage {inr(sheetData.worker.wage)}{sheetData.worker.otEligible ? <> · OT rate ₹{sheetData.worker.otRate}/h (wage ÷ {sheetData.worker.stdHrs} h) · OT amount {inr(sheetData.otAmt)}</> : <> · <b>Not OT-eligible</b> (extra hours are not paid as OT)</>} · Days pay {inr(sheetData.earned)}. Final wages come from the Wages page (advances deducted).
                </div>
                {showAbsent && (
                  <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 4 }}>Absent days ({sheetData.month})</div>
                    {sheetData.absentList.length === 0 && sheetData.noRecord === 0 ? <div className="muted" style={{ fontSize: 12 }}>No absent records.</div> : (
                      <>
                        {sheetData.absentList.map((a, i) => <div key={i} style={{ fontSize: 12, padding: "2px 0" }}>{a.date.slice(8)}/{a.date.slice(5, 7)} — {a.site || "—"} — {a.status}{a.reason ? " — " + a.reason : ""}</div>)}
                        {sheetData.noRecord > 0 && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>+ {sheetData.noRecord} day(s) with no punch and no record (counted absent in the summary, incl. Sundays paid separately in wages).</div>}
                      </>
                    )}
                  </div>
                )}
                <div style={{ fontWeight: 600, fontSize: 13, margin: "6px 0 4px" }}>Date-wise attendance</div>
                <div style={{ overflowX: "auto" }}>
                  <table className="dt-compact" style={{ width: "100%", fontSize: 11.5 }}>
                    <thead><tr><th>Date</th><th>In</th><th>Out</th><th className="num">Hrs</th><th>Status</th>{sheetData.worker.otEligible && <th className="num">OT ✓</th>}<th>Site</th></tr></thead>
                    <tbody>
                      {sheetData.days.length === 0 ? <tr><td colSpan={sheetData.worker.otEligible ? 7 : 6} className="muted">No attendance this month.</td></tr> : sheetData.days.map(d => (
                        <tr key={d.id}>
                          <td>{d.date.slice(8)}/{d.date.slice(5, 7)}</td><td>{d.in}</td><td>{d.out}</td><td className="num">{d.hours ? fmtHM(d.hours) : "—"}</td>
                          <td>{d.status === "present" ? <span className="badge p">P</span> : d.status === "half_day" ? <span className="badge h">½</span> : d.status === "absent" ? <span className="badge a">A</span> : <span className="badge gray">{d.status}</span>}{d.punch === "proxy" ? " 📷" : ""}{d.verify === "verified" ? " ✓" : ""}</td>
                          {sheetData.worker.otEligible && <td className="num">{d.otApproved ? fmtHM(d.otApproved) : "—"}</td>}{/* approved only (spec 11) */}
                          <td className="muted">{d.site}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, margin: "10px 0 4px" }}>Salary history (wage payouts)</div>
                {sheetData.history.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No payouts generated yet.</div> : (
                  <table className="dt-compact" style={{ width: "100%", fontSize: 11.5 }}>
                    <thead><tr><th>Month</th><th className="num">Days</th><th className="num">OT h</th><th className="num">Gross</th><th className="num">Adv</th><th className="num">Net</th><th>Status</th></tr></thead>
                    <tbody>{sheetData.history.map(h => <tr key={h.month}><td>{h.month}</td><td className="num">{Number(h.days_full) + Number(h.days_half) * 0.5}</td><td className="num">{h.ot_hours}</td><td className="num">{inr(h.gross)}</td><td className="num">{inr(h.advances_deducted)}</td><td className="num"><b>{inr(h.net)}</b></td><td><span className="badge gray">{h.status}</span></td></tr>)}</tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <MobileNav />
    </div>
  );
}
