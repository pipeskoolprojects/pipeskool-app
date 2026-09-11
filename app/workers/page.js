"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { getWorkerCategories, addWorkerCategory } from "@/lib/data";
import { getWorkers, saveWorker, uploadAadhaarDoc, inr, deleteWorker, deleteStaff, getWorkerAllotments, setWorkerAllotments } from "@/lib/data";
import { getContractors, getSitesList } from "@/lib/mobile";
import { getStaff, addStaff, updateStaff, getRoles, addRole, renameRole, deleteRole, resetStaffPassword, getUserSites, assignSite, removeSite } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { isDemo, supabase } from "@/lib/supabase";

const ADD_NEW = "__add_new__";
// update336: the worker form's layout. Kept as one stylesheet rather than inline styles so
// the two-column grid can collapse to one column on a phone, which inline styles cannot do.
const WORKER_FORM_CSS = `
.wf-modal { background:#fff; border-radius:14px; width:100%; max-width:820px; max-height:92vh;
            display:flex; flex-direction:column; overflow:hidden; }
.wf-head { padding:18px 24px 14px; border-bottom:1px solid var(--border); flex:0 0 auto; }
.wf-body { padding:18px 24px; overflow-y:auto; overflow-x:hidden; flex:1 1 auto; }
.wf-foot { padding:14px 24px; border-top:1px solid var(--border); flex:0 0 auto;
           display:flex; gap:8px; align-items:center; flex-wrap:wrap; background:#fafbfc; }
.wf-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px 18px; align-items:start; }
.wf-grid > .wf-full, .wf-full { grid-column:1 / -1; }
.wf-body label.muted { display:block; font-size:11.5px; margin-bottom:3px; }
.wf-body input, .wf-body select, .wf-body textarea { width:100%; box-sizing:border-box; }
.wf-body textarea { font-family:inherit; font-size:13px; resize:vertical; }
.wf-sub { font-weight:700; font-size:12.5px; color:#1f2a4b; border-top:1px solid var(--border);
          padding-top:12px; margin-top:4px; }
.wf-check { display:flex; align-items:flex-end; padding-bottom:6px; }
.wf-allot { display:flex; flex-wrap:wrap; gap:5px 14px; margin-top:4px;
            max-height:150px; overflow-y:auto; padding:6px 8px;
            border:1px solid var(--border); border-radius:6px; background:#fafbfc; }
@media (max-width: 700px) {
  .wf-modal { max-height:96vh; }
  .wf-grid { grid-template-columns:1fr; gap:10px; }
  .wf-head, .wf-body, .wf-foot { padding-left:16px; padding-right:16px; }
  .wf-foot button { flex:1 1 auto; }
}
`;

const EMPTY = { full_name: "", mobile: "", category: "plumber", labour_type: "own", contractor_id: "", site_id: "", daily_wage: "", is_active: true, ot_eligible: true, proxy_authority: false, bank_name: "", emergency_name: "", emergency_relation: "", emergency_mobile: "", emergency_alt_mobile: "", emergency_address: "" };   // update287 · update336
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
  const [modal, setModal] = useState(null);
  const [cats, setCats] = useState([]);
  useEffect(() => { getWorkerCategories().then(setCats); }, []);
  async function pickCategory(v) {
    if (v !== ADD_NEW) { set("category", v); return; }
    const name = window.prompt("New category name (e.g. Carpenter):");
    if (!name) return;
    const res = await addWorkerCategory(name);
    if (!res.ok) { window.alert("Could not add category: " + res.error + "\n(Needs the \"Manage worker categories\" admin right \u2014 Access Rights \u2192 Admin capabilities.)"); return; }
    const list = await getWorkerCategories(); setCats(list);
    set("category", res.code);
  }     // { id?, ...form }  null = closed
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  const sess = typeof window !== "undefined" ? getSession() : null;
  const isDirector = sess?.role === "director";
  // update178: "Manage staff" capability extends staff add/edit beyond Directors
  const [staffAdmin, setStaffAdmin] = useState(sess?.role === "director");
  useEffect(() => {
    if (!sess?.id || sess.role === "director") return;
    supabase.from("admin_rights").select("capability").eq("user_id", sess.id)
      .then(({ data }) => { if ((data || []).some(r => r.capability === "manage_staff")) setStaffAdmin(true); });
  }, [sess?.id]);
  const load = () => { getWorkers().then(setRows); getStaff().then(setStaff); getRoles().then(setRoles); };
  const roleLabel = r => (roles.find(x => x.code === r) || { label: r }).label;
  useEffect(() => { load(); getSitesList().then(setSites); getContractors().then(setContractors); }, []);

  const incompleteCount = (rows || []).filter(r => !r.complete).length;
  const set = (k, v) => setModal(m => ({ ...m, [k]: v }));
  const [allot, setAllot] = useState([]);   // update168: extra sites the worker can punch at
  useEffect(() => {
    if (modal?.id) getWorkerAllotments(modal.id).then(setAllot); else setAllot([]);
  }, [modal?.id]);

  async function save() {
    // update336: emergency contact is REQUIRED for a new worker — that is the moment the
    // details are actually to hand. For the 81 workers already on file it is a warning, not
    // a block: refusing to save would mean nobody could fix a wage until they had tracked
    // down a next-of-kin. Say the word and I will make it mandatory for everyone.
    if (!modal.id) {
      const miss = [
        !String(modal.emergency_name || "").trim() && "contact name",
        !String(modal.emergency_relation || "").trim() && "relationship",
        !String(modal.emergency_mobile || "").trim() && "mobile number",
      ].filter(Boolean);
      if (miss.length) { setErr("Emergency contact needs a " + miss.join(", ") + "."); return; }
    }
    setBusy(true); setErr("");
    const res = await saveWorker(modal.id || null, modal);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    if (modal.id) {
      const ra = await setWorkerAllotments(modal.id, allot.filter(x => String(x) !== String(modal.site_id)));
      if (!ra.ok) { setErr("Worker saved, but site allotment failed: " + ra.error); return; }
    }
    setMsg(modal.id ? "Worker updated." : "Worker added — they can log in with their mobile and punch. To allot extra sites, open ✎ Edit.");
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

  // update360: staff rows + columns, mirroring the Workers tab
  const staffRows = (staff || []).map(u => ({
    id: u.id,
    name: u.full_name,
    mobile: u.mobile,
    role: roleLabel(u.role),
    bank: u.bank_name || "—",
    kyc: u.bank_account_no && u.bank_ifsc ? "Complete" : (Number(u.monthly_salary) > 0 ? "Pending" : "Not on payroll"),
    status: u.last_working_day ? "Left" : "Active",
    raw: u,
  }));

  const staffColumns = [
    { key: "name", label: "Name", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: "mobile", label: "Mobile (login)", filter: "search", render: r => <span className="muted">{r.mobile}</span> },
    { key: "role", label: "Role", filter: "select" },
    { key: "bank", label: "Bank", filter: "select" },
    { key: "kyc", label: "Bank details", filter: "select",
      render: r => r.kyc === "Complete" ? <span className="badge p">✓</span>
                 : r.kyc === "Pending" ? <span className="badge warn">Pending</span>
                 : <span className="muted">—</span> },
    { key: "status", label: "Status", filter: "select",
      render: r => r.status === "Left" ? <span className="badge warn">Left</span> : <span className="badge p">Active</span> },
    { key: "_pdf", label: "", exportValue: () => "",
      render: r => <button style={{ fontSize: 11.5 }} onClick={() => window.open("/workers/profile?staff=1&id=" + r.id, "_blank")}>⬇ PDF</button> },
    { key: "_edit", label: "", exportValue: () => "",
      render: r => staffAdmin ? <button style={{ fontSize: 11.5 }} onClick={async () => {
        setErr(""); const us = await getUserSites(r.id); const ids = us.map(x => Number(x.id));
        const u = r.raw;
        setSmodal({ id: u.id, full_name: u.full_name, mobile: u.mobile, role: u.role, is_active: true,
          monthly_salary: u.monthly_salary || "", ot_eligible: !!u.ot_eligible,
          annual_paid_leaves: u.annual_paid_leaves || "", joining_date: u.joining_date || "",
          requires_punch: u.requires_punch !== false, bank_account_no: u.bank_account_no || "",
          bank_ifsc: u.bank_ifsc || "", bank_name: u.bank_name || "", pan_no: u.pan_no || "",
          last_working_day: u.last_working_day || "", exit_reason: u.exit_reason || "",
          siteIds: ids, origSiteIds: [...ids] });
      }}>✎ Edit</button> : null },
  ];

  const columns = [
    { key: "name", label: "Worker", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.name}{r.raw?.proxy_authority && <span title="Proxy Attendance Authority — can mark others present" style={{ marginLeft: 5 }}>🛡</span>}</span> },   // update288
    { key: "mobile", label: "Mobile", filter: "search", render: r => <span className="muted">{r.mobile}</span> },
    { key: "category", label: "Category", filter: "select" },
    { key: "type", label: "Labour type", filter: "select",
      render: r => r.type === "Own" ? <span className="badge gray">Own</span> : <span className="badge info">{r.contractor}</span> },
    { key: "site", label: "Site", filter: "select" },
    { key: "bank", label: "Bank", filter: "select" },   // update359: filter workers by bank
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
            : staffAdmin && <span style={{ display: "inline-flex", gap: 8 }}>
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
            {/* update360: the staff list was a plain table with no filters and no export.
                It is now a DataTable, exactly like the Workers tab — so search, the Role
                and Bank filters and Export Excel all behave the same way, and crucially the
                export writes WHAT IS ON SCREEN rather than everyone. */}
            {!staff ? <div className="muted">Loading…</div> : (
              <DataTable columns={staffColumns} rows={staffRows} exportName="staff" />
            )}
            {!staffAdmin && <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Only Directors — or staff granted "Manage staff" in Admin capabilities — can add or edit staff.</div>}
          </div>
        )}

        {modal && (
          <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            {/* update336: the old shell was 460px wide with a four-item flex row inside it —
                Category collapsed to a 40px sliver and the whole dialog scrolled sideways.
                Now: a comfortable fixed width, a two-column grid, a sticky header and a
                sticky footer, and ONLY the middle scrolls, so Save is never out of reach. */}
            <div onClick={e => e.stopPropagation()} className="wf-modal">
              <style>{WORKER_FORM_CSS}</style>
              <div className="wf-head"><h2 style={{ margin: 0 }}>{modal.id ? "Edit worker" : "Add worker"}</h2></div>
              <div className="wf-body">
              <div className="wf-grid">
                <div><label className="muted">Full name *</label><input value={modal.full_name} onChange={e => set("full_name", e.target.value)} /></div>
                <div><label className="muted">Mobile *</label><input inputMode="numeric" value={modal.mobile} onChange={e => set("mobile", e.target.value)} /></div>
                <div className="wf-full wf-sub">Work details</div>
                <div className="wf-grid wf-full">
                  <div><label className="muted">Category</label>
                    <select style={{ width: "100%" }} value={modal.category} onChange={e => pickCategory(e.target.value)}>
                      {cats.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                      {!cats.some(c => c.code === modal.category) && modal.category ? <option value={modal.category}>{modal.category}</option> : null}
                      <option value={ADD_NEW}>➕ Add new category…</option>
                    </select></div>
                  <div><label className="muted">Daily wage ₹ *</label><input inputMode="numeric" value={modal.daily_wage} onChange={e => set("daily_wage", e.target.value)} /></div>
                  <div className="wf-check">
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }} title="OFF = extra hours are never paid as OT; the + OT button disappears everywhere for this worker.">
                      <input type="checkbox" checked={modal.ot_eligible !== false} onChange={e => set("ot_eligible", e.target.checked)} style={{ accentColor: "var(--copper)" }} /> OT eligible
                    </label>
                  </div>
                  <div className="wf-check">{/* update287 */}
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}
                      title="Grants this worker the right to Mark present for OTHERS at their site(s), with the same mandatory live photo. Revoke any time by unticking — effective immediately. Needs a login linked to this worker (same mobile).">
                      <input type="checkbox" checked={!!modal.proxy_authority} onChange={e => set("proxy_authority", e.target.checked)} style={{ accentColor: "var(--copper)" }} /> 🛡 Proxy Attendance Authority
                    </label>
                  </div>
                  {/* update329: dates the Labour letters read (Engagement / Experience / Relieving / Termination) */}
                </div>
                <div className="wf-full wf-sub">Joining &amp; exit</div>
                <div className="wf-grid wf-full">
                  <div><label className="muted">Joining date</label>
                    <input type="date" value={modal.joining_date || ""} onChange={e => set("joining_date", e.target.value)} /></div>
                  <div><label className="muted">Last working day</label>
                    <input type="date" value={modal.last_working_day || ""} onChange={e => set("last_working_day", e.target.value)} /></div>
                  <div className="wf-full"><label className="muted">Reason for exit</label>
                    <input placeholder="only for leavers" value={modal.exit_reason || ""} onChange={e => set("exit_reason", e.target.value)} /></div>
                </div>
                <div className="wf-full wf-sub">Posting</div>
                <div className="wf-grid wf-full">
                  <div><label className="muted">Labour type</label>
                    <select style={{ width: "100%" }} value={modal.labour_type} onChange={e => set("labour_type", e.target.value)}>
                      <option value="own">Own</option><option value="contractor">Contractor</option>
                    </select></div>
                  <div><label className="muted">Site *</label>
                    <select value={modal.site_id || ""} onChange={e => set("site_id", e.target.value)}>
                      <option value="">Select…</option>
                      {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    </div>
                    {modal.id ? (<div className="wf-full">
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Also allotted to (multi-site worker — can self-punch there):</div>
                      <div className="wf-allot">
                        {sites.filter(x => String(x.id) !== String(modal.site_id || "")).map(x => (
                          <label key={x.id} style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                            <input type="checkbox" checked={allot.map(String).includes(String(x.id))}
                                   onChange={e => setAllot(a => e.target.checked ? [...a, x.id] : a.filter(v => String(v) !== String(x.id)))} />
                            {x.name}
                          </label>
                        ))}
                      </div>
                    </div>) : null}
                </div>
                <div className="wf-full wf-sub">KYC &amp; bank <span className="muted" style={{ fontWeight: 400 }}>(all three needed for a &quot;Complete&quot; profile)</span></div>
                <div className="wf-grid wf-full">
                  <div><label className="muted">Bank account no</label><input inputMode="numeric" value={modal.bank_account_no || ""} onChange={e => set("bank_account_no", e.target.value)} /></div>
                  <div><label className="muted">IFSC</label><input value={modal.bank_ifsc || ""} onChange={e => set("bank_ifsc", e.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" /></div>
                  {/* update359 */}
                  <div className="wf-full"><label className="muted">Bank name</label>
                    <input value={modal.bank_name || ""} placeholder="e.g. Indian Overseas Bank"
                           onChange={e => set("bank_name", e.target.value)} /></div>
                  <div className="wf-full">
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
                  <div className="wf-full"><label className="muted">Contractor</label>
                    <select value={modal.contractor_id || ""} onChange={e => set("contractor_id", e.target.value)}>
                      <option value="">Select contractor…</option>
                      {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select></div>
                )}

                {/* update336: emergency contact — who to call if something happens on site */}
                <div className="wf-full wf-sub">Emergency contact
                  {modal.id && !String(modal.emergency_mobile || "").trim() &&
                    <span style={{ fontWeight: 600, fontSize: 11, color: "#9a3412", marginLeft: 8 }}>· not on file yet</span>}
                </div>
                <div><label className="muted">Contact name *</label>
                  <input value={modal.emergency_name || ""} onChange={e => set("emergency_name", e.target.value)} /></div>
                <div><label className="muted">Relationship *</label>
                  <input placeholder="e.g. Father, Wife, Brother" value={modal.emergency_relation || ""} onChange={e => set("emergency_relation", e.target.value)} /></div>
                <div><label className="muted">Mobile number *</label>
                  <input inputMode="numeric" value={modal.emergency_mobile || ""} onChange={e => set("emergency_mobile", e.target.value.replace(/[^0-9+ ]/g, ""))} /></div>
                <div><label className="muted">Alternate mobile</label>
                  <input inputMode="numeric" value={modal.emergency_alt_mobile || ""} onChange={e => set("emergency_alt_mobile", e.target.value.replace(/[^0-9+ ]/g, ""))} /></div>
                <div className="wf-full"><label className="muted">Address</label>
                  <textarea rows={2} value={modal.emergency_address || ""} onChange={e => set("emergency_address", e.target.value)} /></div>

                {modal.id && (
                  <label className="wf-full" style={{ display: "inline-flex", gap: 7, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={modal.is_active !== false} onChange={e => set("is_active", e.target.checked)} style={{ accentColor: "var(--copper)" }} />
                    Active (untick to deactivate — they can no longer log in or punch)
                  </label>
                )}
              </div>
              {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
              </div>{/* /wf-body */}
              <div className="wf-foot">
                {modal.id && isDirector && (
                  <button style={{ color: "var(--red)", borderColor: "var(--red)" }} disabled={busy}
                    onClick={async () => {
                      if (!confirm("Delete this worker permanently? Only possible if they have no attendance/wage history.")) return;
                      const r = await deleteWorker(modal.id);
                      if (r.ok) { setModal(null); setMsg("Worker deleted."); }
                      else setErr(r.error);
                    }}>🗑 Delete</button>
                )}
                {modal.id && (
                  <button onClick={() => window.open("/workers/profile?id=" + modal.id, "_blank")}>⬇ Employee PDF</button>
                )}
                <span style={{ flex: 1 }} />
                <button onClick={() => setModal(null)} disabled={busy}>Cancel</button>
                <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : modal.id ? "Save changes" : "Add worker"}</button>
              </div>
            </div>
          </div>
        )}
        {smodal && (
          <div onClick={() => setSmodal(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 460, width: "100%", padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
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
                {smodal.id && (<>
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Salary & leaves</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ width: 130 }}><label className="muted">Monthly salary ₹</label>
                      <input style={{ width: "100%" }} inputMode="numeric" value={smodal.monthly_salary ?? ""} onChange={e => sset("monthly_salary", e.target.value)} /></div>
                    <div style={{ width: 145 }}><label className="muted">Joining date</label>
                      <input type="date" style={{ width: "100%" }} value={smodal.joining_date || ""} onChange={e => sset("joining_date", e.target.value)} /></div>
                    <div style={{ width: 105 }}><label className="muted">Paid leaves / yr</label>
                      <input style={{ width: "100%" }} inputMode="numeric" value={smodal.annual_paid_leaves ?? ""} onChange={e => sset("annual_paid_leaves", e.target.value)} /></div>
                    <label style={{ display: "inline-flex", gap: 7, alignItems: "center", fontSize: 13, cursor: "pointer", paddingBottom: 8 }}>
                      <input type="checkbox" checked={!!smodal.ot_eligible} onChange={e => sset("ot_eligible", e.target.checked)} style={{ accentColor: "var(--copper)" }} />
                      OT eligible
                    </label>
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Salary 0 = not on the Staff Salary sheet · joining date only for staff who joined after 1 April · leaves e.g. 20.</div>
                  {/* update329: exit details — Relieving, Experience and Termination letters read these.
                      Unticking Active does NOT record a date, so without this the letters have nothing to print. */}
                  <div style={{ fontWeight: 700, fontSize: 12.5, margin: "12px 0 6px" }}>Exit details <span className="muted" style={{ fontWeight: 400 }}>(only for leavers — used by Relieving / Experience / Termination letters)</span></div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ width: 145 }}><label className="muted">Last working day</label>
                      <input type="date" style={{ width: "100%" }} value={smodal.last_working_day || ""} onChange={e => sset("last_working_day", e.target.value)} /></div>
                    <div style={{ flex: 1, minWidth: 180 }}><label className="muted">Reason</label>
                      <input style={{ width: "100%" }} placeholder="e.g. Resignation" value={smodal.exit_reason || ""} onChange={e => sset("exit_reason", e.target.value)} /></div>
                  </div>
                  <label style={{ display: "inline-flex", gap: 7, alignItems: "center", fontSize: 13, cursor: "pointer", marginTop: 8 }}>
                    <input type="checkbox" checked={smodal.requires_punch !== false} onChange={e => sset("requires_punch", e.target.checked)} style={{ accentColor: "var(--copper)" }} />
                    Marks attendance (punch) — untick for pure office/billing staff; no worker profile will be created
                  </label>
                </div>
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Bank &amp; KYC <span className="muted" style={{ fontWeight: 400 }}>(goes on the Staff Salary Excel bank sheet)</span></div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: 1.4, minWidth: 150 }}><label className="muted">Bank account no</label>
                      <input style={{ width: "100%" }} inputMode="numeric" value={smodal.bank_account_no || ""} onChange={e => sset("bank_account_no", e.target.value)} /></div>
                    <div style={{ flex: 1, minWidth: 120 }}><label className="muted">IFSC</label>
                      <input style={{ width: "100%" }} value={smodal.bank_ifsc || ""} onChange={e => sset("bank_ifsc", e.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" /></div>
                    {/* update360 */}
                    <div style={{ flex: "1 1 100%" }}><label className="muted">Bank name</label>
                      <input style={{ width: "100%" }} value={smodal.bank_name || ""} placeholder="e.g. State Bank of India"
                             onChange={e => sset("bank_name", e.target.value)} /></div>
                    <div style={{ flex: 1, minWidth: 110 }}><label className="muted">PAN</label>
                      <input style={{ width: "100%" }} value={smodal.pan_no || ""} onChange={e => sset("pan_no", e.target.value.toUpperCase())} placeholder="ABCDE1234F" /></div>
                  </div>
                </div>
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
                </>)}
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
                {smodal.id && isDirector && smodal.id !== sess?.id && (
                  <button style={{ color: "var(--red)", borderColor: "var(--red)" }} disabled={busy}
                    onClick={async () => {
                      if (!confirm("Delete this staff member permanently? Only possible if they have no approvals/records in their name. For leavers with history, untick Active instead.")) return;
                      const r = await deleteStaff(smodal.id);
                      if (r.ok) { setSmodal(null); setMsg("Staff member deleted."); }
                      else setErr(r.error);
                    }}>🗑 Delete</button>
                )}
                <button className="primary" disabled={busy} onClick={saveStaff}>{busy ? "Saving…" : smodal.id ? "Save changes" : "Add staff"}</button>
                {err && <div className="note red" style={{ width: "100%", marginTop: 8 }}>{err}</div>}
                <button onClick={() => setSmodal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {roleModal && (
          <div onClick={() => setRoleModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 420, width: "100%", padding: 22, maxHeight: "85vh", overflowY: "auto" }}>
              <h2 style={{ marginBottom: 4 }}>Role master</h2>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Roles are labels for staff. A new role starts with <b>no rights</b> — after assigning it, open Admin → Access Rights and tick what that person can do per site.</div>
              <div style={{ marginBottom: 12 }}>
                {roles.map(r => (
                  <div key={r.code} style={{ padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ flex: 1 }}>{r.label} <span className="muted" style={{ fontSize: 11 }}>({r.code})</span></span>
                    <button style={{ fontSize: 11 }} title="Rename"
                      onClick={async () => {
                        const nl = prompt("New display name for this role:", r.label);
                        if (nl === null || !nl.trim() || nl.trim() === r.label) return;
                        const x = await renameRole(r.code, nl);
                        if (!x.ok) { setErr(x.error); return; }
                        setErr(""); getRoles().then(setRoles); load();
                      }}>✎</button>
                    {r.code !== "director" && (
                      <button style={{ fontSize: 11, color: "var(--red)" }} title="Delete (only if no staff has it)"
                        onClick={async () => {
                          if (!confirm(`Delete role "${r.label}"? Only possible if no staff member has it.`)) return;
                          const x = await deleteRole(r.code);
                          if (!x.ok) { setErr(x.error); return; }
                          setErr(""); getRoles().then(setRoles);
                        }}>🗑</button>
                    )}
                  </div>
                ))}
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
