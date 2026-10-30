"use client";
// update487: "Add all N missing items" — every "Not in Item Master" row of an Excel import, pre-filled, in one editable
// table with a duplicate warning per row, then ONE "Create all & confirm". Same rules and the same addItem() as the
// Item Master (via createAndConfirm in AddItemDrawer).
import { useMemo, useState } from "react";
import { UNITS, displayName, similarItems } from "@/lib/itemForm.mjs";
import { confirmRow } from "@/lib/indentImport";
import { prefillFor, createAndConfirm } from "@/components/AddItemDrawer";

export default function AddItemsBulk({ rows, master, onClose, onDone }) {
  const init = useMemo(() => rows.map(r => { const p = prefillFor(r, master); return { row: r, form: p.form, missing: p.missing, state: "todo", error: "" }; }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [list, setList] = useState(init); const [busy, setBusy] = useState(false);
  const types = master?.types || [];
  const upd = (i, k, v) => setList(l => l.map((x, j) => j === i ? { ...x, form: { ...x.form, [k]: v }, missing: new Set([...x.missing].filter(m => m !== k)) } : x));
  const dupOf = f => similarItems(f, master?.items || [], 1).find(s => s.exact) || null;
  async function run() {
    setBusy(true); const results = [];
    for (let i = 0; i < list.length; i++) {
      const x = list[i]; if (x.state === "done") continue;
      setList(l => l.map((y, j) => j === i ? { ...y, state: "saving", error: "" } : y));
      const dup = dupOf(x.form);
      let r;
      if (dup) { const c = await confirmRow(x.row.id, dup.id, "change"); r = c && c.ok === false ? { ok: false, error: c.error } : { ok: true, item: dup, used: true }; }
      else r = await createAndConfirm(x.row, x.form);
      results.push({ ...r, row: x.row });
      setList(l => l.map((y, j) => j === i ? { ...y, state: r.ok ? "done" : "error", error: r.ok ? (r.used ? "used existing item" : "") : r.error } : y));
    }
    setBusy(false);
    onDone(results, results.every(r => r.ok));
  }
  const cell = { padding: "4px 6px", borderTop: "1px solid var(--border)", verticalAlign: "top" };
  const inp = (i, k, w, miss) => <input value={list[i].form[k] || ""} onChange={e => upd(i, k, e.target.value)} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", ...(miss ? { outline: "2px solid #F59E0B", background: "#FFFBEB" } : {}) }} aria-label={k} disabled={busy || list[i].state === "done"} />;
  return (
    <div className="aid-overlay" data-bulk="">
      <div className="aid-modal" role="dialog" aria-modal="true" aria-label="Add all missing items">
        <div className="aid-head"><div style={{ fontWeight: 800, fontSize: 15 }}>Add {list.length} missing items to Item Master</div><button type="button" className="aid-x" onClick={onClose} disabled={busy} aria-label="Close">✕</button></div>
        <div className="muted" style={{ fontSize: 12, padding: "0 16px 8px" }}>Pre-filled from the Excel rows — highlighted cells could not be read. A row that already exists in the master is mapped to that item instead of adding it twice.</div>
        <div className="aid-bulk-table">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, tableLayout: "fixed" }}>
            <colgroup><col style={{ width: "15%" }} /><col style={{ width: 110 }} /><col style={{ width: "17%" }} /><col style={{ width: 76 }} /><col style={{ width: 96 }} /><col style={{ width: 90 }} /><col style={{ width: 88 }} /><col style={{ width: 92 }} /><col /></colgroup>
            <thead><tr style={{ textAlign: "left", color: "#6B7280" }}><th style={cell}>Excel text</th><th style={cell}>Type</th><th style={cell}>Material / name *</th><th style={cell}>Size</th><th style={cell}>Class</th><th style={cell}>Make</th><th style={cell}>Unit</th><th style={cell}>HSN</th><th style={cell}>Item name / check</th></tr></thead>
            <tbody>{list.map((x, i) => { const dup = dupOf(x.form); const sim = dup ? null : similarItems(x.form, master?.items || [], 1)[0]; return (
              <tr key={x.row.id} data-bulk-row={x.state}>
                <td style={{ ...cell, overflowWrap: "anywhere" }}>{x.row.item_text}<div className="muted" style={{ fontSize: 11 }}>{x.row.qty} {x.row.unit}</div></td>
                <td style={cell}><select value={x.form.item_type} onChange={e => upd(i, "item_type", e.target.value)} disabled={busy || x.state === "done"} style={{ width: "100%", ...(x.missing.has("item_type") ? { outline: "2px solid #F59E0B" } : {}) }}>{[...types, ...(types.includes(x.form.item_type) ? [] : [x.form.item_type])].map(t => <option key={t}>{t}</option>)}</select></td>
                <td style={cell}>{inp(i, "material", 150, !String(x.form.material || "").trim())}</td>
                <td style={cell}>{inp(i, "size", 70, x.missing.has("size"))}</td>
                <td style={cell}>{inp(i, "item_class", 90, false)}</td>
                <td style={cell}>{inp(i, "make", 80, x.missing.has("make"))}</td>
                <td style={cell}><select value={x.form.unit} onChange={e => upd(i, "unit", e.target.value)} disabled={busy || x.state === "done"} style={{ width: "100%" }}>{[...UNITS, ...(UNITS.includes(x.form.unit) ? [] : [x.form.unit])].map(u => <option key={u}>{u}</option>)}</select></td>
                <td style={cell}>{inp(i, "hsn_code", 80, x.missing.has("hsn_code"))}</td>
                <td style={{ ...cell, overflowWrap: "anywhere" }}><div style={{ fontWeight: 600 }}>{displayName(x.form)}</div>
                  {dup ? <div style={{ color: "#B45309", fontSize: 11.5 }}>Already in the master — will use it</div> : sim ? <div style={{ color: "#B45309", fontSize: 11.5 }}>Similar: {sim.display_name}</div> : null}
                  {x.state === "done" && <div style={{ color: "#15803D", fontSize: 11.5 }}>Done{x.error ? " · " + x.error : ""}</div>}
                  {x.state === "saving" && <div className="muted" style={{ fontSize: 11.5 }}>Saving…</div>}
                  {x.state === "error" && <div style={{ color: "#B91C1C", fontSize: 11.5 }} role="alert">{x.error}</div>}</td>
              </tr>); })}</tbody>
          </table>
        </div>
        <div className="aid-foot">
          <button type="button" className="primary" disabled={busy || list.every(x => x.state === "done")} onClick={run} data-bulk-create="">{busy ? "Creating…" : `Create all & confirm (${list.filter(x => x.state !== "done").length})`}</button>
          <button type="button" onClick={onClose} disabled={busy}>Close</button>
        </div>
      </div>
    </div>
  );
}
