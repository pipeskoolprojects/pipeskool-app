"use client";
// update383: YEAR MASTER — the year-view table your mockup asked for. It reads the SAME
// company_holidays rows the month/week/day views read (via the calendar page's `events`
// state), so this is a different LAYOUT, not a separate data source. Clicking a row opens
// the same edit modal used elsewhere.
import { useMemo } from "react";

const APPLIES_LABEL = {
  both:   ["Both",    "#dcfce7", "#166534"],
  staff:  ["Office",  "#dbeafe", "#1e40af"],
  labour: ["Workers", "#fef3c7", "#92400e"],
  none:   ["None",    "#fee2e2", "#991b1b"],
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function YearMaster({ events, onEdit }) {
  const rows = useMemo(() =>
    (events || [])
      .filter(e => e.type === "holiday")
      .slice()
      .sort((a, b) => a.date < b.date ? -1 : 1),
    [events]);

  if (!rows.length) {
    return (
      <div className="panel" style={{ margin: 0 }}>
        <div className="muted" style={{ fontSize: 13, padding: 12 }}>
          No holidays configured for this year. Use <b>+ Add holiday</b> on the header to add them, or use Import (coming) to load a list from Excel.
        </div>
      </div>
    );
  }

  const counts = {
    all:    rows.length,
    both:   rows.filter(r => (r.applies_to || "both") === "both").length,
    staff:  rows.filter(r => r.applies_to === "staff").length,
    labour: rows.filter(r => r.applies_to === "labour").length,
    site:   rows.filter(r => (r.site_ids || []).length > 0).length,
  };

  return (
    <div className="panel" style={{ margin: 0, overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, marginBottom: 10, alignItems: "center" }}>
        <b style={{ fontSize: 13 }}>Total: {counts.all}</b>
        <span className="muted">·</span>
        <span>Office <b>{counts.staff}</b></span>
        <span className="muted">·</span>
        <span>Workers <b>{counts.labour}</b></span>
        <span className="muted">·</span>
        <span>Both <b>{counts.both}</b></span>
        <span className="muted">·</span>
        <span>Site-specific <b>{counts.site}</b></span>
      </div>

      <table className="ym-tbl" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 640 }}>
        <thead>
          <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
            {["#", "Date", "Day", "Holiday / Festival", "Applies To", "Sites", "Remarks", ""].map(h =>
              <th key={h} style={{ padding: "6px 8px", fontSize: 11, letterSpacing: 0.03, borderBottom: "1px solid #e5e7eb" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <YearRow key={r.id} r={r} n={i + 1} onEdit={onEdit} />)}
        </tbody>
      </table>

      <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
        Click any row to edit. Holidays here are the SAME rows the attendance register, muster, wages and slip already read — a change here changes payroll everywhere.
      </div>
    </div>
  );
}

function YearRow({ r, n, onEdit }) {
  const d = new Date(r.date + "T00:00:00");
  const [aLabel, aBg, aFg] = APPLIES_LABEL[r.applies_to || "both"] || APPLIES_LABEL.both;
  const dayName = d.toLocaleDateString("en-IN", { weekday: "short" });
  const dateFmt = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const nSites  = (r.site_ids || []).length;
  return (
    <tr onClick={() => onEdit(r)} style={{ cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}
        onMouseEnter={e => e.currentTarget.style.background = "#fafbfc"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <td style={td}>{n}</td>
      <td style={{ ...td, whiteSpace: "nowrap" }}>{dateFmt.replace(/ /g, "-")}</td>
      <td style={td}>{dayName}</td>
      <td style={{ ...td, fontWeight: 600 }}>{r.title}</td>
      <td style={td}>
        <span style={{ background: aBg, color: aFg, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{aLabel}</span>
      </td>
      <td style={td}>
        {nSites === 0
          ? <span style={{ color: "#166534" }}>All Sites</span>
          : <span style={{ color: "#1e40af" }}>{nSites} site{nSites > 1 ? "s" : ""}</span>}
      </td>
      <td style={{ ...td, color: "#666" }}>{r.note || "—"}</td>
      <td style={{ ...td, textAlign: "right" }}>
        <span className="muted" style={{ fontSize: 11 }}>✎</span>
      </td>
    </tr>
  );
}

const td = { padding: "8px", verticalAlign: "top" };
