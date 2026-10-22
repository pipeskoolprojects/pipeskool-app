"use client";
// update186: printable worker attendance slip / monthly report (opened from the muster
// worker sheet and from the web). Browser "Print" → Save as PDF.
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getWorkerMonth } from "@/lib/mobile";
import { fmtHM } from "@/lib/payroll";
import { supabase, isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { canSeeSalary } from "@/lib/payPrivacy";   // update471
import Logo from "@/components/Logo";   // update331c
import { setPayoutStatutory } from "@/lib/payroll";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function Slip() {
  const sp = useSearchParams();
  const workerId = sp.get("worker");
  const [month, setMonth] = useState(sp.get("month") || new Date().toISOString().slice(0, 7));   // update194: month nav
  const [d, setD] = useState(null); const [err, setErr] = useState("");
  const [pay, setPay] = useState(null);   // update194: PF / PT / net from wage payout of this month
  // update195: slip opens in REVIEW/EDIT mode for authorized people, then Preview -> Print
  const sess = typeof window !== "undefined" ? getSession() : null;
  const [canEdit, setCanEdit] = useState(false);
  const [canView, setCanView] = useState(null);   // null = checking
  const [preview, setPreview] = useState(false);
  const [pfIn, setPfIn] = useState(""); const [ptIn, setPtIn] = useState(""); const [statMsg, setStatMsg] = useState("");
  useEffect(() => {
    if (!sess) return;
    if (!canSeeSalary(sess)) { setCanView(false); return; }   // update471: Supervisors never open a salary slip
    const roleOk = ["director", "it_executive", "accountant"].includes(sess.role);
    if (roleOk) { setCanView(true); setCanEdit(true); return; }
    if (isDemo) { setCanView(true); return; }
    supabase.rpc("fn_has_admin", { p_cap: "edit_salary_slip" }).then(({ data }) => {
      setCanEdit(!!data); setCanView(true);   // any logged-in staff can VIEW (muster flow); editing needs role/cap
    }).catch(() => setCanView(true));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPfIn(pay ? String(pay.pf_amount ?? 0) : ""); setPtIn(pay ? String(pay.pt_amount ?? 0) : ""); }, [pay]);
  async function saveStat() {
    if (!pay?.id) { setStatMsg("No wage payout for this month yet — generate wages first."); return; }
    const res = await setPayoutStatutory(pay.id, pfIn, ptIn);
    if (!res.ok) { setStatMsg(res.error); return; }
    setStatMsg("Saved — net updated.");
    // update380: refresh from the same source that produced the current row
    if (pay?.__staff) {
      const { data: sp } = await supabase.from("staff_payouts")
        .select("id, monthly_salary, days_present, days_absent, working_days, deduction, ot_hours, ot_amount, advances_deducted, pf_amount, pt_amount, other_deduction, net, status, holiday_paid_days, holiday_double_days, holiday_half_days, holiday_amount")
        .eq("id", pay.id).maybeSingle();
      setPay(sp ? { ...sp, __staff: true } : null);
    } else {
      const { data } = await supabase.from("wage_payouts").select("id, gross, advances_deducted, pf_amount, pt_amount, net, status")
        .eq("worker_id", Number(workerId)).eq("pay_month", month + "-01").maybeSingle();
      setPay(data || null);
    }
  }
  const shiftMonth = k => setMonth(m => { const dt = new Date(m + "-15"); dt.setMonth(dt.getMonth() + k); return dt.toISOString().slice(0, 7); });
  // update380: for staff the payment authority is staff_payouts (keyed by app_users.id,
  // resolved from the paired worker mobile). For pure labour we still read wage_payouts.
  useEffect(() => {
    if (isDemo || !workerId) return;
    (async () => {
      const { data: w } = await supabase.from("workers").select("mobile").eq("id", Number(workerId)).maybeSingle();
      if (w?.mobile) {
        const { data: u } = await supabase.from("app_users").select("id").eq("mobile", String(w.mobile)).eq("is_active", true).maybeSingle();
        if (u?.id) {
          const { data: sp } = await supabase.from("staff_payouts")
            .select("id, monthly_salary, days_present, days_absent, working_days, deduction, ot_hours, ot_amount, advances_deducted, pf_amount, pt_amount, other_deduction, net, status, holiday_paid_days, holiday_double_days, holiday_half_days, holiday_amount")
            .eq("user_id", u.id).eq("pay_month", month + "-01").maybeSingle();
          if (sp) { setPay({ ...sp, __staff: true }); return; }
        }
      }
      const { data } = await supabase.from("wage_payouts").select("id, gross, advances_deducted, pf_amount, pt_amount, net, status")
        .eq("worker_id", Number(workerId)).eq("pay_month", month + "-01").maybeSingle();
      setPay(data || null);
    })();
  }, [workerId, month]);
  useEffect(() => {
    if (!getSession()) { window.location.replace("/login"); return; }
    if (!workerId) { setErr("No worker given."); return; }
    getWorkerMonth(Number(workerId), month).then(x => x ? setD(x) : setErr("Worker not found or no access."));
  }, [workerId, month]);
  if (canView === false) return <div style={{ padding: 30 }}>Salary slips are available to the office (Accounts / HR / Director) only.</div>;   // update471
  if (err) return <div style={{ padding: 30 }}>{err}</div>;
  if (!d) return <div style={{ padding: 30 }}>Loading…</div>;
  const w = d.worker;
  const label = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 28, fontFamily: "var(--font)", color: "#111", background: "#fff" }}>
      <style>{`
        /* update380: one layout, three surfaces */
        @media (max-width: 640px) {
          .att-tbl { font-size: 11px; }
          .att-tbl th, .att-tbl td { padding: 3px 5px; white-space: nowrap; }
        }
        .slip-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .att-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
        .att-tbl th, .att-tbl td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
        @media print {
          .no-print, button { display: none !important; }
          body { background: #fff; }
          @page { size: A4; margin: 12mm; }
          .att-tbl { font-size: 10.5px; }
          .att-tbl th, .att-tbl td { white-space: normal; word-break: break-word; }
          .slip-scroll { overflow: visible !important; }
          table, tr, td, th { page-break-inside: avoid; }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #222", paddingBottom: 10 }}>
        <div>
          <Logo height={19} />
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>PIPESKOOL PROJECTS PVT. LTD.</div>
          <div style={{ fontSize: 12, color: "#555" }}>Specialist Plumbing &amp; Piping Contractors · Ahmedabad</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Attendance &amp; Wage Slip</div>
          <div style={{ fontSize: 13 }}>{label}</div>
          {canEdit && !preview && pay?.status === "draft" && (
        <div className="no-print" style={{ border: "1px solid #d8d3c8", background: "#faf8f3", borderRadius: 8, padding: "10px 12px", margin: "0 0 12px" }}>
          <b style={{ fontSize: 13 }}>✎ Review before print (authorized only)</b>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginTop: 6, flexWrap: "wrap" }}>
            <div><label style={{ fontSize: 11.5, color: "#777" }}>PF / SI (₹)</label><br /><input inputMode="decimal" value={pfIn} onChange={e => setPfIn(e.target.value)} style={{ width: 110 }} /></div>
            <div><label style={{ fontSize: 11.5, color: "#777" }}>Professional Tax (₹)</label><br /><input inputMode="decimal" value={ptIn} onChange={e => setPtIn(e.target.value)} style={{ width: 110 }} /></div>
            <button className="primary" onClick={saveStat}>Save deductions</button>
            {statMsg && <span style={{ fontSize: 12, color: statMsg.startsWith("Saved") ? "green" : "var(--red)" }}>{statMsg}</span>}
          </div>
          <div style={{ fontSize: 11.5, color: "#777", marginTop: 4 }}>Included in Net = Gross − Advances − PF/SI − P.Tax. Locked once the payout is approved/paid.</div>
        </div>
      )}
      {canEdit && pay && pay.status !== "draft" && !preview && <div className="no-print" style={{ fontSize: 12, color: "#777", margin: "0 0 10px" }}>Payout is {pay.status} — deductions locked.</div>}
      <button style={{ marginRight: 6 }} className="no-print" onClick={() => setPreview(x => !x)}>{preview ? "‹ Back to review" : "👁 Preview"}</button>
      <button style={{ marginRight: 6 }} className="no-print" onClick={() => shiftMonth(-1)}>‹ Prev month</button><button style={{ marginRight: 12 }} className="no-print" onClick={() => shiftMonth(1)}>Next month ›</button>          <button style={{ marginTop: 6, fontSize: 12 }} onClick={() => window.print()}>🖨 Print / Save PDF</button>
        </div>
      </div>
      {/* update381: if the definer RPC fn_staff_pay_for_worker errored, say so loudly
          instead of silently falling back to labour ₹/day. If it succeeded, print how the
          staff record was matched (auth_id / mobile) so a wrong slip is diagnosable at a
          glance instead of us guessing at the code path from a screenshot. */}
      {w.staffPayError && !w.staffPay && (   // update381c: only warn if we could not resolve anywhere
        <div className="no-print" style={{ margin: "8px 0", padding: "8px 12px", background: "#fef2f2", border: "1px solid var(--red)", borderRadius: 6, fontSize: 12.5, color: "#991b1b" }}>
          <b>⚠ Could not read staff record.</b> Salary shown may be the labour placeholder.<br/>
          Details: {w.staffPayError}<br/>
          If this is a monthly-salaried staff member, first run <code>pipeskool_staff_pay_lookup.sql</code> in Supabase; if it's already run, screenshot this and send it — the message names the exact failure.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13, margin: "12px 0" }}>
        <div><b>Worker:</b> {w.name} (ID {w.id})</div><div><b>Category:</b> {w.category} · {w.labour}</div>
        <div><b>Home site:</b> {w.site}</div><div><b>Mobile:</b> {w.mobile}</div>
        <div><b>{w.staffPay ? "Monthly salary:" : "Daily wage:"}</b> {w.staffPay
          ? <>{inr(w.staffPay.salary)}/month <span className="muted" style={{ fontSize: 11.5 }}>· ≈ {inr(w.staffPay.perDay)}/day · matched by {w.staffPay.matchedBy || "?"}</span></>
          : <>{inr(w.wage)} <span className="muted" style={{ fontSize: 11.5 }}>· no staff record found for this profile</span></>}
        </div>
        {w.otEligible ? <div><b>OT rate:</b> {inr(w.otRate)}/h ({w.staffPay ? "salary÷" : "wage ÷"} {w.stdHrs} h)</div> : <div><b>OT:</b> Not eligible</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6, margin: "10px 0" }}>
        {/* update345: Present / Half / Absent / Holidays are each their own line item, and
            Absent no longer swallows Sundays, holidays or the current day. */}
        {[["Present", d.present], ["Half days", d.half], ["Absent", d.absent], ["Holidays", d.holidayDays ?? 0], ["Hours", fmtHM(d.totalHours)], ...(w.otEligible ? [["OT (approved)", fmtHM(d.otHours)]] : []), ["Sundays", d.sundays]].map(([l, v]) => (
          <div key={l} style={{ border: "1px solid #ccc", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}><div style={{ fontSize: 10.5, color: "#666" }}>{l}</div><div style={{ fontSize: 16, fontWeight: 700 }}>{v}</div></div>
        ))}
      </div>
      <div className="slip-scroll">
      <table className="att-tbl">
        <thead><tr style={{ background: "#f2f2ee" }}>{["Date", "Site", "In", "Out", "Hours", "Status", ...(w.otEligible ? ["OT (approved)"] : []), "Punch", "Verified"].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {d.days.map(x => (
            <tr key={x.id}>{[x.date, x.site, x.in, x.out, x.hours ? fmtHM(x.hours) : "—", x.status, ...(w.otEligible ? [x.otApproved ? fmtHM(x.otApproved) : "—"] : []), x.punch, x.verify].map((v, i) => <td key={i} style={{ border: "1px solid #ddd", padding: "3px 6px" }}>{String(v)}</td>)}</tr>
          ))}
          {d.days.length === 0 && <tr><td colSpan={w.otEligible ? 9 : 8} style={{ padding: 8, color: "#777" }}>No attendance recorded this month.</td></tr>}
        </tbody>
      </table>
      </div>
      {/* update380: STAFF SLIP is a complete rewrite of the pay block. It never uses the
          paired worker's ₹/day; it reads monthly_salary and days-in-month, mirrors the
          Staff Salary sheet's own calculation, and pulls PF/PT/Adv from staff_payouts. */}
      {w.staffPay ? (() => {
        const perDay = Number(w.staffPay.perDay || 0);
        const attended = Number(d.present) + Number(d.half) * 0.5;
        const daysPay = Math.round(attended * perDay * 100) / 100;
        const otAmt = Math.round(Number(d.otHours || 0) * Number(w.otRate || 0) * 100) / 100;
        const gross = daysPay + otAmt;
        return (<>
          <div style={{ marginTop: 14, fontSize: 12.5, background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "8px 12px" }}>
            <b>Monthly-salaried staff.</b> Daily rate = {inr(w.staffPay.salary)} ÷ actual days this month = <b>{inr(perDay)}/day</b>. This slip shows the computed pay; the authoritative record is the Staff Salary sheet.
          </div>
          <table style={{ marginTop: 14, fontSize: 13, borderCollapse: "collapse", minWidth: 320 }}>
            <tbody>
              <tr><td style={{ padding: "3px 10px 3px 0" }}>Monthly salary</td><td style={{ textAlign: "right" }}>{inr(w.staffPay.salary)}</td></tr>
              <tr><td style={{ padding: "3px 10px 3px 0" }}>Present / Half / Absent</td><td style={{ textAlign: "right" }}>{d.present} · {d.half} · {d.absent}</td></tr>
              <tr><td style={{ padding: "3px 10px 3px 0" }}>Days pay ({d.present} + {d.half}×½) × {inr(perDay)}</td><td style={{ textAlign: "right" }}>{inr(daysPay)}</td></tr>
              {w.otEligible && Number(d.otHours) > 0 && <tr><td style={{ padding: "3px 10px 3px 0" }}>OT {fmtHM(d.otHours)} × {inr(w.otRate)}/h</td><td style={{ textAlign: "right" }}>{inr(otAmt)}</td></tr>}
              {pay?.__staff && <>
                <tr><td style={{ padding: "3px 10px 3px 0" }}>Advances deducted</td><td style={{ textAlign: "right" }}>−{inr(pay.advances_deducted)}</td></tr>
                <tr><td style={{ padding: "3px 10px 3px 0" }}>PF / SI</td><td style={{ textAlign: "right" }}>−{inr(pay.pf_amount)}</td></tr>
                <tr><td style={{ padding: "3px 10px 3px 0" }}>Professional Tax</td><td style={{ textAlign: "right" }}>−{inr(pay.pt_amount)}</td></tr>
                {Number(pay.other_deduction) > 0 && <tr><td style={{ padding: "3px 10px 3px 0" }}>Other deductions</td><td style={{ textAlign: "right" }}>−{inr(pay.other_deduction)}</td></tr>}
                <tr style={{ fontWeight: 700, borderTop: "1px solid #999" }}><td style={{ padding: "4px 10px 4px 0" }}>Net payable ({pay.status})</td><td style={{ textAlign: "right" }}>{inr(pay.net)}</td></tr>
              </>}
              <tr style={{ fontWeight: 700, borderTop: "1px solid #222" }}><td style={{ padding: "4px 10px 4px 0" }}>Gross (before advances)</td><td style={{ textAlign: "right" }}>{inr(gross)}</td></tr>
            </tbody>
          </table>
          {!pay?.__staff && (
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>No Staff Salary payout row for this month yet — generate the sheet to lock advances, PF and PT.</div>
          )}
        </>);
      })() : (
        <table style={{ marginTop: 14, fontSize: 13, borderCollapse: "collapse", minWidth: 320 }}>
          <tbody>
            <tr><td style={{ padding: "3px 10px 3px 0" }}>Days pay ({d.present} + {d.half}×½) × {inr(w.wage)}</td><td style={{ textAlign: "right" }}>{inr(d.earned)}</td></tr>
            {w.otEligible && d.otHours > 0 && <tr><td style={{ padding: "3px 10px 3px 0" }}>OT {fmtHM(d.otHours)} × {inr(w.otRate)}/h</td><td style={{ textAlign: "right" }}>{inr(d.otAmt)}</td></tr>}
            {pay && !pay.__staff && <>
              <tr><td style={{ padding: "3px 10px 3px 0" }}>Advances deducted</td><td style={{ textAlign: "right" }}>−{inr(pay.advances_deducted)}</td></tr>
              <tr><td style={{ padding: "3px 10px 3px 0" }}>PF / SI</td><td style={{ textAlign: "right" }}>−{inr(pay.pf_amount)}</td></tr>
              <tr><td style={{ padding: "3px 10px 3px 0" }}>Professional Tax</td><td style={{ textAlign: "right" }}>−{inr(pay.pt_amount)}</td></tr>
              <tr style={{ fontWeight: 700, borderTop: "1px solid #999" }}><td style={{ padding: "4px 10px 4px 0" }}>Net payable ({pay.status})</td><td style={{ textAlign: "right" }}>{inr(pay.net)}</td></tr>
            </>}
            <tr style={{ fontWeight: 700, borderTop: "1px solid #222" }}><td style={{ padding: "4px 10px 4px 0" }}>Gross (before advances)</td><td style={{ textAlign: "right" }}>{inr(d.gross)}</td></tr>
          </tbody>
        </table>
      )}
      {d.history.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 16 }}>Recent payouts</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 4 }}>
            <thead><tr style={{ background: "#f2f2ee" }}>{["Month", "Days", "OT h", "Gross", "Advances", "Net", "Status"].map(h => <th key={h} style={{ border: "1px solid #ccc", padding: "4px 6px", textAlign: "left" }}>{h}</th>)}</tr></thead>
            <tbody>{d.history.map(h => <tr key={h.month}>{[h.month, Number(h.days_full) + Number(h.days_half) * 0.5, h.ot_hours, inr(h.gross), inr(h.advances_deducted), inr(h.net), h.status].map((v, i) => <td key={i} style={{ border: "1px solid #ddd", padding: "3px 6px" }}>{String(v)}</td>)}</tr>)}</tbody>
          </table>
        </>
      )}
      <div style={{ fontSize: 11, color: "#666", marginTop: 18 }}>Generated {new Date().toLocaleString("en-IN")} by {getSession()?.name || ""}. Gross is indicative; final payable is per the approved wage payout (advances deducted). 📷 = proxy punch.</div>
    </div>
  );
}
export default function Page() { return <Suspense fallback={<div style={{ padding: 30 }}>Loading…</div>}><Slip /></Suspense>; }
