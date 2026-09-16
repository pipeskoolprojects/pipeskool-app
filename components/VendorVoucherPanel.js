"use client";
// update355: DIRECT VENDOR PAYMENT / LOCAL PURCHASE VOUCHER, under Site Execution.
// update389: the form is now a five-field expense-voucher upload (vendor, site, date, amount,
// bill) — mode/status/items/address/reference/description/remarks removed from the FORM only;
// the saved row carries safe defaults so approvals, ledgers and exports are unchanged.
// The voucher is written into `expenses`, so it lands in site cost totals, the approvals
// queue and both exports automatically — see lib/vendorVoucher.js for why.
import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth";
import { inr } from "@/lib/data";
import { createVendorVoucher, listVendorVouchers, setVoucherPayment } from "@/lib/vendorVoucher";
import { todayLocal } from "@/lib/today";

const NAVY = "#1f2a4b";

// ---- module scope: never define a component inside a component (update204) ----

function Field({ label, hint, children, wide }) {
  return (
    <div style={{ marginBottom: 12, gridColumn: wide ? "1 / -1" : undefined }}>
      <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, marginBottom: 3, color: NAVY }}>{label}</label>
      {children}
      {hint && <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// update389: file picks accumulate (camera shot + a PDF, several photos) instead of the
// last pick replacing the previous ones — the one FileList behaviour that lost bills.
function FilePicker({ files, setFiles, disabled }) {
  const add = e => { const list = Array.from(e.target.files || []); if (list.length) setFiles(fs => [...fs, ...list]); e.target.value = ""; };
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <label className="primary" style={{ flex: 1, textAlign: "center", padding: "12px 8px", borderRadius: 10, fontWeight: 700, cursor: "pointer", opacity: disabled ? .6 : 1 }}>
          📷 Take photo
          <input type="file" accept="image/*" capture="environment" disabled={disabled} onChange={add} style={{ display: "none" }} />
        </label>
        <label style={{ flex: 1, textAlign: "center", padding: "12px 8px", borderRadius: 10, fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)", background: "#fff", opacity: disabled ? .6 : 1 }}>
          📁 Photo / PDF
          <input type="file" accept="image/*,application/pdf" multiple disabled={disabled} onChange={add} style={{ display: "none" }} />
        </label>
      </div>
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {files.map((f, i) => (
            <div key={i} style={{ position: "relative", width: 72, height: 72, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, textAlign: "center", padding: 2 }}>
              {/^image\//.test(f.type) ? <img alt="" src={URL.createObjectURL(f)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>📄 PDF</span>}
              <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} disabled={disabled}
                      style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: 10, padding: 0, lineHeight: "18px", fontSize: 12, background: "#fff" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VendorVoucherPanel({ sites: sitesProp, staff = [], autoOpen = false, compact = false }) {
  const sess = typeof window !== "undefined" ? getSession() : null;
  const sites = sitesProp || [];
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!!autoOpen);
  const [files, setFiles] = useState([]);
  const [saved, setSaved] = useState(null);   // { id, voucher_no } — shows the PDF button after submit
  // site defaults to the only site, else the session's site — usually one less tap
  const defaultSite = () => sites.length === 1 ? String(sites[0].id)
    : (sess?.site_id && sites.some(s => String(s.id) === String(sess.site_id)) ? String(sess.site_id) : "");
  const blank = () => ({ vendor_name: "", site_id: defaultSite(), expense_date: todayLocal(), amount: "" });
  const [f, setF] = useState(blank);
  useEffect(() => { if (!f.site_id && sites.length) setF(x => ({ ...x, site_id: defaultSite() })); }, [sites.length]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    try { setRows(await listVendorVouchers({})); } catch (e) { setErr(e.message); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  const canSave = String(f.vendor_name).trim() && f.site_id && f.expense_date && Number(f.amount) > 0 && files.length > 0;

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    const r = await createVendorVoucher({ ...f, items: [] }, files, sess?.id);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setSaved({ id: r.id, voucher_no: r.voucher_no, warn: r.warn || "" });
    setFiles([]); setF(blank());
    load();
  }

  async function markPaid(r) {
    const ref = prompt(`Mark ${r.voucher_no} as PAID.\n\nReference (cheque no / UTR / txn id) — optional:`);
    if (ref === null) return;
    const res = await setVoucherPayment(r.id, { payment_status: "paid", payment_ref: ref });
    if (!res.ok) { setErr(res.error); return; }
    setMsg(`${r.voucher_no} marked paid.`); load();
  }

  const unpaid = (rows || []).filter(r => r.payment_status !== "paid");
  const unpaidTotal = +unpaid.reduce((n, r) => n + Number(r.amount || 0), 0).toFixed(2);
  const inp = { width: "100%", fontSize: 16, padding: "10px 12px", borderRadius: 10, boxSizing: "border-box" };

  return (
    <>
        {!compact && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <div className="muted" style={{ fontSize: 12.5, maxWidth: 640 }}>
              Material bought straight from a local shop, with no PO. Saved as a company expense — it goes into the approvals queue, this site&apos;s cost total, and the Excel and Tally exports, marked <b>Direct Vendor Payment</b>.
            </div>
            <button className="primary" onClick={() => { setOpen(true); setSaved(null); setErr(""); setMsg(""); }}>＋ New Direct Vendor Payment</button>
          </div>
        )}
        {compact && !open && !saved && (
          <button className="primary" style={{ width: "100%", padding: 12, fontSize: 15, marginBottom: 10 }} onClick={() => { setOpen(true); setErr(""); setMsg(""); }}>＋ New voucher</button>
        )}

        {err && !open && <div className="error" style={{ marginBottom: 10, whiteSpace: "pre-wrap" }}>{err}</div>}
        {msg && <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", padding: "8px 12px", borderRadius: 6, marginBottom: 10, fontSize: 12.5 }}>{msg}</div>}

        {/* update389: submitted — the voucher PDF (voucher page + every bill page after it) is one tap away */}
        {saved && (
          <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 800, color: "#065f46", fontSize: 15 }}>✅ {saved.voucher_no} submitted</div>
            <div className="muted" style={{ fontSize: 12.5, margin: "4px 0 10px" }}>Sent to the Director for approval.{saved.warn ? " ⚠ " + saved.warn : ""}</div>
            <a href={"/vendor-voucher/print?id=" + saved.id} target="_blank" rel="noreferrer" className="primary"
               style={{ display: "block", textAlign: "center", padding: 12, borderRadius: 10, fontWeight: 700, textDecoration: "none" }}>📄 Open Expense Voucher PDF</a>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Voucher on page 1, each bill/receipt on the pages after it. Use Print / Share → Save as PDF.</div>
            <button style={{ width: "100%", marginTop: 10 }} onClick={() => { setSaved(null); setOpen(true); }}>＋ Another voucher</button>
          </div>
        )}

        {!compact && unpaid.length > 0 && (
          <div className="note amber" style={{ marginBottom: 10, fontSize: 12.5 }}>
            <b>{unpaid.length} voucher(s) still unpaid · {inr(unpaidTotal)}</b> — approval and payment are tracked separately, so an approved voucher can still be waiting to go out.
          </div>
        )}

        {!compact && (
        <div className="panel">
          {rows === null ? <div className="muted">Loading…</div> : !rows.length ? (
            <div className="muted">No direct vendor payments recorded yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr>
                  <th>Voucher No.</th><th>Date</th><th>Vendor</th><th>Site</th><th>Particulars</th>
                  <th className="num">Amount</th><th>Mode</th><th>Payment</th><th>Approval</th><th>Raised by</th><th></th>
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.voucher_no || "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{String(r.expense_date).split("-").reverse().join("/")}</td>
                      <td style={{ fontWeight: 600 }}>{r.vendor}</td>
                      <td style={{ fontSize: 12 }}>{r.site}</td>
                      <td style={{ fontSize: 11.5, maxWidth: 260 }}>{r.note || "—"}{r.bills.length > 0 && <span className="muted"> · 📎 {r.bills.length}</span>}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{inr(r.amount)}</td>
                      <td style={{ fontSize: 11.5, textTransform: "capitalize" }}>{r.pay_mode}</td>
                      <td>{r.payment_status === "paid"
                        ? <span className="badge p">Paid{r.paid_on ? " " + String(r.paid_on).split("-").reverse().slice(0, 2).join("/") : ""}</span>
                        : <span className="badge h">Pending</span>}</td>
                      <td style={{ fontSize: 11.5, textTransform: "capitalize" }}>{r.status}</td>
                      <td style={{ fontSize: 11.5 }}>{r.raisedBy}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button style={{ fontSize: 11.5 }} onClick={() => window.open("/vendor-voucher/print?id=" + r.id, "_blank")}>🖨 Voucher</button>{" "}
                        {r.payment_status !== "paid" && <button style={{ fontSize: 11.5 }} onClick={() => markPaid(r)}>₹ Mark paid</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {open && (
          <div onClick={() => !busy && setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 520, maxHeight: "94vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "16px 18px 10px", borderBottom: "1px solid var(--border)" }}>
                <h2 style={{ margin: 0, fontSize: 19 }}>Expense voucher</h2>
                <div className="muted" style={{ fontSize: 12 }}>Direct vendor payment · goes to the Director for approval.</div>
              </div>

              <div style={{ padding: "14px 18px", overflowY: "auto", flex: 1 }}>
                <Field label="Vendor name *">
                  <input style={inp} value={f.vendor_name} placeholder="Shop / vendor name" autoFocus
                         onChange={e => setF(x => ({ ...x, vendor_name: e.target.value }))} />
                </Field>
                <Field label="Site *">
                  <select style={inp} value={f.site_id} onChange={e => setF(x => ({ ...x, site_id: e.target.value }))}>
                    <option value="">— select site —</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                  <Field label="Date *">
                    <input type="date" style={inp} max={todayLocal()} value={f.expense_date} onChange={e => setF(x => ({ ...x, expense_date: e.target.value }))} />
                  </Field>
                  <Field label="Amount ₹ *">
                    <input style={{ ...inp, fontWeight: 700 }} inputMode="decimal" placeholder="0" value={f.amount}
                           onChange={e => setF(x => ({ ...x, amount: e.target.value.replace(/[^0-9.]/g, "") }))} />
                  </Field>
                </div>
                <Field label={"Bill / receipt *" + (files.length ? ` (${files.length} attached)` : "")} hint="Photo or PDF · more than one is fine.">
                  <FilePicker files={files} setFiles={setFiles} disabled={busy} />
                </Field>
                {err && <div className="error" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{err}</div>}
              </div>

              <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", background: "#fafbfc", display: "flex", gap: 8 }}>
                <button onClick={() => setOpen(false)} disabled={busy} style={{ padding: "12px 16px", borderRadius: 10 }}>Cancel</button>
                <button className="primary" onClick={save} disabled={busy || !canSave} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 16, fontWeight: 800 }}>
                  {busy ? "Uploading…" : "Submit" + (Number(f.amount) > 0 ? " · " + inr(Number(f.amount)) : "")}
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
