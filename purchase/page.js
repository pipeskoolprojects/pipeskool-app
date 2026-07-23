"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import {
  getIndentQueue, reviewIndent, getVendors, getQuotesDemo, getThreeWayMatch,
  getPendingDeliveries, getVendorPerformance, getPriceTrend, inr,
} from "@/lib/purchase";

export default function PurchasePage() {
  const [queue, setQueue] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [match, setMatch] = useState([]);
  const [pending, setPending] = useState([]);
  const [perf, setPerf] = useState([]);
  const [trend, setTrend] = useState([]);
  const [msg, setMsg] = useState("");

  const load = () => {
    getIndentQueue().then(setQueue);
    getVendors().then(setVendors);
    getQuotesDemo().then(setQuotes);
    getThreeWayMatch().then(setMatch);
    getPendingDeliveries().then(setPending);
    getVendorPerformance().then(setPerf);
    getPriceTrend(3).then(setTrend);
  };
  useEffect(load, []);

  async function act(id, status) {
    let note = null;
    if (status === "rejected") { note = prompt("Reason for rejection:"); if (!note) return; }
    await reviewIndent(id, status, note);
    setMsg(status === "approved" ? "Indent approved — ready for enquiry/PO." : "Indent rejected.");
    load();
  }

  const bestQuote = quotes.length ? quotes.reduce((a, b) => (a.rate <= b.rate ? a : b)) : null;
  const maxRate = Math.max(...trend.map(t => t.rate), 1);
  const minRate = Math.min(...trend.map(t => t.rate), 0);

  const matchBadge = f =>
    f === "matched" ? <span className="badge p">Matched</span> :
    f === "short_supply" ? <span className="badge a">⚠ Short supply</span> :
    f === "overbilled" ? <span className="badge a">⚠ Overbilled</span> :
    <span className="badge h">In progress</span>;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Material indent &amp; purchase</h1>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — sample procurement data.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        <div className="panel">
          <h2>Indent approval — with stock check {queue && <span className="badge warn">{queue.length} pending</span>}</h2>
          {!queue ? <div className="muted">Loading…</div> : queue.length === 0 ? <span className="muted">No pending indents.</span> :
            queue.map(ind => (
              <div key={ind.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{ind.indent_no}</span>
                    <span className="muted"> · {ind.site} · by {ind.required_by || "—"}</span>
                    {ind.urgency === "urgent" && <span className="badge a" style={{ marginLeft: 6 }}>Urgent</span>}
                  </div>
                  <div style={{ whiteSpace: "nowrap" }}>
                    <button className="primary" style={{ fontSize: 12, marginRight: 6 }} onClick={() => act(ind.id, "approved")}>Approve</button>
                    <button style={{ fontSize: 12 }} onClick={() => act(ind.id, "rejected")}>Reject</button>
                  </div>
                </div>
                {ind.items.map((it, i) => {
                  const otherTotal = (it.inStockOther || []).reduce((s, o) => s + o.qty, 0);
                  return (
                    <div key={i} style={{ fontSize: 13, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 600 }}>{it.qty} {it.unit} — {it.name}</div>
                      <div style={{ fontSize: 12.5, marginTop: 4 }}>
                        {it.inStockSame > 0 && <span className="badge h" style={{ marginRight: 6 }}>{it.inStockSame} {it.unit} already at this site</span>}
                        {otherTotal > 0 && (it.inStockOther).map((o, j) => (
                          <span key={j} className="badge info" style={{ marginRight: 6 }}>{o.qty} {it.unit} at {o.site} — transfer?</span>
                        ))}
                        {it.inStockSame === 0 && otherTotal === 0 && <span className="muted">No stock elsewhere — full purchase needed</span>}
                      </div>
                      {(it.inStockSame > 0 || otherTotal > 0) && (
                        <div className="muted" style={{ marginTop: 4 }}>
                          Net to purchase after using available stock: <b>{Math.max(0, it.qty - it.inStockSame - otherTotal)} {it.unit}</b>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>Rate comparison (3 quotes) — MS 350NB</h2>
            <table>
              <thead><tr><th>Vendor</th><th className="num">Rate</th><th className="num">Delivery</th><th></th></tr></thead>
              <tbody>
                {quotes.map((q, i) => (
                  <tr key={i} style={bestQuote && q.vendor === bestQuote.vendor ? { background: "var(--green-bg)" } : {}}>
                    <td style={{ fontWeight: 600 }}>{q.vendor}</td>
                    <td className="num">{inr(q.rate)}</td>
                    <td className="num">{q.delivery_days} days</td>
                    <td>{bestQuote && q.vendor === bestQuote.vendor ? <span className="badge p">Lowest</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="primary" style={{ marginTop: 10, fontSize: 12.5 }}
              onClick={() => window.open("/purchase/po", "_blank")}>Generate PO from lowest quote →</button>
          </div>

          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>Price trend — MS 350NB (Rmt)</h2>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "10px 0" }}>
              {trend.map((t, i) => {
                const h = 20 + ((t.rate - minRate) / (maxRate - minRate || 1)) * 90;
                return (
                  <div key={i} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 10, marginBottom: 3 }}>{inr(t.rate)}</div>
                    <div style={{ height: h, background: i === trend.length - 1 ? "var(--blue)" : "#9bb6d8", borderRadius: "4px 4px 0 0" }} />
                    <div style={{ fontSize: 10, marginTop: 3 }} className="muted">{t.date}</div>
                  </div>
                );
              })}
            </div>
            <div className="muted">Rate rose {inr(trend.length ? trend[trend.length - 1].rate - trend[0].rate : 0)} over the period — use this when negotiating.</div>
          </div>
        </div>

        <div className="panel">
          <h2>PO vs GRN vs Bill — 3-way match</h2>
          <table>
            <thead>
              <tr><th>PO</th><th>Vendor</th><th>Item</th>
                <th className="num">PO qty</th><th className="num">Received</th><th className="num">Billed</th><th>Match</th></tr>
            </thead>
            <tbody>
              {match.map((m, i) => (
                <tr key={i} style={m.match_flag !== "matched" ? { background: "#fffaf2" } : {}}>
                  <td style={{ fontWeight: 600 }}>{m.po_no}</td>
                  <td>{m.vendor}</td>
                  <td>{m.display_name}</td>
                  <td className="num">{m.po_qty}</td>
                  <td className="num" style={{ color: m.received_qty < m.po_qty ? "var(--red)" : "inherit" }}>{m.received_qty}</td>
                  <td className="num" style={{ color: m.billed_qty > m.received_qty ? "var(--red)" : "inherit" }}>{m.billed_qty}</td>
                  <td>{matchBadge(m.match_flag)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{ marginTop: 8 }}>
            Short supply = received less than ordered. Overbilled = billed more than received. Both block bill passing until resolved.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>Pending deliveries</h2>
            <table>
              <thead><tr><th>PO</th><th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th>ETA</th></tr></thead>
              <tbody>
                {pending.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{p.po_no}<div className="muted">{p.site}</div></td>
                    <td>{p.item}</td>
                    <td className="num">{p.qty}</td>
                    <td className="num">{p.received}</td>
                    <td className="muted">{p.eta || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>Vendor performance</h2>
            <table>
              <thead><tr><th>Vendor</th><th className="num">Orders</th><th className="num">On-time</th><th className="num">Rejections</th><th className="num">Rating</th></tr></thead>
              <tbody>
                {perf.map((v, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{v.vendor}</td>
                    <td className="num">{v.orders}</td>
                    <td className="num">{v.orders ? Math.round(v.onTime / v.orders * 100) : 0}%</td>
                    <td className="num" style={{ color: v.rejections ? "var(--red)" : "inherit" }}>{v.rejections}</td>
                    <td className="num">⭐ {v.rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h2>Vendor master</h2>
          <table>
            <thead><tr><th>Vendor</th><th>Contact</th><th>GST</th><th>Payment terms</th><th className="num">Rating</th></tr></thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 600 }}>{v.name}</td>
                  <td className="muted">{v.contact}<br />{v.mobile}</td>
                  <td className="muted">{v.gst}</td>
                  <td>{v.terms}</td>
                  <td className="num">⭐ {v.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
