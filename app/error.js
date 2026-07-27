"use client";
import { useEffect } from "react";

// Shown when a page throws. Most common cause on a live system is a stale tab
// after a deploy (old tab asks for chunk files that no longer exist) — we
// auto-reload once with a cache-busting URL. Any other error stays on screen
// WITH its technical details so a screenshot is enough to debug it.
const isStaleBuild = (e) =>
  /ChunkLoadError|Loading chunk|loading css chunk|failed to fetch dynamically imported|import\(\) failed/i
    .test(String((e && (e.message + " " + e.name)) || ""));

const bustReload = () => {
  const u = new URL(window.location.href);
  u.searchParams.set("v", Date.now());          // defeats cached old HTML
  window.location.replace(u.toString());
};

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("PIPESKOOL PAGE ERROR:", error);
    try {
      if (isStaleBuild(error) && !sessionStorage.getItem("psk_reloaded")) {
        sessionStorage.setItem("psk_reloaded", "1");
        bustReload();
        return;
      }
      sessionStorage.removeItem("psk_reloaded");
    } catch { /* storage blocked */ }
  }, [error]);

  const stale = isStaleBuild(error);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f4f2ee" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "28px 26px", maxWidth: 460, width: "100%", textAlign: "center", boxShadow: "0 2px 14px rgba(15,20,25,0.08)" }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>{stale ? "🔄" : "⚠️"}</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>{stale ? "The app was just updated" : "Something went wrong on this page"}</h2>
        <p style={{ color: "#666", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 18px" }}>
          {stale ? "Reload to get the new version — nothing is lost and no data is affected."
                 : "Your data is safe. Please screenshot this box (including the grey text below) and send it to the developer."}
        </p>
        <button onClick={() => { try { sessionStorage.removeItem("psk_reloaded"); } catch {} bustReload(); }}
          style={{ background: "#e06a1b", color: "#fff", border: "none", borderRadius: 9, padding: "11px 26px", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>
          Reload page
        </button>
        <div style={{ marginTop: 14 }}>
          <button onClick={() => reset()} style={{ background: "none", border: "none", color: "#999", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            Try again without reloading
          </button>
        </div>
        <div style={{ marginTop: 16, fontSize: 10.5, color: "#8a8a8a", background: "#f6f5f2", borderRadius: 8, padding: "8px 10px", textAlign: "left", wordBreak: "break-word", fontFamily: "monospace", maxHeight: 130, overflow: "auto" }}>
          [page] {String(error?.name || "Error")}: {String(error?.message || "(no message)").slice(0, 400)}
          {error?.digest ? ` · digest ${error.digest}` : ""}
          {"\n"}{String(error?.stack || "").split("\n").slice(1, 3).join("\n").slice(0, 300)}
          {"\n"}at {typeof window !== "undefined" ? window.location.pathname : ""}
        </div>
      </div>
    </div>
  );
}
