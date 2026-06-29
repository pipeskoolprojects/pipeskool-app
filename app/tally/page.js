"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import {
  getTallySettings, saveTallySettings, getPurchasesForTally, markPurchasesExported,
  buildPurchaseXml, gstParts,
} from "@/lib/tally";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const todayLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA"); }

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
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayLocal());
  const [onlyNew, setOnlyNew] = useState(true);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getTallySettings().then(setS); }, []);
  const set = (k, v) => setS(x => ({ ...x, [k]: v }));

  async function save() {
    setSavingS(true); const r = await saveTallySettings(s); setSavingS(false);
    setMsg(r.ok ? "Tally settings saved." : ""); setErr(r.ok ? "" : r.error);
  }

  async function load() {
    setLoading(true); setMsg(""); setErr("");
    const data = await getPurchasesForTally(from, to, onlyNew);
    setRows(data); setLoading(false);
  }

  const totals = (rows || []).reduce((t, p) => {
    const g = gstParts(p.gstin, s?.home_state_code, p.subtotal, s?.default_gst_pct || 0);
    t.sub += p.subtotal; t.gst += g.cgst + g.sgst + g.igst; t.n += 1; return t;
  }, { sub: 0, gst: 0, n: 0 });

  function exportXml() {
    if (!rows || !rows.length) { setErr("Load purchases first."); return; }
    const xml = buildPurchaseXml(rows, s);
    downloadXml(xml, `Tally_Purchases_${from}_to_${to}.xml`);
    setMsg("XML downloaded. Import it in TallyPrime: Gateway → Import → Vouchers → select this file.");
  }

  async function markDone() {
    if (!rows || !rows.length) return;
    const r = await markPurchasesExported(rows.map(p => p.id));
    if (r.ok) { setMsg("Marked " + rows.length + " purchase(s) as exported."); load(); }
    else setErr(r.error);
  }

  if (!s) return <div className="layout"><Sidebar /><main className="main"><div className="muted">Loading…</div></main></div>;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Tally export</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — Tally export needs a live database.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

        {/* settings / ledger mapping */}
        <div className="panel">
          <h2>Ledger mapping</h2>
          <div className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>These names must match your TallyPrime ledgers exactly, or the import will create wrong/duplicate ledgers. Ask your accountant for the exact names.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {LEDGER_FIELDS.map(([k, label]) => (
              <div key={k}><label className="muted">{label}</label><input style={{ width: "100%" }} value={s[k] || ""} onChange={e => set(k, e.target.value)} /></div>
            ))}
            <div><label className="muted">Home state code (Gujarat = 24)</label><input style={{ width: "100%" }} value={s.home_state_code || ""} onChange={e => set("home_state_code", e.target.value)} /></div>
            <div><label className="muted">Default GST %</label><input style={{ width: "100%" }} value={s.default_gst_pct ?? ""} onChange={e => set("default_gst_pct", e.target.value)} /></div>
            <div><label className="muted">Purchase voucher type</label><input style={{ width: "100%" }} value={s.voucher_purchase || ""} onChange={e => set("voucher_purchase", e.target.value)} /></div>
          </div>
          <label style={{ display: "inline-flex", gap: 7, alignItems: "center", marginTop: 12, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={!!s.auto_create_party} onChange={e => set("auto_create_party", e.target.checked)} style={{ accentColor: "var(--copper)" }} />
            Auto-create vendor ledgers in Tally if they don't exist (under Sundry Creditors)
          </label>
          <div style={{ marginTop: 14 }}><button className="primary" disabled={savingS} onClick={save}>{savingS ? "Saving…" : "Save mapping"}</button></div>
        </div>

        {/* purchase export */}
        <div className="panel">
          <h2>Purchase vouchers → Tally XML</h2>
          <div className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>Posts each issued PO as a Purchase voucher (party + purchase ledger + GST). Stock/inventory is handled separately by the stock-journal export.</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
            <div><label className="muted">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div><label className="muted">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} style={{ accentColor: "var(--copper)" }} />
              Only not-yet-exported
            </label>
            <button className="primary" disabled={loading} onClick={load}>{loading ? "Loading…" : "Load purchases"}</button>
          </div>

          {rows && (rows.length === 0 ? <div className="muted">No purchases in this range.</div> : (
            <>
              <div style={{ display: "flex", gap: 18, marginBottom: 10, flexWrap: "wrap" }}>
                <div><div className="muted" style={{ fontSize: 11 }}>Vouchers</div><div style={{ fontWeight: 700 }}>{totals.n}</div></div>
                <div><div className="muted" style={{ fontSize: 11 }}>Taxable</div><div style={{ fontWeight: 700 }}>{inr(totals.sub)}</div></div>
                <div><div className="muted" style={{ fontSize: 11 }}>GST</div><div style={{ fontWeight: 700 }}>{inr(totals.gst)}</div></div>
                <div><div className="muted" style={{ fontSize: 11 }}>Total</div><div style={{ fontWeight: 700, color: "var(--copper-deep)" }}>{inr(totals.sub + totals.gst)}</div></div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="dt-compact">
                  <thead><tr><th>PO</th><th>Date</th><th>Vendor</th><th>GST type</th><th className="num">Taxable</th><th className="num">GST</th><th></th></tr></thead>
                  <tbody>
                    {rows.map(p => {
                      const g = gstParts(p.gstin, s.home_state_code, p.subtotal, s.default_gst_pct || 0);
                      const gtype = g.igst ? "IGST" : (p.gstin ? "CGST+SGST" : "CGST+SGST (no GSTIN)");
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.po_no}</td>
                          <td className="muted">{p.date}</td>
                          <td>{p.vendor}</td>
                          <td className="muted">{gtype}</td>
                          <td className="num">{inr(p.subtotal)}</td>
                          <td className="num">{inr(g.cgst + g.sgst + g.igst)}</td>
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
        </div>
      </main>
    </div>
  );
}
