"use client";
// update244: thin route wrapper. Body lives in components/ExpensesView.js so the SAME component
// serves /expenses (all sites) and the project workspace's Expenses & Money tab (scoped to that
// project by a siteId prop). No iframe, so no duplicate header and no stray sidebar chrome.
import Sidebar from "@/components/Sidebar";
import ExpensesView from "@/components/ExpensesView";

export default function ExpensesPage() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <ExpensesView />
      </main>
    </div>
  );
}
