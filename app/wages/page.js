"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSites, inr } from "@/lib/data";
import { generatePayouts, getPayouts, setPayoutAdvance, setPayoutMode, approvePayouts, markPayoutsPaid } from "@/lib/payroll";
import { generateStaffPayouts, getStaffPayouts, approveStaffPayouts, markStaffPayoutsPaid } from "@/lib/staffpay";
import { getSession } from "@/lib/auth";
import { isDemo } from "@/lib/supabase";
import * as XLSX from "xlsx";

const STATUS = { draft: ["Draft", "gray"], approved: ["Approved", "h"], paid: ["Paid", "p"] };

export default function WagesPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [site, setSite] = useState("all");
  const [sites, setSites] = useState([]);
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("labour");           // labour | staff
  const [srows, setSrows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const sess = typeof window !== "undefined" ? getSession() : null;
  const canApprove = sess && (sess.role === "director" || sess.role === "ho_admin");

  const load = () => { getPayouts(month, site).then(setRows); getStaffPayouts(month).then(setSrows); };
  useEffect(() => { getSites().then(setSites); }, []);
  useEffect(() => { setRows(null); load(); setMsg(""); setErr(""); }, [month, site]);

  async function run(fn, okMsg) {
    setBusy(true); setErr(""); setMsg("");
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(okMsg(r)); load();
  }

  const generate = () => run(() => generatePayouts(site, month),
    r => `Generated from attendance: ${r.created} new, ${r.updated} draft(s) refreshed` +
         (r.skippedFinal ? `, ${r.skippedFinal} approved/paid left untouched` : "") +
         (r.skippedNoWage ? `, ${r.skippedNoWage} skipped (₹0 wage — staff punch profiles)` : "") + ".");
  const approve = () => run(() => approvePayouts(month, site, sess?.id),
    r => r.count + " payout(s) approved.");
  const paid = () => run(() => markPayoutsPaid(month, site),
    r => r.count + " payout(s) marked PAID.");

  async function editAdv(r) {
    const v = prompt(`Advance to deduct for ${r.worker} (gross ${inr(r.gross)}):`, r.adv || 0);
    if (v === null) return;
    const res = await setPayoutAdvance(r.id, v);
    if (!res.ok) { setErr(res.error); return; }
    load();
  }

  function exportExcel() {
    if (!rows?.length) return;
    const data = rows.map(r => ({ Worker: r.worker, Category: r.category, Site: r.site,
      "Full days": r.daysFull, "Half days": r.daysHalf, "Days total": r.days,
      "OT hrs (approved)": r.ot, "Daily rate": r.rate, "OT rate/hr": r.otRate,
      Gross: r.gross, "Advance deducted": r.adv, Net: r.net, "Bank a/c": r.bankAc || "", IFSC: r.ifsc || "", "Pay mode": r.mode, Status: r.status }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Wages " + month);
    XLSX.writeFile(wb, `Pipeskool_wages_${month}${site !== "all" ? "_site" + site : ""}.xlsx`);
  }

  const t = (rows || []).reduce((x, r) => ({ gross: x.gross + r.gross, adv: x.adv + r.adv, net: x.net + r.net, ot: x.ot + r.ot }), { gross: 0, adv: 0, net: 0, ot: 0 });
  const drafts = (rows || []).filter(r => r.status === "draft").length;
  const approved = (rows || []).filter(r => r.status === "approved").length;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Muster roll & wages</h1>
          <div className="filters">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">All sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className={tab === "labour" ? "primary" : ""} onClick={() => setTab("labour")}>👷 Labour payroll</button>
          <button className={tab === "staff" ? "primary" : ""} onClick={() => setTab("staff")}>🧑‍💼 Staff salary</button>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — payroll needs a live database.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

        {tab === "labour" && <div className="panel">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button className="primary" disabled={busy || site === "all"} onClick={generate}
              title={site === "all" ? "Pick a site first" : ""}>⚙ Generate / refresh from attendance</button>
            {canApprove && <button disabled={busy || site === "all" || !drafts} onClick={approve}>✓ Approve {drafts || ""} draft(s)</button>}
            {canApprove && <button disabled={busy || site === "all" || !approved} onClick={paid}>₹ Mark {approved || ""} approved as PAID</button>}
            <button disabled={!rows?.length} onClick={exportExcel}>⬇ Export Excel</button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Own labour only · days from attendance · <b>OT counts only after approval</b> (Attendance → approve OT) · OT paid at daily rate ÷ site working hours · regenerate any time — approved/paid rows are never changed.
          </div>

          {!rows ? <div className="muted">Loading…</div> : rows.length === 0 ? (
            <div className="muted">No payouts for this month{site === "all" ? "" : " at this site"} yet. Pick the site and click <b>Generate</b>.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="dt-compact">
                <thead><tr><th>Worker</th><th>Category</th>{site === "all" && <th>Site</th>}<th className="num">Days (F+H)</th><th className="num">OT h</th><th className="num">Rate</th><th className="num">Gross</th><th className="num">Advance</th><th className="num">Net</th><th>Mode</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map(r => {
                    const [lbl, cls] = STATUS[r.status] || [r.status, "gray"];
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.worker}</td>
                        <td className="muted">{r.category}</td>
                        {site === "all" && <td className="muted">{r.site}</td>}
                        <td className="num">{r.days} <span className="muted" style={{ fontSize: 10.5 }}>({r.daysFull}+{r.daysHalf}½)</span></td>
                        <td className="num">{r.ot ? r.ot.toFixed(1) : "—"}</td>
                        <td className="num">{inr(r.rate)}</td>
                        <td className="num">{inr(r.gross)}</td>
                        <td className="num">
                          {r.status === "draft"
                            ? <a style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => editAdv(r)}>{inr(r.adv)}</a>
                            : inr(r.adv)}
                        </td>
                        <td className="num" style={{ fontWeight: 700 }}>{inr(r.net)}</td>
                        <td>
                          {r.status === "draft"
                            ? <select value={r.mode} onChange={async e => { const x = await setPayoutMode(r.id, e.target.value); if (!x.ok) setErr(x.error); load(); }}>
                                <option value="cash">Cash</option><option value="bank">Bank</option>
                              </select>
                            : <span className="muted">{r.mode}</span>}
                        </td>
                        <td><span className={"badge " + cls}>{lbl}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 800, borderTop: "2px solid var(--text)" }}>
                    <td colSpan={site === "all" ? 4 : 3}>TOTAL — {rows.length} worker(s)</td>
                    <td className="num">{t.ot.toFixed(1)}</td><td></td>
                    <td className="num">{inr(t.gross)}</td>
                    <td className="num">{inr(t.adv)}</td>
                    <td className="num">{inr(t.net)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>}

        {tab === "staff" && (
          <div className="panel">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <button className="primary" disabled={busy} onClick={() => run(() => generateStaffPayouts(month),
                r => `Staff salary generated: ${r.created} new, ${r.updated} draft(s) refreshed` + (r.skippedFinal ? `, ${r.skippedFinal} approved/paid untouched` : "") + ".")}>⚙ Generate from attendance</button>
              {canApprove && <button disabled={busy || !(srows || []).some(r => r.status === "draft")} onClick={() => run(() => approveStaffPayouts(month, sess?.id), r => r.count + " approved.")}>✓ Approve drafts</button>}
              {canApprove && <button disabled={busy || !(srows || []).some(r => r.status === "approved")} onClick={() => run(() => markStaffPayoutsPaid(month), r => r.count + " marked PAID.")}>₹ Mark PAID</button>}
              <button disabled={!srows?.length} onClick={() => {
                const data = (srows || []).map(r => ({ Staff: r.name, Role: r.role, "Salary ₹": r.salary, "Working days": r.working,
                  "Present": r.present, "Absent": r.absent, "Paid leaves used": r.leaves, "Leave balance": r.leaveBal, "Deduction ₹": r.deduction, "OT h": r.ot, "OT ₹": r.otAmt,
                  "Advances ₹": r.adv, "Net ₹": r.net, "Bank a/c": r.bankAc || "", IFSC: r.ifsc || "", PAN: r.pan || "", Status: r.status }));
                const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Staff " + month); XLSX.writeFile(wb, `Pipeskool_staff_salary_${month}.xlsx`);
              }}>⬇ Export Excel</button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Per-day = salary ÷ 30 (fixed) · Sundays paid · leave year Apr–Mar · max 50% of leaves usable Apr–Sep · max 10 leaves at a stretch · absences beyond these limits deduct <b>OT eligible</b> (approved hours, per-day ÷ 8) · approved salary advances auto-deducted · approved/paid rows never change.
            </div>
            {!srows ? <div className="muted">Loading…</div> : srows.length === 0 ? (
              <div className="muted">No staff salary rows for {month}. Set <b>Monthly salary</b> on staff (Workers & Staff Master → Edit) and click Generate.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="dt-compact">
                  <thead><tr><th>Staff</th><th>Role</th><th className="num">Salary</th><th className="num">Present / Working</th><th className="num">Absent</th><th className="num">Paid leave (bal)</th><th className="num">Deduction</th><th className="num">OT h</th><th className="num">OT ₹</th><th className="num">Advances</th><th className="num">Net</th><th>Status</th></tr></thead>
                  <tbody>
                    {srows.map(r => { const [lbl, cls] = STATUS[r.status] || [r.status, "gray"]; return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td><td className="muted">{r.role}</td>
                        <td className="num">{inr(r.salary)}</td>
                        <td className="num">{r.present} / {r.working}</td>
                        <td className="num" style={{ color: r.absent > 0 ? "var(--red)" : "inherit" }}>{r.absent}</td>
                        <td className="num">{r.leaves ? r.leaves : "—"} <span className="muted" style={{ fontSize: 10.5 }}>({r.leaveBal} left)</span></td>
                        <td className="num">{inr(r.deduction)}</td>
                        <td className="num">{r.ot ? r.ot.toFixed(1) : "—"}</td>
                        <td className="num">{inr(r.otAmt)}</td>
                        <td className="num">{inr(r.adv)}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{inr(r.net)}</td>
                        <td><span className={"badge " + cls}>{lbl}</span></td>
                      </tr> ); })}
                  </tbody>
                  <tfoot><tr style={{ fontWeight: 800, borderTop: "2px solid var(--text)" }}>
                    <td colSpan={6}>TOTAL — {srows.length} staff</td>
                    <td className="num">{inr(srows.reduce((t, r) => t + r.deduction, 0))}</td><td></td>
                    <td className="num">{inr(srows.reduce((t, r) => t + r.otAmt, 0))}</td>
                    <td className="num">{inr(srows.reduce((t, r) => t + r.adv, 0))}</td>
                    <td className="num">{inr(srows.reduce((t, r) => t + r.net, 0))}</td><td></td>
                  </tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
