"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import {
  getStaff, getUserSites, getSitePermissions, setSitePermission, assignSite, removeSite,
  resetSiteToRole, copySitePermissions, addStaff, MODULES, ACTIONS, ALL_SITES,
} from "@/lib/access";

const ROLES = [
  ["director", "Director"], ["ho_admin", "Accountant"], ["supervisor", "Site Incharge"],
  ["site_engineer", "Site Engineer"], ["storekeeper", "Storekeeper"], ["worker", "Worker / Labour"],
];
const roleLabel = r => (ROLES.find(x => x[0] === r) || ["", r])[1];

export default function AccessPage() {
  const [session, setSession] = useState(null);
  const [staff, setStaff] = useState([]);
  const [sel, setSel] = useState(null);
  const [userSites, setUserSites] = useState([]);
  const [activeSite, setActiveSite] = useState(null);
  const [perms, setPerms] = useState({});
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ full_name: "", mobile: "", role: "supervisor", site_id: "" });

  useEffect(() => { setSession(getSession()); getStaff().then(setStaff); }, []);

  async function openUser(u) {
    setSel(u); setMsg("");
    const sites = await getUserSites(u.id);
    setUserSites(sites);
    const first = sites[0]?.id || null;
    setActiveSite(first);
    setPerms(first ? await getSitePermissions(u.id, first) : {});
  }
  async function pickSite(siteId) {
    setActiveSite(siteId);
    setPerms(await getSitePermissions(sel.id, siteId));
  }
  const has = (m, a) => (perms[m] || []).includes(a);
  async function toggle(m, a) {
    const allowed = !has(m, a);
    setPerms(p => { const arr = new Set(p[m] || []); allowed ? arr.add(a) : arr.delete(a); return { ...p, [m]: [...arr] }; });
    await setSitePermission(sel.id, activeSite, m, a, allowed);
  }
  async function doAssign(siteId) {
    if (!siteId) return;
    await assignSite(sel.id, Number(siteId), sel.role);
    const sites = await getUserSites(sel.id); setUserSites(sites);
    await pickSite(Number(siteId));
    setMsg("Site assigned with default rights for " + roleLabel(sel.role) + ".");
  }
  async function doRemove(siteId) {
    if (!confirm("Remove this site and all its rights for " + sel.full_name + "?")) return;
    await removeSite(sel.id, siteId);
    const sites = await getUserSites(sel.id); setUserSites(sites);
    const first = sites[0]?.id || null; setActiveSite(first);
    setPerms(first ? await getSitePermissions(sel.id, first) : {});
  }
  async function reset() {
    if (!confirm(`Reset ${sel.full_name}'s rights on this site to the ${roleLabel(sel.role)} default?`)) return;
    await resetSiteToRole(sel.id, activeSite, sel.role);
    setPerms(await getSitePermissions(sel.id, activeSite)); setMsg("Reset to role default for this site.");
  }
  async function copyFrom(fromSite) {
    if (!fromSite) return;
    await copySitePermissions(sel.id, Number(fromSite), activeSite);
    setPerms(await getSitePermissions(sel.id, activeSite)); setMsg("Copied rights from the other site.");
  }
  async function saveNew() {
    if (!nf.full_name || !nf.mobile) { setMsg("Name and mobile required."); return; }
    const res = await addStaff({ ...nf, site_id: nf.site_id ? Number(nf.site_id) : null });
    if (!res.ok) { setMsg(res.error); return; }
    setAdding(false); setNf({ full_name: "", mobile: "", role: "supervisor", site_id: "" });
    getStaff().then(setStaff); setMsg("Staff added with default rights.");
  }

  const assignedIds = userSites.map(s => s.id);
  const unassigned = ALL_SITES.filter(s => !assignedIds.includes(s.id));

  if (session && session.role !== "director") {
    return (<div className="layout"><Sidebar /><main className="main"><div className="panel"><h2>Access rights</h2>
      <p className="muted">This screen is restricted to the Director.</p></div></main></div>);
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Access rights</h1>
          <button className="primary" onClick={() => setAdding(a => !a)}>＋ Add staff</button></div>
        {isDemo && <div className="demo-banner">Demo mode — changes are local to this session.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        {adding && (
          <div className="panel"><h2>Add staff member</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <div><label className="muted">Full name</label><input style={{ width: "100%" }} value={nf.full_name} onChange={e => setNf(p => ({ ...p, full_name: e.target.value }))} /></div>
              <div><label className="muted">Mobile (login)</label><input style={{ width: "100%" }} value={nf.mobile} onChange={e => setNf(p => ({ ...p, mobile: e.target.value }))} /></div>
              <div><label className="muted">Role</label><select style={{ width: "100%" }} value={nf.role} onChange={e => setNf(p => ({ ...p, role: e.target.value }))}>{ROLES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select></div>
              <div><label className="muted">First site</label><select style={{ width: "100%" }} value={nf.site_id} onChange={e => setNf(p => ({ ...p, site_id: e.target.value }))}><option value="">— none —</option>{ALL_SITES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            </div>
            <button className="primary" style={{ marginTop: 12 }} onClick={saveNew}>Save staff</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16 }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>Staff</h2>
            {staff.map(u => (
              <div key={u.id} onClick={() => openUser(u)} style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: sel?.id === u.id ? "var(--copper-soft)" : "transparent", borderRadius: 6 }}>
                <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                <div className="muted">{roleLabel(u.role)}</div>
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginBottom: 0 }}>
            {!sel ? <span className="muted">Select a staff member to set their per-site rights.</span> : (
              <>
                <h2 style={{ marginBottom: 8 }}>{sel.full_name} — {roleLabel(sel.role)}</h2>

                {/* SITE TABS */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                  {userSites.map(s => (
                    <button key={s.id} onClick={() => pickSite(s.id)}
                      className={activeSite === s.id ? "primary" : ""}
                      style={{ fontSize: 12 }}>{s.name.split(",")[0]}</button>
                  ))}
                  {sel.role !== "director" && unassigned.length > 0 && (
                    <select onChange={e => { doAssign(e.target.value); e.target.value = ""; }} defaultValue="" style={{ fontSize: 12 }}>
                      <option value="">＋ Assign site…</option>
                      {unassigned.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                </div>

                {sel.role === "director" ? (
                  <p className="muted">Director has full access to all sites by default.</p>
                ) : !activeSite ? (
                  <p className="muted">No site assigned yet. Use “＋ Assign site” above.</p>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                      <div className="muted">Rights for <b>{userSites.find(s => s.id === activeSite)?.name}</b> — tick what they can do here.</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {userSites.length > 1 && (
                          <select onChange={e => { copyFrom(e.target.value); e.target.value = ""; }} defaultValue="" style={{ fontSize: 11.5 }}>
                            <option value="">Copy from…</option>
                            {userSites.filter(s => s.id !== activeSite).map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}
                          </select>
                        )}
                        <button onClick={reset} style={{ fontSize: 11.5 }}>Reset to default</button>
                        <button onClick={() => doRemove(activeSite)} style={{ fontSize: 11.5, color: "var(--red)" }}>Remove site</button>
                      </div>
                    </div>
                    <table>
                      <thead><tr><th>Module</th>{ACTIONS.map(a => <th key={a[0]} style={{ textAlign: "center" }}>{a[1]}</th>)}</tr></thead>
                      <tbody>
                        {MODULES.map(m => (
                          <tr key={m[0]}>
                            <td style={{ fontWeight: 600 }}>{m[1]}</td>
                            {ACTIONS.map(a => (
                              <td key={a[0]} style={{ textAlign: "center" }}>
                                <input type="checkbox" checked={has(m[0], a[0])} onChange={() => toggle(m[0], a[0])}
                                  style={{ width: 18, height: 18, cursor: "pointer", accentColor: "var(--copper)" }} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="muted" style={{ marginTop: 10 }}>Changes save instantly. Different sites can have different ticks for the same person.</div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
