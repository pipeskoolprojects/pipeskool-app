"use client";
import { useEffect, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getMuster, verifyDay } from "@/lib/mobile";
import { getSession } from "@/lib/auth";

const initials = n => n.split(" ").map(x => x[0]).slice(0, 2).join("");

export default function VerifyScreen() {
  if (typeof window !== "undefined" && !getSession()) { window.location.replace("/m"); return null; }
  const [rows, setRows] = useState(null);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");
  const sess = typeof window !== "undefined" ? getSession() : null;
  const siteId = sess?.currentSite || sess?.sites?.[0]?.id || 1;

  useEffect(() => { getMuster(siteId).then(setRows); }, []);

  const pending = (rows || []).filter(r => r.verify === "pending");
  const anomalies = (rows || []).filter(r => (r.in && !r.out) || r.punch === "proxy");

  async function verifyAll() {
    const res = await verifyDay(siteId, rows);
    if (!res.ok) { setMsg(res.error); return; }
    setDone(true);
    setMsg("Day verified and submitted. Muster will lock at 10:00 AM tomorrow.");
    getMuster(siteId).then(setRows);
  }

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div>
          <div className="title">Verify today&apos;s attendance</div>
          <div className="sub">End-of-day check · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
        </div>
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — sample data.</div>}

        {anomalies.length > 0 && !done && (
          <div className="note red">
            ⚠ {anomalies.length} record{anomalies.length > 1 ? "s" : ""} need attention:
            missing punch-out or proxy entry. Review below before verifying.
          </div>
        )}

        {!rows ? <div className="muted">Loading…</div> : rows.map(r => (
          <div className="m-row" key={r.id}>
            <div className="avatar">{initials(r.name)}</div>
            <div className="info">
              <div className="nm">{r.name}</div>
              <div className="dt">
                {r.in ? `In ${r.in}` : "No punch"}{r.out ? ` — Out ${r.out}` : r.in ? " — no punch-out ⚠" : ""}
              </div>
              {r.punch === "proxy" && <div className="flag">📷 Proxy — check photo</div>}
            </div>
            {r.verify === "verified"
              ? <span className="badge p">Verified</span>
              : <span className="badge warn">Pending</span>}
          </div>
        ))}

        {msg && <div className="note green" style={{ marginTop: 12 }}>{msg}</div>}

        {!done && pending.length > 0 && (
          <button className="primary btn-block" style={{ marginTop: 16 }} onClick={verifyAll}>
            ✓ Verify all {pending.length} records &amp; submit day
          </button>
        )}
        <div className="note amber" style={{ marginTop: 12 }}>
          Monthly wage payout cannot be approved while any day has unverified records.
          Corrections after lock need Office Admin/Director approval — everything is logged.
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
