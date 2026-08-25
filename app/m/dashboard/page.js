"use client";
// update218: DIRECTOR DASHBOARD (Android-first 360–430px). UI ONLY — every number on this
// screen comes from the SAME live loaders the existing pages use (projects, attendance,
// money queues, DPR digest, notices). Nothing is written; nothing is invented; widgets in
// the reference mock without real backing data (planned-vs-actual, trade %, milestones)
// are deliberately omitted rather than faked.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MobileNav from "@/components/MobileNav";
import { getSession, setCurrentSite } from "@/lib/auth";
import { getSites, getAttendance } from "@/lib/data";
import { getProjects, PROJECT_STATUSES } from "@/lib/projects";
import { getPettyRequestQueue, getAdvanceQueue, getExpenseClaimQueue, inr } from "@/lib/money";
import { getPOs } from "@/lib/procure";
import { getOpenIndents } from "@/lib/procure";
import { getDigest } from "@/lib/dpr";
import { todayLocal } from "@/lib/today";

const ST_META = { active: ["Active", "#15803d"], upcoming: ["Upcoming", "#6b46c1"], on_hold: ["On hold", "#b45309"], delayed: ["Delayed", "#b91c1c"], completed: ["Completed", "#2b6cb0"], idea: ["Idea", "#6b7280"] };
const Card = ({ children, style, onClick }) => (
  <div onClick={onClick} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 14, boxShadow: "0 2px 8px rgba(15,20,25,0.05)", cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>
);

export default function DirectorDashboard() {
  const router = useRouter();
  const [sess, setSess] = useState(null);
  const [sites, setSites] = useState([]);
  const [projects, setProjects] = useState(null);
  const [att, setAtt] = useState(null);          // today's attendance rows (all sites)
  const [pettyQ, setPettyQ] = useState([]);
  const [advQ, setAdvQ] = useState([]);
  const [claims, setClaims] = useState([]);
  const [pos, setPos] = useState([]);
  const [indents, setIndents] = useState([]);
  const [digest, setDigest] = useState(null);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace("/m/login"); return; }
    if (s.role !== "director") { router.replace("/m"); return; }
    setSess(s);
    getSites().then(setSites);
    // update226 FIX: getProjects returns { rows, staff } — not an array (caused s.filter crash)
    getProjects().then(r => setProjects(Array.isArray(r) ? r : (r?.rows || [])));
    getAttendance(todayLocal(), "all").then(r => setAtt(r?.rows || [])).catch(() => setAtt([]));
    const arr = x => Array.isArray(x) ? x : (x?.rows || []);
    getPettyRequestQueue().then(r => setPettyQ(arr(r))).catch(() => {});
    getAdvanceQueue().then(r => setAdvQ(arr(r))).catch(() => {});
    getExpenseClaimQueue().then(r => setClaims(arr(r))).catch(() => {});
    getPOs("all").then(r => setPos(arr(r))).catch(() => {});
    getOpenIndents("all").then(r => setIndents(arr(r))).catch(() => {});
    getDigest(todayLocal()).then(setDigest).catch(() => {});
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const curSiteId = sess?.current_site_id || sess?.site_id;

  const pj = useMemo(() => {
    const all = projects || [];
    const by = k => all.filter(p => p.status === k).length;
    return { all, total: all.length, active: by("active"), hold: by("on_hold") + by("delayed"), done: by("completed"),
      current: all.find(p => String(p.id) === String(curSiteId)) || all.find(p => p.status === "active"),
      upcoming: all.filter(p => p.status === "upcoming" || p.status === "idea").slice(0, 3) };
  }, [projects, curSiteId]);

  const man = useMemo(() => {
    const rows = att || [];
    const present = rows.filter(r => r.punch_in || r.status === "present" || r.status === "half_day").length;
    return { present, marked: rows.length };
  }, [att]);

  const appr = useMemo(() => ({
    petty: (pettyQ || []).filter(r => r.status === "pending").length,
    claims: (claims || []).filter(r => r.status === "pending" || r.status === "queried").length,
    adv: (advQ || []).filter(r => r.status === "pending").length,
    po: (pos || []).filter(p => p.approval === "pending" && p.status !== "cancelled").length,
    ind: (indents || []).length,
  }), [pettyQ, claims, advQ, pos, indents]);
  const apprTotal = appr.petty + appr.claims + appr.adv + appr.po;

  const money = useMemo(() => {
    const ok = (claims || []).filter(e => e.status === "approved");
    return { total: ok.reduce((t, e) => t + Number(e.amount), 0), pending: (claims || []).filter(e => e.status === "pending").length };
  }, [claims]);

  const dprMissing = useMemo(() => {
    if (!digest || !sites.length) return null;
    const filed = new Set((digest || []).map(d => d.site));
    return sites.filter(s2 => s2.is_active !== false && !filed.has(s2.name)).length;
  }, [digest, sites]);

  const daysLeft = p => { if (!p?.end_date) return null; const d = Math.ceil((new Date(p.end_date) - new Date()) / 86400000); return d; };
  const QA = [
    ["📁", "Projects", "/projects"], ["👷", "Muster", "/m/muster"], ["✅", "Approvals", "/m/approvals", apprTotal],
    ["📦", "Stock", "/m/stock"], ["💳", "Expenses", "/m/money"], ["🗒", "Tasks", "/tasks"], ["📋", "Reports", "/m/report"], ["⋯", "More", "/m"],
  ];

  if (!sess) return null;
  return (
    <div style={{ background: "var(--bg)", minHeight: "100dvh", paddingBottom: 76 }}>
      {/* header */}
      <div style={{ background: "#0F1419", color: "#fff", padding: "16px 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--copper)", fontSize: 12, fontWeight: 700 }}>{greet},</div>
            <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sess.full_name || "Director"} <span style={{ fontSize: 12 }}>✔</span></div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Pipeskool Director</div>
          </div>
          <Link href="/notices" style={{ color: "#fff", fontSize: 20, textDecoration: "none", padding: 8 }}>🔔</Link>
          <span style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--copper)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>
            {(sess.full_name || "D").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase()}</span>
        </div>
        <select value={String(curSiteId || "")} onChange={e => { setCurrentSite(Number(e.target.value)); setSess(s => ({ ...s, current_site_id: Number(e.target.value) })); }}
          style={{ marginTop: 10, width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "#1a222b", color: "#fff", fontSize: 14 }}>
          {sites.map(s2 => <option key={s2.id} value={s2.id}>{s2.name}</option>)}
        </select>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        {/* project stat row — live project statuses */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[["🏗", pj.total, "Total Projects", "/projects"], ["▶", pj.active, "Active", "/projects?tab=active"],
            ["⏸", pj.hold, "On Hold / Delayed", "/projects?tab=on_hold"], ["✅", pj.done, "Completed", "/projects?tab=completed"]].map(([ic, n, l, href]) => (
            <Card key={l} onClick={() => router.push(href)}>
              <div style={{ fontSize: 20 }}>{ic}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{projects ? n : "…"}</div>
              <div className="muted" style={{ fontSize: 12 }}>{l}</div>
            </Card>
          ))}
        </div>

        {/* current project progress — real invoiced/contract */}
        {pj.current && (
          <Card onClick={() => router.push("/projects/" + pj.current.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ fontSize: 14.5 }}>{pj.current.name}</b>
              <span className="badge" style={{ color: (ST_META[pj.current.status] || [])[1], border: "1px solid currentColor", background: "transparent" }}>{(ST_META[pj.current.status] || [pj.current.status])[0]}</span>
            </div>
            {pj.current.progress !== null ? (<>
              <div style={{ fontSize: 30, fontWeight: 800, margin: "6px 0 2px" }}>{pj.current.progress}%</div>
              <div style={{ height: 9, background: "#f0ece6", borderRadius: 5 }}>
                <div style={{ width: Math.min(pj.current.progress, 100) + "%", height: 9, borderRadius: 5, background: "var(--copper)" }} />
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Progress = RA bills invoiced ÷ contract value</div>
            </>) : <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Add contract value in the project to see progress.</div>}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12 }}>
              <span><span className="muted">Start</span><br /><b>{pj.current.start_date || "—"}</b></span>
              <span style={{ textAlign: "right" }}><span className="muted">End</span><br /><b>{pj.current.end_date || "—"}</b></span>
            </div>
            {daysLeft(pj.current) !== null && (
              <div style={{ marginTop: 8, background: "#fff3e8", border: "1px solid var(--copper)", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
                📅 <b>{daysLeft(pj.current)} days</b> {daysLeft(pj.current) >= 0 ? "remaining" : "overdue"}</div>
            )}
          </Card>
        )}

        {/* quick access — real modules, live approval badge */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 14 }}>Quick Access</b></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 10 }}>
            {QA.map(([ic, l, href, badge]) => (
              <Link key={l} href={href} style={{ textDecoration: "none", textAlign: "center", color: "var(--text)" }}>
                <span style={{ position: "relative", display: "inline-flex", width: 48, height: 48, borderRadius: 14, background: "#faf6f1", border: "1px solid var(--border)", alignItems: "center", justifyContent: "center", fontSize: 21 }}>
                  {ic}{badge > 0 && <span style={{ position: "absolute", top: -6, right: -6, background: "var(--red)", color: "#fff", borderRadius: 9, fontSize: 10, fontWeight: 800, padding: "1px 5px" }}>{badge}</span>}</span>
                <div style={{ fontSize: 11, marginTop: 4 }}>{l}</div>
              </Link>
            ))}
          </div>
        </Card>

        {/* manpower today — real muster */}
        <Card onClick={() => router.push("/attendance")}>
          <b style={{ fontSize: 14 }}>👷 Manpower today</b>
          {att === null ? <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Loading…</div> : (
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <div style={{ flex: 1, background: "#eaf7ee", borderRadius: 10, padding: "10px 0", textAlign: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: "var(--green)" }}>{man.present}</div><div className="muted" style={{ fontSize: 11 }}>Present (marked in)</div></div>
              <div style={{ flex: 1, background: "#faf6f1", borderRadius: 10, padding: "10px 0", textAlign: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{man.marked}</div><div className="muted" style={{ fontSize: 11 }}>Attendance records today</div></div>
            </div>
          )}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Tap for the full register →</div>
        </Card>

        {/* pending approvals — live queues */}
        <Card onClick={() => router.push("/m/approvals")}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ fontSize: 14 }}>✅ Pending approvals</b>
            {apprTotal > 0 && <span style={{ background: "var(--red)", color: "#fff", borderRadius: 10, fontSize: 11.5, fontWeight: 800, padding: "1px 8px" }}>{apprTotal}</span>}
          </div>
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {[["🪙 Petty cash requests", appr.petty], ["💳 Expense claims", appr.claims], ["📄 Advance requests", appr.adv], ["🧾 PO drafts (Director)", appr.po]].map(([l, n]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{l}</span><b style={{ color: n > 0 ? "var(--amber)" : "var(--muted)" }}>{n}</b>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>🛒 Open indents</span><b style={{ color: appr.ind > 0 ? "var(--amber)" : "var(--muted)" }}>{appr.ind}</b>
            </div>
          </div>
        </Card>

        {/* expenses summary + site reports — live */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Card onClick={() => router.push("/expenses")}>
            <b style={{ fontSize: 13.5 }}>₹ Expenses</b>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>{claims.length ? inr(money.total) : "…"}</div>
            <div className="muted" style={{ fontSize: 11 }}>approved, all time</div>
            <div style={{ fontSize: 12, marginTop: 6 }}><b style={{ color: money.pending ? "var(--amber)" : "var(--green)" }}>{money.pending}</b> <span className="muted">pending claims</span></div>
          </Card>
          <Card onClick={() => router.push("/dpr")}>
            <b style={{ fontSize: 13.5 }}>📋 Site reports</b>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>{dprMissing === null ? "…" : dprMissing}</div>
            <div className="muted" style={{ fontSize: 11 }}>sites without today's DPR</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Tap for DPR digest →</div>
          </Card>
        </div>

        {/* upcoming projects — real upcoming/idea */}
        {pj.upcoming.length > 0 && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b style={{ fontSize: 14 }}>🔜 Upcoming projects</b>
              <Link href="/projects?tab=upcoming" style={{ fontSize: 12 }}>View all</Link>
            </div>
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {pj.upcoming.map(p => (
                <Link key={p.id} href={"/projects/" + p.id} style={{ textDecoration: "none", color: "var(--text)", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px" }}>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</b>
                    <span className="muted" style={{ fontSize: 11 }}>{p.expected_start ? "Expected: " + p.expected_start : (ST_META[p.status] || [p.status])[0]}</span>
                  </span>
                  <span className="badge" style={{ color: (ST_META[p.status] || [])[1], border: "1px solid currentColor", background: "transparent", flexShrink: 0 }}>{(ST_META[p.status] || [p.status])[0]}</span>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
