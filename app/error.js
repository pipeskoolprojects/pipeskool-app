"use client";
import { useEffect } from "react";

// Shown when any page throws. The most common cause on a live system is a
// stale tab after a Vercel deploy (old tab asks for old chunk files that no
// longer exist). We detect that and reload once automatically — the reload
// fetches the new build and the user never has to think about it.
const isStaleBuild = (e) =>
  /ChunkLoadError|Loading chunk|loading css chunk|failed to fetch dynamically imported|import\(\) failed|text\/html/i
    .test(String(e?.message || e?.name || ""));

export default function Error({ error, reset }) {
  useEffect(() => {
    try {
      if (isStaleBuild(error) && !sessionStorage.getItem("psk_reloaded")) {
        sessionStorage.setItem("psk_reloaded", "1");   // reload only once, no loops
        window.location.reload();
        return;
      }
      sessionStorage.removeItem("psk_reloaded");
    } catch { /* storage blocked — fall through to the manual screen */ }
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f4f2ee" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "28px 26px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 2px 14px rgba(15,20,25,0.08)" }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🔄</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>The app was just updated</h2>
        <p style={{ color: "#666", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 18px" }}>
          This page was loaded before the latest update. Reload to get the new version —
          nothing is lost and no data is affected.
        </p>
        <button
          onClick={() => { try { sessionStorage.removeItem("psk_reloaded"); } catch {} window.location.reload(); }}
          style={{ background: "#e06a1b", color: "#fff", border: "none", borderRadius: 9, padding: "11px 26px", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>
          Reload page
        </button>
        <div style={{ marginTop: 14 }}>
          <button onClick={() => reset()} style={{ background: "none", border: "none", color: "#999", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            Try again without reloading
          </button>
        </div>
        {error?.message && !isStaleBuild(error) && (
          <div style={{ marginTop: 16, fontSize: 11, color: "#b04a3a", background: "#faf0ee", borderRadius: 8, padding: "8px 10px", textAlign: "left", wordBreak: "break-word" }}>
            {String(error.message).slice(0, 300)}
          </div>
        )}
      </div>
    </div>
  );
}
