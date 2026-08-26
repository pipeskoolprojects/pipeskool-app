"use client";
// update235: DIRECTOR HOME = a 4-card launcher. No tabs, no iframes, no overlays.
// Each card is a normal link to a REAL page that renders the app's single shell itself —
// which is what removes the nested-shell / double-sidebar / double-scrollbar problem.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";

const CARDS = [
  ["🏠", "Home overview", "Portfolio snapshot — sites, workforce, tasks, approvals", "/m/dashboard?desk=1", "#1a2450"],
  ["📁", "Projects", "All company projects, progress and financials", "/projects", "#0e7490"],
  ["📊", "Dashboard", "Attendance, overtime, proxy punches and site strength", "/dashboard", "#15803d"],
  ["📋", "Site reports", "DPR digest, indents and daily site reporting", "/reports", "#b45309"],
];

export default function DirectorHome() {
  const router = useRouter();
  const [sess, setSess] = useState(null);
  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace("/login"); return; }
    setSess(s);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!sess) return null;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100dvh" }}>
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 style={{ margin: 0 }}>🏠 Director Home</h1>
            <div className="muted" style={{ fontSize: 13 }}>{greet}, {String(sess.name || "").split(" ")[0]} — pick where you want to go.</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 6 }}>
          {CARDS.map(([ico, title, desc, href, tint]) => (
            <Link key={title} href={href} style={{ textDecoration: "none", color: "var(--text)" }}>
              <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 18, padding: "22px 20px", minHeight: 168,
                  display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 4px 16px rgba(15,26,46,0.06)", cursor: "pointer", height: "100%" }}>
                <span style={{ width: 52, height: 52, borderRadius: 15, background: tint + "14", color: tint, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 25 }}>{ico}</span>
                <b style={{ fontSize: 17 }}>{title}</b>
                <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45, flex: 1 }}>{desc}</span>
                <span style={{ color: "var(--copper)", fontWeight: 800, fontSize: 12.5 }}>Open →</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
