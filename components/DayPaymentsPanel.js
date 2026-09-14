"use client";
// update382: DAY PAYMENTS PANEL — opens on any date from the calendar. Lists every worker
// who has attendance on that date (from the definer fn_holiday_day_workers) and lets a
// Director / attendance-manage set a per-worker HOLIDAY MULTIPLIER (defaults from the rule
// on this date). Writes via fn_set_holiday_payment, which is server-gated. Payroll picks
// up the multipliers automatically the next time wages are generated.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/auth";
import { getSession } from "@/lib/auth";

const MULTS = [
  ["", "default (rule)"],
  ["0", "0× — not paid"],
  ["1", "1× — normal"],
  ["1.5", "1.5×"],
  ["2", "2× — holiday standard"],
  ["3", "3×"],
];

export default function DayPaymentsPanel({ date, isHoliday, onClose }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const sess = getSession();
  const canEdit = !!sess && (sess.role === "director" || can(sess, "attendance", "manage"));

  useEffect(() => {
    setErr(""); setMsg(""); setRows(null);
    supabase.rpc("fn_holiday_day_workers", { p_on_date: date })
      .then(({ data, error }) => {
        if (error) { setErr(error.message); setRows([]); return; }
        setRows((data || []).map(r => ({ ...r, _mult: r.holiday_multiplier != null ? String(r.holiday_multiplier) : "",
                                              _reason: r.holiday_reason || "" })));
      });
  }, [date]);

  async function save(row) {
    setBusy(true); setErr(""); setMsg("");
    const mult = row._mult === "" ? null : Number(row._mult);
    const { error } = await supabase.rpc("fn_set_holiday_payment", {
      p_worker_id: row.worker_id, p_on_date: date, p_multiplier: mult, p_reason: row._reason || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg("Saved · will be applied on next payroll run.");
    setRows(list => list.map(x => x.attendance_id === row.attendance_id
      ? { ...x, holiday_multiplier: mult, holiday_reason: row._reason || null } : x));
  }

  return (
    <div className="panel" style={{ margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <h2 style={{ fontSize: 14, margin: 0 }}>Payments · {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</h2>
        {onClose && <button onClick={onClose} style={{ fontSize: 11 }}>×</button>}
      </div>

      <div className="muted" style={{ fontSize: 11.5, margin: "4px 0 8px" }}>
        {isHoliday
          ? <>Default rule: worked full = 2×, half = ½ of 2× = 1×, absent = 1× paid. Set a different multiplier here to override <b>for one worker on this one day</b>. OT is untouched.</>
          : <>This is not marked as a holiday. Multipliers set here apply to <b>this specific date only</b>, useful for a special-pay Sunday or one-off compensation.</>}
      </div>

      {!canEdit && <div className="note amber" style={{ fontSize: 11.5, marginBottom: 8 }}>View only — payment changes need <b>Director</b> or <b>attendance:manage</b>.</div>}
      {err && <div className="error" style={{ marginBottom: 8, fontSize: 12 }}>{err}</div>}
      {msg && <div className="note" style={{ marginBottom: 8, fontSize: 12, color: "#166534", background: "#ecfdf5", border: "1px solid #86efac", padding: "4px 8px", borderRadius: 4 }}>{msg}</div>}

      {rows === null ? <div className="muted" style={{ fontSize: 12 }}>Loading…</div>
       : rows.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No attendance recorded on this date.</div>
       : (
        <div style={{ maxHeight: "min(60vh, 480px)", overflowY: "auto", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead><tr style={{ background: "#f3f4f6" }}>
              {["Worker", "Site", "Status", "Multiplier", "Reason", ""].map(h =>
                <th key={h} style={{ textAlign: "left", padding: "5px 6px", fontSize: 10.5, whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.attendance_id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "5px 6px", fontWeight: 600 }}>{r.worker_name}</td>
                  <td style={{ padding: "5px 6px", color: "#666" }}>{r.site_name || "—"}</td>
                  <td style={{ padding: "5px 6px" }}>{statusBadge(r.status)}</td>
                  <td style={{ padding: "5px 6px" }}>
                    <select disabled={!canEdit} value={r._mult}
                            onChange={e => setRows(list => list.map(x => x.attendance_id === r.attendance_id ? { ...x, _mult: e.target.value } : x))}
                            style={{ fontSize: 11.5, minWidth: 90 }}>
                      {MULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "5px 6px" }}>
                    <input disabled={!canEdit} value={r._reason} placeholder="optional"
                           onChange={e => setRows(list => list.map(x => x.attendance_id === r.attendance_id ? { ...x, _reason: e.target.value } : x))}
                           style={{ fontSize: 11.5, width: "min(180px, 30vw)" }} />
                  </td>
                  <td style={{ padding: "5px 6px" }}>
                    {canEdit && <button disabled={busy} onClick={() => save(r)} style={{ fontSize: 11 }}>Save</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function statusBadge(s) {
  if (s === "present")  return <span className="badge p"    style={{ fontSize: 10 }}>P</span>;
  if (s === "half_day") return <span className="badge h"    style={{ fontSize: 10 }}>½</span>;
  if (s === "absent")   return <span className="badge a"    style={{ fontSize: 10 }}>A</span>;
  return <span className="badge gray" style={{ fontSize: 10 }}>{s || "—"}</span>;
}
