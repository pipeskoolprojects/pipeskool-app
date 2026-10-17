"use client";
import { useCanViewPrices } from "@/lib/prices";   // update463
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import {
  getTallySettings, saveTallySettings, getPurchasesForTally, getStockMasters,
  markPurchasesExported, markPOsOrderExported, getGrnsForTally, markGrnsExported,
  buildPurchaseXml, buildPurchaseOrderXml, buildMasterXml, buildReceiptNoteXml, gstParts,
} from "@/lib/tally";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const todayLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA"); };

function downloadXml(xml, name) {
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const LEDGER_FIELDS = [
  ["company_name", "TallyPrime company name (exact)"],
  ["purchase_ledger", "Purchase ledger"],
  ["cgst_ledger", "Input CGST ledger"], ["sgst_ledger", "Input SGST ledger"], ["igst_ledger", "Input IGST ledger"],
  ["cash_ledger", "Cash ledger"], ["bank_ledger", "Bank ledger"], ["default_expense_ledger", "Default expense ledger"],
];

export default function TallyPage() {
  const [s, setS] = useState(null);
  const [savingS, setSavingS] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [tab, setTab] = useState("orders");           // masters | orders | bills
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayLocal());
  const [onlyNew, setOnlyNew] = useState(true);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [masters, setMasters] = useState(null);
  const [grns, setGrns] = useState(null);
  const canPx = useCanViewPrices();   // update463: Tally vouchers carry prices — price viewers only

  useEffect(() => { getTallySettings().then(setS); }, []);
  const set = (k, v) => setS(x => ({ ...x, [k]: v }));
  const switchTab = t => { setTab(t); setRows(null); setMasters(null); setGrns(null); setMsg(""); setErr(""); };

  async function save() {
    setSavingS(true); const r = await saveTallySettings(s); setSavingS(false);
    setMsg(r.ok ? "Tally settings saved." : ""); setErr(r.ok ? "" : r.error);
  }

  async function load() {
    setLoading(true); setMsg(""); setErr("");
    const flagCol = tab === "orders" ? "tally_po_exported_at" : "tally_exported_at";
    const data = await getPurchasesForTally(from, to, onlyNew, flagCol);
    setRows(data); setLoading(false);
  }

  async function loadMasters() {
    setLoading(true); setMsg(""); setErr("");
    const m = await getStockMasters(); setMasters(m); setLoading(false);
  }

  async function loadGrns() {
    setLoading(true); setMsg(""); setErr("");
    const g = await getGrnsForTally(from, to, onlyNew); setGrns(g); setLoading(false);
  }

  function exportReceiptNotes() {
    if (!grns || !grns.length) { setErr("Load goods receipts first."); return; }
    downloadXml(buildReceiptNoteXml(grns, s), `Tally_ReceiptNotes_${from}_to_${to}.xml`);
    setMsg("Receipt Note XML downloaded. In TallyPrime: Gateway → Import → Vouchers → select this file. (Stock items must already be synced.)");
  }

  async function markGrnsDone() {
    if (!grns || !grns.length) return;
    const r = await markGrnsExported(grns.map(g => g.grn_no));
    if (r.ok) { setMsg("Marked " + grns.length + " receipt(s) as exported."); loadGrns(); } else setErr(r.error);
  }

  const totals = (rows || []).reduce((t, p) => {
    const g = gstParts(p.gstin, s?.home_state_code, p.subtotal, s?.default_gst_pct || 0);
    t.sub += p.subtotal; t.gst += g.cgst + g.sgst + g.igst; t.n += 1; return t;
  }, { sub: 0, gst: 0, n: 0 });

  function exportXml() {
    if (!rows || !rows.length) { setErr("Load records first."); return; }
    if (tab === "orders") {
      downloadXml(buildPurchaseOrderXml(rows, s), `Tally_PurchaseOrders_${from}_to_${to}.xml`);
      setMsg("Purchase Order XML downloaded. In TallyPrime: Gateway → Import → Vouchers → select this file. (Run the Stock-item sync first.)");
    } else {
      downloadXml(buildPurchaseXml(rows, s), `Tally_PurchaseBills_${from}_to_${to}.xml`);
      setMsg("Purchase bill XML downloaded. In TallyPrime: Gateway → Import → Vouchers → select this file.");
    }
  }

  function exportMasters() {
    if (!masters || !masters.items.length) { setErr("Load the item master first."); return; }
    downloadXml(buildMasterXml(masters.items, masters.units, s), "Tally_StockItems.xml");
    setMsg("Stock-item masters downloaded. In TallyPrime: Gateway → Import → Masters → select this file. Run this before importing Purchase Orders.");
  }

  async function markDone() {
    if (!rows || !rows.length) return;
    const r = tab === "orders" ? await markPOsOrderExported(rows.map(p => p.id)) : await markPurchasesExported(rows.map(p => p.id));
    if (r.ok) { setMsg("Marked " + rows.length + " record(s) as exported."); load(); } else setErr(r.error);
  }

  if (canPx === false) return <div className="layout"><Sidebar /><main className="main"><h1>Tally export</h1><div className="note amber">🔒 Tally vouchers carry purchase prices, so this page is for staff with Price access (Admin &amp; Access).</div></main></div>;
  if (!s || canPx === null) return <div className="layout"><Sidebar /><main className="main"><div className="muted">Loading…</div></main></div>;

  const TabBtn = ({ id, label }) => <button className={tab === id ? "primary" : ""} onClick={() => switchTab(id)}>{label}</button>;
  const showGst = tab === "bills";

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Tally export</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — Tally export needs a live database.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

        <div className="panel">
          <h2>Ledger mapping</h2>
          <div className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>These must match your TallyPrime names exactly, or the import creates wrong/duplicate ledgers. Ask your accountant for the exact names.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {LEDGER_FIELDS.map(([k, label]) => (
              <div key={k}><label className="muted">{label}</label><input style={{ width: "100%" }} value={s[k] || ""} onChange={e => set(k, e.target.value)} /></div>
            ))}
            <div><label className="muted">Home state code (Gujarat = 24)</label><input style={{ width: "100%" }} value={s.home_state_code || ""} onChange={e => set("home_state_code", e.target.value)} /></div>
            <div><label className="muted">Default GST %</label><input style={{ width: "100%" }} value={s.default_gst_pct ?? ""} onChange={e => set("default_gst_pct", e.target.value)} /></div>
          </div>
          <label style={{ display: "inline-flex", gap: 7, alignItems: "center", marginTop: 12, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={!!s.auto_create_party} onChange={e => set("auto_create_party", e.target.checked)} style={{ accentColor: "var(--copper)" }} />
            Auto-create vendor ledgers in Tally if missing (under Sundry Creditors)
          </label>
          <div style={{ marginTop: 14 }}><button className="primary" disabled={savingS} onClick={save}>{savingS ? "Saving…" : "Save mapping"}</button></div>
        </div>

        <div className="panel">
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <TabBtn id="masters" label="1 · Stock items" />
            <TabBtn id="orders" label="2 · Purchase orders" />
            <TabBtn id="grns" label="3 · Goods receipts" />
            <TabBtn id="bills" label="4 · Purchase bills" />
          </div>

          {tab === "masters" ? (
            <>
              <div className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>One-time sync (re-run when you add new items). Creates your item master + units as Tally Stock Items, so Purchase Orders and challans can reference them. Import under <b>Masters</b>, not Vouchers.</div>
              <button className="primary" disabled={loading} onClick={loadMasters}>{loading ? "Loading…" : "Load item master"}</button>
              {masters && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 18, marginBottom: 10 }}>
                    <div><div className="muted" style={{ fontSize: 11 }}>Stock items</div><div style={{ fontWeight: 700 }}>{masters.items.length}</div></div>
                    <div><div className="muted" style={{ fontSize: 11 }}>Units</div><div style={{ fontWeight: 700 }}>{masters.units.length}</div></div>
                  </div>
                  <button className="primary" onClick={exportMasters}>⬇ Download stock-item masters XML</button>
                </div>
              )}
            </>
          ) : tab === "grns" ? (
            <>
              <div className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>Goods received from vendors (recorded as GRN on the mobile app). Print the delivery/goods-received challan, and export to Tally as <b>Receipt Note</b> vouchers. Stock items must be synced first (tab 1).</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                <div><label className="muted">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
                <div><label className="muted">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} style={{ accentColor: "var(--copper)" }} />
                  Only not-yet-exported
                </label>
                <button className="primary" disabled={loading} onClick={loadGrns}>{loading ? "Loading…" : "Load goods receipts"}</button>
              </div>
              {grns && (grns.length === 0 ? <div className="muted">No goods receipts in this range.</div> : (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table className="dt-compact">
                      <thead><tr><th>GRN</th><th>Date</th><th>Supplier</th><th>Vendor challan</th><th className="num">Items</th><th className="num">Value</th><th></th><th></th></tr></thead>
                      <tbody>
                        {grns.map(g => {
                          const val = g.lines.reduce((sx, l) => sx + l.received_qty * l.rate, 0);
                          return (
                            <tr key={g.grn_no}>
                              <td style={{ fontWeight: 600 }}>{g.grn_no}</td>
                              <td className="muted">{g.date}</td>
                              <td>{g.vendor || "—"}</td>
                              <td className="muted">{g.challan_no || "—"}</td>
                              <td className="num">{g.lines.length}</td>
                              <td className="num">{inr(val)}</td>
                              <td><a href={"/purchase/challan?grn=" + encodeURIComponent(g.grn_no)} target="_blank" rel="noreferrer"><button style={{ fontSize: 11.5 }}>🧾 Print challan</button></a></td>
                              <td>{g.exported && <span className="badge gray">exported</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button className="primary" onClick={exportReceiptNotes}>⬇ Download Receipt Note XML</button>
                    <button onClick={markGrnsDone}>Mark as exported</button>
                  </div>
                </>
              ))}
            </>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>
                {tab === "orders"
                  ? "Posts each PO as a Tally Purchase Order voucher (inventory order, basic value — GST is applied at billing). Run the Stock-item sync first."
                  : "Posts the vendor's bill as a Purchase voucher (party + purchase ledger + GST)."}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                <div><label className="muted">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
                <div><label className="muted">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} style={{ accentColor: "var(--copper)" }} />
                  Only not-yet-exported
                </label>
                <button className="primary" disabled={loading} onClick={load}>{loading ? "Loading…" : "Load"}</button>
              </div>

              {rows && (rows.length === 0 ? <div className="muted">Nothing in this range.</div> : (
                <>
                  <div style={{ display: "flex", gap: 18, marginBottom: 10, flexWrap: "wrap" }}>
                    <div><div className="muted" style={{ fontSize: 11 }}>Records</div><div style={{ fontWeight: 700 }}>{totals.n}</div></div>
                    <div><div className="muted" style={{ fontSize: 11 }}>{showGst ? "Taxable" : "Order value"}</div><div style={{ fontWeight: 700 }}>{inr(totals.sub)}</div></div>
                    {showGst && <div><div className="muted" style={{ fontSize: 11 }}>GST</div><div style={{ fontWeight: 700 }}>{inr(totals.gst)}</div></div>}
                    {showGst && <div><div className="muted" style={{ fontSize: 11 }}>Total</div><div style={{ fontWeight: 700, color: "var(--copper-deep)" }}>{inr(totals.sub + totals.gst)}</div></div>}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="dt-compact">
                      <thead><tr><th>PO</th><th>Date</th><th>Vendor</th>{showGst && <th>GST type</th>}<th className="num">{showGst ? "Taxable" : "Value"}</th>{showGst && <th className="num">GST</th>}<th></th></tr></thead>
                      <tbody>
                        {rows.map(p => {
                          const g = gstParts(p.gstin, s.home_state_code, p.subtotal, s.default_gst_pct || 0);
                          const gtype = g.igst ? "IGST" : (p.gstin ? "CGST+SGST" : "CGST+SGST (no GSTIN)");
                          return (
                            <tr key={p.id}>
                              <td style={{ fontWeight: 600 }}>{p.po_no}</td>
                              <td className="muted">{p.date}</td>
                              <td>{p.vendor}</td>
                              {showGst && <td className="muted">{gtype}</td>}
                              <td className="num">{inr(p.subtotal)}</td>
                              {showGst && <td className="num">{inr(g.cgst + g.sgst + g.igst)}</td>}
                              <td>{p.exported && <span className="badge gray">exported</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button className="primary" onClick={exportXml}>⬇ Download Tally XML</button>
                    <button onClick={markDone}>Mark as exported</button>
                  </div>
                </>
              ))}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
