"use client";
// update288: WORKER-APP proxy marking — for labour granted 🛡 Proxy Attendance Authority.
// The senior worker sees his site's team and marks colleagues present with a mandatory live
// photo. The SERVER verifies the grant + site scope on every mark (fn_proxy_mark_present v2),
// so revoking the checkbox stops this instantly. No verify/OT here — that stays supervisor work.
import { useEffect, useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import { getLocalWorker, getWorkerSiteOptions, getMuster, proxyPunch, getWorkerProxyFlag } from "@/lib/mobile";

export default function WorkerProxyPage() {
  const [worker, setWorker] = useState(null);
  const [flag, setFlag] = useState(null);       // null = checking, false = not granted
  const [wsites, setWsites] = useState([]);
  const [site, setSite] = useState(null);
  const [rows, setRows] = useState(null);
  const [target, setTarget] = useState(null);
  const [showCam, setShowCam] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  useEffect(() => {
    const w = getLocalWorker();
    if (!w?.id) { setFlag(false); return; }
    setWorker(w);
    getWorkerProxyFlag(w.id).then(setFlag).catch(() => setFlag(false));
    getWorkerSiteOptions(w).then(s => { setWsites(s); setSite(Number(w.site_id) || s[0]?.id || null); });
  }, []);
  useEffect(() => { if (site) { setRows(null); getMuster([Number(site)]).then(setRows).catch(e => { setRows([]); setErr(e.message); }); } }, [site, msg]);

  async function onPhoto(file) {
    setShowCam(false);
    if (!file || !target) return;
    const res = await proxyPunch(target.id, Number(site), file, worker.full_name, false, worker.id);
    if (!res.ok) { setErr(res.error); setMsg(""); return; }
    setErr(""); setMsg(`${target.name} marked present ✓ — photo attached, recorded as marked by you.`);
    setTarget(null);
  }

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
        {flag === false && <div className="note amber">Your profile does not carry <b>Proxy Attendance Authority</b>. Ask the office to grant it on your labour profile in Workers Master.</div>}
        {flag && (
          <>
            {msg && <div className="note green">{msg}</div>}
            {err && <div className="note red">{err}</div>}
            {!rows ? <div className="muted">Loading team…</div> : (
              <>
                {rows.filter(r => r.id !== worker.id).map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{r.cat} · {r.lab}{r.in ? ` · In ${r.in}` : ""}{r.proxyBy ? ` · by ${r.proxyBy}` : ""}</div>
                      {r.attSiteId && Number(r.attSiteId) !== Number(site) && <div className="flag">📍 Present at {r.attSite}</div>}
                    </div>
                    {r.attId ? <span className={"badge " + (r.status === "present" ? "p" : r.status === "half_day" ? "h" : "gray")}>{r.status === "present" ? "P" : r.status === "half_day" ? "½" : "In"}</span>
                      : r.absentMark ? <span className="badge a">Absent</span>
                      : <button style={{ fontSize: 12.5, background: "var(--brand)", color: "#fff", border: 0, borderRadius: 10, padding: "8px 12px", fontWeight: 700 }}
                          onClick={() => { setTarget(r); setErr(""); setMsg(""); setShowCam(true); }}>📷 Mark present</button>}
                  </div>
                ))}
                {rows.filter(r => r.id !== worker.id).length === 0 && <div className="muted">No other workers at this site.</div>}
              </>
            )}
            <div className="note amber" style={{ marginTop: 14, fontSize: 12 }}>
              Every mark needs a live photo of the worker at site and is recorded as <b>marked by {worker?.full_name}</b>. The office can revoke this authority any time.
            </div>
          </>
        )}
        {showCam && <CameraCapture facing="environment" title={`Live photo of ${target?.name || "worker"} at site`} onCapture={onPhoto} onCancel={() => { setShowCam(false); setTarget(null); }} />}
      </div>
    </div>
  );
}
