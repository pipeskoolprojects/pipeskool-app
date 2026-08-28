"use client";
// update244: thin route wrapper — body in components/GrnView.js, shared with the project
// workspace's GRN / Challan tab (scoped there by a siteId prop, no iframe).
import Sidebar from "@/components/Sidebar";
import GrnView from "@/components/GrnView";

export default function GrnRegisterPage() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <GrnView />
      </main>
    </div>
  );
}
