"use client";
import { useEffect, useRef, useState } from "react";
import { ITEM_TYPES, searchItems, addItem, recordTxn, logConsumption, recordMultiGRN, recordReturn, issueToWorker, issueMultiToWorker, getWorkerList, getHoldings, settleHolding, bulkImport, BULK_TEMPLATE_HEADERS } from "@/lib/stock";
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
  const siteCode = (sites.find(x => x.id === chosenSite)?.name || "").split(",")[0];
  useEffect(() => { if (chosenSite) { getWorkerList(undefined).then(setWorkers); refreshHoldings(); } }, [chosenSite]);
  function refreshHoldings() { getHoldings(undefined).then(rows => setHoldings(rows.filter(r => r.site_id === chosenSite))); }
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
  const [workers, setWorkers] = useState([]);
  const [issWorker, setIssWorker] = useState("");
  const [holdings, setHoldings] = useState([]);
  const [settleSel, setSettleSel] = useState(null);
  const [settleVals, setSettleVals] = useState({ used: "", returned: "", purpose: "" });

  const [bulkRows, setBulkRows] = useState([]); const [bulkResult, setBulkResult] = useState(null);
  const fileRef = useRef(null);

  const reset = () => { setMsg(""); setErr(""); setMv({ qty: "", purpose: "" }); setRetKind("return_store"); setRetReason(""); setRetVendor(""); setPicked(null); setGrnLines([]); setGrnHead({ vendor: "", challan_no: "", challan_date: "" }); setIssLines([]); setBulkRows([]); setBulkResult(null); };

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
  // multi-item issue lines (update141) — same pattern as GRN
  const [issLines, setIssLines] = useState([]);
  function addIssLine(item) {
    if (issLines.some(l => l.item_id === item.id)) return;   // one row per item
    setIssLines(ls => [...ls, { item_id: item.id, item_name: item.display_name, unit: item.unit, qty: "", remarks: "" }]);
  }
  function setIssLine(i, k, v) { setIssLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l)); }
  function removeIssLine(i) { setIssLines(ls => ls.filter((_, idx) => idx !== i)); }

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

  async function saveIssue() {
    setErr("");
    if (!issWorker) { setErr("Select the worker."); return; }
    if (issLines.length === 0) { setErr("Add at least one item line."); return; }
    const bad = issLines.find(l => !l.qty || isNaN(Number(l.qty)) || Number(l.qty) <= 0);
    if (bad) { setErr("Enter a valid quantity for " + bad.item_name + "."); return; }
    const w = workers.find(x => String(x.id) === String(issWorker));
    setBusy(true);
    const res = await issueMultiToWorker({ site_id: chosenSite, worker_id: w?.id,
      worker_name: w?.name || "", lines: issLines, done_by: userId });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Issued " + res.count + " item" + (res.count === 1 ? "" : "s") + " to " + (w?.name || "worker") + " — Issue ID " + res.issue_ref);
    setIssLines([]); setIssWorker(""); refreshHoldings(); onDone?.();
  }

  async function saveSettle() {
    setErr("");
    const u = Number(settleVals.used || 0), r = Number(settleVals.returned || 0);
    if (u + r <= 0) { setErr("Enter used and/or returned quantity."); return; }
    if (u + r > settleSel.held) { setErr("Used + returned cannot exceed held quantity (" + settleSel.held + ")."); return; }
    setBusy(true);
    const res = await settleHolding({ site_id: settleSel.site_id, item_id: settleSel.item_id,
      worker_id: settleSel.worker_id, worker_name: settleSel.worker, used: u, returned: r,
      purpose: settleVals.purpose, done_by: userId });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Settled " + settleSel.worker + " — used " + u + ", returned " + r);
    setSettleSel(null); refreshHoldings(); onDone?.();
  }

  async function saveReturnVendor() {
    setErr(""); if (!picked) { setErr("Pick an item first."); return; }
    if (!mv.qty) { setErr("Quantity required."); return; }
    if (!retVendor) { setErr("Select the vendor."); return; }
    setBusy(true);
    const res = await recordReturn({ site_id: chosenSite, item_id: picked.id, qty: Number(mv.qty),
      kind: "return_vendor", reason: retReason, vendor: retVendor, done_by: userId });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Returned to vendor: " + mv.qty + " of " + picked.display_name);
    setPicked(null); setRetVendor(""); setRetReason(""); setMv({ qty: "", purpose: "" }); onDone?.();
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
        {btn("issue", "Issue to worker")}
        {btn("settle", holdings.length ? `Settle (${holdings.length})` : "Settle")}
        {btn("return", "Return to vendor")}
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

      {/* ---------- ISSUE TO WORKER (multi-item, update141) ---------- */}
      {open === "issue" && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginBottom: 12 }}>
            <div><label className="muted">Issue to worker *</label>
              <select style={{ width: "100%" }} value={issWorker} onChange={e => setIssWorker(e.target.value)}>
                <option value="">Select worker…</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}{w.contractor && w.contractor !== "—" ? " (" + w.contractor + ")" : ""}</option>)}
              </select>
            </div>
          </div>
          <label className="muted">Add items to this issue</label>
          <div style={{ maxWidth: 360, marginBottom: 10 }}><ItemPicker onPick={addIssLine} placeholder="Search material master…" /></div>

          {issLines.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="dt-compact">
                <thead><tr><th>Item</th><th>Unit</th><th className="num">Quantity *</th><th>Remarks / purpose</th><th></th></tr></thead>
                <tbody>
                  {issLines.map((l, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{l.item_name}</td>
                      <td className="muted">{l.unit}</td>
                      <td className="num"><input style={{ width: 80 }} value={l.qty} onChange={e => setIssLine(i, "qty", e.target.value)} /></td>
                      <td><input style={{ width: "100%", minWidth: 140 }} value={l.remarks} onChange={e => setIssLine(i, "remarks", e.target.value)} placeholder="e.g. Bay-5 riser work" /></td>
                      <td><button style={{ fontSize: 11 }} onClick={() => removeIssLine(i)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="muted" style={{ margin: "8px 0" }}>All lines are saved together under ONE Issue ID. Material leaves the store and is held by the worker until settled (used + returned).</div>
          <button className="primary" disabled={busy} onClick={saveIssue}>{busy ? "Saving…" : `Issue (${issLines.length} item${issLines.length === 1 ? "" : "s"})`}</button>
        </div>
      )}

      {/* ---------- SETTLE (used + returned) ---------- */}
      {open === "settle" && (
        <div style={{ marginTop: 14 }}>
          {holdings.length === 0 ? <span className="muted">Nothing pending settlement. Issue material to a worker first.</span> : !settleSel ? (
            <div style={{ overflowX: "auto" }}>
              <div className="muted" style={{ marginBottom: 6 }}>Pick a worker's held material to settle:</div>
              <table className="dt-compact">
                <thead><tr><th>Worker</th><th>Item</th><th className="num">Held</th><th className="num">Days</th><th></th></tr></thead>
                <tbody>
                  {holdings.map((h, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{h.worker}</td>
                      <td>{h.item}</td>
                      <td className="num">{h.held} {h.unit}</td>
                      <td className="num">{h.days >= 1 ? <span className="badge a">{h.days}d</span> : <span className="badge gray">today</span>}</td>
                      <td><button style={{ fontSize: 11.5 }} onClick={() => { setSettleSel(h); setSettleVals({ used: "", returned: "", purpose: "" }); }}>Settle</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 8 }}><b>{settleSel.worker}</b> — {settleSel.item} · holding <b>{settleSel.held} {settleSel.unit}</b> <button style={{ fontSize: 11, marginLeft: 8 }} onClick={() => setSettleSel(null)}>back</button></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                <div><label className="muted">Used (incl. wastage) *</label><input style={{ width: "100%" }} value={settleVals.used} onChange={e => setSettleVals(v => ({ ...v, used: e.target.value }))} /></div>
                <div><label className="muted">Returned to store</label><input style={{ width: "100%" }} value={settleVals.returned} onChange={e => setSettleVals(v => ({ ...v, returned: e.target.value }))} /></div>
                <div><label className="muted">Purpose / location</label><input style={{ width: "100%" }} value={settleVals.purpose} onChange={e => setSettleVals(v => ({ ...v, purpose: e.target.value }))} /></div>
                <div style={{ display: "flex", alignItems: "flex-end" }}><button className="primary" disabled={busy} onClick={saveSettle} style={{ width: "100%" }}>Record settlement</button></div>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                Used → consumption (for Tally &amp; BOQ check). Returned → back to store. Remainder stays with the worker.
                {(Number(settleVals.used||0) + Number(settleVals.returned||0)) > settleSel.held && <span style={{ color: "var(--red)" }}> · Used + returned exceeds held qty!</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- RETURN TO VENDOR (wrong / excess received) ---------- */}
      {open === "return" && (
        <div style={{ marginTop: 14 }}>
          {!picked ? (
            <div style={{ maxWidth: 360 }}><label className="muted">Search item</label><ItemPicker onPick={setPicked} /></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}><b>{picked.display_name}</b> <button style={{ fontSize: 11, marginLeft: 8 }} onClick={() => setPicked(null)}>change</button></div>
              <div><label className="muted">Quantity *</label><input style={{ width: "100%" }} value={mv.qty} onChange={e => setMv(p => ({ ...p, qty: e.target.value }))} /></div>
              <div><label className="muted">Vendor *</label>
                <select style={{ width: "100%" }} value={retVendor} onChange={e => setRetVendor(e.target.value)}>
                  <option value="">Select vendor…</option>
                  {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}><label className="muted">Reason (damaged / wrong spec / excess)</label>
                <input style={{ width: "100%" }} value={retReason} onChange={e => setRetReason(e.target.value)} /></div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button className="primary" disabled={busy} onClick={saveReturnVendor} style={{ width: "100%" }}>Return to vendor</button>
              </div>
            </div>
          )}
          <div className="muted" style={{ marginTop: 8 }}>For wrong or excess material received — removes it from store stock and sends it back to the vendor.</div>
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
