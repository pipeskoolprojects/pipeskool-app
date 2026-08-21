"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import AdvanceLedger from "@/components/AdvanceLedger";
import { billUrl, isPdf } from "@/lib/bills";
import { isDemo } from "@/lib/supabase";
import {
  getAdvanceQueue, reviewAdvance, getExpenseClaimQueue, reviewExpenseClaim,
  getBeneficiaries, raiseAdvanceSalary,
  getPettyReturnQueue, confirmPettyReturn, getPettyLedger,
  getPettyReconciliation, catLabel, inr, markAdvancePosted, markExpensePosted,
  getPettyRequestQueue, reviewPettyRequest, requestPettyCash } from "@/lib/money";
import { getSession, canAnySite } from "@/lib/auth";

export default function ExpensesPage() {

  // update196: shared 25-per-page pager for the hand-built lists (DataTables page themselves)
  const [pgPetty, setPgPetty] = useState(1); const [pgRet, setPgRet] = useState(1);
  const LP = 10;   // update200: max 10 records per page for long lists
  const pageOf = (arr, pg) => (arr || []).slice((pg - 1) * LP, pg * LP);
  const Pager = ({ n, pg, set }) => { const pc = Math.max(Math.ceil(n / LP), 1); if (n <= LP) return null; const cur = Math.min(pg, pc); return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", margin: "6px 0" }}>
      <span className="muted" style={{ fontSize: 12, marginRight: "auto" }}>Showing {(cur - 1) * LP + 1}–{Math.min(cur * LP, n)} of {n}</span>
      <button style={{ fontSize: 12 }} disabled={cur <= 1} onClick={() => set(cur - 1)}>‹ Prev</button>
      {Array.from({ length: pc }, (_, i) => i + 1).filter(i => i === 1 || i === pc || Math.abs(i - cur) <= 2).map((i, x, a) => (
        <span key={i}>{x > 0 && a[x - 1] !== i - 1 && <span className="muted">…</span>}
          <button style={{ fontSize: 12, fontWeight: i === cur ? 800 : 400, background: i === cur ? "var(--copper)" : undefined, color: i === cur ? "#fff" : undefined }} onClick={() => set(i)}>{i}</button></span>))}
      <button style={{ fontSize: 12 }} disabled={cur >= pc} onClick={() => set(cur + 1)}>Next ›</button>
    </div>); };

  const [adv, setAdv] = useState(null);
  const [pettyReqs, setPettyReqs] = useState(null);
  const [pettyForm, setPettyForm] = useState({ amount: "", purpose: "", required_date: "", remarks: "" });
  const [pettyMsg, setPettyMsg] = useState("");
  const [pettyAmt, setPettyAmt] = useState({});   // per-request approve-amount inputs (update164)
  async function actPetty(id, status, amount) {
    const note = status === "rejected" ? (window.prompt("Reason (sent to the requester):") || "") : "";
    const res = await reviewPettyRequest(id, status, note, amount);
    if (!res.ok) { window.alert("Could not review: " + res.error); return; }
    getPettyRequestQueue().then(setPettyReqs);
  }
  async function sendWebPetty() {
    setPettyMsg("");
    if (!pettyForm.amount || !pettyForm.purpose) { setPettyMsg("Amount and purpose are required."); return; }
    const res = await requestPettyCash({ site_id: session?.currentSite, user_id: session?.id, requester_name: session?.name,
      amount: pettyForm.amount, purpose: pettyForm.purpose, required_date: pettyForm.required_date || null, remarks: pettyForm.remarks || null });
    if (!res.ok) { setPettyMsg(res.error); return; }
    setPettyForm({ amount: "", purpose: "", required_date: "", remarks: "" });
    setPettyMsg("Request sent."); getPettyRequestQueue().then(setPettyReqs);
  }
  const [claims, setClaims] = useState(null);
  const [petty, setPetty] = useState([]);
  const [advTotals, setAdvTotals] = useState({ taken: 0, rec: 0, out: 0 });   // update200: fed by AdvanceLedger
  // update200: compact overview — summary cards + collapsible module sections (nothing removed,
  // every existing block just lives inside a section that opens on demand)
  const [openSec, setOpenSec] = useState({});   // key -> bool
  const toggleSec = k => setOpenSec(o => ({ ...o, [k]: !o[k] }));
  const Section = ({ id, icon, title, sub, stats, accent, children }) => (
    <div className="panel" style={{ padding: 0, overflow: "hidden", ...(accent ? { borderLeft: "4px solid " + accent } : {}) }}>
      <div onClick={() => toggleSec(id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", flexWrap: "wrap" }}>
        <div style={{ fontSize: 20 }}>{icon}</div>
        <div style={{ minWidth: 160 }}>
          <div style={{ fontWeight: 700 }}>{title}</div>
          {sub && <div className="muted" style={{ fontSize: 11.5 }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginLeft: "auto", alignItems: "center" }}>
          {(stats || []).map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "right" }}>
              <div className="muted" style={{ fontSize: 10.5 }}>{l}</div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: c || "var(--text)" }}>{v}</div>
            </div>
          ))}
          <button style={{ fontSize: 12 }} onClick={e => { e.stopPropagation(); toggleSec(id); }}>{openSec[id] ? "Hide ▲" : "View ▼"}</button>
        </div>
      </div>
      <div style={{ display: openSec[id] ? "block" : "none", padding: "0 16px 16px" }}>{children}</div>{/* kept mounted so section totals stay live */}
    </div>
  );
  const sumBy = (rows, f) => (rows || []).reduce((t, r) => t + (f(r) || 0), 0);
  const approvedClaims = sumBy((claims || []).filter(c => c.status === "approved"), c => c.amount);
  const pendingClaims = sumBy((claims || []).filter(c => c.status === "pending"), c => c.amount);
  const rejectedClaims = sumBy((claims || []).filter(c => c.status === "rejected"), c => c.amount);
  const pettyBal = sumBy(petty, h => h.balance), pettySpent = sumBy(petty, h => h.spent), pettyReturned = sumBy(petty, h => h.returned);
  const advPending = (adv || []).filter(a => a.status === "pending");
  const advApproved = (adv || []).filter(a => a.status === "approved");

  const [msg, setMsg] = useState("");
  const [session, setSession] = useState(null);
  const [bens, setBens] = useState([]);
  const [advForm, setAdvForm] = useState({ beneficiary: "", amount: "", reason: "" });
  const [advErr, setAdvErr] = useState("");
  const [advBusy, setAdvBusy] = useState(false);
  async function submitWebAdvance() {
    setAdvErr("");
    if (!advForm.beneficiary || !advForm.amount) { setAdvErr("Select a person and enter the amount."); return; }
    const b = bens.find(x => `${x.kind}:${x.id}` === advForm.beneficiary);
    setAdvBusy(true);
    const res = await raiseAdvanceSalary({
      site_id: b.site_id || session?.currentSite || null, beneficiary_id: b.id, beneficiary_kind: b.kind,
      beneficiary_name: b.name, amount: Number(advForm.amount), reason: advForm.reason,
      bank_on_file: b.bank, raised_by: session?.id,
    });
    setAdvBusy(false);
    if (!res.ok) { setAdvErr(res.error); return; }
    setMsg(`Advance salary request sent for ${b.name}.`);
    setAdvForm({ beneficiary: "", amount: "", reason: "" });
    getAdvanceQueue().then(setAdv);
  }

  const load = () => {
    getAdvanceQueue().then(setAdv);
    getExpenseClaimQueue().then(setClaims);
    getPettyReconciliation().then(setPetty);
  };
  useEffect(() => {
    const st = getSession(); setSession(st); load();
    if (st?.id) getBeneficiaries(st.id).then(setBens);
    getPettyRequestQueue().then(setPettyReqs);
  }, []);

  async function actAdv(id, status) {
    let note = null;
    if (status === "queried") { note = prompt("Query to send back:"); if (!note) return; }
    await reviewAdvance(id, status, note, session?.id); setMsg("Updated."); load();
  }
  async function actClaim(id, status) {
    let note = null;
    if (status === "queried") { note = prompt("Query to send back:"); if (!note) return; }
    await reviewExpenseClaim(id, status, note, session?.id); setMsg("Updated."); load();
  }

  async function togglePostAdv(r) { await markAdvancePosted(r.id, !r.posted, session?.id); load(); }
  async function togglePostExp(r) { await markExpensePosted(r.id, !r.posted, session?.id); load(); }

  const advCols = [
    { key: "date", label: "Date", filter: "search" },
    { key: "beneficiary_name", label: "Beneficiary", filter: "select", render: r => <span style={{ fontWeight: 600 }}>{r.beneficiary_name}</span> },
    { key: "beneficiary_kind", label: "Type", filter: "select", optionLabel: o => o === "labour" ? "Labour" : "Staff", render: r => r.beneficiary_kind === "labour" ? "Labour" : "Staff" },
    { key: "site", label: "Site", filter: "select" },
    { key: "reason", label: "Reason", render: r => <span className="muted">{r.reason || "—"}{r.response && <div style={{ color: "var(--green)" }}>↩ {r.response}</div>}{r.status === "queried" && r.query && <div style={{ color: "var(--amber)" }}>❓ {r.query}</div>}</span> },
    { key: "amount", label: "Amount", type: "num", render: r => inr(r.amount), exportValue: r => r.amount },
    { key: "bank_on_file", label: "Bank", filter: "select", optionLabel: o => o ? "On file" : "Missing", render: r => r.bank_on_file ? <span className="badge p">On file</span> : <span className="badge warn">⚠ Missing</span>, exportValue: r => r.bank_on_file ? "On file" : "Missing" },
    { key: "status", label: "Status", filter: "select", render: r => r.status === "approved" ? <span className="badge p">Approved</span> : r.status === "rejected" ? <span className="badge a">Rejected</span> : r.status === "queried" ? <span className="badge h">Queried</span> : <span className="badge gray">Pending</span> },
    { key: "approved_on", label: "Appr. date", render: r => <span className="muted">{r.approved_on || "—"}</span> },
    { key: "approved_by", label: "Appr. by", filter: "select", render: r => <span className="muted">{r.approved_by || "—"}</span> },
    { key: "posted", label: "Tally", filter: "select", optionLabel: o => o ? "Posted" : "Not posted",
      render: r => r.status === "approved" ? (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
          <input type="checkbox" checked={!!r.posted} onChange={() => togglePostAdv(r)} style={{ width: 16, height: 16, accentColor: "var(--copper)" }} />
          {r.posted ? <span className="badge p">Posted</span> : <span className="badge gray">Mark posted</span>}
        </label>) : <span className="muted">—</span>,
      exportValue: r => r.posted ? "Posted" : "" },
    { key: "_action", label: "Action", sortable: false, render: r => (r.status === "pending" || r.status === "queried") ? (
      <span style={{ whiteSpace: "nowrap" }}>
        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actAdv(r.id, "approved")}>✓</button>
        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actAdv(r.id, "queried")}>?</button>
        <button style={{ fontSize: 11.5 }} onClick={() => actAdv(r.id, "rejected")}>✕</button>
      </span>) : <span className="muted" style={{ fontSize: 11.5 }}>Done</span> },
  ];

  const claimCols = [
    { key: "date", label: "Date", filter: "search" },
    { key: "claimant", label: "Claimant", filter: "select", render: r => <span style={{ fontWeight: 600 }}>{r.claimant || "—"}</span> },
    { key: "site", label: "Site", filter: "select" },
    { key: "category", label: "Category", filter: "select", render: r => catLabel(r.category), exportValue: r => catLabel(r.category) },
    { key: "paid_to", label: "Paid to", filter: "search", render: r => <span>{r.paid_to}{r.response && <div className="muted" style={{ color: "var(--green)" }}>↩ {r.response}</div>}{r.status === "queried" && r.query && <div className="muted" style={{ color: "var(--amber)" }}>❓ {r.query}</div>}</span> },
    { key: "note", label: "Purpose / note", filter: "search", render: r => <span className="muted">{r.note || "—"}</span>, exportValue: r => r.note || "" },
    { key: "bill_links", label: "Bill links (export)", hidden: true, exportValue: r => (r.bills || []).map(b => billUrl(b)).join("  |  ") },
    { key: "funding_source", label: "Source", filter: "select", optionLabel: o => o === "petty_cash" ? "Petty cash" : "Own pocket", render: r => r.funding_source === "petty_cash" ? <span className="badge info">Petty cash</span> : <span className="badge gray">Own pocket</span> },
    { key: "amount", label: "Amount", type: "num", render: r => inr(r.amount), exportValue: r => r.amount },
    { key: "photo", label: "Proof", render: r => (r.bills || []).length === 0
        ? <span className="badge warn">No proof</span>
        : <span>{r.bills.map((b, i) => (
            <span key={i} style={{ whiteSpace: "nowrap", marginRight: 6 }}>
              <a href={billUrl(b)} target="_blank" rel="noreferrer" style={{ fontSize: 11.5 }}
                 title={isPdf(b) ? "Preview PDF" : "Preview image"}>📎 Bill {r.bills.length > 1 ? i + 1 : ""}</a>
              <a href={billUrl(b, true)} download style={{ fontSize: 11.5, marginLeft: 3 }} title="Download">⬇</a>
            </span>))}
          </span>,
      exportValue: r => (r.bills || []).length + " file(s)" },
    { key: "status", label: "Status", filter: "select", render: r => r.status === "approved" ? <span className="badge p">Approved</span> : r.status === "rejected" ? <span className="badge a">Rejected</span> : r.status === "queried" ? <span className="badge h">Queried</span> : <span className="badge gray">Pending</span> },
    { key: "approved_on", label: "Appr. date", render: r => <span className="muted">{r.approved_on || "—"}</span> },
    { key: "approved_by", label: "Appr. by", filter: "select", render: r => <span className="muted">{r.approved_by || "—"}</span> },
    { key: "posted", label: "Tally", filter: "select", optionLabel: o => o ? "Posted" : "Not posted",
      render: r => r.status === "approved" ? (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
          <input type="checkbox" checked={!!r.posted} onChange={() => togglePostExp(r)} style={{ width: 16, height: 16, accentColor: "var(--copper)" }} />
          {r.posted ? <span className="badge p">Posted</span> : <span className="badge gray">Mark posted</span>}
        </label>) : <span className="muted">—</span>,
      exportValue: r => r.posted ? "Posted" : "" },
    { key: "_action", label: "Action", sortable: false, render: r => (r.status === "pending" || r.status === "queried") ? (
      <span style={{ whiteSpace: "nowrap" }}>
        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actClaim(r.id, "approved")}>✓</button>
        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actClaim(r.id, "queried")}>?</button>
        <button style={{ fontSize: 11.5 }} onClick={() => actClaim(r.id, "rejected")}>✕</button>
      </span>) : <span className="muted" style={{ fontSize: 11.5 }}>Done</span> },
  ];

  // returns queue + person ledger (update167)
  const [pettyReturns, setPettyReturns] = useState([]);
  const [ledgerFor, setLedgerFor] = useState("");        // "userId|name"
  const [ledgerRows, setLedgerRows] = useState(null);
  const [lf, setLf] = useState({ site: "all", from: "", to: "", category: "all", type: "all" });
  useEffect(() => { getPettyReturnQueue().then(setPettyReturns); }, []);
  useEffect(() => {
    const id = ledgerFor.split("|")[0];
    if (id) getPettyLedger(Number(id)).then(setLedgerRows); else setLedgerRows(null);
  }, [ledgerFor]);
  async function actReturn(id, action) {
    const note = action === "cancelled" ? window.prompt("Reason (sent to the holder):") : null;
    const res = await confirmPettyReturn(id, action, note);
    if (!res.ok) { window.alert("Could not save: " + res.error); return; }
    setMsg(action === "confirmed" ? "Cash return confirmed — balance updated." : "Return not accepted.");
    getPettyReturnQueue().then(setPettyReturns); load();
    if (ledgerFor) { const id2 = ledgerFor.split("|")[0]; getPettyLedger(Number(id2)).then(setLedgerRows); }
  }
  const ledgerView = (ledgerRows || []).filter(l =>
    (lf.site === "all" || l.site === lf.site)
    && (lf.category === "all" || l.category === lf.category)
    && (lf.type === "all" || l.kind === lf.type)
    && (!lf.from || l.date >= lf.from) && (!lf.to || l.date <= lf.to));

  const pettyCols = [
    { key: "holder", label: "Holder", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.holder}</span> },
    { key: "granted", label: "Granted", type: "num", render: r => inr(r.granted), exportValue: r => r.granted },
    { key: "spent", label: "Spent", type: "num", render: r => inr(r.spent), exportValue: r => r.spent },
    { key: "returned", label: "Returned", type: "num", render: r => inr(r.returned || 0), exportValue: r => r.returned || 0 },
    { key: "balance", label: "Balance", type: "num", render: r => <b>{inr(r.balance)}</b>, exportValue: r => r.balance },
    { key: "settled", label: "", render: r => r.settled ? <span className="badge p">✔ SETTLED</span>
        : <button style={{ fontSize: 11 }} onClick={() => setLedgerFor(r.user_id + "|" + r.holder)}>📒 Ledger</button> },
  ];

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Money &amp; expenses</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — sample data.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        {/* update200: overview cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
          {[["💳 Total expenses", inr(approvedClaims), (claims || []).length + " transactions", null],
            ["🪙 Petty cash held", inr(pettyBal), petty.length + " holders", null],
            ["💸 Advances (approved)", inr(sumBy(advApproved, a => a.amount)), advApproved.length + " requests", null],
            ["✅ Recovered / deducted", inr(advTotals.rec), "through pay", "var(--green)"],
            ["🔺 Outstanding advances", inr(advTotals.out), "to be recovered", advTotals.out > 0 ? "var(--red)" : "var(--green)"],
            ["⏳ Advance requests pending", inr(sumBy(advPending, a => a.amount)), advPending.length + " waiting", advPending.length ? "var(--amber)" : null]].map(([l, v, sub2, c]) => (
            <div key={l} className="panel" style={{ padding: "10px 14px", margin: 0 }}>
              <div className="muted" style={{ fontSize: 11.5 }}>{l}</div>
              <div style={{ fontWeight: 800, fontSize: 19, color: c || "var(--text)" }}>{v}</div>
              <div className="muted" style={{ fontSize: 10.5 }}>{sub2}</div>
            </div>
          ))}
        </div>

        {session && canAnySite(session, "money", "create") && (
          <div className="panel">
            <h2>Raise advance salary</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
              <div><label className="muted">For whom * (staff &amp; labour of your sites)</label>
                <select style={{ width: "100%" }} value={advForm.beneficiary}
                        onChange={e => setAdvForm(f => ({ ...f, beneficiary: e.target.value }))}>
                  <option value="">Select person…</option>
                  {bens.map(b => <option key={`${b.kind}:${b.id}`} value={`${b.kind}:${b.id}`}>{b.label}{!b.bank ? " · ⚠ no bank" : ""}</option>)}
                </select></div>
              <div><label className="muted">Amount ₹ *</label>
                <input style={{ width: "100%" }} inputMode="numeric" value={advForm.amount}
                       onChange={e => setAdvForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div><label className="muted">Reason</label>
                <input style={{ width: "100%" }} value={advForm.reason} placeholder="e.g. medical / festival advance"
                       onChange={e => setAdvForm(f => ({ ...f, reason: e.target.value }))} /></div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button className="primary" disabled={advBusy} onClick={submitWebAdvance}>{advBusy ? "Sending…" : "Send request"}</button></div>
            </div>
            {advErr && <div className="note red" style={{ marginTop: 8 }}>{advErr}</div>}
          </div>
        )}

        <Section id="pettyreq" icon="🪙" title="Petty cash requests" sub="ask · approve · grant"
          stats={[["Pending", (pettyReqs || []).filter(r => r.status === "pending").length, "var(--amber)"], ["Total", (pettyReqs || []).length]]}>
          {session && canAnySite(session, "money", "create") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 12, alignItems: "end" }}>
              <div><label className="muted">Amount ₹ *</label>
                <input style={{ width: "100%" }} inputMode="numeric" value={pettyForm.amount}
                       onChange={e => setPettyForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div><label className="muted">Purpose *</label>
                <input style={{ width: "100%" }} value={pettyForm.purpose}
                       onChange={e => setPettyForm(f => ({ ...f, purpose: e.target.value }))} /></div>
              <div><label className="muted">Required by</label>
                <input type="date" style={{ width: "100%" }} value={pettyForm.required_date}
                       onChange={e => setPettyForm(f => ({ ...f, required_date: e.target.value }))} /></div>
              <div><label className="muted">Remarks</label>
                <input style={{ width: "100%" }} value={pettyForm.remarks}
                       onChange={e => setPettyForm(f => ({ ...f, remarks: e.target.value }))} /></div>
              <div><button className="primary" onClick={sendWebPetty} style={{ width: "100%" }}>Request petty cash</button></div>
            </div>
          )}
          {pettyMsg && <div className="muted" style={{ marginBottom: 8 }}>{pettyMsg}</div>}
          {!pettyReqs ? <div className="muted">Loading…</div> : pettyReqs.length === 0 ? <div className="muted">No petty cash requests yet.</div> : (<>
            <table className="dt-compact">
              <thead><tr><th>Date</th><th>Requester</th><th>Site</th><th className="num">Amount</th><th>Purpose</th><th>Needed by</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {pageOf(pettyReqs, pgPetty).map(r => (
                  <tr key={r.id}>
                    <td className="muted">{r.date}</td>
                    <td style={{ fontWeight: 600 }}>{r.requester}</td>
                    <td className="muted">{r.site}</td>
                    <td className="num">₹{r.amount}
                      {r.status === "approved" && r.approved_amount != null && r.approved_amount !== r.amount
                        ? <div style={{ fontSize: 11, color: "var(--green)" }}>approved ₹{r.approved_amount}</div> : null}</td>
                    <td>{r.purpose}{r.remarks ? <span className="muted"> — {r.remarks}</span> : ""}</td>
                    <td className="muted">{r.required_date || "—"}</td>
                    <td>{r.status === "approved" ? <span className="badge p">Approved</span>
                        : r.status === "rejected" ? <span className="badge a">Rejected{r.query ? " — " + r.query : ""}</span>
                        : <span className="badge gray">Pending</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.status === "pending" && (
                        <>
                          <input inputMode="numeric" style={{ width: 70, fontSize: 11.5, marginRight: 4 }}
                                 value={pettyAmt[r.id] ?? String(r.amount)} title="Amount to approve (can differ from asked)"
                                 onChange={e => setPettyAmt(a => ({ ...a, [r.id]: e.target.value }))} />
                          <button className="primary" style={{ fontSize: 11.5, marginRight: 4 }}
                                  onClick={() => actPetty(r.id, "approved", pettyAmt[r.id] ?? r.amount)}>Approve</button>
                          <button style={{ fontSize: 11.5 }} onClick={() => actPetty(r.id, "rejected")}>Reject</button>
                        </>
                      )}
                      {r.status === "approved" && (
                        <>
                          <button style={{ fontSize: 11.5, marginRight: 4 }} title="Approve a different amount"
                                  onClick={() => { const v = window.prompt("Revised approved amount \u20b9 (asked \u20b9" + r.amount + "):", String(r.approved_amount ?? r.amount)); if (v != null && v !== "") actPetty(r.id, "approved", v); }}>✎ Change amount</button>
                          <button style={{ fontSize: 11.5, color: "var(--red)" }} title="Remove the granted amount and mark rejected"
                                  onClick={() => { if (window.confirm("Withdraw this approval? \u20b9" + (r.approved_amount ?? r.amount) + " will be removed from " + r.requester + "'s petty balance.")) actPetty(r.id, "rejected"); }}>Undo approval</button>
                        </>
                      )}
                      {r.status === "rejected" && (
                        <button style={{ fontSize: 11.5 }} title="Approve after all"
                                onClick={() => { const v = window.prompt("Approve amount \u20b9 (asked \u20b9" + r.amount + "):", String(r.amount)); if (v != null && v !== "") actPetty(r.id, "approved", v); }}>Approve…</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager n={pettyReqs.length} pg={pgPetty} set={setPgPetty} />
          </>)}
        </Section>

        <Section id="advreq" icon="📄" title="Advance salary requests" sub="approve · reject · query"
          stats={[["Pending", inr(sumBy(advPending, a => a.amount)), advPending.length ? "var(--amber)" : undefined], ["Approved", inr(sumBy(advApproved, a => a.amount)), "var(--green)"], ["Requests", (adv || []).length]]}>
          {!adv ? <div className="muted">Loading…</div> :
            <DataTable columns={advCols} rows={adv} exportName="advance_requests" dateField="date" pageSize={10} />}
        </Section>

        <Section id="claims" icon="💳" title="Expenses ledger" sub="all site expenses & payments"
          stats={[["Approved", inr(approvedClaims), "var(--green)"], ["Pending", inr(pendingClaims), pendingClaims ? "var(--amber)" : undefined], ["Rejected", inr(rejectedClaims), rejectedClaims ? "var(--red)" : undefined], ["Transactions", (claims || []).length]]}>
          {!claims ? <div className="muted">Loading…</div> :
            <DataTable columns={claimCols} rows={claims} exportName="expense_claims" dateField="date" pageSize={10} />}
        </Section>

        {pettyReturns.length > 0 && (
          <div className="panel" style={{ borderLeft: "4px solid var(--copper)" }}>
            <h2>Cash returns awaiting confirmation ({pettyReturns.length})</h2>
            <table className="dt-compact"><thead><tr><th>Date</th><th>Holder</th><th>Site</th><th className="num">Amount</th><th>Note</th><th></th></tr></thead>
              <tbody>{pageOf(pettyReturns, pgRet).map(r => (
                <tr key={r.id}>
                  <td className="muted">{r.date}</td><td style={{ fontWeight: 600 }}>{r.holder}</td>
                  <td className="muted">{r.site}</td><td className="num">{inr(r.amount)}</td>
                  <td className="muted">{r.note || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="primary" style={{ fontSize: 11.5, marginRight: 4 }}
                            onClick={() => { if (window.confirm("Confirm you RECEIVED " + inr(r.amount) + " cash from " + r.holder + "? Their balance reduces by this amount.")) actReturn(r.id, "confirmed"); }}>✔ Received</button>
                    <button style={{ fontSize: 11.5 }} onClick={() => actReturn(r.id, "cancelled")}>Not received</button>
                  </td>
                </tr>))}
              </tbody></table>
            <Pager n={pettyReturns.length} pg={pgRet} set={setPgRet} />
          </div>
        )}

        {ledgerFor && (
          <div className="panel" style={{ borderLeft: "4px solid #2b6cb0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Petty ledger — {ledgerFor.split("|")[1]}</h2>
              <span>
                <button style={{ fontSize: 11.5, marginRight: 6 }} onClick={() => {
                  const head = "Date,Type,Site,Category,Detail,Amount,Status,Bill links";
                  const rows = ledgerView.map(l => [l.date, l.kind, l.site, l.category || "", (l.label || "").replace(/,/g, ";"),
                    (l.sign < 0 ? -l.amount : l.amount), l.status, (l.bills || []).map(b => billUrl(b)).join(" | ")].join(","));
                  const csv = [head, ...rows].join("\n");
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
                  a.download = "petty_ledger_" + ledgerFor.split("|")[1].replace(/\s+/g, "_") + ".csv"; a.click();
                }}>⬇ Excel</button>
                <button style={{ fontSize: 11.5 }} onClick={() => setLedgerFor("")}>Close</button>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              <select value={lf.site} onChange={e => setLf(f => ({ ...f, site: e.target.value }))}>
                <option value="all">Site: all</option>
                {[...new Set((ledgerRows || []).map(l => l.site).filter(Boolean))].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={lf.category} onChange={e => setLf(f => ({ ...f, category: e.target.value }))}>
                <option value="all">Category: all</option>
                {[...new Set((ledgerRows || []).map(l => l.category).filter(Boolean))].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={lf.type} onChange={e => setLf(f => ({ ...f, type: e.target.value }))}>
                <option value="all">Type: all</option>
                {[...new Set((ledgerRows || []).map(l => l.kind))].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <input type="date" value={lf.from} onChange={e => setLf(f => ({ ...f, from: e.target.value }))} />
              <input type="date" value={lf.to} onChange={e => setLf(f => ({ ...f, to: e.target.value }))} />
            </div>
            {!ledgerRows ? <div className="muted">Loading…</div> : (
              <table className="dt-compact">
                <thead><tr><th>Date</th><th>Type</th><th>Site</th><th>Category</th><th>Detail</th><th className="num">Amount</th><th>Bills</th></tr></thead>
                <tbody>{ledgerView.map((l, i) => (
                  <tr key={i}>
                    <td className="muted">{l.date}</td>
                    <td>{l.kind}{l.status === "pending" ? <span className="badge gray" style={{ marginLeft: 4 }}>pending</span> : null}</td>
                    <td className="muted">{l.site}</td><td className="muted">{l.category || "—"}</td>
                    <td>{l.label || "—"}</td>
                    <td className="num" style={{ color: l.sign > 0 ? "var(--green)" : l.sign < 0 ? "var(--red)" : "inherit", fontWeight: 600 }}>
                      {l.sign > 0 ? "+" : l.sign < 0 ? "−" : ""}{inr(l.amount)}</td>
                    <td>{l.bills.map((b, j) => (
                      <span key={j} style={{ marginRight: 6 }}>
                        <a href={billUrl(b)} target="_blank" rel="noreferrer">📎</a>
                        <a href={billUrl(b, true)} style={{ marginLeft: 2 }}>⬇</a>
                      </span>))}</td>
                  </tr>))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <Section id="pettyled" icon="📒" title="Petty cash ledger" sub="cash balance held by persons"
          stats={[["Balance held", inr(pettyBal)], ["Spent", inr(pettySpent)], ["Returned", inr(pettyReturned), "var(--green)"], ["Holders", petty.length]]}>
          {petty.length === 0 ? <span className="muted">No petty cash issued yet.</span> :
            <DataTable columns={pettyCols} rows={petty} exportName="petty_cash" pageSize={10} />}
        </Section>
        <div id="advances" />
        <Section id="advled" icon="🧾" title="Advance salary ledger" sub="advances given to employees"
          stats={[["Taken", inr(advTotals.taken)], ["Recovered", inr(advTotals.rec), "var(--green)"], ["Outstanding", inr(advTotals.out), advTotals.out > 0 ? "var(--red)" : "var(--green)"]]}>
          <AdvanceLedger onTotals={setAdvTotals} />
        </Section>
        <Section id="reports" icon="📊" title="Reports" sub="exports & Tally">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
            <span className="muted" style={{ fontSize: 12.5, width: "100%" }}>Every ledger above has its own ⬇ Excel export (with the filters you set). Additional:</span>
            <a href="/tally"><button style={{ fontSize: 12.5 }}>🧾 Tally export</button></a>
            <button style={{ fontSize: 12.5 }} onClick={() => window.print()}>🖨 Print this overview</button>
          </div>
        </Section>
      </main>
    </div>
  );
}
