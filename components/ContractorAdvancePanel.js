"use client";
// update365: CONTRACTOR ADVANCE LEDGER — a dedicated view, separate from individual worker
// advances, because the money is owed to a different party. Per contractor: what has been
// advanced, what has been recovered, what is still outstanding, and — with a month selected
// — what is actually payable after netting against their workers' wages.
import { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth";
import { getSites, inr } from "@/lib/data";
import {
  getContractors, raiseContractorAdvance, reviewContractorAdvance,
  listContractorAdvances, getContractorNetting, setContractorAdvanceRecipient, getContractorWorkers, getContractorWorkerBalances } from "@/lib/contractorAdvance";   // update436
import { todayLocal } from "@/lib/today";

const NAVY = "#1f2a4b";
const d = v => v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—";
const thisMonth = () => todayLocal().slice(0, 7);

function Badge({ s }) {
  const m = { pending: ["warn", "Pending"], approved: ["p", "Approved"], paid: ["p", "Paid"], rejected: ["gray", "Rejected"] }[s] || ["gray", s];
  return <span className={"badge " + m[0]}>{m[1]}</span>;
}

export default function ContractorAdvancePanel() {
  const sess = typeof window !== "undefined" ? getSession() : null;
  const isDirector = sess?.role === "director";

  const [month, setMonth] = useState(thisMonth());
  const [contractors, setContractors] = useState([]);
  const [sites, setSites] = useState([]);
  const [rows, setRows] = useState(null);
  const [net, setNet] = useState(null);
  const [open, setOpen] = useState(null);      // contractor drilled into
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  async function load() {
    setErr("");
    try {
      const [c, r, n] = await Promise.all([getContractors(), listContractorAdvances(), getContractorNetting(month)]);
      setContractors(c); setRows(r); setNet(n);
    } catch (e) { setErr(e.message); setRows([]); setNet([]); }
  }
  useEffect(() => { getSites().then(setSites).catch(() => {}); }, []);
  useEffect(() => { load(); }, [month]);   // eslint-disable-line

  const byContractor = useMemo(() => {
    const m = {};
    (rows || []).forEach(r => { (m[r.contractor_id] = m[r.contractor_id] || []).push(r); });
    return m;
  }, [rows]);

  const totals = useMemo(() => (net || []).reduce((a, x) => ({
    wages: a.wages + x.wages, outstanding: a.outstanding + x.outstanding,
    netPayable: a.netPayable + x.netPayable, carry: a.carry + x.carryForward,
  }), { wages: 0, outstanding: 0, netPayable: 0, carry: 0 }), [net]);

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    const r = await raiseContractorAdvance(form);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`${r.req_no} raised for ${contractors.find(c => String(c.id) === String(form.contractorId))?.name || "the contractor"} — pending approval.`);
    setForm(null); load();
  }

  const [payTo, setPayTo] = useState(null);   // update436: { row, mode: "contractor"|"worker", workerId, workers, amount }
  const [balances, setBalances] = useState(null);
  async function openApprove(row) { const workers = await getContractorWorkers(row.contractor_id); setPayTo({ row, mode: "contractor", workerId: row.for_worker_id || (workers[0]?.id ?? ""), workers, amount: String(row.amount) }); }
  async function confirmApprove() {
    const { row, mode, workerId, amount } = payTo;
    const rec = await setContractorAdvanceRecipient(row.id, mode, mode === "worker" ? workerId : null);
    if (!rec.ok) { setErr(rec.error); return; }
    if (!window.confirm(`Paying ${inr(Number(amount || row.amount))} to: ${rec.recipient}\n\n${row.req_no} · requested for ${row.for_worker_name || row.for_workers || row.contractor_name}${row.requested_by_worker_id ? " (raised by the worker himself)" : ""}\n\nConfirm approval?`)) return;
    const r = await reviewContractorAdvance(row.id, "approved", amount, null);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`${row.req_no} approved — ${inr(Number(amount || row.amount))} to ${rec.recipient}.`); setPayTo(null); load();
  }
  async function review(row, action) {
    let amt = null, note = null;
    if (action === "approved") { openApprove(row); return; }
    if (action === "rejected") {
      note = prompt(`Reject ${row.req_no}? Reason:`);
      if (!note || !note.trim()) return;
    }
    const r = await reviewContractorAdvance(row.id, action, amt, note);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`${row.req_no} ${action}.`); load();
  }

  const pending = (rows || []).filter(r => r.status === "pending");

  return (
    <>
      {payTo && (   /* update436: explicit Pay-to before approval */
        <div onClick={() => setPayTo(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ width: "min(94vw, 520px)", padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Approve {payTo.row.req_no} · {payTo.row.contractor_name}</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Requested {inr(payTo.row.amount)}{payTo.row.for_worker_name ? ` for ${payTo.row.for_worker_name}` : ""}{payTo.row.requested_by_worker_id ? " · raised by the worker himself" : ""}{payTo.row.reason ? ` · ${payTo.row.reason}` : ""}</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Pay to *</div>
            <label style={{ display: "block", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 6, cursor: "pointer", background: payTo.mode === "contractor" ? "#FFF7ED" : "transparent" }}>
              <input type="radio" name="payto" checked={payTo.mode === "contractor"} onChange={() => setPayTo(p => ({ ...p, mode: "contractor" }))} /> <b>Contractor account</b> — {payTo.row.contractor_name} distributes to their workers (default)</label>
            <label style={{ display: "block", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 6, cursor: "pointer", background: payTo.mode === "worker" ? "#EFF6FF" : "transparent" }}>
              <input type="radio" name="payto" checked={payTo.mode === "worker"} onChange={() => setPayTo(p => ({ ...p, mode: "worker" }))} /> <b>Directly to the worker&apos;s own account</b> — bypasses the contractor
              {payTo.mode === "worker" && (
                <select value={payTo.workerId} onChange={e => setPayTo(p => ({ ...p, workerId: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 6 }}>
                  {payTo.workers.length === 0 && <option value="">No active workers under this contractor</option>}
                  {payTo.workers.map(w => <option key={w.id} value={w.id}>{w.name} · {w.site}{w.bank ? "" : " · ⚠ bank details missing"}</option>)}
                </select>)}
            </label>
            <label style={{ display: "block", fontSize: 12.5, marginTop: 8 }}>Approve amount ₹<input type="number" value={payTo.amount} onChange={e => setPayTo(p => ({ ...p, amount: e.target.value }))} style={{ display: "block", width: 160, marginTop: 4 }} /></label>
            <div style={{ marginTop: 10, padding: "8px 10px", background: "#F3F4F6", borderRadius: 8, fontSize: 13 }}>
              Paying <b>{inr(Number(payTo.amount || payTo.row.amount))}</b> to: <b>{payTo.mode === "worker" ? `${payTo.workers.find(w => String(w.id) === String(payTo.workerId))?.name || "—"} — own account (under ${payTo.row.contractor_name})` : `${payTo.row.contractor_name} account`}</b>
              {payTo.row.for_worker_name ? <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Either way this reduces <b>{payTo.row.for_worker_name}</b>&apos;s dues under {payTo.row.contractor_name} and the contractor&apos;s running balance.</div> : null}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setPayTo(null)}>Cancel</button>
              <button className="primary" disabled={payTo.mode === "worker" && !payTo.workerId} onClick={confirmApprove}>Approve &amp; record recipient</button>
            </div>
          </div>
        </div>)}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div className="muted" style={{ fontSize: 12.5, maxWidth: 640 }}>
          Advances paid to a <b>contractor</b>, who passes them to their workers. Recovered from the contractor&apos;s next payment — never from a worker&apos;s wage. A contractor&apos;s worker cannot raise an advance here; the database refuses it.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="month" value={month} max={thisMonth()} onChange={e => setMonth(e.target.value)} style={{ fontSize: 12 }} />
          <button className="primary" onClick={() => { setForm({ contractorId: "", amount: "", reason: "", forWorkers: "", siteId: "" }); setErr(""); setMsg(""); }}>
            ＋ Raise advance for a contractor
          </button>
        </div>
      </div>

      {err && <div className="error" style={{ marginBottom: 10, whiteSpace: "pre-wrap" }}>{err}</div>}
      {msg && <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", padding: "8px 12px", borderRadius: 6, marginBottom: 10, fontSize: 12.5 }}>{msg}</div>}
      {pending.length > 0 && (
        <div className="note amber" style={{ marginBottom: 10, fontSize: 12.5 }}>
          <b>{pending.length} advance request(s) awaiting approval.</b>
        </div>
      )}

      {/* ---- the netting: what is actually payable this month ---- */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <b style={{ fontSize: 13 }}>Net payable to contractors — {month}</b>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2, marginBottom: 8 }}>
          Wages are their workers&apos; <b>generated</b> labour payroll for the month — never recomputed here, so this and the wages sheet cannot disagree. Net payable = wages − outstanding advances, floored at zero; anything still owed beyond the month&apos;s wages carries forward.
        </div>
        {net === null ? <div className="muted">Loading…</div> : !net.length ? (
          <div className="muted">No contractor labour payroll generated for {month}, and no advances outstanding.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr>
                <th>Contractor</th><th className="num">Workers</th><th className="num">Days</th>
                <th className="num">Wages earned</th><th className="num">Advanced</th><th className="num">Recovered</th>
                <th className="num">Outstanding</th><th className="num">NET PAYABLE</th><th className="num">Carry fwd</th><th></th>
              </tr></thead>
              <tbody>
                {net.map(c => (
                  <tr key={c.contractor_id}>
                    <td style={{ fontWeight: 600 }}>{c.contractor_name}</td>
                    <td className="num">{c.workers || "—"}</td>
                    <td className="num">{c.days || "—"}</td>
                    <td className="num">{inr(c.wages)}</td>
                    <td className="num">{c.advanced ? inr(c.advanced) : "—"}</td>
                    <td className="num">{c.recovered ? inr(c.recovered) : "—"}</td>
                    <td className="num" style={{ color: c.outstanding > 0 ? "#b45309" : undefined }}>{c.outstanding ? inr(c.outstanding) : "—"}</td>
                    <td className="num" style={{ fontWeight: 800 }}>{inr(c.netPayable)}</td>
                    <td className="num" style={{ color: c.carryForward > 0 ? "var(--red)" : undefined }}>{c.carryForward ? inr(c.carryForward) : "—"}</td>
                    <td><button style={{ fontSize: 11.5 }} onClick={() => setOpen(c)}>📒 Ledger</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}>
                <td colSpan={3}>TOTAL · {net.length} contractor(s)</td>
                <td className="num">{inr(totals.wages)}</td><td colSpan={2}></td>
                <td className="num">{inr(totals.outstanding)}</td>
                <td className="num">{inr(totals.netPayable)}</td>
                <td className="num">{totals.carry ? inr(totals.carry) : "—"}</td><td></td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ---- every advance, newest first ---- */}
      <div className="panel">
        <b style={{ fontSize: 13 }}>All contractor advances</b>
        {rows === null ? <div className="muted" style={{ marginTop: 8 }}>Loading…</div> : !rows.length ? (
          <div className="muted" style={{ marginTop: 8 }}>No contractor advances yet.</div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table>
              <thead><tr>
                <th>Req No.</th><th>Raised</th><th>Contractor</th><th>Site</th><th>For worker</th>
                <th className="num">Requested</th><th className="num">Approved</th><th>Status</th><th>Paid to</th>
                <th>Raised by</th><th>Reviewed by</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.req_no}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{d(r.raised_at)}</td>
                    <td style={{ fontWeight: 600 }}>{r.contractor_name}</td>
                    <td style={{ fontSize: 12 }}>{r.site}</td>
                    <td style={{ fontSize: 11.5, maxWidth: 220 }}>{r.for_worker_name ? <b>{r.for_worker_name}</b> : (r.for_workers || <span className="muted">contractor pool</span>)}{r.reason ? <div className="muted" style={{ fontSize: 11 }}>{r.reason}</div> : null}{r.kind && r.kind !== "advance" ? <span className="badge gray" style={{ marginLeft: 4, fontSize: 10 }}>{r.kind}</span> : null}</td>
                    <td className="num">{inr(r.amount)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{r.approved_amount != null ? inr(r.approved_amount) : "—"}</td>
                    <td><Badge s={r.status} /></td>
                    <td style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{r.recipient_name ? <span style={{ background: r.pay_to === "worker" ? "#DBEAFE" : "#F3F4F6", color: r.pay_to === "worker" ? "#1D4ED8" : "#374151", padding: "2px 8px", borderRadius: 999 }} title={r.recipient_name}>{r.pay_to === "worker" ? "👤 Worker direct" : "🏢 Contractor"}</span> : <span className="muted">— not chosen</span>}</td>
                    <td style={{ fontSize: 11.5 }}>{r.raised_by_name || "—"}</td>
                    <td style={{ fontSize: 11.5 }}>{r.reviewed_by_name || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {isDirector && r.status === "pending" && (<>
                        <button style={{ fontSize: 11.5, color: "var(--green)" }} onClick={() => review(r, "approved")}>✓</button>{" "}
                        <button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => review(r, "rejected")}>✕</button>{" "}
                      </>)}
                      {isDirector && r.status === "approved" && (
                        <button style={{ fontSize: 11.5 }} onClick={() => review(r, "paid")}>₹ Mark paid</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- one contractor, full history ---- */}
      {open && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 860, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: 2 }}>{open.contractor_name}</h2>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Advance history · {month}</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {[["Wages earned", inr(open.wages)], ["Advanced", inr(open.advanced)], ["Recovered", inr(open.recovered)],
                ["Outstanding", inr(open.outstanding)], ["Net payable", inr(open.netPayable)]].map(([l, v]) => (
                <div key={l} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", minWidth: 110 }}>
                  <div className="muted" style={{ fontSize: 10 }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{v}</div>
                </div>
              ))}
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {["Req No.", "Date", "For", "Requested", "Approved", "Status", "Raised by", "Approved by", "Paid on"].map(h =>
                  <th key={h} style={{ fontSize: 10.5, textAlign: "left", padding: "6px 8px", background: "#f3f4f6" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {(byContractor[open.contractor_id] || []).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, padding: "5px 8px", fontWeight: 600 }}>{r.req_no}</td>
                    <td style={{ fontSize: 12, padding: "5px 8px" }}>{d(r.raised_at)}</td>
                    <td style={{ fontSize: 11.5, padding: "5px 8px" }}>{r.for_workers || r.reason || "—"}</td>
                    <td style={{ fontSize: 12, padding: "5px 8px", textAlign: "right" }}>{inr(r.amount)}</td>
                    <td style={{ fontSize: 12, padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{r.approved_amount != null ? inr(r.approved_amount) : "—"}</td>
                    <td style={{ padding: "5px 8px" }}><Badge s={r.status} /></td>
                    <td style={{ fontSize: 11.5, padding: "5px 8px" }}>{r.raised_by_name || "—"}</td>
                    <td style={{ fontSize: 11.5, padding: "5px 8px" }}>{r.reviewed_by_name || "—"}</td>
                    <td style={{ fontSize: 11.5, padding: "5px 8px" }}>{d(r.paid_on)}</td>
                  </tr>
                ))}
                {!(byContractor[open.contractor_id] || []).length && (
                  <tr><td colSpan={9} className="muted" style={{ padding: 10, fontSize: 12.5 }}>No advances raised for this contractor.</td></tr>
                )}
              </tbody>
            </table>

            <div style={{ marginTop: 14, textAlign: "right" }}><button onClick={() => setOpen(null)}>Close</button></div>
          </div>
        </div>
      )}

      {/* ---- raise one ---- */}
      {form && (
        <div onClick={() => setForm(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 520, padding: 22 }}>
            <h2 style={{ marginBottom: 2 }}>Raise a contractor advance</h2>
            <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
              Raised by <b>{sess?.full_name || sess?.name || "you"}</b> on the contractor&apos;s behalf — they have no login. It goes to the Director for approval like any other advance.
            </div>
            {[["Contractor *", <select key="c" style={{ width: "100%" }} value={form.contractorId} onChange={e => setForm(x => ({ ...x, contractorId: e.target.value }))}>
                <option value="">— select contractor —</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}{c.bank_account_no ? "" : "  (no bank details on file)"}</option>)}
              </select>],
              ["Amount ₹ *", <input key="a" inputMode="decimal" style={{ width: "100%" }} value={form.amount} onChange={e => setForm(x => ({ ...x, amount: e.target.value.replace(/[^0-9.]/g, "") }))} />],
              ["Site", <select key="s" style={{ width: "100%" }} value={form.siteId} onChange={e => setForm(x => ({ ...x, siteId: e.target.value }))}>
                <option value="">— any / not site specific —</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>],
              ["Which workers is it for?", <input key="w" style={{ width: "100%" }} placeholder="e.g. Ramu, Suresh — 2 men" value={form.forWorkers} onChange={e => setForm(x => ({ ...x, forWorkers: e.target.value }))} />],
              ["Reason", <input key="r" style={{ width: "100%" }} value={form.reason} onChange={e => setForm(x => ({ ...x, reason: e.target.value }))} />],
            ].map(([label, el]) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, marginBottom: 3, color: NAVY }}>{label}</label>
                {el}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setForm(null)} disabled={busy}>Cancel</button>
              <button className="primary" onClick={save} disabled={busy || !form.contractorId || !(Number(form.amount) > 0)}>
                {busy ? "Saving…" : "Raise request"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><div style={{ fontWeight: 700 }}>Worker-wise balance under contractors</div><button style={{ fontSize: 11.5 }} onClick={async () => setBalances(await getContractorWorkerBalances())}>{balances ? "↻ Refresh" : "Load"}</button></div>
        <div className="muted" style={{ fontSize: 12 }}>Each worker&apos;s advances (whether paid to the contractor or directly to the worker) minus what has been recovered from the contractor&apos;s payments.</div>
        {balances && (balances.length === 0 ? <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>No worker-tagged advances yet.</div> : (
          <div className="dt-scroll" style={{ marginTop: 8 }}><table className="tbl" style={{ fontSize: 12.5 }}>
            <thead><tr><th>Contractor</th><th>Worker</th><th className="num">Advanced</th><th className="num">via contractor</th><th className="num">direct</th><th className="num">Recovered</th><th className="num">Outstanding</th></tr></thead>
            <tbody>{balances.filter(b => Number(b.advanced) > 0).map(b => <tr key={b.worker_id}><td>{b.contractor_name}</td><td style={{ fontWeight: 600 }}>{b.worker_name}</td><td className="num">{inr(b.advanced)}</td><td className="num">{inr(b.paid_via_contractor)}</td><td className="num">{inr(b.paid_direct)}</td><td className="num">{inr(b.recovered)}</td><td className="num" style={{ fontWeight: 700 }}>{inr(b.outstanding)}</td></tr>)}</tbody>
          </table></div>))}
      </div>
    </>
  );
}
