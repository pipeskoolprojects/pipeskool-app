"use client";
// update243: thin route wrapper. The page body now lives in components/ProcureView.js so the
// SAME component renders here (full page, all sites) and inside a project tab (scoped to that
// project by a siteId PROP, split into its indents half and its POs half). No iframes.
import Sidebar from "@/components/Sidebar";
import ProcureView from "@/components/ProcureView";

export default function ProcurePage() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <ProcureView />
      </main>
    </div>
  );
}
