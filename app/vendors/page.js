"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { isDemo } from "@/lib/supabase";
import { getVendors, saveVendor, toggleVendorActive, deleteVendor } from "@/lib/vendors";
import { getSession, canAnySite } from "@/lib/auth";

const blank = { name: "", gstin: "", contact: "", phone: "", email: "", address: "", payment_terms: "", categories: "", is_active: true };

export default function VendorsPage() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);   // null = closed; object = add/edit
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);
  useEffect(() => { setSession(getSession()); }, []);
  const canDelete = canAnySite(session, "indent", "manage");   // Manage tick on Indent & Purchase (or Director)
  const isITExecutive = String(session?.role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive";

  const load = () => getVendors(true).then(setRows);
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setErr("");
    if (!form.name?.trim()) { setErr("Vendor name is required."); return; }
    setBusy(true); const res = await saveVendor(form); setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(form.id ? "Vendor updated." : "Vendor added."); setForm(null); load();
  }
  async function toggle(v) { await toggleVendorActive(v.id, !v.is_active); load(); }
  async function remove(v) {
    if (!confirm(`Delete "${v.name}" permanently?\n\nOnly possible if this vendor has no purchase orders or records. Vendors with history must be deactivated instead.`)) return;
    const r = await deleteVendor(v.id);
    if (!r.ok) { setMsg(""); setErr(r.error); return; }
    setErr(""); setMsg("Vendor deleted."); load();
  }

  const columns = [
    { key: "name", label: "Vendor", filter: "search", render: v => <span style={{ fontWeight: 600 }}>{v.name}</span> },
    { key: "gstin", label: "GSTIN", filter: "search", render: v => <span className="muted">{v.gstin || "—"}</span> },
    { key: "contact", label: "Contact", filter: "search", render: v => <span>{v.contact || "—"}{v.phone ? <div className="muted">{v.phone}</div> : null}</span> },
    { key: "categories", label: "Supplies", filter: "search", render: v => <span className="muted">{v.categories || "—"}</span> },
    { key: "payment_terms", label: "Payment terms", render: v => <span className="muted">{v.payment_terms || "—"}</span> },
    { key: "is_active", label: "Status", filter: "select", optionLabel: o => o ? "Active" : "Inactive",
      render: v => v.is_active ? <span className="badge p">Active</span> : <span className="badge gray">Inactive</span>, exportValue: v => v.is_active ? "Active" : "Inactive" },
    { key: "_action", label: "Action", sortable: false, render: v => (
      <span style={{ whiteSpace: "nowrap" }}>
        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => { setForm(v); setMsg(""); setErr(""); }}>Edit</button>
        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => toggle(v)}>{v.is_active ? "Deactivate" : "Activate"}</button>
        {canDelete && <button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => remove(v)}>🗑</button>}
      </span>) },
  ];
  const activeCount = (rows || []).filter(v => v.is_active).length;
  const inactiveCount = (rows || []).length - activeCount;
  const categoryCounts = Object.entries((rows || []).reduce((acc, vendor) => {
    const seen = new Set(String(vendor.categories || "").split(/[,;|]/).map(x => x.trim()).filter(Boolean).map(x => x.toLowerCase()));
    for (const category of seen) { const label = String(vendor.categories).split(/[,;|]/).map(x => x.trim()).find(x => x.toLowerCase() === category) || category; acc[label] = (acc[label] || 0) + 1; }
    return acc;
  }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  const categoryMax = Math.max(1, ...categoryCounts.map(x => x[1]));

  return (
    <div className={"layout" + (isITExecutive ? " it-page it-page-vendors" : "")}>
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Vendor master</h1>
          <button className="primary" onClick={() => { setForm({ ...blank }); setMsg(""); setErr(""); }}>＋ Add vendor</button>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — sample vendors.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && !form && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

        {isITExecutive && <section className="it-vendor-overview" aria-label="Live vendor overview">
          <div className="it-vendor-kpis">
            <div><span>Vendor records</span><strong>{rows ? rows.length.toLocaleString("en-IN") : "—"}</strong><small>Loaded from Vendor Master</small></div>
            <div><span>Active vendors</span><strong className="good">{rows ? activeCount.toLocaleString("en-IN") : "—"}</strong><small>Available for procurement</small></div>
            <div><span>Inactive vendors</span><strong className="quiet">{rows ? inactiveCount.toLocaleString("en-IN") : "—"}</strong><small>Existing records retained</small></div>
          </div>
          <div className="it-vendor-chart">
            <div><h2>Supplies by vendor</h2><p>Top categories recorded in supplier profiles.</p></div>
            {rows === null ? <div className="it-vendor-empty">Loading vendor records…</div> : categoryCounts.length ? categoryCounts.map(([category, count]) => <div className="it-vendor-bar" key={category}><span title={category}>{category}</span><i><b style={{ width: `${count / categoryMax * 100}%` }} /></i><strong>{count}</strong></div>) : <div className="it-vendor-empty">No supply categories recorded yet.</div>}
          </div>
        </section>}

        {form && (
          <div className="panel">
            <h2>{form.id ? "Edit vendor" : "Add vendor"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
              <div><label className="muted">Vendor name *</label><input style={{ width: "100%" }} value={form.name} onChange={e => set("name", e.target.value)} /></div>
              <div><label className="muted">GSTIN</label><input style={{ width: "100%" }} value={form.gstin} onChange={e => set("gstin", e.target.value)} /></div>
              <div><label className="muted">Contact person</label><input style={{ width: "100%" }} value={form.contact} onChange={e => set("contact", e.target.value)} /></div>
              <div><label className="muted">Phone</label><input style={{ width: "100%" }} value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
              <div><label className="muted">Email</label><input style={{ width: "100%" }} value={form.email} onChange={e => set("email", e.target.value)} /></div>
              <div><label className="muted">Supplies (categories)</label><input style={{ width: "100%" }} value={form.categories} onChange={e => set("categories", e.target.value)} placeholder="Pipe, Fitting, Valve" /></div>
              <div style={{ gridColumn: "span 2" }}><label className="muted">Address</label><input style={{ width: "100%" }} value={form.address} onChange={e => set("address", e.target.value)} /></div>
              <div style={{ gridColumn: "span 2" }}><label className="muted">Payment terms</label><input style={{ width: "100%" }} value={form.payment_terms} onChange={e => set("payment_terms", e.target.value)} placeholder="e.g. 50% advance, 50% on delivery" /></div>
            </div>
            {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save vendor"}</button>
              <button onClick={() => setForm(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="panel">
          {!rows ? <div className="muted">Loading…</div> :
            <DataTable columns={columns} rows={rows} exportName="vendors" />}
        </div>
      </main>
    </div>
  );
}