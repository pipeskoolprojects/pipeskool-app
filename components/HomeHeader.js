"use client";
// update236: SHARED HOME HEADER — one implementation, two shells.
// /home (desktop) renders this ABOVE the tab strip; /m/dashboard renders it above the
// mobile dashboard. The "View as Site Mgr" state lives in the PARENT so it survives tab
// switches on desktop — this component only reads it and calls setAsSite.
import Link from "next/link";

export const NAVY = "#0F1A2E", NAVY2 = "#16233d", COPPER = "#e07020";

export default function HomeHeader({ sess, sites, isDirector, asSite, setAsSite, siteName, pickSite, setPickSite, mode = "mobile" }) {
  if (!sess) return null;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const roleLabel = isDirector ? "Director" : String(sess.role || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const desk = mode === "desk";
  const topPad = mode === "mobile" ? "calc(12px + env(safe-area-inset-top))" : "14px";

  return (
    <>
      <div style={{ background: NAVY, color: "#fff", padding: desk ? "10px 28px" : topPad + " 14px 14px", position: "relative", zIndex: 20 }}>{/* update265b: header always paints above page content */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: desk ? "none" : 1100, margin: desk ? 0 : "0 auto", paddingRight: desk ? 0 : 52 }}>{/* update274: bell gutter */}
          {/* update237: the greeting block (crown + Good evening + name · role) is PHONE-ONLY now.
              On desktop the sidebar already shows who is logged in, so the header carries only the
              controls. The mobile home is unchanged. */}
          {!desk ? (<>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.1)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{isDirector ? "👑" : "🔧"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 1, color: COPPER, fontWeight: 800, textTransform: "uppercase" }}>{greet}</div>
              <div style={{ fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {String(sess.name || sess.full_name || "").split(" ")[0] || "there"} <span style={{ opacity: 0.6, fontWeight: 600, fontSize: 14 }}>· {roleLabel}</span></div>
            </div>
          </>) : <div style={{ flex: 1, minWidth: 0 }} />}
          {isDirector && (
            <button type="button" onClick={() => setPickSite(v => !v)}
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 999, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, maxWidth: 155, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {asSite ? siteName : "View as Site Mgr"} ▾</button>
          )}
          <Link href="/notices" title="Notice Board" style={{ color: "#fff", fontSize: 19, textDecoration: "none", padding: 6, flexShrink: 0 }}>📢</Link>{/* update283: was a second 🔔 sitting beside the floating notification bell */}
        </div>
        {pickSite && (
          <div style={{ marginTop: 10, background: NAVY2, borderRadius: 12, padding: 8, maxHeight: 220, overflowY: "auto", maxWidth: desk ? 420 : 1100, margin: desk ? "10px 0 0 auto" : "10px auto 0" }}>
            <div onClick={() => { setAsSite(null); setPickSite(false); }} style={{ padding: "9px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: !asSite ? 800 : 600, color: !asSite ? COPPER : "#fff" }}>🏢 Company portfolio (all sites)</div>
            {(sites || []).filter(s => s.is_active !== false).map(s => (
              <div key={s.id} onClick={() => { setAsSite(Number(s.id)); setPickSite(false); }}
                style={{ padding: "9px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: String(asSite) === String(s.id) ? 800 : 600, color: String(asSite) === String(s.id) ? COPPER : "#fff" }}>📍 {s.name}</div>
            ))}
          </div>
        )}
      </div>

      {isDirector && asSite && (
        <div style={{ background: "#fff7ed", borderBottom: "1px solid #f0c9a4", padding: desk ? "7px 28px" : "7px 14px", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>👁 Viewing <b>{siteName}</b> as its site manager</span>
          <button type="button" onClick={() => setAsSite(null)} style={{ fontSize: 11.5, fontWeight: 700, border: "1px solid var(--copper)", color: "var(--copper)", background: "#fff", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>✕ Exit</button>
        </div>
      )}
    </>
  );
}
