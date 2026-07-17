"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { getWorkers, saveWorker, uploadAadhaarDoc, inr } from "@/lib/data";
import { getContractors, getSitesList } from "@/lib/mobile";
import { getStaff, addStaff, updateStaff, getRoles, addRole, resetStaffPassword, getUserSites, assignSite, removeSite } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { isDemo } from "@/lib/supabase";

const CATEGORIES = ["plumber", "fitter", "helper", "welder", "supervisor", "operator", "electrician", "mason", "other"];
const EMPTY = { full_name: "", mobile: "", category: "plumber", labour_type: "own", contractor_id: "", site_id: "", daily_wage: "", is_active: true };
// roles load dynamically from the Role Master (staff_roles table)
const S_EMPTY = { full_name: "", mobile: "", role: "supervisor", site_id: "", is_active: true };

export default function WorkersPage() {
  const [rows, setRows] = useState(null);
  const [sites, setSites] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [tab, setTab] = useState("workers");    // workers | staff
  const [roles, setRoles] = useState([]);
  const [roleModal, setRoleModal] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [staff, setStaff] = useState(null);
  const [smodal, setSmodal] = useState(null);    // staff add/edit modal
  const [modal, setModal] = useState(null);     // { id?, ...form }  null = closed
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  const sess = typeof window !== "undefined" ? getSession() : null;
  const isDirector = sess?.role === "director";
  const load = () => { getWorkers().then(setRows); getStaff().then(setStaff); getRoles().then(setRoles); };
  const roleLabel = r => (roles.find(x => x.code === r) || { label: r }).label;
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

  const sset = (k, v) => setSmodal(m => ({ ...m, [k]: v }));
  async function saveNewRole() {
    setBusy(true); setErr("");
    const res = await addRole(newRole);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setNewRole(""); setMsg("Role added — it's now available in the Role dropdown. Set its rights per staff member in Admin → Access Rights.");
    getRoles().then(setRoles);
  }
  async function doResetPassword() {
    if (!confirm(`Reset ${smodal.full_name}'s password?\n\nTheir current password stops working for staff access, and on their next login they will be asked to create a new one.`)) return;
    setBusy(true); setErr("");
    const res = await resetStaffPassword(smodal.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(smodal.full_name + " — password reset. On their next sign-in they'll create a new password. (If they're removed from the company, also untick Active.)");
    setSmodal(null); load();
  }

  async function saveStaff() {
    setBusy(true); setErr("");
    const res = smodal.id
      ? await updateStaff(smodal.id, smodal)
      : await addStaff({ full_name: smodal.full_name, mobile: String(smodal.mobile || "").trim(), role: smodal.role, site_id: smodal.site_id ? Number(smodal.site_id) : null });
    if (res.ok && smodal.id && smodal.siteIds) {
      const now = smodal.siteIds, before = smodal.origSiteIds || [];
      for (const sid of now.filter(x => !before.includes(x))) await assignSite(smodal.id, sid, smodal.role);
      for (const sid of before.filter(x => !now.includes(x))) await removeSite(smodal.id, sid);
    }
    setBusy(false);
    if (!res.ok && res.error) { setErr(res.error); return; }
    setMsg(smodal.id ? "Staff member updated." : "Staff added — they sign in with their mobile and create a password on first login. Set their module rights in Admin → Access Rights.");
    setSmodal(null); load();
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
          <h1>Workers &amp; Staff master</h1>
          {tab === "workers"
            ? <button className="primary" onClick={() => { setErr(""); setModal({ ...EMPTY }); }}>＋ Add worker</button>
            : isDirector && <span style={{ display: "inline-flex", gap: 8 }}>
                <button onClick={() => { setErr(""); setRoleModal(true); }}>⚙ Manage roles</button>
                <button className="primary" onClick={() => { setErr(""); setSmodal({ ...S_EMPTY }); }}>＋ Add staff</button>
              </span>}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button className={tab === "workers" ? "primary" : ""} onClick={() => setTab("workers")}>Workers (labour)</button>
          <button className={tab === "staff" ? "primary" : ""} onClick={() => setTab("staff")}>Staff (login users)</button>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — sample worker master shown.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {tab === "workers" && incompleteCount > 0 && (
          <div className="demo-banner">
            {incompleteCount} profile{incompleteCount > 1 ? "s" : ""} incomplete (Aadhaar or bank pending).
          </div>
        )}
        {tab === "workers" && (
          <div className="panel">
            {!rows ? <div className="muted">Loading…</div> :
              <DataTable columns={columns} rows={rows} exportName="workers" />}
          </div>
        )}
        {tab === "staff" && (
          <div className="panel">
            <div className="muted" style={{ marginBottom: 10, fontSize: 12.5 }}>Staff sign in with mobile + password (created on first login). Module permissions per site are managed in <b>Admin → Access Rights</b>.</div>
            {!staff ? <div className="muted">Loading…</div> : (
              <table>
                <thead><tr><th>Name</th><th>Mobile (login)</th><th>Role</th><th></th></tr></thead>
                <tbody>
                  {staff.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                      <td className="muted">{u.mobile}</td>
                      <td>{roleLabel(u.role)}</td>
                      <td style={{ textAlign: "right" }}>{isDirector && <button style={{ fontSize: 11.5 }} onClick={async () => { setErr(""); const us = await getUserSites(u.id); const ids = us.map(x => Number(x.id)); setSmodal({ id: u.id, full_name: u.full_name, mobile: u.mobile, role: u.role, is_active: true, siteIds: ids, origSiteIds: [...ids] }); }}>✎ Edit</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!isDirector && <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Only the Director can add or edit staff.</div>}
          </div>
        )}

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
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>KYC & bank <span className="muted" style={{ fontWeight: 400 }}>(all three needed for "Complete" profile)</span></div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1.4 }}><label className="muted">Bank account no</label><input style={{ width: "100%" }} inputMode="numeric" value={modal.bank_account_no || ""} onChange={e => set("bank_account_no", e.target.value)} /></div>
                    <div style={{ flex: 1 }}><label className="muted">IFSC</label><input style={{ width: "100%" }} value={modal.bank_ifsc || ""} onChange={e => set("bank_ifsc", e.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" /></div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label className="muted">Aadhaar copy {modal.aadhaar_doc_url && <a href={modal.aadhaar_doc_url} target="_blank" rel="noreferrer" style={{ color: "var(--copper)" }}>· view current ✓</a>}</label>
                    <input type="file" accept="image/*,.pdf" onChange={async e => {
                      const f = e.target.files?.[0]; if (!f) return;
                      setBusy(true); setErr("");
                      const r = await uploadAadhaarDoc(modal.mobile || modal.id || "w", f);
                      setBusy(false);
                      if (!r.ok) { setErr(r.error); return; }
                      set("aadhaar_doc_url", r.url);
                    }} />
                  </div>
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
        {smodal && (
          <div onClick={() => setSmodal(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 440, width: "100%", padding: 22 }}>
              <h2 style={{ marginBottom: 12 }}>{smodal.id ? "Edit staff member" : "Add staff member"}</h2>
              <div style={{ display: "grid", gap: 10 }}>
                <div><label className="muted">Full name *</label><input style={{ width: "100%" }} value={smodal.full_name} onChange={e => sset("full_name", e.target.value)} /></div>
                <div><label className="muted">Mobile (login) *</label><input style={{ width: "100%" }} inputMode="numeric" value={smodal.mobile} onChange={e => sset("mobile", e.target.value)} />
                  {smodal.id && <div className="muted" style={{ fontSize: 11 }}>⚠ Changing the mobile changes their login number — their password stays the same.</div>}</div>
                <div><label className="muted">Role</label>
                  <select style={{ width: "100%" }} value={smodal.role} onChange={e => sset("role", e.target.value)}>
                    {roles.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select></div>
                {!smodal.id && (
                  <div><label className="muted">First site (rights can be refined in Access Rights)</label>
                    <select style={{ width: "100%" }} value={smodal.site_id || ""} onChange={e => sset("site_id", e.target.value)}>
                      <option value="">— none —</option>
                      {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></div>
                )}
                {smodal.id && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Sites assigned <span className="muted" style={{ fontWeight: 400 }}>(tick all that apply — multi-site staff see a site switcher on mobile)</span></div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {sites.map(st => (
                        <label key={st.id} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                          <input type="checkbox" style={{ accentColor: "var(--copper)" }}
                            checked={(smodal.siteIds || []).includes(Number(st.id))}
                            onChange={e => sset("siteIds", e.target.checked
                              ? [ ...(smodal.siteIds || []), Number(st.id) ]
                              : (smodal.siteIds || []).filter(x => x !== Number(st.id)))} />
                          {st.name}
                        </label>
                      ))}
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>New sites get the role's default rights — fine-tune per site in Admin → Access Rights.</div>
                  </div>
                )}
                {smodal.id && (
                  <label style={{ display: "inline-flex", gap: 7, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={smodal.is_active !== false} onChange={e => sset("is_active", e.target.checked)} style={{ accentColor: "var(--copper)" }} />
                    Active (untick to deactivate — they can no longer sign in)
                  </label>
                )}
                {smodal.id && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <button style={{ color: "var(--red)", fontSize: 12.5 }} disabled={busy} onClick={doResetPassword}>🔑 Reset password</button>
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Use if the password is forgotten or suspected leaked. They create a new one on next login.</div>
                  </div>
                )}
              </div>
              {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="primary" disabled={busy} onClick={saveStaff}>{busy ? "Saving…" : smodal.id ? "Save changes" : "Add staff"}</button>
                <button onClick={() => setSmodal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {roleModal && (
          <div onClick={() => setRoleModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 420, width: "100%", padding: 22 }}>
              <h2 style={{ marginBottom: 4 }}>Role master</h2>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Roles are labels for staff. A new role starts with <b>no rights</b> — after assigning it, open Admin → Access Rights and tick what that person can do per site.</div>
              <div style={{ marginBottom: 12 }}>
                {roles.map(r => <div key={r.code} style={{ padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13.5 }}>{r.label} <span className="muted" style={{ fontSize: 11 }}>({r.code})</span></div>)}
              </div>
              <label className="muted">New role name</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ flex: 1 }} value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="e.g. Billing Engineer" />
                <button className="primary" disabled={busy || !newRole.trim()} onClick={saveNewRole}>{busy ? "Adding…" : "＋ Add role"}</button>
              </div>
              {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
              <div style={{ marginTop: 14 }}><button onClick={() => setRoleModal(false)}>Close</button></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
