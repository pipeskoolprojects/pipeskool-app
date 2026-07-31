"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import {
  getStaff, getUserSites, getSitePermissions, setSitePermission, assignSite, removeSite,
  resetSiteToRole, copySitePermissions, addStaff, MODULES, ACTIONS, ALL_SITES,
} from "@/lib/access";
import { getRoles } from "@/lib/access";

const FALLBACK_ROLES = [
  ["director", "Director"], ["ho_admin", "Accountant"], ["supervisor", "Site Incharge"],
  ["site_engineer", "Site Engineer"], ["storekeeper", "Storekeeper"], ["worker", "Worker / Labour"],
];
let ROLES = FALLBACK_ROLES;
const roleLabel = r => (ROLES.find(x => x[0] === r) || ["", r])[1];

// Plain-language meaning of each tick column
const ACTION_HELP = {
  view:    "Open the page and see records. No tick here = the module is invisible to them.",
  create:  "Add new entries — punch attendance, write DPR, raise indent, enter GRN, claim expense.",
  approve: "Approve or reject things others raised (indents, expenses, advances).",
  verify:  "Second/EOD check — e.g. verifying the day's attendance.",
  manage:  "Full control — edit & delete records, masters, exports. Give sparingly.",
};

// One-line description of what each module's ticks unlock
const MODULE_HELP = {
  attendance: "Punching, muster register, EOD verify",
  dpr:        "Daily progress reports & site photos",
  money:      "Advances, site expenses, petty cash",
  wages:      "Payroll runs & wage approval",
  stock:      "GRN, issue to workers, settle, balances",
  indent:     "Material indents, quotes, purchase orders",
  assets:     "Tools & assets issue / return",
  rentals:    "Rented machines & rooms, rent due dates",
  workers:    "Worker profiles, KYC, deactivation",
  notices:    "Company notice board — post & manage notices",
  leave:      "Leave requests — View own is automatic; Approve = act on team requests",
};

// One-click templates — apply, then fine-tune ticks if needed
const PRESETS = [
  ["site_engineer", "Site Engineer", "Raises everything at site, approves nothing",
    { attendance:["view","create"], dpr:["view","create"], stock:["view","create"], indent:["view","create"], assets:["view","create"], rentals:["view","create"], workers:["view","create"] }],
  ["site_incharge", "Site Incharge / Supervisor", "Runs the site: raises + approves site-level work",
    { attendance:["view","create","approve","verify"], dpr:["view","create","approve"], money:["view","create"], wages:["view"], stock:["view","create","approve"], indent:["view","create","approve"], assets:["view","create"], rentals:["view","create"], workers:["view","create","manage"], leave:["view","approve"] }],
  ["storekeeper", "Storekeeper", "Owns the store: GRN, issue, settle",
    { attendance:["view"], stock:["view","create","manage"], indent:["view","create"], assets:["view","create"], workers:["view"] }],
  ["billing_engineer", "Billing Engineer", "Reads site data for RA bills, writes DPR",
    { attendance:["view"], dpr:["view","create"], wages:["view"], stock:["view"], indent:["view"] }],
  ["accountant", "Accountant / HO", "Money & payroll authority, read-only on site ops",
    { attendance:["view"], money:["view","approve","verify","manage"], wages:["view","approve","manage"], stock:["view"], indent:["view"], rentals:["view"], leave:["view","approve"] }],
  ["it_admin", "IT Executive (data admin)", "Sees + cleans data everywhere, approves nothing",
    Object.fromEntries(["attendance","dpr","money","wages","stock","indent","assets","rentals","workers","notices","leave"].map(m => [m, ["view","manage"]]))],
];

export default function AccessPage() {
  const [session, setSession] = useState(null);
  const [staff, setStaff] = useState([]);
  const [sel, setSel] = useState(null);
  const [userSites, setUserSites] = useState([]);
  const [activeSite, setActiveSite] = useState(null);
  const [perms, setPerms] = useState({});
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [applying, setApplying] = useState(false);
  const [nf, setNf] = useState({ full_name: "", mobile: "", role: "supervisor", site_id: "" });

  useEffect(() => { getRoles().then(rs => { if (rs?.length) ROLES = rs.map(r => [r.code, r.label]); }); }, []);
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
  async function applyPreset(key) {
    const preset = PRESETS.find(p => p[0] === key);
    if (!preset) return;
    if (!confirm(`Apply the "${preset[1]}" template on this site?\nIt replaces the current ticks — you can still adjust any tick afterwards.`)) return;
    setApplying(true);
    const target = preset[3];
    for (const [m] of MODULES) {
      for (const [a] of ACTIONS) {
        const want = (target[m] || []).includes(a);
        const have = (perms[m] || []).includes(a);
        if (want !== have) await setSitePermission(sel.id, activeSite, m, a, want);
      }
    }
    setPerms(await getSitePermissions(sel.id, activeSite));
    setApplying(false);
    setMsg(`Applied "${preset[1]}" template on this site.`);
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
                    <div className="panel" style={{ background: "var(--copper-soft)", padding: "10px 12px", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <b style={{ fontSize: 13 }}>Not sure what to tick?</b>
                        <span className="muted" style={{ fontSize: 12 }}>Pick a ready template, then adjust:</span>
                        <select id="psk-preset" defaultValue="" style={{ fontSize: 12 }} disabled={applying}>
                          <option value="">— choose template —</option>
                          {PRESETS.map(p => <option key={p[0]} value={p[0]}>{p[1]} — {p[2]}</option>)}
                        </select>
                        <button className="primary" style={{ fontSize: 12 }} disabled={applying}
                          onClick={() => { const v = document.getElementById("psk-preset").value; if (v) applyPreset(v); }}>
                          {applying ? "Applying…" : "Apply template"}</button>
                        <button style={{ fontSize: 12, marginLeft: "auto" }} onClick={() => setShowGuide(g => !g)}>{showGuide ? "Hide guide ▴" : "❓ What do the ticks mean?"}</button>
                      </div>
                      {showGuide && (
                        <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.55 }}>
                          <div style={{ marginBottom: 6 }}><b>How this page works:</b> ① pick the staff member on the left → ② pick the site tab → ③ tick what they may do <i>on that site</i>. Ticks save instantly and can differ site to site.</div>
                          <table className="dt-compact" style={{ background: "#fff", borderRadius: 8 }}>
                            <tbody>
                              {ACTIONS.map(a => (
                                <tr key={a[0]}><td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{a[1]}</td><td>{ACTION_HELP[a[0]]}</td></tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="muted" style={{ marginTop: 6 }}>Rule of thumb: everyone who works there gets <b>View + Create</b>; the person responsible for checking gets <b>Approve/Verify</b>; only office admins get <b>Manage</b>.</div>
                        </div>
                      )}
                    </div>
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
                      <thead><tr><th>Module</th>{ACTIONS.map(a => <th key={a[0]} title={ACTION_HELP[a[0]]} style={{ textAlign: "center", cursor: "help" }}>{a[1]} ⓘ</th>)}</tr></thead>
                      <tbody>
                        {MODULES.map(m => (
                          <tr key={m[0]}>
                            <td><div style={{ fontWeight: 600 }}>{m[1]}</div><div className="muted" style={{ fontSize: 11 }}>{MODULE_HELP[m[0]]}</div></td>
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
