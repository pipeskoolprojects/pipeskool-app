"use client";
// update349: SALARY SLIP — A4, Print -> Save as PDF, for Labour, Site Staff and Office Staff.
//
// THE ONE DESIGN RULE HERE: this page RECOMPUTES NOTHING. It loads the same
// loadPayrollSummary / getStaffPayouts the Payroll Summary table uses and prints the row.
// Every figure on the slip is the figure that was generated, approved and paid.
//
// That is also why the open divisor question (salary ÷ 30 vs ÷ 26 vs ÷ calendar days) does
// not block this: whatever the engine uses, the slip shows it, and if the divisor changes
// and payroll is regenerated, every slip follows automatically. A slip that did its own
// arithmetic would have to be rebuilt the day that decision lands — and worse, could quietly
// disagree with what was actually paid.
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { Letterhead } from "@/components/Letterhead";   // update450
import { loadPayrollSummary } from "@/lib/payrollSummary";
import { getStaffPayouts } from "@/lib/staffpay";
import { getCompany } from "@/lib/letters";
import { inr } from "@/lib/data";

const NAVY = "#1f2a4b";
const ORANGE = "#FF7A1A";
const pretty = c => String(c || "").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const monthName = m => { const [y, mo] = String(m).split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); };

function Line({ label, value, sub, bold, red }) {
  return (
    <tr>
      <td style={{ padding: "5px 0", fontSize: 12.5, fontWeight: bold ? 700 : 400 }}>
        {label}{sub && <div className="muted" style={{ fontSize: 10.5, fontWeight: 400 }}>{sub}</div>}
      </td>
      <td style={{ padding: "5px 0", fontSize: 12.5, textAlign: "right", fontWeight: bold ? 800 : 600, color: red ? "#b91c1c" : "#111", whiteSpace: "nowrap" }}>
        {value}
      </td>
    </tr>
  );
}
function Head({ children }) {
  return (
    <tr><td colSpan={2} style={{ paddingTop: 12, paddingBottom: 4, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", color: NAVY, borderBottom: "1.5px solid " + ORANGE }}>
      {children}
    </td></tr>
  );
}
function Stat({ label, value }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", minWidth: 92, textAlign: "center" }}>
      <div className="muted" style={{ fontSize: 10 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>{value}</div>
    </div>
  );
}

export default function SalarySlip() {
  const [s, setS] = useState(null);      // the normalised slip
  const [c, setC] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const q = new URLSearchParams(window.location.search);
        const kind = q.get("kind") || "staff";
        const month = q.get("month");
        const site = q.get("site") || "all";
        const id = q.get("id");
        if (!month || !id) { setErr("No employee selected."); return; }
        const comp = await getCompany();
        setC(comp);

        if (kind === "labour") {
          const d = await loadPayrollSummary(month, site);
          const w = d.workers.find(x => String(x.worker_id) === String(id));
          if (!w) { setErr("No generated labour payroll for this worker in " + monthName(month) + "."); return; }
          setS({
            kind: "labour", month, name: w.worker, designation: pretty(w.designation),
            sites: w.sites, status: w.status,
            rateLine: `${inr(w.rate)} per day`,
            earn: [
              ["Worked days", `${w.days} × ${inr(w.rate)}`, inr(w.workedPay)],
              ...(w.woDays ? [["Paid weekly off", `${w.woDays} day(s)`, inr(w.woAmt)]] : []),
              ...(w.holDays ? [["Paid holidays", `${w.holDays} day(s)`, inr(w.holAmt)]] : []),
              ["Basic wages", "", inr(w.basic), true],
              ...(w.otH ? [["Overtime", `${w.otH} h`, inr(w.otAmt)]] : []),
            ],
            gross: w.gross,
            ded: [["PF / SI", "", inr(w.pf)], ["Professional tax", "", inr(w.pt)], ["Other deduction", "", inr(w.other)], ["Advance recovered", "", inr(w.adv)]],
            totalDed: w.totalDed, net: w.net,
            stats: [["Days worked", w.days], ["Paid off", w.woDays || 0], ["Paid holidays", w.holDays || 0], ["OT hours", w.otH || 0]],
          });
          return;
        }

        const rows = await getStaffPayouts(month, site);
        const p = rows.find(x => String(x.user_id) === String(id) || String(x.id) === String(id));
        if (!p) { setErr("No generated staff salary for this person in " + monthName(month) + ". Generate it on the Staff Salary tab."); return; }
        const totalDed = +(p.deduction + p.pf + p.pt + p.other + p.adv).toFixed(2);
        setS({
          kind: "staff", month, name: p.name, designation: pretty(p.role), status: p.status,
          bankAc: p.bankAc, ifsc: p.ifsc, pan: p.pan, outstanding: p.outstanding,
          rateLine: `${inr(p.salary)} per month`,
          earn: [
            ["Monthly salary", "", inr(p.salary), true],
            ...(p.holDouble ? [["Holiday pay", `worked ${p.holDouble} company holiday(s) — 2× rule`, inr(p.holAmt)]] : []),
            ...(p.ot ? [["Overtime", `${p.ot} h`, inr(p.otAmt)]] : []),
          ],
          gross: +(p.salary + p.holAmt + p.otAmt).toFixed(2),
          ded: [
            ["Absence deduction", `${p.absent} day(s) absent`, inr(p.deduction)],
            ["PF / SI", "", inr(p.pf)], ["Professional tax", "", inr(p.pt)],
            ["Other deduction", "", inr(p.other)], ["Advance recovered", "", inr(p.adv)],
          ],
          totalDed, net: p.net,
          stats: [["Working days", p.working], ["Present", p.present], ["Absent", p.absent], ["Paid holidays", p.holDouble || 0], ["OT hours", p.ot || 0]],
          leaves: p.leaves, leaveBal: p.leaveBal,
        });
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  if (err) return <div style={{ padding: 24 }}><div className="error" style={{ whiteSpace: "pre-wrap" }}>{err}</div></div>;
  if (!s || !c) return <div style={{ padding: 24 }} className="muted">Loading…</div>;

  const draft = s.status && String(s.status).includes("draft");

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 28, background: "#fff", color: "#111", fontFamily: "Inter, Arial, sans-serif", minHeight: "100vh", position: "relative" }}>
      <style>{`
        @media print { .no-print { display:none !important; } body { background:#fff; } @page { size: A4; margin: 14mm; } }
        .slip-wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
                   font-size: 74px; font-weight: 800; color: rgba(180,83,9,0.09); transform: rotate(-30deg);
                   pointer-events: none; z-index: 5; letter-spacing: 0.05em; }
      `}</style>

      {draft && <div className="slip-wm">DRAFT</div>}

      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="primary" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <button onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/wages"); }}>← Back</button>
        {draft && <span className="note amber" style={{ padding: "4px 10px", fontSize: 12 }}>This payroll is still a DRAFT — the slip is marked accordingly.</span>}
      </div>

      {/* letterhead — update450: the shared company letterhead */}
      <Letterhead company={c} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "#6b7280", fontWeight: 700 }}>SALARY SLIP</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{monthName(s.month)}</div>
        </div>
      </div>

      {/* who */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>{s.name}</div>
          <div style={{ fontSize: 12, color: "#4b5563" }}>
            {s.designation || "—"} · {s.kind === "labour" ? "Labour" : "Staff"} · {s.rateLine}
          </div>
          {s.sites && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{s.sites.join(" · ")}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {s.stats.map(([l, v]) => <Stat key={l} label={l} value={v} />)}
        </div>
      </div>

      {/* the money — earnings then deductions, every line traceable */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
        <tbody>
          <Head>EARNINGS</Head>
          {s.earn.map(([l, sub, v, bold]) => <Line key={l} label={l} sub={sub} value={v} bold={bold} />)}
          <Line label="Gross earnings" value={inr(s.gross)} bold />

          <Head>DEDUCTIONS</Head>
          {s.ded.map(([l, sub, v]) => <Line key={l} label={l} sub={sub} value={v} red />)}
          <Line label="Total deductions" value={inr(s.totalDed)} bold red />

          <tr><td colSpan={2} style={{ paddingTop: 14 }}>
            <div style={{ background: "#fff4e5", border: "1px solid #fdba74", borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: NAVY }}>NET PAY</span>
              <span style={{ fontWeight: 800, fontSize: 20, color: NAVY }}>{inr(s.net)}</span>
            </div>
          </td></tr>
        </tbody>
      </table>

      {(s.outstanding > 0 || s.leaveBal != null) && (
        <div className="muted" style={{ fontSize: 11, marginTop: 10, display: "flex", gap: 18, flexWrap: "wrap" }}>
          {s.outstanding > 0 && <span>Advance still outstanding after this month: <b>{inr(s.outstanding)}</b></span>}
          {s.leaveBal != null && <span>Paid leave used this month: <b>{s.leaves}</b> · balance <b>{s.leaveBal}</b></span>}
        </div>
      )}

      {(s.bankAc || s.pan) && (
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          {s.bankAc ? <>Bank A/C {s.bankAc}{s.ifsc ? " · IFSC " + s.ifsc : ""} · </> : null}{s.pan ? "PAN " + s.pan : ""}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 40, marginTop: 44, fontSize: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: "1px solid #333", width: 200, paddingTop: 4, marginTop: 34, fontStyle: "italic", color: "#374151" }}>
            {c.signatory_title || "Authorized Signatory"}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: "1px solid #333", width: 200, paddingTop: 4, marginTop: 34, fontStyle: "italic", color: "#374151" }}>
            Employee signature
          </div>
        </div>
      </div>

      <div style={{ marginTop: 30, paddingTop: 8, borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 9.5, fontWeight: 700, color: "#4b5563", lineHeight: 1.7 }}>
        <div>CIN No: {c.cin} &nbsp; GSTIN: {c.gstin}</div>
        <div>Email ID: {c.email}</div>
        <div style={{ fontWeight: 400, color: "#9ca3af", marginTop: 4 }}>
          Every figure above is taken from the generated payroll for {monthName(s.month)} — nothing on this slip is recalculated. Printed {new Date().toLocaleDateString("en-IN")}.
        </div>
      </div>
    </div>
  );
}
