"use client";
// update403: "Office → Site (Internal)" tab of /stock/challans — stat cards, New Dispatch form,
// filters, list (PDF / Dispatch / Mark Delivered / View / Edit / Cancel). Reference: Director's HTML (19 Sep).
import { useEffect, useMemo, useState } from "react";
import { getSites } from "@/lib/data";
import { searchItems } from "@/lib/stock";
import { getDispatches, saveDispatch, setDispatchStatus, IDC_STATUS } from "@/lib/dispatch";

const dmy = k => k ? String(k).split("-").reverse().join("/") : "";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const Stat = ({ label, n, color }) => <div style={{ background: "var(--gray-bg)", borderRadius: 8, padding: "10px 12px" }}><div className="muted" style={{ fontSize: 11 }}>{label}</div><div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: color || "inherit" }}>{n}</div></div>;
const Pill = ({ s }) => { const [l, c] = IDC_STATUS[s] || [s, "gray"]; return <span className={"badge " + c}>{l}</span>; };

export default function InternalDispatchTab({ session, onCount }) {
  const [rows, setRows] = useState(null); const [sites, setSites] = useState([]);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null); const [view, setView] = useState(null);
  const [fTo, setFTo] = useState("all"); const [fStatus, setFStatus] = useState("all"); const [fFrom, setFFrom] = useState(""); const [fTill, setFTill] = useState(""); const [q, setQ] = useState("");
  const [iq, setIq] = useState(""); const [hits, setHits] = useState([]);
  const isAdmin = session?.role === "director" || session?.role === "it_executive";
  const load = () => getDispatches().then(r => { setRows(r); onCount && onCount(r.filter(x => x.status !== "cancelled").length); }).catch(e => { setErr(e.message); setRows([]); });
  useEffect(() => { load(); getSites().then(r => setSites(Array.isArray(r) ? r : (r?.data || []))); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!iq.trim()) { setHits([]); return; } const t = setTimeout(() => searchItems(iq, 15).then(setHits).catch(() => setHits([])), 200); return () => clearTimeout(t); }, [iq]);

  const headOffice = sites.find(s => /head\s*office/i.test(s.name));
  const blank = () => ({ id: null, from_site_id: headOffice ? String(headOffice.id) : "", to_site_id: "", dispatch_date: today(), dispatched_by: session?.full_name || "", vehicle_no: "", driver_name: "", notes: "", items: [] });
  const live = (rows || []).filter(r => r.status !== "cancelled");
  const stats = { total: live.length, delivered: live.filter(r => r.status === "delivered").length, transit: live.filter(r => r.status === "in_transit").length, draft: live.filter(r => r.status === "draft").length };
  const shown = useMemo(() => (rows || []).filter(r => (fTo === "all" || String(r.to_site_id) === fTo) && (fStatus === "all" || r.status === fStatus) && (!fFrom || r.dispatch_date >= fFrom) && (!fTill || r.dispatch_date <= fTill) && (!q.trim() || r.idc_no.toLowerCase().includes(q.trim().toLowerCase()))), [rows, fTo, fStatus, fFrom, fTill, q]);

  async function save(thenDispatch) {
    setBusy(true); setErr("");
    const r = await saveDispatch(form.id, { ...form, items: form.items.map(i => ({ item_id: i.item_id, item_name: i.item_name, unit: i.unit, qty: Number(i.qty), note: i.note || "" })) });
    if (!r.ok) { setBusy(false); setErr(r.error); return; }
    if (thenDispatch) { const s = await setDispatchStatus(r.id, "in_transit"); if (!s.ok) { setBusy(false); setErr(s.error); return; } }
    setBusy(false); setForm(null); setMsg(thenDispatch ? "Dispatched — material In Transit." : (form.id ? "Draft updated." : "Draft saved.")); load();
  }
  async function status(row, st) {
    let reason = null;
    if (st === "cancelled") { reason = window.prompt(`Cancel ${row.idc_no} — reason:`); if (!reason) return; }
    if (st === "delivered" && !window.confirm(`Mark ${row.idc_no} as DELIVERED at ${row.to}?\n\nStock moves now: −${row.items.length} item line(s) from ${row.from}, +same at ${row.to}. This cannot be undone.`)) return;
    setBusy(true); setErr(""); const r = await setDispatchStatus(row.id, st, reason); setBusy(false);
    if (!r.ok) { setErr(r.error); return; } setMsg(st === "delivered" ? `${row.idc_no} delivered — stock updated at ${row.from} and ${row.to}.` : st === "in_transit" ? `${row.idc_no} dispatched.` : `${row.idc_no} cancelled.`); load();
  }
  const inp = { width: "100%", boxSizing: "border-box" };
  const canAct = !!session?.id;

  return (
    <div>
      {msg && <div className="note green">{msg}</div>}
      {err && !form && <div className="note red">{err}</div>}
      <div className="panel">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
          <Stat label="Total dispatched" n={stats.total} /><Stat label="Delivered" n={stats.delivered} color="var(--green)" /><Stat label="In transit" n={stats.transit} color="#BA7517" /><Stat label="Draft" n={stats.draft} color="var(--muted)" />
        </div>
        <div style={{ background: "#FFF9F5", border: "1px solid #FFD8B5", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>➡️</span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>Create Internal Dispatch Challan</div><div className="muted" style={{ fontSize: 11.5 }}>Select items from office/warehouse stock and dispatch to a site. Stock moves only when the site marks it Delivered.</div></div>
          {canAct && <button className="primary" onClick={() => { setErr(""); setForm(blank()); }}>＋ New Dispatch</button>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <select value={fTo} onChange={e => setFTo(e.target.value)}><option value="all">Destination site: all</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="all">Status: all</option>{Object.entries(IDC_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
          <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} title="From date" /><input type="date" value={fTill} onChange={e => setFTill(e.target.value)} title="To date" />
          <input placeholder="Search challan no…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        </div>
        <div className="dt-scroll">
          <table className="dt-compact" style={{ width: "100%" }}>
            <thead><tr><th>Challan No</th><th>Date</th><th>From</th><th>To (Site)</th><th className="num">Items</th><th>Dispatched by</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{rows === null ? <tr><td colSpan={8} className="muted">Loading…</td></tr> : shown.length === 0 ? <tr><td colSpan={8} className="muted">No internal dispatches{rows.length ? " match the filters" : " yet"}.</td></tr>
              : shown.map(r => (<tr key={r.id} style={{ opacity: r.status === "cancelled" ? .6 : 1 }}>
                <td style={{ color: "#FF7A1A", fontWeight: 700, whiteSpace: "nowrap" }}>{r.idc_no}</td><td>{dmy(r.dispatch_date)}</td><td>{r.from}</td><td>{r.to}</td><td className="num">{r.items.length}</td><td>{r.dispatched_by || r.creator_name}</td>
                <td><Pill s={r.status} />{r.status === "cancelled" && r.cancel_reason && <div className="muted" style={{ fontSize: 10.5 }}>{r.cancel_reason}</div>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => window.open("/stock/idc-print?ids=" + r.id, "_blank")}>PDF</button>
                  {r.status === "draft" && canAct && <><button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => { setErr(""); setForm({ id: r.id, from_site_id: String(r.from_site_id), to_site_id: String(r.to_site_id), dispatch_date: r.dispatch_date, dispatched_by: r.dispatched_by || "", vehicle_no: r.vehicle_no || "", driver_name: r.driver_name || "", notes: r.notes || "", items: r.items.map(i => ({ ...i })) }); }}>Edit</button><button className="primary" style={{ fontSize: 11.5, marginRight: 4 }} disabled={busy} onClick={() => status(r, "in_transit")}>Send</button></>}
                  {r.status === "in_transit" && canAct && <button className="primary" style={{ fontSize: 11.5, marginRight: 4 }} disabled={busy} onClick={() => status(r, "delivered")}>Mark Delivered</button>}
                  <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => setView(r)}>View</button>
                  {isAdmin && (r.status === "draft" || r.status === "in_transit") && <button style={{ fontSize: 11.5, color: "var(--red)" }} disabled={busy} onClick={() => status(r, "cancelled")}>Cancel</button>}
                </td></tr>))}</tbody>
          </table>
        </div>
      </div>

      {form && (
        <div onClick={() => !busy && setForm(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }}>
          <div onClick={e => e.stopPropagation()} className="panel" style={{ width: "min(820px,100%)", margin: 0, maxHeight: "94vh", overflowY: "auto" }}>
            <h2 style={{ marginTop: 0 }}>{form.id ? "Edit dispatch (draft)" : "New internal dispatch"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              <div><label className="muted">From (source) *</label><select style={inp} value={form.from_site_id} onChange={e => setForm(f => ({ ...f, from_site_id: e.target.value }))}><option value="">— select —</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="muted">To (destination site) *</label><select style={inp} value={form.to_site_id} onChange={e => setForm(f => ({ ...f, to_site_id: e.target.value }))}><option value="">— select —</option>{sites.filter(s => String(s.id) !== String(form.from_site_id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="muted">Date of dispatch *</label><input type="date" style={inp} value={form.dispatch_date} onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))} /></div>
              <div><label className="muted">Dispatched by</label><input style={inp} value={form.dispatched_by} onChange={e => setForm(f => ({ ...f, dispatched_by: e.target.value }))} /></div>
              <div><label className="muted">Vehicle no (optional)</label><input style={inp} value={form.vehicle_no} onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value.toUpperCase() }))} placeholder="GJ01AB1234" /></div>
              <div><label className="muted">Driver name (optional)</label><input style={inp} value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} /></div>
              <div style={{ gridColumn: "1/-1" }}><label className="muted">Notes / remarks</label><input style={inp} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="muted">Items — search the Item Master and add</label>
              <input style={inp} placeholder="Type item name, e.g. CPVC 25mm" value={iq} onChange={e => setIq(e.target.value)} />
              {hits.length > 0 && <div style={{ border: "1px solid var(--border)", borderRadius: 8, maxHeight: 180, overflowY: "auto", marginTop: 4 }}>
                {hits.map(h => <div key={h.id} style={{ padding: "6px 10px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)" }} onClick={() => { setForm(f => f.items.some(i => i.item_id === h.id) ? f : ({ ...f, items: [...f.items, { item_id: h.id, item_name: h.display_name, unit: h.unit, qty: "", note: "" }] })); setIq(""); setHits([]); }}>{h.display_name} <span className="muted">· {h.unit}</span></div>)}
              </div>}
              {form.items.length > 0 && <table className="dt-compact" style={{ width: "100%", marginTop: 8 }}>
                <thead><tr><th>Item</th><th className="num">Qty *</th><th>Unit</th><th>Note</th><th></th></tr></thead>
                <tbody>{form.items.map((it, i) => <tr key={it.item_id}><td>{it.item_name}</td><td className="num"><input style={{ width: 80, textAlign: "right" }} inputMode="decimal" value={it.qty} onChange={e => setForm(f => { const l = [...f.items]; l[i] = { ...l[i], qty: e.target.value.replace(/[^0-9.]/g, "") }; return { ...f, items: l }; })} /></td><td>{it.unit || "Nos"}</td><td><input style={{ width: "100%" }} value={it.note || ""} onChange={e => setForm(f => { const l = [...f.items]; l[i] = { ...l[i], note: e.target.value }; return { ...f, items: l }; })} /></td><td><button type="button" style={{ fontSize: 11.5 }} onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>✕</button></td></tr>)}</tbody>
              </table>}
            </div>
            {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button onClick={() => setForm(null)} disabled={busy}>Cancel</button>
              <button onClick={() => save(false)} disabled={busy || !form.from_site_id || !form.to_site_id || !form.items.length || form.items.some(i => !(Number(i.qty) > 0))}>💾 Save as Draft</button>
              <button className="primary" onClick={() => save(true)} disabled={busy || !form.from_site_id || !form.to_site_id || !form.items.length || form.items.some(i => !(Number(i.qty) > 0))}>{busy ? "Saving…" : "🚚 Save & Dispatch"}</button>
            </div>
          </div>
        </div>
      )}

      {view && (
        <div onClick={() => setView(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }}>
          <div onClick={e => e.stopPropagation()} className="panel" style={{ width: "min(720px,100%)", margin: 0, maxHeight: "94vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 style={{ margin: 0 }}>{view.idc_no}</h2><Pill s={view.status} /></div>
            <div className="muted" style={{ fontSize: 12.5, margin: "6px 0 10px" }}>{dmy(view.dispatch_date)} · <b>{view.from}</b> → <b>{view.to}</b> · by {view.dispatched_by || view.creator_name}{view.vehicle_no ? ` · ${view.vehicle_no}` : ""}{view.driver_name ? ` · ${view.driver_name}` : ""}</div>
            <table className="dt-compact" style={{ width: "100%" }}><thead><tr><th>Item</th><th className="num">Qty</th><th>Unit</th><th>Note</th></tr></thead><tbody>{view.items.map(i => <tr key={i.id}><td>{i.item_name}</td><td className="num">{Number(i.qty)}</td><td>{i.unit || "Nos"}</td><td>{i.note || ""}</td></tr>)}</tbody></table>
            {view.notes && <div style={{ fontSize: 12.5, marginTop: 8 }}><b>Remarks:</b> {view.notes}</div>}
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>{view.dispatched_at && <>Dispatched {String(view.dispatched_at).slice(0, 16).replace("T", " ")} · </>}{view.delivered_at && <>Delivered {String(view.delivered_at).slice(0, 16).replace("T", " ")}</>}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button onClick={() => window.open("/stock/idc-print?ids=" + view.id, "_blank")}>PDF</button><button className="primary" onClick={() => setView(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
