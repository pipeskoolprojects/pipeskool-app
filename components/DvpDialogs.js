"use client";
// update458: Direct Vendor Payment dialogs — Bill viewer · Query · Edit / Resubmit · Timeline.
// Kept in one module so the panel (web) and any future mobile screen share the exact same behaviour.
import { useEffect, useState } from "react";
import { billUrl, isPdf } from "@/lib/bills";
import { inr } from "@/lib/data";
import { PAY_MODES, editVoucher, removeVoucherBill, addVoucherBills, getVoucherEvents, replyVoucher } from "@/lib/vendorVoucher";
import { todayLocal } from "@/lib/today";

const NAVY = "#1f2a4b";
const Modal = ({ onClose, title, children, width = 720, busy }) => (
  <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, padding: 12 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: width, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3><button type="button" onClick={onClose} disabled={busy}>✕</button>
      </div>
      <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>{children}</div>
    </div>
  </div>);

// ---------------------------------------------------------------- 1. BILL VIEWER (all attachments, inline, open / download)
export function BillViewer({ voucher, onClose }) {
  const bills = voucher?.bills || [];
  const [broken, setBroken] = useState({});
  const [toast, setToast] = useState("");
  useEffect(() => { if (!bills.length) setToast("This voucher has no bill files attached — the record points to nothing in storage."); }, [bills.length]);
  const fail = (i, why) => { setBroken(b => ({ ...b, [i]: true })); setToast(`Bill ${i + 1} could not be loaded — ${why}. The file may be missing from storage or the link is broken.`); };
  return (
    <Modal onClose={onClose} title={`📎 Bills — ${voucher.voucher_no || ""} · ${voucher.vendor} · ${inr(voucher.amount)}`} width={860}>
      {toast && <div className="error" style={{ marginBottom: 10 }}>{toast}</div>}
      {bills.map((b, i) => {
        const url = billUrl(b); const dl = billUrl(b, true);
        return (
          <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <b style={{ color: NAVY }}>Bill {i + 1} of {bills.length} <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>· {isPdf(b) ? "PDF" : "Image"} · {String(b).split("/").pop()}</span></b>
              <span style={{ display: "flex", gap: 6 }}>
                {url ? <a href={url} target="_blank" rel="noreferrer"><button type="button" style={{ fontSize: 12 }}>↗ Open in new tab</button></a> : null}
                {dl ? <a href={dl} download><button type="button" style={{ fontSize: 12 }}>⬇ Download</button></a> : null}
              </span>
            </div>
            {!url ? <div className="error">No file path stored for this bill.</div>
              : broken[i] ? <div className="note amber" style={{ fontSize: 12.5 }}>Preview unavailable — try “Open in new tab”. If that fails too, the file is missing and the bill should be re-attached.</div>
              : isPdf(b)
                ? <iframe title={"bill" + i} src={url + "#toolbar=0"} style={{ width: "100%", height: 520, border: "1px solid #e5e7eb", borderRadius: 6, background: "#f8fafc" }} onError={() => fail(i, "the PDF did not load")} />
                : <img src={url} alt={"Bill " + (i + 1)} style={{ maxWidth: "100%", maxHeight: 560, display: "block", margin: "0 auto", borderRadius: 6, border: "1px solid #e5e7eb" }} onError={() => fail(i, "the image did not load")} />}
          </div>);
      })}
    </Modal>);
}

// ---------------------------------------------------------------- 2. QUERY (approver → raiser), comment required
export function QueryDialog({ voucher, onClose, onSubmit, busy }) {
  const [note, setNote] = useState("");
  return (
    <Modal onClose={onClose} title={`❓ Query — ${voucher.voucher_no} · ${voucher.vendor} · ${inr(voucher.amount)}`} width={520} busy={busy}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Raised by <b>{voucher.raisedBy}</b>. They will be notified, can edit the voucher and resubmit. Until then it cannot be approved or paid.</div>
      <label className="muted" style={{ fontSize: 12 }}>What needs to be fixed or clarified? *</label>
      <textarea value={note} onChange={e => setNote(e.target.value)} autoFocus style={{ width: "100%", minHeight: 110, marginTop: 4 }} placeholder="e.g. Bill photo is unclear — attach the GST invoice. Amount on bill is ₹52,792, not ₹57,792." />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="primary" disabled={busy || !note.trim()} onClick={() => onSubmit(note.trim())}>{busy ? "Sending…" : "Send query"}</button>
      </div>
    </Modal>);
}

// ---------------------------------------------------------------- 3. EDIT / RESUBMIT (raiser or admin, while pending / queried)
export function EditVoucherSheet({ voucher, sites, onClose, onSaved }) {
  const v = voucher;
  const [f, setF] = useState({ expense_date: v.expense_date, paid_to: v.vendor === "—" ? "" : v.vendor, site_id: String(v.site_id || ""), note: v.note || "", amount: String(v.amount || ""), pay_mode: v.pay_mode || "cash", reply: "" });
  const [bills, setBills] = useState(v.bills || []); const [newFiles, setNewFiles] = useState([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [info, setInfo] = useState("");
  const set = (k, val) => setF(x => ({ ...x, [k]: val }));
  const inp = { width: "100%", padding: "9px 10px", borderRadius: 8, boxSizing: "border-box", fontSize: 14 };
  const queried = v.status === "queried";

  async function removeBill(path) {
    if (!window.confirm("Remove this bill from the voucher?")) return;
    setBusy(true); setErr("");
    const r = await removeVoucherBill(v.id, path); setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setBills(b => b.filter(x => x !== path)); setInfo("Bill removed.");
  }
  async function save(resubmit) {
    setErr(""); setInfo("");
    if (!String(f.paid_to).trim()) { setErr("Vendor name is required."); return; }
    if (!(Number(f.amount) > 0)) { setErr("Amount must be more than zero."); return; }
    if (!f.site_id) { setErr("Pick the site."); return; }
    if (resubmit && queried && !f.reply.trim() && !newFiles.length && !changed()) { setErr("Reply to the query (or change something) before resubmitting."); return; }
    setBusy(true);
    try {
      if (newFiles.length) { const up = await addVoucherBills(v.id, newFiles); if (!up.ok) { setErr("Bill upload failed: " + up.error); return; } }
      const r = await editVoucher(v.id, { expense_date: f.expense_date, paid_to: f.paid_to.trim(), site_id: Number(f.site_id), note: f.note.trim(), amount: Number(f.amount), pay_mode: f.pay_mode, reply: f.reply.trim() || null }, resubmit);
      if (!r.ok) { setErr(r.error); return; }
      onSaved(resubmit && queried ? `${v.voucher_no} updated and resubmitted for approval.` : `${v.voucher_no} updated${r.changes?.length ? ` (${r.changes.length} field(s) changed)` : ""}.`);
    } finally { setBusy(false); }
  }
  const changed = () => f.expense_date !== v.expense_date || f.paid_to.trim() !== (v.vendor === "—" ? "" : v.vendor) || String(f.site_id) !== String(v.site_id) || f.note.trim() !== (v.note || "") || Number(f.amount) !== Number(v.amount) || f.pay_mode !== (v.pay_mode || "cash");

  return (
    <Modal onClose={onClose} title={`✎ Edit ${v.voucher_no}${queried ? " — answer the query" : ""}`} width={620} busy={busy}>
      {queried && <div className="note amber" style={{ fontSize: 12.5, marginBottom: 10 }}>❓ <b>Query from {v.reviewedBy || "the approver"}:</b> {v.query_note}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
        <div style={{ gridColumn: "1 / -1" }}><label className="muted" style={{ fontSize: 11.5 }}>Vendor *</label><input style={inp} value={f.paid_to} onChange={e => set("paid_to", e.target.value)} /></div>
        <div><label className="muted" style={{ fontSize: 11.5 }}>Date *</label><input type="date" style={inp} max={todayLocal()} value={f.expense_date} onChange={e => set("expense_date", e.target.value)} /></div>
        <div><label className="muted" style={{ fontSize: 11.5 }}>Amount ₹ *</label><input style={{ ...inp, fontWeight: 700 }} inputMode="decimal" value={f.amount} onChange={e => set("amount", e.target.value.replace(/[^0-9.]/g, ""))} /></div>
        <div><label className="muted" style={{ fontSize: 11.5 }}>Site *</label><select style={inp} value={f.site_id} onChange={e => set("site_id", e.target.value)}><option value="">— select —</option>{(sites || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="muted" style={{ fontSize: 11.5 }}>Payment mode</label><select style={inp} value={f.pay_mode} onChange={e => set("pay_mode", e.target.value)}>{PAY_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div style={{ gridColumn: "1 / -1" }}><label className="muted" style={{ fontSize: 11.5 }}>Particulars</label><input style={inp} value={f.note} onChange={e => set("note", e.target.value)} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="muted" style={{ fontSize: 11.5 }}>Attached bills ({bills.length})</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {bills.map((b, i) => (
            <div key={b} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 6, width: 120, textAlign: "center", fontSize: 11 }}>
              <a href={billUrl(b)} target="_blank" rel="noreferrer">{isPdf(b) ? <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>📄</div> : <img src={billUrl(b)} alt="" style={{ height: 64, width: "100%", objectFit: "cover", borderRadius: 4 }} />}</a>
              <div>Bill {i + 1}</div>
              <button type="button" style={{ fontSize: 10.5, marginTop: 3 }} disabled={busy || bills.length <= 1} title={bills.length <= 1 ? "Add the correct bill first, then remove this one" : ""} onClick={() => removeBill(b)}>✕ Remove</button>
            </div>))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          <label>＋ Add bill(s): <input type="file" multiple accept="image/*,application/pdf" disabled={busy} onChange={e => setNewFiles(fs => [...fs, ...Array.from(e.target.files || [])])} /></label>
          {newFiles.length > 0 && <div className="muted" style={{ fontSize: 11.5 }}>{newFiles.map((x, i) => <span key={i}>{x.name}{i < newFiles.length - 1 ? ", " : ""}</span>)} <button type="button" style={{ fontSize: 10.5 }} onClick={() => setNewFiles([])}>clear</button></div>}
        </div>
      </div>
      {queried && <div style={{ marginTop: 12 }}><label className="muted" style={{ fontSize: 11.5 }}>Your reply to the query</label><textarea style={{ width: "100%", minHeight: 70 }} value={f.reply} onChange={e => set("reply", e.target.value)} placeholder="e.g. GST invoice attached; amount corrected as per the bill." /></div>}
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
      {info && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{info}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" onClick={() => save(false)} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        {queried && <button type="button" className="primary" onClick={() => save(true)} disabled={busy}>{busy ? "Saving…" : "Save & Resubmit"}</button>}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Every change is logged on the voucher's history (field, old → new, who, when). Editing is blocked once the voucher is approved, rejected or paid — the database enforces this, not just this screen.</div>
    </Modal>);
}

// ---------------------------------------------------------------- 4. REPLY ONLY (raiser answers without editing)
export function ReplyDialog({ voucher, onClose, onDone }) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function send() {
    setBusy(true); setErr(""); const r = await replyVoucher(voucher.id, note.trim()); setBusy(false);
    if (!r.ok) { setErr(r.error); return; } onDone(`${voucher.voucher_no} resubmitted with your reply.`);
  }
  return (
    <Modal onClose={onClose} title={`↩ Reply & resubmit — ${voucher.voucher_no}`} width={520} busy={busy}>
      <div className="note amber" style={{ fontSize: 12.5, marginBottom: 10 }}>❓ <b>Query:</b> {voucher.query_note}</div>
      <textarea value={note} onChange={e => setNote(e.target.value)} autoFocus style={{ width: "100%", minHeight: 100 }} placeholder="Your answer…" />
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="primary" disabled={busy || !note.trim()} onClick={send}>{busy ? "Sending…" : "Reply & resubmit"}</button>
      </div>
    </Modal>);
}

// ---------------------------------------------------------------- 5. TIMELINE
const EV = { queried: ["❓", "Query raised", "#b45309"], replied: ["↩", "Reply", "#1d4ed8"], resubmitted: ["🔁", "Resubmitted for approval", "#1d4ed8"], edited: ["✎", "Edited", "#4b5563"],
  approved: ["✓", "Approved", "#065f46"], rejected: ["✕", "Rejected", "#991b1b"], paid: ["₹", "Marked paid", "#065f46"], unpaid: ["₹", "Payment reverted", "#991b1b"], bill_added: ["📎", "Bill(s) added", "#4b5563"], bill_removed: ["📎", "Bill removed", "#4b5563"] };
const fmtVal = v => v == null || v === "" ? "—" : typeof v === "number" ? inr(v) : String(v);
export function TimelineDialog({ voucher, onClose }) {
  const [ev, setEv] = useState(null);
  useEffect(() => { getVoucherEvents(voucher.id).then(setEv); }, [voucher.id]);
  return (
    <Modal onClose={onClose} title={`🕘 History — ${voucher.voucher_no} · ${voucher.vendor}`} width={620}>
      <div style={{ fontSize: 12.5, marginBottom: 10 }}>Raised by <b>{voucher.raisedBy}</b> on {String(voucher.expense_date).split("-").reverse().join("/")} · {inr(voucher.amount)} · now <b>{voucher.status === "queried" ? "Query raised" : voucher.status}</b>{voucher.payment_status === "paid" ? " · paid" : ""}</div>
      {ev === null ? <div className="muted">Loading…</div> : !ev.length ? <div className="muted">No events recorded yet (history starts from update 458).</div> : (
        <div style={{ borderLeft: "2px solid var(--border)", marginLeft: 8, paddingLeft: 14 }}>
          {ev.map(e => { const [ic, lbl, col] = EV[e.event] || ["•", e.event, "#4b5563"]; return (
            <div key={e.id} style={{ position: "relative", marginBottom: 12 }}>
              <span style={{ position: "absolute", left: -24, top: 0, width: 18, height: 18, borderRadius: "50%", background: "#fff", border: `2px solid ${col}`, color: col, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{ic}</span>
              <div style={{ fontSize: 12.5 }}><b style={{ color: col }}>{lbl}</b> · {e.by_name || "—"} <span className="muted">· {String(e.at).slice(0, 16).replace("T", " ")}</span></div>
              {e.note && <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{e.note}</div>}
              {Array.isArray(e.changes) && e.changes.length > 0 && <table style={{ fontSize: 11.5, borderCollapse: "collapse", marginTop: 3 }}><tbody>
                {e.changes.map((c, i) => <tr key={i}><td style={{ padding: "1px 8px 1px 0", fontWeight: 600 }}>{c.field}</td><td style={{ padding: "1px 6px", color: "#991b1b", textDecoration: "line-through" }}>{fmtVal(c.old)}</td><td style={{ padding: "1px 6px" }}>→ {fmtVal(c.new)}</td></tr>)}
              </tbody></table>}
            </div>); })}
        </div>)}
    </Modal>);
}
