"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import {
  getApprovalQueue, reviewExpense, getSalaryAdvQueue, reviewSalaryAdvance,
  getReconciliation, getCategorySummary, catLabel, recordTransfer,
} from "@/lib/expenses";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function ExpensesPage() {
  const [queue, setQueue] = useState(null);
  const [salAdv, setSalAdv] = useState([]);
  const [recon, setRecon] = useState([]);
  const [cats, setCats] = useState([]);
  const [month] = useState(() => new Date().toISOString().slice(0, 7));
  const [msg, setMsg] = useState("");

  const load = () => {
    getApprovalQueue().then(setQueue);
    getSalaryAdvQueue().then(setSalAdv);
    getReconciliation().then(setRecon);
    getCategorySummary(month).then(setCats);
  };
  useEffect(load, [month]);

  async function act(id, status) {
    let note = null;
    if (status === "queried") {
      note = prompt("Query to send back to the site:");
      if (!note) return;
    }
    await reviewExpense(id, status, note);
    setMsg(status === "approved" ? "Approved — balances updated." : status === "queried" ? "Query sent to site." : "Rejected.");
    load();
  }

  async function actSal(id, status) {
    await reviewSalaryAdvance(id, status);
    setMsg("Salary advance " + status + ".");
    load();
  }

  const catTotal = cats.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Expenses &amp; petty cash</h1>
          <div className="filters">
            <button onClick={() => {
              const holder = prompt("Transfer to (person name / id):"); if (!holder) return;
              const amt = prompt("Amount ₹:"); if (!amt) return;
              recordTransfer({}).then(() => setMsg("Transfer of ₹" + amt + " recorded (demo)."));
            }}>＋ Record imprest transfer</button>
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — sample expense data.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        <div className="panel">
          <h2>Approval queue {queue && <span className="badge warn">{queue.length} pending</span>}</h2>
          {!queue ? <div className="muted">Loading…</div> : queue.length === 0 ? (
            <span className="muted">Nothing pending — all clear.</span>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Site / person</th><th>Category</th><th>Paid to</th>
                  <th className="num">Amount</th><th>Flags</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(e => (
                  <tr key={e.id} style={e.flags.length ? { background: "#fffaf2" } : {}}>
                    <td className="muted">{e.date}</td>
                    <td><div style={{ fontWeight: 600 }}>{e.site}</div><div className="muted">{e.holder}</div></td>
                    <td>{catLabel(e.category)}{e.worker && <div className="muted">→ {e.worker}</div>}</td>
                    <td>{e.paid_to}<div className="muted">{e.mode?.toUpperCase()}{e.photo ? " · 📎 bill" : ""}</div></td>
                    <td className="num" style={{ fontWeight: 600 }}>{inr(e.amount)}</td>
                    <td>{e.flags.length === 0 ? <span className="badge p">Clean</span> :
                      e.flags.map(f => <div key={f}><span className="badge warn">⚠ {f}</span></div>)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => act(e.id, "approved")}>✓</button>
                      <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => act(e.id, "queried")}>?</button>
                      <button style={{ fontSize: 11.5 }} onClick={() => act(e.id, "rejected")}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="muted" style={{ marginTop: 8 }}>
            ✓ approve · ? send query back to site · ✕ reject. Approved labour advances
            auto-deduct from the worker&apos;s wage register.
          </div>
        </div>

        <div className="panel">
          <h2>Salary advance requests</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Staff</th><th>Site</th><th className="num">Amount</th><th>Reason</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {salAdv.map(a => (
                <tr key={a.id}>
                  <td className="muted">{a.date}</td>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td>{a.site}</td>
                  <td className="num">{inr(a.amount)}</td>
                  <td className="muted">{a.reason}</td>
                  <td>{a.status === "approved" ? <span className="badge p">Approved</span> :
                       a.status === "rejected" ? <span className="badge a">Rejected</span> :
                       <span className="badge gray">Pending</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {a.status === "pending" && <>
                      <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actSal(a.id, "approved")}>✓</button>
                      <button style={{ fontSize: 11.5 }} onClick={() => actSal(a.id, "rejected")}>✕</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{ marginTop: 8 }}>
            Approved salary advances stay linked to the staff member and deduct from salary (HR module).
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>Cash reconciliation — site wise, person wise</h2>
            <table>
              <thead>
                <tr><th>Holder</th><th className="num">Transferred</th><th className="num">Approved</th><th className="num">Pending</th><th className="num">In hand</th></tr>
              </thead>
              <tbody>
                {recon.map(r => (
                  <tr key={r.holder + r.site}>
                    <td><div style={{ fontWeight: 600 }}>{r.holder}</div><div className="muted">{r.site}</div></td>
                    <td className="num">{inr(r.transferred)}</td>
                    <td className="num">{inr(r.approved)}</td>
                    <td className="num" style={{ color: "var(--amber)" }}>{inr(r.pending)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{inr(r.inHand)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>This month by category</h2>
            <table>
              <tbody>
                {cats.sort((a, b) => b.amount - a.amount).map(c => (
                  <tr key={c.category}>
                    <td>{catLabel(c.category)}</td>
                    <td style={{ width: "40%" }}>
                      <div className="bar-track"><div className="bar-fill"
                        style={{ width: catTotal ? (c.amount / catTotal) * 100 + "%" : 0 }} /></div>
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{inr(c.amount)}</td>
                  </tr>
                ))}
                <tr><td style={{ fontWeight: 700 }}>Total</td><td></td>
                  <td className="num" style={{ fontWeight: 700 }}>{inr(catTotal)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
