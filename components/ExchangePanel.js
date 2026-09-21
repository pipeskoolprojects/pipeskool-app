"use client";
// update404: MATERIAL EXCHANGE panel — opened from the Stock action bar ("⇄ Exchange"), design confirmed 21 Sep.
import { useEffect, useMemo, useState } from "react";
import { searchItems } from "@/lib/stock";
import { inr } from "@/lib/data";
import { getExchangeablePOs, confirmExchange } from "@/lib/exchange";

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function ExchangePanel({ siteId, onDone }) {
  const [pos, setPos] = useState(null); const [poId, setPoId] = useState("");
  const [date, setDate] = useState(today()); const [ret, setRet] = useState({});   // po_item_id -> qty string
  const [rep, setRep] = useState({ item: null, qty: "", rate: "", received_now: true }); const [iq, setIq] = useState(""); const [hits, setHits] = useState([]);
  const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(null);
  useEffect(() => { setPos(null); setPoId(""); setRet({}); getExchangeablePOs("all").then(setPos).catch(e => { setErr(e.message); setPos([]); }); }, []);   // 404c: all sites; the PO decides the site
  useEffect(() => { if (!iq.trim()) { setHits([]); return; } const t = setTimeout(() => searchItems(iq, 12).then(setHits).catch(() => setHits([])), 200); return () => clearTimeout(t); }, [iq]);
  const po = useMemo(() => (pos || []).find(p => String(p.po_id) === String(poId)) || null, [pos, poId]);
  const lines = useMemo(() => po ? po.items.filter(i => Number(ret[i.po_item_id]) > 0).map(i => ({ ...i, return_qty: Number(ret[i.po_item_id]) })) : [], [po, ret]);
  const retVal = lines.reduce((s, l) => s + l.return_qty * l.rate, 0);
  const repVal = (Number(rep.qty) || 0) * (Number(rep.rate) || 0);
  const net = repVal - retVal;
  const bad = lines.find(l => l.return_qty > l.max_return);
  const canConfirm = po && lines.length > 0 && !bad && rep.item && Number(rep.qty) > 0 && rep.rate !== "" && reason.trim();

  async function confirm() {
    if (!window.confirm(`Confirm exchange on ${po.po_no}?\n\nReturn: ${lines.map(l => `${l.item_name} × ${l.return_qty}`).join(", ")}\nReplacement: ${rep.item.display_name} × ${rep.qty} @ ₹${rep.rate}${rep.received_now ? " (received now)" : " (to be received)"}\nNet: ${net >= 0 ? "₹" + inr(net).replace("₹", "") + " extra payable" : "₹" + inr(-net).replace("₹", "") + " credit"}\n\nThis updates stock and the PO. It cannot be undone.`)) return;
    setBusy(true); setErr("");
    const r = await confirmExchange({ site_id: Number(po.site_id), po_id: po.po_id, exchange_date: date, reason: reason.trim(), lines: lines.map(l => ({ po_item_id: l.po_item_id, return_qty: l.return_qty })),
      replacement: { item_id: rep.item.id, item_name: rep.item.display_name, unit: rep.item.unit, qty: Number(rep.qty), rate: Number(rep.rate), received_now: rep.received_now } });
    setBusy(false); if (!r.ok) { setErr(r.error); return; }
    setDone(r); onDone && onDone(`Exchange ${r.exc_no} recorded on ${po.po_no} — net ${r.net_difference >= 0 ? inr(r.net_difference) + " extra payable to vendor" : inr(-r.net_difference) + " credit from vendor"}.`);
  }
  const inp = { width: "100%", boxSizing: "border-box" };
  if (done) return <div style={{ marginTop: 12 }}><div className="note green"><b>✓ {done.exc_no}</b> recorded. PO updated (Exchanged / Replacement badges), stock adjusted, entry in the GRN register. <button style={{ marginLeft: 8, fontSize: 11.5 }} onClick={() => window.open("/stock/exchange-print?ids=" + done.id, "_blank")}>🖨 Exchange note</button></div></div>;
  return (
    <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><span style={{ fontSize: 20, color: "#FF7A1A" }}>⇄</span><div><b>Material exchange</b><div className="muted" style={{ fontSize: 12 }}>Return received material and take a replacement from the same vendor, in one entry.</div></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><label className="muted">Original PO (any site with a GRN)</label>
          <select style={inp} value={poId} onChange={e => { setPoId(e.target.value); setRet({}); }}>
            <option value="">{pos === null ? "Loading…" : pos.length ? "— select —" : "No PO has a GRN yet"}</option>
            {(pos || []).map(p => <option key={p.po_id} value={p.po_id}>{p.po_no} · {p.vendor} · {p.site}</option>)}
          </select></div>
        <div><label className="muted">Exchange date</label><input type="date" style={inp} value={date} onChange={e => setDate(e.target.value)} /></div>
      </div>
      {po && (<>
        <div style={{ background: "var(--gray-bg)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: "6px 10px", fontSize: 11, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}><span>Item being returned</span><span>Received (GRN)</span><span>Return qty</span><span>Net rate</span></div>
          {po.items.map(i => { const on = Number(ret[i.po_item_id]) > 0; const dis = i.max_return <= 0; return (
            <div key={i.po_item_id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: "8px 10px", alignItems: "center", fontSize: 12.5, borderBottom: "1px solid var(--border)", opacity: dis ? .55 : 1 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" disabled={dis} checked={on} onChange={e => setRet(r => ({ ...r, [i.po_item_id]: e.target.checked ? String(i.max_return) : "" }))} />{i.item_name}{i.line_kind === "replacement" && <span className="badge p" style={{ marginLeft: 6 }}>Replacement</span>}</label>
              <span className="muted">{dis ? (i.received ? `${i.received} recd · all returned` : "0 received · pending") : `${i.received} ${i.unit || ""}${i.returned ? ` (−${i.returned} returned)` : ""}`}</span>
              <input style={{ width: 80 }} inputMode="decimal" disabled={dis} placeholder="0" value={ret[i.po_item_id] || ""} onChange={e => setRet(r => ({ ...r, [i.po_item_id]: e.target.value.replace(/[^0-9.]/g, "") }))} />
              <span className="muted">{inr(i.rate)}{Number(ret[i.po_item_id]) > i.max_return && <div style={{ color: "var(--red)", fontSize: 11 }}>max {i.max_return}</div>}</span>
            </div>); })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}><div style={{ flex: 1, height: 1, background: "var(--border)" }} /><span style={{ padding: "4px 12px", background: "#FFF3E8", border: "1px solid #FF7A1A", borderRadius: 20, color: "#9a3412", fontSize: 12, fontWeight: 700 }}>⇄ Replace with</span><div style={{ flex: 1, height: 1, background: "var(--border)" }} /></div>
        <div style={{ background: "var(--gray-bg)", borderRadius: 8, padding: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, alignItems: "end" }}>
            <div><label className="muted">Replacement item (Item Master)</label>
              {rep.item ? <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><b>{rep.item.display_name}</b><span className="muted">· {rep.item.unit}</span><button type="button" style={{ fontSize: 11 }} onClick={() => setRep(r => ({ ...r, item: null }))}>change</button></div>
                : <><input style={inp} placeholder="Search item…" value={iq} onChange={e => setIq(e.target.value)} />{hits.length > 0 && <div style={{ border: "1px solid var(--border)", borderRadius: 8, maxHeight: 160, overflowY: "auto", background: "#fff" }}>{hits.map(h => <div key={h.id} style={{ padding: "6px 10px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)" }} onClick={() => { setRep(r => ({ ...r, item: h })); setIq(""); setHits([]); }}>{h.display_name} <span className="muted">· {h.unit}</span></div>)}</div>}</>}
            </div>
            <div><label className="muted">Qty{rep.item?.unit ? ` (${rep.item.unit})` : ""}</label><input style={inp} inputMode="decimal" value={rep.qty} onChange={e => setRep(r => ({ ...r, qty: e.target.value.replace(/[^0-9.]/g, "") }))} /></div>
            <div><label className="muted">Net rate ₹</label><input style={inp} inputMode="decimal" value={rep.rate} onChange={e => setRep(r => ({ ...r, rate: e.target.value.replace(/[^0-9.]/g, "") }))} /></div>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginTop: 10 }}><input type="checkbox" checked={rep.received_now} onChange={e => setRep(r => ({ ...r, received_now: e.target.checked }))} />Replacement received now (adds to the PO's site stock today). Untick if it arrives later — it stays pending on the PO.</label>
        </div>
        <div style={{ background: "var(--green-bg)", borderRadius: 8, padding: 10, marginTop: 10, fontSize: 12.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Return value {lines.length ? `· ${lines.map(l => `${l.return_qty} × ${inr(l.rate)}`).join(" + ")}` : ""}</span><span style={{ color: "var(--red)", fontWeight: 700 }}>− {inr(retVal)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Replacement value {rep.qty && rep.rate ? `· ${rep.qty} × ${inr(Number(rep.rate))}` : ""}</span><span style={{ color: "var(--green)", fontWeight: 700 }}>+ {inr(repVal)}</span></div>
          <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>Net difference</span><span style={{ color: net >= 0 ? "#BA7517" : "var(--green)" }}>{net >= 0 ? `${inr(net)} extra payable to vendor` : `${inr(-net)} credit from vendor`}</span></div>
        </div>
        <div style={{ marginTop: 10 }}><label className="muted">Reason for exchange *</label><input style={inp} placeholder="Wrong schedule supplied, size mismatch…" value={reason} onChange={e => setReason(e.target.value)} /></div>
      </>)}
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button className="primary" disabled={busy || !canConfirm} onClick={confirm}>{busy ? "Saving…" : "Confirm exchange → update PO"}</button></div>
    </div>
  );
}
