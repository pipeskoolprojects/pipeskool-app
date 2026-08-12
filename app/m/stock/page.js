"use client";
import { useEffect, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import {
  searchItems, getBalances, recordMultiGRN, issueToWorker, getWorkerList,
  getHoldings, settleHolding, recordReturn,
} from "@/lib/stock";
import { getSitesList } from "@/lib/mobile";
import { getVendors } from "@/lib/vendors";
import { getSession, setCurrentSite } from "@/lib/auth";

export default function StockScreen() {
  if (typeof window !== "undefined" && !getSession()) { window.location.replace("/m"); return null; }
  const [tab, setTab] = useState("stock");   // stock | grn | issue | settle | return
  const [siteId, setSiteId] = useState(() => { const s0 = getSession(); return Number(s0?.currentSite || s0?.sites?.[0]?.id || 1); });  // shared site (update140)
  const pickSite = id => { const n = Number(id); setSiteId(n); setCurrentSite(n); };   // one selection drives ALL pages
  const [sites, setSites] = useState([]);
  const [balances, setBalances] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [q, setQ] = useState(""); const [items, setItems] = useState([]); const [sel, setSel] = useState(null);
  const [form, setForm] = useState({});
  const [settleSel, setSettleSel] = useState(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const sess = typeof window !== "undefined" ? getSession() : null;
  const userId = sess?.id || 1;

  useEffect(() => { getSitesList().then(setSites); getVendors(false).then(setVendors); }, []);
  useEffect(() => { reload(); getWorkerList(undefined).then(setWorkers); }, [siteId]);
  useEffect(() => { if (q.length >= 2) searchItems(q).then(setItems); else setItems([]); }, [q]);

  function reload() {
    getBalances("all").then(rows => setBalances(rows.filter(b => b.site_id === siteId)));
    getHoldings(undefined).then(rows => setHoldings(rows.filter(h => h.site_id === siteId)));
  }
  const reset = () => { setSel(null); setForm({}); setQ(""); setItems([]); setSettleSel(null); setErr(""); };

  // update176: one challan = many items + challan page uploads
  const [grnLines, setGrnLines] = useState([]);
  const [supDocs, setSupDocs] = useState([]);
  const [coDocs, setCoDocs] = useState([]);
  function addGrnLine() {
    setErr("");
    if (!sel) { setErr("Select an item first."); return; }
    if (!form.received) { setErr("Enter received quantity."); return; }
    setGrnLines(l => [...l, { item_id: sel.id, item_name: sel.display_name, unit: sel.unit,
      challan_qty: Number(form.challan_qty || form.received), received_qty: Number(form.received) }]);
    setSel(null); setQ(""); setItems([]);
    setForm(f => ({ ...f, challan_qty: "", received: "" }));
  }
  async function saveGRN() {
    setErr("");
    let lines = grnLines;
    if (sel && form.received) {
      lines = [...lines, { item_id: sel.id, item_name: sel.display_name, unit: sel.unit,
        challan_qty: Number(form.challan_qty || form.received), received_qty: Number(form.received) }];
    }
    if (lines.length === 0) { setErr("Add at least one item (select item + received qty)."); return; }
    if (!form.vendor) { setErr("Select the vendor."); return; }
    setBusy(true);
    const res = await recordMultiGRN(
      { site_id: siteId, vendor: form.vendor, challan_no: form.challan, our_challan_no: form.our_challan,
        challan_date: form.cdate, done_by: userId },
      lines, { supplier: supDocs, company: coDocs }
    );
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("GRN recorded — " + lines.length + " item(s)" + (res.warn ? " · " + res.warn : ""));
    setGrnLines([]); setSupDocs([]); setCoDocs([]); reset(); setTab("stock"); reload();
  }

  async function saveIssue() {
    setErr(""); if (!sel) { setErr("Select an item."); return; }
    if (!form.worker) { setErr("Select the worker."); return; }
    if (!form.qty) { setErr("Enter quantity."); return; }
    const w = workers.find(x => String(x.id) === String(form.worker));
    setBusy(true);
    const res = await issueToWorker({ site_id: siteId, item_id: sel.id, qty: Number(form.qty),
      worker_id: w?.id, worker_name: w?.name || "", purpose: form.purpose, done_by: userId });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Issued " + form.qty + " of " + sel.display_name + " to " + (w?.name || "worker")); reset(); setTab("settle"); reload();
  }

  async function saveSettle() {
    setErr("");
    const u = Number(form.used || 0), r = Number(form.returned || 0);
    if (u + r <= 0) { setErr("Enter used and/or returned."); return; }
    if (u + r > settleSel.held) { setErr("Used + returned can't exceed held (" + settleSel.held + ")."); return; }
    setBusy(true);
    const res = await settleHolding({ site_id: settleSel.site_id, item_id: settleSel.item_id,
      worker_id: settleSel.worker_id, worker_name: settleSel.worker, used: u, returned: r, purpose: form.purpose, done_by: userId });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Settled " + settleSel.worker + " — used " + u + ", returned " + r); reset(); reload();
  }

  async function saveReturnVendor() {
    setErr(""); if (!sel) { setErr("Select an item."); return; }
    if (!form.qty) { setErr("Enter quantity."); return; }
    if (!form.vendor) { setErr("Select the vendor."); return; }
    setBusy(true);
    const res = await recordReturn({ site_id: siteId, item_id: sel.id, qty: Number(form.qty),
      kind: "return_vendor", reason: form.reason, vendor: form.vendor, done_by: userId });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Returned to vendor: " + form.qty + " of " + sel.display_name); reset(); setTab("stock"); reload();
  }

  const ItemSearch = () => (
    <div className="m-field">
      <label>Item</label>
      {sel ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
          <b style={{ fontSize: 13 }}>{sel.display_name}</b>
          <button style={{ fontSize: 11 }} onClick={() => { setSel(null); setQ(""); }}>change</button>
        </div>
      ) : (<>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search (e.g. MS 350NB)" />
        {items.length > 0 && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: "auto" }}>
            {items.map(i => <div key={i.id} onClick={() => { setSel(i); setQ(""); setItems([]); }} style={{ padding: "8px 10px", fontSize: 13, borderBottom: "1px solid var(--border)" }}>{i.display_name} · {i.unit}</div>)}
          </div>
        )}
      </>)}
    </div>
  );

  const tabs = [["stock", "Stock"], ["grn", "GRN"], ["issue", "Issue"], ["settle", holdings.length ? `Settle (${holdings.length})` : "Settle"], ["return", "Return"]];

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div><div className="title">Material stock</div><div className="sub">Store &amp; site</div></div>
        <select value={siteId} onChange={e => { pickSite(e.target.value); reset(); }} style={{ fontSize: 11, width: "auto" }}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}
        </select>
      </div>

      <div className="m-body">
        {msg && <div className="m-ok">{msg}</div>}
        {err && <div className="m-err">{err}</div>}

        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12 }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); reset(); setMsg(""); }}
              className={tab === k ? "primary" : ""} style={{ fontSize: 12, whiteSpace: "nowrap" }}>{l}</button>
          ))}
        </div>

        {tab === "stock" && (
          balances.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No stock yet. Record a GRN.</div> :
          balances.map(b => (
            <div key={b.item_id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <b style={{ fontSize: 13 }}>{b.display_name}</b>
                <span style={{ fontWeight: 700, color: b.balance <= b.min_stock ? "var(--red)" : "inherit" }}>{b.balance} {b.unit}</span>
              </div>
              <div className="dt">Recd {b.received} · Issued {b.issued} · Ret {b.returned} · Used {b.consumed}{b.with_site > 0 ? " · With site " + b.with_site : ""}</div>
            </div>
          ))
        )}

        {tab === "grn" && (<>
          <h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>Goods receipt (no rate — counts only)</h3>
          <div className="m-field"><label>Vendor</label>
            <select value={form.vendor || ""} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}>
              <option value="">Select vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
          </div>
          <div className="m-field"><label>Vendor challan no</label><input value={form.challan || ""} onChange={e => setForm(f => ({ ...f, challan: e.target.value }))} /></div>
          <div className="m-field"><label>Our challan no</label><input value={form.our_challan || ""} onChange={e => setForm(f => ({ ...f, our_challan: e.target.value }))} /></div>
          <div className="m-field"><label>Challan date</label><input type="date" value={form.cdate || ""} onChange={e => setForm(f => ({ ...f, cdate: e.target.value }))} /></div>
          <ItemSearch />
          <div className="m-field"><label>Challan qty</label><input inputMode="decimal" value={form.challan_qty || ""} onChange={e => setForm(f => ({ ...f, challan_qty: e.target.value }))} /></div>
          <div className="m-field"><label>Received qty</label><input inputMode="decimal" value={form.received || ""} onChange={e => setForm(f => ({ ...f, received: e.target.value }))} /></div>
          <button className="btn-block" style={{ marginBottom: 8 }} onClick={addGrnLine}>＋ Add this item to challan</button>
          {grnLines.length > 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
              {grnLines.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>{l.item_name}</span>
                  <span>{l.received_qty} {l.unit} <a onClick={() => setGrnLines(x => x.filter((_, j) => j !== i))} style={{ color: "var(--red)", marginLeft: 6 }}>✕</a></span>
                </div>
              ))}
            </div>
          )}
          <div className="m-field"><label>📷 Supplier challan pages (photos/PDF — multiple)</label>
            <input type="file" accept="image/*,.pdf" multiple onChange={e => setSupDocs(Array.from(e.target.files || []))} />
            {supDocs.length > 0 && <div className="muted" style={{ fontSize: 11.5 }}>{supDocs.length} page(s) selected</div>}
          </div>
          <div className="m-field"><label>📷 Our challan pages (photos/PDF — multiple)</label>
            <input type="file" accept="image/*,.pdf" multiple onChange={e => setCoDocs(Array.from(e.target.files || []))} />
            {coDocs.length > 0 && <div className="muted" style={{ fontSize: 11.5 }}>{coDocs.length} page(s) selected</div>}
          </div>
          <button className="primary btn-block" disabled={busy} onClick={saveGRN}>{busy ? "Saving…" : grnLines.length > 1 ? `Record GRN (${grnLines.length} items)` : "Record GRN"}</button>
        </>)}

        {tab === "issue" && (<>
          <h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>Issue to worker</h3>
          <ItemSearch />
          <div className="m-field"><label>Issue to worker</label>
            <select value={form.worker || ""} onChange={e => setForm(f => ({ ...f, worker: e.target.value }))}>
              <option value="">Select worker…</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="m-field"><label>Quantity</label><input inputMode="decimal" value={form.qty || ""} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} /></div>
          <div className="m-field"><label>Purpose / location</label><input value={form.purpose || ""} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} /></div>
          <button className="primary btn-block" disabled={busy} onClick={saveIssue}>{busy ? "Saving…" : "Issue"}</button>
        </>)}

        {tab === "settle" && (
          !settleSel ? (
            holdings.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Nothing pending. Issue material first.</div> :
            holdings.map((h, i) => (
              <div key={i} onClick={() => { setSettleSel(h); setForm({}); }} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <b style={{ fontSize: 13 }}>{h.worker}</b>
                  {h.days >= 1 ? <span className="badge a">{h.days}d</span> : <span className="badge gray">today</span>}
                </div>
                <div className="dt">{h.item} · holding {h.held} {h.unit}</div>
              </div>
            ))
          ) : (<>
            <div style={{ marginBottom: 8, fontSize: 13 }}><b>{settleSel.worker}</b> — {settleSel.item} · holding <b>{settleSel.held} {settleSel.unit}</b> <button style={{ fontSize: 11, marginLeft: 6 }} onClick={() => setSettleSel(null)}>back</button></div>
            <div className="m-field"><label>Used (incl. wastage)</label><input inputMode="decimal" value={form.used || ""} onChange={e => setForm(f => ({ ...f, used: e.target.value }))} /></div>
            <div className="m-field"><label>Returned to store</label><input inputMode="decimal" value={form.returned || ""} onChange={e => setForm(f => ({ ...f, returned: e.target.value }))} /></div>
            <div className="m-field"><label>Purpose / location</label><input value={form.purpose || ""} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} /></div>
            <button className="primary btn-block" disabled={busy} onClick={saveSettle}>{busy ? "Saving…" : "Record settlement"}</button>
          </>)
        )}

        {tab === "return" && (<>
          <h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>Return to vendor (wrong / excess)</h3>
          <ItemSearch />
          <div className="m-field"><label>Quantity</label><input inputMode="decimal" value={form.qty || ""} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} /></div>
          <div className="m-field"><label>Vendor</label>
            <select value={form.vendor || ""} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}>
              <option value="">Select vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
          </div>
          <div className="m-field"><label>Reason</label><input value={form.reason || ""} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="damaged / wrong spec / excess" /></div>
          <button className="primary btn-block" disabled={busy} onClick={saveReturnVendor}>{busy ? "Saving…" : "Return to vendor"}</button>
        </>)}
      </div>

      <MobileNav />
    </div>
  );
}
