"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSitesFull, updateSiteTimings } from "@/lib/data";
import { isDemo } from "@/lib/supabase";

function endHint(start, std = 8, lunch = 60) {
  if (!start) return "";
  const [h, m] = start.split(":").map(Number);
  const mins = h * 60 + m + std * 60 + lunch;
  const eh = Math.floor(mins / 60) % 24, em = mins % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export default function SiteMasterPage() {
  const [sites, setSites] = useState(null);
  const [draft, setDraft] = useState({});   // siteId -> {shift_start, shift_end}
  const [savingId, setSavingId] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { getSitesFull().then(s => { setSites(s); const d = {}; s.forEach(x => d[x.id] = { shift_start: (x.shift_start || "09:00").slice(0, 5), shift_end: (x.shift_end || "18:00").slice(0, 5) }); setDraft(d); }); }, []);

  const set = (id, k, v) => setDraft(d => ({ ...d, [id]: { ...d[id], [k]: v } }));

  async function save(s) {
    setSavingId(s.id); setMsg("");
    const res = await updateSiteTimings(s.id, draft[s.id].shift_start, draft[s.id].shift_end);
    setSavingId(null);
    if (res.ok) setMsg(s.name + " timings saved.");
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Site Master — shift timings</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — sample sites.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        <div className="panel">
          <div className="muted" style={{ marginBottom: 12 }}>Set each site's shift start and end. <b>Overtime is counted only after the shift end time.</b> ({"Standard work hours and lunch are set per site in the database; a typical 8:00 start with 8h + 1h lunch ends 17:00."})</div>
          {!sites ? <div className="muted">Loading…</div> : (
            <table>
              <thead><tr><th>Site</th><th>Shift start</th><th>Shift end (OT after this)</th><th>Work hrs</th><th></th></tr></thead>
              <tbody>
                {sites.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td><input type="time" value={draft[s.id]?.shift_start || ""} onChange={e => set(s.id, "shift_start", e.target.value)} /></td>
                    <td>
                      <input type="time" value={draft[s.id]?.shift_end || ""} onChange={e => set(s.id, "shift_end", e.target.value)} />
                      <div className="muted" style={{ fontSize: 11 }}>typical: {endHint(draft[s.id]?.shift_start, s.std_working_hours, s.lunch_minutes)}</div>
                    </td>
                    <td className="muted">{s.std_working_hours}h + {s.lunch_minutes}m lunch</td>
                    <td><button className="primary" disabled={savingId === s.id} onClick={() => save(s)}>{savingId === s.id ? "Saving…" : "Save"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
