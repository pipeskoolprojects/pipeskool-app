"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import {
  getOpenIndents, saveQuotes, buildComparison, createPO, getPOs, inr,
} from "@/lib/procure";

export default function ProcurePage() {
  const [session, setSession] = useState(null);
  const [indents, setIndents] = useState(null);
  const [pos, setPos] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [quoteVendors, setQuoteVendors] = useState(["", "", ""]);
  const [rates, setRates] = useState({});
  const [cmp, setCmp] = useState(null);
  const [awardVendor, setAwardVendor] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const load = () => { getOpenIndents("all").then(setIndents); getPOs("all").then(setPos); };
  useEffect(() => { setSession(getSession()); load(); }, []);

  function openIndent(ind) {
    setOpenId(openId === ind.id ? null : ind.id);
    setCmp(null); setRates({}); setQuoteVendors(["", "", ""]); setAwardVendor(""); setReason(""); setMsg(""); setErr("");
  }
  const setRate = (itemId, vendor, val) => setRates(r => ({ ...r, [itemId]: { ...(r[itemId] || {}), [vendor]: val } }));

  function buildQuotes(ind) {
    const vendors = quoteVendors.map(v => v.trim()).filter(Boolean);
    const quotes = [];
    ind.items.forEach(it => vendors.forEach(v => { const rr = rates[it.id]?.[v]; if (rr) quotes.push({ indent_item_id: it.id, vendor_name: v, rate: Number(rr) }); }));
    return { vendors, quotes };
  }
  function compare(ind) {
    const { vendors, quotes } = buildQuotes(ind);
    if (vendors.length === 0) { setErr("Enter at least one vendor name."); return; }
    if (quotes.length === 0) { setErr("Enter at least one rate."); return; }
    setErr(""); setCmp(buildComparison(ind.items, quotes));
  }
  async function persistQuotes(ind) {
    const { quotes } = buildQuotes(ind);
    const res = await saveQuotes(ind.id, quotes);
    setMsg(res.ok ? "Quotes saved for " + ind.indent_no : res.error);
  }
  async function award(ind) {
    setErr("");
    if (!awardVendor) { setErr("Choose a vendor to award the PO."); return; }
    const isLowest = cmp?.bestWhole?.vendor === awardVendor;
    if (!isLowest && !reason.trim()) { setErr("This vendor is not the lowest total — please enter the reason."); return; }
    const lines = ind.items.map(it => ({ indent_item_id: it.id, item_id: it.item_id, item_name: it.item_name,
      qty: it.qty, unit: it.unit, rate: Number(rates[it.id]?.[awardVendor] || 0) }));
    if (lines.some(l => !l.rate)) { setErr("This vendor hasn't quoted every item."); return; }
    setBusy(true);
    const res = await createPO({ indent_id: ind.id, site_id: ind.site_id || 1, vendor_name: awardVendor,
      is_lowest: isLowest, non_lowest_reason: isLowest ? null : reason, lines }, session?.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("PO " + res.po_no + " issued to " + awardVendor + (isLowest ? " (lowest)" : " — reason recorded")); setOpenId(null); load();
  }

  const open = (indents || []).filter(i => i.status === "open" || i.status === "quoting");
  const activeVendors = quoteVendors.filter(v => v.trim());

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Procurement — indents &amp; POs</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — sample data.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        <div className="panel">
          <h2>Open material requests {open.length > 0 && <span className="badge warn">{open.length}</span>}</h2>
          {!indents ? <div className="muted">Loading…</div> : open.length === 0 ? <span className="muted">No open indents. Site staff raise them from Material stock → Raise material request.</span> : (
            open.map(ind => (
              <div key={ind.id} style={{ border: "1px solid var(--border)", borderRadius: 10, marginBottom: 10 }}>
                <div onClick={() => openIndent(ind)} style={{ padding: 12, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{ind.indent_no}</span>
                    {ind.urgency === "urgent" && <span className="badge a" style={{ marginLeft: 8 }}>Urgent</span>}
                    <div className="muted">{ind.site} · {ind.item_count} items · by {ind.raised_by || "—"} · {ind.date}{ind.required_by ? " · need by " + ind.required_by : ""}</div>
                  </div>
                  <span className="badge gray">{ind.status}</span>
                </div>

                {openId === ind.id && (
                  <div style={{ padding: "0 12px 14px" }}>
                    <div className="muted" style={{ margin: "4px 0 10px" }}>Enter vendor names, then each vendor's rate per item. Compare, then award the PO.</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                      {quoteVendors.map((v, i) => (
                        <input key={i} placeholder={"Vendor " + (i + 1)} value={v}
                          onChange={e => setQuoteVendors(qv => qv.map((x, idx) => idx === i ? e.target.value : x))} style={{ width: 160 }} />
                      ))}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="dt-compact">
                        <thead><tr><th>Item</th><th className="num">Qty</th>{activeVendors.map((v, i) => <th key={i} className="num">{v}</th>)}</tr></thead>
                        <tbody>
                          {ind.items.map(it => (
                            <tr key={it.id}>
                              <td style={{ fontWeight: 600 }}>{it.item_name}<div className="muted">{it.purpose}</div></td>
                              <td className="num">{it.qty} {it.unit}</td>
                              {activeVendors.map((v, i) => (
                                <td key={i} className="num"><input style={{ width: 80 }} value={rates[it.id]?.[v] || ""} onChange={e => setRate(it.id, v, e.target.value)} placeholder="rate" /></td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button onClick={() => compare(ind)}>Compare rates</button>
                      <button onClick={() => persistQuotes(ind)}>Save quotes</button>
                    </div>

                    {cmp && (
                      <div style={{ marginTop: 14, background: "var(--bg)", borderRadius: 10, padding: 12 }}>
                        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Comparison</h3>
                        <table className="dt-compact">
                          <thead><tr><th>Vendor (full indent)</th><th className="num">Total</th><th></th></tr></thead>
                          <tbody>
                            {cmp.vendorTotals.map((v, i) => (
                              <tr key={v.vendor}>
                                <td style={{ fontWeight: 600 }}>{v.vendor} {i === 0 && <span className="badge p">Lowest</span>}</td>
                                <td className="num">{inr(v.total)}</td>
                                <td>{i > 0 && <span className="muted">+{inr(v.total - cmp.bestWhole.total)}</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="muted" style={{ marginTop: 8 }}>
                          Best single vendor: <b>{cmp.bestWhole ? cmp.bestWhole.vendor + " at " + inr(cmp.bestWhole.total) : "—"}</b>.
                          {" "}Split to cheapest per item: <b>{inr(cmp.splitTotal)}</b>
                          {cmp.gap > 0 && <> — splitting saves <b style={{ color: "var(--copper-deep)" }}>{inr(cmp.gap)} ({cmp.gapPct}%)</b> but needs multiple POs / more transport.</>}
                        </div>
                        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <label className="muted">Award whole indent to:</label>
                          <select value={awardVendor} onChange={e => { setAwardVendor(e.target.value); setReason(""); }}>
                            <option value="">Select vendor…</option>
                            {cmp.vendors.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                          {awardVendor && cmp.bestWhole && awardVendor !== cmp.bestWhole.vendor &&
                            <input placeholder="Reason for not choosing lowest *" value={reason} onChange={e => setReason(e.target.value)} style={{ width: 280 }} />}
                          <button className="primary" disabled={busy} onClick={() => award(ind)}>{busy ? "Issuing…" : "Issue PO"}</button>
                        </div>
                      </div>
                    )}
                    {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="panel">
          <h2>Purchase orders issued</h2>
          {pos.length === 0 ? <span className="muted">No POs yet.</span> : (
            <div style={{ overflowX: "auto" }}>
              <table className="dt-compact">
                <thead><tr><th>PO no</th><th>Indent</th><th>Vendor</th><th>Site</th><th className="num">Amount</th><th>Lowest?</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {pos.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.po_no}</td>
                      <td className="muted">{p.indent_no}</td>
                      <td>{p.vendor}</td>
                      <td className="muted">{p.site}</td>
                      <td className="num">{inr(p.total)}</td>
                      <td>{p.is_lowest ? <span className="badge p">Lowest</span> : <span className="badge warn" title={p.reason}>Reason ✎</span>}</td>
                      <td><span className="badge gray">{p.status}</span></td>
                      <td className="muted">{p.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
