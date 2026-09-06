"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { isDemo } from "@/lib/supabase";
import { ITEM_TYPES, getItemTypes, addItemType, getAllItems, addItem, updateItem, toggleItemActive, deleteItem, approveItem } from "@/lib/stock";
import { getSession, canAnySite } from "@/lib/auth";
import { canApprove } from "@/lib/perms";

const UNITS = ["Nos", "Rmt", "Mtr", "Kg", "Set", "Box", "Litre", "Bag"];
const BLANK = { item_type: "Pipe", material: "", sub_type: "", size: "", item_class: "", make: "", unit: "Rmt", hsn_code: "", min_stock: "", is_active: true };

export default function ItemsPage() {
  const [rows, setRows] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [types, setTypes] = useState(ITEM_TYPES);
  useEffect(() => { getItemTypes().then(setTypes); }, []);
  async function pickType(v) {
    if (v !== "__add_new__") { set("item_type", v); return; }
    const name = window.prompt("New material type (e.g. Hardware):");
    if (!name) return;
    const res = await addItemType(name);
    if (!res.ok) { window.alert("Could not add type: " + res.error + "\n(Needs the \"Manage item types\" admin right \u2014 Access Rights \u2192 Admin capabilities. Directors always have it.)"); return; }
    getItemTypes().then(setTypes);
    set("item_type", res.label);
  }
  const [form, setForm] = useState(null);   // null = closed; {id?} = add/edit
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => { setSession(getSession()); }, []);
  const load = () => getAllItems().then(res => { setRows(res.rows || []); setLoadErr(res.error || ""); });
  useEffect(() => { load(); }, []);

  const canManage = canAnySite(session, "stock", "manage");   // Manage tick on any site (or Director)
  // update238: APPROVING a pending item is a separate right from editing the master.
  // Same rule as the Approvals inbox and as fn_approve_item in the database.
  const canApprItem = canApprove(session, "stock");
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

  const pending = (rows || []).filter(r => r.is_active && r.pending_review);
  async function doApprove(r) {
    const res = await approveItem(r.id);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("\u201c" + r.display_name + "\u201d approved into the master \u2014 it now appears in item searches.");
    load();
  }
  const openEditRow = r => { setForm({ ...r, min_stock: r.min_stock || "", sub_type: r.sub_type || "", size: r.size || "", item_class: r.item_class || "", make: r.make || "", hsn_code: r.hsn_code || "" }); setMsg(""); setErr(""); };

  // update305: Bulk Discount Update — pick make+category, preview affected count, apply.
  // One dated discount row does the whole category; every screen recalculates instantly.
  const sess = typeof window !== "undefined" ? getSession() : null;
  const isDirector = sess?.role === "director";
  const [tab, setTab] = useState("items");           // items | discount
  const [dMakes, setDMakes] = useState([]);          // [{make, categories:[{category, pct, from, items}]}]
  const [dMake, setDMake] = useState("");
  const [dCat, setDCat] = useState("");
  const [dPct, setDPct] = useState("");
  const [dPrev, setDPrev] = useState(null);          // preview object
  const [dBusy, setDBusy] = useState(false);
  const [dMsg, setDMsg] = useState(""); const [dErr, setDErr] = useState("");
  useEffect(() => {
    if (tab !== "discount") return;
    (async () => {
      const { data: rates } = await supabase.from("price_list_rates").select("discount_category, price_lists(make)");
      const { data: discs } = await supabase.from("make_category_discounts").select("make, category, discount_pct, effective_from, id").order("effective_from", { ascending: false }).order("id", { ascending: false });
      const cur = {};
      (discs || []).forEach(d => { const k = d.make + "|" + d.category; if (!cur[k]) cur[k] = d; });
      const map = {};
      (rates || []).forEach(r => {
        const mk = r.price_lists?.make; if (!mk) return;
        const k = mk + "|" + r.discount_category;
        map[k] = map[k] || { make: mk, category: r.discount_category, items: 0, pct: cur[k]?.discount_pct ?? null, from: cur[k]?.effective_from || null };
        map[k].items++;
      });
      const byMake = {};
      Object.values(map).forEach(x => { (byMake[x.make] = byMake[x.make] || []).push(x); });
      const list = Object.entries(byMake).map(([make, categories]) => ({ make, categories: categories.sort((a2, b2) => a2.category.localeCompare(b2.category)) }));
      setDMakes(list);
      if (!dMake && list.length) { setDMake(list[0].make); setDCat(list[0].categories[0]?.category || ""); }
    })();
  }, [tab]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dCats = (dMakes.find(m => m.make === dMake)?.categories) || [];
  const dSel = dCats.find(c => c.category === dCat) || null;
  const doPreview = () => {
    setDErr(""); setDMsg("");
    const pct = Number(dPct);
    if (!dMake || !dCat) { setDErr("Pick the make and category."); return; }
    if (!(pct >= 0 && pct < 100)) { setDErr("Enter a discount between 0 and 99.99."); return; }
    setDPrev({ make: dMake, category: dCat, pct, items: dSel?.items || 0, oldPct: dSel?.pct });
  };
  const doApply = async () => {
    setDBusy(true); setDErr("");
    const { data: res, error } = await supabase.rpc("fn_set_category_discount", { p_make: dPrev.make, p_category: dPrev.category, p_pct: dPrev.pct });
    setDBusy(false);
    if (error) { setDErr(/fn_set_category_discount|schema cache/i.test(error.message) ? "Run pipeskool_bulk_discount.sql (update 305) first." : error.message); return; }
    if (!res?.ok) { setDErr(res?.error || "Refused."); return; }
    setDMsg(`${dPrev.make} · ${dPrev.category}: discount is now ${dPrev.pct}% — ${res.affected} priced item(s) recalculated everywhere (dated today; history preserved).`);
    setDPrev(null); setDPct(""); setTabRefresh(x => x + 1);
  };
  const [tabRefresh, setTabRefresh] = useState(0);
  useEffect(() => { if (tabRefresh) setTab(t => t); }, [tabRefresh]);

  const columns = [
    { key: "display_name", label: "Item", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.display_name}</span> },
    { key: "item_type", label: "Type", filter: "select" },
    { key: "unit", label: "Unit", filter: "select" },
    { key: "hsn_code", label: "HSN", render: r => <span className="muted">{r.hsn_code || "—"}</span> },
    { key: "min_stock", label: "Min stock", type: "num", render: r => Number(r.min_stock) ? Number(r.min_stock) : <span className="muted">—</span>, exportValue: r => r.min_stock },
    { key: "rate", label: "Rate ₹", type: "num", render: r => r.rate != null ? <span style={{ fontFamily: "var(--mono, monospace)" }}>{Number(r.rate).toLocaleString("en-IN")}</span> : <span className="muted">—</span>, exportValue: r => r.rate ?? "" },   // update304
    { key: "disc_pct", label: "Disc %", type: "num", render: r => r.disc_pct != null && r.rate != null ? r.disc_pct + "%" : <span className="muted">—</span>, exportValue: r => r.rate != null ? r.disc_pct : "" },
    { key: "net_rate", label: "Net Rate ₹", type: "num", render: r => r.net_rate != null ? (
        <span style={{ fontFamily: "var(--mono, monospace)", fontWeight: 700 }}>{Number(r.net_rate).toLocaleString("en-IN")}
          {r.per_mtr != null && <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>₹{Number(r.per_mtr).toLocaleString("en-IN")}/mtr</div>}
        </span>) : <span className="muted">—</span>, exportValue: r => r.net_rate ?? "" },
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
          {isDirector && (
            <div className="mw-tabs" style={{ margin: "0 12px" }}>{/* update305 */}
              <button className={tab === "items" ? "active" : ""} onClick={() => setTab("items")}>📦 Items</button>
              <button className={tab === "discount" ? "active" : ""} onClick={() => setTab("discount")}>💸 Bulk Discount Update</button>
            </div>
          )}
          {canManage && <button className="primary" onClick={() => { setForm({ ...BLANK }); setMsg(""); setErr(""); }}>＋ Add item</button>}
        </div>
        {loadErr && <div className="demo-banner" style={{ background: "#fdecea", color: "var(--red)" }}>
          ⚠ Could not load the item master: {loadErr} — your items are NOT deleted. If this mentions "pending_review", run pipeskool_item_pending.sql in Supabase, then refresh.</div>}
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          One catalogue for the whole company — indents, GRN, stock and Tally all pick items from here. The item name builds itself from Type + Material + Size + Class + Make, so edit those parts and the name updates everywhere. Deactivated items stop appearing in searches but old records keep them.
        </div>
        {isDemo && <div className="demo-banner">Demo mode — sample items.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && !form && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
        {pending.length > 0 && (
          <div className="panel" style={{ borderLeft: "4px solid var(--copper)" }}>
            <h2>Pending review — quick-added from indents ({pending.length})</h2>
            <div className="muted" style={{ marginBottom: 8 }}>
              These items were typed on indents and are NOT yet in the master. They stay hidden from item searches until approved. Open Edit to set the proper Type / Size / HSN (the name recomposes), then Approve.
            </div>
            <table className="dt-compact"><thead><tr><th>Item (as typed)</th><th>Unit</th><th></th></tr></thead>
              <tbody>
                {pending.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.display_name}</td>
                    <td className="muted">{r.unit || "\u2014"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {canManage && <button style={{ fontSize: 11.5, marginRight: 6 }} onClick={() => openEditRow(r)}>Edit</button>}
                      {canApprItem ? (<>
                        <button className="primary" style={{ fontSize: 11.5, marginRight: 6 }} onClick={() => doApprove(r)}>Approve &amp; add</button>
                        <button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => toggle(r)}>Reject</button>
                      </>) : <span className="muted" style={{ fontSize: 11.5 }}>Awaiting Director</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {form && (
          <div className="panel">
            <h2>{form.id ? "Edit item" : "Add item"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
              <div><label className="muted">Type</label>
                <select style={{ width: "100%" }} value={form.item_type} onChange={e => pickType(e.target.value)}>
                  {[...types, ...(types.includes(form.item_type) ? [] : [form.item_type])].map(t => <option key={t}>{t}</option>)}
                  <option value="__add_new__">➕ Add new type…</option>
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

        {tab === "items" && <div className="panel">
          {!rows ? <div className="muted">Loading…</div> :
            <DataTable columns={columns} rows={rows} exportName="item_master" />}
        </div>}
          {tab === "discount" && isDirector && (
            <div className="card" style={{ maxWidth: 620, padding: 18, marginTop: 10 }}>{/* update305 */}
              <h3 style={{ marginTop: 0 }}>💸 Bulk Discount Update</h3>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                Pick a category, enter the discount — it applies to every priced item in that category at once,
                dated today. Net Rate recalculates instantly on this page, in indent auto-fill and on new POs;
                past dates keep the discount that ruled then.
              </p>
              {dMakes.length === 0 && <div className="note amber">No priced categories yet — load a category into the Price Master first (CPVC pipes are round 1).</div>}
              {dMakes.length > 0 && (
                <>
                  <label className="muted">Make</label>
                  <select value={dMake} onChange={e => { setDMake(e.target.value); const m2 = dMakes.find(x => x.make === e.target.value); setDCat(m2?.categories[0]?.category || ""); setDPrev(null); }} style={{ width: "100%", marginBottom: 8 }}>
                    {dMakes.map(m2 => <option key={m2.make} value={m2.make}>{m2.make}</option>)}
                  </select>
                  <label className="muted">Category</label>
                  <select value={dCat} onChange={e => { setDCat(e.target.value); setDPrev(null); }} style={{ width: "100%", marginBottom: 8 }}>
                    {dCats.map(c => <option key={c.category} value={c.category}>{c.category} — {c.items} priced item(s){c.pct != null ? ` · current ${c.pct}%` : " · no discount yet"}</option>)}
                  </select>
                  <label className="muted">New discount %</label>
                  <input type="number" min="0" max="99.99" step="0.5" value={dPct} onChange={e => { setDPct(e.target.value); setDPrev(null); }} style={{ width: "100%", marginBottom: 10 }} placeholder={dSel?.pct != null ? "current " + dSel.pct + "%" : "e.g. 62"} />
                  {!dPrev && <button className="primary" onClick={doPreview}>👁 Preview</button>}
                  {dPrev && (
                    <div className="note" style={{ background: "var(--copper-soft)", border: "1px solid var(--copper)", padding: 12, marginBottom: 8 }}>
                      <b>{dPrev.make} · {dPrev.category}</b>: {dPrev.items} priced item(s) will move
                      {dPrev.oldPct != null ? ` from ${dPrev.oldPct}%` : ""} to <b>{dPrev.pct}%</b> — Net Rates recalculate everywhere immediately.
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="primary" disabled={dBusy} onClick={doApply}>{dBusy ? "Applying…" : "✓ Confirm & apply"}</button>
                        <button disabled={dBusy} onClick={() => setDPrev(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {dMsg && <div className="note green" style={{ marginTop: 8 }}>{dMsg}</div>}
                  {dErr && <div className="note red" style={{ marginTop: 8 }}>{dErr}</div>}
                </>
              )}
            </div>
          )}
      </main>
    </div>
  );
}
