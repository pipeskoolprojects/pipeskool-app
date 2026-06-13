"use client";
import { useEffect, useRef, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import {
  ITEM_TYPES, searchItems, addItem, recordTxn, logConsumption, raiseRequest, getBalances,
} from "@/lib/stock";
import { getSitesList } from "@/lib/mobile";

export default function StockScreen() {
  const [tab, setTab] = useState("stock");   // stock | grn | issue | transfer | use | request | additem
  const [siteId, setSiteId] = useState(1);
  const [siteCode, setSiteCode] = useState("KEI");
  const [sites, setSites] = useState([]);
  const [balances, setBalances] = useState([]);
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const [challan, setChallan] = useState(null);

  useEffect(() => { getSitesList().then(s => setSites(s)); }, []);
  useEffect(() => { getBalances(siteCode).then(setBalances); }, [siteCode, msg]);
  useEffect(() => { searchItems(q).then(setItems); }, [q]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const reset = () => { setForm({}); setSel(null); setChallan(null); setQ(""); };

  async function doTxn(type) {
    setErr(""); setMsg("");
    if (!sel) { setErr("Select an item first."); return; }
    if (!form.qty || Number(form.qty) <= 0) { setErr("Enter a valid quantity."); return; }
    setBusy(true);
    let res;
    if (type === "use") {
      res = await logConsumption({ item_id: sel.id, site_id: siteId, qty: Number(form.qty) });
    } else {
      const payload = {
        item_id: sel.id, site_id: siteId, txn_type: type, qty: Number(form.qty),
        done_by: 1, challanFile: challan,
      };
      if (type === "grn") { payload.rate = Number(form.rate || 0); payload.po_reference = form.po; payload.supplier = form.supplier; payload.condition_remarks = form.remarks; }
      if (type === "issue") { payload.issued_to = form.issued_to; }
      if (type === "transfer_out") { payload.counterpart_site_id = Number(form.to_site); payload.vehicle_no = form.vehicle; }
      res = await recordTxn(payload);
    }
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    const labels = { grn: "GRN recorded — stock increased.", issue: "Issued — stock reduced.", transfer_out: "Transfer-out recorded.", use: "Consumption logged." };
    setMsg(labels[type] || "Saved."); reset(); setTab("stock");
  }

  async function saveNewItem() {
    setErr(""); setMsg("");
    if (!form.item_type || !form.material) { setErr("Item type and material are mandatory."); return; }
    setBusy(true);
    const res = await addItem({
      item_type: form.item_type || "Pipe", material: form.material, sub_type: form.sub_type,
      size: form.size, item_class: form.item_class, make: form.make, unit: form.unit || "Nos",
      min_stock: form.min_stock, created_by: 1,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Added to item master: " + res.name); reset(); setTab("stock");
  }

  async function saveRequest() {
    setErr(""); setMsg("");
    if (!sel || !form.qty) { setErr("Select item and quantity."); return; }
    setBusy(true);
    const res = await raiseRequest({ site_id: siteId, item_id: sel.id, item_name: sel.display_name,
      qty: Number(form.qty), required_by: form.required_by, urgency: form.urgency || "normal", purpose: form.purpose });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Material request raised — visible to HO purchase team."); reset(); setTab("stock");
  }

  const ItemPicker = () => (
    <div className="m-field">
      <label>Search item</label>
      <input value={sel ? sel.display_name : q} onChange={e => { setQ(e.target.value); setSel(null); }}
             placeholder="Type to search (e.g. CPVC 25mm)" />
      {!sel && q && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: "auto" }}>
          {items.map(i => (
            <div key={i.id} onClick={() => { setSel(i); setQ(""); }}
                 style={{ padding: "8px 10px", fontSize: 12.5, borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
              {i.display_name} <span className="muted">· {i.unit}</span>
            </div>
          ))}
          {items.length === 0 && <div style={{ padding: 10, fontSize: 12 }} className="muted">No match — add it via "New item" tab.</div>}
        </div>
      )}
    </div>
  );

  const tabs = [["stock", "Stock"], ["grn", "GRN"], ["issue", "Issue"], ["transfer", "Transfer"], ["use", "Consume"], ["request", "Request"], ["additem", "New item"]];

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div>
          <div className="title">Material stock</div>
          <div className="sub">Storekeeper / site</div>
        </div>
        <select value={siteId} onChange={e => { setSiteId(Number(e.target.value)); const s = sites.find(x => x.id === Number(e.target.value)); }}
                style={{ fontSize: 11, width: "auto" }}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}
        </select>
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — sample stock.</div>}

        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 8 }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); reset(); setMsg(""); setErr(""); }}
                    className={tab === k ? "primary" : ""} style={{ fontSize: 12, whiteSpace: "nowrap" }}>{l}</button>
          ))}
        </div>

        {msg && <div className="note green">{msg}</div>}
        {err && <div className="note red">{err}</div>}

        {tab === "stock" && (
          <>
            <select value={siteCode} onChange={e => setSiteCode(e.target.value)} style={{ width: "100%", marginBottom: 10 }}>
              <option value="all">All sites</option>
              {sites.map(s => <option key={s.id} value={s.name.includes("KEI") ? "KEI" : s.name.includes("SOUL") ? "SOUL" : "CREEK"}>{s.name}</option>)}
            </select>
            {balances.map(b => (
              <div className="m-row" key={b.item_id + b.site_code}>
                <div className="info">
                  <div className="nm">{b.display_name}</div>
                  <div className="dt">{b.site_code} · Recd {b.received} · Issued {b.issued} · Used {b.consumed}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: b.balance <= b.min_stock ? "var(--red)" : "inherit" }}>{b.balance} {b.unit}</div>
                  {b.balance <= b.min_stock && <span className="badge a" style={{ fontSize: 10 }}>Low</span>}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "grn" && (<><h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>Goods receipt (GRN)</h3>
          <ItemPicker />
          <div className="m-grid2">
            <div className="m-field"><label>Quantity *</label><input inputMode="decimal" onChange={e => set("qty", e.target.value)} /></div>
            <div className="m-field"><label>PO rate ₹</label><input inputMode="decimal" onChange={e => set("rate", e.target.value)} /></div>
          </div>
          <div className="m-field"><label>PO reference</label><input onChange={e => set("po", e.target.value)} placeholder="PO no. (or blank = direct)" /></div>
          <div className="m-field"><label>Supplier</label><input onChange={e => set("supplier", e.target.value)} /></div>
          <div className="m-field"><label>Condition remarks</label><input onChange={e => set("remarks", e.target.value)} placeholder="Any damage / shortage" /></div>
          <button style={{ fontSize: 12.5 }} onClick={() => fileRef.current?.click()}>📷 {challan ? "Challan attached ✓" : "Attach challan photo"}</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => setChallan(e.target.files?.[0] || null)} />
          <button className="primary btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => doTxn("grn")}>{busy ? "Saving…" : "Record GRN"}</button>
        </>)}

        {tab === "issue" && (<><h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>Issue material</h3>
          <ItemPicker />
          <div className="m-field"><label>Quantity *</label><input inputMode="decimal" onChange={e => set("qty", e.target.value)} /></div>
          <div className="m-field"><label>Issued to (work area / contractor / activity)</label><input onChange={e => set("issued_to", e.target.value)} placeholder="e.g. Bay-5 erection / RK Labour Co." /></div>
          <button className="primary btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => doTxn("issue")}>{busy ? "Saving…" : "Record issue"}</button>
        </>)}

        {tab === "transfer" && (<><h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>Site-to-site transfer (outward)</h3>
          <ItemPicker />
          <div className="m-grid2">
            <div className="m-field"><label>Quantity *</label><input inputMode="decimal" onChange={e => set("qty", e.target.value)} /></div>
            <div className="m-field"><label>To site</label>
              <select onChange={e => set("to_site", e.target.value)}><option value="">Select…</option>
                {sites.filter(s => s.id !== siteId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <div className="m-field"><label>Vehicle no.</label><input onChange={e => set("vehicle", e.target.value)} placeholder="GJ-01-XX-0000" /></div>
          <button style={{ fontSize: 12.5 }} onClick={() => fileRef.current?.click()}>📷 {challan ? "Challan attached ✓" : "Attach challan photo"}</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => setChallan(e.target.files?.[0] || null)} />
          <button className="primary btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => doTxn("transfer_out")}>{busy ? "Saving…" : "Record transfer-out"}</button>
          <div className="note amber" style={{ marginTop: 8 }}>Receiving site confirms inward on their app — stock moves only after that.</div>
        </>)}

        {tab === "use" && (<><h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>Daily consumption / usage</h3>
          <ItemPicker />
          <div className="m-field"><label>Quantity used today *</label><input inputMode="decimal" onChange={e => set("qty", e.target.value)} /></div>
          <button className="primary btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => doTxn("use")}>{busy ? "Saving…" : "Log consumption"}</button>
          <div className="note amber" style={{ marginTop: 8 }}>Consumption feeds the "consumed vs BOQ norm" check on the Director's dashboard.</div>
        </>)}

        {tab === "request" && (<><h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>Raise material request</h3>
          <ItemPicker />
          <div className="m-grid2">
            <div className="m-field"><label>Quantity *</label><input inputMode="decimal" onChange={e => set("qty", e.target.value)} /></div>
            <div className="m-field"><label>Required by</label><input type="date" onChange={e => set("required_by", e.target.value)} /></div>
          </div>
          <div className="m-field"><label>Urgency</label><select onChange={e => set("urgency", e.target.value)}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></div>
          <div className="m-field"><label>Purpose</label><input onChange={e => set("purpose", e.target.value)} placeholder="Work area / reason" /></div>
          <button className="primary btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={saveRequest}>{busy ? "Saving…" : "Raise request"}</button>
        </>)}

        {tab === "additem" && (<><h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>Add item to master</h3>
          <div className="m-grid2">
            <div className="m-field"><label>Item type *</label>
              <select onChange={e => set("item_type", e.target.value)}><option value="">Select…</option>
                {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div className="m-field"><label>Material *</label><input onChange={e => set("material", e.target.value)} placeholder="CPVC / GI / MS" /></div>
          </div>
          <div className="m-grid2">
            <div className="m-field"><label>Sub-type</label><input onChange={e => set("sub_type", e.target.value)} placeholder="Elbow / Tee / Gate valve" /></div>
            <div className="m-field"><label>Size</label><input onChange={e => set("size", e.target.value)} placeholder="25mm / 350NB" /></div>
          </div>
          <div className="m-grid2">
            <div className="m-field"><label>Class</label><input onChange={e => set("item_class", e.target.value)} placeholder="SDR 11 / Heavy / PN16" /></div>
            <div className="m-field"><label>Make</label><input onChange={e => set("make", e.target.value)} placeholder="Astral / Dutron" /></div>
          </div>
          <div className="m-grid2">
            <div className="m-field"><label>Unit</label><select onChange={e => set("unit", e.target.value)}><option>Nos</option><option>Rmt</option><option>Kg</option><option>Set</option></select></div>
            <div className="m-field"><label>Min stock</label><input inputMode="decimal" onChange={e => set("min_stock", e.target.value)} /></div>
          </div>
          <button className="primary btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={saveNewItem}>{busy ? "Saving…" : "Add to master"}</button>
        </>)}
      </div>
      <MobileNav />
    </div>
  );
}
