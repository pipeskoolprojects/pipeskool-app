"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { isDemo } from "@/lib/supabase";
import {
  getAdvanceQueue, reviewAdvance, getExpenseClaimQueue, reviewExpenseClaim,
  getPettyReconciliation, catLabel, inr, markAdvancePosted, markExpensePosted,
} from "@/lib/money";
import { getSession } from "@/lib/auth";

export default function ExpensesPage() {
  const [adv, setAdv] = useState(null);
  const [claims, setClaims] = useState(null);
  const [petty, setPetty] = useState([]);
  const [msg, setMsg] = useState("");
  const [session, setSession] = useState(null);

  const load = () => {
    getAdvanceQueue().then(setAdv);
    getExpenseClaimQueue().then(setClaims);
    getPettyReconciliation().then(setPetty);
  };
  useEffect(() => { setSession(getSession()); load(); }, []);

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
    { key: "photo", label: "Proof", render: r => r.photo ? <span className="badge p">📎 Bill</span> : <span className="badge warn">No proof</span>, exportValue: r => r.photo ? "Yes" : "No" },
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
