"use client";
// update481: IT screen — every selfie-camera attempt, so the pattern behind "no camera preview" is visible
// (same phone brand, old Chrome, in-app browser, denied permission, http page, timeout…).
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { supabase, isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

const RESULTS = ["started", "error", "timeout"];
export default function CameraLogPage() {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(""); const [users, setUsers] = useState({});
  const [fUser, setFUser] = useState(""); const [fResult, setFResult] = useState(""); const [fErr, setFErr] = useState(""); const [days, setDays] = useState(7);
  const sess = typeof window !== "undefined" ? getSession() : null;
  async function load() {
    if (isDemo) { setRows([]); return; }
    const since = new Date(Date.now() - days * 86400e3).toISOString();
    const { data, error } = await supabase.from("punch_camera_log").select("*").gte("at", since).order("at", { ascending: false }).limit(2000);
    if (error) { setErr(/punch_camera_log|schema cache/i.test(error.message) ? "Run pipeskool_camera_log.sql (update 481) in Supabase first." : error.message); setRows([]); return; }
    setRows(data || []);
    const ids = [...new Set((data || []).map(r => r.user_id).filter(Boolean))];
    if (ids.length) { const { data: u } = await supabase.from("app_users").select("id, full_name, role").in("id", ids); const m = {}; (u || []).forEach(x => { m[x.id] = x; }); setUsers(m); }
  }
  useEffect(() => { load(); }, [days]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (rows || []).filter(r => (!fUser || String(r.user_id) === fUser) && (!fResult || r.result === fResult) && (!fErr || r.error_name === fErr)), [rows, fUser, fResult, fErr]);
  const errNames = [...new Set((rows || []).map(r => r.error_name).filter(Boolean))];
  const byUser = useMemo(() => { const m = {}; (rows || []).forEach(r => { const k = r.user_id || "—"; m[k] = m[k] || { ok: 0, bad: 0 }; r.result === "started" ? m[k].ok++ : m[k].bad++; }); return Object.entries(m).sort((a, b) => b[1].bad - a[1].bad); }, [rows]);
  const pattern = (key, label) => { const m = {}; shown.filter(r => r.result !== "started").forEach(r => { const k = r[key] || "—"; m[k] = (m[k] || 0) + 1; }); const e = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6); return e.length ? <div style={{ fontSize: 12.5 }}><b>{label}:</b> {e.map(([k, n]) => `${k} (${n})`).join(" · ")}</div> : null; };
  const who = r => users[r.user_id]?.full_name || (r.user_id ? "#" + r.user_id : r.worker_id ? "worker #" + r.worker_id : "—");
  if (sess && !["director", "it_executive", "ho_admin"].includes(sess.role)) return <div className="layout"><Sidebar /><main className="main"><div className="muted" style={{ padding: 20 }}>IT / Director only.</div></main></div>;
  return (
    <div className="layout"><Sidebar /><main className="main">
      <div className="page-head"><h1>Punch camera diagnostics</h1><div className="filters">
        <select value={days} onChange={e => setDays(Number(e.target.value))}>{[1, 7, 30, 90].map(d => <option key={d} value={d}>Last {d} day{d > 1 ? "s" : ""}</option>)}</select>
        <select value={fUser} onChange={e => setFUser(e.target.value)}><option value="">User: all</option>{byUser.map(([id, c]) => <option key={id} value={id}>{users[id]?.full_name || "#" + id} · {c.bad} failed / {c.ok} ok</option>)}</select>
        <select value={fResult} onChange={e => setFResult(e.target.value)}><option value="">Result: all</option>{RESULTS.map(r => <option key={r} value={r}>{r}</option>)}</select>
        <select value={fErr} onChange={e => setFErr(e.target.value)}><option value="">Error: all</option>{errNames.map(r => <option key={r} value={r}>{r}</option>)}</select>
        <button type="button" onClick={load}>↻ Refresh</button></div></div>
      {err && <div className="demo-banner" style={{ background: "#fdecea", color: "var(--red)" }}>⚠ {err}</div>}
      <div className="panel" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Pattern in the failures shown ({shown.filter(r => r.result !== "started").length} of {shown.length} attempts)</div>
        {pattern("error_name", "Error")}{pattern("permission_state", "Permission")}{pattern("in_app", "In-app browser")}{pattern("webview", "WebView")}{pattern("chrome_version", "Chrome")}{pattern("os_version", "OS")}{pattern("device_model", "Phone")}{pattern("secure_context", "Secure (https)")}{pattern("media_devices", "Camera API present")}
        {shown.length > 0 && shown.every(r => r.result === "started") && <div className="muted" style={{ fontSize: 12.5 }}>No failures in this view.</div>}
      </div>
      <div className="panel" style={{ overflowX: "auto" }}>
        {rows === null ? <div className="muted">Loading…</div> : !shown.length ? <div className="muted">No camera attempts recorded{rows.length ? " for this filter" : " yet — rows appear from the first punch after this update is deployed"}.</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: "left", color: "#6b7280" }}><th>Time</th><th>User</th><th>Kind</th><th>Result</th><th>Error</th><th>Start</th><th>Permission</th><th>Browser</th><th>Phone / OS</th><th>Flags</th></tr></thead>
            <tbody>{shown.map(r => <tr key={r.id} style={{ borderTop: "1px solid var(--border)", background: r.result === "started" ? undefined : "#fff5f5" }}>
              <td style={{ whiteSpace: "nowrap" }}>{String(r.at).slice(0, 16).replace("T", " ")}</td><td>{who(r)}<div className="muted" style={{ fontSize: 11 }}>{users[r.user_id]?.role?.replace(/_/g, " ") || ""}</div></td><td>{r.kind}</td>
              <td><span className={"badge " + (r.result === "started" ? "p" : "warn")}>{r.result}</span></td><td>{r.error_name}<div className="muted" style={{ fontSize: 11, maxWidth: 260 }}>{r.error_message}</div></td>
              <td style={{ whiteSpace: "nowrap" }}>{r.start_ms != null ? (r.start_ms / 1000).toFixed(1) + " s" : "—"}</td><td>{r.permission_state}</td>
              <td>{r.in_app ? "in-app: " + r.in_app : r.webview ? r.webview : "Chrome " + (r.chrome_version || "?")}{r.standalone ? " · installed" : ""}</td><td>{r.device_model || "—"}<div className="muted" style={{ fontSize: 11 }}>{r.os_version}</div></td>
              <td style={{ fontSize: 11 }}>{r.secure_context === false ? "NOT https · " : ""}{r.media_devices === false ? "no camera API · " : ""}{r.app_version}</td>
            </tr>)}</tbody>
          </table>)}
      </div>
    </main></div>
  );
}
