"use client";
import { useEffect, useRef, useState } from "react";
import { ITEM_TYPES, searchItems, addItem, recordTxn, logConsumption, recordMultiGRN, getOpenPOs, getReturnableGrns, recordGrnReturn, recordReturn, issueToWorker, issueMultiToWorker, getWorkerList, getHoldings, settleHolding, bulkImport, BULK_TEMPLATE_HEADERS } from "@/lib/stock";
import { getSession } from "@/lib/auth";
import { getVendors } from "@/lib/vendors";
import ExchangePanel from "@/components/ExchangePanel";   // update404

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
  const [grnSupDocs, setGrnSupDocs] = useState([]);
  const [grnCoDocs, setGrnCoDocs] = useState([]);
  const [grnLines, setGrnLines] = useState([]);
  // update185: receive against a PO (optional) — lines pre-filled with ordered / received / pending
  const [openPOs, setOpenPOs] = useState([]);
  const [grnPO, setGrnPO] = useState(null);
  const [changing, setChanging] = useState(null);   // index of the line whose material is being changed
  useEffect(() => { if (chosenSite) getOpenPOs(chosenSite).then(setOpenPOs); else setOpenPOs([]); }, [chosenSite, msg]);
  // update405: prefill from the GRN register's quick entry (sessionStorage) — opens GRN mode with site/PO/vendor/challan set
  const [prefill, setPrefill] = useState(null);
  useEffect(() => { try { const raw = sessionStorage.getItem("psk_grn_prefill"); if (raw) { const p = JSON.parse(raw); sessionStorage.removeItem("psk_grn_prefill"); setPrefill(p); if (p.site_id) setChosenSite(String(p.site_id)); setOpen("grn"); setGrnHead(h => ({ ...h, vendor: p.vendor || "", challan_no: p.challan_no || "", challan_date: p.challan_date || "" })); } } catch {} }, []);
  useEffect(() => { if (prefill?.po_id && openPOs.some(p => String(p.id) === String(prefill.po_id))) { pickPO(prefill.po_id); setPrefill(null); } }, [openPOs, prefill]);   // eslint-disable-line react-hooks/exhaustive-deps
  function pickPO(id) {
    const po = openPOs.find(p => String(p.id) === String(id)) || null;
    setGrnPO(po); setChanging(null);
    if (!po) { setGrnHead(h => ({ ...h, po_id: null })); setGrnLines([]); return; }
    setGrnHead(h => ({ ...h, po_id: po.id, vendor: po.vendor || h.vendor }));
    setGrnLines(po.items.filter(i => i.pending_qty > 0).map(i => ({
      item_id: i.item_id, item_name: i.item_name, unit: i.unit, po_item_id: i.po_item_id,
      ordered_qty: i.ordered_qty, received_before: i.received_qty, pending_qty: i.pending_qty,
      challan_qty: String(i.pending_qty), received_qty: String(i.pending_qty), change: null })));
  }

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
  // update191 (v2): GRN-linked vendor return (multi-item, one transaction)
  const [retMode, setRetMode] = useState("grn");   // grn | single
  const [retGrns, setRetGrns] = useState([]);
  const [retGrn, setRetGrn] = useState(null);
  const [retLines, setRetLines] = useState([]);
  useEffect(() => { if (chosenSite) getReturnableGrns(chosenSite).then(setRetGrns); else setRetGrns([]); }, [chosenSite, msg]);   // eslint-disable-line react-hooks/exhaustive-deps
  function pickRetGrn(no) {
    const g = retGrns.find(x => x.grn_no === no) || null;
    setRetGrn(g);
    if (!g) { setRetLines([]); return; }
    setRetVendor(g.vendor || "");
    setRetLines(g.items.map(i => ({ ...i, sel: false, qty: "" })));
  }
  async function saveGrnReturn() {
    setErr("");
    const chosen = retLines.filter(l => l.sel);
    if (!retGrn) { setErr("Select the delivery challan the material came in against."); return; }
    if (!chosen.length) { setErr("Tick at least one item to return."); return; }
    if (chosen.some(l => !(Number(l.qty) > 0))) { setErr("Enter a return quantity for every ticked item."); return; }
    if (!retReason.trim()) { setErr("Reason is mandatory for a vendor return."); return; }
    setBusy(true);
    const res = await recordGrnReturn({ site_id: chosenSite, grn_no: retGrn.grn_no, vendor: retVendor || retGrn.vendor,
      reason: retReason.trim(), done_by: userId, lines: chosen });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(`Return ${res.ref} recorded against ${retGrn.grn_no} — ${res.lines} item(s), qty ${res.total_qty}, back to ${retVendor || retGrn.vendor}. Stock reduced; GRN register shows the returned qty.`);
    setRetGrn(null); setRetLines([]); setRetReason(""); onDone?.();
  }
  const reset = () => { setMsg(""); setErr(""); setMv({ qty: "", purpose: "" }); setRetKind("return_store"); setRetReason(""); setRetVendor(""); setPicked(null); setGrnLines([]); setGrnPO(null); setChanging(null); setGrnHead({ vendor: "", challan_no: "", challan_date: "" }); setIssLines([]); setBulkRows([]); setBulkResult(null); };

  async function saveItem() {
    setErr(""); if (!it.material) { setErr("Material is required."); return; }
    setBusy(true); const res = await addItem({ ...it, min_stock: Number(it.min_stock || 0) }); setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Item added: " + res.name); setIt({ item_type: "Pipe", material: "", size: "", item_class: "", make: "", unit: "Rmt", hsn_code: "", min_stock: "" }); onDone?.();
  }

  function addGrnLine(item) {
    if (grnLines.some(l => l.item_id === item.id)) return;
    setGrnLines(ls => [...ls, { item_id: item.id, item_name: item.display_name, unit: item.unit, challan_qty: "", received_qty: "", po_item_id: null, change: null }]);
  }
  function setChange(i, item) {   // material actually received differs from what was ordered
    setGrnLines(ls => ls.map((l, idx) => idx === i ? { ...l, change: { received_item_id: item.id, received_name: item.display_name, reason: l.change?.reason || "" } } : l));
    setChanging(null);
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
    if (!String(grnHead.our_challan_no || "").trim()) { setErr("Our challan no is mandatory."); return; }
    if (!(grnCoDocs || []).length) { setErr("Upload our delivery challan pages (duly signed & stamped) — mandatory."); return; }
    if (grnLines.some(l => l.change && !l.change.reason)) { setErr("Give a reason for every material change."); return; }
    setBusy(true);
    const res = await recordMultiGRN(
      { site_id: chosenSite, po_id: grnHead.po_id || null, vendor: grnHead.vendor, challan_no: grnHead.challan_no, our_challan_no: grnHead.our_challan_no, challan_date: grnHead.challan_date, done_by: userId },
      grnLines.map(l => ({ ...l, challan_qty: Number(l.challan_qty || l.received_qty || 0), received_qty: Number(l.received_qty || l.challan_qty || 0) }))
    ,
      { supplier: grnSupDocs, company: grnCoDocs });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(`GRN ${res.grn_no} recorded — ${grnLines.length} item(s)` + (res.discrepancies ? `. ⚠ ${res.discrepancies} discrepancy issue(s) raised.` : ".")
      + (res.over_receipt ? ` ⚠ ${res.over_receipt} line(s) received MORE than the PO ordered.` : "") + (res.changes ? ` ${res.changes} material change(s) logged.` : "") + (res.warn ? " · " + res.warn : ""));
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
        {btn("exchange", "⇄ Exchange")}{/* update404 */}
        {btn("item", "New item")}
        {btn("bulk", "⬆ Bulk import (Excel)")}
      </div>

      {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)", marginTop: 12 }}>{msg}</div>}
      {open === "exchange" && <ExchangePanel siteId={chosenSite || siteId} onDone={m => { setMsg(m); onDone && onDone(); }} />}{/* update404 */}
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}

      {/* ---------- MULTI-ITEM GRN ---------- */}
      {open === "grn" && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ minWidth: 320 }}><label className="muted">Receive against PO (optional)</label>
              <select style={{ width: "100%" }} value={grnPO?.id || ""} onChange={e => pickPO(e.target.value)}>
                <option value="">— No PO (direct / local purchase) —</option>
                {openPOs.map(p => <option key={p.id} value={p.id}>{p.po_no} · {p.vendor} · {p.pending_items ? p.pending_items + " item(s) pending" : (p.sql_missing ? "" : "all received")}{p.date ? " · " + p.date : ""}</option>)}
              </select>
            </div>
            {grnPO && <div className="muted" style={{ fontSize: 12 }}>Lines pre-filled from the PO with pending qty. Adjust <b>Received</b>, remove lines not in this challan, or add extra items below.</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 12 }}>
            <div><label className="muted">Vendor / supplier *</label>
              <select style={{ width: "100%" }} value={grnHead.vendor} onChange={e => setGrnHead(p => ({ ...p, vendor: e.target.value }))}>
                <option value="">Select vendor…</option>
                {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
              {vendors.length === 0 && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>No vendors yet — add them in Vendor master.</div>}
            </div>
            <div><label className="muted">Vendor challan no</label><input style={{ width: "100%" }} value={grnHead.challan_no} onChange={e => setGrnHead(p => ({ ...p, challan_no: e.target.value }))} /></div>
            <div><label className="muted">Our challan no * <span style={{ fontSize: 11 }}>(duly signed &amp; stamped)</span></label><input style={{ width: "100%" }} value={grnHead.our_challan_no || ""} onChange={e => setGrnHead(p => ({ ...p, our_challan_no: e.target.value }))} /></div>
            <div><label className="muted">Challan date</label><input type="date" style={{ width: "100%" }} value={grnHead.challan_date} onChange={e => setGrnHead(p => ({ ...p, challan_date: e.target.value }))} /></div>
            <div><label className="muted">📷 Supplier challan pages</label><input type="file" accept="image/*,.pdf" multiple style={{ width: "100%" }} onChange={e => setGrnSupDocs(Array.from(e.target.files || []))} /></div>
            <div><label className="muted">📷 Our challan pages * <span style={{ fontSize: 11 }}>(duly signed &amp; stamped)</span></label><input type="file" accept="image/*,.pdf" multiple style={{ width: "100%" }} onChange={e => setGrnCoDocs(Array.from(e.target.files || []))} /></div>
          </div>
          <label className="muted">Add items from this challan</label>
          <div style={{ maxWidth: 360, marginBottom: 10 }}><ItemPicker onPick={addGrnLine} placeholder="Search material master…" /></div>

          {grnLines.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="dt-compact">
                <thead><tr><th>Item</th>{grnPO && <><th className="num">Ordered</th><th className="num">Recd so far</th><th className="num">Pending</th></>}<th className="num">Challan qty</th><th className="num">Received now</th><th>Status</th><th>Material change</th><th></th></tr></thead>
                <tbody>
                  {grnLines.map((l, i) => {
                    const c = Number(l.challan_qty || 0), r = Number(l.received_qty || 0);
                    const diff = (l.received_qty !== "" && l.challan_qty !== "") ? r - c : null;
                    const over = l.po_item_id && r > Number(l.pending_qty || 0);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{l.item_name}<div className="muted">{l.unit}{!l.po_item_id && grnPO ? " · not in PO" : ""}</div>
                          {l.change && <div style={{ fontSize: 12, color: "var(--amber)" }}>→ received as <b>{l.change.received_name}</b></div>}
                        </td>
                        {grnPO && <><td className="num muted">{l.ordered_qty ?? "—"}</td><td className="num muted">{l.received_before ?? "—"}</td><td className="num" style={{ color: "var(--amber)" }}>{l.pending_qty ?? "—"}</td></>}
                        <td className="num"><input style={{ width: 80 }} value={l.challan_qty} onChange={e => setLine(i, "challan_qty", e.target.value)} /></td>
                        <td className="num"><input style={{ width: 80 }} value={l.received_qty} onChange={e => setLine(i, "received_qty", e.target.value)} /></td>
                        <td style={{ whiteSpace: "nowrap" }}>{diff === null ? <span className="muted">—</span> : diff === 0 ? <span className="badge p">OK</span> : <span className="badge a">{diff > 0 ? "+" : ""}{diff}</span>}{over ? <span className="badge h" style={{ marginLeft: 4 }}>over PO</span> : null}</td>
                        <td style={{ minWidth: 200 }}>
                          {changing === i ? (
                            <div><ItemPicker onPick={item => setChange(i, item)} placeholder="Item actually received…" /><button style={{ fontSize: 11, marginTop: 4 }} onClick={() => setChanging(null)}>Cancel</button></div>
                          ) : l.change ? (
                            <div><input placeholder="Reason for change *" style={{ width: "100%", fontSize: 12 }} value={l.change.reason} onChange={e => setLine(i, "change", { ...l.change, reason: e.target.value })} />
                              <button style={{ fontSize: 11, marginTop: 3 }} onClick={() => setLine(i, "change", null)}>✕ undo change</button></div>
                          ) : <button style={{ fontSize: 11 }} onClick={() => setChanging(i)}>≠ Different item received</button>}
                        </td>
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
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button style={{ fontSize: 12, background: retMode === "grn" ? "var(--copper)" : "#fff", color: retMode === "grn" ? "#fff" : "var(--text)" }} onClick={() => setRetMode("grn")}>Against our challan (recommended)</button>
            <button style={{ fontSize: 12, background: retMode === "single" ? "var(--copper)" : "#fff", color: retMode === "single" ? "#fff" : "var(--text)" }} onClick={() => setRetMode("single")}>Single item (no challan)</button>
          </div>
          {retMode === "grn" && (
            <div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
                <div style={{ minWidth: 360 }}><label className="muted">Our challan (delivery challan the material came in against)</label>
                  <select style={{ width: "100%" }} value={retGrn?.grn_no || ""} onChange={e => pickRetGrn(e.target.value)}>
                    <option value="">Select our challan…</option>
                    {retGrns.map(g => <option key={g.grn_no} value={g.grn_no}>{g.our_challan_no || ("(no challan no — " + g.grn_no + ")")} · {g.vendor || "—"} · {g.date}{g.po_no ? " · " + g.po_no : ""} · {g.returnable_items} returnable</option>)}
                  </select>
                </div>
                {retGrn && <div><label className="muted">GRN</label><div className="muted" style={{ padding: "6px 0", fontSize: 12.5 }}>{retGrn.grn_no}</div></div>}
                {retGrn && <div><label className="muted">Vendor</label><div style={{ fontWeight: 600, padding: "6px 0" }}>{retVendor || retGrn.vendor || "—"}</div></div>}
              </div>
              {retGrn && (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table className="dt-compact">
                      <thead><tr>
                        <th><input type="checkbox" checked={retLines.length > 0 && retLines.every(l => !l.max_return || l.sel)} onChange={e => setRetLines(ls => ls.map(l => l.max_return > 0 ? { ...l, sel: e.target.checked, qty: e.target.checked && !l.qty ? String(l.max_return) : l.qty } : l))} /></th>
                        <th>Item</th><th className="num">Received (this GRN)</th><th className="num">Already returned</th><th className="num">In store</th><th className="num">Max return</th><th className="num">Return qty</th>
                      </tr></thead>
                      <tbody>
                        {retLines.map((l, i) => (
                          <tr key={l.item_id} style={{ opacity: l.max_return > 0 ? 1 : 0.5 }}>
                            <td><input type="checkbox" disabled={!l.max_return} checked={l.sel} onChange={e => setRetLines(ls => ls.map((x, j) => j === i ? { ...x, sel: e.target.checked, qty: e.target.checked && !x.qty ? String(x.max_return) : x.qty } : x))} /></td>
                            <td style={{ fontWeight: 600 }}>{l.item_name}<div className="muted">{l.unit}</div></td>
                            <td className="num">{l.received}</td>
                            <td className="num muted">{l.already_returned || "—"}</td>
                            <td className="num">{l.store_balance}</td>
                            <td className="num" style={{ color: "var(--amber)" }}>{l.max_return}</td>
                            <td className="num"><input style={{ width: 76 }} disabled={!l.sel} value={l.qty} onChange={e => setRetLines(ls => ls.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                              {l.sel && Number(l.qty) > l.max_return && <div style={{ color: "var(--red)", fontSize: 11 }}>max {l.max_return}</div>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginTop: 10, alignItems: "end" }}>
                    <div><label className="muted">Reason (damaged / wrong spec / excess) *</label>
                      <input style={{ width: "100%" }} value={retReason} onChange={e => setRetReason(e.target.value)} /></div>
                    <button className="primary" disabled={busy || !retLines.some(l => l.sel)} onClick={saveGrnReturn}>
                      {busy ? "Saving…" : `Return ${retLines.filter(l => l.sel).length} item(s) to vendor`}</button>
                  </div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Max return = received on this GRN − already returned against it, limited by what's still in store. One transaction covers all ticked items; the GRN register shows returned quantities per line and the full return history under ↩ Returns.</div>
                </>
              )}
              {retGrns.length === 0 && <div className="muted">No GRNs with material at this site — use Single item for old/non-GRN stock.</div>}
            </div>
          )}
          {retMode === "single" && (!picked ? (
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
          ))}
          {retMode === "single" && <div className="muted" style={{ marginTop: 8 }}>For wrong or excess material received — removes it from store stock and sends it back to the vendor. Use "Against our challan" whenever the material came in on a recorded receipt, so the return links to it.</div>}
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
