"use client";
// update288/290/291: WORKER-APP proxy marking — now mirroring the supervisor Muster's row UI.
// Same look and actions where the grant applies: Mark present / Absent for pending workers,
// Verify-status badges, Mark out for on-site workers — every action live-photo'd (in/out) and
// server-verified against the marker's Proxy Attendance Authority on EVERY call. Verify and
// + OT stay with staff permissions (they lock records / set pay) — deliberately not here.
import { useEffect, useMemo, useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import { getLocalWorker, getWorkerSiteOptions, getProxyTeam, proxyPunch, proxyMarkOut, proxyMarkAbsent, proxyUnmarkAbsent, getWorkerProxyFlag } from "@/lib/mobile";

const btn = { fontSize: 12.5, borderRadius: 10, padding: "8px 12px", fontWeight: 700, border: "1px solid var(--border)", background: "#fff" };

export default function WorkerProxyPage() {
  const [worker, setWorker] = useState(null);
  const [flag, setFlag] = useState(null);
  const [wsites, setWsites] = useState([]);
  const [site, setSite] = useState(null);
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState(null);
  const [mode, setMode] = useState("in");
  const [showCam, setShowCam] = useState(false);
  const [absFor, setAbsFor] = useState(null);
  const [absReason, setAbsReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  useEffect(() => {
    const w = getLocalWorker();
    if (!w?.id) { setFlag(false); return; }
    setWorker(w);
    getWorkerProxyFlag(w.id).then(setFlag).catch(e => { setFlag(false); setErr(e.message); });
    getWorkerSiteOptions(w).then(s => { setWsites(s); setSite(Number(w.site_id) || s[0]?.id || null); });
  }, []);
  const load = () => { if (site && worker?.id) getProxyTeam(worker.id, Number(site)).then(t => { if (!t.authorized) setFlag(false); setRows(t.rows); }).catch(e => { setRows([]); setErr(e.message); }); };
  useEffect(() => { setRows(null); load(); }, [site, worker?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (ok, text) => { if (ok) { setMsg(text); setErr(""); } else { setErr(text); setMsg(""); } };
  async function onPhoto(file) {
    setShowCam(false);
    if (!file || !target) return;
    const res = mode === "out"
      ? await proxyMarkOut(worker.id, target.id, Number(site), file)
      : await proxyPunch(target.id, Number(site), file, worker.full_name, false, worker.id);
    if (!res.ok) { flash(false, res.error); return; }
    flash(true, `${target.name} — punch-${mode} saved ✓ (photo attached, marked by you).`);
    setTarget(null); load();
  }
  async function saveAbsent() {
    setBusy(true); const res = await proxyMarkAbsent(worker.id, absFor.id, Number(site), absReason.trim() || null); setBusy(false);
    if (!res.ok) { flash(false, res.error); return; }
    flash(true, `${absFor.name} marked absent for today.`); setAbsFor(null); setAbsReason(""); load();
  }
  const shown = useMemo(() => (rows || []).filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.category || "").toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const counts = useMemo(() => {
    const c = { p: 0, h: 0, a: 0, pend: 0 };
    (rows || []).forEach(r => { if (r.status === "present") c.p++; else if (r.status === "half_day") c.h++; else if (r.status === "absent" || r.absent_id) c.a++; else if (!r.att_id) c.pend++; });
    return c;
  }, [rows]);

  const back = () => { if (window.history.length > 1) window.history.back(); else window.location.assign("/m"); };
  return (
    <div className="m-shell">
      <div className="m-head">
        <div>
          <div className="title">🛡 Team attendance</div>
          {wsites.length > 1 ? (
            <select value={site || ""} onChange={e => setSite(Number(e.target.value))}
              style={{ marginTop: 2, fontSize: 12.5, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "3px 8px" }}>
              {wsites.map(s => <option key={s.id} value={s.id} style={{ color: "#000" }}>{s.name}</option>)}
            </select>
          ) : <div className="sub">{wsites[0]?.name || ""}</div>}
        </div>
        <button type="button" onClick={back} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 700 }}>← Back</button>
      </div>
      <div className="m-body">
        {flag === null && <div className="muted">Checking your authority…</div>}
        {flag === false && !err && <div className="note amber">Your profile does not carry <b>Proxy Attendance Authority</b>. Ask the office to grant it on your labour profile in Workers Master.</div>}
        {flag === false && err && <div className="note red">🛡 Could not check your authority: {err}</div>}
        {flag && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>{/* same chips as the muster */}
              <span className="badge p">P {counts.p}</span>
              <span className="badge h">½ {counts.h}</span>
              <span className="badge a">A {counts.a}</span>
              <span className="badge gray">Pending {counts.pend}</span>
              <span className="muted" style={{ marginLeft: "auto", fontSize: 11.5 }}>{rows ? rows.length : "…"} workers</span>
            </div>
            <input placeholder="🔎 Search worker / role…" value={q} onChange={e => setQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
            {msg && <div className="note green">{msg}</div>}
            {err && <div className="note red">{err}</div>}
            {!rows ? <div className="muted">Loading team…</div> : shown.map(r => {
              const here = r.att_id && (!r.att_site_id || Number(r.att_site_id) === Number(site));
              return (
                <div key={r.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 20, background: "#ffe8d9", color: "#c2410c", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                      {r.name.split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.category} · {r.labour}{r.in ? ` · In ${r.in}` : ""}{r.out ? ` — Out ${r.out}` : ""}</div>
                      {r.proxy_by && <div className="flag">📷 Proxy — by {r.proxy_by}</div>}
                      {r.att_site_id && Number(r.att_site_id) !== Number(site) && <div className="flag">📍 Present at {r.att_site}</div>}
                      {r.absent_id && !r.att_id && <div className="flag">🚫 Absent — {r.absent_reason}</div>}
                    </div>
                    <div style={{ textAlign: "right", display: "grid", gap: 4, justifyItems: "end" }}>
                      {here && <span className="badge info">On site</span>}
                      {here && r.verify && <span className={"badge " + (r.verify === "verified" ? "p" : "h")}>{r.verify === "verified" ? "Verified" : "Unverified"}</span>}
                      {!r.att_id && !r.absent_id && <span className="badge gray">Pending</span>}
                      {!r.att_id && r.absent_id && <span className="badge a">Absent</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>{/* same action row shape as the muster */}
                    {!r.att_id && !r.absent_id && <button style={{ ...btn, background: "var(--brand)", color: "#fff", border: 0 }} onClick={() => { setTarget(r); setMode("in"); setErr(""); setMsg(""); setShowCam(true); }}>📷 Mark present</button>}
                    {!r.att_id && !r.absent_id && <button style={{ ...btn, borderColor: "var(--red)", color: "var(--red)" }} onClick={() => { setAbsFor(r); setAbsReason(""); }}>Absent</button>}
                    {!r.att_id && r.absent_id && <button style={btn} onClick={async () => { const x = await proxyUnmarkAbsent(worker.id, r.absent_id); if (!x.ok) { flash(false, x.error); return; } flash(true, `Absent mark removed for ${r.name}.`); load(); }}>Undo absent</button>}
                    {here && !r.out && <button style={btn} onClick={() => { setTarget(r); setMode("out"); setErr(""); setMsg(""); setShowCam(true); }}>Mark out</button>}
                    {here && r.verify !== "verified" && <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>Verification stays with your supervisor.</span>}
                  </div>
                </div>
              );
            })}
            {rows && shown.length === 0 && <div className="muted">No workers match.</div>}
            <div className="note amber" style={{ marginTop: 14, fontSize: 12 }}>
              "Mark present" and "Mark out" need a live photo at site and are recorded as <b>marked by {worker?.full_name}</b>. Verify and OT approval remain supervisor functions. The office can revoke this authority any time.
            </div>
          </>
        )}
        {absFor && (
          <div onClick={() => setAbsFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "flex-end", zIndex: 70 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", padding: 18 }}>
              <h3 style={{ marginTop: 0 }}>Mark {absFor.name} absent — today</h3>
              <label className="muted">Reason (optional)</label>
              <input value={absReason} onChange={e => setAbsReason(e.target.value)} style={{ width: "100%", marginBottom: 10 }} placeholder="e.g. informed sick leave" />
              <button className="m-btn primary" disabled={busy} onClick={saveAbsent}>{busy ? "Saving…" : "Mark absent"}</button>
              <button className="m-btn" style={{ marginTop: 6 }} onClick={() => setAbsFor(null)}>Cancel</button>
            </div>
          </div>
        )}
        {showCam && <CameraCapture facing="environment" title={`Live photo of ${target?.name || "worker"} at site`} onCapture={onPhoto} onCancel={() => { setShowCam(false); setTarget(null); }} />}
      </div>
    </div>
  );
}
