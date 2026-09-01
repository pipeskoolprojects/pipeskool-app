"use client";
// update276: Settings / Payroll Rules — the values the payroll engine reads at generation time.
import { useEffect, useState } from "react";
import { getPayrollSettings, savePayrollSettings, PAYROLL_DEFAULTS } from "@/lib/payrollSettings";

export default function PayrollSettings({ canEdit }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { getPayrollSettings().then(setS).catch(e => { setErr(e.message); setS({ ...PAYROLL_DEFAULTS }); }); }, []);
  const set = (k, v) => setS(x => ({ ...x, [k]: v }));
  async function save() {
    setErr(""); setMsg("");
    if (!(Number(s.pt_threshold) >= 0) || !(Number(s.pt_amount) >= 0)) { setErr("PT threshold and amount must be numbers."); return; }
    if (!(Number(s.ot_divisor) > 0)) { setErr("OT hours divisor must be greater than 0."); return; }
    if (!(Number(s.period_start_day) >= 1 && Number(s.period_start_day) <= 28)) { setErr("Pay period start day must be between 1 and 28."); return; }
    setBusy(true); const r = await savePayrollSettings(s); setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setMsg("Payroll rules saved. They apply the next time you Generate / refresh payroll — approved and paid rows are never changed.");
  }
  if (!s) return <div className="muted">Loading payroll rules…</div>;
  const field = (label, k, type = "number", extra = null) => (
    <div>
      <label className="muted">{label}</label>
      <input type={type} value={s[k]} disabled={!canEdit} onChange={e => set(k, type === "number" ? e.target.value : e.target.value)} style={{ width: "100%" }} />
      {extra && <div className="muted" style={{ fontSize: 11 }}>{extra}</div>}
    </div>
  );
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Settings / Payroll Rules</h2>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        One place for the rules. The labour payroll engine reads these when you Generate; no formula editing anywhere else.
        {!canEdit && <b> (View only — a Director can change these.)</b>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {field("Pay period — month start (day)", "period_start_day", "number", "Day of month the pay period begins (1 = calendar month)")}
        {field("Pay period — label", "period_label", "text", "Printed on slips and summaries")}
        {field("Professional Tax — salary threshold ₹", "pt_threshold", "number", "PT applies when a worker's monthly gross (all sites together) is ABOVE this")}
        {field("Professional Tax — PT amount ₹", "pt_amount", "number", "Deducted once per worker per month, on the site with the largest gross")}
        {field("OT hours divisor (hours/day)", "ot_divisor", "number", "OT rate = daily rate ÷ divisor. A site can override this in Site Master")}
        <div>
          <label className="muted">Weekly off (labour)</label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: canEdit ? "pointer" : "default" }}>
              <input type="checkbox" disabled={!canEdit} checked={!!s.wo_paid} onChange={e => set("wo_paid", e.target.checked)} /> Paid
            </label>
            <select disabled={!canEdit} value={s.wo_weekday} onChange={e => set("wo_weekday", e.target.value)}>
              {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="muted" style={{ fontSize: 11 }}>Off = 1× daily rate, worked = 2×, half = 1× — same shape as festival holidays; only workers with ≥1 attendance day that month at the site</div>
        </div>
      </div>
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
      {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)", marginTop: 10 }}>{msg}</div>}
      {canEdit && <button className="primary" disabled={busy} onClick={save} style={{ marginTop: 12 }}>{busy ? "Saving…" : "Save payroll rules"}</button>}
    </div>
  );
}
