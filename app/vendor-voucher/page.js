"use client";
// update355: DIRECT VENDOR PAYMENT / LOCAL PURCHASE VOUCHER, under Site Execution.
// The voucher is written into `expenses`, so it lands in site cost totals, the approvals
// queue and both exports automatically — see lib/vendorVoucher.js for why.
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { getVendorsList } from "@/lib/procure";
import { inr } from "@/lib/data";
import { createVendorVoucher, listVendorVouchers, setVoucherPayment, PAY_MODES, PAY_STATUS } from "@/lib/vendorVoucher";
import { todayLocal } from "@/lib/today";

const NAVY = "#1f2a4b";
const EMPTY_LINE = { item_name: "", qty: "", unit: "", rate: "", amount: "" };

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

function Lines({ items, setItems }) {
  const set = (i, k, v) => setItems(xs => xs.map((x, j) => {
    if (j !== i) return x;
    const n = { ...x, [k]: v };
    // rate x qty fills the amount, but a typed amount always wins — some local bills are a
    // lump sum with no sensible rate, and overwriting what someone typed is worse than a gap.
    if ((k === "qty" || k === "rate") && n.qty !== "" && n.rate !== "")
      n.amount = String(+(Number(n.qty) * Number(n.rate)).toFixed(2));
    return n;
  }));
  const total = +items.reduce((n, l) => n + (Number(l.amount) || 0), 0).toFixed(2);
  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: NAVY }}>Items purchased <span className="muted" style={{ fontWeight: 400 }}>(optional — leave empty and just enter a total)</span></label>
        <button type="button" style={{ fontSize: 11.5 }} onClick={() => setItems(x => [...x, { ...EMPTY_LINE }])}>＋ Add line</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
          <thead><tr>
            {["Item / material", "Qty", "Unit", "Rate", "Amount", ""].map(h =>
              <th key={h} style={{ fontSize: 10.5, textAlign: h === "Item / material" || h === "Unit" ? "left" : "right", padding: "4px 6px", background: "#f3f4f6", whiteSpace: "nowrap" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {items.map((l, i) => (
              <tr key={i}>
                <td style={{ padding: 3 }}><input style={{ width: "100%" }} value={l.item_name} onChange={e => set(i, "item_name", e.target.value)} /></td>
                <td style={{ padding: 3, width: 78 }}><input style={{ width: "100%", textAlign: "right" }} inputMode="decimal" value={l.qty} onChange={e => set(i, "qty", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
                <td style={{ padding: 3, width: 70 }}><input style={{ width: "100%" }} value={l.unit} onChange={e => set(i, "unit", e.target.value)} /></td>
                <td style={{ padding: 3, width: 90 }}><input style={{ width: "100%", textAlign: "right" }} inputMode="decimal" value={l.rate} onChange={e => set(i, "rate", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
                <td style={{ padding: 3, width: 100 }}><input style={{ width: "100%", textAlign: "right" }} inputMode="decimal" value={l.amount} onChange={e => set(i, "amount", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
                <td style={{ padding: 3, width: 30 }}><button type="button" style={{ fontSize: 11, color: "var(--red)" }} onClick={() => setItems(x => x.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
          {items.length > 0 && (
            <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}>
              <td colSpan={4} style={{ padding: "5px 6px", fontSize: 12 }}>ITEM TOTAL</td>
              <td style={{ padding: "5px 6px", textAlign: "right", fontSize: 12 }}>{inr(total)}</td><td></td>
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default function VendorVoucherPage() {
  const sess = typeof window !== "undefined" ? getSession() : null;
  const [sites, setSites] = useState([]); const [vendors, setVendors] = useState([]);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ vendor_id: "", site_id: "", expense_date: todayLocal(),
    amount: "", note: "", pay_mode: "cash", payment_status: "pending", payment_ref: "" });

  async function load() {
    try { setRows(await listVendorVouchers({})); } catch (e) { setErr(e.message); setRows([]); }
  }
  useEffect(() => {
    getSites().then(setSites).catch(e => setErr(e.message));
    getVendorsList().then(setVendors).catch(() => {});
    load();
  }, []);

  const lineTotal = useMemo(() => +items.reduce((n, l) => n + (Number(l.amount) || 0), 0).toFixed(2), [items]);
  const total = items.length ? lineTotal : (Number(f.amount) || 0);

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    const vendor = vendors.find(v => String(v.id) === String(f.vendor_id));
    const r = await createVendorVoucher(
      { ...f, amount: items.length ? lineTotal : f.amount, items, vendor_name: vendor?.name },
      files, sess?.id);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`${r.voucher_no} saved${r.warn ? " — " + r.warn : ""}. It is now in the approvals queue and in this site's cost total.`);
    setOpen(false); setItems([]); setFiles(null);
    setF({ vendor_id: "", site_id: "", expense_date: todayLocal(), amount: "", note: "", pay_mode: "cash", payment_status: "pending", payment_ref: "" });
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

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <div>
            <h1>Direct Vendor Payment</h1>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Material bought straight from a local vendor, with no PO. Saved as a company expense — it appears in the approvals queue, this site&apos;s cost total, and the Excel and Tally exports.
            </div>
          </div>
          <button className="primary" onClick={() => { setOpen(true); setErr(""); setMsg(""); }}>＋ New voucher</button>
        </div>

        {err && <div className="error" style={{ marginBottom: 10, whiteSpace: "pre-wrap" }}>{err}</div>}
        {msg && <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", padding: "8px 12px", borderRadius: 6, marginBottom: 10, fontSize: 12.5 }}>{msg}</div>}

        {unpaid.length > 0 && (
          <div className="note amber" style={{ marginBottom: 10, fontSize: 12.5 }}>
            <b>{unpaid.length} voucher(s) still unpaid · {inr(unpaidTotal)}</b> — approval and payment are tracked separately, so an approved voucher can still be waiting to go out.
          </div>
        )}

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

        {open && (
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 820, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--border)" }}>
                <h2 style={{ margin: 0 }}>New direct vendor payment</h2>
                <div className="muted" style={{ fontSize: 12 }}>Raised by {sess?.full_name || sess?.name || "you"} — this goes to the Director for approval like any other claim.</div>
              </div>

              <div style={{ padding: "18px 24px", overflowY: "auto", flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 18px" }}>
                <Field label="Vendor *">
                  <select style={{ width: "100%" }} value={f.vendor_id} onChange={e => setF(x => ({ ...x, vendor_id: e.target.value }))}>
                    <option value="">— select vendor —</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </Field>
                <Field label="Site *">
                  <select style={{ width: "100%" }} value={f.site_id} onChange={e => setF(x => ({ ...x, site_id: e.target.value }))}>
                    <option value="">— select site —</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Purchase date">
                  <input type="date" style={{ width: "100%" }} max={todayLocal()} value={f.expense_date} onChange={e => setF(x => ({ ...x, expense_date: e.target.value }))} />
                </Field>
                <Field label="Payment mode">
                  <select style={{ width: "100%" }} value={f.pay_mode} onChange={e => setF(x => ({ ...x, pay_mode: e.target.value }))}>
                    {PAY_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>

                <Lines items={items} setItems={setItems} />

                <Field label={items.length ? "Total (from the item lines)" : "Total amount ₹ *"}
                       hint={items.length ? "Add or remove lines to change this." : "Use this when the bill does not need itemising."}>
                  <input style={{ width: "100%", fontWeight: 700 }} inputMode="decimal" disabled={items.length > 0}
                         value={items.length ? String(lineTotal) : f.amount}
                         onChange={e => setF(x => ({ ...x, amount: e.target.value.replace(/[^0-9.]/g, "") }))} />
                </Field>
                <Field label="Payment status">
                  <select style={{ width: "100%" }} value={f.payment_status} onChange={e => setF(x => ({ ...x, payment_status: e.target.value }))}>
                    {PAY_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>

                <Field label="Reference" hint="Cheque number, UTR or transaction id — optional.">
                  <input style={{ width: "100%" }} value={f.payment_ref} onChange={e => setF(x => ({ ...x, payment_ref: e.target.value }))} />
                </Field>
                <Field label="Bill / receipt photo" hint="Photo or PDF. More than one is fine.">
                  <input type="file" accept="image/*,application/pdf" multiple onChange={e => setFiles(e.target.files)} />
                </Field>

                <Field wide label="What was purchased *" hint="A plain description is enough if you have not itemised above.">
                  <textarea rows={2} style={{ width: "100%", fontFamily: "inherit", fontSize: 13 }} value={f.note} onChange={e => setF(x => ({ ...x, note: e.target.value }))} />
                </Field>
              </div>

              <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", background: "#fafbfc", display: "flex", gap: 8, alignItems: "center" }}>
                <b style={{ fontSize: 13, color: NAVY }}>Total {inr(total)}</b>
                <span style={{ flex: 1 }} />
                <button onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
                <button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save voucher"}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
