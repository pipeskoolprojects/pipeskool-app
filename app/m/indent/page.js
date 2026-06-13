"use client";
import { useEffect, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { createIndent, getMyIndents } from "@/lib/purchase";
import { searchItems } from "@/lib/stock";
import { getSitesList } from "@/lib/mobile";

const STATUS = {
  pending: ["Pending", "gray"], approved: ["Approved", "info"], rejected: ["Rejected", "a"],
  po_issued: ["PO issued", "info"], dispatched: ["Dispatched", "h"],
  partial: ["Partly delivered", "h"], delivered: ["Delivered", "p"], cancelled: ["Cancelled", "a"],
};

export default function IndentScreen() {
  const [tab, setTab] = useState("track");   // track | new
  const [siteId, setSiteId] = useState(1);
  const [sites, setSites] = useState([]);
  const [indents, setIndents] = useState([]);
  const [cart, setCart] = useState([]);       // {item_id, name, unit, qty}
  const [q, setQ] = useState(""); const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ required_by: "", urgency: "normal", purpose: "" });
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { getSitesList().then(setSites); }, []);
  useEffect(() => { getMyIndents(siteId).then(setIndents); }, [siteId, msg]);
  useEffect(() => { if (q) searchItems(q).then(setItems); else setItems([]); }, [q]);

  function addToCart(it) {
    if (!cart.find(c => c.item_id === it.id))
      setCart(c => [...c, { item_id: it.id, name: it.display_name, unit: it.unit, qty: "" }]);
    setQ("");
  }
  const setQty = (i, v) => setCart(c => c.map((r, j) => j === i ? { ...r, qty: v } : r));
  const removeItem = i => setCart(c => c.filter((_, j) => j !== i));

  async function submit() {
    setErr(""); setMsg("");
    const valid = cart.filter(c => Number(c.qty) > 0);
    if (!valid.length) { setErr("Add at least one item with quantity."); return; }
    setBusy(true);
    const res = await createIndent({
      site_id: siteId, required_by: meta.required_by || null, urgency: meta.urgency,
      purpose: meta.purpose, raised_by: 1, items: valid.map(c => ({ ...c, qty: Number(c.qty) })),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Indent " + res.no + " raised — track its status below.");
    setCart([]); setMeta({ required_by: "", urgency: "normal", purpose: "" }); setTab("track");
  }

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div><div className="title">Material indent</div><div className="sub">Raise &amp; track</div></div>
        <select value={siteId} onChange={e => setSiteId(Number(e.target.value))} style={{ fontSize: 11, width: "auto" }}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}
        </select>
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — sample indents.</div>}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button className={tab === "track" ? "primary" : ""} onClick={() => setTab("track")} style={{ flex: 1 }}>Track status</button>
          <button className={tab === "new" ? "primary" : ""} onClick={() => setTab("new")} style={{ flex: 1 }}>New indent</button>
        </div>
        {msg && <div className="note green">{msg}</div>}
        {err && <div className="note red">{err}</div>}

        {tab === "track" && indents.map(d => {
          const [label, color] = STATUS[d.status] || ["", "gray"];
          return (
            <div key={d.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.indent_no}</div>
                <span className={"badge " + color}>{label}</span>
              </div>
              <div className="dt" style={{ margin: "4px 0 8px" }}>{d.site} · by {d.required_by || "—"}{d.urgency === "urgent" ? " · URGENT" : ""}</div>
              {d.items.map((it, i) => (
                <div key={i} style={{ fontSize: 12.5, padding: "3px 0" }}>• {it.qty} {it.unit} — {it.name}</div>
              ))}
            </div>
          );
        })}

        {tab === "new" && (
          <>
            <div className="m-field">
              <label>Add items from master</label>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search (e.g. MS 350NB)" />
              {q && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: "auto" }}>
                  {items.map(i => (
                    <div key={i.id} onClick={() => addToCart(i)} style={{ padding: "8px 10px", fontSize: 12.5, borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                      {i.display_name} <span className="muted">· {i.unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {cart.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <div style={{ flex: 1, fontSize: 12.5 }}>{c.name}</div>
                <input inputMode="decimal" placeholder={c.unit} value={c.qty}
                       onChange={e => setQty(i, e.target.value)} style={{ width: 80 }} />
                <button style={{ fontSize: 11 }} onClick={() => removeItem(i)}>✕</button>
              </div>
            ))}
            <div className="m-grid2">
              <div className="m-field"><label>Required by</label><input type="date" value={meta.required_by} onChange={e => setMeta(m => ({ ...m, required_by: e.target.value }))} /></div>
              <div className="m-field"><label>Urgency</label><select value={meta.urgency} onChange={e => setMeta(m => ({ ...m, urgency: e.target.value }))}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></div>
            </div>
            <div className="m-field"><label>Purpose / work area</label><input value={meta.purpose} onChange={e => setMeta(m => ({ ...m, purpose: e.target.value }))} placeholder="e.g. Bay-5 erection" /></div>
            <button className="primary btn-block" disabled={busy} onClick={submit}>{busy ? "Raising…" : "Raise indent"}</button>
          </>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
