"use client";
// update236: HOME OVERVIEW — the 229 premium dashboard, extracted out of /m/dashboard so
// that /home (desktop) and /m/dashboard (phone) render the SAME component. No iframes.
// The greeting bar / View-as picker now live in HomeHeader (parent owns asSite), because on
// desktop they sit above the Home tab strip and must survive tab switches.
// Same live loaders, routes and permissions as 229/230 — nothing invented, nothing removed.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { approvalRights } from "@/lib/perms";
import { getSites, getAttendance, getWorkers } from "@/lib/data";
import { getProjects } from "@/lib/projects";
import { getPettyRequestQueue, getAdvanceQueue, getExpenseClaimQueue, inr } from "@/lib/money";
import { getPOs, getOpenIndents } from "@/lib/procure";
import { getDigest } from "@/lib/dpr";
import { todayLocal } from "@/lib/today";
import { getTasks, groupTasks, setTaskStatus, PRIORITY_META, TASK_ST } from "@/lib/tasks";

const ST_META = { active: ["Active", "#15803d"], upcoming: ["Upcoming", "#6b46c1"], on_hold: ["On hold", "#b45309"], delayed: ["Delayed", "#b91c1c"], completed: ["Completed", "#2b6cb0"], idea: ["Idea", "#6b7280"] };
const NAVY = "#0F1A2E", NAVY2 = "#16233d", COPPER = "#e07020";
const arr = x => Array.isArray(x) ? x : (x?.rows || []);
const crore = n => { const v = Number(n) || 0; return v >= 1e7 ? "₹" + (v / 1e7).toFixed(2) + " Cr" : v >= 1e5 ? "₹" + (v / 1e5).toFixed(2) + " L" : inr(v); };

/* ---- shared design-system pieces (module scope — never redefined per render) ---- */
function Ring({ pct, label }) {
  const p = Math.max(0, Math.min(Number(pct) || 0, 100)), R = 30, C = 2 * Math.PI * R;
  return (
    <svg width="78" height="78" viewBox="0 0 78 78" style={{ flexShrink: 0 }}>
      <circle cx="39" cy="39" r={R} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="7" />
      <circle cx="39" cy="39" r={R} fill="none" stroke={COPPER} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={(C * p / 100) + " " + C} transform="rotate(-90 39 39)" />
      <text x="39" y="38" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="800">{Math.round(p)}%</text>
      <text x="39" y="50" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="7.5">{label}</text>
    </svg>
  );
}
function Pill({ tone, children }) {
  const c = { green: ["#0f3d24", "#4ade80"], amber: ["#3d2f0f", "#fbbf24"], red: ["#3d1414", "#f87171"] }[tone] || ["#26324a", "#cbd5e1"];
  return <span style={{ background: c[0], color: c[1], borderRadius: 999, padding: "4px 11px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>● {children}</span>;
}
function HeroStat({ ico, label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, letterSpacing: 0.6, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ico} {label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginTop: 1 }}>{value}</div>
    </div>
  );
}
function Section({ title, action, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 9, gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
function Tile({ ico, label, badge, href, onClick }) {
  const inner = (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, padding: "13px 6px 10px", textAlign: "center", position: "relative", boxShadow: "0 2px 8px rgba(15,26,46,0.05)", cursor: "pointer", height: "100%" }}>
      <span style={{ display: "inline-flex", width: 42, height: 42, borderRadius: 13, background: "#f6f2ec", alignItems: "center", justifyContent: "center", fontSize: 19 }}>{ico}</span>
      {badge > 0 && <span style={{ position: "absolute", top: 7, right: 9, background: "var(--red)", color: "#fff", borderRadius: 9, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{badge}</span>}
      <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 6, lineHeight: 1.2 }}>{label}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none", color: "var(--text)" }}>{inner}</Link> : <div onClick={onClick}>{inner}</div>;
}
function TrioCard({ v, l, color }) {
  return (
    <div style={{ flex: 1, minWidth: 96, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "11px 12px" }}>
      <div style={{ fontSize: 21, fontWeight: 800, color: color || "var(--text)" }}>{v}</div>
      <div className="muted" style={{ fontSize: 11 }}>{l}</div>
    </div>
  );
}
function WeekChart({ data }) {
  const max = Math.max.apply(null, data.map(d => d.n).concat([1]));
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 10px 8px", marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 112 }}>
        {data.map(d => (
          <div key={d.date} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 9.5, color: "var(--muted)", marginBottom: 2 }}>{d.n}</div>
            <div title={d.date + ": " + d.n} style={{ height: Math.max(Math.round(d.n / max * 78), 3), borderRadius: "5px 5px 0 0", background: "linear-gradient(180deg, #4c7a99, #2f5470)" }} />
            <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3 }}>{d.day}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function ApprovalRow({ ico, title, sub, count, href }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "var(--text)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "11px 13px", marginBottom: 8 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: "#fdf1e7", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{ico}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 13.5, display: "block" }}>{title}</b>
          <span className="muted" style={{ fontSize: 11.5 }}>{sub}</span>
        </span>
        <b style={{ fontSize: 16, color: count > 0 ? COPPER : "var(--muted)" }}>{count}</b>
        <span style={{ fontSize: 15, color: "var(--muted)" }}>›</span>
      </div>
    </Link>
  );
}
function GlanceCard({ label, value, foot, footColor, href }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "var(--text)", flex: 1, minWidth: 150 }}>
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, padding: 14, height: "100%" }}>
        <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
        <div style={{ fontSize: 21, fontWeight: 800, margin: "3px 0 2px" }}>{value}</div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: footColor || COPPER }}>{foot}</div>
      </div>
    </Link>
  );
}

/* update237: the four page cards that replaced the top tab strip. Module scope. */
function PageCard({ ico, title, desc, href, current, onClick }) {
  const inner = (
    <div style={{ background: "#fff", border: "1px solid " + (current ? "var(--copper)" : "var(--border)"), borderRadius: 16, padding: "18px 18px 16px",
        display: "flex", flexDirection: "column", gap: 7, height: "100%", cursor: "pointer", boxShadow: "0 2px 10px rgba(15,26,46,0.05)" }}>
      <span style={{ width: 46, height: 46, borderRadius: 14, background: "#f6f2ec", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{ico}</span>
      <b style={{ fontSize: 15.5 }}>{title}</b>
      <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45, flex: 1 }}>{desc}</span>
      <span style={{ color: current ? "var(--muted)" : "var(--copper)", fontWeight: 800, fontSize: 12.5 }}>{current ? "You are here — back to top ↑" : "Open →"}</span>
    </div>
  );
  return current
    ? <div onClick={onClick}>{inner}</div>
    : <Link href={href} style={{ textDecoration: "none", color: "var(--text)" }}>{inner}</Link>;
}

export default function HomeDashboard({ mode = "mobile", asSite = null, setAsSite = () => {}, onOpenProjects = null, onSites = null, showPageCards = false }) {
  const desk = mode === "desk";
  // update236: on desktop, every link goes to the real DESKTOP route; only phones use /m/*.
  const R = (m, d) => desk ? d : m;

  const [sess, setSess] = useState(null);
  const [sites, setSites] = useState([]);
  const [projects, setProjects] = useState(null);
  const [att, setAtt] = useState(null);
  const [week, setWeek] = useState([]);
  const [workers, setWorkers] = useState(null);
  const [pettyQ, setPettyQ] = useState([]);
  const [advQ, setAdvQ] = useState([]);
  const [claims, setClaims] = useState([]);
  const [pos, setPos] = useState([]);
  const [indents, setIndents] = useState([]);
  const [digest, setDigest] = useState(null);
  const [panel, setPanel] = useState(null);       // project explorer (mobile only — kept from 228)
  const [expId, setExpId] = useState(null);
  const [tasks, setTasks] = useState(null);

  // on desktop the Projects TAB owns projects; on the phone the inline explorer does
  const openProjects = () => { if (onOpenProjects) onOpenProjects(); else setPanel("all"); };

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setSess(s);
    getSites().then(r => { const rows = arr(r); setSites(rows); if (onSites) onSites(rows); });
    getProjects().then(r => setProjects(arr(r)));
    getAttendance(todayLocal(), "all").then(r => setAtt(arr(r))).catch(() => setAtt([]));
    getWorkers().then(r => setWorkers(arr(r))).catch(() => setWorkers([]));
    getPettyRequestQueue().then(r => setPettyQ(arr(r))).catch(() => {});
    getAdvanceQueue().then(r => setAdvQ(arr(r))).catch(() => {});
    getExpenseClaimQueue().then(r => setClaims(arr(r))).catch(() => {});
    getPOs("all").then(r => setPos(arr(r))).catch(() => {});
    getOpenIndents("all").then(r => setIndents(arr(r))).catch(() => {});
    getDigest(todayLocal()).then(r => setDigest(arr(r))).catch(() => setDigest([]));
    getTasks().then(r => setTasks(arr(r))).catch(() => setTasks([]));
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const key = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    Promise.all(days.map(d => getAttendance(key(d), "all").then(r => arr(r)).catch(() => [])))
      .then(lists => setWeek(days.map((d, i) => ({ day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], date: key(d), rows: lists[i] }))));
    if (desk) return;
    const openFromHash = () => { if (window.location.hash === "#projects") setPanel("all"); };
    openFromHash(); window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const isDirector = sess?.role === "director";
  // update238: same rights object the Approvals inbox uses — no second opinion on this page
  const rights = approvalRights(sess);
  const viewSiteId = isDirector ? asSite : (sess?.currentSite || sess?.sites?.[0]?.id || null);
  const companyView = isDirector && !asSite;

  const pj = useMemo(() => {
    const all = projects || [];
    const live = all.filter(p => ["active", "on_hold", "delayed"].includes(p.status));
    const withPct = live.filter(p => p.progress !== null && p.progress !== undefined);
    return { all, live, total: all.length,
      active: all.filter(p => p.status === "active").length,
      hold: all.filter(p => p.status === "on_hold").length,
      delayed: all.filter(p => p.status === "delayed").length,
      done: all.filter(p => p.status === "completed").length,
      avg: withPct.length ? Math.round(withPct.reduce((t, p) => t + p.progress, 0) / withPct.length) : 0,
      contract: all.reduce((t, p) => t + Number(p.contract_value || 0), 0),
      invoiced: all.reduce((t, p) => t + Number(p.invoiced || 0), 0),
      deadline: live.map(p => p.end_date).filter(Boolean).sort()[0] || null,
      site: all.find(p => String(p.id) === String(viewSiteId)) || null };
  }, [projects, viewSiteId]);

  const inSite = rows => companyView ? rows : rows.filter(r => String(r.site_id) === String(viewSiteId));
  const presentCount = rows => rows.filter(r => (r.in && r.in !== "—") || r.status === "present" || r.status === "half_day").length;

  const man = useMemo(() => {
    const rows = companyView ? (att || []) : (att || []).filter(r => String(r.site_id) === String(viewSiteId));
    const roll = companyView ? (workers || []).length : (workers || []).filter(w => String(w.site_id) === String(viewSiteId)).length;
    const inNow = presentCount(rows);
    return { roll, inNow, absent: Math.max(rows.length - inNow, 0), pct: roll ? Math.round(inNow / roll * 1000) / 10 : 0 };
  }, [att, workers, viewSiteId, companyView]);

  const weekData = useMemo(() => week.map(d => ({ day: d.day, date: d.date,
    n: presentCount(companyView ? d.rows : d.rows.filter(r => String(r.site_id) === String(viewSiteId))) })), [week, viewSiteId, companyView]);

  const appr = useMemo(() => ({
    po: pos.filter(p => p.approval === "pending" && p.status !== "cancelled").length,
    adv: advQ.filter(r => r.status === "pending").length,
    claims: inSite(claims).filter(r => r.status === "pending" || r.status === "queried").length,
    petty: pettyQ.filter(r => r.status === "pending").length,
    ind: companyView ? indents.length : indents.filter(i => String(i.site_id) === String(viewSiteId)).length,
  }), [pos, advQ, claims, pettyQ, indents, viewSiteId, companyView]);   // eslint-disable-line react-hooks/exhaustive-deps
  const apprTotal = appr.po + appr.adv + appr.claims + appr.petty + appr.ind;

  const expApproved = inSite(claims).filter(c => c.status === "approved").reduce((t, c) => t + Number(c.amount || 0), 0);
  const expPending = inSite(claims).filter(c => c.status === "pending").reduce((t, c) => t + Number(c.amount || 0), 0);
  const dprFiled = new Set((digest || []).map(d => d.site));
  const dprMissing = sites.filter(s => s.is_active !== false && !dprFiled.has(s.name));
  const siteName = sites.find(s => String(s.id) === String(viewSiteId))?.name
    || (sess?.sites || []).find(s => String(s.id) === String(viewSiteId))?.name || "";

  const panelRows = useMemo(() => {
    const all = pj.all;
    if (panel === "active") return all.filter(p => p.status === "active");
    if (panel === "hold") return all.filter(p => p.status === "on_hold" || p.status === "delayed");
    if (panel === "completed") return all.filter(p => p.status === "completed");
    if (panel === "upcoming") return all.filter(p => p.status === "upcoming" || p.status === "idea");
    return all;
  }, [pj, panel]);

  // ---- update230: tasks on Home (auto = computed live; assigned = real rows) ----
  const grp = useMemo(() => groupTasks(tasks || []), [tasks]);
  const myTasks = useMemo(() => grp.overdue.concat(grp.today).slice(0, 6), [grp]);
  async function completeTask(t) {
    const r = await setTaskStatus(t.id, "completed", null, sess?.name, t.title);
    if (r.ok) getTasks().then(x => setTasks(arr(x)));
  }
  const autoTasks = useMemo(() => {
    if (!sess) return [];
    const out = [];
    if (companyView) {
      out.push({ ico: "🧾", name: "PO draft approvals", tag: "Daily", desc: "Review and approve pending purchase orders",
        stats: [["Pending", appr.po]], done: appr.po === 0, href: "/procure", cta: "Review POs" });
      if (rights.money) out.push({ ico: "✅", name: "Approvals sweep", tag: "Daily", desc: "Petty cash · expenses · advances",
        stats: [["Petty", appr.petty], ["Claims", appr.claims], ["Adv", appr.adv]], done: appr.petty + appr.claims + appr.adv === 0, href: R("/m/approvals", "/approvals"), cta: "View approvals" });
      out.push({ ico: "📋", name: "Site reports follow-up", tag: "Daily", desc: "Sites without today's DPR",
        stats: [["Missing", dprMissing.length]], done: dprMissing.length === 0, href: "/dpr", cta: "DPR digest" });
    } else {
      out.push({ ico: "🧑‍🤝‍🧑", name: "Attendance check", tag: "Morning", desc: "Verify today's punch-ins for your site",
        stats: [["In", man.inNow], ["Absent", man.absent]], done: man.inNow > 0 && man.absent === 0, href: "/attendance", cta: "Check attendance" });
      out.push({ ico: "📝", name: "DPR submission", tag: "Evening", desc: "Submit today's Daily Progress Report",
        stats: [["Filed", dprFiled.has(siteName) ? "Yes" : "No"]], done: dprFiled.has(siteName), href: R("/m/dpr", "/dpr"), cta: "Submit DPR" });
      out.push({ ico: "🛒", name: "Open indents", tag: "Material", desc: "Material requests awaiting action",
        stats: [["Open", appr.ind]], done: appr.ind === 0, href: "/procure", cta: "Review indents" });
    }
    return out;
  }, [sess, companyView, appr, dprMissing, man, siteName, rights.money]);   // eslint-disable-line react-hooks/exhaustive-deps
  const taskPending = autoTasks.filter(t => !t.done).length + myTasks.filter(t => t.status !== "completed").length;

  // update238: view_all_money holders get the tile too — read-only inbox, no actions inside
  const apprTile = rights.open ? [["✅", "Approvals", R("/m/approvals", "/approvals"), apprTotal]] : [];
  const dirTiles = [...apprTile, ["💰", "Finance", "/expenses", 0], ["📊", "Analytics", R("/m/report", "/reports"), 0], ["🏗", "All Sites", null, 0],
    ["🏢", "Vendors", "/vendors", 0], ["👥", "Team & HR", "/workers", 0], ["🗒", "Assign Task", "/tasks", 0], ["⚙", "Admin", "/admin", 0]];
  const staffTiles = [["📁", "Projects", null, 0], ["👷", "Muster", R("/m/muster", "/attendance"), 0], ...apprTile, ["📦", "Stock", R("/m/stock", "/stock"), 0],
    ["💳", "Expenses", R("/m/money", "/expenses"), appr.claims], ["🗒", "Tasks", null, 0], ["📋", "Reports", R("/m/report", "/reports"), 0], ["🛒", "Indents", "/procure", appr.ind]];
  const tiles = companyView ? dirTiles : staffTiles;

  if (!sess) return null;

  return (
    <div style={{ background: "var(--bg)", minHeight: desk ? 0 : "100dvh", paddingBottom: desk ? 24 : "calc(86px + env(safe-area-inset-bottom))" }}>
      <div style={{ padding: desk ? "18px 28px 0" : "14px 12px 0", maxWidth: desk ? "none" : 1100, margin: desk ? 0 : "0 auto" }}>
        <div style={{ background: "linear-gradient(140deg, " + NAVY + " 0%, " + NAVY2 + " 100%)", color: "#fff", borderRadius: 18, padding: 17, boxShadow: "0 10px 26px rgba(15,26,46,0.28)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 1.1, color: COPPER, fontWeight: 800, textTransform: "uppercase" }}>{companyView ? "Company portfolio" : "Active site"}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 3, lineHeight: 1.15 }}>
                {projects === null ? "…" : companyView ? (pj.active + pj.hold + pj.delayed) + " Active Sites" : (siteName || "Your site")}</div>
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>↗ {companyView ? pj.total + " projects on record" : (pj.site?.client_name || "Pipeskool project")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                {companyView ? (<>
                  <Pill tone="green">{pj.active} on schedule</Pill>
                  {pj.hold > 0 && <Pill tone="amber">{pj.hold} on hold</Pill>}
                  {pj.delayed > 0 && <Pill tone="red">{pj.delayed} delayed</Pill>}
                </>) : <Pill tone={pj.site?.status === "delayed" ? "red" : pj.site?.status === "on_hold" ? "amber" : "green"}>{(ST_META[pj.site?.status] || ["Active"])[0]}</Pill>}
              </div>
            </div>
            <Ring pct={companyView ? pj.avg : (pj.site?.progress || 0)} label={companyView ? "AVG" : "COMPLETE"} />
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.14)", margin: "14px 0 12px" }} />
          <div style={{ display: "grid", gridTemplateColumns: desk ? "repeat(4, 1fr)" : "1fr 1fr", gap: 13 }}>
            <HeroStat ico="₹" label={companyView ? "Total contract value" : "Contract value"} value={crore(companyView ? pj.contract : (pj.site?.contract_value || 0))} />
            <HeroStat ico="↗" label="Billed to date" value={crore(companyView ? pj.invoiced : (pj.site?.invoiced || 0))} />
            <HeroStat ico="🗓" label={companyView ? "Nearest deadline" : "Target finish"} value={(companyView ? pj.deadline : pj.site?.end_date) || "—"} />
            <HeroStat ico="👥" label={companyView ? "Total workforce" : "Workforce"} value={workers === null ? "…" : man.roll + " on roll"} />
          </div>
        </div>

        {companyView && (
          <Section title="Sites overview" action={<a onClick={openProjects} style={{ fontSize: 12.5, color: COPPER, fontWeight: 700, cursor: "pointer" }}>View all {pj.total} →</a>}>
            <div style={{ display: "flex", gap: 9, overflowX: "auto", paddingBottom: 4 }}>
              {pj.live.map(p => { const sm = ST_META[p.status] || ["Active", "#15803d"]; return (
                <div key={p.id} onClick={() => { setAsSite(Number(p.id)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  style={{ flexShrink: 0, minWidth: 178, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "11px 13px", cursor: "pointer", boxShadow: "0 2px 8px rgba(15,26,46,0.05)" }}>
                  <b style={{ fontSize: 13, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</b>
                  <span style={{ fontSize: 11, color: sm[1], fontWeight: 700 }}>● {sm[0]}{p.progress !== null && p.progress !== undefined ? " · " + p.progress + "%" : ""}</span>
                </div>
              ); })}
              {pj.live.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No active sites.</div>}
            </div>
          </Section>
        )}

        <Section title="Quick access">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))", gap: 9 }}>
            {tiles.map(([ico, label, href, badge]) => (
              <Tile key={label} ico={ico} label={label} badge={badge} href={href || undefined}
                onClick={href ? undefined : () => label === "Tasks"
                  ? document.getElementById("home-tasks")?.scrollIntoView({ behavior: "smooth", block: "start" })
                  : openProjects()} />
            ))}
          </div>
        </Section>

        {/* update230: TASKS ON HOME — the separate Tasks tab is gone; everything lives here.
            Auto tasks are computed live from the same operational data (never stored). */}
        <div id="home-tasks" />
        <Section title="My tasks today"
          action={<span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {taskPending > 0 && <span style={{ background: "var(--red)", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 11.5, fontWeight: 800 }}>{taskPending} pending</span>}
            <Link href="/tasks" style={{ fontSize: 12.5, color: COPPER, fontWeight: 700 }}>{isDirector ? "Assign / all →" : "All tasks →"}</Link>
          </span>}>
          <div style={{ display: "grid", gap: 9 }}>
            {autoTasks.map((t, i) => (
              <div key={"a" + i} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 13, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", minWidth: 0, overflowWrap: "anywhere" }}>
                <span style={{ width: 38, height: 38, borderRadius: 12, background: "#f6f2ec", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{t.ico}</span>
                <span style={{ flex: "1 1 150px", minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{t.name}</b> <span className="badge gray" style={{ fontSize: 9.5 }}>{t.tag}</span>
                  <div className="muted" style={{ fontSize: 11.5 }}>{t.desc}</div>
                </span>
                <span style={{ display: "flex", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
                  {t.stats.map(([l2, v2]) => <span key={l2} style={{ textAlign: "center" }}><span className="muted" style={{ fontSize: 9.5, display: "block" }}>{l2}</span><b style={{ fontSize: 14 }}>{v2}</b></span>)}
                </span>
                <span style={{ textAlign: "right", marginLeft: "auto" }}>
                  <span className="badge" style={{ color: t.done ? "var(--green)" : COPPER, border: "1px solid currentColor", background: "transparent", fontWeight: 800 }}>{t.done ? "✓ Done" : "Pending"}</span>
                  {!t.done && <Link href={t.href}><button type="button" style={{ display: "block", marginTop: 5, background: NAVY, color: "#fff", border: "none", borderRadius: 9, padding: "7px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{t.cta}</button></Link>}
                </span>
              </div>
            ))}
            {myTasks.map(t => { const pm = PRIORITY_META[t.priority] || PRIORITY_META.normal; const st = TASK_ST[t.status] || ["Pending", "gray"]; return (
              <div key={t.id} style={{ background: "#fff", border: "1px solid var(--border)", borderLeft: "4px solid " + pm[1], borderRadius: 14, padding: 13, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", minWidth: 0, overflowWrap: "anywhere" }}>
                <span style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{t.title}</b> <span className="badge" style={{ fontSize: 9.5, color: pm[1], border: "1px solid " + pm[1], background: "transparent" }}>{pm[0]}</span>
                  {t.description && <div className="muted" style={{ fontSize: 11.5 }}>{t.description}</div>}
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{isDirector && t.assignee ? "→ " + t.assignee + " · " : ""}{t.due_at ? "⏰ " + String(t.due_at).slice(0, 16).replace("T", " ") : "No due date"}</div>
                </span>
                <span className={"badge " + st[1]} style={{ flexShrink: 0 }}>{st[0]}</span>
                {t.status !== "completed" && (
                  <button type="button" onClick={() => completeTask(t)} style={{ flexShrink: 0, background: "var(--green)", color: "#fff", border: "none", borderRadius: 9, padding: "7px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>✓ Done</button>
                )}
              </div>
            ); })}
            {autoTasks.length + myTasks.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>{tasks === null ? "Loading tasks…" : "Nothing due today. 🎉"}</div>}
          </div>
        </Section>

        <Section title={companyView ? "Manpower — company wide" : "Manpower today"}
          action={<Link href="/attendance" style={{ fontSize: 12.5, color: COPPER, fontWeight: 700 }}>Full register →</Link>}>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <TrioCard v={att === null ? "…" : man.inNow} l="Marked in today" />
            <TrioCard v={att === null ? "…" : man.absent} l="Absent" color="var(--red)" />
            <TrioCard v={man.pct + "%"} l="Deployment" color="var(--green)" />
          </div>
          {weekData.length > 0 && <WeekChart data={weekData} />}
        </Section>

        {/* update238: each row appears only if this person may actually act on it. Open indents
            is NOT an approval — it is a work queue — so it stays for everyone who sees indents. */}
        {(rights.open || appr.ind > 0) && (
          <Section title={rights.any ? "Pending approvals" : rights.moneyView ? "Pending approvals · view only" : "Pending with you"} action={apprTotal > 0 && rights.open ? <span style={{ background: COPPER, color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>{apprTotal}</span> : null}>
            {companyView && rights.indent && <ApprovalRow ico="🧾" title="PO draft approvals" sub="Awaiting your approval" count={appr.po} href="/procure" />}
            {companyView && rights.moneyView && <ApprovalRow ico="₹" title="Advance salary requests" sub="Across all sites" count={appr.adv} href="/expenses" />}
            {rights.moneyView && <ApprovalRow ico="🪙" title="Petty cash requests" sub={companyView ? "Across all sites" : siteName} count={appr.petty} href={R("/m/approvals", "/approvals")} />}
            {rights.moneyView && <ApprovalRow ico="💳" title="Expense claims" sub={companyView ? "Across all sites" : siteName} count={appr.claims} href={R("/m/approvals", "/approvals")} />}
            <ApprovalRow ico="🛒" title={companyView && rights.indent ? "Indent approvals" : "Open indents"} sub="Material pending" count={appr.ind} href="/procure" />
          </Section>
        )}

        {showPageCards && (
          <Section title="Go to">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
              <PageCard ico="🏠" title="Home" desc="Overview of sites, tasks and important updates." current
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
              <PageCard ico="📁" title="Projects" desc="Manage and track projects." href="/projects" />
              <PageCard ico="📊" title="Dashboard" desc="View analytics and key site metrics." href="/dashboard" />
              <PageCard ico="📋" title="Site Reports" desc="View and analyze site reports." href="/reports" />
            </div>
          </Section>
        )}

        <Section title="Today at a glance">
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <GlanceCard label="Expenses approved" value={inr(expApproved)} foot={inr(expPending) + " pending"} href="/expenses" />
            {companyView
              ? <GlanceCard label="Sites without DPR" value={dprMissing.length + " today"} foot="Open DPR digest →" footColor={dprMissing.length ? "var(--red)" : "var(--green)"} href="/dpr" />
              : <GlanceCard label="My DPR status" value={dprFiled.has(siteName) ? "Filed ✓" : "Pending"} foot={dprFiled.has(siteName) ? "Submitted today" : "Submit today's DPR →"} footColor={dprFiled.has(siteName) ? "var(--green)" : "var(--red)"} href={R("/m/dpr", "/dpr")} />}
          </div>
        </Section>
      </div>

      {!desk && panel && (
        <div style={{ position: "fixed", left: 0, right: 0, top: 0, bottom: "calc(62px + env(safe-area-inset-bottom))", background: "var(--bg)", zIndex: 60, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "linear-gradient(115deg, " + NAVY + ", " + NAVY2 + ")", color: "#fff", padding: "calc(10px + env(safe-area-inset-top)) 14px 12px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button type="button" onClick={() => { setPanel(null); setExpId(null); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← Back</button>
            <b style={{ fontSize: 15, flex: 1 }}>📁 Projects</b>
            <button type="button" onClick={() => { setPanel(null); setExpId(null); }} style={{ background: "none", border: "none", color: "#fff", fontSize: 17, cursor: "pointer", padding: 6 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "10px 12px 4px", overflowX: "auto", flexShrink: 0 }}>
            {[["all", "All", pj.total], ["active", "Active", pj.active], ["hold", "On hold", pj.hold + pj.delayed], ["completed", "Completed", pj.done], ["upcoming", "Upcoming", pj.all.filter(p => p.status === "upcoming" || p.status === "idea").length]].map(([k, l, n]) => (
              <button key={k} type="button" onClick={() => { setPanel(k); setExpId(null); }}
                style={{ flexShrink: 0, borderRadius: 999, padding: "7px 13px", fontSize: 12.5, fontWeight: panel === k ? 800 : 600, cursor: "pointer",
                  border: panel === k ? "2px solid var(--copper)" : "1px solid var(--border)", background: panel === k ? "#fff8f2" : "#fff", color: panel === k ? "var(--copper)" : "var(--text)" }}>
                {l} · {n}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px 16px", display: "grid", gap: 10, alignContent: "start", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 12, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12 }}><span className="muted">Contract</span><br /><b>{crore(pj.contract)}</b></span>
              <span style={{ fontSize: 12, textAlign: "right" }}><span className="muted">Invoiced (RA bills)</span><br /><b style={{ color: "var(--green)" }}>{crore(pj.invoiced)}</b></span>
            </div>
            {panelRows.map(p => { const open2 = expId === p.id; const sm = ST_META[p.status] || [p.status, "#6b7280"]; return (
              <div key={p.id} onClick={() => setExpId(open2 ? null : p.id)} style={{ background: "#fff", border: "1px solid var(--border)", padding: 13, borderRadius: 14, borderLeft: "4px solid " + sm[1], cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <b style={{ fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</b>
                  <span className="badge" style={{ color: sm[1], border: "1px solid currentColor", background: "transparent", flexShrink: 0 }}>{sm[0]}</span>
                </div>
                {p.client_name && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>👤 {p.client_name}</div>}
                {p.progress !== null && p.progress !== undefined && (
                  <div style={{ marginTop: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span className="muted">Progress</span><b>{p.progress}%</b></div>
                    <div style={{ height: 7, background: "#f0ece6", borderRadius: 4, marginTop: 2 }}><div style={{ width: Math.min(p.progress, 100) + "%", height: 7, borderRadius: 4, background: COPPER }} /></div>
                  </div>
                )}
                {open2 && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <span><span className="muted">Start</span><br /><b>{p.start_date || "—"}</b></span>
                      <span><span className="muted">End</span><br /><b>{p.end_date || "—"}</b></span>
                      <span><span className="muted">Contract</span><br /><b>{p.contract_value ? crore(p.contract_value) : "—"}</b></span>
                      <span><span className="muted">Invoiced</span><br /><b>{crore(p.invoiced || 0)}</b></span>
                      <span><span className="muted">RA bills</span><br /><b>{p.bills || 0}</b></span>
                      {p.expected_start && <span><span className="muted">Expected start</span><br /><b>{p.expected_start}</b></span>}
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                      <Link href={"/projects/" + p.id} onClick={e => e.stopPropagation()} style={{ color: COPPER, fontWeight: 800, fontSize: 12.5 }}>Open full workspace →</Link>
                      {isDirector && <a onClick={e => { e.stopPropagation(); setAsSite(Number(p.id)); setPanel(null); }} style={{ color: "#2b6cb0", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>👁 View as site manager</a>}
                    </div>
                  </div>
                )}
                <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>{open2 ? "Tap to collapse ▲" : "Tap for details ▼"}</div>
              </div>
            ); })}
            {panelRows.length === 0 && <div className="muted" style={{ padding: 20, textAlign: "center" }}>No projects in this filter.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
