"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getSession, can } from "@/lib/auth";
import { getStaff, getUserPermissions, setPermission, applyRoleDefaults, addStaff, MODULES, ACTIONS } from "@/lib/access";

const ROLES = [
  ["director", "Director"], ["ho_admin", "Accountant"], ["supervisor", "Site Incharge"],
  ["site_engineer", "Site Engineer"], ["storekeeper", "Storekeeper"], ["worker", "Worker / Labour"],
];
const roleLabel = r => (ROLES.find(x => x[0] === r) || ["", r])[1];

export default function AccessPage() {
  const [session, setSessionState] = useState(null);
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState(null);
  const [perms, setPerms] = useState({});
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ full_name: "", mobile: "", role: "supervisor", site_id: "" });

  useEffect(() => { setSessionState(getSession()); getStaff().then(setStaff); }, []);

  async function openUser(u) {
    setSelected(u);
    setPerms(await getUserPermissions(u.id));
    setMsg("");
  }

  const has = (m, a) => (perms[m] || []).includes(a);

  async function toggle(m, a) {
    const allowed = !has(m, a);
    setPerms(p => {
      const arr = new Set(p[m] || []);
      if (allowed) arr.add(a); else arr.delete(a);
      return { ...p, [m]: [...arr] };
    });
    await setPermission(selected.id, m, a, allowed);
  }

  async function resetToRole() {
    if (!confirm(`Reset ${selected.full_name}'s rights to the default for "${roleLabel(selected.role)}"?`)) return;
    await applyRoleDefaults(selected.id, selected.role);
    setPerms(await getUserPermissions(selected.id));
    setMsg("Reset to role defaults.");
  }

  async function saveNew() {
    if (!nf.full_name || !nf.mobile) { setMsg("Name and mobile required."); return; }
    const res = await addStaff({ ...nf, site_id: nf.site_id ? Number(nf.site_id) : null });
    if (!res.ok) { setMsg(res.error); return; }
    setAdding(false); setNf({ full_name: "", mobile: "", role: "supervisor", site_id: "" });
    getStaff().then(setStaff); setMsg("Staff added with default rights for their role.");
  }

  // gate: director only
  if (session && session.role !== "director" && !can(session, "access_rights", "manage")) {
    return (
      <div className="layout"><Sidebar />
        <main className="main"><div className="panel"><h2>Access rights</h2>
          <p className="muted">This screen is restricted to the Director.</p></div></main>
      </div>
    );
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Access rights</h1>
          <button className="primary" onClick={() => setAdding(a => !a)}>＋ Add staff</button>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — changes are local to this session.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        {adding && (
          <div className="panel">
            <h2>Add staff member</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <div><label className="muted">Full name</label><input style={{ width: "100%" }} value={nf.full_name} onChange={e => setNf(p => ({ ...p, full_name: e.target.value }))} /></div>
              <div><label className="muted">Mobile (login)</label><input style={{ width: "100%" }} value={nf.mobile} onChange={e => setNf(p => ({ ...p, mobile: e.target.value }))} /></div>
              <div><label className="muted">Role</label><select style={{ width: "100%" }} value={nf.role} onChange={e => setNf(p => ({ ...p, role: e.target.value }))}>{ROLES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select></div>
              <div><label className="muted">Site</label><select style={{ width: "100%" }} value={nf.site_id} onChange={e => setNf(p => ({ ...p, site_id: e.target.value }))}><option value="">— (HO / all)</option><option value="1">KEI Sanand</option><option value="2">SOUL Campus</option><option value="3">The Creek</option></select></div>
            </div>
            <button className="primary" style={{ marginTop: 12 }} onClick={saveNew}>Save staff</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>Staff</h2>
            {staff.map(u => (
              <div key={u.id} onClick={() => openUser(u)}
                   style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)", cursor: "pointer",
                            background: selected?.id === u.id ? "var(--copper-soft)" : "transparent", borderRadius: 6 }}>
                <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                <div className="muted">{roleLabel(u.role)}{u.site_name ? " · " + u.site_name : ""}</div>
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginBottom: 0 }}>
            {!selected ? <span className="muted">Select a staff member to set their module rights.</span> : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <h2 style={{ marginBottom: 0 }}>{selected.full_name} — rights</h2>
                  <button onClick={resetToRole} style={{ fontSize: 12 }}>Reset to {roleLabel(selected.role)} default</button>
                </div>
                <div className="muted" style={{ marginBottom: 10 }}>
                  Tick what this person can do in each module. {selected.role === "director" ? "Director has full access by default." : "Access is limited to their assigned site(s)."}
                </div>
                <table>
                  <thead>
                    <tr><th>Module</th>{ACTIONS.map(a => <th key={a[0]} style={{ textAlign: "center" }}>{a[1]}</th>)}</tr>
                  </thead>
                  <tbody>
                    {MODULES.map(m => (
                      <tr key={m[0]}>
                        <td style={{ fontWeight: 600 }}>{m[1]}</td>
                        {ACTIONS.map(a => (
                          <td key={a[0]} style={{ textAlign: "center" }}>
                            <input type="checkbox" checked={has(m[0], a[0])} onChange={() => toggle(m[0], a[0])}
                                   disabled={selected.role === "director"} style={{ width: 18, height: 18, cursor: "pointer", accentColor: "var(--copper)" }} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="muted" style={{ marginTop: 10 }}>Changes save instantly. The person sees the effect next time they open the app.</div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
