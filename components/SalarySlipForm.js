"use client";
// update414: SALARY SLIP — month-wise entry (one editable row per month in the range), Confirm & review
// step, then issued through the letters pipeline (fn_issue_letter → PSP/SLP series → Document Register
// → the frozen print page with the browser's native Print / Save as PDF).
import { useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/data";
import { rupeesInWords } from "@/lib/letters";

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ML = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ym = s => { const [y, m] = String(s).split("-").map(Number); return y * 12 + (m - 1); };
const lbl = (s, long) => { const [y, m] = String(s).split("-").map(Number); return `${(long ? ML : M)[m - 1]} ${y}`; };
const months = (a, b) => { const out = []; for (let i = ym(a); i <= ym(b) && out.length < 36; i++) out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`); return out; };
const n = v => Number(v) || 0;
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const DRAFT = id => "psk_slip_draft_" + id;
const num = v => v.replace(/[^0-9.]/g, "");

export default function SalarySlipForm({ person, people, onPerson, onIssue, issuing }) {
  const [from, setFrom] = useState(thisMonth()); const [to, setTo] = useState(thisMonth());
  const [rows, setRows] = useState({});          // "yyyy-mm" -> { gross, pf, pt, other }
  const [note, setNote] = useState(""); const [review, setReview] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { if (!person) return; try { const d = JSON.parse(localStorage.getItem(DRAFT(person.id)) || "null"); if (d) { setFrom(d.from); setTo(d.to); setRows(d.rows || {}); setNote(d.note || ""); } } catch {} }, [person?.id]);

  const list = useMemo(() => (from && to && ym(from) <= ym(to)) ? months(from, to) : [], [from, to]);
  // new months in range get the employee's salary pre-filled (or the previous month's numbers)
  useEffect(() => {
    setRows(r => { const nr = { ...r }; let prev = null;
      list.forEach(m => { if (!nr[m]) nr[m] = prev ? { ...prev } : { gross: person?.monthly_salary ? String(person.monthly_salary) : "", pf: "", pt: "", other: "" }; prev = nr[m]; });
      return nr; });
  }, [list, person?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const setCell = (m, k, v) => setRows(r => ({ ...r, [m]: { ...r[m], [k]: num(v) } }));
  const netOf = r => n(r?.gross) - n(r?.pf) - n(r?.pt) - n(r?.other);
  const total = list.reduce((s, m) => s + netOf(rows[m]), 0);
  const missing = list.filter(m => !(n(rows[m]?.gross) > 0));
  const ready = !!person && list.length > 0 && missing.length === 0;

  function saveDraft() { if (!person) { setErr("Pick an employee first."); return; } try { localStorage.setItem(DRAFT(person.id), JSON.stringify({ from, to, rows, note })); } catch {} setErr(""); alert(`Draft saved on this device for ${person.full_name}.`); }
  function tokens() {
    const line = m => { const r = rows[m]; return `${lbl(m, true).padEnd(15)} Gross ${inr(n(r.gross))}  −  PF ${inr(n(r.pf))}  −  PT ${inr(n(r.pt))}  −  Other ${inr(n(r.other))}  =  Net ${inr(netOf(r))}`; };
    const g = list.reduce((s, m) => s + n(rows[m].gross), 0), d = list.reduce((s, m) => s + n(rows[m].pf) + n(rows[m].pt) + n(rows[m].other), 0);
    return { "slip.period": `${lbl(from, true)} – ${lbl(to, true)} (${list.length} month${list.length === 1 ? "" : "s"})`, "slip.table": list.map(line).join("\n"),
      "slip.gross_total": inr(g), "slip.deductions_total": inr(d), "slip.net_total": inr(total), "slip.net_words": rupeesInWords(Math.round(total)), "slip.note": note.trim() ? "Note: " + note.trim() : "-" };   // update415b: never blank — a blank token is treated as unfilled and the server refuses to issue
  }
  const inp = { width: "100%", boxSizing: "border-box", height: 38 };
  const cell = { width: "92%", height: 28, borderRadius: 6, padding: "0 6px", fontSize: 12 };
  const grid = "1.1fr 1fr .8fr .8fr 1fr 1fr";

  if (review) return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Review before generating</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Read-only. Go back to change anything; nothing is issued until you press Generate.</div>
      <div style={{ background: "var(--gray-bg)", borderRadius: 10, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><b style={{ fontSize: 13 }}>Pipeskool Projects Pvt Ltd</b><span className="muted" style={{ fontSize: 11 }}>Salary Slip · {lbl(from)}–{lbl(to)}</span></div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{person.full_name} · {person.role_label || person.role || ""} · #{person.id}</div>
        <div style={{ display: "grid", gridTemplateColumns: grid, fontSize: 11, color: "var(--muted)", padding: "6px 0", borderTop: "1px solid var(--border)" }}><span>Month</span><span>Gross</span><span>PF</span><span>PT</span><span>Other</span><span style={{ textAlign: "right" }}>Net</span></div>
        {list.map(m => <div key={m} style={{ display: "grid", gridTemplateColumns: grid, fontSize: 12.5, padding: "4px 0", borderTop: "1px solid var(--border)" }}><span>{lbl(m)}</span><span>{inr(n(rows[m].gross))}</span><span>{inr(n(rows[m].pf))}</span><span>{inr(n(rows[m].pt))}</span><span>{inr(n(rows[m].other))}</span><b style={{ textAlign: "right" }}>{inr(netOf(rows[m]))}</b></div>)}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid var(--border)", marginTop: 4, paddingTop: 8, fontWeight: 700 }}><span>Total net pay · {list.length} month{list.length === 1 ? "" : "s"}</span><span>{inr(total)}</span></div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{rupeesInWords(Math.round(total))}</div>
        {note && <div style={{ fontSize: 12, marginTop: 8 }}><b>Note:</b> {note}</div>}
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button type="button" onClick={() => setReview(false)} disabled={issuing}>← Back to edit</button>
        <button className="primary" style={{ flex: 1 }} disabled={issuing} onClick={() => { setErr(""); onIssue(tokens()); }}>{issuing ? "Generating…" : "✓ Generate slip · opens Print / Save as PDF"}</button>
      </div>
    </div>
  );

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Salary slip</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Enter each month's salary separately, then confirm to generate.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div><label className="muted">Employee</label><select style={inp} value={person?.id || ""} onChange={e => onPerson(e.target.value)}><option value="">Select employee</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
        <div><label className="muted">Employee ID / department</label><input style={inp} disabled value={person ? `#${person.id} · ${person.role_label || person.role || ""}` : ""} placeholder="Auto-filled on selection" /></div>
        <div><label className="muted">From month</label><input type="month" style={inp} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="muted">To month</label><input type="month" style={inp} value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>
      {list.length === 0 ? <div className="note amber">From month must be on or before To month.</div> : (<>
        <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 8 }}>Monthly breakdown — {list.length} month{list.length === 1 ? "" : "s"}</div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: grid, background: "var(--gray-bg)", padding: "8px 10px", fontSize: 11, color: "var(--muted)" }}><span>Month</span><span>Gross ₹</span><span>PF ₹</span><span>PT ₹</span><span>Other ded. ₹</span><span style={{ textAlign: "right" }}>Net</span></div>
          {list.map((m, i) => { const r = rows[m] || {}; const changed = i > 0 && n(r.gross) !== n(rows[list[i - 1]]?.gross); return (
            <div key={m} style={{ display: "grid", gridTemplateColumns: grid, padding: "8px 10px", alignItems: "center", borderTop: changed ? "1.5px solid #FF7A1A" : "1px solid var(--border)", background: changed ? "#FFF9F5" : "#fff" }}>
              <span style={{ fontSize: 12.5, fontWeight: changed ? 600 : 400 }}>{lbl(m, true)}</span>
              <input style={{ ...cell, border: changed ? "1px solid #FF7A1A" : undefined }} inputMode="decimal" value={r.gross ?? ""} onChange={e => setCell(m, "gross", e.target.value)} />
              <input style={{ ...cell, width: "80%" }} inputMode="decimal" value={r.pf ?? ""} placeholder="0" onChange={e => setCell(m, "pf", e.target.value)} />
              <input style={{ ...cell, width: "80%" }} inputMode="decimal" value={r.pt ?? ""} placeholder="0" onChange={e => setCell(m, "pt", e.target.value)} />
              <input style={cell} inputMode="decimal" value={r.other ?? ""} placeholder="0" onChange={e => setCell(m, "other", e.target.value)} />
              <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", color: changed ? "#C2410C" : "inherit" }}>{inr(netOf(r))}</span>
            </div>); })}
        </div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 14 }}>ⓘ One row per month in range — edit any month's numbers independently. A month whose gross differs from the previous one is highlighted.</div>
        <div style={{ background: "#ECFDF5", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "#15803D" }}>Total net pay · {list.length} month{list.length === 1 ? "" : "s"}</span><b style={{ fontSize: 17, color: "#15803D" }}>{inr(total)}</b>
        </div>
      </>)}
      <div style={{ marginBottom: 12 }}><label className="muted">Note on the slip (optional)</label><input style={{ ...inp, height: 34 }} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Includes arrears for August" /></div>
      {missing.length > 0 && list.length > 0 && <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>Gross salary missing for: {missing.map(m => lbl(m)).join(", ")}</div>}
      {err && <div className="error" style={{ marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="primary" style={{ flex: 1, padding: "11px 0" }} disabled={!ready} onClick={() => { setErr(""); setReview(true); }}>✓ Confirm &amp; review</button>
        <button type="button" onClick={saveDraft} style={{ padding: "11px 18px" }}>Save as draft</button>
      </div>
    </div>
  );
}
