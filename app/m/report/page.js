"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MobileNav from "@/components/MobileNav";
import { getDirectorReport, inr } from "@/lib/reports";
import { getSession } from "@/lib/auth";

export default function MobileReport() {
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const sess = typeof window !== "undefined" ? getSession() : null;

  useEffect(() => {
    if (!sess) { router.push("/login"); return; }
    getDirectorReport().then(d => { setR(d); setLoading(false); });
  }, []);

  // non-directors see only their own sites
  const mySiteIds = sess?.role === "director" ? null : (sess?.sites || []).map(s => s.id);
  const sites = (r?.sites || []).filter(s => !mySiteIds || mySiteIds.includes(s.id));

  const max = Math.max(...(r?.trend || []).map(p => p.value), 1);

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div>
          <div className="title">Site report</div>
          <div className="sub">{sess?.role === "director" ? "All sites" : "Your sites"} · today</div>
        </div>
      </div>

      <div style={{ padding: "12px 14px 80px" }}>
        {loading ? <div className="muted">Loading…</div> : !r ? <div className="muted">No data.</div> : (
          <>
            {sess?.role === "director" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[["Manpower", r.totals.strength], ["DPR", r.totals.dprDone + "/" + r.sites.length],
                  ["Open indents", r.totals.indents], ["Month expenses", inr(r.totals.expenses)]].map(([l, v]) => (
                  <div key={l} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--border)" }}>
                    <div className="muted" style={{ fontSize: 10.5 }}>{l}</div>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 7-day trend mini bars */}
            <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--border)", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>Manpower — last 7 days</div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 70 }}>
                {r.trend.map(p => (
                  <div key={p.date} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700 }}>{p.value}</div>
                    <div style={{ background: "var(--copper)", borderRadius: 4, height: Math.max((p.value / max) * 48, 3) }} />
                    <div className="muted" style={{ fontSize: 8.5, marginTop: 2 }}>{p.date}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* per-site cards */}
            {sites.map(s => (
              <div key={s.id} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--border)", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{s.name}</div>
                  {s.dpr === "submitted" ? <span className="badge p">DPR ✓</span> : s.dpr === "draft" ? <span className="badge h">DPR draft</span> : <span className="badge a">DPR missing</span>}
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
                  <span><b>{s.strength}</b> on site{s.proxy ? <span className="muted"> ({s.proxy} proxy)</span> : null}</span>
                  <span>OT <b>{s.ot.toFixed(1)}h</b></span>
                  <span>Indents <b>{s.indents}</b></span>
                  <span>Deliveries <b>{s.deliveries}</b>{s.nextDelivery ? <span className="muted"> · next {s.nextDelivery}</span> : null}</span>
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12.5, alignItems: "center" }}>
                  <span>Month spend <b>{inr(s.expenses)}</b></span>
                  <span style={{ flex: 1 }}>
                    <span className="muted" style={{ fontSize: 10.5 }}>BOQ {s.boqPct}%</span>
                    <span style={{ display: "block", background: "var(--bg)", borderRadius: 4, height: 6, marginTop: 2 }}>
                      <span style={{ display: "block", width: s.boqPct + "%", background: "#1a7f4f", height: "100%", borderRadius: 4 }} />
                    </span>
                  </span>
                </div>
              </div>
            ))}
            <div className="muted" style={{ fontSize: 11 }}>As of {r.asOf}. Expenses = this month, approved/pending. BOQ % moves with RA bills.</div>
          </>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
