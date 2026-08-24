"use client";
// update215: DELIVERY CHALLAN module — vendor challan in (photo/AI or manual vs PO),
// listed + filtered, then Convert -> GRN. Print / PDF / Tally per row and in bulk.
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getOpenPOs } from "@/lib/stock";
import { createDeliveryChallan, getDeliveryChallans, convertDcToGrn, uploadDcProof, dcProofUrl, priceDcLines, dcTallyXml } from "@/lib/challan";
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
  const [ctab, setCtab] = useState("upload");            // upload | manual
  const [showNew, setShowNew] = useState(true);

  // ---- create state (shared preview for both paths)
  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [head, setHead] = useState({ vendor_name: "", vendor_dc_no: "", dc_date: new Date().toISOString().slice(0, 10), po_id: null, source: "manual", confidence: null });
  const [lines, setLines] = useState([]);                // { po_item_id,item_id,item_name,unit,ordered_qty,received_qty }
  const [poQ, setPoQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiNote, setAiNote] = useState("");

  const load = () => getDeliveryChallans().then(async r => { setRows(r); setRates(await priceDcLines(r)); });
  useEffect(() => {
    const s = getSession(); if (!s) { window.location.replace("/login"); return; }
    setSession(s);
    load(); getOpenPOs().then(setPos); getTallySettings().then(setTally);
  }, []);

  function pickPO(p) {
    setHead(h => ({ ...h, po_id: p.id, vendor_name: p.vendor }));
    setLines(p.items.filter(i => i.pending_qty > 0).map(i => ({
      po_item_id: i.po_item_id, item_id: i.item_id, item_name: i.item_name, unit: i.unit,
      ordered_qty: i.pending_qty, received_qty: i.pending_qty })));
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
    setFile(null); setLines([]); setHead({ vendor_name: "", vendor_dc_no: "", dc_date: new Date().toISOString().slice(0, 10), po_id: null, source: "manual", confidence: null });
    load();
  }
  const siteOfPo = () => pos.find(p => p.id === head.po_id)?.site_id;

  // ---- listing filters
  const [fVendor, setFVendor] = useState("all"); const [fSite, setFSite] = useState("all");
  const [fFrom, setFFrom] = useState(""); const [fTo, setFTo] = useState("");
  const [fStatus, setFStatus] = useState("all"); const [fSource, setFSource] = useState("all"); const [q, setQ] = useState("");
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
  async function convert(r) {
    if (!confirm("Convert " + r.dc_ref + " into a GRN? Stock will be received with these quantities.")) return;
    setConv(r.id);
    const res = await convertDcToGrn(r); setConv(0);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(r.dc_ref + " converted → " + res.grn_no + " (visible in GRN Register)."); load();
  }

  const canCreate = session && (session.role === "director" || session.role === "it_executive" || canSeeModuleAnySite(session, "stock"));
  const stBadge = { matched: ["Matched", "p"], mismatch: ["Mismatch", "red"], pending: ["No PO", "warn"] };

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <div><h1>Delivery challans</h1>
            <div className="muted" style={{ fontSize: 12.5 }}>Match vendor delivery challans against your POs — upload to auto-fill, or enter manually — then convert to GRN. Chain: PO → DC → GRN.</div></div>
          {canCreate && <button className="primary" onClick={() => setShowNew(v => !v)}>{showNew ? "Hide form" : "+ New Delivery Challan"}</button>}
        </div>
        {msg && <div className="note green">{msg}</div>}
        {err && <div className="note red">{err}</div>}

        <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
          {[["🧾 Total challans", stat.total, "this filter"], ["⚡ Auto-matched", stat.auto, "from uploaded DCs"], ["✍ Manual entries", stat.manual, "entered by hand"], ["⚠ Qty mismatch", stat.mism, "needs review"], ["⏳ Pending → GRN", stat.pend, "not yet converted"], ["₹ Received value", inr(recvValue), "PO rates, this filter"]].map(([l, v, sub]) => (
            <div className="card" key={l}><div className="muted" style={{ fontSize: 11 }}>{l}</div><b style={{ fontSize: 18 }}>{v}</b><div className="muted" style={{ fontSize: 10.5 }}>{sub}</div></div>
          ))}
        </div>

        {canCreate && showNew && (
          <div className="panel" style={{ padding: 0 }}>
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
              {[["upload", "📷 Upload Vendor Challan — Auto-fill"], ["manual", "✍ Manual Entry — Select PO"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setCtab(k)}
                  style={{ flex: 1, border: "none", background: "none", padding: "12px", fontSize: 13, cursor: "pointer", fontWeight: ctab === k ? 800 : 600, color: ctab === k ? "var(--copper)" : "var(--muted)", borderBottom: ctab === k ? "3px solid var(--copper)" : "3px solid transparent" }}>{l}</button>
              ))}
            </div>
            <div style={{ padding: 16 }}>
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
                  <input placeholder="🔎 Search PO by number / vendor / site…" value={poQ} onChange={e => setPoQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
                  <div style={{ maxHeight: 170, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
                    {pos.filter(p => !poQ || (p.po_no + " " + p.vendor + " " + (p.site || "")).toLowerCase().includes(poQ.toLowerCase())).slice(0, 40).map(p => (
                      <div key={p.id} onClick={() => pickPO(p)}
                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: head.po_id === p.id ? "#fff3e8" : "#fff", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <span><b>{p.po_no}</b> · {p.vendor}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{p.site || ""} · {p.pending_items} item(s) pending</span>
                      </div>
                    ))}
                    {pos.length === 0 && <div className="muted" style={{ padding: 10 }}>No open approved POs.</div>}
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
                    <div><div className="muted" style={{ fontSize: 10.5 }}>Matched PO</div><b>{pos.find(p => p.id === head.po_id)?.po_no || "—"}</b></div>
                    {head.confidence !== null && <span className="badge p">✓ {head.confidence}% match confidence</span>}
                  </div>
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

        <div className="panel">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <select value={fVendor} onChange={e => setFVendor(e.target.value)}><option value="all">Vendor: all</option>{vendors.map(v => <option key={v} value={v}>{v}</option>)}</select>
            <select value={fSite} onChange={e => setFSite(e.target.value)}><option value="all">Site: all</option>{siteOpts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
            <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} /><span className="muted" style={{ fontSize: 11 }}>to</span>
            <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} />
            <select value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="all">Status: all</option><option value="matched">Matched</option><option value="mismatch">Mismatch</option><option value="pending">No PO</option><option value="pending_grn">Pending → GRN</option></select>
            <select value={fSource} onChange={e => setFSource(e.target.value)}><option value="all">Source: all</option><option value="auto">Auto</option><option value="manual">Manual</option></select>
            <input placeholder="PO / DC / GRN no… 🔎" value={q} onChange={e => setQ(e.target.value)} style={{ width: 150 }} />
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <a href={"/stock/dc-print?ids=" + shown.map(r => r.id).join(",")} target="_blank" rel="noreferrer"><button type="button" style={{ fontSize: 12 }} disabled={!shown.length}>🖨 Print / ⬇ PDF (filtered {shown.length})</button></a>
              <button type="button" style={{ fontSize: 12 }} disabled={!shown.length || !tally} onClick={() => dlTally(shown, "delivery_challans_batch.xml")}>📊 Tally batch</button>
            </span>
          </div>
          {!rows ? <div className="muted">Loading…</div> : shown.length === 0 ? <div className="muted">No delivery challans match.</div> : (
            <div className="dt-scroll" style={{ maxHeight: "60vh" }}>
              <table className="dt-compact" style={{ width: "100%" }}>
                <thead><tr><th>DC Ref</th><th>Date</th><th>Site</th><th>Vendor</th><th>Against PO</th><th className="num">Qty (Recv/Ord)</th><th>Match</th><th>Source</th><th>Proof</th><th>GRN</th><th>Actions</th></tr></thead>
                <tbody>
                  {shown.map(r => { const [sl, sc] = stBadge[r.status] || ["?", "gray"]; return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 700 }}>{r.dc_ref}{r.vendor_dc_no && <div className="muted" style={{ fontSize: 10.5 }}>vendor: {r.vendor_dc_no}</div>}</td>
                      <td className="muted">{r.date}</td>
                      <td>{r.site}</td>
                      <td>{r.vendor}</td>
                      <td>{r.po_no || <span className="badge warn">No PO</span>}</td>
                      <td className="num"><b>{r.recv}</b> / {r.ord || "—"}</td>
                      <td><span className={"badge " + sc}>{sl}</span></td>
                      <td><span className={"badge " + (r.source === "auto" ? "info" : "gray")}>{r.source === "auto" ? "Auto" : "Manual"}</span></td>
                      <td>{r.proof ? <a href={dcProofUrl(r.proof)} target="_blank" rel="noreferrer">🖼</a> : <span className="muted">—</span>}</td>
                      <td>{r.grn_no ? <span className="badge p" title="Open GRN Register to view">{r.grn_no}</span> : <span className="muted">—</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <a href={"/stock/dc-print?ids=" + r.id} target="_blank" rel="noreferrer" title="Print / save as PDF"><button type="button" style={{ fontSize: 11.5, marginRight: 4 }}>🖨</button></a>
                        <button type="button" style={{ fontSize: 11.5, marginRight: 4 }} title="Tally XML" disabled={!tally} onClick={() => dlTally([r], r.dc_ref.replace(/\//g, "-") + ".xml")}>📊</button>
                        {!r.grn_no && canCreate && <button type="button" style={{ fontSize: 11.5, fontWeight: 700 }} disabled={conv === r.id} onClick={() => convert(r)}>{conv === r.id ? "…" : "Convert → GRN"}</button>}
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Value uses each item's PO rate. 🖨 opens the letterhead document — use Print → Save as PDF for a file (works the same on Android, via the share sheet). Converting creates a real GRN through the same engine as the GRN Register.</div>
        </div>
      </main>
    </div>
  );
}
