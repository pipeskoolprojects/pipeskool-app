"use client";
// update479: Attendance Register — IT Executive view. Selected by role in app/attendance/page.js; every other role
// keeps AttendanceClassic (the register as it was). Reference: pipeskool-attendance-register-redesign.html.
// All figures come from fn_att_it_summary / fn_att_it_register (SQL aggregation, site-scoped, IT-only) through
// lib/attendanceIT.js. Actions reuse the existing APIs and rights: verify (attendance·verify / manage), OT approve,
// edit punch, not-punched marks.
import "@/app/attendance/it-register.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getItAttSummary, getItAttRegister, getItAttPendingIds, getItAttAllRows, itVerifyRows, invalidateItAtt, hm, ddmmyyyy, shiftDate, FORBIDDEN } from "@/lib/attendanceIT";
import { getSites, approveOt, editAttendanceRow, getNotPunched, markNotPunched, overrideAbsentMark, getAbsentMarks, getSiteCutoffs, setSiteCutoff, getPunchFailures } from "@/lib/data";
import { getSession, canAnySite } from "@/lib/auth";
import { todayLocal } from "@/lib/today";
import { fmtHM } from "@/lib/payroll";
import { getHolidayMap } from "@/lib/holidays";

const INK = "#1d2a35", PAPER = "#f2efe7", ORG = "#ff5a1f", GR = "#2a9d6a", RD = "#cf3b2e", AM = "#e1a21a", BL = "#3f6fd1", MUTE = "#5d6b78";
const F2 = '"Cascadia Mono","SF Mono",Menlo,Consolas,"Liberation Mono",monospace';
const PER = 25;
const TABS = [["office", "Office staff"], ["site_staff", "Site staff"], ["labour", "Workers / Labour"], ["notpunched", "Not punched"]];
const SORT_KEYS = { date: null, worker: "worker", category: "category", contractor: "contractor", site: "site", gps: "gps", in: "in", pos: "in", out: "out", hours: "hours", status: "status", ot: "ot", punch: "punch", verify: "verify" };
const useReducedMotion = () => { const [rm, setRm] = useState(false); useEffect(() => { try { const m = matchMedia("(prefers-reduced-motion: reduce)"); setRm(m.matches); const h = e => setRm(e.matches); m.addEventListener("change", h); return () => m.removeEventListener("change", h); } catch {} }, []); return rm; };
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
const track = (min, shift) => ({ left: Math.max(0, Math.min(95, ((min ?? 480) - 480) / 120 * 100)) + "%", line: Math.max(0, Math.min(100, ((shift ?? 540) - 480) / 120 * 100)) + "%" });

export default function ITAttendanceRegister() {
  const rm = useReducedMotion();
  const [date, setDate] = useState(() => todayLocal());
  const [site, setSite] = useState("all");
  const [sites, setSites] = useState([]);
  const [sum, setSum] = useState({ loading: true, data: null, error: "" });
  const [reg, setReg] = useState({ loading: true, data: null, error: "" });
  const [tab, setTab] = useState("labour");
  const [f, setF] = useState({ search: "", category: "", contractor: "", site_id: "", status: "", punch: "", verify: "" });
  const [dq, setDq] = useState("");
  const [sort, setSort] = useState({ key: "in", dir: "asc" });
  const [page, setPage] = useState(0);
  const [np, setNp] = useState({ rows: [] }); const [marks, setMarks] = useState([]); const [cutoffs, setCutoffs] = useState([]); const [fails, setFails] = useState([]);
  const [photo, setPhoto] = useState(null); const [otEdit, setOtEdit] = useState(null); const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(""); const [refreshedAt, setRefreshedAt] = useState(null); const [tick, setTick] = useState(0);
  const [session, setSession] = useState(null);
  useEffect(() => { setSession(getSession()); getSites().then(setSites); try { const sp = new URLSearchParams(window.location.search); if (sp.get("site")) setSite(String(sp.get("site"))); if (sp.get("tab") === "notpunched") setTab("notpunched"); } catch {} }, []);
  useEffect(() => { const t = setTimeout(() => setDq(f.search.trim()), 300); return () => clearTimeout(t); }, [f.search]);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 15000); return () => clearInterval(t); }, []);
  const canVerify = !!session && (canAnySite(session, "attendance", "verify") || canAnySite(session, "attendance", "manage"));
  const toastT = useRef(0); const dateRef = useRef(null);
  const say = m => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2600); };
  const [holName, setHolName] = useState("");   // update246 parity: the date is a company holiday
  useEffect(() => { const next = shiftDate(date, 1); getHolidayMap(site && site !== "all" ? site : null, date, next).then(m => setHolName(m[date] || "")).catch(() => setHolName("")); }, [date, site]);

  const q = useMemo(() => ({ tab: tab === "notpunched" ? "labour" : tab, filters: { ...f, search: dq }, sort: sort.key, dir: sort.dir, offset: page * PER, limit: PER }), [tab, f, dq, sort, page]);
  const loadSummary = useCallback(() => { setSum(s => ({ ...s, loading: true, error: "" })); return getItAttSummary(date, site).then(d => setSum({ loading: false, data: d.ok ? d : null, error: d.ok ? "" : d.error })).catch(e => setSum({ loading: false, data: null, error: String(e) })); }, [date, site]);
  const loadReg = useCallback(() => { setReg(s => ({ ...s, loading: true, error: "" })); return getItAttRegister(date, site, q).then(d => setReg({ loading: false, data: d.ok ? d : null, error: d.ok ? "" : d.error })).catch(e => setReg({ loading: false, data: null, error: String(e) })); }, [date, site, q]);
  const loadNp = useCallback(() => { getNotPunched(date, site).then(setNp); if (tab === "notpunched") { getAbsentMarks(date, site && site !== "all" ? [Number(site)] : null).then(setMarks); getSiteCutoffs().then(setCutoffs); } }, [date, site, tab]);
  useEffect(() => { loadSummary(); setRefreshedAt(Date.now()); getPunchFailures(date).then(setFails).catch(() => {}); }, [loadSummary, date]);
  useEffect(() => { loadReg(); }, [loadReg]);
  useEffect(() => { loadNp(); }, [loadNp]);
  useEffect(() => { setPage(0); }, [tab, f, dq, sort, date, site]);
  const refreshAll = () => { invalidateItAtt(); loadSummary(); loadReg(); loadNp(); setRefreshedAt(Date.now()); };
  useEffect(() => { const h = e => { if (e.key === "Escape") { setPhoto(null); setOtEdit(null); } }; addEventListener("keydown", h); return () => removeEventListener("keydown", h); }, []);

  // ---- actions (same APIs / rights as the classic register) ----
  async function verify(ids, label) {
    if (!canVerify) { say("YOU DO NOT HAVE THE VERIFY RIGHT"); return; }
    const list = ids.filter(Boolean); if (!list.length) return;
    const prev = reg.data, prevSum = sum.data;
    setReg(s => s.data ? { ...s, data: { ...s.data, pending: Math.max(0, (s.data.pending || 0) - list.length), rows: s.data.rows.map(r => list.includes(r.id) && r.verify === "pending" ? { ...r, verify: "verified" } : r) } } : s);
    setSum(s => s.data ? { ...s, data: { ...s.data, pipeline: { ...s.data.pipeline, verified: s.data.pipeline.verified + list.length, pending: Math.max(0, s.data.pipeline.pending - list.length) } } } : s);   // optimistic; the server figures replace this in a moment
    const r = await itVerifyRows(list);
    if (!r.ok) { setReg(s => ({ ...s, data: prev })); setSum(s => ({ ...s, data: prevSum })); say("COULD NOT VERIFY · " + r.error); return; }
    say(r.verified ? `VERIFIED · ${label || r.verified + " ENTR" + (r.verified === 1 ? "Y" : "IES")}` : "ALREADY VERIFIED");
    loadSummary(); loadReg();
  }
  async function verifyVisible() {
    const ids = await getItAttPendingIds(date, site, q);
    if (!ids.length) { say("NOTHING PENDING IN THIS VIEW"); return; }
    if (ids.length > 20 && !window.confirm(`Verify ${ids.length} pending entries in the current view?`)) return;
    verify(ids, ids.length + " ENTRIES");
  }
  async function saveOt() {
    setBusy(true); const res = await approveOt(otEdit.id, otEdit.value, getSession()?.id || 1); setBusy(false);
    if (!res.ok) { say("COULD NOT APPROVE OT · " + res.error); return; }
    setOtEdit(null); say("OT APPROVED · " + otEdit.worker); invalidateItAtt(); loadSummary(); loadReg();
  }
  async function editRow(r) {   // same dialog as the classic register (update277)
    const hhmm = v => (v && v !== "—") ? v : "";
    const inT = prompt(`${r.worker} — punch-IN time (HH:MM, 24h). Leave blank to keep:`, hhmm(r.in)); if (inT === null) return;
    const outT = prompt(`${r.worker} — punch-OUT time (HH:MM, 24h). Leave blank to keep:`, hhmm(r.out)); if (outT === null) return;
    const st = prompt("Force status? Type present / half_day / absent — or leave blank to compute from the times:", ""); if (st === null) return;
    const note = prompt("Reason for the correction (logged):", ""); if (note === null) return;
    const res = await editAttendanceRow(r.id, { inHHMM: inT.trim(), outHHMM: outT.trim(), status: st.trim() || null, note });
    if (!res.ok) { say("COULD NOT CORRECT · " + res.error); return; }
    say(`${r.worker.toUpperCase()}: CORRECTED → ${res.hours} H, ${String(res.status).replace("_", " ").toUpperCase()}`); invalidateItAtt(); loadSummary(); loadReg();
  }
  async function actNp(r, status) {
    const reason = window.prompt(`${status === "present" ? "Mark PRESENT" : status === "leave" ? "Mark LEAVE" : "Mark ABSENT"} — ${r.worker} · ${r.site} · ${date}\n\nReason (required, logged with your name):`); if (reason == null) return; if (!reason.trim()) { window.alert("A reason is required."); return; }
    const x = await markNotPunched(r.id, date, status, reason.trim()); if (!x.ok) { window.alert(x.error); return; } refreshAll();
  }
  async function overrideMark(m, status) {
    const reason = window.prompt(`Override ${m.workers?.full_name}'s ${m.auto ? "AUTO-absent" : "absent"} on ${date} → ${status.toUpperCase()}\n\nReason (required, logged):`); if (reason == null) return; if (!reason.trim()) { window.alert("A reason is required."); return; }
    const x = await overrideAbsentMark(m.id, status, reason.trim()); if (!x.ok) { window.alert(x.error); return; } refreshAll();
  }
  async function exportCsv() {
    const all = await getItAttAllRows(date, site, q);
    if (!all.ok) { say("EXPORT FAILED · " + all.error); return; }
    const cols = [["Date", () => ddmmyyyy(date)], ["Worker", r => r.worker], ["Category", r => r.category], ["Labour", r => r.contractor], ["Site", r => r.site],
      ["GPS", r => (r.in_dist != null ? "in " + r.in_dist + "m" : "") + (r.out_dist != null ? " out " + r.out_dist + "m" : "")], ["In", r => r.in], ["Out", r => r.out], ["Hrs", r => r.hours ? fmtHM(r.hours) : ""],
      ["Status", r => r.status + (r.review_status === "needs_review" ? " (auto-closed, needs review)" : "")], ["OT", r => (r.otApproved ? r.otApprovedHours : r.ot)], ["Punch / photo", r => r.punch], ["Verification", r => r.verify]];
    const esc = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [cols.map(c => c[0]).join(","), ...all.rows.map(r => cols.map(c => esc(c[1](r))).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); a.download = `attendance_${date}_${tab}_${todayLocal()}.csv`; document.body.appendChild(a); a.click(); a.remove();
    say(`EXPORTED · ${all.rows.length} ROWS`);
  }

  const d = sum.data, P = d?.pipeline, I = d?.instruments, shift = d?.scope?.shift_start || "09:00";
  const counts = reg.data?.options?.counts || d?.counts || {};
  const ago = refreshedAt ? Math.round((Date.now() - refreshedAt) / 60000) : 0;
  const onTh = key => { const k = SORT_KEYS[key]; if (!k) return; setSort(s => ({ key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc" })); };
  const arrow = key => (SORT_KEYS[key] && sort.key === SORT_KEYS[key]) ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  const rows = reg.data?.rows || [], total = reg.data?.total || 0, pages = Math.max(1, Math.ceil(total / PER)), pendingHere = reg.data?.pending || 0;
  const opts = reg.data?.options || {};
  const forbidden = sum.error === FORBIDDEN;

  return (
    <div className="ita" id="ita-root" data-view="it-attendance">
      <div className="sheet">
        <header className="ttl">
          <div><img src="/pipeskool-logo.svg" alt="Pipeskool" /></div>
          <div><span className="lb">SHEET</span><b>Attendance register</b>{holName && <span className="tg y" style={{ marginLeft: 8, verticalAlign: "middle" }} title="Company holiday">Holiday · {holName}</span>}</div>
          <div><span className="lb">DATE</span><div className="dn"><button type="button" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>‹</button><b role="button" tabIndex={0} title="Pick a date" onClick={() => { const i = dateRef.current; if (!i) return; try { i.showPicker(); } catch { i.focus(); } }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const i = dateRef.current; try { i.showPicker(); } catch { i.focus(); } } }}>{ddmmyyyy(date)}</b><input ref={dateRef} type="date" aria-label="Date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /><button type="button" aria-label="Next day" onClick={() => setDate(shiftDate(date, 1))}>›</button></div></div>
          <div><span className="lb">SITE</span><select aria-label="Site" value={site} onChange={e => setSite(e.target.value)}><option value="all">All sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><span className="lb">PUNCH STATUS</span><b className="m" id="ita-pending">{P ? P.pending + " PENDING" : sum.loading ? "…" : "–"}</b></div>
          <div><button type="button" className="sq" title="Refresh" aria-label="Refresh" onClick={refreshAll}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" /></svg></button><span style={{ font: "500 10.5px " + F2, color: MUTE }}>{refreshedAt ? "REFRESHED · " + (ago < 1 ? "JUST NOW" : ago + " MIN AGO") : ""}</span></div>
        </header>
        {forbidden && <section className="pn s12" style={{ marginBottom: 14 }}><div className="err">{FORBIDDEN}</div></section>}
        {fails.length > 0 && <section className="pn s12" style={{ marginBottom: 14 }}><div className="note2"><span><b>{fails.length} PUNCH ATTEMPT{fails.length > 1 ? "S" : ""} REJECTED ON {ddmmyyyy(date)}</b> — {fails.slice(0, 12).map((x, i) => `${x.name} (${x.site} · ${x.reason}${x.dist ? " " + x.dist + "m" : ""} · ${x.time})`).join(", ")}{fails.length > 12 ? " +" + (fails.length - 12) + " more" : ""}</span></div></section>}
        <main className="grid">
          <section className="pn s12" aria-label="Verification flow"><div className="ph"><span>FIG. 1</span><b>Verification flow</b><i>punch to muster roll</i></div>
            <Panel st={sum} retry={loadSummary}>{P && <Pipeline P={P} rm={rm} />}</Panel></section>
          <section className="pn s7" aria-label="Punch-in time histogram"><div className="ph"><span>FIG. 2</span><b>Punch-in time · pending vs verified</b><i>drag to rotate</i></div>
            <div className="lg2"><span><i style={{ background: ORG }} />PENDING</span><span><i style={{ background: RD }} />PENDING · LATE</span><span><i style={{ background: GR }} />VERIFIED</span></div>
            <Panel st={sum} retry={loadSummary}>{d && <Histo hist={d.hist} shift={shift} rm={rm} />}</Panel></section>
          <section className="pn s5" aria-label="Instruments"><div className="ph"><span>FIG. 3</span><b>Instruments</b><i>live</i></div>
            <Panel st={sum} retry={loadSummary}>{I && <Instruments I={I} P={P} shift={shift} rm={rm} />}</Panel></section>
          <section className="pn s4" aria-label="Arrival curve"><div className="ph"><span>FIG. 4</span><b>Arrival curve</b><i>cumulative present</i></div>
            <Panel st={sum} retry={loadSummary}>{d && <Arrival arr={d.arrival} max={P.punched} shift={shift} rm={rm} />}</Panel></section>
          <section className="pn s4" aria-label="Present by site"><div className="ph"><span>FIG. 5</span><b>Present vs on roll · by site</b></div>
            <Panel st={sum} retry={loadSummary}>{d && <SitesChart sites={d.sites} />}</Panel></section>
          <section className="pn s4" aria-label="Labour mix"><div className="ph"><span>FIG. 6</span><b>Labour mix</b></div>
            <Panel st={sum} retry={loadSummary}>{d && <Mix mix={d.mix} total={I.labour_present} />}</Panel></section>
          <section className="pn s6" aria-label="Last 7 days"><div className="ph"><span>FIG. 7</span><b>Last 7 days</b><i>present · verified</i></div>
            <Panel st={sum} retry={loadSummary}>{d && <Week week={d.week} rm={rm} />}</Panel></section>
          <section className="pn s6"><div className="ph"><span>NOTE</span><b>How to read</b></div>
            <div style={{ padding: "12px 14px", font: "500 12px/1.7 " + F2, color: MUTE }}>Orange / red bars in FIG. 2 are punches waiting for verification, green are verified. Red = punched in after the site shift start ({shift}{d?.scope?.shift_mixed ? ", most common of the sites in scope" : ""}{d?.scope?.shift_default_used ? "; a site without timings uses 09:00" : ""}). The track in each row shows where the punch falls between 08:00 and 10:00 (red line = shift start). Proxy punches have no GPS – check the photo before verifying. FIG. 5 marks the people on roll per site: planned manpower is not recorded in the ERP.</div></section>

          <section className="pn s12" aria-label="Register"><div className="ph"><span>REGISTER</span><b>Attendance register</b><i>{ddmmyyyy(date)}</i></div>
            <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button type="button" role="tab" aria-selected={tab === k} key={k} className={"tb " + (tab === k ? "on" : "")} onClick={() => setTab(k)}>{l} · {k === "notpunched" ? (np.rows || []).length : (counts[k] ?? "–")}</button>)}</div>
            {tab === "notpunched" ? <NotPunched np={np} marks={marks} cutoffs={cutoffs} site={site} date={date} session={session} actNp={actNp} overrideMark={overrideMark} onCutoff={async () => { const sid = site && site !== "all" ? Number(site) : Number(window.prompt("Site id to configure (pick a site in the filter to skip this):", "")); if (!sid) return; const sc = cutoffs.find(x => x.id === sid); const cutoff = window.prompt("Auto-absent cutoff (HH:MM, IST):", sc ? String(sc.auto_absent_time).slice(0, 5) : "18:00"); if (!cutoff) return; const rem = window.prompt("First reminder time (HH:MM, IST):", sc ? String(sc.reminder_time).slice(0, 5) : "11:00"); if (!rem) return; const x = await setSiteCutoff(sid, cutoff, rem); if (!x.ok) window.alert(x.error); loadNp(); }} /> : (<>
            <div className="fl2">
              <input id="ita-q" placeholder="Search worker…" aria-label="Search" value={f.search} onChange={e => setF(x => ({ ...x, search: e.target.value }))} />
              <Sel label="Category" v={f.category} set={v => setF(x => ({ ...x, category: v }))} items={(opts.category || []).map(c => [c, c])} />
              <Sel label="Labour" v={f.contractor} set={v => setF(x => ({ ...x, contractor: v }))} items={(opts.contractor || []).map(c => [c, c])} />
              <Sel label="Site" v={f.site_id} set={v => setF(x => ({ ...x, site_id: v }))} items={(opts.site || []).map(s => [String(s.id), s.name])} />
              <Sel label="Status" v={f.status} set={v => setF(x => ({ ...x, status: v }))} items={(opts.status || []).map(s => [s, s.replace("_", " ")])} />
              <Sel label="Punch" v={f.punch} set={v => setF(x => ({ ...x, punch: v }))} items={[["proxy", "Proxy"], ["self", "Self"]]} />
              <Sel label="Verification" v={f.verify} set={v => setF(x => ({ ...x, verify: v }))} items={[["pending", "Pending"], ["verified", "Verified"], ["corrected", "Corrected"]]} />
              <span className="sp" />
              {canVerify && <button type="button" className="bt2 g" onClick={verifyVisible} disabled={!pendingHere}>✓ Verify visible ({pendingHere})</button>}
              <button type="button" className="bt2" onClick={exportCsv} disabled={!total}>Export Excel</button>
            </div>
            {reg.error ? <div className="err">{reg.error} <button type="button" className="bt2" onClick={loadReg}>Retry</button></div> : reg.loading && !reg.data ? <div className="skel" aria-busy="true" /> : !rows.length ? <div className="empty">NO RECORDS FOR THIS VIEW</div> : (
              <div style={{ overflowX: "auto" }}><table className="rt" aria-busy={reg.loading}>
                <thead><tr>{[["date", "Date"], ["worker", "Worker"], ["category", "Category"], ["contractor", "Labour"], ["site", "Site"], ["gps", "GPS"], ["in", "In"], ["pos", "Punch-in position"], ["out", "Out"], ["hours", "Hrs"], ["status", "Status"], ["ot", "OT"], ["punch", "Punch / photo"], ["verify", "Verification"], ["edit", ""]].map(([k, l]) =>
                  <th key={k} onClick={() => onTh(k)} aria-sort={SORT_KEYS[k] && sort.key === SORT_KEYS[k] ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>{SORT_KEYS[k] ? <button type="button">{l}{arrow(k)}</button> : l}</th>)}</tr></thead>
                <tbody>{rows.map(r => { const t = track(r.inMin, r.shiftMin), dev = r.otApproved && r.otApprovedHours != null && r.otApprovedHours !== r.ot; return (
                  <tr key={r.id} className={r.verify === "verified" ? "v" : ""}>
                    <td className="n">{ddmmyyyy(date)}</td>
                    <td>{r.workerId ? <a href={"/attendance/slip?worker=" + r.workerId + "&month=" + String(date).slice(0, 7)} target="_blank" rel="noreferrer" title="Open full profile / slip">{r.worker}</a> : <b>{r.worker}</b>}</td>
                    <td>{r.category}</td><td>{r.contractor}</td>
                    <td>{r.site}{r.out_site_id && String(r.out_site_id) !== String(r.site_id || "") ? <small>→ out @ other site</small> : null}</td>
                    <td className="n">{r.in_dist == null && r.out_dist == null ? "—" : <>{r.in_dist != null ? "in " + r.in_dist + "m" : ""}{r.out_dist != null ? (r.in_dist != null ? " · " : "") + "out " + r.out_dist + "m" : ""}</>}</td>
                    <td className="n" style={r.late ? { color: RD } : undefined}>{r.in}{r.late && <span className="sr"> (late)</span>}</td>
                    <td>{r.inMin != null ? <div className="track" role="img" aria-label={`Punched in at ${r.in}, shift ${r.shiftStart}`}><s style={{ left: t.line }} /><i style={{ left: t.left }} /></div> : "–"}</td>
                    <td className="n">{r.out}</td>
                    <td className="n">{r.hours ? fmtHM(r.hours) : "—"}</td>
                    <td><span className={"tg " + (r.status === "present" ? "g" : r.status === "half_day" ? "y" : r.status === "absent" ? "r" : "")}>{r.status === "present" ? "P" : r.status === "half_day" ? "½" : r.status === "absent" ? "A" : "…"}</span>
                      {r.review_status === "needs_review" && <small style={{ color: "#8a5d00", fontWeight: 700 }}>Auto-closed — missing punch-out · held from payroll</small>}{r.auto_closed && r.review_status === "confirmed" && <small>auto-closed · reviewed</small>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.otEligible === false ? <span title="Not OT-eligible (Workers & Staff Master)" style={{ color: MUTE }}>n/e</span> : r.otApproved && Number(r.otApprovedHours) > 0 ? <b>{fmtHM(r.otApprovedHours)}</b> : (r.ot > 0 ? fmtHM(r.ot) : "—")}
                      {r.otApproved && <span className="tg g" style={{ marginLeft: 4 }} title="Approved">✓</span>}{dev && <span className="tg y" style={{ marginLeft: 4 }} title={`Time after shift end: ${fmtHM(r.ot)}`}>⚠ {fmtHM(r.ot)}</span>}
                      {r.otEligible !== false && canVerify && <button type="button" className="bt2 xs" style={{ marginLeft: 6 }} onClick={() => setOtEdit({ id: r.id, worker: r.worker, computed: r.ot, value: r.otApprovedHours ?? (Number(r.ot) <= 1 ? 0 : Math.round(Number(r.ot))) })}>{r.otApproved ? "edit" : "Approve"}</button>}</td>
                    <td style={{ whiteSpace: "nowrap" }}><span className={"tg " + (r.punch === "proxy" ? "y" : "g")}>{r.punch === "proxy" ? "Proxy" : "Self"}</span>
                      {r.photoIn ? <img className="av" src={r.photoIn} alt={"Punch-in photo of " + r.worker} loading="lazy" onClick={() => setPhoto(r)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPhoto(r); } }} tabIndex={0} role="button" /> : <span className="av ph" title="No photo">NO PHOTO</span>}
                      {r.photoOut && <img className="av" src={r.photoOut} alt={"Punch-out photo of " + r.worker} loading="lazy" onClick={() => setPhoto({ ...r, photoIn: r.photoOut, which: "out" })} tabIndex={0} role="button" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPhoto({ ...r, photoIn: r.photoOut, which: "out" }); } }} />}
                      {r.site_manual && <small style={{ color: "#8a5d00", fontWeight: 700 }}>site set by supervisor</small>}</td>
                    <td>{r.verify === "verified" ? <span className="tg g">Verified</span> : r.verify === "corrected" ? <span className="tg b">Corrected</span> : canVerify ? <button type="button" className="bt2 g xs" onClick={() => verify([r.id], r.worker.toUpperCase())}>✓ Verify</button> : <span className="tg y">Pending</span>}</td>
                    <td>{canVerify && <button type="button" className="bt2 xs" title="Correct in/out time or status" aria-label={"Edit punch of " + r.worker} onClick={() => editRow(r)}>✎</button>}</td>
                  </tr>); })}</tbody>
              </table></div>)}
            <div className="pg"><span>{total ? `Showing ${page * PER + 1}–${Math.min(total, (page + 1) * PER)} of ${total}` : "Showing 0 of 0"} · click a column heading to sort</span>
              <div><button type="button" className="bt2" disabled={page <= 0} onClick={() => setPage(0)} aria-label="First page">«</button><button type="button" className="bt2" disabled={page <= 0} onClick={() => setPage(p => p - 1)}>‹ Prev</button><span>Page {page + 1} / {pages}</span><button type="button" className="bt2" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next ›</button><button type="button" className="bt2" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)} aria-label="Last page">»</button></div></div>
            </>)}
            <div className="nt">OT IS THE TIME WORKED AFTER THE SITE'S SHIFT END. TAP A PHOTO TO ENLARGE. ⚠ MEANS APPROVED OT DIFFERS FROM WHAT THE PUNCH-OUT TIME SHOWS.</div>
          </section>
        </main>
      </div>
      {photo && <div className="ov" onClick={() => setPhoto(null)} role="dialog" aria-modal="true" aria-label={"Punch photo · " + photo.worker}>
        <div className="md" onClick={e => e.stopPropagation()}>
          <h4>{photo.worker}</h4><p>{photo.category} · {photo.contractor} · {photo.site}</p>
          {photo.photoIn ? <img src={photo.photoIn} alt={"Punch photo of " + photo.worker} style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", border: "1.5px solid " + INK, background: "#d9d4c8" }} /> : <div className="empty" style={{ border: "1.5px solid " + INK }}>NO PHOTO</div>}
          <p style={{ marginTop: 10 }}>PUNCH {photo.which === "out" ? "OUT " + photo.out : "IN " + photo.in} · {String(photo.punch || "").toUpperCase()}{photo.in_dist != null ? " · GPS IN " + photo.in_dist + "M" : " · NO GPS"}{photo.late ? " · " : ""}{photo.late && <span className="tg r">LATE</span>}{photo.verify === "verified" ? " · VERIFIED" : ""}</p>
          <div className="mf"><button type="button" className="bt2" onClick={() => setPhoto(null)} autoFocus>Close</button>{photo.verify === "pending" && canVerify && <button type="button" className="bt2 g" onClick={() => { setPhoto(null); verify([photo.id], photo.worker.toUpperCase()); }}>✓ Verify</button>}</div>
        </div></div>}
      {otEdit && <div className="ov" onClick={() => setOtEdit(null)} role="dialog" aria-modal="true" aria-label="Approve OT">
        <div className="md" onClick={e => e.stopPropagation()}>
          <h4>Approve OT</h4><p>{otEdit.worker}</p>
          <p>FROM PUNCH-OUT TIME: <b>{otEdit.computed}h</b></p>
          <label style={{ font: "600 9.5px " + F2, letterSpacing: ".14em", color: MUTE }}>APPROVED OT HOURS</label>
          <input value={otEdit.value} inputMode="decimal" autoFocus onChange={e => setOtEdit(o => ({ ...o, value: e.target.value }))} />
          {Number(otEdit.value) !== otEdit.computed && <p style={{ color: "#8a5d00" }}>⚠ This differs from the {otEdit.computed}h the punch-out shows — it will be flagged.</p>}
          <div className="mf"><button type="button" className="bt2" onClick={() => setOtEdit(null)}>Cancel</button><button type="button" className="bt2 g" disabled={busy} onClick={saveOt}>{busy ? "Saving…" : "Approve OT"}</button></div>
        </div></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Sel({ label, v, set, items }) { return <select aria-label={label} value={v} onChange={e => set(e.target.value)}><option value="">{label}: all</option>{items.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>; }
function Panel({ st, retry, children }) {
  if (st.error) return <div className="err">{st.error} <button type="button" className="bt2" onClick={retry}>Retry</button></div>;
  if (st.loading && !st.data) return <div className="skel" aria-busy="true" />;
  return <div style={{ opacity: st.loading ? .6 : 1, transition: "opacity .2s" }}>{children}</div>;
}

/* ============ FIG. 1 pipeline ============ */
function Pipeline({ P, rm }) {
  const N = [["PUNCHED IN", P.punched, "workers & staff"], ["PHOTO · GPS CHECK", P.proxy + " / " + P.self, "proxy / self"], ["VERIFIED", P.verified, P.pending + " pending"], ["OT APPROVED", P.ot_approved, "of " + P.punched], ["MUSTER ROLL", P.verified, "posted for wages"]], xs = [70, 300, 530, 760, 990];
  return (<div className="stg"><svg viewBox="0 0 1100 130" role="img" aria-label={`Verification flow: ${P.punched} punched in, ${P.proxy} proxy and ${P.self} self, ${P.verified} verified with ${P.pending} pending, ${P.ot_approved} OT approved, ${P.verified} on the muster roll`}>
    {[0, 1, 2, 3].map(i => { const a = xs[i] + 78, c = xs[i + 1] - 78; return (<g key={i}>
      <line x1={a} y1="65" x2={c} y2="65" stroke={INK} strokeWidth="20" /><line x1={a} y1="65" x2={c} y2="65" stroke="#8ea3b3" strokeWidth="15" /><line x1={a} y1="61" x2={c} y2="61" stroke="#e3ebf1" strokeWidth="4" />
      <line className={rm ? "" : "fl"} x1={a} y1="65" x2={c} y2="65" stroke={ORG} strokeWidth="6" strokeDasharray="14 30" />
      {!rm && [0, 1, 2].map(k => <rect key={k} x="-5" y="-5" width="10" height="10" opacity="0" fill={i === 2 ? GR : BL} stroke={INK} strokeWidth="1"><set attributeName="opacity" to="1" begin={`${k * 1.05 + i * .3}s`} /><animateMotion dur="3.2s" begin={`${k * 1.05 + i * .3}s`} repeatCount="indefinite" path={`M${a},65 L${c},65`} /></rect>)}
    </g>); })}
    {N.map((nd, i) => { const x = xs[i] - 78, hl = i === 2; return (<g key={i}>
      <rect x={x} y="22" width="156" height="86" fill={hl ? "#fff2ea" : PAPER} stroke={INK} strokeWidth="2" /><rect x={x} y="22" width="156" height="6" fill={hl ? ORG : INK} />
      <text x={x + 10} y="46" fontFamily={F2} fontSize="9.5" fontWeight="600" letterSpacing="1.4" fill={MUTE}>{nd[0]}</text>
      <text x={x + 10} y="80" fontFamily={F2} fontSize="28" fontWeight="700" fill={INK}>{nd[1]}</text>
      <text x={x + 10} y="99" fontFamily={F2} fontSize="10.5" fill={MUTE}>{nd[2]}</text></g>); })}
  </svg></div>);
}

/* ============ FIG. 2 3D histogram (canvas) ============ */
function Histo({ hist, shift, rm }) {
  const cv = useRef(null), st = useRef({ yaw: .62, pitch: .56, H: {}, hit: [], drag: null, raf: 0 }), [yaw, setYaw] = useState(35), [tip, setTip] = useState(null);
  const data = hist || [];
  const shiftIdx = data.findIndex(b => b.start != null && hm(b.start) === shift);
  const draw = useCallback(() => {
    const c = cv.current; if (!c) return; const S = st.current;
    const r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); if (!r.width) return;
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    const K = { cx: r.width / 2, cy: r.height * .7, k: Math.min(r.width / 18.5, r.height / 10) };
    const proj = (x, y, z) => { const cs = Math.cos(S.yaw), sn = Math.sin(S.yaw), x1 = x * cs - z * sn, z1 = x * sn + z * cs, cp = Math.cos(S.pitch), sp = Math.sin(S.pitch); return [K.cx + x1 * K.k, K.cy - (y * cp - z1 * sp) * K.k, z1 * cp + y * sp]; };
    const shade = (h, f) => { const n = parseInt(h.slice(1), 16), q = v => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${q(n >> 16)},${q(n >> 8 & 255)},${q(n & 255)})`; };
    const box = (x, y, z, w, h, dd, col) => { const hw = w / 2, hd = dd / 2, cs = Math.cos(S.yaw), sn = Math.sin(S.yaw), pt = (i, j, k) => proj(x + (i ? hw : -hw), y + (j ? h : 0), z + (k ? hd : -hd));
      [[[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1], 0, 1, 0], [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], 0, 0, -1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], 0, 0, 1], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], -1, 0, 0], [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0], 1, 0, 0]].forEach(f => { const zn = f[4] * sn + f[6] * cs, xn = f[4] * cs - f[6] * sn; if (!f[5] && zn <= 0) return; g.beginPath(); [0, 1, 2, 3].forEach(q => { const p = pt(...f[q]); q ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.closePath(); g.fillStyle = shade(col, f[5] ? 1.14 : .74 + .2 * (-xn)); g.fill(); g.strokeStyle = INK; g.lineWidth = .9; g.stroke(); }); };
    const n = data.length, half = (n - 1) / 2, X = i => (i - half) * 1.05;
    g.strokeStyle = "rgba(29,42,53,.22)"; g.lineWidth = 1;
    for (let x = -half - .5; x <= half + .6; x += 1.05) { const a = proj(x, 0, -1.8), b = proj(x, 0, 1.8); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    for (let z = -1.8; z <= 1.81; z += 1.2) { const a = proj(-half - .5, 0, z), b = proj(half + .5, 0, z); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    const mx = Math.max(1, ...data.map(h => Math.max(h.tot - h.ver, h.ver))); const it = []; S.hit = []; let moving = false;
    data.forEach((h, i) => { const x = X(i), pend = h.pend_ok + h.pend_late, other = Math.max(0, h.tot - h.ver - pend);   // "other" = corrected rows (neither pending nor verified) — drawn in the back row, grey
      [["b", -.55, [[h.pend_ok, ORG], [h.pend_late, RD], [other, "#9fb1c0"]]], ["f", .55, [[h.ver, GR]]]].forEach(([k, z, segs]) => {
        const key = i + k, total = segs.reduce((s, q) => s + q[0], 0), tg = total / mx * 4.6; S.H[key] = rm ? tg : (S.H[key] || 0) + (tg - (S.H[key] || 0)) * .12; if (Math.abs(tg - S.H[key]) > .005) moving = true;
        it.push({ d: proj(x, 0, z)[2], fn: () => { const hh = Math.max(.04, S.H[key]), sc = total ? hh / total : 0; let y0 = 0; segs.forEach(([v, col]) => { if (!v) return; box(x, y0, z, .78, v * sc, .9, col); y0 += v * sc; }); if (!total) box(x, 0, z, .78, .04, .9, k === "f" ? GR : ORG); const p = proj(x, hh, z); if (total) { g.textAlign = "center"; g.font = "700 11px " + F2; g.lineWidth = 3; g.strokeStyle = PAPER; g.fillStyle = INK; g.strokeText(total, p[0], p[1] - 6); g.fillText(total, p[0], p[1] - 6); } S.hit.push({ x: p[0], y: p[1] + 10, r: 22, t: `${h.k === "before" ? "Before 08:00" : h.k === "after" ? "After 10:00" : hm(h.start) + "–" + hm(h.start + 10)} · ${h.tot} punched · ${h.ver} verified · ${pend} pending${h.pend_late ? " (" + h.pend_late + " late)" : ""}` }); } }); }); });
    it.sort((a, b) => a.d - b.d).forEach(i => i.fn());
    data.forEach((h, i) => { if (h.k === "before" || h.k === "after" || (h.start - 480) % 20 === 0) { const p = proj(X(i), 0, .55); g.textAlign = "center"; g.font = "600 10px " + F2; g.fillStyle = MUTE; g.fillText(h.k === "before" ? "<08:00" : h.k === "after" ? ">10:00" : hm(h.start), p[0], p[1] + 22); } });
    if (shiftIdx >= 0) { const xx = X(shiftIdx) - .55, a = proj(xx, 0, -1.8), c2 = proj(xx, 0, 1.8); g.setLineDash([5, 4]); g.strokeStyle = ORG; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c2[0], c2[1]); g.stroke(); g.setLineDash([]); g.fillStyle = ORG; g.font = "700 10px " + F2; g.textAlign = "center"; g.fillText("SHIFT " + shift, c2[0], c2[1] + 36); }
    const yv = Math.round(S.yaw * 57.3); if (yv !== S.lastYaw) { S.lastYaw = yv; setYaw(yv); }
    if (moving && !rm) S.raf = requestAnimationFrame(draw); else S.raf = 0;
  }, [data, shift, shiftIdx, rm]);
  useEffect(() => { const S = st.current; cancelAnimationFrame(S.raf); draw(); const ro = new ResizeObserver(() => { cancelAnimationFrame(S.raf); draw(); }); if (cv.current) ro.observe(cv.current); return () => { ro.disconnect(); cancelAnimationFrame(S.raf); }; }, [draw]);
  const move = e => { const S = st.current, r = cv.current.getBoundingClientRect(); if (S.drag) { S.yaw = Math.max(-.3, Math.min(1.5, S.drag[1] + (e.clientX - S.drag[0]) / 220)); cancelAnimationFrame(S.raf); draw(); }
    const mx = e.clientX - r.left, my = e.clientY - r.top; let b = null, bd = 1e9; S.hit.forEach(h => { const q = Math.hypot(h.x - mx, h.y - my); if (q < h.r && q < bd) { bd = q; b = h; } }); setTip(b ? { t: b.t, x: Math.min(e.clientX + 14, innerWidth - 320), y: e.clientY + 14 } : null); };
  const sr = `Punch-in time buckets: ` + data.map(h => `${h.k === "before" ? "before 08:00" : h.k === "after" ? "after 10:00" : hm(h.start)}: ${h.tot} punched, ${h.ver} verified`).join("; ");
  return (<>
    <canvas ref={cv} className="cvs" role="img" aria-label={sr} onPointerDown={e => { st.current.drag = [e.clientX, st.current.yaw]; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={move} onPointerUp={() => { st.current.drag = null; }} onPointerLeave={() => { st.current.drag = null; setTip(null); }} />
    {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.t}</div>}
    <div className="dim"><span>10-MINUTE BUCKETS · 08:00 – 10:00 · PLUS BEFORE / AFTER</span><span>YAW {yaw}°</span></div>
    <ViewTable head={["Bucket", "Punched", "Verified", "Pending", "Pending late"]} rows={data.map(h => [h.k === "before" ? "before 08:00" : h.k === "after" ? "after 10:00" : hm(h.start), h.tot, h.ver, h.pend_ok + h.pend_late, h.pend_late])} />
  </>);
}
function ViewTable({ head, rows }) { return <details className="vt"><summary>View as table</summary><table><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></details>; }

/* ============ FIG. 3 instruments ============ */
function Instruments({ I, P, shift, rm }) {
  const n = I.punched || 0, vp = n ? I.verified / n : 0, pp = pct(I.proxy, n), R = 34, C = 2 * Math.PI * R, ang = -90 + pp / 100 * 180, avg = I.avg_in_min == null ? null : Number(I.avg_in_min);
  const digits = String(I.present || 0).padStart(2, "0").split("");
  return (<div className="ins">
    <div><span className="l">PRESENT TODAY</span><div className="od" role="img" aria-label={`${I.present} present today`}>{digits.map((c, i) => <i key={i}>{c}</i>)}</div><span className="sm">of {I.on_roll} on roll · {I.labour_present} labour</span></div>
    <div><span className="l">VERIFIED</span><svg className="ring" viewBox="0 0 90 90" width="96" role="img" aria-label={`${Math.round(vp * 100)} percent verified, ${I.verified} of ${n}`}><circle cx="45" cy="45" r={R} fill="none" stroke="#e5e0d4" strokeWidth="12" /><circle cx="45" cy="45" r={R} fill="none" stroke={GR} strokeWidth="12" strokeDasharray={`${vp * C} ${C}`} transform="rotate(-90 45 45)" style={{ transition: rm ? "none" : "stroke-dasharray .8s" }} /><text x="45" y="50" textAnchor="middle" fontFamily={F2} fontSize="17" fontWeight="700" fill={INK}>{Math.round(vp * 100)}%</text></svg><span className="sm" style={{ textAlign: "center" }}>{I.verified} of {n}</span></div>
    <div><span className="l">PROXY PUNCHES</span><svg className="gauge" viewBox="0 0 160 96" role="img" aria-label={`${pp} percent proxy punches`}><path d="M20 78A60 60 0 0 1 70 20" fill="none" stroke={GR} strokeWidth="9" /><path d="M70 20A60 60 0 0 1 125 32" fill="none" stroke={AM} strokeWidth="9" /><path d="M125 32A60 60 0 0 1 140 78" fill="none" stroke={RD} strokeWidth="9" /><g className="needle" style={{ transform: `rotate(${ang}deg)` }}><path d="M77 78L80 22L83 78Z" fill={INK} /></g><circle cx="80" cy="78" r="6" fill={ORG} stroke={INK} strokeWidth="2" /><text x="80" y="94" textAnchor="middle" fontFamily={F2} fontSize="11" fontWeight="700" fill={INK}>{pp}% proxy</text></svg><span className="sm" style={{ textAlign: "center" }}>{pp < 20 ? "LOW" : pp <= 50 ? "WATCH" : "HIGH"} · {I.proxy} of {n}</span></div>
    <div><span className="l">AVG PUNCH-IN</span><div className="big">{avg == null ? "--:--" : hm(avg)}</div><div className="track" style={{ marginTop: 10, width: "100%" }} role="img" aria-label={avg == null ? "no punches" : "average punch-in " + hm(avg)}><s style={{ left: track(0, hmToMin(shift)).line }} /><i style={{ left: avg == null ? "0%" : Math.max(0, Math.min(97, (avg - 480) / 120 * 100)) + "%" }} /></div><span className="sm">{I.late} late after {shift} · 08:00 ◂ ▸ 10:00</span></div>
  </div>);
}
const hmToMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : 540; };

/* ============ FIG. 4 arrival curve ============ */
function Arrival({ arr, max, shift, rm }) {
  const pts = arr || [], W = 320, H = 170, mx = Math.max(max || 0, ...pts.map(p => p.c), 1), X = m => 16 + (m - 480) / 120 * (W - 30), Y = v => H - 26 - v / mx * (H - 46), pl = pts.map(p => X(p.m) + "," + Y(p.c)).join(" "), sm = hmToMin(shift);
  return (<div style={{ padding: "6px 12px 10px", maxWidth: 520 }}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} role="img" aria-label={`Arrival curve: ${pts.length ? pts[pts.length - 1].c : 0} present by 10:00 of ${max} punched`}>
      {[0, .5, 1].map(fr => <g key={fr}><line x1="16" x2={W - 14} y1={Y(mx * fr)} y2={Y(mx * fr)} stroke="rgba(29,42,53,.15)" /><text x="12" y={Y(mx * fr) + 3} fontSize="9" textAnchor="end" fill={MUTE} fontFamily={F2}>{Math.round(mx * fr)}</text></g>)}
      {pts.length > 0 && <polygon points={`${X(480)},${Y(0)} ${pl} ${X(600)},${Y(0)}`} fill="rgba(255,90,31,.15)" />}
      {pts.length > 0 && <polyline className={rm ? "" : "draw"} points={pl} fill="none" stroke={ORG} strokeWidth="2.6" strokeLinejoin="round" />}
      {sm >= 480 && sm <= 600 && <><line x1={X(sm)} x2={X(sm)} y1="14" y2={H - 26} stroke={INK} strokeDasharray="4 4" /><text x={X(sm) + 4} y="24" fontSize="9.5" fontFamily={F2} fontWeight="700" fill={INK}>SHIFT {shift}</text></>}
      {[480, 510, 540, 570, 600].map(m => <text key={m} x={X(m)} y={H - 10} fontSize="9.5" textAnchor="middle" fill={MUTE} fontFamily={F2}>{hm(m)}</text>)}
    </svg>
    <ViewTable head={["Time", "Present (cumulative)"]} rows={pts.filter((p, i) => i % 2 === 0).map(p => [hm(p.m), p.c])} />
  </div>);
}

/* ============ FIG. 5 sites ============ */
function SitesChart({ sites }) {
  const S = sites || [], tot = Math.max(1, ...S.map(s => Math.max(s.present, s.on_roll)));
  return (<div style={{ padding: "6px 14px 12px" }} role="img" aria-label={"Present by site: " + S.map(s => `${s.name} ${s.present} of ${s.on_roll} on roll`).join("; ")}>
    {S.length === 0 && <div className="empty">NO SITES IN SCOPE</div>}
    {S.map(s => <div className="hb" key={s.site_id}><span title={s.name}>{s.name.split(",")[0]}</span><div className="tr"><i style={{ width: s.present / tot * 100 + "%", background: AM }} /><i style={{ width: s.verified / tot * 100 + "%", background: GR }} />{s.on_roll > 0 && <s style={{ left: Math.min(100, s.on_roll / tot * 100) + "%" }} />}</div><b>{s.present} / {s.on_roll}</b></div>)}
    <div className="lg2" style={{ padding: "8px 0 0" }}><span><i style={{ background: AM }} />PRESENT</span><span><i style={{ background: GR }} />VERIFIED</span><span>| = ON ROLL</span></div>
  </div>);
}

/* ============ FIG. 6 labour mix ============ */
function Mix({ mix, total }) {
  const cats = mix?.cats || [], labs = mix?.labs || [], col = [ORG, BL, "#8a5fd1", GR, AM, "#94a3b8"], tot = Math.max(1, cats.reduce((s, c) => s + c.n, 0)), R = 38, C = 2 * Math.PI * R; let o = 0;
  const segs = cats.map((c, i) => { const l = c.n / tot * C, seg = { l, o, i }; o += l; return seg; });
  const ltot = Math.max(1, ...labs.map(l => l.n));
  return (<div style={{ padding: "10px 14px 12px" }}>
    {!cats.length ? <div className="empty">NO LABOUR PUNCHED IN</div> : <div className="dnw">
      <svg viewBox="0 0 110 110" width="130" role="img" aria-label={"Labour by category: " + cats.map(c => c.k + " " + c.n).join(", ")}><g transform="rotate(-90 55 55)">{segs.map(s => <circle key={s.i} cx="55" cy="55" r={R} fill="none" stroke={col[s.i % 6]} strokeWidth="16" strokeDasharray={`${Math.max(0, s.l - 1.5)} ${C - s.l + 1.5}`} strokeDashoffset={-s.o}><title>{cats[s.i].k} {cats[s.i].n}</title></circle>)}</g><text x="55" y="53" textAnchor="middle" fontFamily={F2} fontSize="20" fontWeight="700" fill={INK}>{total ?? tot}</text><text x="55" y="67" textAnchor="middle" fontFamily={F2} fontSize="8" fill={MUTE}>LABOUR</text></svg>
      <div className="dl">{cats.map((c, i) => <div key={c.k}><em style={{ background: col[i % 6] }} />{c.k}<b>{c.n}</b></div>)}</div></div>}
    <div style={{ marginTop: 8 }}>{labs.map(l => <div className="hb" key={l.k}><span title={l.k}>{l.k}</span><div className="tr"><i style={{ width: l.n / ltot * 100 + "%", background: BL }} /></div><b>{l.n}</b></div>)}</div>
  </div>);
}

/* ============ FIG. 7 last 7 days ============ */
function Week({ week, rm }) {
  const D = week || [], W = 320, H = 170, mx = Math.max(1, ...D.map(d => d.present)), gw = W / 7;
  return (<div style={{ padding: "6px 12px 10px", maxWidth: 520 }}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} role="img" aria-label={"Last 7 days: " + D.map(d => `${ddmmyyyy(d.d)} ${d.present} present, ${d.verified} verified`).join("; ")}>
      {[0, .5, 1].map(fr => <line key={fr} x1="0" x2={W} y1={H - 26 - fr * (H - 46)} y2={H - 26 - fr * (H - 46)} stroke="rgba(29,42,53,.15)" />)}
      {D.map((d, i) => { const x = i * gw + 8, w = gw - 16, hp = d.present / mx * (H - 46), hv = d.verified / mx * (H - 46), last = i === D.length - 1; return (<g key={d.d}>
        <rect className={rm ? "" : "rise"} style={{ animationDelay: i * 70 + "ms" }} x={x} y={H - 26 - hp} width={w} height={hp} fill="#fbc9a5" stroke={INK} strokeWidth=".8"><title>{ddmmyyyy(d.d)} · present {d.present}</title></rect>
        <rect className={rm ? "" : "rise"} style={{ animationDelay: i * 70 + 60 + "ms" }} x={x + w * .25} y={H - 26 - hv} width={w * .5} height={hv} fill={GR} stroke={INK} strokeWidth=".8"><title>{ddmmyyyy(d.d)} · verified {d.verified}</title></rect>
        <text x={x + w / 2} y={H - 10} fontSize="9.5" textAnchor="middle" fontFamily={F2} fill={last ? ORG : MUTE} fontWeight={last ? 700 : 500}>{d.d.slice(8, 10)}</text><text x={x + w / 2} y={H - 30 - hp} fontSize="9" textAnchor="middle" fontFamily={F2} fill={INK}>{d.present}</text></g>); })}
    </svg>
    <ViewTable head={["Day", "Present", "Verified"]} rows={D.map(d => [ddmmyyyy(d.d), d.present, d.verified])} />
  </div>);
}

/* ============ Not punched tab (same roster, marks and cutoff tools as the classic register) ============ */
function NotPunched({ np, marks, cutoffs, site, date, session, actNp, overrideMark, onCutoff }) {
  const s0 = cutoffs.find(x => String(x.id) === String(site)) || null, cut = s0 ? String(s0.auto_absent_time).slice(0, 5) : null, today = todayLocal();
  const left = (() => { if (!cut || date !== today) return null; const [h, m] = cut.split(":").map(Number); const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); const mins = h * 60 + m - (now.getHours() * 60 + now.getMinutes()); return mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : "cutoff passed — auto-absent applied by the scheduler"; })();
  return (<div className="np">
    {np.error && <div className="err">{np.error}</div>}
    <div className="note2" style={{ margin: "0 0 8px" }}><span>AUTO-ABSENT AT <b>{cut || "each site's cutoff (default 18:00)"}</b> IST IF NO PUNCH-IN{left ? ` · ${left.toUpperCase()}` : ""} · NEVER ON SUNDAYS / FESTIVALS / APPROVED LEAVE</span>
      {(session?.role === "director" || session?.role === "it_executive" || session?.role === "hr") && <button type="button" className="bt2" onClick={onCutoff}>Cutoff &amp; reminder times</button>}</div>
    {!(np.rows || []).length ? <div className="empty">NO RECORDS FOR THIS VIEW</div> : (np.rows || []).map(r => (
      <div className="row" key={r.id}><b>{r.worker}{r.isStaff && <span className="tg" style={{ marginLeft: 6 }}>{r.role || "staff"}</span>}</b><span style={{ color: MUTE, minWidth: 90 }}>{r.category}</span><span style={{ color: MUTE, flex: 1, minWidth: 140 }}>{r.site} · {r.labour}</span>
        <button type="button" className="bt2 g xs" onClick={() => actNp(r, "present")}>Present</button><button type="button" className="bt2 xs" onClick={() => actNp(r, "leave")}>Leave</button><button type="button" className="bt2 xs" style={{ color: RD }} onClick={() => actNp(r, "absent")}>Absent</button>
        {r.mobile && <a className="lnk" href={`https://wa.me/91${String(r.mobile).replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`${r.worker}, aapka aaj (${date}) ka punch-in nahi hua hai. Kripya punch karein ya supervisor ko batayein.`)}`} target="_blank" rel="noreferrer" title="WhatsApp">WA</a>}
        {r.mobile && <a className="lnk" href={`tel:${r.mobile}`} title="Call">CALL</a>}</div>))}
    {marks.length > 0 && <div style={{ marginTop: 12 }}><div style={{ font: "600 10px " + F2, letterSpacing: ".14em", color: MUTE, marginBottom: 4 }}>MARKED ABSENT / LEAVE ON {ddmmyyyy(date)} · {marks.length}</div>
      {marks.map(m => <div className="row" key={m.id}><b>{m.workers?.full_name}</b><span style={{ color: MUTE, flex: 1, minWidth: 160 }}>{m.workers?.category || ""} · {m.sites?.name || ""}{m.workers?.contractors?.name ? " · " + m.workers.contractors.name : ""}</span>
        <span className={"tg " + (m.auto ? "r" : "")} title={m.reason || ""}>{m.auto ? "Absent (auto)" : (String(m.reason || "").startsWith("leave") ? "Leave" : "Absent")}{m.marker?.full_name ? " · " + m.marker.full_name : ""}</span>
        {m.overridden_at && <span style={{ color: MUTE, fontSize: 11 }}>overridden by {m.overrider?.full_name}: {m.override_reason}</span>}
        <button type="button" className="bt2 xs" onClick={() => overrideMark(m, "present")}>Override → Present</button>{m.auto && <button type="button" className="bt2 xs" onClick={() => overrideMark(m, "leave")}>→ Leave</button>}</div>)}</div>}
  </div>);
}
