"use client";
// update487: "+ Add item" for a row of an Excel import — opens in place (side drawer), pre-filled from the Excel text,
// with the Item Master's own fields (components/ItemFields), the live item name, a duplicate check and ONE confirm.
// Saving uses the Item Master's addItem() and then confirms the row (fn_import_confirm, action "add").
import { useEffect, useMemo, useRef, useState } from "react";
import ItemFields from "@/components/ItemFields";
import { addItem, addItemType } from "@/lib/stock";
import { confirmRow } from "@/lib/indentImport";
import { prefillItem, displayName, itemPayload, validateItem, similarItems, DUPLICATE_MSG } from "@/lib/itemForm.mjs";
import { rememberItem, rememberType } from "@/lib/importMaster";

export function prefillFor(row, master) {
  return prefillItem([row.item_text, row.remarks].filter(Boolean).join(" "), { unit: row.unit, types: master?.types || [], makes: master?.makes || [], items: master?.items || [] });
}

/** create the item + confirm the row. Returns {ok, item, error} — shared by the drawer and the bulk table */
export async function createAndConfirm(row, form) {
  const v = validateItem(form); if (v) return { ok: false, error: v };
  const res = await addItem(itemPayload(form));
  if (!res.ok) return { ok: false, error: /duplicate|unique/i.test(res.error || "") ? DUPLICATE_MSG : res.error };
  const item = { id: res.id, display_name: res.name || displayName(form), ...itemPayload(form), is_active: true };
  rememberItem(item);
  const c = await confirmRow(row.id, res.id, "add");
  if (c && c.ok === false) return { ok: false, item, error: "The item was added to the master, but the row could not be confirmed: " + c.error };
  return { ok: true, item };
}

export default function AddItemDrawer({ row, master, onClose, onDone, hasNext }) {
  const pre = useMemo(() => prefillFor(row, master), [row?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(pre.form);
  const [touched, setTouched] = useState(new Set());
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [types, setTypes] = useState(master?.types || []);
  const box = useRef(null);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setTouched(t => new Set(t).add(k)); };
  const missing = new Set([...pre.missing].filter(k => !touched.has(k) && !String(form[k] || "").trim()));
  const name = displayName(form);
  const similar = useMemo(() => similarItems(form, master?.items || []), [name, master?.items?.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const exact = similar.find(s => s.exact);

  async function pickType(v) {
    if (v !== "__add_new__") { set("item_type", v); return; }
    const label = window.prompt("New material type (e.g. Hardware):"); if (!label) return;
    const res = await addItemType(label);
    if (!res.ok) { setErr("Could not add type: " + res.error); return; }
    rememberType(res.label); setTypes(t => [...new Set([...t, res.label])]); set("item_type", res.label);
  }
  async function save(next) {
    if (busy) return;
    if (exact) { setErr("This item is already in the master — use it instead (below)."); return; }
    setBusy(true); setErr("");
    const r = await createAndConfirm(row, form);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }       // the drawer stays open with everything typed
    onDone({ kind: "added", row, item: r.item }, next);
  }
  async function useExisting(it) {
    if (busy) return; setBusy(true); setErr("");
    const c = await confirmRow(row.id, it.id, "change");
    setBusy(false);
    if (c && c.ok === false) { setErr(c.error); return; }
    onDone({ kind: "used", row, item: it }, false);
  }
  useEffect(() => {
    const k = e => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "Enter" && !e.shiftKey && e.target?.tagName !== "SELECT" && e.target?.tagName !== "BUTTON" && box.current?.contains(e.target)) { e.preventDefault(); save(false); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  return (
    <div className="aid-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} data-add-drawer="">
      <aside className="aid-drawer" ref={box} role="dialog" aria-modal="true" aria-label="Add item to Item Master">
        <div className="aid-head">
          <div style={{ fontWeight: 800, fontSize: 15 }}>Add to Item Master</div>
          <button type="button" onClick={onClose} aria-label="Close" className="aid-x">✕</button>
        </div>
        <div className="aid-ref"><span className="muted" style={{ fontSize: 11 }}>Excel row {row.row_no}</span><div style={{ fontWeight: 600 }}>{row.item_text}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>Qty {row.qty ?? "?"} {row.unit || ""}{row.remarks ? " · " + row.remarks : ""}</div></div>
        <div className="aid-body">
          <ItemFields form={form} set={set} types={types} pickType={pickType} showSize highlight={missing} autoFocusKey={missing.has("material") ? "material" : "material"} idPrefix="aid-" />
          {missing.size > 0 && <div style={{ fontSize: 11.5, color: "#B45309", marginTop: 8 }}>Highlighted: could not be read from the Excel text — fill in if known ({[...missing].map(k => ({ item_type: "type", material: "material", size: "size", make: "make", unit: "unit", hsn_code: "HSN" }[k] || k)).join(", ")}).</div>}
          <div className="aid-preview"><span className="muted" style={{ fontSize: 11 }}>Item name in the master</span><div data-preview="">{name}</div></div>
          {similar.length > 0 && <div className="aid-similar" data-similar="">
            <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>{exact ? "Already in the master" : "Similar items already in the master"}</div>
            {similar.map(s => <div key={s.id} className="aid-sim-row"><span style={{ fontSize: 12.5 }}>{s.display_name}<span className="muted"> · {s.unit}</span>{s.exact ? <b style={{ color: "#B91C1C" }}> · same item</b> : null}</span>
              <button type="button" disabled={busy} onClick={() => useExisting(s)} data-use-existing="">Use this item instead</button></div>)}
          </div>}
          {err && <div role="alert" className="aid-err">{err}</div>}
        </div>
        <div className="aid-foot">
          <button type="button" className="primary" disabled={busy || !!exact} onClick={() => save(false)} data-add-confirm="">{busy ? "Saving…" : "Add item & confirm"}</button>
          {hasNext && <button type="button" disabled={busy || !!exact} onClick={() => save(true)} data-add-next="">Add & go to next missing item</button>}
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <span className="muted" style={{ fontSize: 11 }}>Enter = add · Esc = cancel</span>
        </div>
      </aside>
    </div>
  );
}
