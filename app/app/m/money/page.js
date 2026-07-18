"use client";
import { useEffect, useRef, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import {
  EXPENSE_CATEGORIES, inr, getBeneficiaries, raiseAdvanceSalary,
  claimExpense, getMyRecentMoney, getPettyBalance, respondAdvance, respondExpense,
} from "@/lib/money";

export default function MoneyScreen() {
  if (typeof window !== "undefined" && !getSession()) { window.location.replace("/m"); return null; }
  const [mode, setMode] = useState("none");     // none | advance | expense
  const [petty, setPetty] = useState(0);
  const [recent, setRecent] = useState([]);
  const [bens, setBens] = useState([]);
  // advance form
  const [a, setA] = useState({ beneficiary: "", amount: "", reason: "" });
  // expense form
  const [e, setE] = useState({ category: "local_material", amount: "", paid_to: "", funding_source: "own_pocket", note: "" });
  const [photo, setPhoto] = useState(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const replyFileRef = useRef(null);
  const [reply, setReply] = useState(null);     // the queried item being answered
  const [replyText, setReplyText] = useState("");
  const [replyAmount, setReplyAmount] = useState("");
  const [replyPhoto, setReplyPhoto] = useState(null);
  const sess = typeof window !== "undefined" ? getSession() : null;
  const userId = sess?.id || 1;
  const siteId = sess?.siteIds?.[0] || 1;

  const load = () => { getPettyBalance(userId).then(setPetty); getMyRecentMoney(userId).then(setRecent); };
  useEffect(() => { load(); getBeneficiaries(userId, [siteId]).then(setBens); }, []);

  async function submitAdvance() {
    setErr(""); setMsg("");
    if (!a.beneficiary || !a.amount) { setErr("Select a person and enter the amount."); return; }
    const b = bens.find(x => `${x.kind}:${x.id}` === a.beneficiary);
    setBusy(true);
    const res = await raiseAdvanceSalary({
      site_id: siteId, beneficiary_id: b.id, beneficiary_kind: b.kind,
      beneficiary_name: b.name, amount: Number(a.amount), reason: a.reason,
      bank_on_file: b.bank, raised_by: userId,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(`Advance salary request sent for ${b.name}. Needs Director/Accountant approval; on approval it is paid to their bank account.${!b.bank ? " ⚠ Bank details not on file — please add them." : ""}`);
    setA({ beneficiary: "", amount: "", reason: "" }); setMode("none"); load();
  }

  async function submitExpense() {
    setErr(""); setMsg("");
    if (!e.amount || !e.paid_to) { setErr("Amount and paid-to are required."); return; }
    if (e.funding_source === "own_pocket" && !photo) { setErr("Please attach a bill photo as proof for reimbursement."); return; }
    setBusy(true);
    const res = await claimExpense({
      site_id: siteId, user_id: userId, category: e.category, amount: Number(e.amount),
      paid_to: e.paid_to, funding_source: e.funding_source, note: e.note,
      photoFile: photo, bank_on_file: true,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(e.funding_source === "own_pocket"
      ? "Expense claim submitted with proof. On approval it is reimbursed to your bank account."
      : "Expense recorded against petty cash. On approval it is deducted from your held balance.");
    setE({ category: "local_material", amount: "", paid_to: "", funding_source: "own_pocket", note: "" });
    setPhoto(null); setMode("none"); load();
  }

  async function submitReply() {
    setErr(""); setMsg("");
    setBusy(true);
    const res = reply.type === "Advance"
      ? await respondAdvance(reply.id, replyText, replyAmount)
      : await respondExpense(reply.id, replyText, replyAmount, replyPhoto);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Reply sent — request is back with the approver as Pending.");
    setReply(null); setReplyText(""); setReplyAmount(""); setReplyPhoto(null); load();
  }

  const statusBadge = s =>
    s === "approved" ? <span className="badge p">Approved</span> :
    s === "queried" ? <span className="badge h">Queried</span> :
    s === "rejected" ? <span className="badge a">Rejected</span> :
    <span className="badge gray">Pending</span>;

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div><div className="title">Money / Expense</div><div className="sub">Advances &amp; site expenses</div></div>
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — sample data, resets on refresh.</div>}

        <div className="stat-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="stat-box"><div className="k">Petty cash held by me</div><div className="v">{inr(petty)}</div></div>
        </div>

        {mode === "none" && (
          <div style={{ display: "grid", gap: 10, margin: "14px 0" }}>
            <button className="primary btn-block" onClick={() => { setMode("advance"); setMsg(""); setErr(""); }}>
              💰 Request for Advance Salary
            </button>
            <div className="sub" style={{ marginTop: -4, marginBottom: 6 }}>For yourself or any worker/employee at your site. Paid to bank after approval.</div>
            <button className="btn-block" onClick={() => { setMode("expense"); setMsg(""); setErr(""); }}>
              🧾 Claim Site Expense
            </button>
            <div className="sub" style={{ marginTop: -4 }}>Money you spent on site (attach proof). Reimbursed to bank, or deducted from petty cash.</div>
          </div>
        )}

        {mode === "advance" && (
          <div style={{ background: "var(--bg)", borderRadius: 12, padding: 12, margin: "12px 0" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Advance salary request</h3>
            <div className="m-field"><label>For whom *</label>
              <select value={a.beneficiary} onChange={ev => setA(p => ({ ...p, beneficiary: ev.target.value }))}>
                <option value="">Select person…</option>
                {bens.map(b => <option key={`${b.kind}:${b.id}`} value={`${b.kind}:${b.id}`}>
                  {b.name} {b.kind === "labour" ? "· Labour" : "· Staff"}{!b.bank ? " · ⚠ no bank" : ""}
                </option>)}
              </select></div>
            <div className="m-field"><label>Amount ₹ *</label>
              <input inputMode="numeric" value={a.amount} onChange={ev => setA(p => ({ ...p, amount: ev.target.value }))} placeholder="0" /></div>
            <div className="m-field"><label>Reason</label>
              <input value={a.reason} onChange={ev => setA(p => ({ ...p, reason: ev.target.value }))} placeholder="e.g. medical / festival advance" /></div>
            <div className="note amber">Once approved by Director/Accountant, payment is made to the person's bank account. A missing-bank flag does not stop the request.</div>
            {err && <div className="note red">{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="primary" style={{ flex: 1 }} disabled={busy} onClick={submitAdvance}>{busy ? "Sending…" : "Send request"}</button>
              <button onClick={() => setMode("none")}>Cancel</button>
            </div>
          </div>
        )}

        {mode === "expense" && (
          <div style={{ background: "var(--bg)", borderRadius: 12, padding: 12, margin: "12px 0" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Claim site expense</h3>
            <div className="m-field"><label>Paid from *</label>
              <select value={e.funding_source} onChange={ev => setE(p => ({ ...p, funding_source: ev.target.value }))}>
                <option value="own_pocket">My own pocket (reimburse me to bank)</option>
                <option value="petty_cash">Petty cash I hold (deduct from balance)</option>
              </select></div>
            <div className="m-field"><label>Category</label>
              <select value={e.category} onChange={ev => setE(p => ({ ...p, category: ev.target.value }))}>
                {EXPENSE_CATEGORIES.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
              </select></div>
            <div className="m-field"><label>Amount ₹ *</label>
              <input inputMode="numeric" value={e.amount} onChange={ev => setE(p => ({ ...p, amount: ev.target.value }))} placeholder="0" /></div>
            <div className="m-field"><label>Paid to *</label>
              <input value={e.paid_to} onChange={ev => setE(p => ({ ...p, paid_to: ev.target.value }))} placeholder="Shop / person" /></div>
            <div className="m-field"><label>Note</label>
              <input value={e.note} onChange={ev => setE(p => ({ ...p, note: ev.target.value }))} placeholder="What was it for" /></div>
            <button style={{ fontSize: 12.5 }} onClick={() => fileRef.current?.click()}>📷 {photo ? "Proof attached ✓" : "Attach bill photo (proof)"}</button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={ev => setPhoto(ev.target.files?.[0] || null)} />
            {err && <div className="note red">{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="primary" style={{ flex: 1 }} disabled={busy} onClick={submitExpense}>{busy ? "Saving…" : "Submit claim"}</button>
              <button onClick={() => setMode("none")}>Cancel</button>
            </div>
          </div>
        )}

        {msg && <div className="note green">{msg}</div>}

        <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>My recent requests</h3>
        {recent.length === 0 ? <div className="muted">Nothing yet.</div> : recent.map((r, i) => (
          <div className="m-row" key={i} onClick={() => { if (r.status === "queried") { setReply(r); setReplyAmount(String(r.amount)); setReplyText(""); setMsg(""); setErr(""); } }} style={{ cursor: r.status === "queried" ? "pointer" : "default" }}>
            <div className="info">
              <div className="nm">{inr(r.amount)} — {r.name}</div>
              <div className="dt">{r.type} · {r.date}</div>
              {r.status === "queried" && r.query && <div className="flag">❓ Query: {r.query} — tap to reply</div>}
            </div>
            {statusBadge(r.status)}
          </div>
        ))}

        {reply && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "flex-end" }} onClick={() => setReply(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: "min(430px,100%)", margin: "0 auto", background: "#fff", borderRadius: "14px 14px 0 0", padding: 16 }}>
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>Reply to query</h3>
              <div className="note amber">❓ {reply.query || "The approver raised a query on this."}</div>
              <div className="m-field"><label>Your reply *</label>
                <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Explain / clarify" /></div>
              <div className="m-field"><label>Corrected amount ₹ (if needed)</label>
                <input inputMode="numeric" value={replyAmount} onChange={e => setReplyAmount(e.target.value)} /></div>
              {reply.type === "Expense" && (
                <>
                  <button style={{ fontSize: 12.5 }} onClick={() => replyFileRef.current?.click()}>📷 {replyPhoto ? "New proof attached ✓" : "Attach fresh proof (optional)"}</button>
                  <input ref={replyFileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => setReplyPhoto(e.target.files?.[0] || null)} />
                </>
              )}
              {err && <div className="note red">{err}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="primary" style={{ flex: 1 }} disabled={busy} onClick={submitReply}>{busy ? "Sending…" : "Send reply & resubmit"}</button>
                <button onClick={() => setReply(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
