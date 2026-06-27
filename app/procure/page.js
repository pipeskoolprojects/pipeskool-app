"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import {
  getOpenIndents, saveQuotes, buildComparison, createPO, getPOs, cancelPO, inr,
  DELIVERY_STATUS, updatePODelivery,
} from "@/lib/procure";
import { getVendors } from "@/lib/vendors";

export default function ProcurePage() {
  const [session, setSession] = useState(null);
  const [indents, setIndents] = useState(null);
  const [pos, setPos] = useState([]);
  const [deliv, setDeliv] = useState(null);   // PO being edited for delivery
  const [openId, setOpenId] = useState(null);
  const [quoteVendors, setQuoteVendors] = useState(["", "", ""]);
  const [rates, setRates] = useState({});
  const [cmp, setCmp] = useState(null);
  const [awardVendor, setAwardVendor] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [itemVendor, setItemVendor] = useState({});
  const [itemSplits, setItemSplits] = useState({}); // {itemId: [{vendor, qty}]} when qty-split is on
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [masterVendors, setMasterVendors] = useState([]);

  const load = () => { getOpenIndents("all").then(setIndents); getPOs("all").then(setPos); };
  useEffect(() => { setSession(getSession()); load(); getVendors(false).then(setMasterVendors); }, []);

  async function saveDelivery() {
    setBusy(true);
    const res = await updatePODelivery(deliv.id, { expected_delivery: deliv.expected_delivery, delivery_status: deliv.delivery_status, delivery_note: deliv.delivery_note });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setDeliv(null); setMsg("Delivery updated for " + deliv.po_no + " — site can see it now."); getPOs("all").then(setPos);
  }

  function openIndent(ind) {
    setOpenId(openId === ind.id ? null : ind.id);
    setCmp(null); setRates({}); setQuoteVendors(["", "", ""]); setAwardVendor(""); setReason(""); setMsg(""); setErr(""); setSplitMode(false); setItemVendor({}); setItemSplits({});
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
    setErr("");
    const c = buildComparison(ind.items, quotes);
    setCmp(c);
    const iv = {}; Object.entries(c.splitChoice).forEach(([itemId, ch]) => iv[itemId] = ch.vendor);
    setItemVendor(iv);
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

  async function awardSplit(ind) {
    setErr("");
    const byVendor = {};
    for (const it of ind.items) {
      const splits = itemSplits[it.id];
      if (splits && splits.length) {
        // quantity-split across vendors for this item
        const totalSplit = splits.reduce((s, r) => s + Number(r.qty || 0), 0);
        if (totalSplit !== Number(it.qty)) {
          setErr(`${it.item_name}: split quantities (${totalSplit}) must add up to required ${it.qty} ${it.unit}.`); return;
        }
        for (const row of splits) {
          if (!row.vendor) { setErr(`Choose a vendor for every split row of ${it.item_name}.`); return; }
          if (!Number(row.qty)) { setErr(`Enter quantity for every split row of ${it.item_name}.`); return; }
          if (!rates[it.id]?.[row.vendor]) { setErr(`No rate from ${row.vendor} for ${it.item_name}.`); return; }
          (byVendor[row.vendor] = byVendor[row.vendor] || []).push({ indent_item_id: it.id, item_id: it.item_id,
            item_name: it.item_name, qty: Number(row.qty), unit: it.unit, rate: Number(rates[it.id][row.vendor]) });
        }
      } else {
        // whole item to one vendor
        const v = itemVendor[it.id];
        if (!v) { setErr("Choose a vendor for every item (or split it by quantity)."); return; }
        if (!rates[it.id]?.[v]) { setErr(`No rate from ${v} for ${it.item_name}.`); return; }
        (byVendor[v] = byVendor[v] || []).push({ indent_item_id: it.id, item_id: it.item_id,
          item_name: it.item_name, qty: Number(it.qty), unit: it.unit, rate: Number(rates[it.id][v]) });
      }
    }
    setBusy(true);
    const issued = [];
    for (const [vendor, lines] of Object.entries(byVendor)) {
      const res = await createPO({ indent_id: ind.id, site_id: ind.site_id || 1, vendor_name: vendor,
        is_lowest: true, split_note: "Split award — cheapest per item", lines }, session?.id);
      if (!res.ok) { setBusy(false); setErr(res.error); return; }
      issued.push(res.po_no);
    }
    setBusy(false);
    setMsg("Split done — " + issued.length + " POs issued: " + issued.join(", ")); setOpenId(null); load();
  }

  const open = (indents || []).filter(i => i.status === "open" || i.status === "quoting");
  const activeVendors = quoteVendors.filter(v => v.trim());
  async function doCancel(p) { if (!confirm("Cancel PO " + p.po_no + "?")) return; await cancelPO(p.id); load(); }

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
                    {ind.edited_at && <span className="badge h" style={{ marginLeft: 8 }}>⚠ Edited by site</span>}
                    <div className="muted">{ind.site} · {ind.item_count} items · by {ind.raised_by || "—"} · {ind.date}{ind.required_by ? " · need by " + ind.required_by : ""}</div>
                  </div>
                  <span className="badge gray">{ind.status}</span>
                </div>

                {openId === ind.id && (
                  <div style={{ padding: "0 12px 14px" }}>
                    <div className="muted" style={{ margin: "4px 0 10px" }}>Enter vendor names, then each vendor's rate per item. Compare, then award the PO.</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                      {quoteVendors.map((v, i) => (
                        <select key={i} value={v}
                          onChange={e => setQuoteVendors(qv => qv.map((x, idx) => idx === i ? e.target.value : x))} style={{ width: 180 }}>
                          <option value="">Vendor {i + 1}…</option>
                          {masterVendors.map(mv => <option key={mv.id} value={mv.name}>{mv.name}</option>)}
                        </select>
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
                        <div style={{ marginTop: 10, marginBottom: 4 }}>
                          <label style={{ fontSize: 12.5, display: "inline-flex", gap: 7, alignItems: "center", cursor: "pointer" }}>
                            <input type="checkbox" checked={splitMode} onChange={e => setSplitMode(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--copper)" }} />
                            Split — choose a vendor per item (creates one PO per vendor)
                          </label>
                        </div>

                        {!splitMode ? (
                          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <label className="muted">Award whole indent to:</label>
                            <select value={awardVendor} onChange={e => { setAwardVendor(e.target.value); setReason(""); }}>
                              <option value="">Select vendor…</option>
                              {cmp.vendors.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                            {awardVendor && cmp.bestWhole && awardVendor !== cmp.bestWhole.vendor &&
                              <input placeholder="Reason for not choosing lowest *" value={reason} onChange={e => setReason(e.target.value)} style={{ width: 280 }} />}
                            <button className="primary" disabled={busy} onClick={() => award(ind)}>{busy ? "Issuing…" : "Issue PO"}</button>
                          </div>
                        ) : (
                          <div style={{ marginTop: 8 }}>
                            <div className="muted" style={{ marginBottom: 6 }}>Pick who supplies each item. Use “+ split qty” if one item must come from more than one vendor.</div>
                            <table className="dt-compact">
                              <thead><tr><th>Item</th><th className="num">Qty</th><th>Vendor / split</th><th className="num">Amount</th></tr></thead>
                              <tbody>
                                {ind.items.map(it => {
                                  const splits = itemSplits[it.id];
                                  const vendorOpts = cmp.vendors.filter(vn => rates[it.id]?.[vn]);
                                  if (splits && splits.length) {
                                    const totalSplit = splits.reduce((s, r) => s + Number(r.qty || 0), 0);
                                    const okTotal = totalSplit === Number(it.qty);
                                    return (
                                      <tr key={it.id}>
                                        <td style={{ fontWeight: 600 }}>{it.item_name}</td>
                                        <td className="num">{it.qty} {it.unit}</td>
                                        <td>
                                          {splits.map((row, ri) => (
                                            <div key={ri} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                                              <select value={row.vendor} onChange={e => setItemSplits(p => ({ ...p, [it.id]: p[it.id].map((r, i) => i === ri ? { ...r, vendor: e.target.value } : r) }))}>
                                                <option value="">Vendor…</option>
                                                {vendorOpts.map(vn => <option key={vn} value={vn}>{vn} (₹{rates[it.id][vn]})</option>)}
                                              </select>
                                              <input style={{ width: 70 }} placeholder="qty" value={row.qty} onChange={e => setItemSplits(p => ({ ...p, [it.id]: p[it.id].map((r, i) => i === ri ? { ...r, qty: e.target.value } : r) }))} />
                                              <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => ({ ...p, [it.id]: p[it.id].filter((_, i) => i !== ri) }))}>✕</button>
                                            </div>
                                          ))}
                                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                            <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => ({ ...p, [it.id]: [...p[it.id], { vendor: "", qty: "" }] }))}>+ vendor</button>
                                            <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => { const n = { ...p }; delete n[it.id]; return n; })}>cancel split</button>
                                            <span style={{ fontSize: 11.5, color: okTotal ? "var(--green)" : "var(--red)" }}>
                                              {totalSplit}/{it.qty} {it.unit}{okTotal ? " ✓" : " — must total " + it.qty}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="num">{splits.reduce((s, r) => s + (rates[it.id]?.[r.vendor] ? Number(rates[it.id][r.vendor]) * Number(r.qty || 0) : 0), 0) ? inr(splits.reduce((s, r) => s + (rates[it.id]?.[r.vendor] ? Number(rates[it.id][r.vendor]) * Number(r.qty || 0) : 0), 0)) : "—"}</td>
                                      </tr>
                                    );
                                  }
                                  const v = itemVendor[it.id] || "";
                                  const r = v ? rates[it.id]?.[v] : "";
                                  return (
                                    <tr key={it.id}>
                                      <td style={{ fontWeight: 600 }}>{it.item_name}</td>
                                      <td className="num">{it.qty} {it.unit}</td>
                                      <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <select value={v} onChange={e => setItemVendor(p => ({ ...p, [it.id]: e.target.value }))}>
                                          <option value="">Select…</option>
                                          {vendorOpts.map(vn => <option key={vn} value={vn}>{vn} (₹{rates[it.id][vn]})</option>)}
                                        </select>
                                        <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => ({ ...p, [it.id]: [{ vendor: v || "", qty: it.qty }, { vendor: "", qty: "" }] }))}>+ split qty</button>
                                      </td>
                                      <td className="num">{r ? inr(Number(r) * Number(it.qty)) : "—"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <button className="primary" disabled={busy} onClick={() => awardSplit(ind)} style={{ marginTop: 10 }}>{busy ? "Issuing…" : "Issue split POs"}</button>
                          </div>
                        )}
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
                <thead><tr><th>PO no</th><th>Indent</th><th>Vendor</th><th className="num">Amount</th><th>Delivery</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {pos.map(p => { const [dl, dc] = DELIVERY_STATUS[p.delivery_status] || DELIVERY_STATUS.pending; return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.po_no}</td>
                      <td className="muted">{p.indent_no}</td>
                      <td>{p.vendor}</td>
                      <td className="num">{inr(p.total)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className={"badge " + dc}>{dl}</span>
                        {p.expected_delivery && <div className="muted" style={{ fontSize: 11 }}>by {p.expected_delivery}</div>}
                      </td>
                      <td><span className="badge gray">{p.status}</span></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => setDeliv({ id: p.id, po_no: p.po_no, expected_delivery: p.expected_delivery || "", delivery_status: p.delivery_status || "pending", delivery_note: p.delivery_note || "" })}>📦 Delivery</button>
                        <a href={"/purchase/po?po=" + p.id} target="_blank" rel="noreferrer"><button style={{ fontSize: 11.5, marginRight: 4 }}>Print</button></a>
                        {p.status !== "cancelled" && <button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => doCancel(p)}>Cancel</button>}
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {deliv && (
          <div onClick={() => setDeliv(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 440, width: "100%", padding: 22 }}>
              <h2 style={{ marginBottom: 2 }}>Delivery — {deliv.po_no}</h2>
              <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>The site sees this live on their mobile indent list.</div>
              <div style={{ display: "grid", gap: 10 }}>
                <div><label className="muted">Expected delivery date</label>
                  <input type="date" style={{ width: "100%" }} value={deliv.expected_delivery} onChange={e => setDeliv(d => ({ ...d, expected_delivery: e.target.value }))} /></div>
                <div><label className="muted">Status</label>
                  <select style={{ width: "100%" }} value={deliv.delivery_status} onChange={e => setDeliv(d => ({ ...d, delivery_status: e.target.value }))}>
                    {Object.entries(DELIVERY_STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
                  </select></div>
                <div><label className="muted">Note (optional, e.g. reason for delay)</label>
                  <input style={{ width: "100%" }} value={deliv.delivery_note} onChange={e => setDeliv(d => ({ ...d, delivery_note: e.target.value }))} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="primary" disabled={busy} onClick={saveDelivery}>{busy ? "Saving…" : "Update delivery"}</button>
                <button onClick={() => setDeliv(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
