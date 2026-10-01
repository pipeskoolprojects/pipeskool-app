"use client";
// update450: the two salary-slip PRINT layouts. Both read a FROZEN JSON block stored in
// letters.rendered_body ("@@SLIP_A@@{…}" / "@@SLIP_B@@{…}") — the slip reproduces exactly the
// figures issued, however the master or payroll changes later (same rule as every letter).
//   Format A — Standard: working details · earnings (actual/payable) · deductions · net · words
//   Format B — Bank: salary certificate addressed to the bank with a six-row break-up and signature
import { rupeesInWords as rw, fmtDate } from "@/lib/letters";
const rupeesInWords = v => rw(v).replace(/^Rupees\s+/i, "");   // the slips print the word "Rupees" themselves

export const SLIP_A = "@@SLIP_A@@", SLIP_B = "@@SLIP_B@@";
export function parseSlip(body) {
  const s = String(body || "");
  for (const m of [SLIP_A, SLIP_B]) if (s.startsWith(m)) { try { return { fmt: m === SLIP_A ? "A" : "B", data: JSON.parse(s.slice(m.length)) }; } catch { return null; } }
  return null;
}

const n2 = v => v === "" || v == null || isNaN(Number(v)) ? "" : Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = v => Number(v) || 0;
const ML = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = ym => { const [y, m] = String(ym || "").split("-").map(Number); return m ? `${ML[m - 1]} – ${y}` : ym; };
export const monthLabelPlain = ym => { const [y, m] = String(ym || "").split("-").map(Number); return m ? `${ML[m - 1]} ${y}` : ym; };

export const EARN_ROWS = [["basic", "BASIC"], ["da", "DA"], ["hra", "HRA"], ["trasa", "TRAS.A"], ["conal", "CON.AL"], ["special", "SPECIAL"], ["other", "OTHER"], ["othall", "Oth.All."]];
export const DED_ROWS = [["pf", "P.F"], ["esic", "ESIC"], ["pt", "P.T."], ["tds", "TDS/IT"], ["lwf", "LWF"], ["loan", "Loan"], ["advance", "Advance"], ["othded", "Oth.Ded."]];
export const WORK_ROWS = [["wrd", "WRD"], ["wod", "WOD"], ["phd", "PHD"], ["cl", "CL"], ["pl", "PL"], ["sl", "SL"]];

export function slipTotals(d) {
  const grossActual = EARN_ROWS.reduce((s, [k]) => s + num(d.earn?.[k]?.actual), 0);
  const grossPayable = EARN_ROWS.reduce((s, [k]) => s + num(d.earn?.[k]?.payable), 0);
  const ded = DED_ROWS.reduce((s, [k]) => s + num(d.ded?.[k]), 0);
  const days = WORK_ROWS.reduce((s, [k]) => s + num(d.work?.[k]), 0);
  return { grossActual, grossPayable, ded, net: grossPayable - ded, days };
}

const td = { border: "1px solid #333", padding: "3px 6px", fontSize: 11 };
const th = { ...td, background: "#f3f4f6", textAlign: "center", fontWeight: 700 };
const inner = { border: "none", padding: "2px 6px", fontSize: 11 };
const innerHead = { ...inner, borderBottom: "1px solid #333", textAlign: "center", fontWeight: 700 };
const innerTot = { ...inner, borderTop: "1px solid #333", fontWeight: 700 };
const R = { textAlign: "right" };

export function SlipA({ d, docNo, issued }) {
  const t = slipTotals(d);
  return (
    <div style={{ fontFamily: "Inter, Arial, sans-serif", color: "#111" }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 14, margin: "14px 0 8px", letterSpacing: ".3px" }}>SALARY SLIP FOR THE MONTH OF {monthLabel(d.month).toUpperCase()}</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          <tr><td colSpan={3} style={{ ...td, borderBottom: "none", padding: "4px 6px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
              <tr><td style={{ ...inner, width: "55%" }}><b>Emp. ID :-</b> {d.emp_id}</td><td style={inner}><b>P.F. No. :-</b> {d.pf_no || "—"}</td></tr>
              <tr><td style={inner}><b>Emp. Name :-</b> {String(d.name || "").toUpperCase()}</td><td style={inner}><b>PF UAN :-</b> {d.pf_uan || "—"}</td></tr>
              <tr><td style={inner}><b>Department :-</b> {d.department || "—"}</td><td style={inner}><b>ESI No. :-</b> {d.esi_no || "—"}</td></tr>
              <tr><td style={inner}><b>Designation :-</b> {d.designation || "—"}</td><td style={inner}></td></tr>
            </tbody></table></td></tr>
          <tr><th style={{ ...th, width: "22%" }}>WORKING DETAILS</th><th style={{ ...th, width: "48%" }}>EARNING DETAILS</th><th style={th}>DEDUCTION DETAILS</th></tr>
          <tr>
            <td style={{ ...td, padding: 0, verticalAlign: "top" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
                {WORK_ROWS.map(([k, l]) => <tr key={k}><td style={inner}>{l}</td><td style={{ ...inner, ...R }}>{d.work?.[k] === "" || d.work?.[k] == null ? "—" : n2(d.work[k])}</td></tr>)}
                <tr><td style={innerTot}>TOTAL</td><td style={{ ...innerTot, ...R }}>{n2(t.days)}</td></tr>
              </tbody></table></td>
            <td style={{ ...td, padding: 0, verticalAlign: "top" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
                <tr><th style={{ ...innerHead, width: "40%" }}>Earnings</th><th style={innerHead}>Actual</th><th style={innerHead}>Payable</th></tr>
                {EARN_ROWS.map(([k, l]) => <tr key={k}><td style={inner}>{l}</td><td style={{ ...inner, ...R }}>{n2(d.earn?.[k]?.actual)}</td><td style={{ ...inner, ...R }}>{n2(d.earn?.[k]?.payable)}</td></tr>)}
                <tr><td style={innerTot}>Gross Income</td><td style={{ ...innerTot, ...R }}>{n2(t.grossActual)}</td><td style={{ ...innerTot, ...R }}>{n2(t.grossPayable)}</td></tr>
              </tbody></table></td>
            <td style={{ ...td, padding: 0, verticalAlign: "top" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
                <tr><th style={{ ...innerHead, width: "60%" }}>Deduction</th><th style={innerHead}>Amount</th></tr>
                {DED_ROWS.map(([k, l]) => <tr key={k}><td style={inner}>{l}</td><td style={{ ...inner, ...R }}>{n2(d.ded?.[k])}</td></tr>)}
                <tr><td style={innerTot}>Gross Ded.</td><td style={{ ...innerTot, ...R }}>{n2(t.ded)}</td></tr>
              </tbody></table></td>
          </tr>
          <tr><td colSpan={2} style={td}><b>Rupees</b> &nbsp; <i>{rupeesInWords(Math.round(t.net))}</i></td><td style={td}><b>Net Amount &nbsp;&nbsp; Rs. {n2(t.net)}</b></td></tr>
          <tr><td colSpan={3} style={{ ...td, textAlign: "center", padding: 8 }}>This is a computer generated salary slip and does not require a signature.</td></tr>
        </tbody>
      </table>
      {d.note && <div style={{ fontSize: 11, marginTop: 6 }}><b>Note:</b> {d.note}</div>}
      <div style={{ fontSize: 9.5, color: "#6b7280", marginTop: 6 }}>Doc No. {docNo} · Generated {issued} · Format A — Standard</div>
    </div>
  );
}

export function SlipB({ d, docNo, issued, company: c }) {
  const t = d.totals || {};
  const w = v => rupeesInWords(Math.round(num(v)));   // "Twenty Six Thousand Only"
  const cell = { border: "1px solid #9ca3af", padding: "6px 10px", fontSize: 12 };
  const hd = { ...cell, background: "#f3f4f6", textAlign: "left", fontWeight: 700 };
  return (
    <div style={{ fontFamily: "Inter, Arial, sans-serif", color: "#111", fontSize: 12.5, lineHeight: 1.6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 12 }}><span>Ref: {docNo}</span><span>Date: {issued}</span></div>
      <p style={{ marginTop: 16 }}>To,<br /><b>{d.addressee || "The Bank Manager"}</b>{d.bank_name ? <><br />{d.bank_name}</> : null}</p>
      <p><b>Subject: Salary Certificate for {d.title_name}</b></p>
      <p>To Whom It May Concern,</p>
      <p>This is to certify that <b>{d.title_name}</b>, <b>{d.designation || "employee"}</b>, has been employed with <b>{c?.name ? titleCase(c.name) : "the company"}</b>{d.joining_date ? <> since <b>{fmtDate(d.joining_date)}</b></> : null} and draws a monthly gross salary of <b>₹{n2(t.gross)}</b> (Rupees {w(t.gross)}) and a net take-home salary of <b>₹{n2(t.net)}</b> (Rupees {w(t.net)}) as of <b>{monthLabelPlain(d.month)}</b>.</p>
      <p>The salary break-up is as under:</p>
      <table style={{ borderCollapse: "collapse", width: "70%", margin: "6px 0 10px" }}><tbody>
        <tr><th style={{ ...hd, width: "60%" }}>Component</th><th style={{ ...hd, textAlign: "right" }}>Amount (₹ / month)</th></tr>
        <tr><td style={cell}>Basic</td><td style={{ ...cell, ...R }}>{n2(t.basic)}</td></tr>
        <tr><td style={cell}>HRA</td><td style={{ ...cell, ...R }}>{n2(t.hra)}</td></tr>
        <tr><td style={cell}>Other Allowances</td><td style={{ ...cell, ...R }}>{n2(t.other)}</td></tr>
        <tr><th style={hd}>Gross Salary</th><th style={{ ...hd, ...R }}>{n2(t.gross)}</th></tr>
        <tr><td style={cell}>Total Deductions{d.ded_label ? ` (${d.ded_label})` : ""}</td><td style={{ ...cell, ...R }}>{n2(t.deductions)}</td></tr>
        <tr><th style={hd}>Net Salary</th><th style={{ ...hd, ...R }}>{n2(t.net)}</th></tr>
      </tbody></table>
      <p>This certificate is issued at the request of the employee for the purpose of <b>{d.purpose || "bank loan / credit facility"}</b> and does not constitute any guarantee or liability on the part of the company.</p>
      <p>For, <b>{c?.name ? titleCase(c.name).replace(/Pvt Ltd\.?$/i, "Private Limited") : "the company"}</b></p>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 46 }}>
        <div style={{ height: 60, width: 200, border: "1px dashed #9ca3af", borderRadius: 4, fontSize: 10, color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}>Company stamp</div>
        <div style={{ textAlign: "center", fontSize: 11 }}><div style={{ borderTop: "1px solid #333", paddingTop: 4, marginTop: 40, width: 200 }}><b>{d.signatory_name || c?.signatory_name || ""}</b><br />{d.signatory_title || c?.signatory_title || "Director"}</div></div>
      </div>
    </div>
  );
}

function titleCase(s) { return String(s).toLowerCase().replace(/\b\w/g, m => m.toUpperCase()).replace(/\bPvt\b/i, "Pvt").replace(/\bLtd\b/i, "Ltd"); }
