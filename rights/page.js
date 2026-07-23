"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getSession, ROLE_LABELS, can } from "@/lib/auth";
import { getCatalog, getStaffList, getUserPermissions, setPermission } from "@/lib/rights";

export default function RightsPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState(null);
  const [perms, setPerms] = useState({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const s = getSession();
    setSession(s);
    getCatalog().then(setCatalog);
    getStaffList().then(list => { setStaff(list); if (list[0]) pick(list[0]); });
  }, []);

  function pick(u) { setSelected(u); getUserPermissions(u.id).then(setPerms); }

  async function toggle(moduleKey, action) {
    const key = `${moduleKey}:${action}`;
    const next = !perms[key];
    setPerms(p => ({ ...p, [key]: next }));
    const res = await setPermission(selected.id, moduleKey, action, next, session?.id);
    setMsg(res.ok ? `Saved: ${selected.full_name} — ${moduleKey} ${action} ${next ? "granted" : "removed"}` : "Save failed: " + res.error);
  }

  // Director-only guard
  const isDirector = session?.role === "director" || isDemo;

  if (session && !isDirector) {
    return (
      <div className="layout"><Sidebar />
        <main className="main"><div className="panel"><h2>Access Rights</h2>
          <p className="muted">Only the Director can open this screen.</p></div></main>
      </div>
    );
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Access rights</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — changes are not stored. Connect database to save real permissions.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>Staff</h2>
            {staff.map(u => (
              <div key={u.id} onClick={() => pick(u)}
                   style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 4,
                     background: selected?.id === u.id ? "var(--copper-soft)" : "transparent" }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.full_name}</div>
                <div className="muted">{ROLE_LABELS[u.role] || u.role}</div>
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginBottom: 0 }}>
            {!selected ? <div className="muted">Select a staff member.</div> : (
              <>
                <h2>{selected.full_name} — {ROLE_LABELS[selected.role] || selected.role}</h2>
                <p className="muted" style={{ marginBottom: 14 }}>
                  Tick the actions this person can perform. Access is automatically limited to the site(s) they handle.
                  {selected.role === "director" && " (Director always has full access.)"}
                </p>
                {catalog.map(([mkey, mlabel, actions]) => (
                  <div key={mkey} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>{mlabel}</div>
                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                      {actions.map(([akey, alabel]) => {
                        const key = `${mkey}:${akey}`;
                        const checked = selected.role === "director" ? true : !!perms[key];
                        return (
                          <label key={akey} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: selected.role === "director" ? "default" : "pointer" }}>
                            <input type="checkbox" checked={checked}
                                   disabled={selected.role === "director"}
                                   onChange={() => toggle(mkey, akey)}
                                   style={{ width: 16, height: 16 }} />
                            {alabel}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
