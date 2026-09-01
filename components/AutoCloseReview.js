"use client";
// update275: entries auto-closed at shift-end (missing punch-out) that a supervisor must
// confirm or correct. Until confirmed they are HELD OUT of wage generation. Shown inside
// "Needs your attention" on the desktop Reports and the phone Site Report.
import { useEffect, useState } from "react";
import { getAutoClosedPending, confirmAutoClose, runAutoclose } from "@/lib/mobile";

function hm(ts) { return ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"; }

export default function AutoCloseReview({ siteId, compact }) {
  const [rows, setRows] = useState(null);
  const [times, setTimes] = useState({});
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    await runAutoclose();                       // opportunistic: close anything overdue right now
    try { setRows(await getAutoClosedPending(siteId)); } catch (e) { setErr(e.message); setRows([]); }
  }
  useEffect(() => { load(); }, [siteId]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function act(r, hhmm) {
    setBusy(r.id); setErr(""); setMsg("");
    const res = await confirmAutoClose(r.id, hhmm);
    setBusy(0);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(`${r.worker} · ${r.date}: ${hhmm ? "out-time set to " + hhmm : "confirmed"} → ${res.hours} h, ${String(res.status).replace("_", " ")}${res.ot > 0 ? ", OT " + res.ot + " h" : ""}.`);
    setRows(x => (x || []).filter(y => y.id !== r.id));
  }

  if (rows === null) return <div className="muted" style={{ fontSize: 12 }}>Checking missing punch-outs…</div>;
  if (!rows.length && !msg && !err) return null;
  return (
    <div style={{ marginTop: 8, borderTop: "1px dashed var(--border)", paddingTop: 8 }}>
      <div style={{ fontWeight: 800, fontSize: compact ? 12.5 : 13.5, color: rows.length ? "#b45309" : "var(--green)" }}>
        {rows.length ? `⏱ ${rows.length} auto-closed — missing punch-out (held from payroll until reviewed)` : "⏱ All auto-closed entries reviewed"}
      </div>
      {err && <div className="error" style={{ fontSize: 12, marginTop: 4 }}>{err}</div>}
      {msg && <div style={{ fontSize: 12, color: "var(--green)", marginTop: 4 }}>{msg}</div>}
      {rows.map(r => (
        <div key={r.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: compact ? 12 : 13 }}>
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <b>{r.worker}</b> · {r.site}<br />
            <span className="muted">{r.date} · in {hm(r.punch_in)} → auto-out {hm(r.punch_out)} · {r.hours} h</span>
          </div>
          <input type="time" value={times[r.id] || ""} onChange={e => setTimes(t => ({ ...t, [r.id]: e.target.value }))} style={{ width: 110 }} title="Real out-time (same day)" />
          <button type="button" disabled={busy === r.id || !times[r.id]} onClick={() => act(r, times[r.id])} style={{ fontSize: 12 }}>Save real time</button>
          <button type="button" disabled={busy === r.id} onClick={() => act(r, null)} style={{ fontSize: 12, fontWeight: 700 }}>✓ Confirm as closed</button>
        </div>
      ))}
    </div>
  );
}
