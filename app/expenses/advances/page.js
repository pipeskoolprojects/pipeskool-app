"use client";
// update196: ADVANCE SALARY LEDGER — same spirit as the petty-cash ledger.
// Every advance request with status + recovery (advances auto-deduct from pay — locked
// rule); summary cards; DataTable gives search / date range / site & status filters /
// Excel export / 25-per-page numbered pagination. View → per-person ledger.
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getAdvanceLedger, inr } from "@/lib/money";

const STATUS_BADGE = { approved: "p", pending: "warn", rejected: "red", query: "h" };

export default function AdvanceLedgerPage() {
  const [data, setData] = useState(null);
  const [person, setPerson] = useState(null);   // pkey of the person whose ledger is open
  useEffect(() => {
    if (!getSession()) { window.location.replace("/login"); return; }
    getAdvanceLedger().then(setData);
  }, []);

  const rows = data?.rows || [];
  const recovered = data?.recovered || {};
  // per-person recovery is shared across that person's approved advances (deductions are
  // not tied to one request) — outstanding is therefore computed PER PERSON, oldest first.
  const perPerson = useMemo(() => {
    const m = {};
    rows.forEach(r => {
      const g = m[r.pkey] = m[r.pkey] || { name: r.employee, kind: r.kind, taken: 0, advances: [] };
      if (r.status === "approved") g.taken += r.amount;
      g.advances.push(r);
    });
    Object.entries(m).forEach(([k, g]) => {
      g.recovered = Math.min(recovered[k]?.total || 0, g.taken);
      g.outstanding = Math.max(g.taken - g.recovered, 0);
      g.months = recovered[k]?.months || [];
    });
    return m;
  }, [rows, recovered]);

  const totals = useMemo(() => Object.values(perPerson).reduce(
    (t, g) => ({ taken: t.taken + g.taken, rec: t.rec + g.recovered, out: t.out + g.outstanding }),
    { taken: 0, rec: 0, out: 0 }), [perPerson]);

  // update197: person-wise rows like "Petty cash — balance held by person" — one row per
  // employee with totals + 📒 Ledger; per-advance detail (date/reason/status) lives in the ledger.
  const personRows = useMemo(() => Object.entries(perPerson).map(([k, g]) => ({
    id: k, holder: g.name, kind: g.kind === "labour" ? "Worker" : "Staff",
    advances: g.advances.filter(a => a.status === "approved").length,
    taken: g.taken, recovered: g.recovered, outstanding: g.outstanding,
    last: g.advances[0]?.date || "",
  })).filter(r => r.taken > 0 || r.advances > 0 || r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding), [perPerson]);

  const cols = [
    { key: "holder", label: "Employee", filter: "search", wrap: true,
      render: r => <a style={{ cursor: "pointer", fontWeight: 600 }} onClick={() => setPerson(r.id)}>{r.holder}</a> },
    { key: "kind", label: "Type", filter: "select" },
    { key: "advances", label: "Advances", type: "num" },
    { key: "last", label: "Last advance", type: "date" },
    { key: "taken", label: "Taken", type: "num", render: r => inr(r.taken) },
    { key: "recovered", label: "Recovered", type: "num", render: r => <span style={{ color: "var(--green)" }}>{inr(r.recovered)}</span> },
    { key: "outstanding", label: "Outstanding", type: "num",
      render: r => <b style={{ color: r.outstanding > 0 ? "var(--red)" : "var(--green)" }}>{inr(r.outstanding)}</b> },
    { key: "_view", label: "", render: r => <button style={{ fontSize: 11.5 }} onClick={() => setPerson(r.id)}>📒 Ledger</button>, exportValue: () => "" },
  ];

  const pg = person ? perPerson[person] : null;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Advance salary ledger</h1></div>
        {isDemo && <div className="note amber">Demo mode.</div>}
        <div className="cards3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
          {[["💰 Total advance taken (approved)", totals.taken, "var(--text)"],
            ["✅ Total recovered / deducted", totals.rec, "var(--green)"],
            ["⏳ Outstanding balance", totals.out, totals.out > 0 ? "var(--red)" : "var(--green)"]].map(([l, v, c]) => (
            <div key={l} className="panel" style={{ padding: "12px 16px" }}>
              <div className="muted" style={{ fontSize: 12 }}>{l}</div>
              <div style={{ fontWeight: 800, fontSize: 22, color: c }}>{inr(v)}</div>
            </div>
          ))}
        </div>
        <div className="panel">
          {!data ? <div className="muted">Loading…</div> :
            <DataTable columns={cols} rows={personRows} exportName="advance_salary_ledger" dateField="last" />}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            One row per employee, like the petty-cash holder table. 📒 Ledger shows every advance (date, site, reason, status) and the month-wise recovery through pay. Recovery is automatic — advances are deducted from wage / staff payouts.
          </div>
        </div>

        {pg && (
          <div onClick={() => setPerson(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 95, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 560, width: "100%", padding: 22, maxHeight: "90vh", overflowY: "auto" }}>
              <h2 style={{ marginBottom: 2 }}>📒 {pg.name} <span className="muted" style={{ fontSize: 13 }}>({pg.kind === "labour" ? "Worker" : "Staff"})</span></h2>
              <div style={{ display: "flex", gap: 16, margin: "8px 0 12px", flexWrap: "wrap" }}>
                <div><div className="muted" style={{ fontSize: 11.5 }}>Taken</div><b>{inr(pg.taken)}</b></div>
                <div><div className="muted" style={{ fontSize: 11.5 }}>Recovered</div><b style={{ color: "var(--green)" }}>{inr(pg.recovered)}</b></div>
                <div><div className="muted" style={{ fontSize: 11.5 }}>Outstanding</div><b style={{ color: pg.outstanding > 0 ? "var(--red)" : "var(--green)" }}>{inr(pg.outstanding)}</b></div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Advances</div>
              <table className="dt-compact" style={{ width: "100%", marginBottom: 12 }}>
                <thead><tr><th>Date</th><th>Site</th><th className="num">₹</th><th>Reason</th><th>Status</th></tr></thead>
                <tbody>{pg.advances.map(a => (
                  <tr key={a.id}><td>{a.date}</td><td>{a.site}</td><td className="num">{inr(a.amount)}</td>
                    <td className="muted">{a.reason || "—"}</td>
                    <td><span className={"badge " + (STATUS_BADGE[a.status] || "gray")}>{a.status}</span></td></tr>
                ))}</tbody>
              </table>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Recovered through pay</div>
              {pg.months.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>Nothing deducted yet.</div> : (
                <table className="dt-compact" style={{ width: "100%" }}>
                  <thead><tr><th>Pay month</th><th className="num">Deducted ₹</th></tr></thead>
                  <tbody>{pg.months.map((m, i) => <tr key={i}><td>{m.month}</td><td className="num">{inr(m.amt)}</td></tr>)}</tbody>
                </table>
              )}
              <div style={{ marginTop: 14 }}><button onClick={() => setPerson(null)}>Close</button></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
