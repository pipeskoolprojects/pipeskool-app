"use client";
import { useEffect, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { createIndent, editIndent, getIndents } from "@/lib/stock";
import { searchItems } from "@/lib/stock";
import { getSitesList } from "@/lib/mobile";
import { getSession, setCurrentSite } from "@/lib/auth";

const STATUS = {
  open: ["Open", "gray"], quoting: ["Getting quotes", "h"], pending: ["Pending", "gray"],
  approved: ["Approved", "info"], rejected: ["Rejected", "a"],
  po_issued: ["PO issued", "info"], dispatched: ["Dispatched", "h"],
  partially_received: ["Partly delivered", "h"], partial: ["Partly delivered", "h"],
  received: ["Received", "p"], delivered: ["Delivered", "p"], closed: ["Closed", "p"], cancelled: ["Cancelled", "a"],
};
const DELIV = {
  pending: ["⏳ Awaiting confirmation", "gray"], confirmed: ["📅 Delivery date confirmed", "info"],
  delayed: ["⚠ Delayed", "a"], dispatched: ["🚚 Out for delivery", "h"], delivered: ["✓ Delivered", "p"],
};

export default function IndentScreen() {
  if (typeof window !== "undefined" && !getSession()) { window.location.replace("/m"); return null; }
  const [tab, setTab] = useState("track");   // track | new
  const [siteId, setSiteId] = useState(() => { const s0 = getSession(); return Number(s0?.currentSite || s0?.sites?.[0]?.id || 1); });  // shared site (update140)
  const pickSite = id => { const n = Number(id); setSiteId(n); setCurrentSite(n); };   // one selection drives ALL pages
  const [sites, setSites] = useState([]);
  const [indents, setIndents] = useState([]);
  const [cart, setCart] = useState([]);       // {item_id, name, unit, qty}
  const [q, setQ] = useState(""); const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ required_by: "", urgency: "normal", purpose: "" });
  const [editId, setEditId] = useState(null); const [editNo, setEditNo] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { getSitesList().then(setSites); }, []);
  useEffect(() => { getIndents(siteId).then(setIndents); }, [siteId, msg]);
  useEffect(() => { if (q) searchItems(q).then(setItems); else setItems([]); }, [q]);

  function startEdit(d) {
    setCart(d.items.map(it => ({ item_id: it.item_id, name: it.item_name, unit: it.unit, qty: String(it.qty), spec: it.spec || "" })));
    setMeta({ required_by: d.required_by || "", urgency: d.urgency || "normal", purpose: d.note || "" });
    setEditId(d.id); setEditNo(d.indent_no); setTab("new"); setMsg(""); setErr("");
  }
  function cancelEdit() { setEditId(null); setEditNo(""); setCart([]); setMeta({ required_by: "", urgency: "normal", purpose: "" }); setTab("track"); }

  function addToCart(it) {
    if (!cart.find(c => c.item_id != null && c.item_id === it.id))
      setCart(c => [...c, { item_id: it.id, name: it.display_name, unit: it.unit, qty: "", spec: "" }]);
    setQ("");
  }
  const setQty = (i, v) => setCart(c => c.map((r, j) => j === i ? { ...r, qty: v } : r));
  const removeItem = i => setCart(c => c.filter((_, j) => j !== i));

  async function submit() {
    setErr(""); setMsg("");
    const valid = cart.filter(c => Number(c.qty) > 0);
    if (!valid.length) { setErr("Add at least one item with quantity."); return; }
    setBusy(true);
    const sess = getSession();
    const header = { site_id: siteId, required_by: meta.required_by || null, urgency: meta.urgency, note: meta.purpose, raised_by: sess?.id || null };
    const lines = valid.map(c => ({ item_id: c.item_id, item_name: c.name, qty: Number(c.qty), unit: c.unit, purpose: meta.purpose, spec: (c.spec || "").trim() || null }));
    let res = editId ? await editIndent(editId, header, lines) : await createIndent(header, lines);
    if (!res.ok && res.duplicate && confirm(res.error + "\n\nRaise it anyway as a separate indent?")) res = await createIndent({ ...header, allow_duplicate: true }, lines);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(editId ? ("Indent " + editNo + " updated.") : ("Indent " + res.indent_no + " raised — track its status below."));
    setCart([]); setMeta({ required_by: "", urgency: "normal", purpose: "" }); setEditId(null); setEditNo(""); setTab("track");
  }

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div><div className="title">Material indent</div><div className="sub">Raise &amp; track</div></div>
        <select value={siteId} onChange={e => pickSite(e.target.value)} style={{ fontSize: 11, width: "auto" }}>
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
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.indent_no}{d.edited_at && <span className="badge h" style={{ marginLeft: 6 }}>Edited</span>}</div>
                <span className={"badge " + color}>{label}</span>
              </div>
              <div className="dt" style={{ margin: "4px 0 8px" }}>{d.site} · by {d.raised_by || "—"}{d.required_by ? " · need by " + d.required_by : ""}{d.urgency === "urgent" ? " · URGENT" : ""}</div>
              {d.items.map((it, i) => (
                <div key={i} style={{ fontSize: 12.5, padding: "3px 0" }}>• {it.qty} {it.unit} — {it.item_name}</div>
              ))}
              {d.pos && d.pos.map((p, i) => {
                const [dl, dc] = DELIV[p.delivery_status] || DELIV.pending;
                return (
                  <div key={"po" + i} style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span className={"badge " + dc} style={{ fontSize: 11 }}>{dl}</span>
                    {p.expected_delivery && <span className="dt">expected {p.expected_delivery}</span>}
                    <span className="muted" style={{ fontSize: 11 }}>· {p.vendor}</span>
                  </div>
                );
              })}
              {d.canEdit && d.raised_by_id === (getSession()?.id ?? null) && (
                <button style={{ fontSize: 11, marginTop: 8 }} onClick={() => startEdit(d)}>✎ Edit indent</button>
              )}
            </div>
          );
        })}

        {tab === "new" && (
          <>
            {editId && <div className="note amber" style={{ marginBottom: 10 }}>Editing <b>{editNo}</b> — changes save in real time and the indent is flagged as edited. <a onClick={cancelEdit} style={{ color: "var(--copper)", cursor: "pointer", textDecoration: "underline" }}>Cancel</a></div>}
            <div className="m-field">
              <label>{editId ? "Add more items (search master)" : "Add items from master"}</label>
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
              <div key={i} style={{ borderBottom: "1px solid var(--border)", padding: "6px 0", marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1, fontSize: 12.5 }}>{c.name}</div>
                  <input inputMode="decimal" placeholder={c.unit} value={c.qty}
                         onChange={e => setQty(i, e.target.value)} style={{ width: 80 }} />
                  <button style={{ fontSize: 11 }} onClick={() => removeItem(i)}>✕</button>
                </div>
                <input placeholder="Specification (optional, e.g. ASTM A106 Gr B)" value={c.spec || ""}
                       onChange={e => setCart(cc => cc.map((r, j) => j === i ? { ...r, spec: e.target.value } : r))}
                       style={{ width: "100%", marginTop: 4 }} />
              </div>
            ))}
            <div className="m-grid2">
              <div className="m-field"><label>Required by</label><input type="date" value={meta.required_by} onChange={e => setMeta(m => ({ ...m, required_by: e.target.value }))} /></div>
              <div className="m-field"><label>Urgency</label><select value={meta.urgency} onChange={e => setMeta(m => ({ ...m, urgency: e.target.value }))}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></div>
            </div>
            <div className="m-field"><label>Note / purpose (optional)</label><input value={meta.purpose} onChange={e => setMeta(m => ({ ...m, purpose: e.target.value }))} placeholder="e.g. Bay-5 erection" /></div>
            <button className="primary btn-block" disabled={busy} onClick={submit}>{busy ? "Saving…" : editId ? "Update indent" : "Raise indent"}</button>
          </>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
