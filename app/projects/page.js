"use client";
// update236: thin route wrapper. The page body now lives in components/ProjectsView.js so the
// SAME component can also render as the Projects tab inside /home — no iframes, no second copy.
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import ProjectsView from "@/components/ProjectsView";

export default function ProjectsPage() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <Link href="/home?tab=projects" style={{ fontSize: 12.5, color: "var(--copper)", fontWeight: 700, textDecoration: "none" }}>← Home</Link>
        <ProjectsView />
      </main>
    </div>
  );
}
