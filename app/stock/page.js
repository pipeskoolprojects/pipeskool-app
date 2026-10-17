"use client";
import { useCanViewPrices } from "@/lib/prices";   // update463
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { isDemo } from "@/lib/supabase";
import { setStockRate, getBalances, getBoqNorms, getRequests, deadStock, lowStock, getHoldings } from "@/lib/stock";
import StockEntry from "@/components/StockEntry";
import IndentForm from "@/components/IndentForm";
import { getSession, can } from "@/lib/auth";
import { getSites } from "@/lib/data";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function StockPage() {
  const [site, setSite] = useState("all");
  useEffect(() => {   // update206: project scoping — ?site= from a project workspace pre-filters this page
    try { const sp = new URLSearchParams(window.location.search).get("site"); if (sp) setSite(String(sp)); } catch {}
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [balances, setBalances] = useState(null);
  const [norms, setNorms] = useState([]);
  const [requests, setRequests] = useState([]);
  const [session, setSession] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [holdings, setHoldings] = useState([]);
  const [siteList, setSiteList] = useState([]);   // update184: real site master (was 3 hard-coded)
  const canPx = useCanViewPrices();   // update463: stock value / rate only for price viewers

  useEffect(() => { setSession(getSession()); getSites().then(setSiteList); }, []);
  useEffect(() => { getBalances(site).then(setBalances); }, [site, reloadKey]);
  const canSetRate = ["director", "accountant", "it_executive"].includes(session?.role); const load = () => getBalances(site).then(setBalances);   // update442
  useEffect(() => { getHoldings(site === "all" ? undefined : undefined).then(rows => setHoldings(site === "all" ? rows : rows)); }, [site, reloadKey]);
  useEffect(() => { getBoqNorms().then(setNorms); getRequests().then(setRequests); }, []);

  const low = balances ? lowStock(balances) : [];
  const dead = balances ? deadStock(balances) : [];
  const totalValue = (balances || []).reduce((s, b) => s + b.value, 0);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Material stock &amp; inventory</h1>
          <div className="filters">
            <a href="/stock/grn"><button style={{ fontSize: 12 }}>📋 GRN Register</button></a>
            <a href="/stock/exchanges"><button style={{ fontSize: 12 }}>⇄ Exchanges</button></a>{/* update404 */}
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">All sites</option>
              {siteList.map(s => <option key={s.id} value={s.code}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {session && can(session, "stock", "create", site !== "all" ? Number(site) : undefined) && (
          <StockEntry siteId={site !== "all" ? Number(site) : (session.currentSite || 1)} userId={session.id} onDone={() => setReloadKey(k => k + 1)} />
        )}
        {session && can(session, "indent", "create", site !== "all" ? Number(site) : undefined) && (
          <IndentForm siteId={site !== "all" ? Number(site) : (session.currentSite || 1)} userId={session.id} onDone={() => setReloadKey(k => k + 1)} />
        )}

        {isDemo && <div className="demo-banner">Demo mode — sample inventory.</div>}

        <div className="cards">
          {canPx === true && <div className="card"><div className="label">Stock value on hand</div><div className="value">{inr(totalValue)}</div></div>}
          <div className="card"><div className="label">Items below min stock</div><div className="value" style={{ color: low.length ? "var(--red)" : "var(--green)" }}>{low.length}</div></div>
          <div className="card"><div className="label">Dead / slow-moving</div><div className="value" style={{ color: dead.length ? "var(--amber)" : "var(--green)" }}>{dead.length}</div></div>
          <div className="card"><div className="label">Open material requests</div><div className="value">{requests.length}</div></div>
        </div>

        <div className="panel">
          <h2>Live stock position &amp; reconciliation</h2>
          {!balances ? <div className="muted">Loading…</div> :
            <DataTable exportName="stock_position" rows={balances.map(b => ({ ...b, key: b.item_id + b.site_code }))}
              columns={[
                { key: "display_name", label: "Item", filter: "search", render: b => <span style={{ fontWeight: 600 }}>{b.display_name}</span> },
                { key: "item_type", label: "Type", filter: "select" },
                { key: "site_code", label: "Site", filter: "select", render: b => <span className="badge gray">{b.site_code}</span> },
                { key: "received", label: "Received", type: "num" },
                { key: "issued", label: "Issued", type: "num" },
                { key: "returned", label: "Ret→store", type: "num" },
                { key: "returned_vendor", label: "Ret→vendor", type: "num" },
                { key: "consumed", label: "Consumed", type: "num" },
                { key: "with_site", label: "With site", type: "num", render: b => b.with_site > 0 ? <span style={{ color: "var(--amber)", fontWeight: 600 }}>{b.with_site}</span> : "0", exportValue: b => b.with_site },
                { key: "balance", label: "Balance", type: "num", render: b => <span style={{ fontWeight: 700, color: b.balance <= b.min_stock ? "var(--red)" : "inherit" }}>{b.balance} {b.unit}</span>, exportValue: b => b.balance },
                ...(canPx === true ? [{ key: "rate", label: "Rate", type: "num", render: b => b.rate > 0 ? <span title="Weighted average of received batches (Σ qty × PO net rate ÷ Σ qty)">{inr(b.rate)}</span> : <span style={{ whiteSpace: "nowrap" }}><span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 999, background: "#F3F4F6", color: "#6B7280" }} title="No PO rate on any received batch (opening stock / manual entry)">Rate not set</span>{canSetRate && <button type="button" style={{ fontSize: 10.5, marginLeft: 4, padding: "0 6px" }} onClick={async () => { const v = window.prompt(`Rate for ${b.display_name} at ${b.site_name} (₹ per ${b.unit}) — applies to its unpriced received lines, logged:`); if (!v) return; const r = await setStockRate(b.item_id, b.site_id, v); if (!r.ok) { window.alert(r.error); return; } load(); }}>Set rate</button>}</span>, exportValue: b => b.rate },   // update442
                { key: "value", label: "Value", type: "num", render: b => inr(b.value), exportValue: b => b.value }] : []),
              ]} />}
          <div className="muted" style={{ marginTop: 8 }}>Reconciliation: Received − Issued − Consumed + Returned = Balance.</div>
        </div>

        {holdings.length > 0 && (
          <div className="panel">
            <h2>Pending settlements — material with workers {holdings.some(h => h.days >= 1) && <span className="badge a">{holdings.filter(h => h.days >= 1).length} overdue</span>}</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="dt-compact">
                <thead><tr><th>Worker</th><th>Item</th><th>Site</th><th className="num">Issued</th><th className="num">Used</th><th className="num">Returned</th><th className="num">Still held</th><th className="num">Days</th></tr></thead>
                <tbody>
                  {holdings.map((h, i) => (
                    <tr key={i} style={h.days >= 1 ? { background: "#fff7f2" } : {}}>
                      <td style={{ fontWeight: 600 }}>{h.worker}</td>
                      <td>{h.item}</td>
                      <td><span className="badge gray">{h.site_code}</span></td>
                      <td className="num">{h.issued}</td>
                      <td className="num">{h.used}</td>
                      <td className="num">{h.returned}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{h.held} {h.unit}</td>
                      <td className="num">{h.days >= 1 ? <span className="badge a">{h.days}d</span> : <span className="badge gray">today</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>Material issued to workers but not yet settled. Use Add/move stock → Settle to record used &amp; returned. Rows turn amber after 1 day.</div>
          </div>
        )}

        {low.length > 0 && (
          <div className="panel">
            <h2>⚠ Low stock — auto-suggest indent</h2>
            <table>
              <thead><tr><th>Item</th><th>Site</th><th className="num">Balance</th><th className="num">Min</th><th className="num">Suggest order</th></tr></thead>
              <tbody>
                {low.map(b => (
                  <tr key={b.item_id + b.site_code}>
                    <td style={{ fontWeight: 600 }}>{b.display_name}</td>
                    <td><span className="badge gray">{b.site_code}</span></td>
                    <td className="num" style={{ color: "var(--red)" }}>{b.balance} {b.unit}</td>
                    <td className="num">{b.min_stock}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{Math.max(0, Math.ceil(b.min_stock * 1.5 - b.balance))} {b.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="panel">
          <h2>Consumption vs BOQ norm</h2>
          {(!norms || norms.length === 0) ? (
            <div className="muted" style={{ padding: "12px 0" }}>
              Consumption tracking will activate once BOQ norms are mapped to stock items (planned with the Client Receivables work). Until then, actual consumption is visible per item in the stock position above (Consumed column).
            </div>
          ) : (() => {
            const THRESHOLD = 15; // % over expected before flagged red
            const rows = norms.map((n, i) => {
              const expected = Math.round(n.boqQty * n.workPct / 100);
              const variance = expected ? Math.round((n.consumed - expected) / expected * 100) : 0;
              return { id: i, item: n.item, site: n.site, unit: n.unit, boqQty: n.boqQty,
                workPct: n.workPct, expected, consumed: n.consumed, variance,
                flag: variance > THRESHOLD ? "over" : (variance < -THRESHOLD ? "under" : "ok") };
            }).sort((a, b) => b.variance - a.variance); // worst (most over) first

            const VarBar = ({ v }) => {
              const mag = Math.min(Math.abs(v), 60);
              const color = v > THRESHOLD ? "var(--red)" : v < -THRESHOLD ? "var(--amber)" : "var(--green)";
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 130 }}>
                  <div style={{ position: "relative", width: 90, height: 8, background: "#eee", borderRadius: 4 }}>
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#bbb" }} />
                    <div style={{ position: "absolute", top: 0, height: 8, borderRadius: 4, background: color,
                      width: (mag / 60 * 45) + "%", left: v >= 0 ? "50%" : undefined, right: v < 0 ? "50%" : undefined }} />
                  </div>
                  <span style={{ color, fontWeight: 600, fontSize: 12 }}>{v > 0 ? "+" : ""}{v}%</span>
                </div>
              );
            };

            const columns = [
              { key: "item", label: "Item", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.item}</span> },
              { key: "site", label: "Site", filter: "select", render: r => <span className="badge gray">{r.site}</span> },
              { key: "boqQty", label: "BOQ qty", type: "num", render: r => r.boqQty.toLocaleString("en-IN") + " " + r.unit, exportValue: r => r.boqQty },
              { key: "workPct", label: "Work done", type: "num", render: r => r.workPct + "%", exportValue: r => r.workPct },
              { key: "expected", label: "Expected use", type: "num", render: r => r.expected.toLocaleString("en-IN") + " " + r.unit, exportValue: r => r.expected },
              { key: "consumed", label: "Actual used", type: "num", render: r => r.consumed.toLocaleString("en-IN") + " " + r.unit, exportValue: r => r.consumed },
              { key: "variance", label: "Variance", type: "num", render: r => <VarBar v={r.variance} />, exportValue: r => r.variance + "%" },
              { key: "flag", label: "Status", filter: "select",
                optionLabel: o => o === "over" ? "Over (check wastage)" : o === "under" ? "Under" : "Within norm",
                render: r => r.flag === "over" ? <span className="badge a">⚠ Check wastage</span>
                  : r.flag === "under" ? <span className="badge h">Under norm</span>
                  : <span className="badge p">Within norm</span>,
                exportValue: r => r.flag },
            ];
            return <DataTable columns={columns} rows={rows} exportName="consumption_vs_boq" />;
          })()}
          <div className="muted" style={{ marginTop: 8 }}>
            Expected use = BOQ qty × work-done %. <b>Variance over +15%</b> is flagged red (possible wastage, theft, or under-reported progress). Worst items shown first.
          </div>
        </div>

        {dead.length > 0 && (
          <div className="panel">
            <h2>Dead / slow-moving stock (no movement 21+ days)</h2>
            <table>
              <thead><tr><th>Item</th><th>Site</th><th className="num">Balance</th>{canPx === true && <th className="num">Value</th>}<th>Last movement</th></tr></thead>
              <tbody>
                {dead.map(b => (
                  <tr key={b.item_id + b.site_code}>
                    <td style={{ fontWeight: 600 }}>{b.display_name}</td>
                    <td><span className="badge gray">{b.site_code}</span></td>
                    <td className="num">{b.balance} {b.unit}</td>
                    {canPx === true && <td className="num">{inr(b.value)}</td>}
                    <td className="muted">{b.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ marginTop: 8 }}>Idle material — consider transferring to another site or returning to vendor.</div>
          </div>
        )}

        {requests.length > 0 && (
          <div className="panel">
            <h2>Open material requests (from sites)</h2>
            <table>
              <thead><tr><th>Site</th><th>Item</th><th className="num">Qty</th><th>Required by</th><th>Urgency</th></tr></thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td>{r.site}</td>
                    <td style={{ fontWeight: 600 }}>{r.item}</td>
                    <td className="num">{r.qty}</td>
                    <td className="muted">{r.required_by}</td>
                    <td>{r.urgency === "urgent" ? <span className="badge a">Urgent</span> : <span className="badge gray">Normal</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ marginTop: 8 }}>These flow into Module 5 (Indent &amp; Purchase) for PO processing.</div>
          </div>
        )}
      </main>
    </div>
  );
}
