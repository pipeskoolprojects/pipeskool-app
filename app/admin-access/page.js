"use client";
// update409: ADMIN & ACCESS — per-user Director access (grant / revoke). Directors only.
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { listDirectorAccess, setDirectorAccess } from "@/lib/directorAccess";
import { listPriceAccess, setPriceAccess } from "@/lib/prices";   // update463

const ROLE = { director: "Director", it_executive: "IT Executive", accountant: "Accountant", ho_admin: "Accountant / HO", supervisor: "Supervisor", staff: "Staff", site_engineer: "Site Engineer", site_incharge: "Site In-charge", storekeeper: "Storekeeper", peon: "Peon", billing: "Billing Engineer", billing_engineer: "Billing Engineer", project_manager: "Project Manager", project_coodinator: "Project Coordinator", procurement_head: "Procurement Head", auditor: "Auditor" };
// update463: why a person does / does not see material prices
const BASIS = { director: "Director role", procurement: "Procurement Head role", director_access: "via Director access", ticked: "ticked", none: "", site: "Site role — never" };
export default function AdminAccessPage() {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(null);
  const [s, setSess] = useState(null);   // update463: read after mount — same first render on server and phone (no hydration error)
  useEffect(() => { setSess(getSession()); }, []);
  const load = () => listDirectorAccess().then(setRows).catch(e => { setErr(e.message); setRows([]); });
  const [px, setPx] = useState(null);   // update463: Price access list
  const loadPx = () => listPriceAccess().then(setPx).catch(e => { setErr(e.message); setPx([]); });
  async function togglePx(u, grant) {
    if (!window.confirm(grant ? `Give Price access to ${u.full_name}?\n\nThey will see purchase rates, discounts, quotes, PO values and stock value.` : `Remove Price access from ${u.full_name}?`)) return;
    setBusy("px" + u.id); setErr(""); const r = await setPriceAccess(u.id, grant); setBusy(null);
    if (!r.ok) { setErr(r.error); return; } setMsg(`${u.full_name}: Price access ${grant ? "given" : "removed"}. It applies from their next page load.`); loadPx();
  }
  useEffect(() => { if (!getSession()) { window.location.replace("/login"); return; } load(); loadPx(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  async function toggle(u, grant) {
    if (!window.confirm(grant ? `Grant Director access to ${u.full_name}?\n\nThey will be able to: edit PO rates and issued POs, duplicate POs, and use any other action gated behind Director access.` : `Revoke Director access from ${u.full_name}?`)) return;
    setBusy(u.id); setErr(""); const r = await setDirectorAccess(u.id, grant); setBusy(null);
    if (!r.ok) { setErr(r.error); return; } setMsg(`${u.full_name}: Director access ${grant ? "granted" : "revoked"}. They must re-login for menus to refresh.`); load();
  }
  const initials = n => String(n || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="layout"><Sidebar /><main className="main">
      <h1 style={{ marginBottom: 4 }}>Admin &amp; access</h1>
      <div className="muted" style={{ fontSize: 13, marginBottom: 18 }}>Control who can approve POs, edit locked rates and see financials. Only the Director role has these by default; everyone else needs an explicit grant here — one person at a time.</div>
      {msg && <div className="note green">{msg}</div>}
      {err && <div className="note red">{err}</div>}
      {!s ? null : s.role !== "director" ? <div className="note amber">This panel is for Directors only.</div> : (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 18 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup><col style={{ width: "40%" }} /><col style={{ width: "24%" }} /><col style={{ width: "36%" }} /></colgroup>
            <thead><tr style={{ background: "var(--gray-bg)" }}>{["User", "Role", "Director access"].map(h => <th key={h} style={{ textAlign: "left", fontSize: 12, color: "var(--muted)", fontWeight: 500, padding: "10px 12px" }}>{h}</th>)}</tr></thead>
            <tbody>{rows === null ? <tr><td colSpan={3} style={{ padding: 12 }} className="muted">Loading…</td></tr> : rows.map(u => { const auto = u.role === "director"; const on = auto || u.director_access; return (
              <tr key={u.id}>
                <td style={{ padding: "10px 12px", fontSize: 13, borderTop: "1px solid var(--border)" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#EDE9FE", color: "#6D28D9", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(u.full_name)}</div>{u.full_name}</div></td>
                <td style={{ padding: "10px 12px", fontSize: 13, borderTop: "1px solid var(--border)", color: "var(--muted)" }}>{ROLE[u.role] || u.role}</td>
                <td style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
                  {on ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ background: "#DCFCE7", color: "#15803D", fontSize: 11, padding: "4px 10px", borderRadius: 999 }}>✓ Granted{auto ? " (Director role)" : ""}</span>{!auto && <span className="muted" style={{ fontSize: 11 }}>by {u.granted_by || "—"}{u.granted_at ? " · " + String(u.granted_at).slice(0, 10).split("-").reverse().join("/") : ""}</span>}{!auto && <button type="button" style={{ fontSize: 11.5 }} disabled={busy === u.id} onClick={() => toggle(u, false)}>Revoke</button>}</span>
                    : <button type="button" style={{ fontSize: 12, padding: "5px 12px" }} disabled={busy === u.id} onClick={() => toggle(u, true)}>🛡 Grant access</button>}
                </td>
              </tr>); })}</tbody>
          </table>
        </div>
      )}
      {s?.role === "director" && (   /* update463: PRICE ACCESS */
        <div className="pa-box" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 18 }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>💰 Price access</div>
            <div className="muted" style={{ fontSize: 12 }}>Who can see purchase rates, discounts, quotes, PO values and stock value. Directors and Procurement Head see them by role; any other office user needs your tick. Site roles can never see prices — the database refuses them.</div>
          </div>
          <div className="pa-list">{px === null ? <div className="muted" style={{ padding: 12 }}>Loading…</div> : px.map(u => { const site = u.basis === "site"; const auto = ["director", "procurement", "director_access"].includes(u.basis); return (
            <div key={u.id} className="pa-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px", minWidth: 0, fontSize: 13 }}><b style={{ fontWeight: 600 }}>{u.full_name}</b> <span className="muted" style={{ fontSize: 12 }}>· {ROLE[u.role] || u.role}</span></div>
              <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                {site ? <span style={{ background: "#F3F4F6", color: "#6B7280", fontSize: 11, padding: "4px 10px", borderRadius: 999 }}>🔒 {BASIS.site}</span>
                  : auto ? <span style={{ background: "#DCFCE7", color: "#15803D", fontSize: 11, padding: "4px 10px", borderRadius: 999 }}>✓ Sees prices ({BASIS[u.basis]})</span>
                  : <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!u.price_access} disabled={busy === "px" + u.id} onChange={e => togglePx(u, e.target.checked)} style={{ width: 18, height: 18 }} />
                      {u.price_access ? <span>Price access <span className="muted" style={{ fontSize: 11 }}>· {u.granted_by || "—"}{u.granted_at ? " · " + String(u.granted_at).slice(0, 10).split("-").reverse().join("/") : ""}</span></span> : "No price access"}
                    </label>}
              </div>
            </div>); })}</div>
        </div>
      )}
      <div style={{ background: "#F5F8FF", border: "1px solid #C7D7FE", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 12.5, color: "#1D4ED8", marginBottom: 8 }}>🔒 What Director access unlocks</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{["Edit PO rates (with audit)", "Edit / duplicate an issued PO", "Actions gated behind Director access in future updates"].map(t => <span key={t} style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 11.5, padding: "4px 10px", borderRadius: 999 }}>{t}</span>)}</div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>PO approval and payroll approvals stay Director-only in the database (update 238 lockdown) and are delegated per module from Access Rights, not here. Only the Director role can grant or revoke.</div>
      </div>
    </main></div>);
}
