"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MobileNav from "@/components/MobileNav";
import { getDirectorReport, inr } from "@/lib/reports";
import { getSession } from "@/lib/auth";

const COL = { present: "#1a7f4f", half: "#e0a400", onsite: "#8a96a0", proxy: "#FF7A1A" };
const DL = { pending: "Awaiting", confirmed: "Confirmed", delayed: "Delayed", dispatched: "Out for delivery" };

export default function MobileReport() {
  const [days, setDays] = useState(7);
  const [siteId, setSiteId] = useState("all");
  const [r, setR] = useState(null);
  const [open, setOpen] = useState({});   // siteId -> expanded
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const sess = typeof window !== "undefined" ? getSession() : null;

  useEffect(() => {
    if (!sess) { router.push("/login"); return; }
    setLoading(true);
    getDirectorReport(days).then(d => { setR(d); setLoading(false); });
  }, [days]);

  const mySiteIds = sess?.role === "director" ? null : (sess?.sites || []).map(s => String(s.id));
  const allowed = (r?.sites || []).filter(s => !mySiteIds || mySiteIds.includes(String(s.id)));

  const view = useMemo(() => {
    if (!r) return null;
    const sites = siteId === "all" ? allowed : allowed.filter(s => String(s.id) === String(siteId));
    const T = sites.reduce((x, s) => ({
      strength: x.strength + s.strength, ystrength: x.ystrength + s.ystrength, ot: x.ot + s.ot,
      proxy: x.proxy + s.proxy, verify: x.verify + s.pendingVerify, exp: x.exp + s.expenses,
      indents: x.indents + s.indents.length, aged: x.aged + s.indents.filter(i => i.age >= 3).length,
      delayed: x.delayed + s.deliv.delayed,
      transit: x.transit + s.deliv.pending + s.deliv.confirmed + s.deliv.delayed + s.deliv.dispatched,
      dprDone: x.dprDone + (s.dpr === "submitted" ? 1 : 0),
    }), { strength: 0, ystrength: 0, ot: 0, proxy: 0, verify: 0, exp: 0, indents: 0, aged: 0, delayed: 0, transit: 0, dprDone: 0 });
    const trend = r.trend.map(p => ({ date: p.date,
      total: siteId === "all" ? sites.reduce((n, s) => n + (p.bySite[s.id] || 0), 0) : (p.bySite[siteId] || 0) }));
    const alerts = [];
    sites.forEach(s => { if (s.dpr === "missing") alerts.push(`❌ ${s.short}: DPR not filed`); });
    if (T.delayed) alerts.push(`🚚 ${T.delayed} delivery marked DELAYED`);
    if (T.aged) alerts.push(`⏳ ${T.aged} indent waiting 3+ days`);
    if (T.proxy) alerts.push(`⚠ ${T.proxy} proxy punch today`);
    if (T.verify) alerts.push(`🕓 ${T.verify} attendance pending verification`);
    return { sites, T, trend, alerts, delta: T.strength - T.ystrength };
  }, [r, siteId]);

  const card = { background: "#fff", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--border)", marginBottom: 10 };

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div style={{ flex: 1 }}>
          <div className="title">Site report</div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <select value={siteId} onChange={e => setSiteId(e.target.value)}
              style={{ fontSize: 12, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "3px 8px" }}>
              <option value="all" style={{ color: "#000" }}>{sess?.role === "director" ? "All sites" : "All my sites"}</option>
              {allowed.map(s => <option key={s.id} value={s.id} style={{ color: "#000" }}>{s.short}</option>)}
            </select>
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              style={{ fontSize: 12, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "3px 8px" }}>
              <option value={7} style={{ color: "#000" }}>7 days</option>
              <option value={30} style={{ color: "#000" }}>30 days</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 14px 80px" }}>
        {loading ? <div className="muted">Loading…</div> : !view ? <div className="muted">No data.</div> : (
          <>
            {/* attention strip */}
            <div style={{ ...card, borderLeft: "4px solid " + (view.alerts.length ? "var(--red)" : "#1a7f4f") }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{view.alerts.length ? "Needs your attention" : "All clear ✓"}</div>
              {view.alerts.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>DPR filed, deliveries on track, nothing pending.</div> :
                view.alerts.map((a, i) => <div key={i} style={{ fontSize: 12.5, padding: "2px 0" }}>{a}</div>)}
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[
                ["Manpower", view.T.strength, view.delta === 0 ? "same as yday" : (view.delta > 0 ? "▲ +" : "▼ ") + view.delta + " vs yday"],
                ["DPR filed", view.T.dprDone + "/" + view.sites.length, "today"],
                ["OT today", view.T.ot.toFixed(1) + "h", view.T.proxy + " proxy"],
                ["Open indents", view.T.indents, view.T.aged + " aged 3d+"],
                ["In transit", view.T.transit, view.T.delayed + " delayed"],
                ["Month spend", inr(view.T.exp), "appr + pending"],
              ].map(([l, v, sub]) => (
                <div key={l} style={{ background: "#fff", borderRadius: 10, padding: "9px 11px", border: "1px solid var(--border)" }}>
                  <div className="muted" style={{ fontSize: 10 }}>{l}</div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div>
                  <div className="muted" style={{ fontSize: 9.5 }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* trend mini bars */}
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>Manpower — last {days} days</div>
              <div style={{ display: "flex", gap: days > 10 ? 2 : 6, alignItems: "flex-end", height: 66 }}>
                {view.trend.map(p => {
                  const max = Math.max(...view.trend.map(x => x.total), 1);
                  return (
                    <div key={p.date} style={{ flex: 1, textAlign: "center" }}>
                      {days <= 10 && <div style={{ fontSize: 9, fontWeight: 700 }}>{p.total}</div>}
                      <div style={{ background: "var(--copper)", borderRadius: 3, height: Math.max(p.total / max * 44, 2) }} />
                      {days <= 10 && <div className="muted" style={{ fontSize: 8 }}>{p.date}</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* per-site composition + detail */}
            {view.sites.map(s => (
              <div key={s.id} style={{ ...card, cursor: "pointer" }} onClick={() => setOpen(o => ({ ...o, [s.id]: !o[s.id] }))}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{s.short} <span className="muted" style={{ fontSize: 11 }}>{open[s.id] ? "▾" : "▸ tap for details"}</span></div>
                  {s.dpr === "submitted" ? <span className="badge p">DPR ✓</span> : s.dpr === "draft" ? <span className="badge h">DPR draft</span> : <span className="badge a">DPR missing</span>}
                </div>
                <div style={{ display: "flex", height: 18, borderRadius: 5, overflow: "hidden", background: "var(--bg)", marginBottom: 6 }}>
                  {[["present", s.present], ["half", s.half], ["onsite", s.onsite]].map(([k, v]) => (
                    <div key={k} style={{ width: (s.strength ? v / Math.max(s.strength, 1) * 100 : 0) + "%", background: COL[k] }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
                  <span><b>{s.strength}</b> on site{s.proxy ? <span style={{ color: COL.proxy }}> · ⚠{s.proxy} proxy</span> : null}</span>
                  <span>OT <b>{s.ot.toFixed(1)}h</b></span>
                  <span>Indents <b>{s.indents.length}</b></span>
                  <span>Spend <b>{inr(s.expenses)}</b></span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 7 }}>
                  <span className="muted" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>BOQ {s.boqPct}%</span>
                  <span style={{ flex: 1, background: "var(--bg)", borderRadius: 4, height: 7 }}>
                    <span style={{ display: "block", width: s.boqPct + "%", background: "#1a7f4f", height: "100%", borderRadius: 4 }} />
                  </span>
                </div>
                {!open[s.id] && s.upcoming.slice(0, 2).map(u => (
                  <div key={u.po} style={{ fontSize: 11.5, marginTop: 6 }} className="muted">
                    🚚 {u.po} · {u.vendor} · <b style={{ color: u.status === "delayed" ? "var(--red)" : "inherit" }}>{DL[u.status] || u.status}</b>{u.expected ? " · exp " + u.expected : ""}
                  </div>
                ))}

                {open[s.id] && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Attendance today</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                      {[["Present", s.present], ["Half day", s.half], ["Still on site", s.onsite], ["Absent", s.absent], ["Proxy ⚠", s.proxy], ["Unverified", s.pendingVerify]].map(([l, v]) => (
                        <div key={l} style={{ background: "var(--bg)", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                          <div style={{ fontWeight: 800, fontSize: 15 }}>{v}</div>
                          <div className="muted" style={{ fontSize: 9.5 }}>{l}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Open indents ({s.indents.length})</div>
                    {s.indents.length === 0 ? <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>None open.</div> :
                      s.indents.map(i => (
                        <div key={i.no} style={{ fontSize: 12, padding: "2px 0" }}>
                          • {i.no} — waiting <b style={{ color: i.age >= 3 ? "var(--red)" : "inherit" }}>{i.age}d</b>{i.urgent && <span className="badge a" style={{ marginLeft: 6, fontSize: 10 }}>URGENT</span>}
                        </div>
                      ))}

                    <div style={{ fontWeight: 700, fontSize: 12, margin: "10px 0 4px" }}>Deliveries in transit ({s.upcoming.length})</div>
                    {s.upcoming.length === 0 ? <div className="muted" style={{ fontSize: 11.5 }}>Nothing in transit.</div> :
                      s.upcoming.map(u => (
                        <div key={u.po} style={{ fontSize: 12, padding: "2px 0" }}>
                          🚚 {u.po} · {u.vendor} · <b style={{ color: u.status === "delayed" ? "var(--red)" : "inherit" }}>{DL[u.status] || u.status}</b>{u.expected ? " · exp " + u.expected : ""}
                        </div>
                      ))}

                    <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12 }}>
                      <span>Month spend <b>{inr(s.expenses)}</b></span>
                      <span>BOQ <b>{inr(s.boqDone)}</b> / {inr(s.boqValue)} ({s.boqPct}%)</span>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button style={{ fontSize: 11.5, flex: 1 }} onClick={() => window.location.href = "/m/muster"}>👥 Muster</button>
                      <button style={{ fontSize: 11.5, flex: 1 }} onClick={() => window.location.href = "/m/dpr"}>📋 DPR</button>
                      <button style={{ fontSize: 11.5, flex: 1 }} onClick={() => window.location.href = "/m/indent"}>🧾 Indents</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div className="muted" style={{ fontSize: 10.5 }}>As of {r.asOf} · BOQ % moves with RA bills · spend = this month</div>
          </>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
