"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { getWorkers, inr } from "@/lib/data";
import { isDemo } from "@/lib/supabase";

export default function WorkersPage() {
  const [rows, setRows] = useState(null);
  useEffect(() => { getWorkers().then(setRows); }, []);

  const incompleteCount = (rows || []).filter(r => !r.complete).length;

  const columns = [
    { key: "name", label: "Worker", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: "mobile", label: "Mobile", filter: "search", render: r => <span className="muted">{r.mobile}</span> },
    { key: "category", label: "Category", filter: "select" },
    { key: "type", label: "Labour type", filter: "select",
      render: r => r.type === "Own" ? <span className="badge gray">Own</span> : <span className="badge info">{r.contractor}</span> },
    { key: "site", label: "Site", filter: "select" },
    { key: "wage", label: "Daily wage", type: "num", render: r => inr(r.wage), exportValue: r => r.wage },
    { key: "complete", label: "Profile", filter: "select",
      optionLabel: o => o ? "Complete" : "Incomplete",
      render: r => r.complete ? <span className="badge p">Complete</span> : <span className="badge warn">Incomplete</span>,
      exportValue: r => r.complete ? "Complete" : "Incomplete" },
  ];

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Worker master</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — sample worker master shown.</div>}
        {incompleteCount > 0 && (
          <div className="demo-banner">
            {incompleteCount} profile{incompleteCount > 1 ? "s" : ""} incomplete (Aadhaar or bank pending).
          </div>
        )}
        <div className="panel">
          {!rows ? <div className="muted">Loading…</div> :
            <DataTable columns={columns} rows={rows} exportName="workers" />}
        </div>
      </main>
    </div>
  );
}
