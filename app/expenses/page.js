"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import {
  getAdvanceQueue, reviewAdvance, getExpenseClaimQueue, reviewExpenseClaim,
  getPettyReconciliation, catLabel, inr,
} from "@/lib/money";

export default function ExpensesPage() {
  const [adv, setAdv] = useState(null);
  const [claims, setClaims] = useState(null);
  const [petty, setPetty] = useState([]);
  const [msg, setMsg] = useState("");

  const load = () => {
    getAdvanceQueue().then(setAdv);
    getExpenseClaimQueue().then(setClaims);
    getPettyReconciliation().then(setPetty);
  };
  useEffect(load, []);

  async function actAdv(id, status) {
    let note = null;
    if (status === "queried") { note = prompt("Query to send back:"); if (!note) return; }
    await reviewAdvance(id, status, note);
    setMsg(status === "approved" ? "Advance approved — to be paid to bank account." : "Updated.");
    load();
  }
  async function actClaim(id, status) {
    let note = null;
    if (status === "queried") { note = prompt("Query to send back:"); if (!note) return; }
    await reviewExpenseClaim(id, status, note);
    setMsg(status === "approved" ? "Claim approved." : "Updated.");
    load();
  }

  const pendingAdv = (adv || []).filter(a => a.status === "pending");
  const pendingClaims = (claims || []).filter(c => c.status === "pending");

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Money &amp; expenses</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — sample data.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        <div className="panel">
          <h2>Advance salary requests {pendingAdv.length > 0 && <span className="badge warn">{pendingAdv.length} pending</span>}</h2>
          {!adv ? <div className="muted">Loading…</div> : adv.length === 0 ? <span className="muted">No requests yet.</span> : (
            <table>
              <thead><tr><th>Date</th><th>Beneficiary</th><th>Reason</th><th className="num">Amount</th><th>Bank</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {adv.map(a => (
                  <tr key={a.id}>
                    <td className="muted">{a.date}</td>
                    <td><div style={{ fontWeight: 600 }}>{a.beneficiary_name}</div><div className="muted">{a.beneficiary_kind === "labour" ? "Labour" : "Staff"}{a.site ? " · " + a.site : ""}</div></td>
                    <td className="muted">{a.reason || "—"}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{inr(a.amount)}</td>
                    <td>{a.bank_on_file ? <span className="badge p">On file</span> : <span className="badge warn">⚠ Missing</span>}</td>
                    <td>{a.status === "approved" ? <span className="badge p">Approved</span> : a.status === "rejected" ? <span className="badge a">Rejected</span> : a.status === "queried" ? <span className="badge h">Queried</span> : <span className="badge gray">Pending</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {a.status === "pending" && <>
                        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actAdv(a.id, "approved")}>✓</button>
                        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actAdv(a.id, "queried")}>?</button>
                        <button style={{ fontSize: 11.5 }} onClick={() => actAdv(a.id, "rejected")}>✕</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="muted" style={{ marginTop: 8 }}>Approved advances are paid to the beneficiary's bank account. A missing-bank flag is a warning, not a blocker — but payment needs bank details.</div>
        </div>

        <div className="panel">
          <h2>Site expense claims {pendingClaims.length > 0 && <span className="badge warn">{pendingClaims.length} pending</span>}</h2>
          {!claims ? <div className="muted">Loading…</div> : claims.length === 0 ? <span className="muted">No claims yet.</span> : (
            <table>
              <thead><tr><th>Date</th><th>Claimant / site</th><th>Category</th><th>Paid to</th><th>Source</th><th className="num">Amount</th><th>Proof</th><th>Action</th></tr></thead>
              <tbody>
                {claims.map(c => (
                  <tr key={c.id}>
                    <td className="muted">{c.date}</td>
                    <td><div style={{ fontWeight: 600 }}>{c.claimant || "—"}</div><div className="muted">{c.site}</div></td>
                    <td>{catLabel(c.category)}</td>
                    <td>{c.paid_to}</td>
                    <td>{c.funding_source === "petty_cash" ? <span className="badge info">Petty cash</span> : <span className="badge gray">Own pocket</span>}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{inr(c.amount)}</td>
                    <td>{c.photo ? <span className="badge p">📎 Bill</span> : <span className="badge warn">No proof</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {c.status === "pending" && <>
                        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actClaim(c.id, "approved")}>✓</button>
                        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actClaim(c.id, "queried")}>?</button>
                        <button style={{ fontSize: 11.5 }} onClick={() => actClaim(c.id, "rejected")}>✕</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="muted" style={{ marginTop: 8 }}>Own-pocket claims are reimbursed to the claimant's bank. Petty-cash claims are deducted from the balance they hold.</div>
        </div>

        <div className="panel">
          <h2>Petty cash — balance held by person</h2>
          {petty.length === 0 ? <span className="muted">No petty cash issued yet.</span> : (
            <table>
              <thead><tr><th>Holder</th><th>Site</th><th className="num">Granted</th><th className="num">Spent</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {petty.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.holder}</td>
                    <td className="muted">{r.site}</td>
                    <td className="num">{inr(r.granted)}</td>
                    <td className="num">{inr(r.spent)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{inr(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
