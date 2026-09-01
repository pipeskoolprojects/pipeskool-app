"use client";
import { useEffect, useRef, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { billUrl } from "@/lib/bills";
import {
  EXPENSE_CATEGORIES, inr, getBeneficiaries, raiseAdvanceSalary,
  claimExpense, selfEditExpense, getMyRecentMoney, getPettyBalance, respondAdvance, respondExpense, requestPettyCash,
  getPettyOverview, getPettyLedger, requestPettyReturn, addExpenseBills, removeExpenseBill, getPersonMoneyProfile } from "@/lib/money";

// update273: MODULE scope — the person's money history (same loader as the desktop profile, update214)
function ProfileSheet({ staffId, name, onClose }) {
  const [pr, setPr] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { getPersonMoneyProfile(staffId).then(p => setPr(p || { empty: true })).catch(e => setErr(e.message)); }, [staffId]);
  const badge = s => s === "approved" ? "green" : s === "rejected" ? "red" : s === "queried" ? "amber" : "gray";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.6)", display: "flex", alignItems: "flex-end", zIndex: 70 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", padding: 18, maxHeight: "88vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0 }}>👤 {name || pr?.name || "History"} <span className="muted" style={{ fontSize: 12 }}>expenses &amp; advances</span></h3>
        {err && <div className="note red">{err}</div>}
        {!pr ? <div className="muted">Loading…</div> : pr.empty ? <div className="muted">No money history yet.</div> : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[["Claimed (approved, all time)", pr.totals.all], ["This month", pr.totals.month],
                ["Advances taken", pr.totals.taken], ["Recovered from salary", pr.totals.recovered],
                ["Advance outstanding", pr.totals.outstanding], ["Petty cash in hand", pr.totals.petty]].map(([l, v]) => (
                <div key={l} className="panel" style={{ padding: "8px 10px" }}>
                  <div className="muted" style={{ fontSize: 10.5 }}>{l}</div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{inr(v)}</div>
                </div>
              ))}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, margin: "6px 0" }}>All transactions ({pr.txns.length})</div>
            {pr.txns.map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{inr(t.amount)} — {t.type}</div>
                  <div className="muted" style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.what}{t.site ? " · " + t.site : ""} · {t.date}</div>
                </div>
                <span className={"badge " + badge(t.status)} style={{ alignSelf: "center", whiteSpace: "nowrap" }}>{t.status}</span>
              </div>
            ))}
          </>
        )}
        <button className="m-btn" style={{ marginTop: 10 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function MoneyScreen() {
  if (typeof window !== "undefined" && !getSession()) { window.location.replace("/m"); return null; }
  const [mode, setMode] = useState("none");     // none | advance | expense
  const [petty, setPetty] = useState(0);
  const [recent, setRecent] = useState([]);
  const [bens, setBens] = useState([]);
  const [pettyF, setPettyF] = useState(null);   // null = card closed
  const [pettyBusy, setPettyBusy] = useState(false);
  const [pettyErr, setPettyErr] = useState("");
  async function sendPetty() {
    setPettyErr("");
    if (!pettyF.amount || !pettyF.purpose) { setPettyErr("Amount and purpose are required."); return; }
    setPettyBusy(true);
    const res = await requestPettyCash({ site_id: Number(pettySite), user_id: userId, requester_name: sess?.name,
      amount: pettyF.amount, purpose: pettyF.purpose, required_date: pettyF.required_date || null, remarks: pettyF.remarks || null });
    setPettyBusy(false);
    if (!res.ok) { setPettyErr(res.error); return; }
    setPettyF(null); load();
  }
  // advance form
  const [a, setA] = useState({ beneficiary: "", amount: "", reason: "" });
  // expense form
  const [e, setE] = useState({ category: "local_material", amount: "", paid_to: "", funding_source: "own_pocket", note: "" });
  const [photo, setPhoto] = useState(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const replyFileRef = useRef(null);
  const editFileRef = useRef(null);                                  // update273
  const [editFiles, setEditFiles] = useState([]);                    // update273: new proof for the expense being edited
  const [profile, setProfile] = useState(null);                      // update273: { staffId, name } -> ProfileSheet
  const [reply, setReply] = useState(null);     // the queried item being answered
  const [editExp, setEditExp] = useState(null);   // update211: edit my pending expense
  const [editBusy, setEditBusy] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyAmount, setReplyAmount] = useState("");
  const [replyPhoto, setReplyPhoto] = useState(null);
  const sess = typeof window !== "undefined" ? getSession() : null;
  const userId = sess?.id || 1;
  const siteId = Number(sess?.currentSite || sess?.sites?.[0]?.id || 1);   // update146: was sess.siteIds (never existed) -> always site 1
  const mySites = sess?.sites || [];                                        // update160: assigned sites only
  const [claimSite, setClaimSite] = useState(siteId);
  const [pettySite, setPettySite] = useState(siteId);

  const load = () => { getPettyOverview(userId).then(setOv); getMyRecentMoney(userId).then(setRecent); };
  const [ov, setOv] = useState(null);
  const [ledger, setLedger] = useState(null);      // null = closed
  const [ret, setRet] = useState(null);            // { amount, note } when the return form is open
  const [retErr, setRetErr] = useState("");
  async function openLedger() { setLedger(await getPettyLedger(userId)); }
  async function sendReturn() {
    setRetErr("");
    if (!ret.amount || Number(ret.amount) <= 0) { setRetErr("Enter the amount you are returning."); return; }
    if (ov && Number(ret.amount) > Number(ov.balance)) { setRetErr("You only hold " + inr(ov.balance) + "."); return; }
    const res = await requestPettyReturn({ user_id: userId, name: sess?.name, site_id: Number(pettySite), amount: ret.amount, note: ret.note });
    if (!res.ok) { setRetErr(res.error); return; }
    setRet(null); setMsg("Return recorded — awaiting Director/Accountant confirmation. Balance reduces once confirmed.");
    load(); if (ledger) openLedger();
  }
  useEffect(() => { load(); getBeneficiaries(userId).then(setBens); }, []);

  async function submitAdvance() {
    setErr(""); setMsg("");
    if (!a.beneficiary || !a.amount) { setErr("Select a person and enter the amount."); return; }
    const b = bens.find(x => `${x.kind}:${x.id}` === a.beneficiary);
    setBusy(true);
    const res = await raiseAdvanceSalary({
      site_id: b.site_id || siteId, beneficiary_id: b.id, beneficiary_kind: b.kind,   // labour -> their site
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
      site_id: Number(claimSite), user_id: userId, category: e.category, amount: Number(e.amount),
      paid_to: e.paid_to, funding_source: e.funding_source, note: e.note,
      billFiles: photo || [], bank_on_file: true,
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
        <button type="button" onClick={() => setProfile({ staffId: userId, name: sess?.full_name || sess?.name || "My history" })}
          style={{ fontSize: 12, padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.14)", color: "#fff" }}>👤 My history</button>{/* update273 */}
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — sample data, resets on refresh.</div>}

        <div className="stat-row" style={{ gridTemplateColumns: "1fr" }}>
          <div className="panel" style={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 8, textAlign: "center" }}>
              <div style={{ flex: 1 }}><div className="muted" style={{ fontSize: 11 }}>ADVANCE</div><b>{inr(ov?.granted || 0)}</b></div>
              <div style={{ flex: 1 }}><div className="muted" style={{ fontSize: 11 }}>USED</div><b>{inr(ov?.spent || 0)}</b></div>
              <div style={{ flex: 1 }}><div className="muted" style={{ fontSize: 11 }}>BALANCE</div><b style={{ color: "var(--copper)" }}>{inr(ov?.balance || 0)}</b></div>
            </div>
            {(ov?.returned || 0) > 0 && <div className="muted" style={{ fontSize: 11.5, textAlign: "center", marginTop: 4 }}>returned so far {inr(ov.returned)}</div>}
            {(ov?.pendingSpend || 0) > 0 && <div className="muted" style={{ fontSize: 11.5, textAlign: "center" }}>{inr(ov.pendingSpend)} spend awaiting approval (not yet deducted)</div>}
            {(ov?.pendingReturns || 0) > 0 && <div className="muted" style={{ fontSize: 11.5, textAlign: "center" }}>{inr(ov.pendingReturns)} return awaiting confirmation</div>}
            {ov?.settled && <div style={{ textAlign: "center", marginTop: 6 }}><span className="badge p">✔ ADVANCE SETTLED</span></div>}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={{ flex: 1, fontSize: 12.5 }} onClick={() => ledger ? setLedger(null) : openLedger()}>{ledger ? "Hide ledger" : "📒 My petty ledger"}</button>
              {(ov?.balance || 0) > 0 && <button style={{ flex: 1, fontSize: 12.5 }} onClick={() => { setRet({ amount: "", note: "" }); setRetErr(""); }}>↩ Return cash</button>}
            </div>
          </div>
          {ret && (
            <div className="panel" style={{ padding: "10px 12px", marginTop: 8 }}>
              <label className="muted">Amount returning ₹ * (you hold {inr(ov?.balance || 0)})</label>
              <input inputMode="numeric" style={{ width: "100%", marginBottom: 6 }} value={ret.amount}
                     onChange={e => setRet(f => ({ ...f, amount: e.target.value }))} />
              <label className="muted">Note</label>
              <input style={{ width: "100%", marginBottom: 8 }} value={ret.note} placeholder="e.g. unused after SOUL work"
                     onChange={e => setRet(f => ({ ...f, note: e.target.value }))} />
              {retErr && <div className="note red" style={{ marginBottom: 6 }}>{retErr}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary" style={{ flex: 1 }} onClick={sendReturn}>Record return</button>
                <button style={{ flex: 1 }} onClick={() => setRet(null)}>Cancel</button>
              </div>
            </div>
          )}
          {ledger && (
            <div className="panel" style={{ padding: "8px 10px", marginTop: 8 }}>
              {ledger.length === 0 ? <div className="muted">No petty transactions yet.</div> : ledger.map((l, i) => (
                <div key={i} style={{ borderBottom: "1px solid var(--border)", padding: "7px 0", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <b>{l.kind}</b>
                    <b style={{ color: l.sign > 0 ? "var(--green)" : l.sign < 0 ? "var(--red)" : "var(--muted)" }}>
                      {l.sign > 0 ? "+" : l.sign < 0 ? "\u2212" : ""}{inr(l.amount)}</b>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {l.date} · {l.site}{l.category ? " · " + l.category : ""}{l.label ? " · " + l.label : ""}
                    {l.bills.map((b, j) => <a key={j} href={billUrl(b)} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>📎</a>)}
                  </div>
                </div>
              ))}
            </div>
          )}
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
                  {b.label}{!b.bank ? " · ⚠ no bank" : ""}
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
            <div className="m-field"><label>Site *</label>
              <select value={claimSite} onChange={e => setClaimSite(e.target.value)}>
                {mySites.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></div>
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
            <button style={{ fontSize: 12.5 }} onClick={() => fileRef.current?.click()}>📷 {photo?.length ? photo.length + " bill" + (photo.length > 1 ? "s" : "") + " attached ✓" : "Attach bill(s) — photo or PDF"}</button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={ev => setPhoto(ev.target.files?.length ? Array.from(ev.target.files) : null)} />
            {err && <div className="note red">{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="primary" style={{ flex: 1 }} disabled={busy} onClick={submitExpense}>{busy ? "Saving…" : "Submit claim"}</button>
              <button onClick={() => setMode("none")}>Cancel</button>
            </div>
          </div>
        )}

        {msg && <div className="note green">{msg}</div>}

        <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>{!pettyF ? (
        <button className="primary" style={{ width: "100%", marginBottom: 12 }} onClick={() => setPettyF({ amount: "", purpose: "", required_date: "", remarks: "" })}>
          ➕ Request petty cash (before spending)
        </button>
      ) : (
        <div className="panel" style={{ marginBottom: 12 }}>
          <h2>Advance petty cash request</h2>
          <label className="muted">Site *</label>
          <select style={{ width: "100%", marginBottom: 8 }} value={pettySite} onChange={e => setPettySite(e.target.value)}>
            {mySites.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <label className="muted">Amount ₹ *</label>
          <input inputMode="numeric" style={{ width: "100%", marginBottom: 8 }} value={pettyF.amount}
                 placeholder="₹ enter amount — e.g. 5000"
                 onChange={e => setPettyF(f => ({ ...f, amount: e.target.value }))} />
          <label className="muted">Purpose / reason *</label>
          <input style={{ width: "100%", marginBottom: 8 }} value={pettyF.purpose} placeholder="e.g. site consumables for Bay-5"
                 onChange={e => setPettyF(f => ({ ...f, purpose: e.target.value }))} />
          <label className="muted">Required by</label>
          <input type="date" style={{ width: "100%", marginBottom: 8 }} value={pettyF.required_date}
                 onChange={e => setPettyF(f => ({ ...f, required_date: e.target.value }))} />
          <label className="muted">Remarks (optional)</label>
          <input style={{ width: "100%", marginBottom: 8 }} value={pettyF.remarks}
                 onChange={e => setPettyF(f => ({ ...f, remarks: e.target.value }))} />
          {pettyErr && <div className="note red" style={{ marginBottom: 8 }}>{pettyErr}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary" disabled={pettyBusy} onClick={sendPetty} style={{ flex: 1 }}>{pettyBusy ? "Sending…" : "Send request"}</button>
            <button onClick={() => setPettyF(null)}>Cancel</button>
          </div>
        </div>
      )}
      My recent requests</h3>
        {recent.length === 0 ? <div className="muted">Nothing yet.</div> : recent.map((r, i) => (
          <div className="m-row" key={i} onClick={() => {
              if (r.status === "queried" && r.type !== "Expense") { setReply(r); setReplyAmount(String(r.amount)); setReplyText(""); setMsg(""); setErr(""); return; }
              if (r.type === "Expense" && (r.status === "pending" || r.status === "queried")) { setEditExp({ ...r }); setMsg(""); setErr(""); return; }
              if (r.status === "queried") { setReply(r); setReplyAmount(String(r.amount)); setReplyText(""); setMsg(""); setErr(""); }
            }} style={{ cursor: (r.status === "queried" || (r.type === "Expense" && r.status === "pending")) ? "pointer" : "default" }}>
            <div className="info">
              <div className="nm">{inr(r.amount)}{r.asked ? <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> (asked {inr(r.asked)})</span> : null} — {r.name}</div>
              <div className="dt">{r.type} · {r.date}</div>
              {r.status === "queried" && r.query && <div className="flag">❓ Query: {r.query} — tap to {r.type === "Expense" ? "edit / fix" : "reply"}</div>}
              {r.type === "Expense" && r.status === "pending" && <div className="muted" style={{ fontSize: 11 }}>✎ tap to edit (until approved)</div>}
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
                  <button style={{ fontSize: 12.5 }} onClick={() => replyFileRef.current?.click()}>📎 {replyPhoto ? replyPhoto.length + " proof file(s) attached ✓" : "Attach proof — photo(s) or PDF (optional)"}</button>
                  <input ref={replyFileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={e => setReplyPhoto(e.target.files?.length ? Array.from(e.target.files) : null)} />
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
      {editExp && (
        <div onClick={() => setEditExp(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.6)", display: "flex", alignItems: "flex-end", zIndex: 60 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", padding: 18, maxHeight: "85vh", overflowY: "auto" }}>
            <h3 style={{ marginTop: 0 }}>✎ Edit expense <span className="muted" style={{ fontSize: 12 }}>(until approved)</span></h3>
            {err && <div className="note red">{err}</div>}
            <label className="muted" style={{ fontSize: 12 }}>Amount ₹</label>
            <input inputMode="decimal" style={{ width: "100%", marginBottom: 8 }} value={editExp.amount} onChange={e2 => setEditExp(x => ({ ...x, amount: e2.target.value }))} />
            <label className="muted" style={{ fontSize: 12 }}>Category</label>
            <select style={{ width: "100%", marginBottom: 8 }} value={editExp.category} onChange={e2 => setEditExp(x => ({ ...x, category: e2.target.value }))}>
              {EXPENSE_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <label className="muted" style={{ fontSize: 12 }}>Paid to</label>
            <input style={{ width: "100%", marginBottom: 8 }} value={editExp.name || ""} onChange={e2 => setEditExp(x => ({ ...x, name: e2.target.value }))} />
            <label className="muted" style={{ fontSize: 12 }}>Purpose / note</label>
            <input style={{ width: "100%", marginBottom: 8 }} value={editExp.note || ""} onChange={e2 => setEditExp(x => ({ ...x, note: e2.target.value }))} />
            <div style={{ margin: "6px 0 2px" }}>
              {[["own_pocket", "👛 Own pocket"], ["petty_cash", "🪙 Petty cash"]].map(([v, l]) => (
                <label key={v} style={{ marginRight: 14, fontSize: 14 }}>
                  <input type="radio" checked={editExp.funding_source === v} onChange={() => setEditExp(x => ({ ...x, funding_source: v }))} /> {l}
                </label>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>Switching source is safe before approval — petty cash deducts only when approved.</div>

            {/* update273: proof — see what is attached, remove a wrong one, add a new/corrected one */}
            <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>📎 Bill / proof</div>
              {(editExp.bills || []).length === 0 && !editFiles.length && <div className="muted" style={{ fontSize: 12 }}>No proof attached — this is often why a claim gets queried.</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(editExp.bills || []).map((b, j) => (
                  <div key={j} style={{ position: "relative" }}>
                    <a href={billUrl(b)} target="_blank" rel="noreferrer">
                      {/\.pdf$/i.test(b) ? <div style={{ width: 64, height: 64, border: "1px solid var(--border)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📄</div>
                        : <img src={billUrl(b)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />}
                    </a>
                    <button type="button" title="Remove this proof" onClick={async () => {
                        if (!window.confirm("Remove this proof from the expense?")) return;
                        const r = await removeExpenseBill(editExp.id, b); if (!r.ok) { setErr(r.error); return; }
                        setEditExp(x => ({ ...x, bills: (x.bills || []).filter(y => y !== b) }));
                      }} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontSize: 11, lineHeight: "20px", padding: 0 }}>✕</button>
                  </div>
                ))}
                {editFiles.map((f, j) => (
                  <div key={"n" + j} style={{ width: 64, height: 64, border: "2px solid var(--green)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, textAlign: "center", padding: 4 }}>new<br />{f.type === "application/pdf" ? "PDF" : "photo"}</div>
                ))}
              </div>
              <button type="button" className="m-btn" style={{ marginTop: 8, fontSize: 12.5 }} onClick={() => editFileRef.current?.click()}>📷 {editFiles.length ? editFiles.length + " new file(s) ready — tap to change" : "Add / replace proof — camera, gallery or PDF"}</button>
              <input ref={editFileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }}
                onChange={e2 => { const fs = Array.from(e2.target.files || []); e2.target.value = ""; setEditFiles(fs); }} />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>New files are saved with "Save changes". <a onClick={() => setProfile({ staffId: userId, name: sess?.full_name || sess?.name || "My history" })} style={{ color: "var(--copper)", textDecoration: "underline", cursor: "pointer" }}>View my full history</a></div>
            </div>

            <button className="m-btn primary" disabled={editBusy} onClick={async () => {
              setEditBusy(true); setErr("");
              try {
                const res = await selfEditExpense(editExp.id, { amount: editExp.amount, note: editExp.note, category: editExp.category, funding_source: editExp.funding_source, expense_date: editExp.expense_date, paid_to: editExp.name });
                if (!res.ok) { setErr(res.error); return; }
                if (editFiles.length) {   // update273: attach the corrected proof as part of the same save
                  const up = await addExpenseBills(editExp.id, editFiles);
                  if (!up.ok) { setErr("Details saved, but proof upload failed: " + up.error); load(); return; }
                }
                setEditExp(null); setEditFiles([]); setMsg("Expense updated ✓" + (editFiles.length ? " — proof attached" : "")); load();
              } catch (e3) { setErr(e3.message || "Could not save."); }
              finally { setEditBusy(false); }
            }}>{editBusy ? "Saving…" : "Save changes"}</button>
            <button className="m-btn" style={{ marginTop: 6 }} onClick={() => { setEditExp(null); setEditFiles([]); }}>Cancel</button>
          </div>
        </div>
      )}
      {profile && <ProfileSheet staffId={profile.staffId} name={profile.name} onClose={() => setProfile(null)} />}{/* update273 */}

    </div>
  );
}
