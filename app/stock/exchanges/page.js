"use client";
// update404: EXCHANGE REGISTER — every material exchange (return + replacement) with net difference.
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { getSites, inr } from "@/lib/data";
import { getExchanges } from "@/lib/exchange";

const dmy = k => k ? String(k).split("-").reverse().join("/") : "";
export default function ExchangesPage() {
  const [rows, setRows] = useState(null); const [sites, setSites] = useState([]); const [site, setSite] = useState("all"); const [q, setQ] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { if (!getSession()) { window.location.replace("/login"); return; } getSites().then(r => setSites(Array.isArray(r) ? r : (r?.data || []))); }, []);
  useEffect(() => { setRows(null); getExchanges(site).then(setRows).catch(e => { setErr(e.message); setRows([]); }); }, [site]);
  const shown = useMemo(() => (rows || []).filter(r => !q.trim() || [r.exc_no, r.po_no, r.vendor_name, r.replacement_item_name, ...r.lines.map(l => l.item_name)].join(" ").toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);
  return (
    <div className="layout"><Sidebar /><main className="main">
      <div className="page-head"><div><h1>Material exchanges</h1><div className="muted" style={{ fontSize: 12.5 }}>Return + replacement from the same vendor in one entry. Raised from Stock → ⇄ Exchange; each one also appears in the GRN register.</div></div><a href="/stock"><button>← Stock</button></a></div>
      {err && <div className="note red">{err}</div>}
      <div className="panel">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <select value={site} onChange={e => setSite(e.target.value)}><option value="all">Site: all</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <input placeholder="Search ref, PO, vendor, item…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        </div>
        <div className="dt-scroll"><table className="dt-compact" style={{ width: "100%" }}>
          <thead><tr><th>Exchange Ref</th><th>Date</th><th>Original PO</th><th>Vendor</th><th>Returned item</th><th className="num">Returned qty</th><th>Replacement item</th><th className="num">Replacement qty</th><th className="num">Net difference</th><th>Done by</th><th></th></tr></thead>
          <tbody>{rows === null ? <tr><td colSpan={11} className="muted">Loading…</td></tr> : shown.length === 0 ? <tr><td colSpan={11} className="muted">No exchanges yet.</td></tr> : shown.map(r => (
            <tr key={r.id}><td style={{ color: "#FF7A1A", fontWeight: 700, whiteSpace: "nowrap" }}>{r.exc_no}</td><td>{dmy(r.exchange_date)}</td><td>{r.po_no}</td><td>{r.vendor_name}</td>
              <td>{r.lines.map(l => <div key={l.id}>{l.item_name}</div>)}</td><td className="num">{r.lines.map(l => <div key={l.id}>{Number(l.return_qty)} {l.unit || ""}</div>)}</td>
              <td>{r.replacement_item_name}{!r.replacement_received && <span className="badge warn" style={{ marginLeft: 6 }}>to receive</span>}</td><td className="num">{Number(r.replacement_qty)} {r.replacement_unit || ""}</td>
              <td className="num" style={{ fontWeight: 700, color: Number(r.net_difference) >= 0 ? "#BA7517" : "var(--green)" }}>{r.net_difference == null ? <span className="muted">—</span> : Number(r.net_difference) >= 0 ? inr(r.net_difference) + " payable" : inr(-r.net_difference) + " credit"}</td>
              <td>{r.done_by_name}<div className="muted" style={{ fontSize: 10.5 }} title={r.reason}>{r.reason?.slice(0, 40)}{r.reason?.length > 40 ? "…" : ""}</div></td>
              <td><button style={{ fontSize: 11.5 }} onClick={() => window.open("/stock/exchange-print?ids=" + r.id, "_blank")}>🖨</button></td></tr>))}</tbody>
        </table></div>
      </div>
    </main></div>);
}
