"use client";
// update445: Own-pocket reimbursements — per-person ledger (approved own-pocket spend vs what the company paid back), statement, pay, void
import { useEffect, useMemo, useState } from "react";
import DataTable from "@/components/DataTable";
import { getSession } from "@/lib/auth";
import { getOwnPocketLedger, getOwnPocketStatement, payOwnPocket, voidOwnPocketPayment } from "@/lib/ownPocket";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const fd = d => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const ROLE = { director: "Director", accountant: "Accounts", it_executive: "IT Executive", hr: "HR", supervisor: "Supervisor", site_engineer: "Site engineer", site_incharge: "Site in-charge", project_manager: "Project manager", storekeeper: "Storekeeper", peon: "Office staff" };
const today = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().slice(0, 10);

export default function OwnPocketPanel() {
  const sess = typeof window !== "undefined" ? getSession() : null; const isDirector = sess?.role === "director";
  const [led, setLed] = useState(null); const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [show, setShow] = useState("payable");
  const [stmt, setStmt] = useState(null); const [pay, setPay] = useState(null); const [busy, setBusy] = useState(false);
  const load = () => getOwnPocketLedger().then(r => { setLed(r.rows); setErr(r.error || ""); });
  useEffect(() => { load(); }, []);
  const rows = useMemo(() => (led || []).filter(r => show === "all" || r.balance > 0.004 || r.pending_total > 0), [led, show]);
  const tot = useMemo(() => { const L = led || []; const m = new Date().toISOString().slice(0, 7); return {
    payable: L.reduce((t, r) => t + Math.max(0, r.balance), 0), people: L.filter(r => r.balance > 0.004).length,
    pending: L.reduce((t, r) => t + r.pending_total, 0), pendingN: L.reduce((t, r) => t + Number(r.pending_count || 0), 0),
    oldest: L.filter(r => r.oldest_days != null).sort((a, b) => b.oldest_days - a.oldest_days)[0],
    spent: L.reduce((t, r) => t + r.approved_total, 0), paid: L.reduce((t, r) => t + r.paid_total, 0), month: m }; }, [led]);

  async function openStmt(r) { setStmt({ person: r, loading: true }); const s = await getOwnPocketStatement(r.user_id); setStmt({ person: r, ...s, loading: false }); }
  async function openPay(r) { const s = await getOwnPocketStatement(r.user_id); if (s.error) { setErr(s.error); return; } const sel = {}; s.unpaid.forEach(u => { sel[u.expense_id] = false; }); setPay({ person: r, unpaid: s.unpaid, sel, amount: "", mode: "bank", date: today(), ref: "", note: "" }); }
  const selTotal = pay ? pay.unpaid.filter(u => pay.sel[u.expense_id]).reduce((t, u) => t + u.unpaid, 0) : 0;
  async function recordPay() {
    const amt = Number(pay.amount || selTotal); if (!(amt > 0)) { window.alert("Enter the amount, or tick the expenses you are paying."); return; }
    if (!window.confirm(`Record ${inr(amt)} paid to ${pay.person.full_name} by ${pay.mode.toUpperCase()} on ${pay.date}?`)) return;
    setBusy(true); const r = await payOwnPocket(pay.person.user_id, amt, pay.date, pay.mode, pay.ref, pay.note, pay.unpaid.filter(u => pay.sel[u.expense_id]).map(u => u.expense_id)); setBusy(false);
    if (!r.ok) { window.alert(r.error); return; } setMsg(`${inr(amt)} reimbursed to ${pay.person.full_name} · ${inr(r.balance_after)} still payable.`); setPay(null); load();
  }
  async function voidPay(line) { const reason = window.prompt(`Void this reimbursement of ${inr(line.raw.amount)} (${fd(line.date)})? The record is kept, marked void.\n\nReason (required):`); if (!reason) return; const r = await voidOwnPocketPayment(line.id, reason); if (!r.ok) { window.alert(r.error); return; } load(); openStmt(stmt.person); }
  async function exportStmt() {
    const XLSX = await import("xlsx"); const p = stmt.person;
    const ws = XLSX.utils.aoa_to_sheet([[`Own-pocket statement — ${p.full_name}`], [`Approved own-pocket ${inr(p.approved_total)} · Reimbursed ${inr(p.paid_total)} · Payable ${inr(p.balance)}`], [], ["Date", "Particulars", "Site", "Company owes (+)", "Paid (−)", "Balance"],
      ...stmt.lines.map(l => [l.date, (l.voided ? "[VOID] " : "") + l.text, l.site || "", l.plus ?? "", l.minus || (l.voided ? 0 : ""), l.balance])]);
    ws["!cols"] = [{ wch: 11 }, { wch: 60 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 }]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Statement"); XLSX.writeFile(wb, `own_pocket_${p.full_name.replace(/[^A-Za-z0-9]+/g, "_")}_${today()}.xlsx`);
  }
  function printStmt() {
    const p = stmt.person; const w = window.open("", "_blank"); if (!w) return;
    const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    w.document.write(`<html><head><title>Own-pocket statement — ${esc(p.full_name)}</title><style>body{font-family:Georgia,serif;padding:28px;color:#111}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #ddd;padding:5px 7px;text-align:left}td.n,th.n{text-align:right}h2{margin:0}.m{color:#666;font-size:12px}</style></head><body><h2>Pipeskool Projects Pvt. Ltd.</h2><div class="m">Own-pocket expense statement · ${esc(p.full_name)} · ${fd(today())}</div><p style="font-size:13px">Approved own-pocket expenses <b>${inr(p.approved_total)}</b> · Reimbursed <b>${inr(p.paid_total)}</b> · <b>Payable ${inr(p.balance)}</b></p><table><tr><th>Date</th><th>Particulars</th><th>Site</th><th class="n">Company owes (+)</th><th class="n">Paid (−)</th><th class="n">Balance</th></tr>${stmt.lines.map(l => `<tr><td>${fd(l.date)}</td><td>${l.voided ? "[VOID] " : ""}${esc(l.text)}</td><td>${esc(l.site || "")}</td><td class="n">${l.plus != null ? inr(l.plus) : ""}</td><td class="n">${l.minus ? inr(l.minus) : ""}</td><td class="n">${inr(l.balance)}</td></tr>`).join("")}</table><p style="margin-top:40px;font-size:12px">Employee signature: ____________________ &nbsp;&nbsp;&nbsp; Director: ____________________</p></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  }

  if (!led) return <div className="muted" style={{ padding: 12 }}>Loading…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: "#075985" }}>Money people spent <b>from their own pocket</b> on company work, against what the company has paid back. Separate from petty cash. Only <b>approved</b> expenses count; a reversed expense cancels itself. Expense entry and approval are unchanged.</div>
      {err && <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "8px 12px", borderRadius: 8, fontSize: 12.5 }}>⚠ {err}</div>}
      {msg && <div style={{ background: "#ECFDF5", color: "#065F46", padding: "8px 12px", borderRadius: 8, fontSize: 12.5 }}>{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {[["Total payable (approved, unpaid)", inr(tot.payable), `${tot.people} people`, "#C2410C"], ["Own-pocket spent (approved, all time)", inr(tot.spent), "", null], ["Reimbursed (all time)", inr(tot.paid), "", "#15803D"], ["Awaiting approval", inr(tot.pending), `${tot.pendingN} expenses · not payable yet`, null], ["Oldest unpaid", tot.oldest ? tot.oldest.oldest_days + " days" : "—", tot.oldest ? tot.oldest.full_name : "", tot.oldest && tot.oldest.oldest_days > 30 ? "#B91C1C" : null]].map(([k, v, s, col]) => (
          <div key={k} className="card" style={{ padding: "10px 12px" }}><div className="muted" style={{ fontSize: 11.5 }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700, color: col || undefined }}>{v}</div>{s && <div className="muted" style={{ fontSize: 11 }}>{s}</div>}</div>))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><select value={show} onChange={e => setShow(e.target.value)}><option value="payable">Show: payable or pending</option><option value="all">Show: everyone (incl. fully settled)</option></select></div>
      <DataTable columns={[
        { key: "full_name", label: "Person", render: r => <span><b>{r.full_name}</b><div className="muted" style={{ fontSize: 11 }}>{ROLE[r.role] || r.role || ""}{r.home_site ? " · " + r.home_site : ""}</div></span> },
        { key: "approved_total", label: "Own-pocket spent (approved)", type: "num", render: r => inr(r.approved_total), exportValue: r => r.approved_total },
        { key: "paid_total", label: "Paid by company", type: "num", render: r => <span style={{ color: "#15803D" }}>{inr(r.paid_total)}</span>, exportValue: r => r.paid_total },
        { key: "balance", label: "Payable now", type: "num", render: r => <b style={{ color: r.balance > 0.004 ? "#C2410C" : "#15803D" }}>{inr(r.balance)}</b>, exportValue: r => r.balance },
        { key: "pending_total", label: "Awaiting approval", type: "num", render: r => r.pending_total > 0 ? inr(r.pending_total) : "—", exportValue: r => r.pending_total },
        { key: "oldest_days", label: "Oldest unpaid", type: "num", render: r => r.oldest_days != null && r.balance > 0.004 ? <span style={{ color: r.oldest_days > 30 ? "#B91C1C" : undefined }}>{r.oldest_days} d</span> : "—", exportValue: r => r.oldest_days },
        { key: "last_paid_on", label: "Last reimbursed", render: r => r.last_paid_on ? `${fd(r.last_paid_on)} · ${inr(r.last_paid_amount)}` : "—" },
        { key: "_act", label: "", exportValue: () => "", render: r => <span style={{ whiteSpace: "nowrap" }}><button style={{ fontSize: 11.5 }} onClick={() => openStmt(r)}>Statement</button>{isDirector && r.balance > 0.004 && <button className="primary" style={{ fontSize: 11.5, marginLeft: 4 }} onClick={() => openPay(r)}>Pay</button>}</span> },
      ]} rows={rows} exportName="own_pocket_reimbursements" />

      {stmt && (
        <div onClick={() => setStmt(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ width: "min(96vw, 900px)", maxHeight: "88vh", overflowY: "auto", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div><b style={{ fontSize: 16 }}>Statement — {stmt.person.full_name}</b><div className="muted" style={{ fontSize: 12 }}>Spent {inr(stmt.person.approved_total)} · Paid {inr(stmt.person.paid_total)} · <b>Payable {inr(stmt.person.balance)}</b></div></div>
              <span><button onClick={printStmt} disabled={stmt.loading}>⬇ PDF</button> <button onClick={exportStmt} disabled={stmt.loading}>⬇ Excel</button> <button onClick={() => setStmt(null)}>Close</button></span>
            </div>
            {stmt.loading ? <div className="muted" style={{ padding: 20 }}>Loading…</div> : stmt.error ? <div style={{ color: "#B91C1C" }}>{stmt.error}</div> : (
              <div style={{ overflowX: "auto", marginTop: 10 }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr>{["Date", "Particulars", "Site", "Company owes (+)", "Paid (−)", "Balance", ""].map((h, i) => <th key={i} style={{ textAlign: i >= 3 && i <= 5 ? "right" : "left", fontSize: 11, color: "#555", padding: "7px 8px", borderBottom: "1px solid #eee", background: "#F7F7F5" }}>{h}</th>)}</tr></thead>
                <tbody>{stmt.lines.map((l, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f1ef", opacity: l.voided ? .5 : 1 }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fd(l.date)}</td>
                    <td style={{ padding: "6px 8px" }}>{l.kind === "pay" ? <b>{l.voided ? "VOID · " : ""}{l.text}</b> : l.text}{l.reversal ? <span style={{ marginLeft: 6, fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "#FEE2E2", color: "#B91C1C" }}>reversal</span> : l.status === "reversed" ? <span style={{ marginLeft: 6, fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "#F3F4F6", color: "#6B7280" }}>reversed</span> : null}{l.voided && l.void_reason ? <div className="muted" style={{ fontSize: 11 }}>void: {l.void_reason}</div> : null}</td>
                    <td style={{ padding: "6px 8px" }}>{l.site || ""}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: l.plus < 0 ? "#B91C1C" : undefined }}>{l.plus != null ? inr(l.plus) : ""}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{l.kind === "pay" ? inr(l.voided ? l.raw.amount : l.minus) : ""}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{inr(l.balance)}</td>
                    <td style={{ padding: "6px 8px" }}>{l.kind === "pay" && !l.voided && isDirector && <button style={{ fontSize: 10.5 }} onClick={() => voidPay(l)}>Void</button>}</td>
                  </tr>))}
                  {(stmt.pending || []).map((p, i) => <tr key={"p" + i} style={{ background: "#FAFAF9", color: "#999" }}><td style={{ padding: "6px 8px" }}>{fd(p.date)}</td><td style={{ padding: "6px 8px" }}>{p.text} <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "#F3F4F6" }}>awaiting approval — not in balance</span></td><td style={{ padding: "6px 8px" }}>{p.site}</td><td style={{ padding: "6px 8px", textAlign: "right" }}>({inr(p.amount)})</td><td></td><td style={{ textAlign: "right" }}>—</td><td></td></tr>)}
                </tbody></table>
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Balance = approved own-pocket expenses − reimbursements paid. Payments settle the oldest expenses first.</div></div>)}
          </div>
        </div>)}

      {pay && (
        <div onClick={() => setPay(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ width: "min(94vw, 520px)", maxHeight: "88vh", overflowY: "auto", padding: 0 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", fontWeight: 700, fontSize: 15 }}>Pay reimbursement — {pay.person.full_name}</div>
            <div style={{ padding: "12px 16px" }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Payable {inr(pay.person.balance)}. Tick what you are paying (oldest first), or type any amount — partial payment is fine.</div>
              <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}><tbody>{pay.unpaid.map(u => (
                <tr key={u.expense_id} style={{ borderBottom: "1px solid #f1f1ef" }}><td style={{ padding: "5px 4px" }}><input type="checkbox" checked={!!pay.sel[u.expense_id]} onChange={e => setPay(p => ({ ...p, sel: { ...p.sel, [u.expense_id]: e.target.checked }, amount: "" }))} /></td><td style={{ padding: "5px 4px" }}>{fd(u.date)} · {u.label}{u.unpaid < u.amount ? <span className="muted" style={{ fontSize: 11 }}> ({inr(u.unpaid)} unpaid of {inr(u.amount)})</span> : null}</td><td style={{ padding: "5px 4px", textAlign: "right" }}>{inr(u.unpaid)}</td></tr>))}</tbody></table>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <label style={{ fontSize: 12 }}>Amount paying *<input inputMode="decimal" value={pay.amount === "" ? (selTotal ? String(selTotal) : "") : pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} placeholder="₹" style={{ display: "block", width: "100%", marginTop: 4 }} /></label>
                <label style={{ fontSize: 12 }}>Mode *<select value={pay.mode} onChange={e => setPay(p => ({ ...p, mode: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 4 }}><option value="bank">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></label>
                <label style={{ fontSize: 12 }}>Date *<input type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 4 }} /></label>
                <label style={{ fontSize: 12 }}>Reference / UTR<input value={pay.ref} onChange={e => setPay(p => ({ ...p, ref: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 4 }} /></label>
              </div>
              <label style={{ fontSize: 12, display: "block", marginTop: 8 }}>Note<input value={pay.note} onChange={e => setPay(p => ({ ...p, note: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 4 }} /></label>
              {(() => { const amt = Number(pay.amount || selTotal) || 0; return amt > 0 ? <div style={{ marginTop: 10, background: "#FFF7E6", border: "1px solid #FDE68A", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#92400E" }}>After this payment: <b>{inr(Math.max(0, pay.person.balance - amt))} still payable</b>{amt > pay.person.balance ? " — amount is more than payable; it will be refused." : ""}</div> : null; })()}
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid #eee", background: "#FAFAF9", display: "flex", justifyContent: "flex-end", gap: 8 }}><button onClick={() => setPay(null)}>Cancel</button><button className="primary" disabled={busy} onClick={recordPay}>{busy ? "Saving…" : `Record reimbursement ${inr(Number(pay.amount || selTotal) || 0)}`}</button></div>
          </div>
        </div>)}
    </div>);
}
