"use client";
import { useEffect } from "react";

// Last-resort boundary — catches errors that escape the route-level app/error.js
// (e.g. errors in the root layout). Must render its own <html>/<body>.
const isStaleBuild = (e) =>
  /ChunkLoadError|Loading chunk|loading css chunk|failed to fetch dynamically imported|import\(\) failed|text\/html/i
    .test(String(e?.message || e?.name || ""));

export default function GlobalError({ error }) {
  useEffect(() => {
    try {
      if (isStaleBuild(error) && !sessionStorage.getItem("psk_reloaded_g")) {
        sessionStorage.setItem("psk_reloaded_g", "1");
        window.location.reload();
        return;
      }
      sessionStorage.removeItem("psk_reloaded_g");
    } catch { /* ignore */ }
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f4f2ee" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "28px 26px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 2px 14px rgba(15,20,25,0.08)" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🔄</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>The app was just updated</h2>
            <p style={{ color: "#666", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 18px" }}>
              Reload to get the new version — nothing is lost and no data is affected.
            </p>
            <button
              onClick={() => { try { sessionStorage.removeItem("psk_reloaded_g"); } catch {} window.location.reload(); }}
              style={{ background: "#e06a1b", color: "#fff", border: "none", borderRadius: 9, padding: "11px 26px", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>
              Reload page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
