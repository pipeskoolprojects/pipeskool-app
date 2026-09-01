"use client";
// update277: MANUAL EDIT of a draft payout — days, rate, OT hours/rate, PF, PT, other deduction.
// Recomputes gross/net the same way the engine does and marks the row manual_override so
// "Generate / refresh" never silently overwrites it (clear the override to recompute).
import { useState } from "react";
import { setPayoutValues, clearPayoutOverride } from "@/lib/payroll";
import { inr } from "@/lib/data";

export default function PayoutEditModal({ row, onClose, onDone }) {
  const [f, setF] = useState({ days_full: row.daysFull, days_half: row.daysHalf, daily_rate: row.rate, ot_hours: row.ot, ot_rate: row.otRate,
    pf_amount: row.pf || 0, pt_amount: row.pt || 0, other_deduction: row.other || 0, note: row.overrideNote || "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const n = k => Number(f[k]) || 0;
  const gross = +((n("days_full") + n("days_half") * 0.5) * n("daily_rate") + (row.holAmt || 0) + (row.woAmt || 0) + n("ot_hours") * n("ot_rate")).toFixed(2);
  const net = +(gross - (row.adv || 0) - n("pf_amount") - n("pt_amount") - n("other_deduction")).toFixed(2);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const fld = (label, k, step = "0.5") => (
    <div><label className="muted">{label}</label><input type="number" step={step} value={f[k]} onChange={e => set(k, e.target.value)} style={{ width: "100%" }} /></div>
  );
  async function save() {
    setErr(""); setBusy(true);
    const r = await setPayoutValues(row.id, f); setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone(`${row.worker}: values saved — gross ${inr(r.gross)}, net ${inr(r.net)}. Marked manual; Generate will not overwrite it.`);
  }
  async function clear() {
    if (!window.confirm("Clear the manual override? The next Generate / refresh will recompute this row from attendance.")) return;
    setBusy(true); const r = await clearPayoutOverride(row.id); setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone(`${row.worker}: override cleared — regenerate to recompute.`);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card, #fff)", borderRadius: 12, padding: 18, width: "min(620px, 96vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 18px 50px rgba(0,0,0,.28)" }}>
        <h2 style={{ marginTop: 0 }}>✎ Edit payout — {row.worker} <span className="muted" style={{ fontSize: 12 }}>{row.site}</span></h2>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Every change is logged with your name. Holiday pay {inr(row.holAmt || 0)} and advance {inr(row.adv || 0)} come from their own records.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {fld("Full days", "days_full")}{fld("Half days", "days_half")}{fld("Daily rate ₹", "daily_rate", "1")}
          {fld("OT hours", "ot_hours", "0.25")}{fld("OT rate ₹/h", "ot_rate", "0.01")}
          {fld("PF ₹", "pf_amount", "1")}{fld("Professional Tax ₹", "pt_amount", "1")}{fld("Other deduction ₹", "other_deduction", "1")}
        </div>
        <div style={{ marginTop: 10 }}><label className="muted">Reason / note</label><input value={f.note} onChange={e => set("note", e.target.value)} style={{ width: "100%" }} placeholder="e.g. 2 days added — punch machine down on 12–13 Aug" /></div>
        <div style={{ display: "flex", gap: 16, marginTop: 12, fontWeight: 700 }}><span>Gross {inr(gross)}</span><span>Net {inr(net)}</span></div>
        {net < 0 && <div className="error" style={{ marginTop: 6 }}>Deductions exceed gross — net would be negative.</div>}
        {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button className="primary" disabled={busy || net < 0} onClick={save}>{busy ? "Saving…" : "Save values"}</button>
          {row.manual && <button disabled={busy} onClick={clear}>↺ Clear override</button>}
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
