"use client";
// update450: SALARY SLIP — two formats, one form.
//   Format A (Standard): working details + earnings (actual / payable) + deductions, as the Director's sample.
//   Format B (Bank):     salary certificate addressed to a bank, six-row break-up, Director's signature.
// Employee details auto-fill from Staff Master (ID, designation, department, PF No, UAN, ESI, joining date);
// days and amounts pre-fill from that month's GENERATED staff payroll when it exists, else stay blank — every
// figure is editable. Issued through the letters pipeline (fn_issue_letter → PSP/SLP or PSP/SLC → Document
// Register → frozen print page). The slip's figures are stored as JSON in the frozen body.
// (The 414 multi-month table is replaced; its drafts in localStorage are ignored.)
import { useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/data";
import { getStaffPayoutMonth, rupeesInWords } from "@/lib/letters";
import { EARN_ROWS, DED_ROWS, WORK_ROWS, slipTotals, monthLabelPlain } from "@/components/SalarySlipPrint";

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const num = v => Number(v) || 0;
const clean = v => String(v).replace(/[^0-9.]/g, "");
const blankEarn = () => Object.fromEntries(EARN_ROWS.map(([k]) => [k, { actual: "", payable: "" }]));
const blankDed = () => Object.fromEntries(DED_ROWS.map(([k]) => [k, ""]));
const blankWork = () => Object.fromEntries(WORK_ROWS.map(([k]) => [k, ""]));

export default function SalarySlipForm({ person, people, onPerson, onIssue, issuing, roleLabels = {}, company }) {
  const [fmt, setFmt] = useState("A");
  const [month, setMonth] = useState(thisMonth());
  const [earn, setEarn] = useState(blankEarn); const [ded, setDed] = useState(blankDed); const [work, setWork] = useState(blankWork);
  const [note, setNote] = useState(""); const [err, setErr] = useState(""); const [src, setSrc] = useState("");
  const [bank, setBank] = useState({ addressee: "The Bank Manager", bank_name: "", purpose: "bank loan / credit facility", basic: "", hra: "", other: "", deductions: "", ded_label: "PF, PT" });
  const [review, setReview] = useState(false);

  const designation = person ? (roleLabels[person.role] || String(person.role || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())) : "";

  // pre-fill from the month's generated payroll (or the master salary) whenever employee / month changes
  useEffect(() => {
    if (!person) return;
    let live = true;
    (async () => {
      const p = await getStaffPayoutMonth(person.id, month);
      if (!live) return;
      const sal = num(person.monthly_salary);
      const e = blankEarn(), d = blankDed(), w = blankWork();
      if (p) {
        e.basic = { actual: sal ? String(sal) : String(num(p.monthly_salary)), payable: String(Math.max(num(p.monthly_salary) - num(p.deduction), 0)) };
        if (num(p.ot_amount) || num(p.holiday_amount)) e.other = { actual: "", payable: String(num(p.ot_amount) + num(p.holiday_amount)) };
        d.pf = p.pf_amount ? String(p.pf_amount) : ""; d.pt = p.pt_amount ? String(p.pt_amount) : "";
        d.advance = p.advances_deducted ? String(p.advances_deducted) : ""; d.othded = p.other_deduction ? String(p.other_deduction) : "";
        w.wrd = p.days_present != null ? String(p.days_present) : ""; w.phd = p.holiday_paid_days ? String(p.holiday_paid_days) : "";
        setSrc(`Pre-filled from ${monthLabelPlain(month)} payroll (${p.status}). Edit anything.`);
      } else {
        if (sal) e.basic = { actual: String(sal), payable: String(sal) };
        setSrc(sal ? `No payroll generated for ${monthLabelPlain(month)} — Basic from Staff Master; fill the rest.` : `No payroll for ${monthLabelPlain(month)} and no salary in Staff Master — enter the figures.`);
      }
      setEarn(e); setDed(d); setWork(w);
      const gross = num(e.basic.payable) + num(e.other.payable);
      setBank(b => ({ ...b, basic: e.basic.payable, hra: "", other: e.other.payable, deductions: String(num(d.pf) + num(d.pt) + num(d.advance) + num(d.othded) || ""), gross: String(gross) }));
    })();
    return () => { live = false; };
  }, [person?.id, month]);   // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => slipTotals({ earn, ded, work }), [earn, ded, work]);
  const bankTot = useMemo(() => { const gross = num(bank.basic) + num(bank.hra) + num(bank.other); return { basic: num(bank.basic), hra: num(bank.hra), other: num(bank.other), gross, deductions: num(bank.deductions), net: gross - num(bank.deductions) }; }, [bank]);
  const ready = !!person && !!month && (fmt === "A" ? totals.grossPayable > 0 : bankTot.gross > 0);

  function payload() {
    const base = { emp_id: person.id, name: person.full_name, designation, department: person.department || "", pf_no: person.pf_no || "", pf_uan: person.pf_uan || "", esi_no: person.esi_no || "", joining_date: person.joining_date || "", month };
    if (fmt === "A") return { code: "salary_slip", body: "@@SLIP_A@@" + JSON.stringify({ ...base, earn, ded, work, note: note.trim(), totals }) };
    return { code: "salary_cert", body: "@@SLIP_B@@" + JSON.stringify({ ...base, title_name: titleName(person.full_name), addressee: bank.addressee, bank_name: bank.bank_name, purpose: bank.purpose, ded_label: bank.ded_label, totals: bankTot, signatory_name: company?.signatory_name || "", signatory_title: company?.signatory_title || "Director" }) };
  }

  const inp = { width: "100%", boxSizing: "border-box", height: 36 };
  const cell = { width: "100%", height: 28, borderRadius: 6, padding: "0 6px", fontSize: 12, textAlign: "right", boxSizing: "border-box" };
  const lab = { fontSize: 12.5 };

  if (review) return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Review before generating — Format {fmt} · {fmt === "A" ? "Standard" : "Bank"}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Read-only. Go back to change anything; nothing is issued until you press Generate.</div>
      <div style={{ background: "var(--gray-bg)", borderRadius: 10, padding: 14, fontSize: 12.5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><b>{person.full_name} · {designation}</b><span className="muted">{monthLabelPlain(month)}</span></div>
        {fmt === "A" ? (<>
          <div>Working days total <b>{totals.days}</b> · Gross payable <b>{inr(totals.grossPayable)}</b> · Deductions <b>{inr(totals.ded)}</b></div>
          <div style={{ fontWeight: 800, fontSize: 15, marginTop: 6 }}>Net {inr(totals.net)}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>{rupeesInWords(Math.round(totals.net))}</div>
        </>) : (<>
          <div>To {bank.addressee}{bank.bank_name ? ", " + bank.bank_name : ""} · purpose: {bank.purpose}</div>
          <div>Basic {inr(bankTot.basic)} · HRA {inr(bankTot.hra)} · Other {inr(bankTot.other)} · Gross <b>{inr(bankTot.gross)}</b> · Deductions {inr(bankTot.deductions)}</div>
          <div style={{ fontWeight: 800, fontSize: 15, marginTop: 6 }}>Net {inr(bankTot.net)}</div>
        </>)}
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button type="button" onClick={() => setReview(false)} disabled={issuing}>← Back to edit</button>
        <button className="primary" style={{ flex: 1 }} disabled={issuing} onClick={() => { setErr(""); onIssue(payload()); }}>{issuing ? "Generating…" : "✓ Generate · opens Print / Save as PDF"}</button>
      </div>
    </div>
  );

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Salary slip</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Choose the format, the employee and the month. Figures pre-fill from payroll where it exists; everything is editable.</div>

      {/* format choice */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[["A", "Format A — Standard", "Working days · earnings · deductions · net · amount in words. For the employee's record."], ["B", "Format B — Bank", "Salary certificate addressed to the bank, with break-up and Director's signature. For loans, cards, visa."]].map(([k, t, d]) => (
          <div key={k} onClick={() => setFmt(k)} style={{ border: fmt === k ? "2px solid var(--copper)" : "1px solid var(--border)", background: fmt === k ? "#fff8f2" : "#fff", borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: fmt === k ? "var(--copper)" : "var(--text)" }}>{fmt === k ? "● " : "○ "}{t}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{d}</div>
          </div>))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><label className="muted">Employee</label><select style={inp} value={person?.id || ""} onChange={e => onPerson(e.target.value)}><option value="">Select employee</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
        <div><label className="muted">Month</label><input type="month" style={inp} value={month} onChange={e => setMonth(e.target.value)} /></div>
      </div>
      {person && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, fontSize: 12, background: "var(--gray-bg)", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          {[["Emp. ID", "#" + person.id], ["Designation", designation], ["Department", person.department], ["PF No", person.pf_no], ["PF UAN", person.pf_uan], ["ESI No", person.esi_no], ["Joined", person.joining_date]].map(([l, v]) => (
            <div key={l}><span className="muted">{l}: </span><b>{v || "—"}</b></div>))}
          <div className="muted" style={{ gridColumn: "1 / -1", fontSize: 11 }}>From Staff Master — blanks are filled under Workers & Staff Master → Edit → Statutory details.</div>
        </div>)}
      {src && <div className="note" style={{ fontSize: 12, marginBottom: 12 }}>ⓘ {src}</div>}

      {fmt === "A" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1.1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Working details (days)</div>
            {WORK_ROWS.map(([k, l]) => <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 80px", alignItems: "center", gap: 6, marginBottom: 4 }}><span style={lab}>{l}</span><input style={cell} inputMode="decimal" value={work[k]} onChange={e => setWork(w => ({ ...w, [k]: clean(e.target.value) }))} /></div>)}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12.5, borderTop: "1px solid var(--border)", paddingTop: 4 }}><span>Total</span><span>{totals.days}</span></div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Earnings ₹ (actual · payable)</div>
            {EARN_ROWS.map(([k, l]) => <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px", alignItems: "center", gap: 6, marginBottom: 4 }}><span style={lab}>{l}</span>
              <input style={cell} inputMode="decimal" placeholder="actual" value={earn[k].actual} onChange={e => setEarn(x => ({ ...x, [k]: { ...x[k], actual: clean(e.target.value) } }))} />
              <input style={cell} inputMode="decimal" placeholder="payable" value={earn[k].payable} onChange={e => setEarn(x => ({ ...x, [k]: { ...x[k], payable: clean(e.target.value) } }))} /></div>)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px", fontWeight: 700, fontSize: 12.5, borderTop: "1px solid var(--border)", paddingTop: 4, textAlign: "right" }}><span style={{ textAlign: "left" }}>Gross income</span><span>{inr(totals.grossActual)}</span><span>{inr(totals.grossPayable)}</span></div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Deductions ₹</div>
            {DED_ROWS.map(([k, l]) => <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 100px", alignItems: "center", gap: 6, marginBottom: 4 }}><span style={lab}>{l}</span><input style={cell} inputMode="decimal" value={ded[k]} onChange={e => setDed(x => ({ ...x, [k]: clean(e.target.value) }))} /></div>)}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12.5, borderTop: "1px solid var(--border)", paddingTop: 4 }}><span>Gross ded.</span><span>{inr(totals.ded)}</span></div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label className="muted">Addressed to</label><input style={inp} value={bank.addressee} onChange={e => setBank(b => ({ ...b, addressee: e.target.value }))} /></div>
          <div><label className="muted">Bank / organisation (optional)</label><input style={inp} value={bank.bank_name} onChange={e => setBank(b => ({ ...b, bank_name: e.target.value }))} placeholder="e.g. HDFC Bank, Navrangpura branch" /></div>
          <div style={{ gridColumn: "1 / -1" }}><label className="muted">Purpose</label><input style={inp} value={bank.purpose} onChange={e => setBank(b => ({ ...b, purpose: e.target.value }))} /></div>
          {[["basic", "Basic ₹"], ["hra", "HRA ₹"], ["other", "Other allowances ₹"], ["deductions", "Total deductions ₹"]].map(([k, l]) => (
            <div key={k}><label className="muted">{l}</label><input style={inp} inputMode="decimal" value={bank[k]} onChange={e => setBank(b => ({ ...b, [k]: clean(e.target.value) }))} /></div>))}
          <div><label className="muted">Deductions label</label><input style={inp} value={bank.ded_label} onChange={e => setBank(b => ({ ...b, ded_label: e.target.value }))} placeholder="PF, PT" /></div>
          <div style={{ alignSelf: "end", background: "#ECFDF5", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "#15803D" }}>Gross <b>{inr(bankTot.gross)}</b> · Net <b>{inr(bankTot.net)}</b></div>
        </div>
      )}

      {fmt === "A" && (<>
        <div style={{ background: "#ECFDF5", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "#15803D" }}>Net amount · {monthLabelPlain(month)}</span><b style={{ fontSize: 17, color: "#15803D" }}>{inr(totals.net)}</b>
        </div>
        <div style={{ marginBottom: 12 }}><label className="muted">Note on the slip (optional)</label><input style={{ ...inp, height: 34 }} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Includes arrears for August" /></div>
      </>)}
      {err && <div className="error" style={{ marginBottom: 8 }}>{err}</div>}
      <button className="primary" style={{ width: "100%", padding: "11px 0" }} disabled={!ready} onClick={() => { setErr(""); setReview(true); }}>✓ Confirm &amp; review</button>
    </div>
  );
}

function titleName(n) { const s = String(n || "").trim(); return /^(mr|mrs|ms|dr)\.?\s/i.test(s) ? s : "Mr./Ms. " + s.replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()); }
