"use client";
import { useEffect, useState } from "react";
import { searchItems, createIndent } from "@/lib/stock";

function ItemPicker({ onPick }) {
  const [q, setQ] = useState(""); const [results, setResults] = useState([]);
  useEffect(() => { if (q.length >= 2) searchItems(q).then(setResults); else setResults([]); }, [q]);
  return (
    <div style={{ position: "relative", maxWidth: 360 }}>
      <input style={{ width: "100%" }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search material master… (or type a new name below)" />
      {results.length > 0 && (
        <div style={{ position: "absolute", zIndex: 5, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, marginTop: 2, width: "100%", maxHeight: 200, overflowY: "auto" }}>
          {results.map(r => <div key={r.id} onClick={() => { onPick(r); setQ(""); setResults([]); }} style={{ padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: 13 }}>{r.display_name} <span className="muted">· {r.unit}</span></div>)}
        </div>
      )}
    </div>
  );
}

export default function IndentForm({ siteId, userId, onDone }) {
  const [show, setShow] = useState(false);
  const [head, setHead] = useState({ required_by: "", urgency: "normal", note: "" });
  const [lines, setLines] = useState([]);
  const [freeName, setFreeName] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  function addFromMaster(item) {
    if (lines.some(l => l.item_id === item.id)) return;
    setLines(ls => [...ls, { item_id: item.id, item_name: item.display_name, unit: item.unit, qty: "", purpose: "" }]);
  }
  function addFreeText() {
    if (!freeName.trim()) return;
    setLines(ls => [...ls, { item_id: null, item_name: freeName.trim(), unit: "", qty: "", purpose: "" }]);
    setFreeName("");
  }
  const setLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const removeLine = i => setLines(ls => ls.filter((_, idx) => idx !== i));

  async function submit() {
    setErr("");
    if (lines.length === 0) { setErr("Add at least one item."); return; }
    if (lines.some(l => !l.qty)) { setErr("Enter quantity for every item."); return; }
    setBusy(true);
    const res = await createIndent({ site_id: siteId, raised_by: userId, ...head }, lines);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Material request " + res.indent_no + " raised with " + lines.length + " item(s). Sent to office for rate enquiry.");
    setLines([]); setHead({ required_by: "", urgency: "normal", note: "" }); setShow(false); onDone?.();
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ marginBottom: 0 }}>Raise material request (indent)</h2>
        <button className={show ? "" : "primary"} onClick={() => { setShow(s => !s); setMsg(""); setErr(""); }}>{show ? "Cancel" : "＋ New request"}</button>
      </div>
      {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)", marginTop: 12 }}>{msg}</div>}

      {show && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 12 }}>
            <div><label className="muted">Required by</label><input type="date" style={{ width: "100%" }} value={head.required_by} onChange={e => setHead(p => ({ ...p, required_by: e.target.value }))} /></div>
            <div><label className="muted">Urgency</label><select style={{ width: "100%" }} value={head.urgency} onChange={e => setHead(p => ({ ...p, urgency: e.target.value }))}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></div>
            <div style={{ gridColumn: "span 2" }}><label className="muted">Note</label><input style={{ width: "100%" }} value={head.note} onChange={e => setHead(p => ({ ...p, note: e.target.value }))} placeholder="Any instruction for office" /></div>
          </div>

          <label className="muted">Add items</label>
          <ItemPicker onPick={addFromMaster} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, maxWidth: 360 }}>
            <input style={{ flex: 1 }} value={freeName} onChange={e => setFreeName(e.target.value)} placeholder="…or type an item not in master" />
            <button onClick={addFreeText}>Add</button>
          </div>

          {lines.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="dt-compact">
                <thead><tr><th>Item</th><th className="num">Qty</th><th>Unit</th><th>Purpose</th><th></th></tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{l.item_name}{!l.item_id && <span className="badge warn" style={{ marginLeft: 6 }}>new</span>}</td>
                      <td className="num"><input style={{ width: 70 }} value={l.qty} onChange={e => setLine(i, "qty", e.target.value)} /></td>
                      <td><input style={{ width: 60 }} value={l.unit} onChange={e => setLine(i, "unit", e.target.value)} /></td>
                      <td><input style={{ width: 140 }} value={l.purpose} onChange={e => setLine(i, "purpose", e.target.value)} /></td>
                      <td><button style={{ fontSize: 11 }} onClick={() => removeLine(i)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
          <button className="primary" disabled={busy} onClick={submit} style={{ marginTop: 12 }}>{busy ? "Sending…" : `Submit request (${lines.length} item${lines.length === 1 ? "" : "s"})`}</button>
        </div>
      )}
    </div>
  );
}
