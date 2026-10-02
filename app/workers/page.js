"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { getWorkerCategories, addWorkerCategory, workerExitCheck, workerExit, workerRejoin, applyExits, getExitedWorkers, getExitedStaff, staffRejoin } from "@/lib/data";   // update439 · update452
import { getWorkers, saveWorker, uploadAadhaarDoc, uploadBankDoc, uploadAadhaarFiles, inr, deleteWorker, deleteStaff, getWorkerAllotments, setWorkerAllotments } from "@/lib/data";   // update374/377
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

const EMPTY = { full_name: "", mobile: "", category: "plumber", labour_type: "own", contractor_id: "", site_id: "", daily_wage: "", is_active: true, ot_eligible: true, proxy_authority: false, bank_name: "", payment_type: "direct", emergency_name: "", emergency_relation: "", emergency_mobile: "", emergency_alt_mobile: "", emergency_address: "" };   // update287 · update336
// roles load dynamically from the Role Master (staff_roles table)
const S_EMPTY = { full_name: "", mobile: "", role: "supervisor", site_id: "", is_active: true, emergency_name: "", emergency_relation: "", emergency_mobile: "", emergency_alt_mobile: "", emergency_address: "" };   // update384

export default function WorkersPage() {
  const [rows, setRows] = useState(null);
  const [sites, setSites] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [tab, setTab] = useState("workers");    // workers | staff | exited
  const [exitM, setExitM] = useState(null);     // update439: { w, last, designation, type, reason, check }
  const [exited, setExited] = useState(null); const [exq, setExq] = useState("");
  const [exStaff, setExStaff] = useState(null);   // update452: staff who have left
  async function openExit(w) { const check = await workerExitCheck(w.id); setExitM({ w, last: new Date().toISOString().slice(0, 10), designation: w.category || "", type: "resigned", reason: "", check }); }
  async function confirmExit() {
    const { w, last, designation, type, reason } = exitM; if (!last) { window.alert("Last working day is required."); return; }
    if (!window.confirm(`Confirm exit — ${w.full_name} leaves on ${last} (${type.replace("_", " ")}, ${designation}).\n\nLogin & punch are disabled from that day; they are removed from every live list after it; history stays.`)) return;
    const r = await workerExit(w.id, last, designation, type, reason); if (!r.ok) { window.alert(r.error); return; }
    setExitM(null); setModal(null); setMsg(`${w.full_name} marked as exited (${last}).`); load(); getExitedWorkers().then(setExited);
  }
  async function rejoin(r) { const d = window.prompt(`Rejoin ${r.full_name}? New joining date (YYYY-MM-DD):`, new Date().toISOString().slice(0, 10)); if (!d) return; const x = await workerRejoin(r.id, d); if (!x.ok) { window.alert(x.error); return; } setMsg(`${r.full_name} rejoined — back on all active lists.`); load(); getExitedWorkers().then(setExited); }
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
  const load = () => { applyExits().then(() => { getWorkers().then(setRows); getStaff().then(setStaff); getRoles().then(setRoles); }); };   // update439: future-dated exits become effective on load
  const roleLabel = r => (roles.find(x => x.code === r) || { label: r }).label;
  useEffect(() => { load(); getSitesList().then(setSites); getContractors().then(setContractors); }, []);

  const incompleteCount = (rows || []).filter(r => !r.complete).length;
  const set = (k, v) => setModal(m => ({ ...m, [k]: v }));
  const [allot, setAllot] = useState([]);   // update168: extra sites the worker can punch at
  useEffect(() => {
    if (modal?.id) getWorkerAllotments(modal.id).then(setAllot); else setAllot([]);
  }, [modal?.id]);

  // update388b: Contractor Master read straight from the table (id, name + bank columns added by
  // pipeskool_contractor_bank.sql). Fallback ladder: bank columns missing → id,name only →
  // table unreadable → whatever getContractors() returned. Every step leaves a visible note.
  const [cmaster, setCmaster] = useState(null);      // null = not loaded yet
  const [cnote, setCnote] = useState("");
  const [cbank, setCbank] = useState({ bank_account_no: "", bank_ifsc: "", bank_name: "" });
  const [cdirty, setCdirty] = useState(false);
  async function loadContractors() {
    if (isDemo) { setCmaster([]); return; }
    let r = await supabase.from("contractors").select("id, name, bank_account_no, bank_ifsc, bank_name").order("name");
    if (r.error) {
      const r2 = await supabase.from("contractors").select("id, name").order("name");
      if (r2.error) { setCmaster(null); setCnote("Contractor Master could not be read (" + (r2.error.message || r2.error) + ") — using the app's contractor list."); return; }
      setCnote("Contractor bank columns missing — run pipeskool_contractor_bank.sql. Names load, bank details cannot be saved yet.");
      r = r2;
    } else setCnote("");
    setCmaster(r.data || []);
  }
  useEffect(() => { loadContractors(); }, []);
  const clist = cmaster ?? contractors;                // rows always carry id + name
  const csel = clist.find(c => String(c.id) === String(modal?.contractor_id || "")) || null;
  useEffect(() => {                                    // selecting a contractor pre-fills his bank details
    setCbank({ bank_account_no: csel?.bank_account_no || "", bank_ifsc: csel?.bank_ifsc || "", bank_name: csel?.bank_name || "" });
    setCdirty(false);
  }, [modal?.contractor_id, cmaster]);
  const cset = (k, v) => { setCbank(b => ({ ...b, [k]: v })); setCdirty(true); };
  async function addContractor() {
    const name = window.prompt("New contractor name:");
    if (!name || !name.trim()) return;
    setErr("");
    const { data, error } = await supabase.from("contractors").insert({ name: name.trim() }).select("id, name").single();
    if (error) { setErr("Could not add contractor: " + (error.message || error)); return; }
    await loadContractors();
    set("contractor_id", data.id);
  }

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
    // update388b: contractor bank details live on the CONTRACTOR row (one place for every worker under him)
    if (modal.labour_type === "contractor" && modal.contractor_id && cdirty) {
      const { error: ce } = await supabase.from("contractors")
        .update({ bank_account_no: String(cbank.bank_account_no || "").trim() || null,
                  bank_ifsc: String(cbank.bank_ifsc || "").trim().toUpperCase() || null,
                  bank_name: String(cbank.bank_name || "").trim() || null })
        .eq("id", modal.contractor_id);
      if (ce) { setBusy(false); setErr("Contractor bank details did NOT save: " + (ce.message || ce) + " — has pipeskool_contractor_bank.sql been run?"); return; }
    }
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
          pf_no: u.pf_no || "", pf_uan: u.pf_uan || "", esi_no: u.esi_no || "", department: u.department || "",   // update450
          preferred_lang: u.preferred_lang || "",   // update453
          bank_ifsc: u.bank_ifsc || "", bank_name: u.bank_name || "", pan_no: u.pan_no || "", aadhaar_doc_url: u.aadhaar_doc_url || null, aadhaar_docs: Array.isArray(u.aadhaar_docs) ? u.aadhaar_docs : [], bank_doc_url: u.bank_doc_url || null,   // update374/377
          last_working_day: u.last_working_day || "", exit_reason: u.exit_reason || "",
          emergency_name: u.emergency_name || "", emergency_relation: u.emergency_relation || "",   // update384
          emergency_mobile: u.emergency_mobile || "", emergency_alt_mobile: u.emergency_alt_mobile || "",
          emergency_address: u.emergency_address || "",
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
    { key: "payType", label: "Paid via", filter: "select",   // update361
      render: r => r.payType === "Contractor" ? <span className="badge info">Contractor</span>
                 : r.payType === "Union" ? <span className="badge warn">Union</span>
                 : <span className="badge gray">Direct</span> },
    { key: "wage", label: "Daily wage", type: "num", render: r => inr(r.wage), exportValue: r => r.wage },
    { key: "complete", label: "Profile", filter: "select",
      optionLabel: o => o ? "Complete" : "Incomplete",
      render: r => r.complete ? <span className="badge p">Complete</span> : <span className="badge warn">Incomplete</span>,
      exportValue: r => r.complete ? "Complete" : "Incomplete" },
    { key: "_edit", label: "", render: r => <button style={{ fontSize: 11.5 }} onClick={() => { setErr(""); setModal({ id: r.id, ...r.raw }); }}>✎ Edit</button>, exportValue: () => "" },
    { key: "_exit", label: "", exportValue: () => "", render: r => ["director", "hr", "it_executive"].includes(sess?.role) ? <button style={{ fontSize: 11.5, color: "var(--red,#c0392b)" }} title="Mark as exited (left company)" onClick={() => openExit({ id: r.id, ...(r.raw || r) })}>🚪</button> : null },   // update439
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
          <button className={tab === "exited" ? "primary" : ""} onClick={() => { setTab("exited"); getExitedWorkers().then(setExited); getExitedStaff().then(setExStaff); }}>Exited{exited ? " · " + (exited.length + (exStaff || []).length) : ""}</button>
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
        {tab === "exited" && (   /* update439 */
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <input placeholder="🔍 Search name / site…" value={exq} onChange={e => setExq(e.target.value)} style={{ width: 220 }} />
              <span className="muted" style={{ fontSize: 12 }}>People who have left. History up to the last working day is kept everywhere; from the next day they are on no live list.</span>
            </div>
            {!exited ? <div className="muted">Loading…</div> : (
              <DataTable columns={[
                { key: "full_name", label: "Name", render: r => <span><b>{r.full_name}</b><div className="muted" style={{ fontSize: 11 }}>{r.mobile} · {r.labour_type === "contractor" ? (r.contractor_name || "contractor") : "Own"}</div></span> },
                { key: "exit_designation", label: "Designation at exit", filter: "select" }, { key: "site_name", label: "Site", filter: "select" },
                { key: "joining_date", label: "Joining date" }, { key: "last_working_day", label: "Last working day" },
                { key: "exit_type", label: "Exit type", filter: "select", render: r => <span style={{ background: "#FEE2E2", color: "#B91C1C", fontSize: 11, padding: "2px 8px", borderRadius: 999, textTransform: "capitalize" }}>{String(r.exit_type || "").replace("_", " ")}</span> },
                { key: "exit_reason", label: "Reason" }, { key: "marked_by", label: "Marked by", render: r => <span>{r.marked_by}<div className="muted" style={{ fontSize: 11 }}>{r.exited_at}</div></span> },
                { key: "act", label: "", render: r => <button style={{ fontSize: 11.5 }} onClick={() => rejoin(r)}>↩ Rejoin</button> },
              ]} rows={(exited || []).filter(r => !exq || `${r.full_name} ${r.site_name} ${r.exit_designation}`.toLowerCase().includes(exq.toLowerCase()))} exportName="exited_employees" />)}
            {/* update452: staff (login users) who have left — login off, punch profile closed, off every live list */}
            <div style={{ fontWeight: 700, margin: "16px 0 6px" }}>Staff (login users) who have left{exStaff ? " · " + exStaff.length : ""}</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Their login is blocked and their punch profile is closed from the day after the last working day. History up to that day is untouched.</div>
            {!exStaff ? <div className="muted">Loading…</div> : exStaff.length === 0 ? <div className="muted">None.</div> : (
              <DataTable columns={[
                { key: "full_name", label: "Name", render: r => <span><b>{r.full_name}</b><div className="muted" style={{ fontSize: 11 }}>{r.mobile}</div></span> },
                { key: "role", label: "Role", filter: "select", render: r => String(r.role || "").replace(/_/g, " ") },
                { key: "joining_date", label: "Joining date" }, { key: "last_working_day", label: "Last working day" },
                { key: "exit_reason", label: "Reason" }, { key: "exited_at", label: "Applied on" },
                { key: "act", label: "", render: r => ["director", "hr", "it_executive"].includes(sess?.role) ? <button style={{ fontSize: 11.5 }} onClick={async () => { if (!window.confirm(`Rejoin ${r.full_name}? Login and punch profile are re-activated; set a new joining date in Edit staff afterwards.`)) return; const x = await staffRejoin(r.id); if (!x.ok) { window.alert(x.error); return; } setMsg(`${r.full_name} rejoined.`); load(); getExitedStaff().then(setExStaff); }}>↩ Rejoin</button> : null },
              ]} rows={(exStaff || []).filter(r => !exq || `${r.full_name} ${r.role}`.toLowerCase().includes(exq.toLowerCase()))} exportName="exited_staff" pageSize={10} />)}
          </div>)}
        {exitM && (
          <div onClick={() => setExitM(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="card" onClick={e => e.stopPropagation()} style={{ width: "min(94vw, 640px)", padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border,#e3e3de)", fontSize: 18, fontWeight: 700 }}>Mark as exited — {exitM.w.full_name}</div>
              <div style={{ padding: "14px 20px" }}>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{exitM.w.category || "—"} · {exitM.w.labour_type === "contractor" ? "Contractor" : "Own"} · {exitM.w.site || ""}{exitM.w.joining_date ? " · joined " + exitM.w.joining_date : ""} · mobile {exitM.w.mobile}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ fontSize: 12 }}>Last working day *<input type="date" value={exitM.last} onChange={e => setExitM(x => ({ ...x, last: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 4 }} /></label>
                  <label style={{ fontSize: 12 }}>Designation at exit *<input list="exit-desig" value={exitM.designation} onChange={e => setExitM(x => ({ ...x, designation: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 4 }} /><datalist id="exit-desig">{(cats || []).map(ct => <option key={ct.name || ct} value={ct.name || ct} />)}</datalist></label>
                  <label style={{ fontSize: 12 }}>Exit type *<select value={exitM.type} onChange={e => setExitM(x => ({ ...x, type: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 4 }}><option value="resigned">Resigned</option><option value="terminated">Terminated</option><option value="absconded">Absconded</option><option value="contract_ended">Contract ended</option><option value="other">Other</option></select></label>
                  <div style={{ fontSize: 12 }}>Marked by<div className="muted" style={{ marginTop: 6 }}>{sess?.full_name || sess?.name || "you"} · {new Date().toLocaleString("en-IN")} (auto)</div></div>
                </div>
                <label style={{ fontSize: 12, display: "block", marginTop: 10 }}>Reason / remarks<textarea rows={2} value={exitM.reason} onChange={e => setExitM(x => ({ ...x, reason: e.target.value }))} placeholder="e.g. Left for a job in Surat; handed over tools" style={{ display: "block", width: "100%", marginTop: 4 }} /></label>
                {exitM.check && exitM.check.ok !== false && (
                  <div style={{ background: "#FFF4E5", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 12px", marginTop: 12, fontSize: 12.5, color: "#92400E" }}>
                    <b>⚠ Settlement check before you confirm</b><br />
                    • Advance outstanding: <b>₹{Number(exitM.check.advance_outstanding || 0).toLocaleString("en-IN")}</b> ({exitM.check.advance_count || 0} request{exitM.check.advance_count === 1 ? "" : "s"}) &nbsp;• Unpaid days this month: <b>{exitM.check.unpaid_days_this_month || 0}</b> (≈ ₹{Number(exitM.check.unpaid_estimate || 0).toLocaleString("en-IN")}) &nbsp;• Contractor balance: <b>{exitM.check.contractor_balance ? "₹" + Number(exitM.check.contractor_balance).toLocaleString("en-IN") : "—"}</b>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>You can still proceed — these stay in Muster & Wages for final settlement.{exitM.check.note ? " " + exitM.check.note : ""}</div>
                  </div>)}
                <div style={{ fontSize: 12, color: "#444", lineHeight: 1.6, marginTop: 10 }}>On saving: login &amp; punch disabled · removed from Attendance, Not-punched, auto-absent, muster/wages after {exitM.last || "the last working day"}, all pickers and counts · history up to that day kept intact · profile-completeness checks skipped for exits.</div>
              </div>
              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border,#e3e3de)", background: "#FAFAF9", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setExitM(null)}>Cancel</button>
                <button style={{ color: "#B91C1C", borderColor: "#FECACA" }} onClick={confirmExit}>Confirm exit — {exitM.w.full_name} leaves on {exitM.last || "…"}</button>
              </div>
            </div>
          </div>)}

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
                    {modal.labour_type === "contractor" && (<div className="wf-full" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", marginTop: 4 }}>
                      {/* update388b: contractor block — only for Contractor labour. Name from the Contractor
                          Master; bank details are the contractor's (the company pays him, not the worker). */}
                      <div className="wf-grid">
                        <div className="wf-full"><label className="muted">Contractor name</label>
                          <div style={{ display: "flex", gap: 6 }}>
                            <select style={{ flex: 1 }} value={modal.contractor_id || ""} onChange={e => set("contractor_id", e.target.value)}>
                              <option value="">Select contractor…</option>
                              {clist.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button type="button" onClick={addContractor} disabled={busy} title="Add a contractor to the master">＋ Add</button>
                          </div>
                          {clist.length === 0 && <div style={{ fontSize: 11.5, color: "#9a3412", marginTop: 3 }}>No contractors in the master (or none visible to your login) — use ＋ Add.</div>}
                          {cnote && <div style={{ fontSize: 11.5, color: "#9a3412", marginTop: 3 }}>{cnote}</div>}
                        </div>
                        <div className="wf-full muted" style={{ fontSize: 11.5 }}>Contractor bank details — used for this worker's payment in the Bank Payment Sheet. Saved on the contractor, so every worker under him shares them.</div>
                        <div><label className="muted">Bank account no</label>
                          <input value={cbank.bank_account_no} inputMode="numeric" autoComplete="off" disabled={!modal.contractor_id}
                                 placeholder={modal.contractor_id ? "" : "select a contractor first"} onChange={e => cset("bank_account_no", e.target.value)} /></div>
                        <div><label className="muted">IFSC</label>
                          <input value={cbank.bank_ifsc} placeholder="e.g. SBIN0001234" disabled={!modal.contractor_id}
                                 onChange={e => cset("bank_ifsc", e.target.value)} /></div>
                        <div className="wf-full"><label className="muted">Bank name</label>
                          <input value={cbank.bank_name} placeholder="e.g. Indian Overseas Bank" disabled={!modal.contractor_id}
                                 onChange={e => cset("bank_name", e.target.value)} /></div>
                      </div>
                    </div>)}
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
                  {/* update361: which sheet of the bank payment file this person lands in.
                      Contractor labour is set automatically from Labour type — they are paid
                      through the contractor, not individually. */}
                  <div className="wf-full"><label className="muted">Paid via</label>
                    {modal.labour_type === "contractor"
                      ? <div className="muted" style={{ fontSize: 12, padding: "6px 0" }}>
                          <b>Contractor</b> — set automatically because Labour type is Contractor. Their wage is paid to the contractor, not to them.
                        </div>
                      : <select value={modal.payment_type || "direct"} onChange={e => set("payment_type", e.target.value)}>
                          <option value="direct">Direct — paid to their own bank account</option>
                          <option value="union">Union — routed through the union</option>
                        </select>}
                  </div>
                  <div className="wf-full"><label className="muted">Bank name</label>
                    <input value={modal.bank_name || ""} placeholder="e.g. Indian Overseas Bank"
                           onChange={e => set("bank_name", e.target.value)} /></div>
                  {/* update377: ONE field, "Aadhaar Documents", multi-file. Any one is enough. */}
                  <div className="wf-full">
                    <label className="muted">Aadhaar Documents
                      {(modal.aadhaar_docs?.length || (!modal.aadhaar_docs?.length && modal.aadhaar_doc_url)) ? (
                        <span style={{ marginLeft: 8, fontSize: 11.5 }}>
                          {(modal.aadhaar_docs || (modal.aadhaar_doc_url ? [modal.aadhaar_doc_url] : [])).map((u, i) => (
                            <span key={u + i}>
                              <a href={u} target="_blank" rel="noreferrer" style={{ color: "var(--copper)" }}>file {i + 1}</a>
                              <button type="button" onClick={() => set("aadhaar_docs", (modal.aadhaar_docs || []).filter((_, j) => j !== i))}
                                      style={{ marginLeft: 4, marginRight: 10, fontSize: 10, color: "var(--red)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </label>
                    <input type="file" accept="image/*,application/pdf,.pdf" multiple onChange={async e => {
                      const files = e.target.files; if (!files?.length) return;
                      setBusy(true); setErr("");
                      const r = await uploadAadhaarFiles(modal.mobile || modal.id || "w", files);
                      setBusy(false);
                      if (!r.ok) { setErr(r.error); return; }
                      if (r.partial) setErr("Some files failed: " + r.partial.join("; "));
                      set("aadhaar_docs", [...(modal.aadhaar_docs || []), ...r.urls]);
                      e.target.value = "";
                    }} />
                    <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Pick front, back and/or the PDF together — any one is enough. Add more later by picking again.</div>
                  </div>
                  {/* update374 — same shape as the Aadhaar upload directly above */}
                  <div className="wf-full">
                    <label className="muted">Bank passbook / cancelled cheque {modal.bank_doc_url && <a href={modal.bank_doc_url} target="_blank" rel="noreferrer" style={{ color: "var(--copper)" }}>· view current ✓</a>}</label>
                    <input type="file" accept="image/*,.pdf" onChange={async e => {
                      const f = e.target.files?.[0]; if (!f) return;
                      setBusy(true); setErr("");
                      const r = await uploadBankDoc(modal.mobile || modal.id || "w", f);
                      setBusy(false);
                      if (!r.ok) { setErr(r.error); return; }
                      set("bank_doc_url", r.url);
                    }} />
                  </div>
                </div>
                {/* update388b: Contractor dropdown moved up under Labour type */}

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
                    <input type="checkbox" checked={modal.is_active !== false} onChange={e => { if (!e.target.checked && window.confirm(`Is ${modal.full_name} leaving the company?\n\nOK = open the exit form (records last working day, designation, reason)\nCancel = just deactivate`)) { openExit(modal); return; } set("is_active", e.target.checked); }} style={{ accentColor: "var(--copper)" }} />
                    Active (untick to deactivate — they can no longer log in or punch)
                  </label>
                )}
                {modal.id && <button type="button" className="wf-full" style={{ marginTop: 6, color: "var(--red,#c0392b)", fontSize: 12.5 }} onClick={() => openExit(modal)}>🚪 Mark as exited (left company)</button>}
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
                    {/* update450: statutory details — printed on salary slips (Format A) */}
                    <div style={{ flex: "1 1 100%", fontWeight: 700, fontSize: 12.5, marginTop: 6 }}>Statutory details <span className="muted" style={{ fontWeight: 400 }}>(printed on salary slips)</span></div>
                    <div style={{ flex: 1, minWidth: 110 }}><label className="muted">PF No</label>
                      <input style={{ width: "100%" }} value={smodal.pf_no || ""} onChange={e => sset("pf_no", e.target.value)} /></div>
                    <div style={{ flex: 1, minWidth: 130 }}><label className="muted">PF UAN</label>
                      <input style={{ width: "100%" }} inputMode="numeric" value={smodal.pf_uan || ""} onChange={e => sset("pf_uan", e.target.value)} /></div>
                    <div style={{ flex: 1, minWidth: 110 }}><label className="muted">ESI No</label>
                      <input style={{ width: "100%" }} value={smodal.esi_no || ""} onChange={e => sset("esi_no", e.target.value)} /></div>
                    <div style={{ flex: 1, minWidth: 130 }}><label className="muted">Department</label>
                      <input style={{ width: "100%" }} value={smodal.department || ""} onChange={e => sset("department", e.target.value)} placeholder="e.g. Projects" /></div>
                    <div style={{ flex: 1, minWidth: 150 }}><label className="muted">Preferred language <span title="Used for WhatsApp / push messages sent to this person, e.g. delivery challan count-before-GRN">ⓘ</span></label>
                      <select style={{ width: "100%" }} value={smodal.preferred_lang || ""} onChange={e => sset("preferred_lang", e.target.value)}>
                        <option value="">— not set (Hindi used) —</option><option value="en">English</option><option value="hi">हिन्दी</option><option value="gu">ગુજરાતી</option></select></div>
                    {/* update374 */}
                    {/* update377: ONE field, "Aadhaar Documents", multi-file — matches the worker form */}
                    <div style={{ flex: "1 1 100%" }}>
                      <label className="muted">Aadhaar Documents
                        {(smodal.aadhaar_docs?.length || (!smodal.aadhaar_docs?.length && smodal.aadhaar_doc_url)) ? (
                          <span style={{ marginLeft: 8, fontSize: 11.5 }}>
                            {(smodal.aadhaar_docs || (smodal.aadhaar_doc_url ? [smodal.aadhaar_doc_url] : [])).map((u, i) => (
                              <span key={u + i}>
                                <a href={u} target="_blank" rel="noreferrer" style={{ color: "var(--copper)" }}>file {i + 1}</a>
                                <button type="button" onClick={() => sset("aadhaar_docs", (smodal.aadhaar_docs || []).filter((_, j) => j !== i))}
                                        style={{ marginLeft: 4, marginRight: 10, fontSize: 10, color: "var(--red)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </label>
                      <input type="file" accept="image/*,application/pdf,.pdf" multiple onChange={async e => {
                        const files = e.target.files; if (!files?.length) return;
                        setBusy(true); setErr("");
                        const r = await uploadAadhaarFiles(smodal.mobile || smodal.id || "s", files);
                        setBusy(false);
                        if (!r.ok) { setErr(r.error); return; }
                        if (r.partial) setErr("Some files failed: " + r.partial.join("; "));
                        sset("aadhaar_docs", [...(smodal.aadhaar_docs || []), ...r.urls]);
                        e.target.value = "";
                      }} />
                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Pick front, back and/or the PDF together — any one is enough. Add more later by picking again.</div>
                    </div>
                    <div style={{ flex: "1 1 100%" }}>
                      <label className="muted">Bank passbook / cancelled cheque {smodal.bank_doc_url && <a href={smodal.bank_doc_url} target="_blank" rel="noreferrer" style={{ color: "var(--copper)" }}>· view current ✓</a>}</label>
                      <input type="file" accept="image/*,.pdf" onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        setBusy(true); setErr("");
                        const r = await uploadBankDoc(smodal.mobile || smodal.id || "s", f);
                        setBusy(false);
                        if (!r.ok) { setErr(r.error); return; }
                        sset("bank_doc_url", r.url);
                      }} />
                    </div>
                  </div>
                </div>
                {/* update384: Emergency contact — same fields as workers.emergency_*; not
                    mandatory on staff since HR usually captures this via letters. */}
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Emergency contact <span className="muted" style={{ fontWeight: 400 }}>(optional — used on Employee PDF and by HR)</span></div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 200px" }}>
                      <label className="muted">Contact person name</label>
                      <input style={{ width: "100%" }} value={smodal.emergency_name || ""} onChange={e => sset("emergency_name", e.target.value)} />
                    </div>
                    <div style={{ flex: "1 1 160px" }}>
                      <label className="muted">Relationship</label>
                      <input style={{ width: "100%" }} placeholder="e.g. Father, Wife, Brother" value={smodal.emergency_relation || ""} onChange={e => sset("emergency_relation", e.target.value)} />
                    </div>
                    <div style={{ flex: "1 1 160px" }}>
                      <label className="muted">Mobile number</label>
                      <input style={{ width: "100%" }} inputMode="numeric" value={smodal.emergency_mobile || ""} onChange={e => sset("emergency_mobile", e.target.value.replace(/[^0-9+ ]/g, ""))} />
                    </div>
                    <div style={{ flex: "1 1 160px" }}>
                      <label className="muted">Alternate number</label>
                      <input style={{ width: "100%" }} inputMode="numeric" value={smodal.emergency_alt_mobile || ""} onChange={e => sset("emergency_alt_mobile", e.target.value.replace(/[^0-9+ ]/g, ""))} />
                    </div>
                    <div style={{ flex: "1 1 100%" }}>
                      <label className="muted">Address</label>
                      <textarea rows={2} style={{ width: "100%" }} value={smodal.emergency_address || ""} onChange={e => sset("emergency_address", e.target.value)} />
                    </div>
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
