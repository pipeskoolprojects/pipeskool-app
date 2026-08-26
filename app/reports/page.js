"use client";
// update236: thin route wrapper — body in components/ReportsView.js, also used as the
// Site reports tab inside /home.
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import ReportsView from "@/components/ReportsView";

export default function ReportsPage() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <Link href="/home" style={{ fontSize: 12.5, color: "var(--copper)", fontWeight: 700, textDecoration: "none" }}>← Home</Link>
        <ReportsView />
      </main>
    </div>
  );
}
