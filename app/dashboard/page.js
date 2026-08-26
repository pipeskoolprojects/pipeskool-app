"use client";
// update236: thin route wrapper — body in components/DashboardView.js, also used as the
// Dashboard tab inside /home.
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import DashboardView from "@/components/DashboardView";

export default function DashboardPage() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <Link href="/home?tab=dashboard" style={{ fontSize: 12.5, color: "var(--copper)", fontWeight: 700, textDecoration: "none" }}>← Home</Link>
        <DashboardView />
      </main>
    </div>
  );
}
