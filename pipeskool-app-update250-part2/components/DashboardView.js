"use client";
// update236: extracted from app/dashboard/page.js so the SAME implementation can render either as a
// standalone route (with the app shell) or as a tab inside /home. No iframes, no duplicate
// logic — data loaders, permissions and behaviour are byte-for-byte what shipped in 235.
import { useEffect, useState } from "react";
import { todayLocal } from "@/lib/today";
import { getTodaySummary, getDirectorPulse, inr } from "@/lib/data";
import { isDemo } from "@/lib/supabase";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getTodayQuote, getNotices, getMyReadsAcks } from "@/lib/notices";

export default function DashboardView() {
  const [date, setDate] = useState(() => todayLocal());
  const [s, setS] = useState(null);
  const [quote, setQuote] = useState(null);
  const [topNotices, setTopNotices] = useState([]);
  useEffect(() => {
    getTodayQuote().then(setQuote);
    const sess = getSession();
    if (sess) getNotices(sess).then(async ns => {
      const mine = await getMyReadsAcks(sess.id);
      setTopNotices(ns.slice(0, 4).map(n => ({ ...n, unread: !mine.reads.has(n.id) })));
    });
  }, []);

  useEffect(() => { getTodaySummary(date).then(setS); }, [date]);
  const [pulse, setPulse] = useState(null);
  useEffect(() => { getDirectorPulse().then(setPulse); }, []);

  return (
    <>
        <div className="page-head">
          <h1>Attendance dashboard</h1>
          <div className="filters">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — showing sample data. Connect Supabase to see live site data.</div>}

        {pulse && (
          <div className="cards" style={{ marginBottom: 14 }}>
            <Link href="/expenses" style={{ textDecoration: "none" }}><div className="card" style={pulse.moneyPending ? { borderLeft: "3px solid var(--copper)" } : {}}>
              <div className="label">Money approvals waiting</div>
              <div className="value" style={{ color: pulse.moneyPending ? "var(--copper)" : "var(--green)" }}>{pulse.moneyPending}</div>
              <div className="muted" style={{ fontSize: 11 }}>advances · claims · petty{pulse.retPend ? " · " + pulse.retPend + " cash return(s)" : ""}</div>
            </div></Link>
            <Link href="/procure" style={{ textDecoration: "none" }}><div className="card">
              <div className="label">Procurement</div>
              <div className="value">{pulse.openInd}<span style={{ fontSize: 13, fontWeight: 400 }}> open</span></div>
              <div className="muted" style={{ fontSize: 11 }}>{pulse.pos} PO(s) awaiting delivery</div>
            </div></Link>
            <Link href="/expenses" style={{ textDecoration: "none" }}><div className="card">
              <div className="label">Approved spend today</div>
              <div className="value">{inr(pulse.expToday)}</div>
              <div className="muted" style={{ fontSize: 11 }}>site expenses, all sites</div>
            </div></Link>
            {pulse.pfToday > 0 && (
              <Link href="/attendance" style={{ textDecoration: "none" }}><div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
                <div className="label">Punch failures today</div>
                <div className="value" style={{ color: "var(--red)" }}>{pulse.pfToday}</div>
                <div className="muted" style={{ fontSize: 11 }}>rejected punches — see register banner</div>
              </div></Link>
            )}
            <Link href="/expenses" style={{ textDecoration: "none" }}><div className="card">
              <div className="label">Petty cash in the field</div>
              <div className="value">{inr(pulse.pettyOut)}</div>
              <div className="muted" style={{ fontSize: 11 }}>held across all people</div>
            </div></Link>
          </div>
        )}

        {quote && <div className="panel" style={{ marginBottom: 12, background: "var(--copper-soft)", padding: "10px 14px" }}>
          <span style={{ fontSize: 16, marginRight: 8 }}>💡</span><b style={{ fontSize: 13.5 }}>{quote}</b>
        </div>}
        {topNotices.length > 0 && (
          <div className="panel" style={{ marginBottom: 12, padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>📢 Latest notices</b>
              <Link href="/notices" style={{ fontSize: 12 }}>Open notice board →</Link>
            </div>
            {topNotices.map(n => (
              <div key={n.id} style={{ fontSize: 12.5, padding: "4px 0", borderTop: "1px solid var(--border)", display: "flex", gap: 6, alignItems: "center" }}>
                {n.is_pinned && "📌"}
                <Link href="/notices" style={{ fontWeight: n.unread ? 700 : 400, textDecoration: "none", color: "inherit" }}>{n.title}</Link>
                {n.priority !== "normal" && <span className={"badge " + (n.priority === "important" ? "warn" : "a")} style={{ fontSize: 9.5 }}>{n.priority.toUpperCase()}</span>}
                <span className="muted" style={{ marginLeft: "auto", fontSize: 10.5 }}>{String(n.created_at).slice(0, 10)}</span>
              </div>
            ))}
          </div>
        )}

        {!s ? <div className="muted">Loading…</div> : (
          <>
            <div className="cards">
              <div className="card">
                <div className="label">Present today</div>
                <div className="value">{s.present} <small>/ {s.total}</small></div>
              </div>
              <div className="card">
                <div className="label">Overtime logged</div>
                <div className="value">{s.otHours} <small>hrs</small></div>
              </div>
              <div className="card">
                <div className="label">Proxy punches</div>
                <div className="value" style={{ color: s.proxyPct > 15 ? "var(--red)" : "var(--amber)" }}>{s.proxyPct}%</div>
              </div>
              <div className="card">
                <div className="label">Pending verification</div>
                <div className="value" style={{ color: s.pending > 0 ? "var(--red)" : "var(--green)" }}>{s.pending}</div>
              </div>
            </div>

            <div className="panel">
              <h2>Site-wise strength today</h2>
              <table>
                <thead>
                  <tr>
                    <th>Site</th><th>Supervisor</th>
                    <th className="num">Present</th><th className="num">Half</th>
                    <th className="num">Absent</th><th className="num">Proxy</th>
                    <th style={{ width: "26%" }}>Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {s.sites.map(site => {
                    const tot = site.p + site.h + site.a;
                    const pct = tot ? Math.round((site.p / tot) * 100) : 0;
                    return (
                      <tr key={site.name}>
                        <td style={{ fontWeight: 600 }}>{site.name}</td>
                        <td className="muted">{site.sup}</td>
                        <td className="num"><span className="badge p">{site.p}</span></td>
                        <td className="num"><span className="badge h">{site.h}</span></td>
                        <td className="num"><span className="badge a">{site.a}</span></td>
                        <td className="num">{site.proxy > 3
                          ? <span className="badge warn">{site.proxy} ⚠</span>
                          : <span className="badge gray">{site.proxy}</span>}</td>
                        <td>
                          <div className="bar-track"><div className="bar-fill" style={{ width: pct + "%" }} /></div>
                          <div className="muted" style={{ marginTop: 3 }}>{pct}% present</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
    </>
  );
}
