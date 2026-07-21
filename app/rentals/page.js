"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession, can } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { getRentals, addRental, endRental, getRentalDocs, uploadRentalDoc, inr } from "@/lib/rentals";

export default function RentalsPage() {
  const [sess, setSess] = useState(null);
  const [sites, setSites] = useState([]);
  const [site, setSite] = useState("all");
  const [kind, setKind] = useState("machine");
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [docsFor, setDocsFor] = useState(null);   // rental row whose docs are open
  const [docs, setDocs] = useState([]);
  const [docName, setDocName] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => { setSess(getSession()); getSites().then(setSites); }, []);
  const load = () => getRentals(site).then(setRows);
  useEffect(() => { load(); }, [site, msg]);

  const canCreate = sess && (sess.role === "director" || can(sess, "rentals", "create", site === "all" ? undefined : site));
  const list = (rows || []).filter(r => r.kind === kind);

  async function openDocs(r) { setDocsFor(r); setDocs(await getRentalDocs(r.id)); }
  async function onUpload(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !docsFor) return;
    setBusy(true); const res = await uploadRentalDoc(docsFor.id, f, docName.trim(), sess?.id); setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setDocName(""); setDocs(await getRentalDocs(docsFor.id)); setMsg("Document uploaded."); 
  }
  async function submit() {
    setErr("");
    if (!form.name?.trim() || !form.site_id || !form.start_date) { setErr("Name/type, site and start date are mandatory."); return; }
    setBusy(true);
    const res = await addRental({ ...form, kind, created_by: sess?.id });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setForm(null); setMsg((kind === "machine" ? "Machine" : "Room") + " added.");
  }

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main className="content">
        <h1>Machines & Rooms on Rent</h1>
        {msg && <div className="note green" style={{ marginBottom: 10 }}>{msg}</div>}
        {err && <div className="note red" style={{ marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button className={kind === "machine" ? "primary" : ""} onClick={() => setKind("machine")}>🚜 Machines</button>
          <button className={kind === "room" ? "primary" : ""} onClick={() => setKind("room")}>🏠 Rooms</button>
          <select value={site} onChange={e => setSite(e.target.value)} style={{ marginLeft: "auto" }}>
            <option value="all">All sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {canCreate && <button className="primary" onClick={() => setForm({ site_id: site === "all" ? "" : site, start_date: "", rent_due_day: "", rent_amount: "", deposit_amount: "", name: "", supplier_name: "", note: "" })}>＋ Add {kind === "machine" ? "machine" : "room"}</button>}
        </div>

        {form && (
          <div className="panel" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Add {kind} on rent</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div><label className="muted">{kind === "machine" ? "Machine type *" : "Room name/label *"}</label><br />
                <input placeholder={kind === "machine" ? "JCB / Boom lift / …" : "Labour room, Gota"} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="muted">Site *</label><br />
                <select value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}>
                  <option value="">— pick —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label className="muted">{kind === "machine" ? "Supplier name" : "Room owner name"}</label><br />
                <input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} /></div>
              <div><label className="muted">On rent from *</label><br />
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value, rent_due_day: f.rent_due_day || (e.target.value ? String(Number(e.target.value.slice(8, 10))) : "") }))} /></div>
              <div style={{ width: 110 }}><label className="muted">Rent due day</label><br />
                <input inputMode="numeric" placeholder="1–31" value={form.rent_due_day} onChange={e => setForm(f => ({ ...f, rent_due_day: e.target.value }))} /></div>
              <div style={{ width: 130 }}><label className="muted">Monthly rent ₹</label><br />
                <input inputMode="numeric" value={form.rent_amount} onChange={e => setForm(f => ({ ...f, rent_amount: e.target.value }))} /></div>
              <div style={{ width: 130 }}><label className="muted">Deposit ₹ (0 = none)</label><br />
                <input inputMode="numeric" value={form.deposit_amount} onChange={e => setForm(f => ({ ...f, deposit_amount: e.target.value }))} /></div>
              <input style={{ flex: 1, minWidth: 160 }} placeholder="Note (optional)" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="primary" disabled={busy} onClick={submit}>Save</button>
              <button onClick={() => setForm(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="panel">
          {!rows ? <div className="muted">Loading…</div> : list.length === 0 ? (
            <div className="muted">No {kind === "machine" ? "machines" : "rooms"} on rent{site !== "all" ? " for this site" : ""} yet.</div>
          ) : (
            <table className="dt-compact" style={{ width: "100%" }}>
              <thead><tr><th>{kind === "machine" ? "Machine" : "Room"}</th><th>Site</th><th>{kind === "machine" ? "Supplier" : "Owner"}</th>
                <th className="num">Rent/mo</th><th className="num">Deposit</th><th>From</th><th>Next rent due</th><th>Docs</th><th></th></tr></thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.55 }}>
                    <td style={{ fontWeight: 600 }}>{r.name}{!r.is_active && <span className="badge gray" style={{ marginLeft: 6 }}>ended {r.ended_on}</span>}</td>
                    <td className="muted">{r.site_name}</td>
                    <td>{r.supplier_name || "—"}</td>
                    <td className="num">{inr(r.rent_amount)}</td>
                    <td className="num">{r.deposit_amount > 0 ? inr(r.deposit_amount) : "—"}</td>
                    <td className="muted">{r.start_date}</td>
                    <td>{r.due ? (
                      <span className={"badge " + (r.due.days <= 0 ? "a" : r.due.days <= 3 ? "warn" : "gray")}>
                        {r.due.date}{r.due.days <= 0 ? " · DUE" : ` · in ${r.due.days}d`}
                      </span>) : "—"}</td>
                    <td><button style={{ fontSize: 11.5 }} onClick={() => openDocs(r)}>📄 {r.docs}</button></td>
                    <td style={{ textAlign: "right" }}>
                      {r.is_active && canCreate && <button style={{ fontSize: 11.5 }} onClick={async () => { if (confirm("End this rental? Deposit return is handled outside the app.")) { const x = await endRental(r.id); x.ok ? setMsg("Rental ended.") : setErr(x.error); } }}>End</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {docsFor && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }} onClick={() => setDocsFor(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 480, width: "100%", padding: 20, maxHeight: "85vh", overflowY: "auto" }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Documents — {docsFor.name}</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{docsFor.site_name} · {docsFor.supplier_name || ""}</div>
              {docs.length === 0 ? <div className="muted" style={{ marginBottom: 10 }}>No documents uploaded yet.</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {docs.map(d => (
                    <a key={d.id} href={d.url} target="_blank" rel="noreferrer" style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "#F4F5F7", borderRadius: 8, textDecoration: "none", color: "inherit" }}>
                      <span>📄 {d.name}</span><span className="muted" style={{ fontSize: 11 }}>{d.by}</span>
                    </a>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input placeholder="Document name (e.g. RC book, Operator licence)" value={docName} onChange={e => setDocName(e.target.value)} style={{ flex: 1 }} />
                <label className="primary" style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", background: "var(--copper)", color: "#fff", fontWeight: 600, fontSize: 13 }}>
                  ⬆ Upload<input type="file" style={{ display: "none" }} onChange={onUpload} disabled={busy} />
                </label>
              </div>
              <div style={{ marginTop: 12, textAlign: "right" }}><button onClick={() => setDocsFor(null)}>Close</button></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
