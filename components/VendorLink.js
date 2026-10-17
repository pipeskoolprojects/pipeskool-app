"use client";
// update410: a vendor name that opens the full vendor profile (stats + clickable activity timeline).
// Use <VendorLink name="…" /> anywhere a vendor appears — PO list, GRN register, challans.
import { useEffect, useState } from "react";
import { getVendorProfile } from "@/lib/vendorProfile";
import { inr } from "@/lib/data";

const KIND = { po: ["PO", "#E8F0FE", "#1D4ED8"], grn: ["GRN", "#DCFCE7", "#15803D"], dc: ["Challan", "#EDE9FE", "#6D28D9"], pay: ["Payment", "#FFF3E8", "#C2410C"] };
const href = a => a.kind === "po" ? `/procure?po=${encodeURIComponent(a.ref)}` : a.kind === "grn" ? `/stock/grn?q=${encodeURIComponent(a.ref)}` : a.kind === "dc" ? `/stock/challans?q=${encodeURIComponent(a.ref)}` : `/expenses?tab=vendor&q=${encodeURIComponent(a.ref)}`;
const dmy = k => k ? String(k).slice(0, 10).split("-").reverse().join("/") : "";

export function VendorProfile({ name, onClose }) {
  const [p, setP] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { getVendorProfile(name).then(setP).catch(e => setErr(e.message)); }, [name]);
  const initials = String(name || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, padding: 12 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#F5F8FF", border: "1px solid #C7D7FE", borderRadius: 12, width: "min(640px,100%)", maxHeight: "92vh", overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8F0FE", color: "#1D4ED8", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{name}</div><div className="muted" style={{ fontSize: 11.5 }}>{p?.vendor ? [p.vendor.contact_name, p.vendor.mobile, p.vendor.gstin && "GSTIN " + p.vendor.gstin].filter(Boolean).join(" · ") || "Vendor profile" : "Vendor profile"}{p && !p.vendor && " · not in Vendor Master (typed name)"}</div></div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 18 }}>✕</button>
        </div>
        {err && <div className="note red">{err}</div>}
        {!p && !err ? <div className="muted">Loading…</div> : p && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
            {(p.canViewPrices === false ? [["Total POs", p.totalPos], ["GRNs", p.grnCount], ["Challans", p.dcCount]] : [["Total POs", p.totalPos], ["Total value", inr(p.totalValue)], ["Outstanding", inr(p.outstanding)]]).map(([l, v]) => <div key={l} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}><span className="muted" style={{ fontSize: 11, display: "block" }}>{l}</span><b>{v}</b></div>)}
          </div>
          {p.canViewPrices !== false && <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>Outstanding = live PO value − direct vendor payments marked paid ({inr(p.paid)}). {p.grnCount} GRN(s) · {p.dcCount} challan(s).</div>}
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Recent activity — click any entry to open it</div>
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8 }}>
            {p.activity.length === 0 ? <div className="muted" style={{ padding: 10 }}>No transactions yet.</div> : p.activity.slice(0, 60).map((a, i) => { const [kl, bg, fg] = KIND[a.kind]; return (
              <a key={i} href={href(a)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderTop: i ? "1px solid var(--border)" : "none", textDecoration: "none", color: "inherit" }}>
                <span style={{ background: bg, color: fg, fontSize: 10.5, padding: "2px 7px", borderRadius: 999, flexShrink: 0, width: 52, textAlign: "center" }}>{kl}</span>
                <span style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.text} <span style={{ color: "#1D4ED8", fontSize: 11 }}>↗</span></div><div className="muted" style={{ fontSize: 11 }}>{a.sub}</div></span>
                <span className="muted" style={{ fontSize: 11.5, flexShrink: 0 }}>{dmy(a.at)}</span>
              </a>); })}
          </div>
        </>)}
      </div>
    </div>
  );
}
export default function VendorLink({ name, style }) {
  const [open, setOpen] = useState(false);
  if (!name) return <span className="muted">—</span>;
  return (<>
    <a href="#" onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} title="Open vendor profile" style={{ color: "#1D4ED8", textDecoration: "underline", fontWeight: 500, ...style }}>{name} <span style={{ fontSize: 10 }}>↗</span></a>
    {open && <VendorProfile name={name} onClose={() => setOpen(false)} />}
  </>);
}
