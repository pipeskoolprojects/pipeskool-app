"use client";
// update244: thin route wrapper. Body lives in components/ExpensesView.js so the SAME component
// serves /expenses (all sites) and the project workspace's Expenses & Money tab (scoped to that
// project by a siteId prop). No iframe, so no duplicate header and no stray sidebar chrome.
import Sidebar from "@/components/Sidebar";
import ExpensesView from "@/components/ExpensesView";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth";

export default function ExpensesPage() {
  const [session, setSession] = useState(null);
  useEffect(() => { setSession(getSession()); }, []);
  const isITExecutive = String(session?.role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive";
  return (
    <div className={"layout" + (isITExecutive ? " it-page it-page-expenses" : "")}>
      <Sidebar />
      <main className="main" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <ExpensesView />
      </main>
    </div>
  );
}