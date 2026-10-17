"use client";
import { useCanViewPrices } from "@/lib/prices";   // update463
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { supabase, isDemo, fetchAll } from "@/lib/supabase";   // update324: supabase was NEVER imported here — every discount-tab query crashed silently
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
  const sess = session;   // update463: the mounted session (was read during render → hydration warning for Directors)
  const isDirector = sess?.role === "director";
  const canPx = useCanViewPrices();   // update463
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
      // update324: PAGED (rates passed 1,000 rows — one request clamps there), no nested-join
      // shape dependence, and every failure is SHOWN, never an empty screen.
      const { data: rates, error: re } = await fetchAll(() => supabase.from("price_list_rates").select("id, discount_category, price_list_id").order("id"));
      if (re) { setDErr("Could not load materials: " + re.message); return; }
      const { data: lists, error: le } = await supabase.from("price_lists").select("id, make");
      if (le) { setDErr("Could not load price lists: " + le.message); return; }
      const listMake = {}; (lists || []).forEach(l => { listMake[l.id] = l.make; });
      const { data: discs, error: de } = await supabase.from("make_category_discounts").select("make, category, discount_pct, effective_from, id").order("effective_from", { ascending: false }).order("id", { ascending: false });
      if (de) { setDErr("Could not load discounts: " + de.message); return; }
      const cur = {};
      (discs || []).forEach(d => { const k = d.make + "|" + d.category; if (!cur[k]) cur[k] = d; });
      const map = {};
      (rates || []).forEach(r => {
        const mk = listMake[r.price_list_id]; if (!mk) return;   // update324: joined client-side
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
  // update322: Material Discount Management — per-row edits + Global "Apply to All"
  // (one inline confirm kept: a global % reprices every item in every category).
  const [dEdits, setDEdits] = useState({});          // "make|cat" -> typed %
  const [dSearch, setDSearch] = useState("");        // update323: material search
  const [dGlobal, setDGlobal] = useState("");
  const [dConfirmAll, setDConfirmAll] = useState(false);
  const allCats = dMakes.flatMap(m => m.categories.map(c => ({ ...c, make: m.make })));
  const validPct = v => v !== "" && Number(v) >= 0 && Number(v) < 100;
  async function saveOne(make, category, pct) {
    setDBusy(true); setDErr(""); setDMsg("");
    const { data: res, error } = await supabase.rpc("fn_set_category_discount", { p_make: make, p_category: category, p_pct: Number(pct) });
    setDBusy(false);
    if (error) { setDErr(/fn_set_category_discount|schema cache/i.test(error.message) ? "Run pipeskool_bulk_discount.sql (update 305) first." : error.message); return false; }
    if (!res?.ok) { setDErr(res?.error || "Refused."); return false; }
    return true;
  }
  async function applyOne(c) {
    const v = dEdits[c.make + "|" + c.category];
    if (!validPct(v)) { setDErr("Enter a discount between 0 and 99.99."); return; }
    if (await saveOne(c.make, c.category, v)) {
      setDMsg(`${c.make} · ${c.category} → ${v}% (${c.items} item(s) repriced everywhere; dated today, history kept).`);
      setDEdits(x => { const y = { ...x }; delete y[c.make + "|" + c.category]; return y; });
      setTabRefresh(x => x + 1);
    }
  }
  async function applyAll() {
    if (!validPct(dGlobal)) { setDErr("Enter a global discount between 0 and 99.99."); return; }
    setDConfirmAll(false); setDBusy(true); setDErr("");
    let done = 0;
    for (const c of allCats) {
      if (!(await saveOne(c.make, c.category, dGlobal))) { setDBusy(false); setDMsg(done ? `${done} categor(ies) updated before the error.` : ""); return; }
      done++;
    }
    setDBusy(false); setDEdits({});
    setDMsg(`Global ${dGlobal}% applied — all ${done} categories repriced everywhere (dated today; history kept).`);
    setTabRefresh(x => x + 1);
  }
  const [tabRefresh, setTabRefresh] = useState(0);
  useEffect(() => { if (tabRefresh) setTab(t => t); }, [tabRefresh]);

  const columns = [
    { key: "display_name", label: "Item", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.display_name}</span> },
    { key: "item_type", label: "Type", filter: "select" },
    { key: "unit", label: "Unit", filter: "select" },
    { key: "hsn_code", label: "HSN", render: r => <span className="muted">{r.hsn_code || "—"}</span> },
    { key: "min_stock", label: "Min stock", type: "num", render: r => Number(r.min_stock) ? Number(r.min_stock) : <span className="muted">—</span>, exportValue: r => r.min_stock },
    ...(canPx === true ? [{ key: "rate", label: "Rate ₹", type: "num", render: r => r.rate != null ? <span style={{ fontFamily: "var(--mono, monospace)" }}>{Number(r.rate).toLocaleString("en-IN")}</span> : <span className="muted">—</span>, exportValue: r => r.rate ?? "" },   // update304
    { key: "disc_pct", label: "Disc %", type: "num", render: r => r.disc_pct != null && r.rate != null
        ? <span onClick={isDirector ? async e => {   /* update325: item override — wins over the group % */
              e.stopPropagation();
              const v = prompt("Discount override for: " + r.display_name + "\n" + (r.overridden ? "Currently OVERRIDDEN at " + r.disc_pct + "%." : "Group gives " + r.disc_pct + "%.") + "\n" + "Enter a % for THIS item only, or leave empty to follow the group:", r.overridden ? String(r.disc_pct) : "");
              if (v === null) return;
              const pct = v.trim() === "" ? null : Number(v);
              if (pct !== null && !(pct >= 0 && pct < 100)) { alert("Enter 0-99.99, or empty to clear."); return; }
              const { data: res, error } = await supabase.rpc("fn_set_item_discount_override", { p_item_id: r.id, p_pct: pct });
              if (error) { alert(/fn_set_item_discount_override|schema cache/i.test(error.message) ? "Run pipeskool_item_discount_override.sql (update 325) first." : error.message); return; }
              if (!res?.ok) { alert(res?.error || "Refused."); return; }
              load();
            } : undefined}
            title={isDirector ? (r.overridden ? "Overridden — click to change or clear (empty = follow group)" : "Click to set an item-level override") : (r.overridden ? "Item-level override" : "")}
            style={{ cursor: isDirector ? "pointer" : "default", textDecoration: isDirector ? "underline dotted" : "none", fontWeight: r.overridden ? 800 : 400, color: r.overridden ? "var(--copper)" : undefined }}>
            {r.disc_pct}%{r.overridden ? "*" : ""}
          </span>
        : <span className="muted">—</span>, exportValue: r => r.rate != null ? String(r.disc_pct) + (r.overridden ? " (override)" : "") : "" },
    { key: "net_rate", label: "Net Rate ₹", type: "num", render: r => r.net_rate != null ? (
        <span style={{ fontFamily: "var(--mono, monospace)", fontWeight: 700 }}>{Number(r.net_rate).toLocaleString("en-IN")}
          {r.per_mtr != null && <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>₹{Number(r.per_mtr).toLocaleString("en-IN")}/mtr</div>}
        </span>) : <span className="muted">—</span>, exportValue: r => r.net_rate ?? "" }] : []),   // update463: price columns for price viewers only
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
            <div style={{ maxWidth: 860, marginTop: 10 }}>{/* update323: Material Discount Management — table + search */}
              <div className="card" style={{ padding: 16, marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 240px" }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>💸 Group Discount Management</div>
                  <div className="muted" style={{ fontSize: 12 }}>One % per material group (pipes + fittings together) — CPVC, UPVC, SWR… managed separately, dated, history kept. Item-level overrides: click any Disc % on the Items tab.</div>
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 11.5 }}>All groups at once (%)</label>
                  <input type="number" min="0" max="99.99" step="0.5" value={dGlobal} onChange={e => { setDGlobal(e.target.value); setDConfirmAll(false); }}
                    style={{ width: 110, fontSize: 15, fontWeight: 700, textAlign: "center", display: "block" }} placeholder="e.g. 61" />
                </div>
                {!dConfirmAll && <button className="primary" disabled={dBusy || !allCats.length} onClick={() => { setDErr(""); setDMsg(""); validPct(dGlobal) ? setDConfirmAll(true) : setDErr("Enter a global discount between 0 and 99.99."); }}>✨ Apply to All</button>}
                {dConfirmAll && (
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center", background: "var(--copper-soft)", border: "1px solid var(--copper)", borderRadius: 10, padding: "8px 12px" }}>
                    <b style={{ fontSize: 12.5 }}>Set {dGlobal}% on all {allCats.length} materials?</b>
                    <button className="primary" disabled={dBusy} onClick={applyAll}>{dBusy ? "Applying…" : "✓ Confirm"}</button>
                    <button disabled={dBusy} onClick={() => setDConfirmAll(false)}>Cancel</button>
                  </span>
                )}
              </div>
              {dMsg && <div className="note green" style={{ marginBottom: 8 }}>{dMsg}</div>}
              {dErr && <div className="note red" style={{ marginBottom: 8 }}>{dErr}</div>}
              {allCats.length === 0 && <div className="note amber">No priced materials yet — load a category into the Price Master first.</div>}
              {allCats.length > 0 && (() => {
                const q = dSearch.trim().toLowerCase();
                const list = allCats.filter(c => !q || c.category.toLowerCase().includes(q) || c.make.toLowerCase().includes(q));
                return (
                  <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                      <input value={dSearch} onChange={e => setDSearch(e.target.value)} placeholder="🔍 Search material name…"
                        style={{ width: "min(340px, 100%)" }} />
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                        <thead>
                          <tr style={{ background: "var(--navy)", color: "#fff", textAlign: "left" }}>
                            <th style={{ padding: "10px 14px", width: 44 }}>#</th>
                            <th style={{ padding: "10px 14px" }}>Material Group</th>
                            <th style={{ padding: "10px 14px", width: 190 }}>Discount (%)</th>
                            <th style={{ padding: "10px 14px", width: 110 }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((c, idx) => {
                            const k = c.make + "|" + c.category;
                            const val = dEdits[k] ?? "";
                            const changed = val !== "" && Number(val) !== Number(c.pct ?? -1);
                            return (
                              <tr key={k} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: "9px 14px" }} className="muted">{idx + 1}</td>
                                <td style={{ padding: "9px 14px" }}>
                                  <div style={{ fontWeight: 800, letterSpacing: 0.3 }}>{c.category}</div>
                                  <div className="muted" style={{ fontSize: 11 }}>{c.make} · {c.items} item(s)</div>
                                </td>
                                <td style={{ padding: "9px 14px" }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <input type="number" min="0" max="99.99" step="0.5" value={val} placeholder={c.pct != null ? String(c.pct) : "—"}
                                      onChange={e => { setDEdits(x => ({ ...x, [k]: e.target.value })); setDErr(""); }}
                                      style={{ width: 84, textAlign: "center", fontWeight: 700, fontSize: 14.5,
                                        border: changed ? "2px solid var(--copper)" : undefined, borderRadius: 8 }} />
                                    <span className="muted" style={{ fontWeight: 700 }}>%</span>
                                  </span>
                                </td>
                                <td style={{ padding: "9px 14px" }}>
                                  {changed
                                    ? <button className="primary" disabled={dBusy || !validPct(val)} onClick={() => applyOne(c)}>✓ Apply to Group</button>
                                    : <span className="muted" style={{ fontSize: 11.5 }}>saved</span>}
                                </td>
                              </tr>
                            );
                          })}
                          {!list.length && <tr><td colSpan={4} className="muted" style={{ padding: 16 }}>No materials match "{dSearch}".</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "10px 14px", borderTop: "1px solid var(--border)", fontSize: 12 }} className="muted">
                      <span>📊 Total Materials: <b>{allCats.length}</b></span>
                      <span>％ Current Global: <b>{[...new Set(allCats.map(c => c.pct))].length === 1 && allCats[0].pct != null ? allCats[0].pct + "%" : "mixed"}</b></span>
                      <span>New ranges appear automatically when their prices are loaded.</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
      </main>
    </div>
  );
}
