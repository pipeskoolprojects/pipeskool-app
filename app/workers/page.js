"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getWorkers, inr } from "@/lib/data";
import { isDemo } from "@/lib/supabase";

export default function WorkersPage() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => { getWorkers().then(setRows); }, []);

  const shown = (rows || []).filter(r =>
    filter === "all" ? true : filter === "incomplete" ? !r.complete : r.complete
  );
  const incompleteCount = (rows || []).filter(r => !r.complete).length;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Worker master</h1>
          <div className="filters">
            <select value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All workers</option>
              <option value="incomplete">Incomplete profiles</option>
              <option value="complete">Complete profiles</option>
            </select>
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — sample worker master shown.</div>}
        {incompleteCount > 0 && (
          <div className="demo-banner">
            {incompleteCount} profile{incompleteCount > 1 ? "s" : ""} incomplete (Aadhaar or bank details pending) —
            supervisors and office admin can complete these from the mobile app or here.
          </div>
        )}

        <div className="panel">
          {!rows ? <div className="muted">Loading…</div> : (
            <table>
              <thead>
                <tr>
                  <th>Worker</th><th>Mobile</th><th>Category</th>
                  <th>Labour type</th><th>Site</th>
                  <th className="num">Daily wage</th><th>Profile</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td className="muted">{r.mobile}</td>
                    <td>{r.category}</td>
                    <td>{r.type === "Own"
                      ? <span className="badge gray">Own</span>
                      : <span className="badge info">{r.contractor}</span>}</td>
                    <td>{r.site}</td>
                    <td className="num">{inr(r.wage)}</td>
                    <td>{r.complete
                      ? <span className="badge p">Complete</span>
                      : <span className="badge warn">Incomplete</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
