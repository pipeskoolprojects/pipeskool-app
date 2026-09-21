"use client";
// update405: NEW GRN quick entry — site + vendor with recent chips, open-PO suggestions, challan no.
// with recent history; hands the choices to the existing GRN form on /stock (StockEntry) via sessionStorage.
import { useEffect, useMemo, useState } from "react";
import { getOpenPOs } from "@/lib/stock";
import { getVendors } from "@/lib/vendors";

const RK = "psk_grn_recent";
const recent = () => { try { return JSON.parse(localStorage.getItem(RK) || "{}"); } catch { return {}; } };
export default function GrnQuickEntry({ sites, rows, onClose }) {
  const rc = recent();
  const [site, setSite] = useState(rc.site || ""); const [vendor, setVendor] = useState(rc.vendor || ""); const [vq, setVq] = useState("");
  const [pos, setPos] = useState(null); const [po, setPo] = useState(""); const [challan, setChallan] = useState(""); const [cdate, setCdate] = useState("");
  const [vendors, setVendors] = useState([]);
  useEffect(() => { getVendors().then(v => setVendors((v || []).map(x => x.name).filter(Boolean))).catch(() => {}); }, []);
  useEffect(() => { setPos(null); setPo(""); if (site) getOpenPOs(site).then(setPos).catch(() => setPos([])); }, [site]);
  const recentVendors = useMemo(() => [...new Set(rows.map(g => g.vendor).filter(Boolean))].slice(0, 6), [rows]);
  const recentSites = useMemo(() => [...new Set(rows.map(g => g.site_id).filter(Boolean))].slice(0, 5).map(id => sites.find(s => String(s.id) === String(id))).filter(Boolean), [rows, sites]);
  const suggested = useMemo(() => (pos || []).filter(p => !vendor || String(p.vendor || "").toLowerCase() === vendor.toLowerCase()), [pos, vendor]);
  const challanHistory = useMemo(() => [...new Set(rows.filter(g => !vendor || g.vendor === vendor).map(g => g.challan_no).filter(Boolean))].slice(0, 8), [rows, vendor]);
  const vendorHits = useMemo(() => { const s = vq.trim().toLowerCase(); return s ? vendors.filter(v => v.toLowerCase().includes(s)).slice(0, 8) : []; }, [vq, vendors]);
  function go() {
    const chosen = suggested.find(p => String(p.id) === String(po)) || null;
    const pre = { site_id: site, po_id: chosen?.id || null, vendor: chosen?.vendor || vendor, challan_no: challan, challan_date: cdate };
    try { sessionStorage.setItem("psk_grn_prefill", JSON.stringify(pre)); localStorage.setItem(RK, JSON.stringify({ site, vendor: pre.vendor })); } catch {}
    window.location.href = "/stock?grn=1";
  }
  const inp = { width: "100%", boxSizing: "border-box" };
  const Chip = ({ on, children, onClick }) => <button type="button" onClick={onClick} className={on ? "primary" : ""} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 999 }}>{children}</button>;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(560px,100%)", padding: 20, border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h2 style={{ margin: 0 }}>New GRN</h2><button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 18 }}>✕</button></div>
        {recentSites.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}><span className="muted" style={{ fontSize: 12 }}>Recent sites:</span>{recentSites.map(s => <Chip key={s.id} on={String(site) === String(s.id)} onClick={() => setSite(String(s.id))}>{s.name}</Chip>)}</div>}
        <label className="muted">Site *</label><select style={{ ...inp, marginBottom: 10 }} value={site} onChange={e => setSite(e.target.value)}><option value="">— select —</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        {recentVendors.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}><span className="muted" style={{ fontSize: 12 }}>Recent vendors:</span>{recentVendors.map(v => <Chip key={v} on={vendor === v} onClick={() => { setVendor(v); setVq(""); }}>{v}</Chip>)}</div>}
        <label className="muted">Vendor</label>
        {vendor ? <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}><b>{vendor}</b><button type="button" style={{ fontSize: 11 }} onClick={() => setVendor("")}>change</button></div>
          : <div style={{ marginBottom: 10 }}><input style={inp} placeholder="Type to search the Vendor Master…" value={vq} onChange={e => setVq(e.target.value)} />{vendorHits.length > 0 && <div style={{ border: "1px solid var(--border)", borderRadius: 8, maxHeight: 150, overflowY: "auto" }}>{vendorHits.map(v => <div key={v} style={{ padding: "6px 10px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)" }} onClick={() => { setVendor(v); setVq(""); }}>{v}</div>)}</div>}</div>}
        <label className="muted">Open POs {site ? (pos === null ? "(loading…)" : `(${suggested.length}${vendor ? " for " + vendor : ""})`) : "(pick a site)"}</label>
        <select style={{ ...inp, marginBottom: 10 }} value={po} onChange={e => setPo(e.target.value)} disabled={!site}><option value="">Direct GRN — no PO</option>{suggested.map(p => <option key={p.id} value={p.id}>{p.po_no} · {p.vendor}{p.pending_items ? ` · ${p.pending_items} item(s) pending` : ""}</option>)}</select>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><label className="muted">Supplier challan no</label><input style={inp} list="grn-challan-hist" value={challan} onChange={e => setChallan(e.target.value)} placeholder="as printed on the challan" /><datalist id="grn-challan-hist">{challanHistory.map(c => <option key={c} value={c} />)}</datalist></div>
          <div><label className="muted">Challan date</label><input type="date" style={inp} value={cdate} onChange={e => setCdate(e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!site} onClick={go}>Continue → enter quantities</button></div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Quantities, rates and challan pages are entered on the next screen (the existing GRN form), pre-filled with these choices.</div>
      </div>
    </div>
  );
}
