"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { getWorkers, saveWorker, inr } from "@/lib/data";
import { getContractors, getSitesList } from "@/lib/mobile";
import { isDemo } from "@/lib/supabase";

const CATEGORIES = ["plumber", "fitter", "helper", "welder", "supervisor", "operator", "electrician", "mason", "other"];
const EMPTY = { full_name: "", mobile: "", category: "plumber", labour_type: "own", contractor_id: "", site_id: "", daily_wage: "", is_active: true };

export default function WorkersPage() {
  const [rows, setRows] = useState(null);
  const [sites, setSites] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [modal, setModal] = useState(null);     // { id?, ...form }  null = closed
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  const load = () => getWorkers().then(setRows);
  useEffect(() => { load(); getSitesList().then(setSites); getContractors().then(setContractors); }, []);

  const incompleteCount = (rows || []).filter(r => !r.complete).length;
  const set = (k, v) => setModal(m => ({ ...m, [k]: v }));

  async function save() {
    setBusy(true); setErr("");
    const res = await saveWorker(modal.id || null, modal);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(modal.id ? "Worker updated." : "Worker added — they can log in with their mobile and punch.");
    setModal(null); load();
  }

  const columns = [
    { key: "name", label: "Worker", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: "mobile", label: "Mobile", filter: "search", render: r => <span className="muted">{r.mobile}</span> },
    { key: "category", label: "Category", filter: "select" },
    { key: "type", label: "Labour type", filter: "select",
      render: r => r.type === "Own" ? <span className="badge gray">Own</span> : <span className="badge info">{r.contractor}</span> },
    { key: "site", label: "Site", filter: "select" },
    { key: "wage", label: "Daily wage", type: "num", render: r => inr(r.wage), exportValue: r => r.wage },
    { key: "complete", label: "Profile", filter: "select",
      optionLabel: o => o ? "Complete" : "Incomplete",
      render: r => r.complete ? <span className="badge p">Complete</span> : <span className="badge warn">Incomplete</span>,
      exportValue: r => r.complete ? "Complete" : "Incomplete" },
    { key: "_edit", label: "", render: r => <button style={{ fontSize: 11.5 }} onClick={() => { setErr(""); setModal({ id: r.id, ...r.raw }); }}>✎ Edit</button>, exportValue: () => "" },
  ];

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Worker master</h1>
          <button className="primary" onClick={() => { setErr(""); setModal({ ...EMPTY }); }}>＋ Add worker</button>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — sample worker master shown.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {incompleteCount > 0 && (
          <div className="demo-banner">
            {incompleteCount} profile{incompleteCount > 1 ? "s" : ""} incomplete (Aadhaar or bank pending).
          </div>
        )}
        <div className="panel">
          {!rows ? <div className="muted">Loading…</div> :
            <DataTable columns={columns} rows={rows} exportName="workers" />}
        </div>

        {modal && (
          <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 460, width: "100%", padding: 22, maxHeight: "90vh", overflowY: "auto" }}>
              <h2 style={{ marginBottom: 12 }}>{modal.id ? "Edit worker" : "Add worker"}</h2>
              <div style={{ display: "grid", gap: 10 }}>
                <div><label className="muted">Full name *</label><input style={{ width: "100%" }} value={modal.full_name} onChange={e => set("full_name", e.target.value)} /></div>
                <div><label className="muted">Mobile *</label><input style={{ width: "100%" }} inputMode="numeric" value={modal.mobile} onChange={e => set("mobile", e.target.value)} /></div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}><label className="muted">Category</label>
                    <select style={{ width: "100%" }} value={modal.category} onChange={e => set("category", e.target.value)}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select></div>
                  <div style={{ flex: 1 }}><label className="muted">Daily wage ₹ *</label><input style={{ width: "100%" }} inputMode="numeric" value={modal.daily_wage} onChange={e => set("daily_wage", e.target.value)} /></div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}><label className="muted">Labour type</label>
                    <select style={{ width: "100%" }} value={modal.labour_type} onChange={e => set("labour_type", e.target.value)}>
                      <option value="own">Own</option><option value="contractor">Contractor</option>
                    </select></div>
                  <div style={{ flex: 1 }}><label className="muted">Site *</label>
                    <select style={{ width: "100%" }} value={modal.site_id || ""} onChange={e => set("site_id", e.target.value)}>
                      <option value="">Select…</option>
                      {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></div>
                </div>
                {modal.labour_type === "contractor" && (
                  <div><label className="muted">Contractor</label>
                    <select style={{ width: "100%" }} value={modal.contractor_id || ""} onChange={e => set("contractor_id", e.target.value)}>
                      <option value="">Select contractor…</option>
                      {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select></div>
                )}
                {modal.id && (
                  <label style={{ display: "inline-flex", gap: 7, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={modal.is_active !== false} onChange={e => set("is_active", e.target.checked)} style={{ accentColor: "var(--copper)" }} />
                    Active (untick to deactivate — they can no longer log in or punch)
                  </label>
                )}
              </div>
              {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : modal.id ? "Save changes" : "Add worker"}</button>
                <button onClick={() => setModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
