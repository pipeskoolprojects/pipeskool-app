"use client";
// update393: CLIENT MASTER — list + add/edit modal (layout confirmed by the Director on 16 Sep).
// Data: public.clients; site links on sites.client_id. Used by Delivery Challans (client dropdown
// + printed Bill-to / Ship-to blocks).
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getClients, saveClient, INDIAN_STATES } from "@/lib/clients";
import { getSites } from "@/lib/data";
import { getSession, canAnySite } from "@/lib/auth";

const blank = { name: "", company_name: "", gstin: "", pan: "", bill_line1: "", bill_line2: "", bill_city: "", bill_state_code: "24", bill_pincode: "",
  ship_same: true, ship_line1: "", ship_line2: "", ship_city: "", ship_state_code: "24", ship_pincode: "", contact_name: "", mobile: "", is_active: true };

export default function ClientsPage() {
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState(null);
  const [sites, setSites] = useState([]);
  const [q, setQ] = useState(""); const [st, setSt] = useState("active");
  const [form, setForm] = useState(null); const [siteIds, setSiteIds] = useState([]);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const canManage = !!session && (session.role === "director" || canAnySite(session, "billing", "manage") || canAnySite(session, "stock", "manage"));

  async function load() { try { setRows(await getClients()); } catch (e) { setErr(e.message); setRows([]); } }
  useEffect(() => { setSession(getSession()); load(); getSites().then(r => setSites(Array.isArray(r) ? r : (r?.data || []))); }, []);

  const shown = useMemo(() => (rows || []).filter(c =>
    (st === "all" || (st === "active") === (c.is_active !== false)) &&
    (!q.trim() || [c.name, c.company_name, c.gstin, c.bill_city, c.contact_name, c.mobile].join(" ").toLowerCase().includes(q.trim().toLowerCase()))), [rows, q, st]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  function openEdit(c) { setErr(""); setMsg(""); setForm({ ...blank, ...c, bill_state_code: c.bill_state_code || "24", ship_state_code: c.ship_state_code || "24" }); setSiteIds((c.sites || []).map(s => s.id)); }
  async function save() {
    setBusy(true); setErr("");
    const r = await saveClient(form, siteIds);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setForm(null); setMsg(form.id ? "Client updated." : "Client added."); load();
  }
  const inp = { width: "100%", boxSizing: "border-box" };
  const Addr = ({ p, disabled }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, opacity: disabled ? .55 : 1 }}>
      <div style={{ gridColumn: "1/-1" }}><label className="muted">Address line 1</label><input style={inp} disabled={disabled} value={form[p + "_line1"] || ""} onChange={e => set(p + "_line1", e.target.value)} /></div>
      <div style={{ gridColumn: "1/-1" }}><label className="muted">Address line 2</label><input style={inp} disabled={disabled} value={form[p + "_line2"] || ""} onChange={e => set(p + "_line2", e.target.value)} /></div>
      <div><label className="muted">City</label><input style={inp} disabled={disabled} value={form[p + "_city"] || ""} onChange={e => set(p + "_city", e.target.value)} /></div>
      <div><label className="muted">State</label><select style={inp} disabled={disabled} value={form[p + "_state_code"] || "24"} onChange={e => set(p + "_state_code", e.target.value)}>{INDIAN_STATES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}</select></div>
      <div><label className="muted">Pincode</label><input style={inp} disabled={disabled} inputMode="numeric" value={form[p + "_pincode"] || ""} onChange={e => set(p + "_pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
    </div>
  );

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div><h1 style={{ marginBottom: 2 }}>Clients</h1><div className="muted" style={{ fontSize: 12.5 }}>Commercial / Billing · master used on Delivery Challans</div></div>
          {canManage && <button className="primary" onClick={() => { setErr(""); setMsg(""); setForm({ ...blank }); setSiteIds([]); }}>＋ Add client</button>}
        </div>
        {isDemo && <div className="demo-banner">Demo mode.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && !form && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

        <div className="panel">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input placeholder="Search name, GSTIN, city, contact" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <select value={st} onChange={e => setSt(e.target.value)}><option value="active">Status: Active</option><option value="all">Status: All</option><option value="inactive">Status: Inactive</option></select>
          </div>
          {rows === null ? <div className="muted">Loading…</div> : shown.length === 0 ? <div className="muted">No clients yet. Add the first one.</div> : (
            <div className="dt-scroll">
              <table className="dt-compact" style={{ width: "100%" }}>
                <thead><tr><th>Client</th><th>GSTIN</th><th>City / State</th><th>Contact</th><th className="num">Sites</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {shown.map(c => (
                    <tr key={c.id}>
                      <td><div style={{ fontWeight: 700 }}>{c.name}</div><div className="muted" style={{ fontSize: 11.5 }}>{c.company_name || "—"}</div></td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.gstin || "—"}</td>
                      <td>{[c.bill_city, c.bill_state_code].filter(Boolean).join(", ") || "—"}</td>
                      <td><div>{c.contact_name || "—"}</div><div className="muted" style={{ fontSize: 11.5 }}>{c.mobile || "—"}</div></td>
                      <td className="num" title={(c.sites || []).map(s => s.name).join(", ")}>{(c.sites || []).length}</td>
                      <td>{c.is_active !== false ? <span className="badge p">Active</span> : <span className="badge gray">Inactive</span>}</td>
                      <td>{canManage && <button style={{ fontSize: 11.5 }} onClick={() => openEdit(c)}>✎ Edit</button>}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          )}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{shown.length} of {(rows || []).length} clients</div>
        </div>

        {form && (
          <div onClick={() => !busy && setForm(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "min(720px,100%)", maxHeight: "94vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid var(--border)" }}><h2 style={{ margin: 0 }}>{form.id ? "Edit client" : "Add client"}</h2></div>
              <div style={{ padding: "12px 20px", overflowY: "auto", flex: 1, fontSize: 13 }}>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Identity</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 14 }}>
                  <div><label className="muted">Client name *</label><input style={inp} value={form.name} onChange={e => set("name", e.target.value)} autoFocus /></div>
                  <div><label className="muted">Company / organisation (if different)</label><input style={inp} value={form.company_name || ""} onChange={e => set("company_name", e.target.value)} /></div>
                  <div><label className="muted">GSTIN</label><input style={{ ...inp, fontFamily: "monospace", textTransform: "uppercase" }} maxLength={15} value={form.gstin || ""} onChange={e => set("gstin", e.target.value.toUpperCase())} /></div>
                  <div><label className="muted">PAN</label><input style={{ ...inp, fontFamily: "monospace", textTransform: "uppercase" }} maxLength={10} value={form.pan || ""} onChange={e => set("pan", e.target.value.toUpperCase())} /></div>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Billing address (Bill to)</div>
                <div style={{ marginBottom: 14 }}><Addr p="bill" /></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>Site / delivery address (Ship to)</div>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={form.ship_same !== false} onChange={e => set("ship_same", e.target.checked)} /> Same as billing</label>
                </div>
                <div style={{ marginBottom: 14 }}><Addr p="ship" disabled={form.ship_same !== false} /></div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Contact</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 14 }}>
                  <div><label className="muted">Contact person</label><input style={inp} value={form.contact_name || ""} onChange={e => set("contact_name", e.target.value)} /></div>
                  <div><label className="muted">Mobile</label><input style={inp} inputMode="tel" value={form.mobile || ""} onChange={e => set("mobile", e.target.value)} /></div>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Sites of this client <span style={{ fontWeight: 400 }}>— pre-selects the client on their challans</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginBottom: 14 }}>
                  {sites.map(s => <label key={s.id} style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={siteIds.includes(s.id)} onChange={e => setSiteIds(l => e.target.checked ? [...l, s.id] : l.filter(x => x !== s.id))} />{s.name}</label>)}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><input type="checkbox" checked={form.is_active !== false} onChange={e => set("is_active", e.target.checked)} /> Active <span className="muted" style={{ fontSize: 11.5 }}>— inactive clients are hidden from challan dropdowns</span></label>
                {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setForm(null)} disabled={busy}>Cancel</button>
                <button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save client"}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
