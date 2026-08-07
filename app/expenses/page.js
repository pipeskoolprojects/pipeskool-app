"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { billUrl, isPdf } from "@/lib/bills";
import { isDemo } from "@/lib/supabase";
import {
  getAdvanceQueue, reviewAdvance, getExpenseClaimQueue, reviewExpenseClaim,
  getBeneficiaries, raiseAdvanceSalary,
  getPettyReconciliation, catLabel, inr, markAdvancePosted, markExpensePosted,
  getPettyRequestQueue, reviewPettyRequest, requestPettyCash } from "@/lib/money";
import { getSession, canAnySite } from "@/lib/auth";

export default function ExpensesPage() {
  const [adv, setAdv] = useState(null);
  const [pettyReqs, setPettyReqs] = useState(null);
  const [pettyForm, setPettyForm] = useState({ amount: "", purpose: "", required_date: "", remarks: "" });
  const [pettyMsg, setPettyMsg] = useState("");
  async function actPetty(id, status) {
    const note = status === "rejected" ? (window.prompt("Reason (sent to the requester):") || "") : "";
    const res = await reviewPettyRequest(id, status, note);
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
    { key: "beneficiary_name", label: "Beneficiary", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.beneficiary_name}</span> },
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
    { key: "claimant", label: "Claimant", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.claimant || "—"}</span> },
    { key: "site", label: "Site", filter: "select" },
    { key: "category", label: "Category", filter: "select", render: r => catLabel(r.category), exportValue: r => catLabel(r.category) },
    { key: "paid_to", label: "Paid to", filter: "search", render: r => <span>{r.paid_to}{r.response && <div className="muted" style={{ color: "var(--green)" }}>↩ {r.response}</div>}{r.status === "queried" && r.query && <div className="muted" style={{ color: "var(--amber)" }}>❓ {r.query}</div>}</span> },
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

  const pettyCols = [
    { key: "holder", label: "Holder", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.holder}</span> },
    { key: "site", label: "Site", filter: "select" },
    { key: "granted", label: "Granted", type: "num", render: r => inr(r.granted), exportValue: r => r.granted },
    { key: "spent", label: "Spent", type: "num", render: r => inr(r.spent), exportValue: r => r.spent },
    { key: "balance", label: "Balance", type: "num", render: r => <b>{inr(r.balance)}</b>, exportValue: r => r.balance },
  ];

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Money &amp; expenses</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — sample data.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

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

        <div className="panel">
          <h2>Petty cash requests</h2>
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
          {!pettyReqs ? <div className="muted">Loading…</div> : pettyReqs.length === 0 ? <div className="muted">No petty cash requests yet.</div> : (
            <table className="dt-compact">
              <thead><tr><th>Date</th><th>Requester</th><th>Site</th><th className="num">Amount</th><th>Purpose</th><th>Needed by</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {pettyReqs.map(r => (
                  <tr key={r.id}>
                    <td className="muted">{r.date}</td>
                    <td style={{ fontWeight: 600 }}>{r.requester}</td>
                    <td className="muted">{r.site}</td>
                    <td className="num">₹{r.amount}</td>
                    <td>{r.purpose}{r.remarks ? <span className="muted"> — {r.remarks}</span> : ""}</td>
                    <td className="muted">{r.required_date || "—"}</td>
                    <td>{r.status === "approved" ? <span className="badge p">Approved</span>
                        : r.status === "rejected" ? <span className="badge a">Rejected{r.query ? " — " + r.query : ""}</span>
                        : <span className="badge gray">Pending</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.status === "pending" && (
                        <>
                          <button className="primary" style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actPetty(r.id, "approved")}>Approve</button>
                          <button style={{ fontSize: 11.5 }} onClick={() => actPetty(r.id, "rejected")}>Reject</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <h2>Advance salary requests</h2>
          {!adv ? <div className="muted">Loading…</div> :
            <DataTable columns={advCols} rows={adv} exportName="advance_requests" dateField="date" />}
        </div>

        <div className="panel">
          <h2>Site expense claims</h2>
          {!claims ? <div className="muted">Loading…</div> :
            <DataTable columns={claimCols} rows={claims} exportName="expense_claims" dateField="date" />}
        </div>

        <div className="panel">
          <h2>Petty cash — balance held by person</h2>
          {petty.length === 0 ? <span className="muted">No petty cash issued yet.</span> :
            <DataTable columns={pettyCols} rows={petty} exportName="petty_cash" />}
        </div>
      </main>
    </div>
  );
}
