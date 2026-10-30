"use client";
// update487: the Item / Material Master "Add item" fields — ONE component, used by the Item Master page and by the
// Add-item drawer of Excel import, so both always ask for the same things the same way.
// form/set: the form state and a setter (key, value). types: item types; pickType: the master's "Add new type…" handler.
// showSize: show the single Size box here (the Item Master add form has its own multi-size row above).
// highlight: Set of field keys to mark (fields the import could not fill in). autoFocusKey: field to focus first.
import { UNITS } from "@/lib/itemForm.mjs";

const HL = { outline: "2px solid #F59E0B", outlineOffset: 1, background: "#FFFBEB" };

export default function ItemFields({ form, set, types, pickType, showSize = false, highlight = null, autoFocusKey = null, idPrefix = "" }) {
  const hl = k => (highlight && highlight.has(k) ? HL : null);
  const st = k => ({ width: "100%", ...(hl(k) || {}) });
  const af = k => (autoFocusKey === k ? { autoFocus: true } : {});
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
      <div><label className="muted" htmlFor={idPrefix + "item_type"}>Type</label>
        <select id={idPrefix + "item_type"} style={st("item_type")} value={form.item_type} onChange={e => (pickType ? pickType(e.target.value) : set("item_type", e.target.value))} {...af("item_type")}>
          {[...types, ...(types.includes(form.item_type) ? [] : [form.item_type])].map(t => <option key={t}>{t}</option>)}
          {pickType && <option value="__add_new__">➕ Add new type…</option>}
        </select></div>
      <div><label className="muted" htmlFor={idPrefix + "material"}>Material / name *</label><input id={idPrefix + "material"} style={st("material")} value={form.material} onChange={e => set("material", e.target.value)} placeholder="e.g. CPVC or MS 350NB" {...af("material")} /></div>
      <div><label className="muted" htmlFor={idPrefix + "sub_type"}>Sub-type</label><input id={idPrefix + "sub_type"} style={st("sub_type")} value={form.sub_type} onChange={e => set("sub_type", e.target.value)} placeholder="Elbow / Tee / Gate valve" /></div>
      {showSize && <div><label className="muted" htmlFor={idPrefix + "size"}>Size</label><input id={idPrefix + "size"} style={st("size")} value={form.size} onChange={e => set("size", e.target.value)} placeholder="25mm / 350NB" {...af("size")} /></div>}
      <div><label className="muted" htmlFor={idPrefix + "item_class"}>Class</label><input id={idPrefix + "item_class"} style={st("item_class")} value={form.item_class} onChange={e => set("item_class", e.target.value)} placeholder="SDR 11 / Heavy / PN10" /></div>
      <div><label className="muted" htmlFor={idPrefix + "make"}>Make</label><input id={idPrefix + "make"} style={st("make")} value={form.make} onChange={e => set("make", e.target.value)} placeholder="Astral / Dutron" /></div>
      <div><label className="muted" htmlFor={idPrefix + "unit"}>Unit</label>
        <select id={idPrefix + "unit"} style={st("unit")} value={form.unit} onChange={e => set("unit", e.target.value)}>
          {[...UNITS, ...(UNITS.includes(form.unit) ? [] : [form.unit])].map(u => <option key={u}>{u}</option>)}
        </select></div>
      <div><label className="muted" htmlFor={idPrefix + "hsn_code"}>HSN code</label><input id={idPrefix + "hsn_code"} style={st("hsn_code")} value={form.hsn_code} onChange={e => set("hsn_code", e.target.value)} /></div>
      <div><label className="muted" htmlFor={idPrefix + "min_stock"}>Min stock (alert level)</label><input id={idPrefix + "min_stock"} style={st("min_stock")} inputMode="numeric" value={form.min_stock} onChange={e => set("min_stock", e.target.value)} /></div>
    </div>
  );
}
