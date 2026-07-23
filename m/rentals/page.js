"use client";
import { useEffect, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { getSession, can } from "@/lib/auth";
import { getRentals, addRental, getRentalDocs, uploadRentalDoc, getMachineTypes, addMachineType, inr } from "@/lib/rentals";

export default function MRentals() {
  const sess = typeof window !== "undefined" ? getSession() : null;
  useEffect(() => { if (typeof window !== "undefined" && !getSession()) window.location.replace("/m"); }, []);
  const siteId = sess?.currentSite || sess?.sites?.[0]?.id;
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);          // rental with docs open
  const [docs, setDocs] = useState([]);
  const [docName, setDocName] = useState("");
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState([]);
  const [newType, setNewType] = useState(null);
  useEffect(() => { getMachineTypes().then(setTypes); }, []);
  async function saveNewType() {
    const r = await addMachineType(newType);
    if (!r.ok) { setErr(r.error); return; }
    setTypes(await getMachineTypes());
    setForm(f => ({ ...f, name: r.type.name }));
    setNewType(null);
  }
  const canCreate = sess && (sess.role === "director" || can(sess, "rentals", "create", siteId));

  const load = () => siteId && getRentals(siteId).then(setRows);
  useEffect(() => { load(); }, [siteId, msg]);

  async function openDocs(r) { setOpen(r); setDocs(await getRentalDocs(r.id)); }
  async function onUpload(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !open) return;
    setBusy(true); const res = await uploadRentalDoc(open.id, f, docName.trim(), sess?.id); setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setDocName(""); setDocs(await getRentalDocs(open.id)); setMsg("Uploaded ✓"); setTimeout(() => setMsg(""), 1500);
  }
  async function submit() {
    setErr("");
    if (!form.name?.trim() || !form.start_date) { setErr("Type/name and start date needed."); return; }
    setBusy(true);
    const res = await addRental({ ...form, site_id: siteId, created_by: sess?.id });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setForm(null); setMsg("Added ✓"); setTimeout(() => setMsg(""), 1500);
  }

  return (
    <div className="m-wrap">
      <div className="m-head"><div><div className="m-title">Machines & Rooms</div><div className="m-sub">on rent · this site</div></div></div>
      <div className="m-body" style={{ paddingBottom: 90 }}>
        {msg && <div className="note green">{msg}</div>}
        {err && <div className="note red">{err}</div>}
        {canCreate && !form && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button className="primary" style={{ flex: 1 }} onClick={() => setForm({ kind: "machine", name: "", supplier_name: "", start_date: "", rent_due_day: "", rent_amount: "", deposit_amount: "" })}>＋ Machine</button>
            <button className="primary" style={{ flex: 1 }} onClick={() => setForm({ kind: "room", name: "", supplier_name: "", start_date: "", rent_due_day: "", rent_amount: "", deposit_amount: "" })}>＋ Room</button>
          </div>
        )}
        {form && (
          <div className="m-card" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Add {form.kind}</div>
            {form.kind === "machine" ? (
              <div style={{ marginBottom: 6 }}>
                <select value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: "100%" }}>
                  <option value="">— pick machine type —</option>
                  {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
                {newType === null
                  ? <button style={{ fontSize: 12, marginTop: 4 }} onClick={() => setNewType("")}>＋ New type</button>
                  : <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <input style={{ flex: 1 }} placeholder="e.g. Excavator" value={newType} onChange={e => setNewType(e.target.value)} />
                      <button className="primary" style={{ fontSize: 12 }} onClick={saveNewType}>Add</button>
                    </div>}
              </div>
            ) : (
              <input placeholder="Room name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: "100%", marginBottom: 6 }} />
            )}
            <input placeholder={form.kind === "machine" ? "Supplier name" : "Owner name"} value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} style={{ width: "100%", marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value, rent_due_day: f.rent_due_day || (e.target.value ? String(Number(e.target.value.slice(8, 10))) : "") }))} style={{ flex: 1 }} />
              <input inputMode="numeric" placeholder="Due day" value={form.rent_due_day} onChange={e => setForm(f => ({ ...f, rent_due_day: e.target.value }))} style={{ width: 80 }} />
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input inputMode="numeric" placeholder="Rent ₹/mo" value={form.rent_amount} onChange={e => setForm(f => ({ ...f, rent_amount: e.target.value }))} style={{ flex: 1 }} />
              <input inputMode="numeric" placeholder="Deposit ₹" value={form.deposit_amount} onChange={e => setForm(f => ({ ...f, deposit_amount: e.target.value }))} style={{ flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" disabled={busy} onClick={submit} style={{ flex: 1 }}>Save</button>
              <button onClick={() => setForm(null)}>Cancel</button>
            </div>
          </div>
        )}
        {!rows ? <div className="muted">Loading…</div> : rows.length === 0 ? <div className="muted">Nothing on rent at this site.</div> :
          rows.map(r => (
            <div key={r.id} className="m-card" style={{ marginBottom: 8, opacity: r.is_active ? 1 : 0.55 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700 }}>{r.kind === "machine" ? "🚜" : "🏠"} {r.name}</div>
                {r.due && <span className={"badge " + (r.due.days <= 0 ? "a" : r.due.days <= 3 ? "warn" : "gray")} style={{ fontSize: 10.5 }}>
                  {r.due.days <= 0 ? "RENT DUE" : "due " + r.due.date}</span>}
              </div>
              <div className="muted" style={{ fontSize: 12, margin: "3px 0 6px" }}>
                {r.supplier_name || "—"} · {inr(r.rent_amount)}/mo{r.deposit_amount > 0 ? ` · dep ${inr(r.deposit_amount)}` : ""} · from {r.start_date}
              </div>
              <button style={{ fontSize: 12 }} onClick={() => openDocs(r)}>📄 Documents ({r.docs})</button>
            </div>
          ))}
        {open && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", zIndex: 70, display: "flex", alignItems: "flex-end" }} onClick={() => setOpen(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", padding: 16, maxHeight: "75vh", overflowY: "auto" }}>
              <div style={{ fontWeight: 800 }}>📄 {open.name}</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Upload machine & operator papers — RC, insurance, fitness, licence…</div>
              {docs.map(d => (
                <a key={d.id} href={d.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "8px 10px", background: "#F4F5F7", borderRadius: 8, marginBottom: 6, textDecoration: "none", color: "inherit", fontSize: 13 }}>
                  📄 {d.name} <span className="muted" style={{ fontSize: 11 }}>· {d.by}</span>
                </a>
              ))}
              <input placeholder="Document name (e.g. Operator licence)" value={docName} onChange={e => setDocName(e.target.value)} style={{ width: "100%", margin: "8px 0" }} />
              <label style={{ display: "block", textAlign: "center", padding: 11, borderRadius: 10, background: "var(--copper)", color: "#fff", fontWeight: 700 }}>
                ⬆ {busy ? "Uploading…" : "Upload photo / PDF"}<input type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={onUpload} disabled={busy} />
              </label>
              <button style={{ width: "100%", marginTop: 8 }} onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
