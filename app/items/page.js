"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { isDemo } from "@/lib/supabase";
import { ITEM_TYPES, getAllItems, addItem, updateItem, toggleItemActive, deleteItem } from "@/lib/stock";
import { getSession, canAnySite } from "@/lib/auth";

const UNITS = ["Nos", "Rmt", "Mtr", "Kg", "Set", "Box", "Litre", "Bag"];
const BLANK = { item_type: "Pipe", material: "", sub_type: "", size: "", item_class: "", make: "", unit: "Rmt", hsn_code: "", min_stock: "", is_active: true };

export default function ItemsPage() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);   // null = closed; {id?} = add/edit
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => { setSession(getSession()); }, []);
  const load = () => getAllItems().then(setRows);
  useEffect(load, []);

  const canManage = canAnySite(session, "stock", "manage");   // Manage tick on any site (or Director)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function remove(it) {
    if (!confirm(`Delete "${it.display_name}" permanently?\n\nOnly possible if it was never used in any indent, GRN or stock record. Used items must be deactivated instead.`)) return;
    const r = await deleteItem(it.id);
    if (!r.ok) { setMsg(""); setErr(r.error); return; }
    setErr(""); setMsg("Item deleted."); load();
  }

  async function save() {
    setErr("");
    if (!String(form.material || "").trim()) { setErr("Material / name is required — it's the main part of the item name."); return; }
    setBusy(true);
    const res = form.id
      ? await updateItem(form.id, form)
      : await addItem({ item_type: form.item_type, material: form.material.trim(), sub_type: form.sub_type?.trim() || null,
          size: form.size?.trim() || null, item_class: form.item_class?.trim() || null, make: form.make?.trim() || null,
          unit: form.unit, hsn_code: form.hsn_code?.trim() || null, min_stock: Number(form.min_stock || 0) });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(form.id ? "Item updated — the name recomposed automatically." : "Item added: " + (res.name || ""));
    setForm(null); load();
  }
  async function toggle(it) {
    const r = await toggleItemActive(it.id, !it.is_active);
    if (!r.ok) { setMsg(""); setErr(r.error); return; }
    load();
  }

  const generalCount = (rows || []).filter(r => r.is_active && r.item_type === "GENERAL").length;

  const columns = [
    { key: "display_name", label: "Item", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.display_name}</span> },
    { key: "item_type", label: "Type", filter: "select" },
    { key: "unit", label: "Unit", filter: "select" },
    { key: "hsn_code", label: "HSN", render: r => <span className="muted">{r.hsn_code || "—"}</span> },
    { key: "min_stock", label: "Min stock", type: "num", render: r => Number(r.min_stock) ? Number(r.min_stock) : <span className="muted">—</span>, exportValue: r => r.min_stock },
    { key: "is_active", label: "Status", filter: "select", optionLabel: o => o ? "Active" : "Inactive",
      render: r => r.is_active ? <span className="badge p">Active</span> : <span className="badge gray">Inactive</span>, exportValue: r => r.is_active ? "Active" : "Inactive" },
    { key: "_action", label: "Action", sortable: false, render: r => canManage ? (
      <span style={{ whiteSpace: "nowrap" }}>
        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => { setForm({ ...r, min_stock: r.min_stock || "", sub_type: r.sub_type || "", size: r.size || "", item_class: r.item_class || "", make: r.make || "", hsn_code: r.hsn_code || "" }); setMsg(""); setErr(""); }}>Edit</button>
        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => toggle(r)}>{r.is_active ? "Deactivate" : "Activate"}</button>
        {canManage && <button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => remove(r)}>🗑</button>}
      </span>) : <span className="muted">—</span>, exportValue: () => "" },
  ];

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Item / Material master</h1>
          {canManage && <button className="primary" onClick={() => { setForm({ ...BLANK }); setMsg(""); setErr(""); }}>＋ Add item</button>}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          One catalogue for the whole company — indents, GRN, stock and Tally all pick items from here. The item name builds itself from Type + Material + Size + Class + Make, so edit those parts and the name updates everywhere. Deactivated items stop appearing in searches but old records keep them.
        </div>
        {isDemo && <div className="demo-banner">Demo mode — sample items.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && !form && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
        {generalCount > 0 && (
          <div className="demo-banner">
            {generalCount} item{generalCount > 1 ? "s were" : " was"} quick-added from an indent and carry the temporary type <b>GENERAL</b> — open Edit and set the proper Type/Size to tidy the name.
          </div>
        )}

        {form && (
          <div className="panel">
            <h2>{form.id ? "Edit item" : "Add item"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
              <div><label className="muted">Type</label>
                <select style={{ width: "100%" }} value={form.item_type} onChange={e => set("item_type", e.target.value)}>
                  {[...ITEM_TYPES, ...(ITEM_TYPES.includes(form.item_type) ? [] : [form.item_type])].map(t => <option key={t}>{t}</option>)}
                </select></div>
              <div><label className="muted">Material / name *</label><input style={{ width: "100%" }} value={form.material} onChange={e => set("material", e.target.value)} placeholder="e.g. CPVC or MS 350NB" /></div>
              <div><label className="muted">Sub-type</label><input style={{ width: "100%" }} value={form.sub_type} onChange={e => set("sub_type", e.target.value)} placeholder="Elbow / Tee / Gate valve" /></div>
              <div><label className="muted">Size</label><input style={{ width: "100%" }} value={form.size} onChange={e => set("size", e.target.value)} placeholder="25mm / 350NB" /></div>
              <div><label className="muted">Class</label><input style={{ width: "100%" }} value={form.item_class} onChange={e => set("item_class", e.target.value)} placeholder="SDR 11 / Heavy / PN10" /></div>
              <div><label className="muted">Make</label><input style={{ width: "100%" }} value={form.make} onChange={e => set("make", e.target.value)} placeholder="Astral / Dutron" /></div>
              <div><label className="muted">Unit</label>
                <select style={{ width: "100%" }} value={form.unit} onChange={e => set("unit", e.target.value)}>
                  {[...UNITS, ...(UNITS.includes(form.unit) ? [] : [form.unit])].map(u => <option key={u}>{u}</option>)}
                </select></div>
              <div><label className="muted">HSN code</label><input style={{ width: "100%" }} value={form.hsn_code} onChange={e => set("hsn_code", e.target.value)} /></div>
              <div><label className="muted">Min stock (alert level)</label><input style={{ width: "100%" }} inputMode="numeric" value={form.min_stock} onChange={e => set("min_stock", e.target.value)} /></div>
            </div>
            {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : form.id ? "Save changes" : "Add item"}</button>
              <button onClick={() => setForm(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="panel">
          {!rows ? <div className="muted">Loading…</div> :
            <DataTable columns={columns} rows={rows} exportName="item_master" />}
        </div>
      </main>
    </div>
  );
}
