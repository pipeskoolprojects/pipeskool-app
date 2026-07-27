"use client";
import { useEffect } from "react";

// Last-resort boundary (root-layout errors). Shows the technical detail too,
// tagged [global] so we can tell WHICH boundary fired from a screenshot.
const isStaleBuild = (e) =>
  /ChunkLoadError|Loading chunk|loading css chunk|failed to fetch dynamically imported|import\(\) failed/i
    .test(String((e && (e.message + " " + e.name)) || ""));

const bustReload = () => {
  const u = new URL(window.location.href);
  u.searchParams.set("v", Date.now());
  window.location.replace(u.toString());
};

export default function GlobalError({ error }) {
  useEffect(() => {
    console.error("PIPESKOOL GLOBAL ERROR:", error);
    try {
      if (isStaleBuild(error) && !sessionStorage.getItem("psk_reloaded_g")) {
        sessionStorage.setItem("psk_reloaded_g", "1");
        bustReload();
        return;
      }
      sessionStorage.removeItem("psk_reloaded_g");
    } catch { /* ignore */ }
  }, [error]);

  const stale = isStaleBuild(error);
  return (
    <html>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f4f2ee" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "28px 26px", maxWidth: 460, width: "100%", textAlign: "center", boxShadow: "0 2px 14px rgba(15,20,25,0.08)" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>{stale ? "🔄" : "⚠️"}</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>{stale ? "The app was just updated" : "Something went wrong"}</h2>
            <p style={{ color: "#666", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 18px" }}>
              {stale ? "Reload to get the new version — nothing is lost and no data is affected."
                     : "Your data is safe. Please screenshot this box (including the grey text below) and send it to the developer."}
            </p>
            <button onClick={() => { try { sessionStorage.removeItem("psk_reloaded_g"); } catch {} bustReload(); }}
              style={{ background: "#e06a1b", color: "#fff", border: "none", borderRadius: 9, padding: "11px 26px", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>
              Reload page
            </button>
            <div style={{ marginTop: 16, fontSize: 10.5, color: "#8a8a8a", background: "#f6f5f2", borderRadius: 8, padding: "8px 10px", textAlign: "left", wordBreak: "break-word", fontFamily: "monospace", maxHeight: 130, overflow: "auto" }}>
              [global] {String(error?.name || "Error")}: {String(error?.message || "(no message)").slice(0, 400)}
              {error?.digest ? ` · digest ${error.digest}` : ""}
              {"\n"}{String(error?.stack || "").split("\n").slice(1, 3).join("\n").slice(0, 300)}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
