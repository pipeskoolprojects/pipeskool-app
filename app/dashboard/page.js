"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import DashboardView from "@/components/DashboardView";
import SupervisorDashboard from "@/components/SupervisorDashboard";
import AccountantDashboard from "@/components/AccountantDashboard";
import ITDashboardHome from "@/components/ITDashboardHome";
import { getSession } from "@/lib/auth";

export default function DashboardPage() {
  const router = useRouter();
  const [sess, setSess] = useState(null);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    setSess(current);
  }, [router]);

  if (!sess) return null;
  if (String(sess.role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive") return <ITDashboardHome sess={sess} mode="desktop" />;

  return (
    <div className="layout">
      <Sidebar />
      {sess.role === "director" ? (
        <main className="main">
          <Link href="/home" style={{ fontSize: 12.5, color: "var(--copper)", fontWeight: 700, textDecoration: "none" }}>← Home</Link>
          <DashboardView />
        </main>
      ) : sess.role === "ho_admin" ? (
        <main className="main" style={{ padding: 0 }}>
          <AccountantDashboard />
        </main>
      ) : (
        <main className="main" style={{ padding: 0 }}>
          <SupervisorDashboard sess={sess} />
        </main>
      )}
    </div>
  );
}
