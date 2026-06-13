"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getBalances, getBoqNorms, getRequests, deadStock, lowStock } from "@/lib/stock";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function StockPage() {
  const [site, setSite] = useState("all");
  const [balances, setBalances] = useState(null);
  const [norms, setNorms] = useState([]);
  const [requests, setRequests] = useState([]);

  useEffect(() => { getBalances(site).then(setBalances); }, [site]);
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
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">All sites</option>
              <option value="KEI">KEI Sanand</option>
              <option value="SOUL">SOUL Campus</option>
              <option value="CREEK">The Creek</option>
            </select>
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — sample inventory.</div>}

        <div className="cards">
          <div className="card"><div className="label">Stock value on hand</div><div className="value">{inr(totalValue)}</div></div>
          <div className="card"><div className="label">Items below min stock</div><div className="value" style={{ color: low.length ? "var(--red)" : "var(--green)" }}>{low.length}</div></div>
          <div className="card"><div className="label">Dead / slow-moving</div><div className="value" style={{ color: dead.length ? "var(--amber)" : "var(--green)" }}>{dead.length}</div></div>
          <div className="card"><div className="label">Open material requests</div><div className="value">{requests.length}</div></div>
        </div>

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
          <table>
            <thead><tr><th>Item</th><th>Site</th><th className="num">BOQ qty</th><th className="num">Consumed</th><th className="num">Work done</th><th>Status</th></tr></thead>
            <tbody>
              {norms.map((n, i) => {
                const expected = n.boqQty * n.workPct / 100;
                const ratio = expected ? n.consumed / expected : 0;
                const over = ratio > 1.05;
                return (
                  <tr key={i} style={over ? { background: "#fffaf2" } : {}}>
                    <td style={{ fontWeight: 600 }}>{n.item}</td>
                    <td><span className="badge gray">{n.site}</span></td>
                    <td className="num">{n.boqQty.toLocaleString("en-IN")} {n.unit}</td>
                    <td className="num">{n.consumed.toLocaleString("en-IN")} {n.unit}</td>
                    <td className="num">{n.workPct}%</td>
                    <td>{over
                      ? <span className="badge a">⚠ Over by {Math.round((ratio - 1) * 100)}% — check wastage</span>
                      : <span className="badge p">Within norm</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted" style={{ marginTop: 8 }}>
            Expected consumption = BOQ qty × work-done %. Consuming materially more than that signals wastage, theft, or under-reported progress.
          </div>
        </div>

        <div className="panel">
          <h2>Live stock position &amp; reconciliation</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th><th>Site</th>
                <th className="num">Received</th><th className="num">Issued</th>
                <th className="num">Returned</th><th className="num">Consumed</th>
                <th className="num">Balance</th><th className="num">Rate</th><th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {!balances ? <tr><td colSpan="9" className="muted">Loading…</td></tr> :
                balances.map(b => (
                  <tr key={b.item_id + b.site_code}>
                    <td style={{ fontWeight: 600 }}>{b.display_name}</td>
                    <td><span className="badge gray">{b.site_code}</span></td>
                    <td className="num">{b.received}</td>
                    <td className="num">{b.issued}</td>
                    <td className="num">{b.returned}</td>
                    <td className="num">{b.consumed}</td>
                    <td className="num" style={{ fontWeight: 700, color: b.balance <= b.min_stock ? "var(--red)" : "inherit" }}>{b.balance} {b.unit}</td>
                    <td className="num">{inr(b.rate)}</td>
                    <td className="num">{inr(b.value)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="muted" style={{ marginTop: 8 }}>Reconciliation: Received − Issued − Consumed + Returned = Balance. Any mismatch on physical count exposes theft/loss.</div>
        </div>

        {dead.length > 0 && (
          <div className="panel">
            <h2>Dead / slow-moving stock (no movement 21+ days)</h2>
            <table>
              <thead><tr><th>Item</th><th>Site</th><th className="num">Balance</th><th className="num">Value</th><th>Last movement</th></tr></thead>
              <tbody>
                {dead.map(b => (
                  <tr key={b.item_id + b.site_code}>
                    <td style={{ fontWeight: 600 }}>{b.display_name}</td>
                    <td><span className="badge gray">{b.site_code}</span></td>
                    <td className="num">{b.balance} {b.unit}</td>
                    <td className="num">{inr(b.value)}</td>
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
