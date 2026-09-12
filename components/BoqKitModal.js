"use client";
// update369: the KIT for one BOQ line — which Item Master materials it is built from, and
// how many of each per BOQ unit. "Allowed" = boq_qty × per-unit, shown live so the person
// mapping the line sees the site allowance they are creating.
import { useEffect, useState } from "react";
import { setBoqKit, removeBoqKit, suggestMaterials, searchMaterials } from "@/lib/boqMaterials";

const NAVY = "#1f2a4b";

export default function BoqKitModal({ row, kit, canEdit, onClose, onChanged }) {
  const [items, setItems] = useState(kit || []);
  const [sug, setSug] = useState([]);
  const [q, setQ] = useState(""); const [found, setFound] = useState([]);
  const [per, setPer] = useState({});
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => { suggestMaterials(row.description).then(setSug).catch(() => {}); }, [row.description]);
  useEffect(() => {
    if (!q.trim()) { setFound([]); return; }
    const t = setTimeout(() => searchMaterials(q).then(setFound).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);

  const inKit = id => items.some(x => Number(x.item_id) === Number(id));

  async function add(it, qtyPerUnit = 1) {
    setBusy(true); setErr("");
    const r = await setBoqKit(row.id, it.id, qtyPerUnit);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setItems(x => [...x.filter(y => Number(y.item_id) !== Number(it.id)),
      { item_id: it.id, name: it.display_name, type: it.item_type, unit: it.unit, qty_per_unit: qtyPerUnit }]);
    setQ(""); setFound([]); onChanged?.();
  }
  async function setQty(it, v) {
    const n = Number(v); if (!(n > 0)) return;
    const r = await setBoqKit(row.id, it.item_id, n);
    if (!r.ok) { setErr(r.error); return; }
    setItems(x => x.map(y => y.item_id === it.item_id ? { ...y, qty_per_unit: n } : y)); onChanged?.();
  }
  async function remove(it) {
    const r = await removeBoqKit(row.id, it.item_id);
    if (!r.ok) { setErr(r.error); return; }
    setItems(x => x.filter(y => y.item_id !== it.item_id)); onChanged?.();
  }

  const Pick = ({ it }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #f0f1f3" }}>
      <span style={{ flex: 1, fontSize: 12 }}>{it.display_name} <span className="muted" style={{ fontSize: 10.5 }}>· {it.item_type} · {it.unit}</span></span>
      {inKit(it.id) ? <span className="badge p" style={{ fontSize: 10 }}>in kit</span> : (
        <>
          <input inputMode="decimal" placeholder="per unit" value={per[it.id] ?? ""} onChange={e => setPer(p => ({ ...p, [it.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                 style={{ width: 66, fontSize: 11.5, textAlign: "right" }} />
          <button style={{ fontSize: 11.5 }} disabled={busy || !canEdit} onClick={() => add(it, Number(per[it.id]) || 1)}>＋ Add</button>
        </>
      )}
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 760, padding: 22, maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ marginBottom: 2 }}>Materials for BOQ line {row.item_code || row.short_name || "#" + row.id}</h2>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>{row.description}</div>
        <div className="muted" style={{ fontSize: 11.5, marginBottom: 14 }}>
          BOQ qty <b>{Number(row.boq_qty).toLocaleString("en-IN")} {row.unit}</b> · each material below is allowed <b>BOQ qty × per-unit</b> at this site. Indents in strict categories may only pick these.
        </div>
        {!canEdit && <div className="note amber" style={{ fontSize: 12, marginBottom: 10 }}>View only — kits are set by the Billing Engineer, IT or a Director.</div>}
        {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}

        <div style={{ fontWeight: 700, fontSize: 12.5, color: NAVY, marginBottom: 6 }}>In the kit · {items.length}</div>
        {!items.length ? <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Nothing mapped yet — this line does not restrict anything at the site until it has a kit.</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
            <thead><tr>{["Material", "Type", "Per BOQ unit", "Allowed at site", ""].map(h => <th key={h} style={{ fontSize: 10.5, textAlign: "left", padding: "5px 8px", background: "#f3f4f6" }}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map(it => (
                <tr key={it.item_id}>
                  <td style={{ fontSize: 12, padding: "5px 8px", fontWeight: 600 }}>{it.name}</td>
                  <td style={{ fontSize: 11.5, padding: "5px 8px" }}>{it.type}</td>
                  <td style={{ padding: "5px 8px" }}>
                    {canEdit ? <input defaultValue={it.qty_per_unit} inputMode="decimal" onBlur={e => setQty(it, e.target.value)} style={{ width: 70, textAlign: "right", fontSize: 12 }} />
                             : <span style={{ fontSize: 12 }}>{it.qty_per_unit}</span>}
                  </td>
                  <td style={{ fontSize: 12, padding: "5px 8px", fontWeight: 700 }}>{(Number(row.boq_qty) * Number(it.qty_per_unit)).toLocaleString("en-IN")} {it.unit}</td>
                  <td style={{ padding: "5px 8px" }}>{canEdit && <button style={{ fontSize: 11, color: "var(--red)" }} onClick={() => remove(it)}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canEdit && (<>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: NAVY, marginBottom: 4 }}>Add a material</div>
          <input placeholder="Search the Item Master…" value={q} onChange={e => setQ(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
          {found.length > 0 && (
            <div style={{ marginBottom: 12, maxHeight: 360, overflowY: "auto" }}>
              {/* update370: grouped by type, so Pipe / Fitting / Valve are each visible at a glance */}
              {[...new Set(found.map(x => x.item_type || "Other"))].map(type => (
                <div key={type}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: NAVY, letterSpacing: "0.05em", padding: "8px 0 2px", borderBottom: "1.5px solid #FF7A1A" }}>
                    {String(type).toUpperCase()} · {found.filter(x => (x.item_type || "Other") === type).length}
                  </div>
                  {found.filter(x => (x.item_type || "Other") === type).map(it => <Pick key={it.id} it={it} />)}
                </div>
              ))}
              <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>{found.length} match{found.length === 1 ? "" : "es"}{found.length >= 150 ? " — showing the first 150, narrow the search" : ""}</div>
            </div>
          )}
          {!q && sug.length > 0 && (<>
            <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Suggested from the description — one click to accept</div>
            {sug.map(it => <Pick key={it.id} it={it} />)}
          </>)}
        </>)}

        <div style={{ marginTop: 14, textAlign: "right" }}><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
