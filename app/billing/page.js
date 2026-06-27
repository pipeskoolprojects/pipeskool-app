"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import {
  BILL_STATUS, inr, lineCum, linePrev,
  getRaSettings, saveRaSettings, getRaBills, createRaBill, getRaBill, saveRaBill, deleteRaBill,
} from "@/lib/billing";

const SITES = [{ id: 1, name: "KEI Sanand" }, { id: 2, name: "SOUL Campus" }, { id: 3, name: "The Creek" }];
const STATUS_FLOW = ["draft", "submitted", "certified", "paid"];

export default function BillingPage() {
  const [site, setSite] = useState(2);
  const [settings, setSettings] = useState(null);
  const [bills, setBills] = useState([]);
  const [edit, setEdit] = useState(null);   // { id, no, status, mode, matPct, instPct, date, remarks }
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  useEffect(() => { getRaSettings(site).then(setSettings); getRaBills(site).then(setBills); setEdit(null); setMsg(""); setErr(""); }, [site]);

  const setLine = (i, k, v) => setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));

  async function saveSettings() {
    setBusy(true); const res = await saveRaSettings(settings); setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Billing settings saved."); getRaSettings(site).then(setSettings);
  }

  async function newBill() {
    setErr(""); setMsg(""); setBusy(true);
    const res = await createRaBill(site, settings.billing_mode, Number(settings.material_pct), Number(settings.install_pct));
    if (!res.ok) { setBusy(false); setErr(res.error); return; }
    const { hdr, lines } = await getRaBill(res.billId, site);
    setBusy(false);
    if (!lines.length) { setErr("No BOQ lines for this project — load the BOQ master first."); return; }
    openEditor(hdr, lines);
  }

  async function openExisting(bill) {
    setBusy(true); const { hdr, lines } = await getRaBill(bill.id, site); setBusy(false);
    openEditor(hdr, lines);
  }

  function openEditor(hdr, lines) {
    setEdit({ id: hdr.id, no: hdr.bill_no, status: hdr.status, mode: hdr.billing_mode,
      matPct: Number(hdr.material_pct), instPct: Number(hdr.install_pct),
      date: hdr.bill_date, remarks: hdr.remarks || "" });
    setLines(lines); setMsg(""); setErr("");
  }

  async function save(status) {
    setBusy(true);
    const meta = { bill_date: edit.date, remarks: edit.remarks, status: status || edit.status };
    const res = await saveRaBill(edit.id, site, lines, meta); setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setEdit(e => ({ ...e, status: meta.status }));
    setMsg("RA-" + edit.no + " saved" + (status ? " · " + BILL_STATUS[status][0] : "") + ". BOQ progress updated.");
    getRaBills(site).then(setBills);
  }

  async function removeBill(bill) {
    if (!confirm(`Delete RA-${bill.bill_no}? This reopens progress to the previous bill.`)) return;
    const res = await deleteRaBill(bill.id, site);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("RA-" + bill.bill_no + " deleted."); getRaBills(site).then(setBills); if (edit?.id === bill.id) setEdit(null);
  }

  // editor totals
  const mode = edit?.mode, mp = edit?.matPct, ip = edit?.instPct;
  const totals = lines.reduce((t, l) => {
    const cum = lineCum(l, mode, mp, ip), prev = linePrev(l, mode, mp, ip);
    t.boq += (Number(l.boq_qty) || 0) * (Number(l.rate) || 0); t.cum += cum; t.bill += (cum - prev); return t;
  }, { boq: 0, cum: 0, bill: 0 });

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>RA Billing</h1>
          <div className="filters">
            <select value={site} onChange={e => setSite(Number(e.target.value))}>
              {SITES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — RA Billing needs a live database.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

        {!edit && settings && (
          <>
            {/* settings */}
            <div className="panel">
              <h2>Billing method — {SITES.find(s => s.id === site)?.name}</h2>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <label className="muted">Mode</label>
                  <select value={settings.billing_mode} onChange={e => setSettings(s => ({ ...s, billing_mode: e.target.value }))}>
                    <option value="simple">Simple — qty done per line</option>
                    <option value="split">Split — Material % + Installation %</option>
                  </select>
                </div>
                {settings.billing_mode === "split" && (
                  <>
                    <div><label className="muted">Material delivery %</label><input style={{ width: 110 }} value={settings.material_pct} onChange={e => setSettings(s => ({ ...s, material_pct: e.target.value }))} /></div>
                    <div><label className="muted">Installation %</label><input style={{ width: 110 }} value={settings.install_pct} onChange={e => setSettings(s => ({ ...s, install_pct: e.target.value }))} /></div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{Number(settings.material_pct) + Number(settings.install_pct) !== 100 ? <span style={{ color: "var(--red)" }}>⚠ should total 100%</span> : "= 100% ✓"}</div>
                  </>
                )}
                <button className="primary" disabled={busy} onClick={saveSettings}>Save method</button>
              </div>
              <div className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>The mode is locked into each bill when it's created, so changing it later won't disturb past bills.</div>
            </div>

            {/* bills list */}
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ marginBottom: 0 }}>Running Account bills</h2>
                <button className="primary" disabled={busy} onClick={newBill}>＋ New RA bill</button>
              </div>
              {bills.length === 0 ? <div className="muted" style={{ marginTop: 12 }}>No RA bills yet. Create RA-1 to start billing this project.</div> : (
                <table style={{ marginTop: 12 }}>
                  <thead><tr><th>Bill</th><th>Date</th><th>Mode</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {bills.map(b => { const [l, c] = BILL_STATUS[b.status] || ["—", "gray"]; return (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 700 }}>RA-{b.bill_no}</td>
                        <td className="muted">{b.bill_date}</td>
                        <td className="muted">{b.billing_mode === "split" ? `Split ${b.material_pct}/${b.install_pct}` : "Simple"}</td>
                        <td><span className={"badge " + c}>{l}</span></td>
                        <td style={{ textAlign: "right" }}>
                          <button style={{ fontSize: 12 }} onClick={() => openExisting(b)}>Open</button>{" "}
                          <button style={{ fontSize: 12, color: "var(--red)" }} onClick={() => removeBill(b)}>Delete</button>
                        </td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* editor */}
        {edit && (
          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h2 style={{ marginBottom: 2 }}>RA-{edit.no} · {SITES.find(s => s.id === site)?.name}</h2>
                <div className="muted" style={{ fontSize: 12.5 }}>{edit.mode === "split" ? `Split billing — Material ${edit.matPct}% + Installation ${edit.instPct}%` : "Simple billing — qty done per line"}</div>
              </div>
              <button onClick={() => { setEdit(null); getRaBills(site).then(setBills); }}>← Back to bills</button>
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "12px 0" }}>
              <div><label className="muted">Bill date</label><input type="date" value={edit.date || ""} onChange={e => setEdit(x => ({ ...x, date: e.target.value }))} /></div>
              <div style={{ flex: 1, minWidth: 200 }}><label className="muted">Remarks</label><input style={{ width: "100%" }} value={edit.remarks} onChange={e => setEdit(x => ({ ...x, remarks: e.target.value }))} /></div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="dt-compact">
                <thead>
                  {edit.mode === "split" ? (
                    <tr><th>Code</th><th>Description</th><th className="num">BOQ qty</th><th className="num">Rate</th>
                      <th className="num">Cum. material</th><th className="num">Cum. install</th><th className="num">This bill ₹</th></tr>
                  ) : (
                    <tr><th>Code</th><th>Description</th><th className="num">BOQ qty</th><th className="num">Rate</th>
                      <th className="num">Prev qty</th><th className="num">Up-to-date qty</th><th className="num">This bill ₹</th></tr>
                  )}
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const cum = lineCum(l, mode, mp, ip), prev = linePrev(l, mode, mp, ip), thisBill = cum - prev;
                    return (
                      <tr key={l.boq_item_id}>
                        <td style={{ fontWeight: 600 }}>{l.item_code}</td>
                        <td style={{ maxWidth: 280 }}>{l.description}<span className="muted"> ({l.unit})</span></td>
                        <td className="num">{l.boq_qty}</td>
                        <td className="num">{l.rate}</td>
                        {edit.mode === "split" ? (
                          <>
                            <td className="num"><input style={{ width: 80, textAlign: "right" }} value={l.cum_material_qty} onChange={e => setLine(i, "cum_material_qty", e.target.value)} />
                              <div className="muted" style={{ fontSize: 10 }}>prev {l.prev_material_qty}</div></td>
                            <td className="num"><input style={{ width: 80, textAlign: "right" }} value={l.cum_install_qty} onChange={e => setLine(i, "cum_install_qty", e.target.value)} />
                              <div className="muted" style={{ fontSize: 10 }}>prev {l.prev_install_qty}</div></td>
                          </>
                        ) : (
                          <>
                            <td className="num muted">{l.prev_qty}</td>
                            <td className="num"><input style={{ width: 90, textAlign: "right" }} value={l.cum_qty} onChange={e => setLine(i, "cum_qty", e.target.value)} /></td>
                          </>
                        )}
                        <td className="num" style={{ fontWeight: 600, color: thisBill < 0 ? "var(--red)" : "inherit" }}>{inr(thisBill)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}>
                    <td colSpan={edit.mode === "split" ? 6 : 6}>This bill total</td>
                    <td className="num">{inr(totals.bill)}</td>
                  </tr>
                  <tr className="muted">
                    <td colSpan={6}>Cumulative billed to date · BOQ value {inr(totals.boq)}</td>
                    <td className="num">{inr(totals.cum)} ({totals.boq ? Math.round(totals.cum / totals.boq * 100) : 0}%)</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button className="primary" disabled={busy} onClick={() => save(null)}>{busy ? "Saving…" : "Save draft"}</button>
              <select value={edit.status} onChange={e => save(e.target.value)} disabled={busy} title="Set status">
                {STATUS_FLOW.map(s => <option key={s} value={s}>{BILL_STATUS[s][0]}</option>)}
              </select>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
