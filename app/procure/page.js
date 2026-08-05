"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getSession, can } from "@/lib/auth";
import {
  getOpenIndents, saveQuotes, getQuotes, buildComparison, createPO, getPOs, cancelPO, inr,
  DELIVERY_STATUS, updatePODelivery,
} from "@/lib/procure";
import { getVendors } from "@/lib/vendors";
import { createIndent, editIndent, deleteIndent, quickAddItem } from "@/lib/stock";
import { searchIndentCatalog } from "@/lib/boq";
import { getSites } from "@/lib/data";

export default function ProcurePage() {
  const [session, setSession] = useState(null);
  const [indents, setIndents] = useState(null);
  const [pos, setPos] = useState([]);
  const [deliv, setDeliv] = useState(null);   // PO being edited for delivery
  const [openId, setOpenId] = useState(null);
  const [enqVendors, setEnqVendors] = useState([]);     // vendor names added to this enquiry
  const [vendorPick, setVendorPick] = useState("");      // master select before "Add"
  const [alloc, setAlloc] = useState({});                // {itemId: {vendor: true}}  which vendor quotes which item
  const [qin, setQin] = useState({});                    // {itemId: {vendor: {list, disc}}}
  const [rates, setRates] = useState({});                // derived NET map {itemId: {vendor: net}}
  const [enqSel, setEnqSel] = useState({});              // {itemId: bool} items to include in enquiry download
  const [cmp, setCmp] = useState(null);
  const [awardVendor, setAwardVendor] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [itemVendor, setItemVendor] = useState({});
  const [itemSplits, setItemSplits] = useState({}); // {itemId: [{vendor, qty}]} when qty-split is on
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [sites, setSites] = useState([]);
  const [ni, setNi] = useState(null);                    // new-indent modal state
  useEffect(() => { getSites().then(setSites); }, []);
  const blankLine = () => ({ item_name: "", qty: "", unit: "", item_id: null, spec: "" });
  const [sug, setSug] = useState(null);            // { i, q, list }
  const canAddMaster = session && (session.role === "director" || can(session, "stock", "manage", ni?.site_id));
  async function onItemType(i, val) {
    setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], item_name: val, item_id: null }; return { ...n, lines: ls }; });
    if (val.trim().length >= 2) setSug({ i, q: val, list: await searchIndentCatalog(ni.site_id, val.trim()) });
    else setSug(null);
  }
  function pickSug(i, opt) {
    setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], item_name: opt.label, unit: opt.unit || ls[i].unit, item_id: opt.item_id || null }; return { ...n, lines: ls }; });
    setSug(null);
  }
  async function addToMaster(i) {
    const line = ni.lines[i];
    const r = await quickAddItem(sug?.q || line.item_name, line.unit);
    if (!r.ok) { setErr(r.error); return; }
    pickSug(i, { label: r.item.display_name, unit: r.item.unit, item_id: r.item.id });
    setMsg(`"${r.item.display_name}" added to Item Master.`);
  }
  const openNewIndent = () => setNi({ site_id: "", required_by: "", urgency: "normal", note: "", lines: [blankLine()] });
  async function submitNewIndent() {
    setErr("");
    if (!ni.site_id) { setErr("Pick a site."); return; }
    const lines = ni.lines.filter(l => l.item_name.trim() && Number(l.qty) > 0);
    if (!lines.length) { setErr("Add at least one item with a quantity."); return; }
    setBusy(true);
    const header = { site_id: Number(ni.site_id), raised_by: session?.id || null, required_by: ni.required_by || null,
      urgency: ni.urgency, note: ni.note || null };
    const outLines = lines.map(l => ({ item_id: l.item_id || null, item_name: l.item_name.trim(), qty: Number(l.qty), unit: l.unit, spec: (l.spec || "").trim() || null }));
    const res = editingId ? await editIndent(editingId, header, outLines) : await createIndent(header, outLines);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setNi(null); setMsg(editingId ? "Indent " + editingNo + " updated — quotes were cleared, status back to open." : "Indent " + res.indent_no + " raised.");
    setEditingId(null); setEditingNo("");
    getOpenIndents().then(setIndents);
  }
  const [masterVendors, setMasterVendors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingNo, setEditingNo] = useState("");
  const CAN_DELETE_ROLES = ["director", "it_executive", "accountant"];
  function startWebEdit(ind) {
    setNi({ site_id: String(ind.site_id || ""), required_by: ind.required_by || "", urgency: ind.urgency || "normal",
      note: ind.note || "", lines: (ind.items || []).map(it => ({ item_id: it.item_id || null, item_name: it.item_name,
        qty: String(it.qty), unit: it.unit || "", spec: it.spec || "" })) });
    setEditingId(ind.id); setEditingNo(ind.indent_no); setMsg(""); setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function delIndent(ind) {
    if (!window.confirm("Delete " + ind.indent_no + " permanently? This cannot be undone.")) return;
    const res = await deleteIndent(ind.id);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Indent " + ind.indent_no + " deleted.");
    getOpenIndents().then(setIndents);
  }

  const load = () => { getOpenIndents("all").then(setIndents); getPOs("all").then(setPos); };
  useEffect(() => { setSession(getSession()); load(); getVendors(false).then(setMasterVendors); }, []);

  async function saveDelivery() {
    setBusy(true);
    const res = await updatePODelivery(deliv.id, { expected_delivery: deliv.expected_delivery, delivery_status: deliv.delivery_status, delivery_note: deliv.delivery_note });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setDeliv(null); setMsg("Delivery updated for " + deliv.po_no + " — site can see it now."); getPOs("all").then(setPos);
  }

  async function openIndent(ind) {
    const willOpen = openId !== ind.id;
    setOpenId(willOpen ? ind.id : null);
    setCmp(null); setRates({}); setAwardVendor(""); setReason(""); setMsg(""); setErr(""); setSplitMode(false); setItemVendor({}); setItemSplits({});
    setEnqVendors([]); setVendorPick(""); setAlloc({}); setQin({});
    const sel = {}; ind.items.forEach(it => sel[it.id] = true); setEnqSel(sel);
    if (willOpen) {
      const quotes = await getQuotes(ind.id);
      if (quotes.length) {
        const vs = [], al = {}, qi = {};
        quotes.forEach(q => {
          if (!vs.includes(q.vendor_name)) vs.push(q.vendor_name);
          (al[q.indent_item_id] = al[q.indent_item_id] || {})[q.vendor_name] = true;
          const list = q.list_rate != null ? q.list_rate : (q.rate != null ? q.rate : "");
          const disc = q.discount_pct != null ? q.discount_pct : "";
          (qi[q.indent_item_id] = qi[q.indent_item_id] || {})[q.vendor_name] = { list: String(list), disc: String(disc) };
        });
        setEnqVendors(vs); setAlloc(al); setQin(qi);
      }
    }
  }

  function addVendor() {
    const v = vendorPick.trim();
    if (!v || enqVendors.includes(v)) { setVendorPick(""); return; }
    setEnqVendors(vs => [...vs, v]); setVendorPick("");
  }
  function removeVendor(v) {
    setEnqVendors(vs => vs.filter(x => x !== v));
    const strip = obj => { const n = { ...obj }; Object.keys(n).forEach(k => { if (n[k]) { const m = { ...n[k] }; delete m[v]; n[k] = m; } }); return n; };
    setAlloc(strip); setQin(strip);
  }
  const toggleAlloc = (itemId, v) => setAlloc(a => ({ ...a, [itemId]: { ...(a[itemId] || {}), [v]: !a[itemId]?.[v] } }));
  const setQ = (itemId, v, k, val) => setQin(q => ({ ...q, [itemId]: { ...(q[itemId] || {}), [v]: { ...(q[itemId]?.[v] || {}), [k]: val } } }));
  const netOf = (itemId, v) => {
    const c = qin[itemId]?.[v]; if (!c) return null;
    const list = Number(c.list); if (!list) return null;
    const disc = Number(c.disc) || 0;
    return +(list * (1 - disc / 100)).toFixed(2);
  };

  // ---- enquiry download (#6) ----
  const toggleEnqItem = id => setEnqSel(s => ({ ...s, [id]: !s[id] }));
  const toggleEnqCat = (list, on) => setEnqSel(s => { const n = { ...s }; list.forEach(it => n[it.id] = on); return n; });

  function downloadEnquiryPDF(ind) {
    const chosen = ind.items.filter(it => enqSel[it.id]);
    if (!chosen.length) { setErr("Tick at least one item to download."); return; }
    setErr("");
    const cats = Array.from(new Set(chosen.map(it => it.category)));
    const title = "Enquiry — " + cats.join(" & ");
    const url = `/purchase/enquiry?indent=${ind.id}&items=${chosen.map(it => it.id).join(",")}&title=${encodeURIComponent(title)}`;
    window.open(url, "_blank");
  }

  async function downloadEnquiryExcel(ind) {
    const chosen = ind.items.filter(it => enqSel[it.id]);
    if (!chosen.length) { setErr("Tick at least one item to download."); return; }
    setErr("");
    const XLSX = await import("xlsx");
    const cats = Array.from(new Set(chosen.map(it => it.category)));
    const head = [
      ["Pipeskool Projects Pvt. Ltd. — Material Enquiry"],
      ["Project", ind.site || ""], ["Indent ref", ind.indent_no], ["Required by", ind.required_by || ""], [],
      ["#", "Category", "Description", "Qty", "Unit", "List Rate", "Disc %", "Net Rate"],
    ];
    const rows = chosen.map((it, i) => [i + 1, it.category, it.item_name + (it.spec ? " — " + it.spec : ""), Number(it.qty), it.unit, "", "", ""]);
    const ws = XLSX.utils.aoa_to_sheet([...head, ...rows]);
    ws["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 46 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Enquiry");
    XLSX.writeFile(wb, `Enquiry_${ind.indent_no.replace(/\//g, "-")}_${cats.join("-")}.xlsx`);
  }

  // derived NET-rate map → feeds the existing compare/award engine
  useEffect(() => {
    const r = {};
    Object.keys(alloc).forEach(itemId => Object.keys(alloc[itemId] || {}).forEach(v => {
      if (!alloc[itemId][v]) return;
      const c = qin[itemId]?.[v]; if (!c) return;
      const list = Number(c.list); if (!list) return;
      const disc = Number(c.disc) || 0;
      (r[itemId] = r[itemId] || {})[v] = +(list * (1 - disc / 100)).toFixed(2);
    }));
    setRates(r);
  }, [qin, alloc]);

  function buildQuotes(ind) {
    const vendors = enqVendors;
    const quotes = [];
    ind.items.forEach(it => vendors.forEach(v => {
      if (!alloc[it.id]?.[v]) return;
      const net = netOf(it.id, v);
      if (net != null) quotes.push({ indent_item_id: it.id, vendor_name: v, rate: net });
    }));
    return { vendors, quotes };
  }
  function compare(ind) {
    const { vendors, quotes } = buildQuotes(ind);
    if (vendors.length === 0) { setErr("Add at least one vendor."); return; }
    if (quotes.length === 0) { setErr("Enter at least one rate (list price)."); return; }
    setErr("");
    const c = buildComparison(ind.items, quotes);
    setCmp(c);
    const iv = {}; Object.entries(c.splitChoice).forEach(([itemId, ch]) => iv[itemId] = ch.vendor);
    setItemVendor(iv);
  }
  async function persistQuotes(ind) {
    const rows = [];
    ind.items.forEach(it => enqVendors.forEach(v => {
      if (!alloc[it.id]?.[v]) return;
      const c = qin[it.id]?.[v] || {};
      rows.push({ indent_item_id: it.id, vendor_name: v, list_rate: c.list || null, discount_pct: c.disc || null, rate: netOf(it.id, v) });
    }));
    const res = await saveQuotes(ind.id, rows);
    setMsg(res.ok ? "Allocation & rates saved for " + ind.indent_no : res.error);
    if (res.ok) load();
  }
  async function award(ind) {
    setErr("");
    if (!awardVendor) { setErr("Choose a vendor to award the PO."); return; }
    const isLowest = cmp?.bestWhole?.vendor === awardVendor;
    if (!isLowest && !reason.trim()) { setErr("This vendor is not the lowest total — please enter the reason."); return; }
    const lines = ind.items.map(it => ({ indent_item_id: it.id, item_id: it.item_id, item_name: it.item_name,
      spec: it.spec || null, qty: it.qty, unit: it.unit, rate: Number(rates[it.id]?.[awardVendor] || 0) }));
    if (lines.some(l => !l.rate)) { setErr("This vendor hasn't quoted every item."); return; }
    setBusy(true);
    const res = await createPO({ indent_id: ind.id, site_id: ind.site_id || 1, vendor_name: awardVendor,
      is_lowest: isLowest, non_lowest_reason: isLowest ? null : reason, lines }, session?.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("PO " + res.po_no + " issued to " + awardVendor + (isLowest ? " (lowest)" : " — reason recorded")); setOpenId(null); load();
  }

  async function awardSplit(ind) {
    setErr("");
    const byVendor = {};
    for (const it of ind.items) {
      const splits = itemSplits[it.id];
      if (splits && splits.length) {
        // quantity-split across vendors for this item
        const totalSplit = splits.reduce((s, r) => s + Number(r.qty || 0), 0);
        if (totalSplit !== Number(it.qty)) {
          setErr(`${it.item_name}: split quantities (${totalSplit}) must add up to required ${it.qty} ${it.unit}.`); return;
        }
        for (const row of splits) {
          if (!row.vendor) { setErr(`Choose a vendor for every split row of ${it.item_name}.`); return; }
          if (!Number(row.qty)) { setErr(`Enter quantity for every split row of ${it.item_name}.`); return; }
          if (!rates[it.id]?.[row.vendor]) { setErr(`No rate from ${row.vendor} for ${it.item_name}.`); return; }
          (byVendor[row.vendor] = byVendor[row.vendor] || []).push({ indent_item_id: it.id, item_id: it.item_id,
            item_name: it.item_name, qty: Number(row.qty), unit: it.unit, rate: Number(rates[it.id][row.vendor]) });
        }
      } else {
        // whole item to one vendor
        const v = itemVendor[it.id];
        if (!v) { setErr("Choose a vendor for every item (or split it by quantity)."); return; }
        if (!rates[it.id]?.[v]) { setErr(`No rate from ${v} for ${it.item_name}.`); return; }
        (byVendor[v] = byVendor[v] || []).push({ indent_item_id: it.id, item_id: it.item_id,
          item_name: it.item_name, spec: it.spec || null, qty: Number(it.qty), unit: it.unit, rate: Number(rates[it.id][v]) });
      }
    }
    setBusy(true);
    const issued = [];
    for (const [vendor, lines] of Object.entries(byVendor)) {
      const res = await createPO({ indent_id: ind.id, site_id: ind.site_id || 1, vendor_name: vendor,
        is_lowest: true, split_note: "Split award — cheapest per item", lines }, session?.id);
      if (!res.ok) { setBusy(false); setErr(res.error); return; }
      issued.push(res.po_no);
    }
    setBusy(false);
    setMsg("Split done — " + issued.length + " POs issued: " + issued.join(", ")); setOpenId(null); load();
  }

  const open = (indents || []).filter(i => i.status === "open" || i.status === "quoting");
  async function doCancel(p) { if (!confirm("Cancel PO " + p.po_no + "?")) return; await cancelPO(p.id); load(); }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Procurement — indents &amp; POs</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — sample data.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Open material requests {open.length > 0 && <span className="badge warn">{open.length}</span>}</h2>
            <button className="primary" onClick={openNewIndent}>＋ New indent</button>
          </div>
          {ni && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, margin: "10px 0", background: "#FAFBFC" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Raise material indent</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
                <div><label className="muted">Site *</label><br />
                  <select value={ni.site_id} onChange={e => setNi(n => ({ ...n, site_id: e.target.value }))}>
                    <option value="">— pick —</option>
                    {sites.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select></div>
                <div><label className="muted">Need by</label><br />
                  <input type="date" value={ni.required_by} onChange={e => setNi(n => ({ ...n, required_by: e.target.value }))} /></div>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer", paddingBottom: 6 }}>
                  <input type="checkbox" checked={ni.urgency === "urgent"} onChange={e => setNi(n => ({ ...n, urgency: e.target.checked ? "urgent" : "normal" }))} style={{ accentColor: "var(--copper)" }} /> URGENT
                </label>
                <input style={{ flex: 1, minWidth: 180 }} placeholder="Note (optional)" value={ni.note} onChange={e => setNi(n => ({ ...n, note: e.target.value }))} />
              </div>
              {ni.lines.map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 2, position: "relative" }}>
                    <input style={{ width: "100%" }} placeholder="Item / material name * (type 2+ letters to search)" value={l.item_name}
                           onChange={e => onItemType(i, e.target.value)} />
                    {sug && sug.i === i && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 40, background: "#fff",
                                    border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 20px rgba(0,0,0,.12)", maxHeight: 220, overflowY: "auto" }}>
                        {sug.list.map((o, j) => (
                          <div key={j} onClick={() => pickSug(i, o)}
                               style={{ padding: "7px 10px", cursor: "pointer", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span>{o.label}</span>
                            <span className="muted" style={{ fontSize: 11 }}>{o.kind === "boq" ? "BOQ" : "Item"}{o.unit ? " · " + o.unit : ""}</span>
                          </div>
                        ))}
                        {sug.list.length === 0 && <div className="muted" style={{ padding: "7px 10px", fontSize: 12.5 }}>No match in Item or BOQ master.</div>}
                        {canAddMaster && (
                          <div onClick={() => addToMaster(i)}
                               style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12.5, color: "var(--copper)", fontWeight: 700, borderTop: "1px solid var(--border)" }}>
                            ＋ Add "{sug.q}" to Item Master
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <input style={{ width: 90 }} inputMode="numeric" placeholder="Qty *" value={l.qty}
                         onChange={e => setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], qty: e.target.value }; return { ...n, lines: ls }; })} />
                  <input style={{ width: 90 }} placeholder="Unit" value={l.unit}
                         onChange={e => setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], unit: e.target.value }; return { ...n, lines: ls }; })} />
                  <input style={{ width: 220 }} placeholder="Specification (e.g. ASTM A106 Gr B, Sch 40, ISI)" value={l.spec || ""}
                         onChange={e => setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], spec: e.target.value }; return { ...n, lines: ls }; })} />
                  {ni.lines.length > 1 && <button onClick={() => setNi(n => ({ ...n, lines: n.lines.filter((_, j) => j !== i) }))}>✕</button>}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => setNi(n => ({ ...n, lines: [...n.lines, blankLine()] }))}>＋ Add item</button>
                <button className="primary" disabled={busy} onClick={submitNewIndent}>Raise indent</button>
                <button onClick={() => setNi(null)}>Cancel</button>
              </div>
            </div>
          )}
          {!indents ? <div className="muted">Loading…</div> : open.length === 0 ? <span className="muted">No open indents. Site staff raise them from Material stock → Raise material request.</span> : (
            open.map(ind => (
              <div key={ind.id} style={{ border: "1px solid var(--border)", borderRadius: 10, marginBottom: 10 }}>
                <div onClick={() => openIndent(ind)} style={{ padding: 12, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{ind.indent_no}</span>
                    {ind.urgency === "urgent" && <span className="badge a" style={{ marginLeft: 8 }}>Urgent</span>}
                    {ind.edited_at && <span className="badge h" style={{ marginLeft: 8 }}>⚠ Edited by site</span>}
                    <div className="muted">{ind.site} · {ind.item_count} items · by {ind.raised_by || "—"} · {ind.date}{ind.required_by ? " · need by " + ind.required_by : ""}</div>
                  </div>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {(ind.status === "open" || ind.status === "quoting") && session?.id === ind.raised_by_id && (
                      <button style={{ fontSize: 11 }} onClick={e => { e.stopPropagation(); startWebEdit(ind); }}>✎ Edit</button>)}
                    {CAN_DELETE_ROLES.includes(session?.role) && (
                      <button style={{ fontSize: 11, color: "var(--red)" }} onClick={e => { e.stopPropagation(); delIndent(ind); }}>🗑 Delete</button>)}
                    <span className="badge gray">{ind.status}</span>
                  </span>
                </div>

                {openId === ind.id && (
                  <div style={{ padding: "0 12px 14px" }}>
                    <div className="muted" style={{ margin: "4px 0 8px" }}><b>1.</b> Review what's required, <b>2.</b> add the vendors you'll ask, <b>3.</b> tick which items each one should quote, <b>4.</b> enter list rate + discount % (net is auto-calculated), then compare & award.</div>

                    {/* requirement — always visible */}
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Requirement — {ind.items.length} item{ind.items.length !== 1 ? "s" : ""}{ind.required_by ? " · need by " + ind.required_by : ""}</div>
                      <table className="dt-compact" style={{ width: "100%" }}>
                        <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th>Purpose</th></tr></thead>
                        <tbody>
                          {ind.items.map((it, idx) => (
                            <tr key={it.id}>
                              <td className="muted">{idx + 1}</td>
                              <td style={{ fontWeight: 600 }}>{it.item_name}</td>
                              <td className="num">{it.qty} {it.unit}</td>
                              <td className="muted">{it.purpose || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* enquiry download — by category (#6) */}
                    {(() => {
                      const byCat = ind.items.reduce((a, it) => { (a[it.category] = a[it.category] || []).push(it); return a; }, {});
                      const chosenCount = ind.items.filter(it => enqSel[it.id]).length;
                      return (
                        <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Send enquiry to vendors</div>
                          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Tick the items to include, then download. Do it once per vendor group — e.g. pipes &amp; fittings together, hardware separately — and send via WhatsApp / mail.</div>
                          {Object.entries(byCat).map(([cat, list]) => {
                            const allOn = list.every(it => enqSel[it.id]);
                            return (
                              <div key={cat} style={{ marginBottom: 6 }}>
                                <label style={{ fontWeight: 600, fontSize: 12.5, display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                                  <input type="checkbox" checked={allOn} onChange={() => toggleEnqCat(list, !allOn)} style={{ accentColor: "var(--copper)" }} />
                                  {cat} <span className="muted">({list.length})</span>
                                </label>
                                <div style={{ paddingLeft: 22 }}>
                                  {list.map(it => (
                                    <label key={it.id} style={{ display: "block", fontSize: 12, cursor: "pointer", padding: "1px 0" }}>
                                      <input type="checkbox" checked={!!enqSel[it.id]} onChange={() => toggleEnqItem(it.id)} style={{ accentColor: "var(--copper)", marginRight: 6 }} />
                                      {it.item_name} · {it.qty} {it.unit}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                            <button onClick={() => downloadEnquiryPDF(ind)} disabled={!chosenCount}>⬇ PDF</button>
                            <button onClick={() => downloadEnquiryExcel(ind)} disabled={!chosenCount}>⬇ Excel</button>
                            <span className="muted" style={{ fontSize: 11.5 }}>{chosenCount} of {ind.items.length} items selected</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* add vendors */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <select value={vendorPick} onChange={e => setVendorPick(e.target.value)} style={{ width: 220 }}>
                        <option value="">Add a vendor…</option>
                        {masterVendors.filter(mv => !enqVendors.includes(mv.name)).map(mv => <option key={mv.id} value={mv.name}>{mv.name}</option>)}
                      </select>
                      <button onClick={addVendor} disabled={!vendorPick}>＋ Add vendor</button>
                      {enqVendors.map(v => (
                        <span key={v} className="badge gray" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          {v}<span onClick={() => removeVendor(v)} style={{ cursor: "pointer", fontWeight: 700 }}>✕</span>
                        </span>
                      ))}
                    </div>

                    {enqVendors.length === 0 ? (
                      <div className="muted" style={{ padding: "8px 0" }}>Add the vendors you want to send this enquiry to. For comparison, add 2–3 vendors for the same items.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table className="dt-compact">
                          <thead><tr><th>Item</th><th className="num">Qty</th>{enqVendors.map(v => <th key={v} className="num">{v}</th>)}</tr></thead>
                          <tbody>
                            {ind.items.map(it => (
                              <tr key={it.id}>
                                <td style={{ fontWeight: 600 }}>{it.item_name}<div className="muted">{it.purpose}</div></td>
                                <td className="num">{it.qty} {it.unit}</td>
                                {enqVendors.map(v => {
                                  const on = !!alloc[it.id]?.[v]; const net = netOf(it.id, v);
                                  return (
                                    <td key={v} className="num" style={{ verticalAlign: "top" }}>
                                      <label style={{ display: "inline-flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                                        <input type="checkbox" checked={on} onChange={() => toggleAlloc(it.id, v)} style={{ width: 15, height: 15, accentColor: "var(--copper)" }} />
                                        <span className="muted" style={{ fontSize: 11 }}>quote</span>
                                      </label>
                                      {on && (
                                        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
                                          <input style={{ width: 78 }} placeholder="list ₹" value={qin[it.id]?.[v]?.list || ""} onChange={e => setQ(it.id, v, "list", e.target.value)} />
                                          <input style={{ width: 78 }} placeholder="disc %" value={qin[it.id]?.[v]?.disc || ""} onChange={e => setQ(it.id, v, "disc", e.target.value)} />
                                          <div style={{ fontSize: 11.5, fontWeight: 700, color: net != null ? "var(--copper-deep)" : "var(--muted)" }}>{net != null ? "net " + inr(net) : "—"}</div>
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button onClick={() => compare(ind)}>Compare rates</button>
                      <button onClick={() => persistQuotes(ind)}>Save allocation & rates</button>
                    </div>

                    {cmp && (
                      <div style={{ marginTop: 14, background: "var(--bg)", borderRadius: 10, padding: 12 }}>
                        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Comparison</h3>

                        {/* per-item rate comparison — cheapest highlighted */}
                        <div style={{ overflowX: "auto", marginBottom: 12 }}>
                          <table className="dt-compact">
                            <thead><tr><th>Item</th><th className="num">Qty</th>{cmp.vendors.map(v => <th key={v} className="num">{v}</th>)}<th>Cheapest</th></tr></thead>
                            <tbody>
                              {ind.items.map(it => {
                                const row = cmp.matrix[it.id] || {};
                                const best = cmp.splitChoice[it.id];
                                return (
                                  <tr key={it.id}>
                                    <td style={{ fontWeight: 600 }}>{it.item_name}<div className="muted">{it.qty} {it.unit}</div></td>
                                    <td className="num">{it.qty} {it.unit}</td>
                                    {cmp.vendors.map(v => {
                                      const r = row[v]; const isBest = best && best.vendor === v;
                                      return <td key={v} className="num" style={{ fontWeight: isBest ? 700 : 400, color: isBest ? "var(--copper-deep)" : (r == null ? "var(--muted)" : "inherit"), background: isBest ? "rgba(255,122,26,0.10)" : "transparent" }}>{r == null ? "—" : inr(r)}</td>;
                                    })}
                                    <td>{best ? <span className="badge p">{best.vendor}</span> : <span className="muted">no quote</span>}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {cmp.vendorTotals.length > 0 ? (
                          <table className="dt-compact">
                            <thead><tr><th>Vendor (quoted full indent)</th><th className="num">Total</th><th></th></tr></thead>
                            <tbody>
                              {cmp.vendorTotals.map((v, i) => (
                                <tr key={v.vendor}>
                                  <td style={{ fontWeight: 600 }}>{v.vendor} {i === 0 && <span className="badge p">Lowest</span>}</td>
                                  <td className="num">{inr(v.total)}</td>
                                  <td>{i > 0 && <span className="muted">+{inr(v.total - cmp.bestWhole.total)}</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="muted" style={{ fontSize: 12.5 }}>No single vendor quoted every item — that's normal when you split pipes and hardware across different vendors. Use the per-item table above, or <b>Split</b> below to award each item to its cheapest vendor.</div>
                        )}
                        <div className="muted" style={{ marginTop: 8 }}>
                          {cmp.bestWhole && <>Best single vendor: <b>{cmp.bestWhole.vendor} at {inr(cmp.bestWhole.total)}</b>. </>}
                          Split to cheapest per item: <b>{inr(cmp.splitTotal)}</b>
                          {cmp.gap > 0 && <> — splitting saves <b style={{ color: "var(--copper-deep)" }}>{inr(cmp.gap)} ({cmp.gapPct}%)</b> but needs multiple POs / more transport.</>}
                        </div>
                        <div style={{ marginTop: 10, marginBottom: 4 }}>
                          <label style={{ fontSize: 12.5, display: "inline-flex", gap: 7, alignItems: "center", cursor: "pointer" }}>
                            <input type="checkbox" checked={splitMode} onChange={e => setSplitMode(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--copper)" }} />
                            Split — choose a vendor per item (creates one PO per vendor)
                          </label>
                        </div>

                        {!splitMode ? (
                          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <label className="muted">Award whole indent to:</label>
                            <select value={awardVendor} onChange={e => { setAwardVendor(e.target.value); setReason(""); }}>
                              <option value="">Select vendor…</option>
                              {cmp.vendors.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                            {awardVendor && cmp.bestWhole && awardVendor !== cmp.bestWhole.vendor &&
                              <input placeholder="Reason for not choosing lowest *" value={reason} onChange={e => setReason(e.target.value)} style={{ width: 280 }} />}
                            <button className="primary" disabled={busy} onClick={() => award(ind)}>{busy ? "Issuing…" : "Issue PO"}</button>
                          </div>
                        ) : (
                          <div style={{ marginTop: 8 }}>
                            <div className="muted" style={{ marginBottom: 6 }}>Pick who supplies each item. Use “+ split qty” if one item must come from more than one vendor.</div>
                            <table className="dt-compact">
                              <thead><tr><th>Item</th><th className="num">Qty</th><th>Vendor / split</th><th className="num">Amount</th></tr></thead>
                              <tbody>
                                {ind.items.map(it => {
                                  const splits = itemSplits[it.id];
                                  const vendorOpts = cmp.vendors.filter(vn => rates[it.id]?.[vn]);
                                  if (splits && splits.length) {
                                    const totalSplit = splits.reduce((s, r) => s + Number(r.qty || 0), 0);
                                    const okTotal = totalSplit === Number(it.qty);
                                    return (
                                      <tr key={it.id}>
                                        <td style={{ fontWeight: 600 }}>{it.item_name}</td>
                                        <td className="num">{it.qty} {it.unit}</td>
                                        <td>
                                          {splits.map((row, ri) => (
                                            <div key={ri} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                                              <select value={row.vendor} onChange={e => setItemSplits(p => ({ ...p, [it.id]: p[it.id].map((r, i) => i === ri ? { ...r, vendor: e.target.value } : r) }))}>
                                                <option value="">Vendor…</option>
                                                {vendorOpts.map(vn => <option key={vn} value={vn}>{vn} (₹{rates[it.id][vn]})</option>)}
                                              </select>
                                              <input style={{ width: 70 }} placeholder="qty" value={row.qty} onChange={e => setItemSplits(p => ({ ...p, [it.id]: p[it.id].map((r, i) => i === ri ? { ...r, qty: e.target.value } : r) }))} />
                                              <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => ({ ...p, [it.id]: p[it.id].filter((_, i) => i !== ri) }))}>✕</button>
                                            </div>
                                          ))}
                                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                            <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => ({ ...p, [it.id]: [...p[it.id], { vendor: "", qty: "" }] }))}>+ vendor</button>
                                            <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => { const n = { ...p }; delete n[it.id]; return n; })}>cancel split</button>
                                            <span style={{ fontSize: 11.5, color: okTotal ? "var(--green)" : "var(--red)" }}>
                                              {totalSplit}/{it.qty} {it.unit}{okTotal ? " ✓" : " — must total " + it.qty}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="num">{splits.reduce((s, r) => s + (rates[it.id]?.[r.vendor] ? Number(rates[it.id][r.vendor]) * Number(r.qty || 0) : 0), 0) ? inr(splits.reduce((s, r) => s + (rates[it.id]?.[r.vendor] ? Number(rates[it.id][r.vendor]) * Number(r.qty || 0) : 0), 0)) : "—"}</td>
                                      </tr>
                                    );
                                  }
                                  const v = itemVendor[it.id] || "";
                                  const r = v ? rates[it.id]?.[v] : "";
                                  return (
                                    <tr key={it.id}>
                                      <td style={{ fontWeight: 600 }}>{it.item_name}</td>
                                      <td className="num">{it.qty} {it.unit}</td>
                                      <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <select value={v} onChange={e => setItemVendor(p => ({ ...p, [it.id]: e.target.value }))}>
                                          <option value="">Select…</option>
                                          {vendorOpts.map(vn => <option key={vn} value={vn}>{vn} (₹{rates[it.id][vn]})</option>)}
                                        </select>
                                        <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => ({ ...p, [it.id]: [{ vendor: v || "", qty: it.qty }, { vendor: "", qty: "" }] }))}>+ split qty</button>
                                      </td>
                                      <td className="num">{r ? inr(Number(r) * Number(it.qty)) : "—"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <button className="primary" disabled={busy} onClick={() => awardSplit(ind)} style={{ marginTop: 10 }}>{busy ? "Issuing…" : "Issue split POs"}</button>
                          </div>
                        )}
                      </div>
                    )}
                    {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="panel">
          <h2>Purchase orders issued</h2>
          {pos.length === 0 ? <span className="muted">No POs yet.</span> : (
            <div style={{ overflowX: "auto" }}>
              <table className="dt-compact">
                <thead><tr><th>PO no</th><th>Indent</th><th>Vendor</th><th className="num">Amount</th><th>Delivery</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {pos.map(p => { const [dl, dc] = DELIVERY_STATUS[p.delivery_status] || DELIVERY_STATUS.pending; return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.po_no}</td>
                      <td className="muted">{p.indent_no}</td>
                      <td>{p.vendor}</td>
                      <td className="num">{inr(p.total)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className={"badge " + dc}>{dl}</span>
                        {p.expected_delivery && <div className="muted" style={{ fontSize: 11 }}>by {p.expected_delivery}</div>}
                      </td>
                      <td><span className="badge gray">{p.status}</span></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => setDeliv({ id: p.id, po_no: p.po_no, expected_delivery: p.expected_delivery || "", delivery_status: p.delivery_status || "pending", delivery_note: p.delivery_note || "" })}>📦 Delivery</button>
                        <a href={"/purchase/po?po=" + p.id} target="_blank" rel="noreferrer"><button style={{ fontSize: 11.5, marginRight: 4 }}>Print</button></a>
                        {p.status !== "cancelled" && <button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => doCancel(p)}>Cancel</button>}
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {deliv && (
          <div onClick={() => setDeliv(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 440, width: "100%", padding: 22 }}>
              <h2 style={{ marginBottom: 2 }}>Delivery — {deliv.po_no}</h2>
              <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>The site sees this live on their mobile indent list.</div>
              <div style={{ display: "grid", gap: 10 }}>
                <div><label className="muted">Expected delivery date</label>
                  <input type="date" style={{ width: "100%" }} value={deliv.expected_delivery} onChange={e => setDeliv(d => ({ ...d, expected_delivery: e.target.value }))} /></div>
                <div><label className="muted">Status</label>
                  <select style={{ width: "100%" }} value={deliv.delivery_status} onChange={e => setDeliv(d => ({ ...d, delivery_status: e.target.value }))}>
                    {Object.entries(DELIVERY_STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
                  </select></div>
                <div><label className="muted">Note (optional, e.g. reason for delay)</label>
                  <input style={{ width: "100%" }} value={deliv.delivery_note} onChange={e => setDeliv(d => ({ ...d, delivery_note: e.target.value }))} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="primary" disabled={busy} onClick={saveDelivery}>{busy ? "Saving…" : "Update delivery"}</button>
                <button onClick={() => setDeliv(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
