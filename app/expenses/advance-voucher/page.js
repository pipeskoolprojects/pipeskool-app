"use client";
// update249: ADVANCE SALARY VOUCHER — print-ready A4, same mechanism as the cash voucher
// (browser Print → Save as PDF, so it behaves identically on Web and Android).
// Writes nothing: it is a view of one advance_salary_requests row.
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { getSession } from "@/lib/auth";
import { getAdvanceVoucher } from "@/lib/voucher";

const NAVY = "#1a2f5e";
const inr2 = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = s => { const p = String(s || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s || ""; };

// module scope — never define a component inside a component (update204)
function Field({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, overflowWrap: "anywhere" }}>{value || "\u2014"}</div>
    </div>
  );
}

function AdvVoucher() {
  const params = useSearchParams();
  const id = params.get("id");
  const [v, setV] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!getSession()) { window.location.replace("/login"); return; }
    if (!id) { setErr("No advance selected."); return; }
    getAdvanceVoucher(id).then(r => r ? setV(r) : setErr("That advance request was not found."))
      .catch(e => setErr(e?.message || String(e)));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div style={{ margin: 40, fontFamily: "system-ui" }}>{err}</div>;
  if (!v) return <div style={{ margin: 40, fontFamily: "system-ui" }}>Loading voucher\u2026</div>;

  return (
    <div style={{ fontFamily: "system-ui", color: "#0F1419", background: "#fff" }}>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { .no-print { display: none !important; } body { background: #fff; } }
        .sheet { max-width: 182mm; margin: 0 auto; border: 1px solid #d6ddea; border-radius: 8px; padding: 16mm 12mm 12mm; }
        table { border-collapse: collapse; width: 100%; }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 8, padding: "14px 20px", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => window.print()} style={{ fontWeight: 700 }}>🖨 Print / Save as PDF</button>
        <button onClick={() => window.close()}>Close</button>
        {v.status !== "approved" && <span style={{ fontSize: 12, color: "#b45309", fontWeight: 700 }}>
          \u26a0 This advance is <b>{v.status}</b>, not approved \u2014 the voucher is marked accordingly</span>}
        {v.partial && <span style={{ fontSize: 12, color: "#2b6cb0", fontWeight: 700 }}>
          Approved {inr2(v.amount)} of {inr2(v.asked)} asked</span>}
      </div>

      <div className="sheet">
        {/* ---------- header ---------- */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ borderLeft: "3px solid " + NAVY, paddingLeft: 10 }}><Logo height={26} /></div>
          <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>PIPESKOOL PROJECTS PVT. LTD.</div>
            <div style={{ fontSize: 10, lineHeight: 1.5, marginTop: 2, color: "#374151" }}>
              102, Darshak, Opp. Shrey Hospital, Punjabi Hall Lane, Navrangpura, Ahmedabad<br />
              GSTIN: 24AAMCP3389A1ZF &nbsp;|&nbsp; Email: pipeskoolprojects@gmail.com
            </div>
          </div>
          <div style={{ border: "2px solid " + NAVY, borderRadius: 4, padding: "8px 12px", textAlign: "center",
            fontSize: 12, fontWeight: 800, color: NAVY, lineHeight: 1.25, whiteSpace: "nowrap" }}>
            ADVANCE<br />SALARY<br />VOUCHER</div>
        </div>

        <div style={{ borderTop: "1px solid #d6ddea", margin: "14px 0 16px" }} />

        {/* ---------- number / date / site + amount ---------- */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
          <div style={{ display: "grid", gap: 7 }}>
            {[["Voucher No.", v.no], ["Date", dmy(v.date)], ["Site", v.site]].map(([k, val]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: "#6b7280" }}>{k}</span>
                <span style={{ fontSize: 12.5, fontWeight: 800 }}>{val || "\u2014"}</span>
              </div>
            ))}
          </div>
          <div style={{ border: "2px solid " + NAVY, borderRadius: 6, padding: "10px 20px", textAlign: "center", minWidth: 170 }}>
            <div style={{ fontSize: 10, color: "#6b7280" }}>Advance Amount</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>\u20b9{inr2(v.amount)}</div>
            {v.partial && <div style={{ fontSize: 9.5, color: "#6b7280", marginTop: 2 }}>asked \u20b9{inr2(v.asked)}</div>}
          </div>
        </div>

        {/* ---------- beneficiary ---------- */}
        <div style={{ border: "1px solid #d6ddea", borderRadius: 6, background: "#f7f9fd", padding: "10px 14px", marginTop: 16 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, color: NAVY, letterSpacing: "0.06em", marginBottom: 8 }}>
            EMPLOYEE / WORKER DETAILS</div>
          {/* a real grid: the reference mock ran every value together on one line */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            <Field label="Name" value={v.name} />
            <Field label="Role" value={[v.kind, v.role].filter(Boolean).join(" \u2014 ")} />
            <Field label="Site" value={v.site} />
            <Field label="Contact" value={v.contact} />
            <Field label="Requested by" value={v.requestedBy} />
          </div>
          <div style={{ borderTop: "1px solid #e3e9f3", marginTop: 10, paddingTop: 8,
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <Field label="Approved by" value={v.approvedBy ? v.approvedBy + " (Director)" : "\u2014"} />
            <Field label="Approved on" value={dmy(v.date)} />
            <Field label="Bank details on file" value={v.bankOnFile ? "Yes" : "No \u2014 paid in cash"} />
          </div>
        </div>

        <div style={{ fontSize: 12, marginTop: 14 }}>
          <span style={{ color: "#6b7280" }}>Rupees in words: </span>
          <b>{v.words}</b>
        </div>

        {/* ---------- particulars ---------- */}
        <table style={{ marginTop: 12, border: "1px solid " + NAVY, borderRadius: 4, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: NAVY, color: "#fff" }}>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11.5 }}>Particulars</th>
              <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 11.5, width: "28%" }}>Amount (\u20b9)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "9px 12px", fontSize: 12, borderBottom: "1px solid #e3e9f3" }}>
                Reason: {v.reason || "Salary advance requested"}</td>
              <td style={{ padding: "9px 12px", fontSize: 12, textAlign: "right", borderBottom: "1px solid #e3e9f3" }}>{inr2(v.amount)}</td>
            </tr>
            <tr style={{ background: "#f7f9fd" }}>
              <td style={{ padding: "9px 12px", fontSize: 12.5, fontWeight: 800 }}>Total Advance Disbursed</td>
              <td style={{ padding: "9px 12px", fontSize: 12.5, fontWeight: 800, textAlign: "right" }}>{inr2(v.amount)}</td>
            </tr>
          </tbody>
        </table>

        {/* ---------- recovery ---------- */}
        <div style={{ border: "1px solid #f0c9a4", background: "#fff7ed", borderRadius: 6, padding: "10px 14px",
          marginTop: 14, fontSize: 11.5, lineHeight: 1.7 }}>
          <b style={{ color: "#b45309" }}>Recovery terms:</b> To be recovered from wages / salary starting the next payroll
          cycle ({v.nextCycle}). &nbsp;\u00b7&nbsp;
          <b style={{ color: "#b45309" }}>Previously outstanding:</b> \u20b9{inr2(v.priorOutstanding)} &nbsp;\u00b7&nbsp;
          <b style={{ color: "#b45309" }}>New outstanding balance after this advance:</b> \u20b9{inr2(v.newOutstanding)}
        </div>

        {v.status !== "approved" && (
          <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, fontWeight: 800, color: "#b91c1c",
            border: "2px dashed #b91c1c", borderRadius: 6, padding: "8px 12px" }}>
            NOT APPROVED \u2014 status: {String(v.status).toUpperCase()} \u00b7 not valid for disbursement
          </div>
        )}

        {/* ---------- signatures ---------- */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 34 }}>
          {[["Authorised By", "(Director)"], ["Paid by / Drawn on", "Cash / Bank"], ["Received by", "(Employee Signature)"]].map(([a, b]) => (
            <div key={a} style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #0F1419", paddingTop: 5, fontSize: 11, fontWeight: 700 }}>{a}</div>
              <div style={{ fontSize: 10, color: "#6b7280" }}>{b}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", fontSize: 9.5, color: "#6b7280", marginTop: 20 }}>
          This is a system generated voucher. No signature required for digital record \u00b7 Pipeskool Site Management Software
        </div>
      </div>
    </div>
  );
}

export default function AdvanceVoucherPage() {
  return <Suspense fallback={<div style={{ margin: 40, fontFamily: "system-ui" }}>Loading\u2026</div>}><AdvVoucher /></Suspense>;
}
