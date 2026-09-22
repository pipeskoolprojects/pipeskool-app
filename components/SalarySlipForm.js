"use client";
// update412: SALARY SLIP form (Letters & Documents → Salary Slip). Slabs: one implicit slab when the
// mid-period toggle is off; validated (inside range, no overlap, no gaps); issued through the SAME letter
// pipeline (fn_issue_letter → PSP/SLP series → Document Register → frozen print).
import { useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/data";
import { rupeesInWords, fmtDate } from "@/lib/letters";

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = s => { const [y, m] = String(s).split("-").map(Number); return y * 12 + (m - 1); };
const lbl = s => { const [y, m] = String(s).split("-").map(Number); return `${M[m - 1]} ${y}`; };
const months = (a, b) => { const out = []; for (let i = ym(a); i <= ym(b); i++) out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`); return out; };
const n = v => Number(v) || 0;
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const DRAFT = id => "psk_slip_draft_" + id;

export default function SalarySlipForm({ person, people, onPerson, onIssue, issuing }) {
  const [from, setFrom] = useState(thisMonth()); const [to, setTo] = useState(thisMonth());
  const [std, setStd] = useState({ gross: "", pf: "", pt: "", others: [] });   // others: [{label, amount}]
  const [multi, setMulti] = useState(false); const [slabs, setSlabs] = useState([]);
  const [err, setErr] = useState(""); const [note, setNote] = useState("");
  useEffect(() => { if (!person) return; try { const d = JSON.parse(localStorage.getItem(DRAFT(person.id)) || "null"); if (d) { setFrom(d.from); setTo(d.to); setStd(d.std); setMulti(d.multi); setSlabs(d.slabs); setNote(d.note || ""); } } catch {} }, [person?.id]);
  useEffect(() => { if (person?.monthly_salary && !std.gross) setStd(s => ({ ...s, gross: String(person.monthly_salary) })); }, [person?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const effSlabs = useMemo(() => multi ? slabs : [{ from, to, gross: std.gross, pf: std.pf, pt: std.pt }], [multi, slabs, from, to, std]);
  const otherTotal = std.others.reduce((s, o) => s + n(o.amount), 0);   // other deductions apply once per month across the period
  const validation = useMemo(() => {
    if (!from || !to || ym(from) > ym(to)) return "From month must be on or before To month.";
    if (multi) {
      if (!slabs.length) return "Add at least one slab or switch the mid-period toggle off.";
      const sorted = [...slabs].sort((a, b) => ym(a.from) - ym(b.from));
      for (const s of sorted) { if (!s.from || !s.to || ym(s.from) > ym(s.to)) return "Each slab needs From ≤ To."; if (ym(s.from) < ym(from) || ym(s.to) > ym(to)) return `Slab ${lbl(s.from)}–${lbl(s.to)} is outside ${lbl(from)}–${lbl(to)}.`; if (!(n(s.gross) > 0)) return `Slab ${lbl(s.from)}–${lbl(s.to)}: gross salary is required.`; }
      for (let i = 1; i < sorted.length; i++) { if (ym(sorted[i].from) <= ym(sorted[i - 1].to)) return `Slabs ${lbl(sorted[i - 1].from)}–${lbl(sorted[i - 1].to)} and ${lbl(sorted[i].from)}–${lbl(sorted[i].to)} overlap.`; if (ym(sorted[i].from) !== ym(sorted[i - 1].to) + 1) return `Gap between ${lbl(sorted[i - 1].to)} and ${lbl(sorted[i].from)} — every month in the period needs a slab.`; }
      if (ym(sorted[0].from) !== ym(from) || ym(sorted[sorted.length - 1].to) !== ym(to)) return "Slabs must cover the whole period.";
    } else if (!(n(std.gross) > 0)) return "Gross salary is required.";
    return "";
  }, [from, to, multi, slabs, std]);
  // month-wise rows: each month takes its slab's gross/PF/PT; other deductions each month
  const rows = useMemo(() => validation ? [] : months(from, to).map(m => { const s = effSlabs.find(x => ym(x.from) <= ym(m) && ym(m) <= ym(x.to)); const g = n(s?.gross), pf = n(s?.pf), pt = n(s?.pt); return { m, gross: g, pf, pt, other: otherTotal, net: g - pf - pt - otherTotal }; }), [validation, from, to, effSlabs, otherTotal]);
  const tot = rows.reduce((a, r) => ({ gross: a.gross + r.gross, pf: a.pf + r.pf, pt: a.pt + r.pt, other: a.other + r.other, net: a.net + r.net }), { gross: 0, pf: 0, pt: 0, other: 0, net: 0 });
  const stdNet = n(std.gross) - n(std.pf) - n(std.pt) - otherTotal;

  function saveDraft() { if (!person) { setErr("Pick an employee first."); return; } localStorage.setItem(DRAFT(person.id), JSON.stringify({ from, to, std, multi, slabs, note })); setErr(""); alert("Draft saved on this device for " + person.full_name + "."); }
  function buildBody() {
    const line = r => `${lbl(r.m).padEnd(9)}  Gross ${inr(r.gross)}  −  PF ${inr(r.pf)}  −  PT ${inr(r.pt)}${r.other ? `  −  Other ${inr(r.other)}` : ""}  =  Net ${inr(r.net)}`;
    const table = rows.map(line).join("\n");
    const others = std.others.filter(o => o.label || n(o.amount)).map(o => `${o.label || "Other deduction"}: ${inr(n(o.amount))}/month`).join("; ");
    const slabTxt = multi ? "Salary revised mid-period: " + [...slabs].sort((a, b) => ym(a.from) - ym(b.from)).map(s => `${lbl(s.from)}–${lbl(s.to)} gross ${inr(n(s.gross))}`).join("; ") + "." : "";
    return {
      "slip.period": `${lbl(from)} – ${lbl(to)} (${rows.length} month${rows.length === 1 ? "" : "s"})`,
      "slip.table": table + (others ? `\nOther deductions each month — ${others}` : ""),
      "slip.gross_total": inr(tot.gross), "slip.deductions_total": inr(tot.pf + tot.pt + tot.other), "slip.net_total": inr(tot.net),
      "slip.net_words": rupeesInWords(Math.round(tot.net)) , "slip.note": [slabTxt, note].filter(Boolean).join("\n"),
    };
  }
  const inp = { width: "100%", boxSizing: "border-box" };
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Salary Slip details</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Fill in the pay period and components. Add a revision slab if the salary changed mid-period.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label className="muted">Employee</label><select style={inp} value={person?.id || ""} onChange={e => onPerson(e.target.value)}><option value="">Select employee</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
        <div><label className="muted">Employee ID / Department</label><input style={inp} disabled value={person ? `#${person.id} · ${person.role_label || person.role || ""}` : ""} placeholder="Auto-filled on selection" /></div>
        <div><label className="muted">From month</label><input type="month" style={inp} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="muted">To month</label><input type="month" style={inp} value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>
      {!multi && (<>
        <div style={{ fontWeight: 600, fontSize: 12.5, margin: "14px 0 6px" }}>Salary components (standard, applies to the whole period)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          <div><label className="muted">Gross salary (₹ / month)</label><input style={inp} inputMode="decimal" value={std.gross} onChange={e => setStd(s => ({ ...s, gross: e.target.value.replace(/[^0-9.]/g, "") }))} /></div>
          <div><label className="muted">PF (₹ / month)</label><input style={inp} inputMode="decimal" value={std.pf} onChange={e => setStd(s => ({ ...s, pf: e.target.value.replace(/[^0-9.]/g, "") }))} /></div>
          <div><label className="muted">PT (₹ / month)</label><input style={inp} inputMode="decimal" value={std.pt} onChange={e => setStd(s => ({ ...s, pt: e.target.value.replace(/[^0-9.]/g, "") }))} /></div>
        </div>
      </>)}
      <div style={{ fontWeight: 600, fontSize: 12.5, margin: "14px 0 6px" }}>Other deductions (each month) <button type="button" style={{ fontSize: 11, marginLeft: 8 }} onClick={() => setStd(s => ({ ...s, others: [...s.others, { label: "", amount: "" }] }))}>＋ Add line</button></div>
      {std.others.map((o, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8, marginBottom: 6 }}><input style={inp} placeholder="e.g. Loan EMI, advance" value={o.label} onChange={e => setStd(s => { const l = [...s.others]; l[i] = { ...l[i], label: e.target.value }; return { ...s, others: l }; })} /><input style={inp} inputMode="decimal" placeholder="₹" value={o.amount} onChange={e => setStd(s => { const l = [...s.others]; l[i] = { ...l[i], amount: e.target.value.replace(/[^0-9.]/g, "") }; return { ...s, others: l }; })} /><button type="button" style={{ fontSize: 11 }} onClick={() => setStd(s => ({ ...s, others: s.others.filter((_, j) => j !== i) }))}>Remove</button></div>)}
      {!multi && <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 6 }}><div><label className="muted">Net pay / month (auto)</label><input style={inp} disabled value={n(std.gross) ? inr(stdNet) : ""} /></div></div>}

      <div style={{ background: "var(--gray-bg)", borderRadius: 10, padding: 12, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontWeight: 700, fontSize: 13 }}>Salary changed mid-period</div><div className="muted" style={{ fontSize: 11.5 }}>Turn this on if pay was lower in earlier months and increased partway through</div></div>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={multi} onChange={e => { setMulti(e.target.checked); if (e.target.checked && !slabs.length) setSlabs([{ from, to, gross: std.gross, pf: std.pf, pt: std.pt }]); }} /></label>
        </div>
        {multi && (<div style={{ marginTop: 10 }}>
          {slabs.map((s, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
              <div><label className="muted">From</label><input type="month" style={inp} value={s.from} onChange={e => setSlabs(l => l.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} /></div>
              <div><label className="muted">To</label><input type="month" style={inp} value={s.to} onChange={e => setSlabs(l => l.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} /></div>
              <div><label className="muted">Gross ₹</label><input style={inp} inputMode="decimal" value={s.gross} onChange={e => setSlabs(l => l.map((x, j) => j === i ? { ...x, gross: e.target.value.replace(/[^0-9.]/g, "") } : x))} /></div>
              <div><label className="muted">PF ₹</label><input style={inp} inputMode="decimal" value={s.pf} onChange={e => setSlabs(l => l.map((x, j) => j === i ? { ...x, pf: e.target.value.replace(/[^0-9.]/g, "") } : x))} /></div>
              <div><label className="muted">PT ₹</label><input style={inp} inputMode="decimal" value={s.pt} onChange={e => setSlabs(l => l.map((x, j) => j === i ? { ...x, pt: e.target.value.replace(/[^0-9.]/g, "") } : x))} /></div>
              <button type="button" style={{ fontSize: 11, color: "var(--red)" }} onClick={() => setSlabs(l => l.filter((_, j) => j !== i))}>Remove</button>
            </div>))}
          <button type="button" style={{ fontSize: 12 }} onClick={() => { const last = slabs[slabs.length - 1]; const nf = last ? `${Math.floor((ym(last.to) + 1) / 12)}-${String(((ym(last.to) + 1) % 12) + 1).padStart(2, "0")}` : from; setSlabs(l => [...l, { from: nf, to, gross: last?.gross || "", pf: last?.pf || "", pt: last?.pt || "" }]); }}>＋ Add another slab</button>
        </div>)}
      </div>
      {validation ? <div className="note amber" style={{ marginTop: 10 }}>{validation}</div> : (
        <div style={{ marginTop: 12, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>Total net pay for selected period ({rows.length} month{rows.length === 1 ? "" : "s"})</span><span>{inr(tot.net)}</span></div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Gross {inr(tot.gross)} − PF {inr(tot.pf)} − PT {inr(tot.pt)}{tot.other ? ` − other ${inr(tot.other)}` : ""}</div>
        </div>)}
      <div style={{ marginTop: 10 }}><label className="muted">Note on the slip (optional)</label><input style={inp} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Includes arrears for August" /></div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="primary" disabled={issuing || !person || !!validation} onClick={() => { setErr(""); onIssue(buildBody()); }}>{issuing ? "Generating…" : "Generate slip →"}</button>
        <button type="button" onClick={saveDraft}>Save as draft</button>
      </div>
    </div>
  );
}
