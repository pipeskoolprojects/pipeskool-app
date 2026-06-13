"use client";
import { useEffect, useRef, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { CATEGORIES, catLabel, getMyBalances, getMyRecent, submitExpense, submitSalaryAdvance } from "@/lib/expenses";
import { getMuster } from "@/lib/mobile";
import { todayLocal } from "@/lib/today";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function MoneyScreen() {
  const [bal, setBal] = useState(null);
  const [recent, setRecent] = useState([]);
  const [mode, setMode] = useState("none");   // none | expense | salary
  const [workers, setWorkers] = useState([]);
  const [f, setF] = useState({ category: "local_material", amount: "", paid_to: "", pay_mode: "cash", worker_id: "", note: "" });
  const [sf, setSf] = useState({ amount: "", reason: "" });
  const [photo, setPhoto] = useState(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const userId = 1, siteId = 1; // role/auth wiring in launch step

  const load = () => { getMyBalances(userId).then(setBal); getMyRecent(userId).then(setRecent); };
  useEffect(() => { load(); getMuster(siteId).then(setWorkers); }, []);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function saveExpense() {
    setErr(""); setMsg("");
    if (!f.amount || !f.paid_to) { setErr("Amount and paid-to are mandatory."); return; }
    if (f.category === "labour_advance" && !f.worker_id) { setErr("Select the worker for labour advance."); return; }
    setBusy(true);
    const w = workers.find(x => x.id === Number(f.worker_id));
    const res = await submitExpense({
      site_id: siteId, holder_user_id: userId,
      expense_date: todayLocal(),
      category: f.category, amount: Number(f.amount), paid_to: f.paid_to,
      pay_mode: f.pay_mode, note: f.note,
      worker_id: f.worker_id ? Number(f.worker_id) : null,
      worker_name: w?.name, photoFile: photo,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(f.category === "labour_advance"
      ? "Labour advance request sent — needs Director/Accountant verification. On approval it auto-deducts from the worker's wages."
      : "Expense submitted for approval." + (!photo ? " (No bill photo — it will be flagged at HO.)" : ""));
    setF({ category: "local_material", amount: "", paid_to: "", pay_mode: "cash", worker_id: "", note: "" });
    setPhoto(null); setMode("none"); load();
  }

  async function saveSalary() {
    setErr(""); setMsg("");
    if (!sf.amount) { setErr("Enter the advance amount."); return; }
    setBusy(true);
    const res = await submitSalaryAdvance({ user_id: userId, site_id: siteId, amount: Number(sf.amount), reason: sf.reason });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Salary advance request sent for approval. On approval it links to your salary and deducts automatically.");
    setSf({ amount: "", reason: "" }); setMode("none"); load();
  }

  const statusBadge = s =>
    s === "approved" ? <span className="badge p">Approved</span> :
    s === "queried" ? <span className="badge h">Queried</span> :
    s === "rejected" ? <span className="badge a">Rejected</span> :
    <span className="badge gray">Pending</span>;

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div>
          <div className="title">Money</div>
          <div className="sub">Site expenses · advances · my balance</div>
        </div>
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — sample balances.</div>}

        {bal && (
          <div className="stat-row">
            <div className="stat-box"><div className="k">Imprest in hand</div><div className="v">{inr(bal.imprestInHand)}</div></div>
            <div className="stat-box"><div className="k">Pending review</div><div className="v">{inr(bal.pendingEntries)}</div></div>
            <div className="stat-box"><div className="k">My salary adv.</div><div className="v" style={{ color: bal.salaryAdvOutstanding ? "var(--amber)" : "inherit" }}>{inr(bal.salaryAdvOutstanding)}</div></div>
          </div>
        )}

        {mode === "none" && (
          <div style={{ display: "grid", gap: 10, margin: "14px 0" }}>
            <button className="primary btn-block" onClick={() => { setMode("expense"); setMsg(""); }}>
              🧾 Request / enter site expense
            </button>
            <button className="btn-block" onClick={() => { setMode("salary"); setMsg(""); }}>
              💰 Request salary advance (my salary)
            </button>
          </div>
        )}

        {mode === "expense" && (
          <div style={{ background: "var(--bg)", borderRadius: 12, padding: 12, margin: "12px 0" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Site expense entry</h3>
            <div className="m-field"><label>Category</label>
              <select value={f.category} onChange={e => set("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
              </select></div>
            {f.category === "labour_advance" && (
              <div className="m-field"><label>Worker (advance will deduct from his wages)</label>
                <select value={f.worker_id} onChange={e => set("worker_id", e.target.value)}>
                  <option value="">Select worker…</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select></div>
            )}
            <div className="m-grid2">
              <div className="m-field"><label>Amount ₹ *</label>
                <input inputMode="numeric" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0" /></div>
              <div className="m-field"><label>Payment mode</label>
                <select value={f.pay_mode} onChange={e => set("pay_mode", e.target.value)}>
                  <option value="cash">Cash</option><option value="upi">UPI</option>
                </select></div>
            </div>
            <div className="m-field"><label>Paid to *</label>
              <input value={f.paid_to} onChange={e => set("paid_to", e.target.value)} placeholder="Shop / person name" /></div>
            <div className="m-field"><label>Note (optional)</label>
              <input value={f.note} onChange={e => set("note", e.target.value)} placeholder="What was it for" /></div>
            <button style={{ fontSize: 12.5 }} onClick={() => fileRef.current?.click()}>
              📷 {photo ? "Bill photo attached ✓" : "Attach bill photo"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
                   style={{ display: "none" }} onChange={e => setPhoto(e.target.files?.[0] || null)} />
            {f.category === "labour_advance" && (
              <div className="note amber" style={{ marginTop: 8 }}>
                Labour advances require Director / Accountant verification before they count.
              </div>
            )}
            {err && <div className="note red">{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="primary" style={{ flex: 1 }} onClick={saveExpense} disabled={busy}>
                {busy ? "Saving…" : "Submit"}
              </button>
              <button onClick={() => setMode("none")}>Cancel</button>
            </div>
          </div>
        )}

        {mode === "salary" && (
          <div style={{ background: "var(--bg)", borderRadius: 12, padding: 12, margin: "12px 0" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Salary advance request</h3>
            <div className="m-field"><label>Amount ₹ *</label>
              <input inputMode="numeric" value={sf.amount} onChange={e => setSf(p => ({ ...p, amount: e.target.value }))} placeholder="0" /></div>
            <div className="m-field"><label>Reason</label>
              <input value={sf.reason} onChange={e => setSf(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Medical / rent" /></div>
            <div className="note amber">This links to YOUR salary and will be deducted from it after approval.</div>
            {err && <div className="note red">{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="primary" style={{ flex: 1 }} onClick={saveSalary} disabled={busy}>
                {busy ? "Sending…" : "Send request"}
              </button>
              <button onClick={() => setMode("none")}>Cancel</button>
            </div>
          </div>
        )}

        {msg && <div className="note green">{msg}</div>}

        <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>My recent entries</h3>
        {recent.map(r => (
          <div className="m-row" key={r.id}>
            <div className="info">
              <div className="nm">{inr(r.amount)} — {r.paid_to}</div>
              <div className="dt">{catLabel(r.category)} · {r.date}</div>
              {r.query && <div className="flag">❓ HO query: {r.query}</div>}
            </div>
            {statusBadge(r.status)}
          </div>
        ))}
      </div>
      <MobileNav />
    </div>
  );
}
