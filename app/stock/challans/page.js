"use client";
// update215: DELIVERY CHALLAN module — vendor challan in (photo/AI or manual vs PO),
// listed + filtered, then Convert -> GRN. Print / PDF / Tally per row and in bulk.
import { Fragment, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { createDeliveryChallan, getDeliveryChallans, convertDcToGrn, cancelDeliveryChallan, uploadDcProof, dcProofUrl, priceDcLines, dcTallyXml, getChallanPOs, editDeliveryChallan } from "@/lib/challan";
import { getClients, shipBlock, addrLines } from "@/lib/clients";   // update393
import InternalDispatchTab from "@/components/InternalDispatchTab";   // update403
import VendorLink from "@/components/VendorLink";   // update410
import { getTallySettings } from "@/lib/tally";
import { getSession, canSeeModuleAnySite } from "@/lib/auth";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const norm = t => (t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sim = (a, b) => { a = norm(a); b = norm(b); if (!a || !b) return 0; return a.includes(b) || b.includes(a) ? 1 : (a.slice(0, 5) === b.slice(0, 5) ? 0.6 : 0); };

export default function DeliveryChallans() {
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState(null);
  const [pos, setPos] = useState([]);
  const [rates, setRates] = useState({});
  const [tally, setTally] = useState(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [ctab, setCtab] = useState("manual");            // update272c: Upload/AI tab removed on Director instruction — manual only
  const [mainTab, setMainTab] = useState(() => { try { return new URLSearchParams(window.location.search).get("tab") === "internal" ? "internal" : "vendor"; } catch { return "vendor"; } });   // update403
  const [idcCount, setIdcCount] = useState(null);
  const [showNew, setShowNew] = useState(true);

  // ---- create state (shared preview for both paths)
  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [head, setHead] = useState({ vendor_name: "", vendor_dc_no: "", dc_date: new Date().toISOString().slice(0, 10), po_id: null, source: "manual", confidence: null, dc_ref: "", client_id: "" });
  // update393: Client Master + site→client default; DC number typed by hand (blank = series); ✎ edit
  const [clients, setClients] = useState([]); const [siteClient, setSiteClient] = useState({});
  const [edit, setEdit] = useState(null); const [editBusy, setEditBusy] = useState(false);
  const clientOf = id => clients.find(c => String(c.id) === String(id)) || null;
  const [lines, setLines] = useState([]);                // { po_item_id,item_id,item_name,unit,ordered_qty,received_qty }
  const [poQ, setPoQ] = useState("");
  const [poSite, setPoSite] = useState("all");     // update271: PO picker filters
  const [poVendor, setPoVendor] = useState("all");
  const [saving, setSaving] = useState(false);
  const [aiNote, setAiNote] = useState("");

  const load = () => getDeliveryChallans().then(async r => { setRows(r); setRates(await priceDcLines(r)); })
    .catch(e => { setRows([]); setErr(e.message); });   // update272b: loader errors land in the red banner, not an empty page
  useEffect(() => {
    const s = getSession(); if (!s) { window.location.replace("/login"); return; }
    setSession(s);
    load(); getChallanPOs().then(setPos); getTallySettings().then(setTally);
    getClients({ activeOnly: true }).then(list => { setClients(list); const m = {}; list.forEach(c => (c.sites || []).forEach(s => { m[String(s.id)] = c.id; })); setSiteClient(m); }).catch(e => setErr(e.message));
  }, []);

  function pickPO(p) {
    setHead(h => ({ ...h, po_id: p.id, vendor_name: p.vendor }));
    // update271: prefill only what a NEW challan may carry — pending minus what is already
    // on an unconverted challan. Fully covered lines don't appear at all.
    setLines(p.items.filter(i => (i.remaining_qty ?? i.pending_qty) > 0).map(i => ({
      po_item_id: i.po_item_id, item_id: i.item_id, item_name: i.item_name, unit: i.unit,
      ordered_qty: i.remaining_qty ?? i.pending_qty, received_qty: i.remaining_qty ?? i.pending_qty })));
  }

  async function runExtract(f) {
    setReading(true); setAiNote(""); setErr("");
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
      const resp = await fetch("/api/dc-extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data_base64: b64, media_type: f.type }) });
      const j = await resp.json();
      if (!j.ok) {
        setAiNote(j.error === "no_key"
          ? "Auto-read is not switched on yet (needs the ANTHROPIC_API_KEY in Vercel — see my note). Fill the fields manually beside your uploaded photo."
          : j.error);
        setHead(h => ({ ...h, source: "auto", confidence: null })); setCtab("manual"); return;
      }
      // match to an open PO: vendor similarity + item-name overlap
      let best = null, bestScore = 0;
      pos.forEach(p => {
        let sc = sim(p.vendor, j.vendor) * 2;
        (j.items || []).forEach(it => { if (p.items.some(pi => sim(pi.item_name, it.name) >= 0.6)) sc += 1; });
        if (sc > bestScore) { bestScore = sc; best = p; }
      });
      let newLines = [], conf = 0;
      if (best) {
        const used = new Set();
        newLines = best.items.filter(i => i.pending_qty > 0).map(i => {
          const hit = (j.items || []).find((it, ix) => !used.has(ix) && sim(i.item_name, it.name) >= 0.6);
          if (hit) used.add((j.items || []).indexOf(hit));
          return { po_item_id: i.po_item_id, item_id: i.item_id, item_name: i.item_name, unit: i.unit,
            ordered_qty: i.pending_qty, received_qty: hit ? Number(hit.qty) : 0 };
        });
        (j.items || []).forEach((it, ix) => { if (!used.has(ix)) newLines.push({ po_item_id: null, item_id: null, item_name: it.name, unit: it.unit || "", ordered_qty: 0, received_qty: Number(it.qty || 0) }); });
        const matched = newLines.filter(l => l.po_item_id && l.received_qty > 0).length;
        conf = Math.min(96, Math.round(100 * matched / Math.max((j.items || []).length, 1)));
      } else {
        newLines = (j.items || []).map(it => ({ po_item_id: null, item_id: null, item_name: it.name, unit: it.unit || "", ordered_qty: 0, received_qty: Number(it.qty || 0) }));
      }
      setHead({ vendor_name: j.vendor || best?.vendor || "", vendor_dc_no: j.dc_no || "", dc_date: j.date || new Date().toISOString().slice(0, 10), po_id: best?.id || null, source: "auto", confidence: conf });
      setLines(newLines);
      setAiNote(best ? "Matched to " + best.po_no + " — review the quantities below, everything is editable." : "Read the challan but found no matching open PO — pick one below or save without a PO.");
    } finally { setReading(false); }
  }

  async function save() {
    setSaving(true); setErr(""); setMsg("");
    let proof_path = null;
    if (file) { const up = await uploadDcProof(file, siteOfPo() || 0); if (up.error) { setErr(up.error); setSaving(false); return; } proof_path = up.path; }
    const po = pos.find(p => p.id === head.po_id);
    const res = await createDeliveryChallan({ ...head, site_id: po?.site_id || session?.site_id || null, proof_path }, lines);
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Saved " + res.dc_ref + (res.status === "mismatch" ? " — quantity mismatch flagged for review." : "."));
    setFile(null); setLines([]); setHead({ vendor_name: "", vendor_dc_no: "", dc_date: new Date().toISOString().slice(0, 10), po_id: null, source: "manual", confidence: null, dc_ref: "", client_id: "" });
    load();
  }
  const siteOfPo = () => pos.find(p => p.id === head.po_id)?.site_id;
  // update393: picking a PO pre-selects that site's client (still changeable)
  useEffect(() => { const sid = siteOfPo(); if (sid && !head.client_id && siteClient[String(sid)]) setHead(h => ({ ...h, client_id: String(siteClient[String(sid)]) })); }, [head.po_id, siteClient]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function saveEdit() {
    setEditBusy(true); setErr("");
    const r = await editDeliveryChallan(edit.id, edit);
    setEditBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setEdit(null); setMsg("Challan " + edit.dc_ref + " updated."); load();
  }

  // ---- listing filters
  const [fVendor, setFVendor] = useState("all"); const [fSite, setFSite] = useState("all");
  const [fFrom, setFFrom] = useState(""); const [fTo, setFTo] = useState("");
  const [fStatus, setFStatus] = useState("all"); const [fSource, setFSource] = useState("all"); const [q, setQ] = useState(() => { try { return new URLSearchParams(window.location.search).get("q") || ""; } catch { return ""; } });   // update410
  const [pg, setPg] = useState(1); const PAGE = 20; const [xp, setXp] = useState({}); const [moreF, setMoreF] = useState(false);   // update406
  useEffect(() => { setPg(1); }, [fVendor, fSite, fFrom, fTo, fStatus, fSource, q]);
  useEffect(() => { try { const sp = new URLSearchParams(window.location.search).get("site"); if (sp) setFSite(String(sp)); } catch {} }, []);
  const vendors = useMemo(() => [...new Set((rows || []).map(r => r.vendor).filter(Boolean))].sort(), [rows]);
  const siteOpts = useMemo(() => { const m = {}; (rows || []).forEach(r => { m[r.site_id] = r.site; }); return Object.entries(m); }, [rows]);
  const shown = useMemo(() => (rows || []).filter(r =>
    (fVendor === "all" || r.vendor === fVendor) &&
    (fSite === "all" || String(r.site_id) === String(fSite)) &&
    (!fFrom || r.date >= fFrom) && (!fTo || r.date <= fTo) &&
    (fStatus === "all" || (fStatus === "pending_grn" ? !r.grn_no : r.status === fStatus)) &&
    (fSource === "all" || r.source === fSource) &&
    (!q || (r.dc_ref + " " + r.vendor_dc_no + " " + r.po_no + " " + r.grn_no).toLowerCase().includes(q.toLowerCase()))
  ), [rows, fVendor, fSite, fFrom, fTo, fStatus, fSource, q]);
  const lineValue = l => Number(l.received_qty) * (rates[l.po_item_id] || 0);
  const recvValue = shown.reduce((t, r) => t + r.lines.reduce((s2, l) => s2 + lineValue(l), 0), 0);
  const stat = {
    total: shown.length,
    auto: shown.filter(r => r.source === "auto").length,
    manual: shown.filter(r => r.source === "manual").length,
    mism: shown.filter(r => r.status === "mismatch").length,
    pend: shown.filter(r => !r.grn_no).length,
  };

  function dlTally(list, name) {
    if (!tally) return;
    const withRates = list.map(d => ({ ...d, lines: d.lines.map(l => ({ ...l, rate: rates[l.po_item_id] || 0 })) }));
    const xml = dcTallyXml(withRates, tally);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "text/xml" })); a.download = name; a.click();
    setMsg("Tally file downloaded — import in Tally via Gateway → Import Data.");
  }
  const [conv, setConv] = useState(0);
  // update272: cancel a wrong challan — reason required; converted ones are refused (cancel the GRN instead)
  async function cancelDc(r) {
    const reason = prompt(`Cancel ${r.dc_ref}? The challan stays on record, struck out, and its material becomes deliverable again.\n\nReason (required):`);
    if (reason === null) return;
    const res = await cancelDeliveryChallan(r.id, reason);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(res.dc_ref + " cancelled."); load();
  }

  async function convert(r) {
    if (!confirm("Convert " + r.dc_ref + " into a GRN? Stock will be received with these quantities.")) return;
    setConv(r.id);
    const res = await convertDcToGrn(r); setConv(0);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(r.dc_ref + " converted → " + res.grn_no + " (visible in GRN Register)."); load();
  }

  const canCreate = session && (session.role === "director" || session.role === "it_executive" || canSeeModuleAnySite(session, "stock"));
  const stBadge = { matched: ["Matched", "p"], mismatch: ["Mismatch", "red"], pending: ["No PO", "warn"], cancelled: ["Cancelled", "a"] };   // update272

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        {/* update403/406: two challan flows on one page — pill tabs with icon + count */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ display: "inline-flex", background: "var(--gray-bg)", borderRadius: 8, padding: 3, gap: 2 }}>
            {[["vendor", "🚚", "Vendor challans", rows === null ? null : rows.length], ["internal", "🏭", "Internal transfers", idcCount]].map(([k, ic, l, n]) => (
              <button key={k} type="button" onClick={() => { setMainTab(k); try { const u = new URL(window.location.href); k === "internal" ? u.searchParams.set("tab", "internal") : u.searchParams.delete("tab"); window.history.replaceState(null, "", u.toString()); } catch {} }}
                style={{ border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: mainTab === k ? "#fff" : "transparent", color: mainTab === k ? "var(--text)" : "var(--muted)", fontWeight: mainTab === k ? 600 : 400, boxShadow: mainTab === k ? "0 0 0 1px var(--border)" : "none" }}>
                <span>{ic}</span>{l}{n != null && <span style={{ color: "var(--muted)", fontSize: 12 }}>{n}</span>}
              </button>))}
          </div>
          {mainTab === "vendor" && canCreate && <button type="button" onClick={() => setShowNew(v => !v)}>{showNew ? "🙈 Hide form" : "＋ New Delivery Challan"}</button>}
        </div>
        {mainTab === "internal" && <InternalDispatchTab session={session} onCount={setIdcCount} />}
        <div style={{ display: mainTab === "vendor" ? "block" : "none" }}>
        <h1 style={{ margin: "0 0 2px" }}>Delivery challans</h1>
        <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Match vendor challans against POs, then convert to GRN. Chain: PO → DC → GRN.</div>
        {msg && <div className="note green">{msg}</div>}
        {err && <div className="note red">{err}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
          {[["🧾", "Total challans", stat.total, null], ["⚡", "Auto-matched", stat.auto, null], ["✍", "Manual entries", stat.manual, null], ["⚠", "Qty mismatch", stat.mism, "amber"], ["⏳", "Pending → GRN", stat.pend, "blue"], ["₹", "Received value", inr(recvValue), null]].map(([ic, l, v, tone]) => (
            <div key={l} style={{ background: tone === "amber" ? "#FEF3C7" : tone === "blue" ? "#E8F0FE" : "#fff", border: "1px solid " + (tone === "amber" ? "#FDE68A" : tone === "blue" ? "#C7D7FE" : "var(--border)"), borderRadius: 12, padding: "12px 14px", color: tone === "amber" ? "#92400E" : tone === "blue" ? "#1D4ED8" : "inherit" }}>
              <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, opacity: tone ? 1 : .7 }}><span>{ic}</span>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={String(v)}>{v}</div>
            </div>))}
        </div>

        {canCreate && showNew && (
          <div style={{ background: "#F5F8FF", border: "1px solid #C7D7FE", borderRadius: 12, padding: 16, marginBottom: 18 }}>{/* update406: workflow card, accent tint */}
            <div style={{ fontSize: 13.5, color: "#1D4ED8", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>👆 Manual entry — pick a PO to match against</div>
            <div>
              {ctab === "upload" && (
                <div style={{ border: "2px dashed var(--copper)", background: "#fff8f2", borderRadius: 12, padding: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 26 }}>🖨️</div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <b style={{ color: "var(--copper)" }}>Drop the vendor's delivery challan here, or browse</b>
                    <div className="muted" style={{ fontSize: 12 }}>PDF, JPG or PNG · reads vendor, items &amp; quantities and matches an open PO. On the phone this opens the camera.</div>
                  </div>
                  <label style={{ background: "#0F1419", color: "#fff", borderRadius: 9, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    {reading ? "Reading…" : "Browse / Camera"}
                    <input type="file" accept="image/*,application/pdf" capture="environment" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); runExtract(f); } e.target.value = ""; }} />
                  </label>
                </div>
              )}
              {ctab === "manual" && (
                <div>
                  {file && <div className="note" style={{ background: "#fff8f2" }}>📎 {file.name} attached as proof{aiNote ? " — " + aiNote : ""}</div>}
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>{/* update271: site + vendor filters */}
                    <select value={poSite} onChange={e => setPoSite(e.target.value)} style={{ flex: "1 1 140px" }}>
                      <option value="all">Site: all</option>
                      {[...new Set(pos.map(p => p.site).filter(Boolean))].sort().map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={poVendor} onChange={e => setPoVendor(e.target.value)} style={{ flex: "1 1 160px" }}>
                      <option value="all">Vendor: all</option>
                      {[...new Set(pos.map(p => p.vendor).filter(Boolean))].sort().map(v2 => <option key={v2} value={v2}>{v2}</option>)}
                    </select>
                    <input placeholder="🔎 Search PO number…" value={poQ} onChange={e => setPoQ(e.target.value)} style={{ flex: "2 1 200px" }} />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }}>
                    {pos.filter(p => (poSite === "all" || p.site === poSite) && (poVendor === "all" || p.vendor === poVendor)
                        && (!poQ || (p.po_no + " " + p.vendor + " " + (p.site || "")).toLowerCase().includes(poQ.toLowerCase()))).slice(0, 40).map(p => (
                      <div key={p.id} onClick={() => pickPO(p)}
                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: head.po_id === p.id ? "#fff3e8" : "#fff", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <span><b>{p.po_no}</b> · {p.vendor}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{p.site || ""} · {p.pending_items} item(s) pending</span>
                      </div>
                    ))}
                    {pos.length === 0 && <div className="muted" style={{ padding: 10 }}>No approved POs with pending material anywhere — approve a PO first, or check with the Director.</div>}
                  </div>
                </div>
              )}

              {aiNote && ctab === "upload" && <div className="note" style={{ marginTop: 10 }}>{aiNote}</div>}
              {(lines.length > 0 || head.po_id) && (
                <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                    <div><div className="muted" style={{ fontSize: 10.5 }}>Vendor</div><input value={head.vendor_name} onChange={e => setHead(h => ({ ...h, vendor_name: e.target.value }))} style={{ fontWeight: 700 }} /></div>
                    <div><div className="muted" style={{ fontSize: 10.5 }}>Vendor DC No.</div><input style={{ width: 120 }} value={head.vendor_dc_no} onChange={e => setHead(h => ({ ...h, vendor_dc_no: e.target.value }))} /></div>
                    <div><div className="muted" style={{ fontSize: 10.5 }}>DC date</div><input type="date" value={head.dc_date} onChange={e => setHead(h => ({ ...h, dc_date: e.target.value }))} /></div>
                    <div><div className="muted" style={{ fontSize: 10.5 }}>DC No. <span title="Leave blank for the next PSP series number">(blank = auto)</span></div><input style={{ width: 150 }} placeholder="auto" value={head.dc_ref} onChange={e => setHead(h => ({ ...h, dc_ref: e.target.value }))} /></div>
                    <div><div className="muted" style={{ fontSize: 10.5 }}>Client</div>
                      <select value={head.client_id || ""} onChange={e => setHead(h => ({ ...h, client_id: e.target.value }))} style={{ minWidth: 180 }}>
                        <option value="">— none —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select></div>
                    <div><div className="muted" style={{ fontSize: 10.5 }}>Matched PO</div><b>{pos.find(p => p.id === head.po_id)?.po_no || "—"}</b></div>
                    {head.confidence !== null && <span className="badge p">✓ {head.confidence}% match confidence</span>}
                  </div>
                  {clientOf(head.client_id) && (() => { const c = clientOf(head.client_id); const sb = shipBlock(c); return (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, background: "#f6f7fb", borderRadius: 8, padding: "8px 10px", marginBottom: 8, fontSize: 12 }}>
                      <div><div className="muted" style={{ fontSize: 10.5 }}>Bill to</div><b>{c.company_name || c.name}</b>{addrLines({ line1: c.bill_line1, line2: c.bill_line2, city: c.bill_city, pincode: c.bill_pincode }).map((l, i) => <div key={i}>{l}</div>)}{c.gstin && <div>GSTIN: {c.gstin}</div>}</div>
                      <div><div className="muted" style={{ fontSize: 10.5 }}>Ship to</div><b>{c.name}</b>{addrLines(sb).map((l, i) => <div key={i}>{l}</div>)}{(c.contact_name || c.mobile) && <div>{[c.contact_name, c.mobile].filter(Boolean).join(" · ")}</div>}</div>
                    </div>); })()}
                  <table className="dt-compact" style={{ width: "100%" }}>
                    <thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Received (editable)</th><th>Unit</th><th>Match</th></tr></thead>
                    <tbody>
                      {lines.map((l, i) => { const d = Number(l.received_qty) - Number(l.ordered_qty); return (
                        <tr key={i}>
                          <td>{l.item_name}{!l.po_item_id && <span className="badge warn" style={{ marginLeft: 6 }}>not on PO</span>}</td>
                          <td className="num">{l.ordered_qty || "—"}</td>
                          <td className="num"><input inputMode="decimal" style={{ width: 74, textAlign: "right" }} value={l.received_qty}
                            onChange={e => setLines(ar => ar.map((x, j) => j === i ? { ...x, received_qty: e.target.value } : x))} /></td>
                          <td>{l.unit}</td>
                          <td>{!l.ordered_qty ? <span className="muted">—</span> : d === 0 ? <span style={{ color: "var(--green)", fontWeight: 700 }}>✓ OK</span> : d < 0 ? <span style={{ color: "var(--red)", fontWeight: 700 }}>⚠ Short by {-d}</span> : <span style={{ color: "var(--amber)", fontWeight: 700 }}>⚠ Excess by {d}</span>}</td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                  <button className="primary" disabled={saving} style={{ width: "100%", marginTop: 10, padding: "11px 0", fontWeight: 800 }} onClick={save}>
                    {saving ? "Saving…" : "✓ Confirm & Save Delivery Challan"}</button>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "0 10px", height: 36 }}><span className="muted">🔍</span><input placeholder="Search PO / DC / GRN no…" value={q} onChange={e => setQ(e.target.value)} style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontSize: 13 }} /></div>
            <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ height: 36 }}><option value="all">Status: all</option><option value="matched">Matched</option><option value="mismatch">Mismatch</option><option value="pending">No PO</option><option value="pending_grn">Pending → GRN</option><option value="cancelled">Cancelled</option></select>
            <button type="button" className={moreF ? "primary" : ""} style={{ height: 36 }} onClick={() => setMoreF(m => !m)}>⚙ More filters{(fVendor !== "all" || fSite !== "all" || fFrom || fTo || fSource !== "all") ? " •" : ""}</button>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <a href={"/stock/dc-print?ids=" + shown.map(r => r.id).join(",")} target="_blank" rel="noreferrer"><button type="button" style={{ height: 36 }} disabled={!shown.length}>🖨 Print</button></a>
              <button type="button" style={{ height: 36 }} disabled={!shown.length || !tally} onClick={() => dlTally(shown, "delivery_challans_batch.xml")}>🔄 Tally batch</button>
            </span>
          </div>
          {moreF && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <select value={fVendor} onChange={e => setFVendor(e.target.value)}><option value="all">Vendor: all</option>{vendors.map(v => <option key={v} value={v}>{v}</option>)}</select>
              <select value={fSite} onChange={e => setFSite(e.target.value)}><option value="all">Site: all</option>{siteOpts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
              <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} /><span className="muted" style={{ fontSize: 11 }}>to</span><input type="date" value={fTo} onChange={e => setFTo(e.target.value)} />
              <select value={fSource} onChange={e => setFSource(e.target.value)}><option value="all">Source: all</option><option value="auto">Auto</option><option value="manual">Manual</option></select>
              <button type="button" style={{ fontSize: 11.5, marginLeft: "auto" }} onClick={() => { setFVendor("all"); setFSite("all"); setFFrom(""); setFTo(""); setFSource("all"); }}>Clear</button>
            </div>
          )}
          {!rows ? <div className="muted">Loading…</div> : shown.length === 0 ? <div className="muted">No delivery challans match.</div> : (
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <style>{`.dc406 tbody tr.dc-row:hover td { background: #FAFAFC; } .dc406 th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 500; padding: 10px 12px; background: var(--gray-bg); } .dc406 td { padding: 11px 12px; font-size: 13px; border-top: 1px solid var(--border); vertical-align: middle; } .dc406 .ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } @media (max-width: 720px) { .dc406 .hide-m { display: none; } }`}</style>
              <table className="dc406" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "24%" }} /><col style={{ width: "26%" }} /><col className="hide-m" style={{ width: "20%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /></colgroup>
                <thead><tr><th>DC ref</th><th>Vendor</th><th className="hide-m">Against PO</th><th style={{ textAlign: "right" }}>Qty</th><th>Match</th></tr></thead>
                <tbody>
                  {shown.slice((pg - 1) * PAGE, pg * PAGE).map(r => { const [sl] = stBadge[r.status] || ["?"]; const tone = r.status === "matched" ? ["#DCFCE7", "#15803D"] : r.status === "mismatch" ? ["#FEE2E2", "#B91C1C"] : r.status === "pending" ? ["#FEF3C7", "#92400E"] : ["#F3F4F6", "#6B7280"]; const o = !!xp[r.id]; return (
                    <Fragment key={r.id}>
                    <tr className="dc-row" onClick={() => setXp(x => ({ ...x, [r.id]: !x[r.id] }))} style={{ cursor: "pointer", opacity: r.status === "cancelled" ? 0.6 : 1, background: o ? "#FAFAFC" : undefined }} title={r.status === "cancelled" ? ("Cancelled" + (r.cancelled_by ? " by " + r.cancelled_by : "") + (r.cancel_reason ? " — " + r.cancel_reason : "")) : undefined}>
                      <td className="ell"><span style={{ fontWeight: 600, textDecoration: r.status === "cancelled" ? "line-through" : "none" }}>{o ? "▾ " : "▸ "}{r.dc_ref}</span><br /><span className="muted" style={{ fontSize: 11 }}>{r.date} · {r.site}</span></td>
                      <td className="ell" onClick={e => e.stopPropagation()}><VendorLink name={r.vendor} />{r.vendor_dc_no && <div className="muted" style={{ fontSize: 10.5 }}>vendor DC {r.vendor_dc_no}</div>}</td>
                      <td className="ell hide-m muted">{r.po_no || "No PO"}</td>
                      <td style={{ textAlign: "right" }}><b>{r.recv}</b>/{r.ord || "—"}</td>
                      <td><span style={{ background: tone[0], color: tone[1], fontSize: 11, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{sl}</span>{!r.grn_no && r.status !== "cancelled" && <span style={{ background: "#E8F0FE", color: "#1D4ED8", fontSize: 11, padding: "2px 8px", borderRadius: 999, marginLeft: 4, whiteSpace: "nowrap" }}>→ GRN</span>}</td>
                    </tr>
                    {o && (
                      <tr><td colSpan={5} style={{ background: "#FAFAFC", padding: "10px 14px 14px" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, fontSize: 12.5, marginBottom: 10 }}>
                          <div><div className="muted" style={{ fontSize: 11 }}>Against PO</div>{r.po_no || <span className="muted">No PO</span>}</div>
                          <div><div className="muted" style={{ fontSize: 11 }}>Client</div>{r.client || "—"}</div>
                          <div><div className="muted" style={{ fontSize: 11 }}>Source</div><span className={"badge " + (r.source === "auto" ? "info" : "gray")}>{r.source === "auto" ? "Auto" : "Manual"}</span></div>
                          <div><div className="muted" style={{ fontSize: 11 }}>Proof</div>{r.proof ? <a href={dcProofUrl(r.proof)} target="_blank" rel="noreferrer">🖼 open</a> : <span className="muted">none</span>}</div>
                          <div><div className="muted" style={{ fontSize: 11 }}>GRN</div>{r.grn_no ? <a href="/stock/grn" title="Open GRN Register"><span className="badge p">{r.grn_no}</span></a> : <span className="muted">not yet converted</span>}</div>
                          <div><div className="muted" style={{ fontSize: 11 }}>Lines</div>{r.lines.length} item(s) · {r.recv} recd / {r.ord || "—"} ordered</div>
                        </div>
                        {r.status === "cancelled" && <div className="note red" style={{ marginBottom: 8 }}>Cancelled{r.cancelled_by ? " by " + r.cancelled_by : ""}{r.cancel_reason ? " — " + r.cancel_reason : ""}</div>}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <a href={"/stock/dc-print?ids=" + r.id} target="_blank" rel="noreferrer"><button type="button" style={{ fontSize: 11.5 }}>🖨 Print / PDF</button></a>
                          <button type="button" style={{ fontSize: 11.5 }} disabled={!tally} onClick={() => dlTally([r], r.dc_ref.replace(/\//g, "-") + ".xml")}>📊 Tally XML</button>
                          {!r.grn_no && r.status !== "cancelled" && canCreate && <button type="button" style={{ fontSize: 11.5 }} onClick={() => setEdit({ id: r.id, dc_ref: r.dc_ref, dc_date: r.date, client_id: r.client_id || "", vendor_dc_no: r.vendor_dc_no || "" })}>✎ Edit</button>}
                          {!r.grn_no && r.status !== "cancelled" && canCreate && <button type="button" className="primary" style={{ fontSize: 11.5 }} disabled={conv === r.id} onClick={() => convert(r)}>{conv === r.id ? "…" : "Convert → GRN"}</button>}
                          {!r.grn_no && r.status !== "cancelled" && canCreate && <button type="button" style={{ fontSize: 11.5, color: "var(--red)", borderColor: "var(--red)" }} onClick={() => cancelDc(r)}>✕ Cancel</button>}
                        </div>
                      </td></tr>
                    )}
                    </Fragment>
                  ); })}
                </tbody>
              </table>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>Showing {Math.min((pg - 1) * PAGE + 1, shown.length)}–{Math.min(pg * PAGE, shown.length)} of {shown.length} · tap a row for GRN, proof and source</span>
                <div style={{ display: "flex", gap: 4 }}><button type="button" style={{ padding: "5px 9px" }} disabled={pg <= 1} onClick={() => setPg(p => p - 1)}>‹</button><button type="button" style={{ padding: "5px 9px" }} disabled={pg * PAGE >= shown.length} onClick={() => setPg(p => p + 1)}>›</button></div>
              </div>
            </div>
          )}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Value uses each item's PO rate. 🖨 opens the letterhead document — use Print → Save as PDF for a file (works the same on Android, via the share sheet). Converting creates a real GRN through the same engine as the GRN Register.</div>
        </div>
              {edit && (   /* update393: edit header of an unconverted challan */
          <div onClick={() => !editBusy && setEdit(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }}>
            <div onClick={e => e.stopPropagation()} className="panel" style={{ width: "min(460px,100%)", margin: 0 }}>
              <h2 style={{ marginTop: 0 }}>Edit challan</h2>
              <div style={{ display: "grid", gap: 10 }}>
                <div><label className="muted">DC No.</label><input style={{ width: "100%", boxSizing: "border-box", fontWeight: 700 }} value={edit.dc_ref} onChange={e => setEdit(x => ({ ...x, dc_ref: e.target.value }))} /></div>
                <div><label className="muted">DC date</label><input type="date" style={{ width: "100%", boxSizing: "border-box" }} value={edit.dc_date || ""} onChange={e => setEdit(x => ({ ...x, dc_date: e.target.value }))} /></div>
                <div><label className="muted">Client</label><select style={{ width: "100%" }} value={edit.client_id || ""} onChange={e => setEdit(x => ({ ...x, client_id: e.target.value }))}><option value="">— none —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="muted">Vendor DC No.</label><input style={{ width: "100%", boxSizing: "border-box" }} value={edit.vendor_dc_no} onChange={e => setEdit(x => ({ ...x, vendor_dc_no: e.target.value }))} /></div>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Line items are locked (they drive GRN pending). Converted challans cannot be edited — cancel and re-issue instead.</div>
              {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button onClick={() => setEdit(null)} disabled={editBusy}>Cancel</button>
                <button className="primary" onClick={saveEdit} disabled={editBusy || !String(edit.dc_ref).trim()}>{editBusy ? "Saving…" : "Save changes"}</button>
              </div>
            </div>
          </div>
        )}
        </div>{/* update403: end vendor tab */}
      </main>
    </div>
  );
}
