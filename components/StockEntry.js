"use client";
import { useEffect, useRef, useState } from "react";
import { ITEM_TYPES, searchItems, addItem, recordTxn, logConsumption, recordMultiGRN, recordReturn, bulkImport, BULK_TEMPLATE_HEADERS } from "@/lib/stock";
import { getSession } from "@/lib/auth";
import { getVendors } from "@/lib/vendors";

const UNITS = ["Nos", "Rmt", "Mtr", "Kg", "Set", "Box", "Litre", "Bag"];

function ItemPicker({ onPick, placeholder = "Search item…" }) {
  const [q, setQ] = useState(""); const [results, setResults] = useState([]);
  useEffect(() => { if (q.length >= 2) searchItems(q).then(setResults); else setResults([]); }, [q]);
  return (
    <div style={{ position: "relative" }}>
      <input style={{ width: "100%" }} value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} />
      {results.length > 0 && (
        <div style={{ position: "absolute", zIndex: 5, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, marginTop: 2, width: "100%", maxHeight: 200, overflowY: "auto" }}>
          {results.map(r => <div key={r.id} onClick={() => { onPick(r); setQ(""); setResults([]); }} style={{ padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: 13 }}>{r.display_name} <span className="muted">· {r.unit}</span></div>)}
        </div>
      )}
    </div>
  );
}

export default function StockEntry({ siteId, userId, onDone }) {
  const [open, setOpen] = useState(null);
  const [sites, setSites] = useState([]);
  const [chosenSite, setChosenSite] = useState(siteId);
  const [vendors, setVendors] = useState([]);
  useEffect(() => { const sess = getSession(); if (sess?.sites?.length) setSites(sess.sites); setChosenSite(siteId); }, [siteId]);
  useEffect(() => { getVendors(false).then(setVendors); }, []);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const [it, setIt] = useState({ item_type: "Pipe", material: "", size: "", item_class: "", make: "", unit: "Rmt", hsn_code: "", min_stock: "" });

  // multi-line GRN
  const [grnHead, setGrnHead] = useState({ vendor: "", challan_no: "", challan_date: "" });
  const [grnLines, setGrnLines] = useState([]);

  // issue/consume single
  const [picked, setPicked] = useState(null);
  const [mv, setMv] = useState({ qty: "", purpose: "" });
  const [retKind, setRetKind] = useState("return_store");
  const [retReason, setRetReason] = useState("");
  const [retVendor, setRetVendor] = useState("");

  const [bulkRows, setBulkRows] = useState([]); const [bulkResult, setBulkResult] = useState(null);
  const fileRef = useRef(null);

  const reset = () => { setMsg(""); setErr(""); setMv({ qty: "", purpose: "" }); setRetKind("return_store"); setRetReason(""); setRetVendor(""); setPicked(null); setGrnLines([]); setGrnHead({ vendor: "", challan_no: "", challan_date: "" }); setBulkRows([]); setBulkResult(null); };

  async function saveItem() {
    setErr(""); if (!it.material) { setErr("Material is required."); return; }
    setBusy(true); const res = await addItem({ ...it, min_stock: Number(it.min_stock || 0) }); setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Item added: " + res.name); setIt({ item_type: "Pipe", material: "", size: "", item_class: "", make: "", unit: "Rmt", hsn_code: "", min_stock: "" }); onDone?.();
  }

  function addGrnLine(item) {
    if (grnLines.some(l => l.item_id === item.id)) return;
    setGrnLines(ls => [...ls, { item_id: item.id, item_name: item.display_name, unit: item.unit, challan_qty: "", received_qty: "" }]);
  }
  function setLine(i, k, v) { setGrnLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l)); }
  function removeLine(i) { setGrnLines(ls => ls.filter((_, idx) => idx !== i)); }

  async function saveGRN() {
    setErr("");
    if (grnLines.length === 0) { setErr("Add at least one item line."); return; }
    if (!grnHead.vendor) { setErr("Enter the vendor / supplier."); return; }
    setBusy(true);
    const res = await recordMultiGRN(
      { site_id: chosenSite, vendor: grnHead.vendor, challan_no: grnHead.challan_no, challan_date: grnHead.challan_date, done_by: userId },
      grnLines.map(l => ({ ...l, challan_qty: Number(l.challan_qty || l.received_qty || 0), received_qty: Number(l.received_qty || l.challan_qty || 0) }))
    );
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(`GRN ${res.grn_no} recorded — ${grnLines.length} item(s)` + (res.discrepancies ? `. ⚠ ${res.discrepancies} discrepancy issue(s) raised.` : "."));
    reset(); onDone?.();
  }

  async function saveMovement(type) {
    setErr(""); if (!picked) { setErr("Pick an item first."); return; }
    if (!mv.qty) { setErr("Quantity required."); return; }
    setBusy(true);
    const res = type === "consume"
      ? await logConsumption({ site_id: siteId, item_id: picked.id, qty: Number(mv.qty), purpose: mv.purpose, done_by: userId })
      : await recordTxn({ site_id: chosenSite, item_id: picked.id, txn_type: type, qty: Number(mv.qty), done_by: userId });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg((type === "issue" ? "Issued " : "Consumed ") + mv.qty + " of " + picked.display_name); reset(); onDone?.();
  }

  async function saveReturn() {
    setErr(""); if (!picked) { setErr("Pick an item first."); return; }
    if (!mv.qty) { setErr("Quantity required."); return; }
    if (retKind === "return_vendor" && !retVendor) { setErr("Select the vendor the material goes back to."); return; }
    setBusy(true);
    const res = await recordReturn({ site_id: chosenSite, item_id: picked.id, qty: Number(mv.qty),
      kind: retKind, reason: retReason, vendor: retKind === "return_vendor" ? retVendor : null, done_by: userId });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg((retKind === "return_store" ? "Returned to store: " : "Returned to vendor: ") + mv.qty + " of " + picked.display_name);
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
      setBulkRows(lines.slice(1).map(line => { const c = line.split(","); const o = {}; headers.forEach((h, i) => o[h] = (c[i] || "").trim()); return o; }));
      setBulkResult(null);
    };
    reader.readAsText(f);
  }
  async function runBulk() { setBusy(true); const res = await bulkImport(bulkRows, chosenSite, userId); setBusy(false); setBulkResult(res); onDone?.(); }

  const btn = (k, label) => <button className={open === k ? "primary" : ""} onClick={() => { setOpen(open === k ? null : k); reset(); }} style={{ fontSize: 13 }}>{label}</button>;

  return (
    <div className="panel">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ marginRight: 6 }}>Add / move stock:</b>
        {sites.length > 0 && (
          <select value={chosenSite || ""} onChange={e => setChosenSite(Number(e.target.value))} style={{ fontSize: 13, marginRight: 6 }} title="Site for this entry">
            {sites.map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}
          </select>
        )}
        {btn("grn", "＋ GRN (receive)")}
        {btn("issue", "Issue")}
        {btn("consume", "Consume")}
        {btn("return", "Return")}
        {btn("item", "New item")}
        {btn("bulk", "⬆ Bulk import (Excel)")}
      </div>

      {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)", marginTop: 12 }}>{msg}</div>}
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}

      {/* ---------- MULTI-ITEM GRN ---------- */}
      {open === "grn" && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 12 }}>
            <div><label className="muted">Vendor / supplier *</label>
              <select style={{ width: "100%" }} value={grnHead.vendor} onChange={e => setGrnHead(p => ({ ...p, vendor: e.target.value }))}>
                <option value="">Select vendor…</option>
                {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
              {vendors.length === 0 && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>No vendors yet — add them in Vendor master.</div>}
            </div>
            <div><label className="muted">Vendor challan no</label><input style={{ width: "100%" }} value={grnHead.challan_no} onChange={e => setGrnHead(p => ({ ...p, challan_no: e.target.value }))} /></div>
            <div><label className="muted">Challan date</label><input type="date" style={{ width: "100%" }} value={grnHead.challan_date} onChange={e => setGrnHead(p => ({ ...p, challan_date: e.target.value }))} /></div>
          </div>
          <label className="muted">Add items from this challan</label>
          <div style={{ maxWidth: 360, marginBottom: 10 }}><ItemPicker onPick={addGrnLine} placeholder="Search material master…" /></div>

          {grnLines.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="dt-compact">
                <thead><tr><th>Item</th><th className="num">Challan qty</th><th className="num">Received qty</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {grnLines.map((l, i) => {
                    const c = Number(l.challan_qty || 0), r = Number(l.received_qty || 0);
                    const diff = (l.received_qty !== "" && l.challan_qty !== "") ? r - c : null;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{l.item_name}<div className="muted">{l.unit}</div></td>
                        <td className="num"><input style={{ width: 80 }} value={l.challan_qty} onChange={e => setLine(i, "challan_qty", e.target.value)} /></td>
                        <td className="num"><input style={{ width: 80 }} value={l.received_qty} onChange={e => setLine(i, "received_qty", e.target.value)} /></td>
                        <td>{diff === null ? <span className="muted">—</span> : diff === 0 ? <span className="badge p">OK</span> : <span className="badge a">{diff > 0 ? "+" : ""}{diff}</span>}</td>
                        <td><button style={{ fontSize: 11 }} onClick={() => removeLine(i)}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="muted" style={{ margin: "8px 0" }}>Enter challan qty and the qty actually received. Any mismatch is flagged and a discrepancy issue is raised automatically.</div>
          <button className="primary" disabled={busy} onClick={saveGRN}>{busy ? "Saving…" : `Record GRN (${grnLines.length} item${grnLines.length === 1 ? "" : "s"})`}</button>
        </div>
      )}

      {/* ---------- NEW ITEM ---------- */}
      {open === "item" && (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
          <div><label className="muted">Type</label><select style={{ width: "100%" }} value={it.item_type} onChange={e => setIt(p => ({ ...p, item_type: e.target.value }))}>{ITEM_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label className="muted">Material *</label><input style={{ width: "100%" }} value={it.material} onChange={e => setIt(p => ({ ...p, material: e.target.value }))} placeholder="MS 350NB Heavy" /></div>
          <div><label className="muted">Size</label><input style={{ width: "100%" }} value={it.size} onChange={e => setIt(p => ({ ...p, size: e.target.value }))} /></div>
          <div><label className="muted">Class</label><input style={{ width: "100%" }} value={it.item_class} onChange={e => setIt(p => ({ ...p, item_class: e.target.value }))} /></div>
          <div><label className="muted">Make</label><input style={{ width: "100%" }} value={it.make} onChange={e => setIt(p => ({ ...p, make: e.target.value }))} /></div>
          <div><label className="muted">Unit</label><select style={{ width: "100%" }} value={it.unit} onChange={e => setIt(p => ({ ...p, unit: e.target.value }))}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
          <div><label className="muted">HSN code</label><input style={{ width: "100%" }} value={it.hsn_code} onChange={e => setIt(p => ({ ...p, hsn_code: e.target.value }))} /></div>
          <div><label className="muted">Min stock</label><input style={{ width: "100%" }} value={it.min_stock} onChange={e => setIt(p => ({ ...p, min_stock: e.target.value }))} /></div>
          <div style={{ display: "flex", alignItems: "flex-end" }}><button className="primary" disabled={busy} onClick={saveItem} style={{ width: "100%" }}>Add item</button></div>
        </div>
      )}

      {/* ---------- ISSUE / CONSUME (single) ---------- */}
      {(open === "issue" || open === "consume") && (
        <div style={{ marginTop: 14 }}>
          {!picked ? (
            <div style={{ maxWidth: 360 }}><label className="muted">Search item</label><ItemPicker onPick={setPicked} /></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}><b>{picked.display_name}</b> <button style={{ fontSize: 11, marginLeft: 8 }} onClick={() => setPicked(null)}>change</button></div>
              <div><label className="muted">Quantity *</label><input style={{ width: "100%" }} value={mv.qty} onChange={e => setMv(p => ({ ...p, qty: e.target.value }))} /></div>
              {open === "consume" && <div><label className="muted">Purpose / location</label><input style={{ width: "100%" }} value={mv.purpose} onChange={e => setMv(p => ({ ...p, purpose: e.target.value }))} /></div>}
              <div style={{ display: "flex", alignItems: "flex-end" }}><button className="primary" disabled={busy} onClick={() => saveMovement(open)} style={{ width: "100%" }}>{open === "issue" ? "Issue" : "Log consumption"}</button></div>
            </div>
          )}
        </div>
      )}

      {/* ---------- RETURN ---------- */}
      {open === "return" && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
              <input type="radio" name="retkind" checked={retKind === "return_store"} onChange={() => setRetKind("return_store")} /> Return to store (surplus from site)
            </label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
              <input type="radio" name="retkind" checked={retKind === "return_vendor"} onChange={() => setRetKind("return_vendor")} /> Return to vendor (wrong / excess)
            </label>
          </div>
          {!picked ? (
            <div style={{ maxWidth: 360 }}><label className="muted">Search item</label><ItemPicker onPick={setPicked} /></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}><b>{picked.display_name}</b> <button style={{ fontSize: 11, marginLeft: 8 }} onClick={() => setPicked(null)}>change</button></div>
              <div><label className="muted">Quantity *</label><input style={{ width: "100%" }} value={mv.qty} onChange={e => setMv(p => ({ ...p, qty: e.target.value }))} /></div>
              {retKind === "return_vendor" && (
                <div><label className="muted">Vendor *</label>
                  <select style={{ width: "100%" }} value={retVendor} onChange={e => setRetVendor(e.target.value)}>
                    <option value="">Select vendor…</option>
                    {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ gridColumn: retKind === "return_vendor" ? "1 / -1" : "auto" }}>
                <label className="muted">{retKind === "return_vendor" ? "Reason (damaged / wrong spec / excess)" : "Note (optional)"}</label>
                <input style={{ width: "100%" }} value={retReason} onChange={e => setRetReason(e.target.value)} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button className="primary" disabled={busy} onClick={saveReturn} style={{ width: "100%" }}>{retKind === "return_store" ? "Return to store" : "Return to vendor"}</button>
              </div>
            </div>
          )}
          <div className="muted" style={{ marginTop: 8 }}>
            {retKind === "return_store" ? "Adds the surplus back to the site store balance." : "Removes the material from site stock (goes back to the vendor)."}
          </div>
        </div>
      )}

      {/* ---------- BULK ---------- */}
      {open === "bulk" && (
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Step 1: <a onClick={downloadTemplate} style={{ color: "var(--copper)", cursor: "pointer", textDecoration: "underline" }}>Download the Excel template</a>, fill your items in Excel, save as CSV.
            Step 2: upload it. Each row creates an item and (if opening_qty &gt; 0) opening stock.
          </div>
          <button onClick={() => fileRef.current?.click()}>📁 Choose CSV file</button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onBulkFile} />
          {bulkRows.length > 0 && <div style={{ marginTop: 12 }}><div className="muted">{bulkRows.length} rows ready.</div><button className="primary" disabled={busy} onClick={runBulk} style={{ marginTop: 8 }}>{busy ? "Importing…" : `Import ${bulkRows.length} items`}</button></div>}
          {bulkResult && <div className="demo-banner" style={{ marginTop: 12, background: bulkResult.ok ? "var(--green-bg)" : "var(--copper-soft)", color: bulkResult.ok ? "var(--green)" : "var(--copper-deep)" }}>Imported {bulkResult.created} items, {bulkResult.received} with opening stock.{bulkResult.errors.length > 0 && <div style={{ marginTop: 6 }}>{bulkResult.errors.length} issues: {bulkResult.errors.slice(0, 5).join("; ")}</div>}</div>}
        </div>
      )}
    </div>
  );
}
