"use client";
import { useEffect, useRef, useState } from "react";
import { ITEM_TYPES, searchItems, addItem, recordTxn, logConsumption, bulkImport, BULK_TEMPLATE_HEADERS } from "@/lib/stock";

const UNITS = ["Nos", "Rmt", "Mtr", "Kg", "Set", "Box", "Litre", "Bag"];

export default function StockEntry({ siteId, userId, onDone }) {
  const [open, setOpen] = useState(null);   // 'item'|'grn'|'issue'|'consume'|'bulk'
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  // new item form
  const [it, setIt] = useState({ item_type: "Pipe", material: "", size: "", item_class: "", make: "", unit: "Rmt", min_stock: "" });
  // movement forms
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [picked, setPicked] = useState(null);
  const [mv, setMv] = useState({ qty: "", rate: "", supplier: "", challan: "", purpose: "" });
  // bulk
  const [bulkRows, setBulkRows] = useState([]); const [bulkResult, setBulkResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { if (q.length >= 2) searchItems(q).then(setResults); else setResults([]); }, [q]);

  const reset = () => { setMsg(""); setErr(""); setMv({ qty: "", rate: "", supplier: "", challan: "", purpose: "" }); setPicked(null); setQ(""); setBulkRows([]); setBulkResult(null); };

  async function saveItem() {
    setErr(""); if (!it.material) { setErr("Material is required."); return; }
    setBusy(true); const res = await addItem({ ...it, min_stock: Number(it.min_stock || 0) }); setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Item added: " + res.name); setIt({ item_type: "Pipe", material: "", size: "", item_class: "", make: "", unit: "Rmt", min_stock: "" });
    onDone?.();
  }
  async function saveMovement(type) {
    setErr(""); if (!picked) { setErr("Pick an item first."); return; }
    if (!mv.qty) { setErr("Quantity required."); return; }
    setBusy(true);
    let res;
    if (type === "consume") res = await logConsumption({ site_id: siteId, item_id: picked.id, qty: Number(mv.qty), purpose: mv.purpose, done_by: userId });
    else res = await recordTxn({ site_id: siteId, item_id: picked.id, txn_type: type, qty: Number(mv.qty), rate: Number(mv.rate || 0), supplier: mv.supplier, challan_no: mv.challan, done_by: userId });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg((type === "grn" ? "Received" : type === "issue" ? "Issued" : "Consumed") + " " + mv.qty + " of " + picked.display_name);
    reset(); onDone?.();
  }

  function downloadTemplate() {
    const csv = BULK_TEMPLATE_HEADERS.join(",") + "\n" +
      "Pipe,MS 350NB Heavy,350mm,Heavy,Jindal,Rmt,100,500,1850,Test Supplier\n" +
      "Fitting,MS Elbow 90deg,350mm,,Local,Nos,20,40,650,Test Supplier";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "pipeskool_stock_import_template.csv"; a.click();
  }
  function onBulkFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(",").map(h => h.trim());
      const rows = lines.slice(1).map(line => {
        const cells = line.split(",");
        const o = {}; headers.forEach((h, i) => o[h] = (cells[i] || "").trim()); return o;
      });
      setBulkRows(rows); setBulkResult(null);
    };
    reader.readAsText(f);
  }
  async function runBulk() {
    setBusy(true); const res = await bulkImport(bulkRows, siteId, userId); setBusy(false);
    setBulkResult(res); onDone?.();
  }

  const btn = (k, label) => <button className={open === k ? "primary" : ""} onClick={() => { setOpen(open === k ? null : k); reset(); }} style={{ fontSize: 13 }}>{label}</button>;

  return (
    <div className="panel">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ marginRight: 6 }}>Add / move stock:</b>
        {btn("grn", "＋ GRN (receive)")}
        {btn("issue", "Issue")}
        {btn("consume", "Consume")}
        {btn("item", "New item")}
        {btn("bulk", "⬆ Bulk import (Excel)")}
      </div>

      {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)", marginTop: 12 }}>{msg}</div>}
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}

      {open === "item" && (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          <div><label className="muted">Type</label><select style={{ width: "100%" }} value={it.item_type} onChange={e => setIt(p => ({ ...p, item_type: e.target.value }))}>{ITEM_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label className="muted">Material *</label><input style={{ width: "100%" }} value={it.material} onChange={e => setIt(p => ({ ...p, material: e.target.value }))} placeholder="MS 350NB Heavy" /></div>
          <div><label className="muted">Size</label><input style={{ width: "100%" }} value={it.size} onChange={e => setIt(p => ({ ...p, size: e.target.value }))} placeholder="350mm" /></div>
          <div><label className="muted">Class</label><input style={{ width: "100%" }} value={it.item_class} onChange={e => setIt(p => ({ ...p, item_class: e.target.value }))} /></div>
          <div><label className="muted">Make</label><input style={{ width: "100%" }} value={it.make} onChange={e => setIt(p => ({ ...p, make: e.target.value }))} /></div>
          <div><label className="muted">Unit</label><select style={{ width: "100%" }} value={it.unit} onChange={e => setIt(p => ({ ...p, unit: e.target.value }))}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
          <div><label className="muted">Min stock</label><input style={{ width: "100%" }} value={it.min_stock} onChange={e => setIt(p => ({ ...p, min_stock: e.target.value }))} /></div>
          <div style={{ display: "flex", alignItems: "flex-end" }}><button className="primary" disabled={busy} onClick={saveItem} style={{ width: "100%" }}>Add item</button></div>
        </div>
      )}

      {(open === "grn" || open === "issue" || open === "consume") && (
        <div style={{ marginTop: 14 }}>
          {!picked ? (
            <div>
              <label className="muted">Search item</label>
              <input style={{ width: "100%", maxWidth: 360 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Type item name…" />
              {results.length > 0 && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 6, maxWidth: 360 }}>
                  {results.map(r => <div key={r.id} onClick={() => setPicked(r)} style={{ padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid var(--border)" }}>{r.display_name} <span className="muted">· {r.unit}</span></div>)}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}><b>{picked.display_name}</b> <button style={{ fontSize: 11, marginLeft: 8 }} onClick={() => setPicked(null)}>change</button></div>
              <div><label className="muted">Quantity *</label><input style={{ width: "100%" }} value={mv.qty} onChange={e => setMv(p => ({ ...p, qty: e.target.value }))} /></div>
              {open === "grn" && <>
                <div><label className="muted">Rate ₹</label><input style={{ width: "100%" }} value={mv.rate} onChange={e => setMv(p => ({ ...p, rate: e.target.value }))} /></div>
                <div><label className="muted">Supplier</label><input style={{ width: "100%" }} value={mv.supplier} onChange={e => setMv(p => ({ ...p, supplier: e.target.value }))} /></div>
                <div><label className="muted">Challan no</label><input style={{ width: "100%" }} value={mv.challan} onChange={e => setMv(p => ({ ...p, challan: e.target.value }))} /></div>
              </>}
              {open === "consume" && <div><label className="muted">Purpose / location</label><input style={{ width: "100%" }} value={mv.purpose} onChange={e => setMv(p => ({ ...p, purpose: e.target.value }))} /></div>}
              <div style={{ display: "flex", alignItems: "flex-end" }}><button className="primary" disabled={busy} onClick={() => saveMovement(open)} style={{ width: "100%" }}>{open === "grn" ? "Record GRN" : open === "issue" ? "Issue" : "Log consumption"}</button></div>
            </div>
          )}
        </div>
      )}

      {open === "bulk" && (
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Step 1: <a onClick={downloadTemplate} style={{ color: "var(--copper)", cursor: "pointer", textDecoration: "underline" }}>Download the Excel template</a>, fill your items in Excel, and save as CSV.
            Step 2: upload it below. Each row creates an item and (if opening_qty &gt; 0) records opening stock.
          </div>
          <button onClick={() => fileRef.current?.click()}>📁 Choose CSV file</button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onBulkFile} />
          {bulkRows.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="muted">{bulkRows.length} rows ready to import.</div>
              <button className="primary" disabled={busy} onClick={runBulk} style={{ marginTop: 8 }}>{busy ? "Importing…" : `Import ${bulkRows.length} items`}</button>
            </div>
          )}
          {bulkResult && (
            <div className="demo-banner" style={{ marginTop: 12, background: bulkResult.ok ? "var(--green-bg)" : "var(--copper-soft)", color: bulkResult.ok ? "var(--green)" : "var(--copper-deep)" }}>
              Imported {bulkResult.created} items, {bulkResult.received} with opening stock.
              {bulkResult.errors.length > 0 && <div style={{ marginTop: 6 }}>{bulkResult.errors.length} issues: {bulkResult.errors.slice(0, 5).join("; ")}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
