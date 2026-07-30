"use client";
import { useEffect, useMemo, useState } from "react";

/*
  Reusable filterable / sortable / exportable table.
  Props:
    columns: [{ key, label, type: 'text'|'num'|'date'|'badge', render?(row), filter?: 'search'|'select'|false, sortable?: bool }]
    rows: array of objects
    title, exportName
    dateField: key used by the from/to date-range picker (optional)
*/
export default function DataTable({ columns, rows, exportName = "export", dateField, rightExtra, fixed, pageSize = 25 }) {
  const [search, setSearch] = useState("");
  const [selects, setSelects] = useState({});      // {colKey: value}
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search, selects, from, to, rows]);

  // build select options from data
  const selectCols = columns.filter(c => c.filter === "select");
  const options = useMemo(() => {
    const o = {};
    selectCols.forEach(c => {
      o[c.key] = Array.from(new Set((rows || []).map(r => r[c.key]).filter(v => v !== null && v !== undefined && v !== "")));
    });
    return o;
  }, [rows]);

  const searchCols = columns.filter(c => c.filter === "search").map(c => c.key);

  const filtered = useMemo(() => {
    let out = [...(rows || [])];
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(r => searchCols.some(k => String(r[k] ?? "").toLowerCase().includes(q)));
    }
    Object.entries(selects).forEach(([k, v]) => {
      if (v) out = out.filter(r => String(r[k]) === String(v));
    });
    if (dateField && (from || to)) {
      out = out.filter(r => {
        const d = r[dateField];
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    if (sortKey) {
      out.sort((a, b) => {
        let x = a[sortKey], y = b[sortKey];
        if (typeof x === "number" && typeof y === "number") return sortDir === "asc" ? x - y : y - x;
        x = String(x ?? ""); y = String(y ?? "");
        return sortDir === "asc" ? x.localeCompare(y) : y.localeCompare(x);
      });
    }
    return out;
  }, [rows, search, selects, from, to, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function exportCSV() {
    const head = columns.map(c => c.label).join(",");
    const body = filtered.map(r =>
      columns.map(c => {
        const v = c.exportValue ? c.exportValue(r) : r[c.key];
        const s = String(v ?? "").replace(/"/g, "'");
        return s.includes(",") ? `"${s}"` : s;
      }).join(",")
    ).join("\n");
    const blob = new Blob([head + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  const clearAll = () => { setSearch(""); setSelects({}); setFrom(""); setTo(""); setSortKey(null); };
  const hasFilters = search || from || to || Object.values(selects).some(Boolean);

  // pagination — display only; export always covers the full filtered set
  const paged = pageSize > 0;
  const pageCount = paged ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const curPage = Math.min(page, pageCount - 1);
  const shown = paged ? filtered.slice(curPage * pageSize, (curPage + 1) * pageSize) : filtered;
  const rangeFrom = filtered.length === 0 ? 0 : curPage * pageSize + 1;
  const rangeTo = paged ? Math.min((curPage + 1) * pageSize, filtered.length) : filtered.length;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {searchCols.length > 0 && (
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="🔍 Search…" style={{ minWidth: 160 }} />
        )}
        {dateField && <>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} title="From date" />
          <span className="muted">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} title="To date" />
        </>}
        {selectCols.map(c => (
          <select key={c.key} value={selects[c.key] || ""} onChange={e => setSelects(s => ({ ...s, [c.key]: e.target.value }))}>
            <option value="">{c.label}: all</option>
            {options[c.key]?.map(o => <option key={o} value={o}>{c.optionLabel ? c.optionLabel(o) : o}</option>)}
          </select>
        ))}
        {hasFilters && <button onClick={clearAll} style={{ fontSize: 12 }}>Clear</button>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {rightExtra}
          <button onClick={exportCSV} style={{ fontSize: 12.5 }}>⬇ Export Excel</button>
        </div>
      </div>

      <div className="dt-scroll">
      <table style={fixed ? { width: "100%", tableLayout: "fixed" } : { minWidth: "100%" }} className="dt-compact">
        {fixed && <colgroup>{columns.map(c => <col key={c.key} style={c.width ? { width: c.width } : {}} />)}</colgroup>}
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} className={c.type === "num" ? "num" : ""}
                  onClick={() => c.sortable !== false && toggleSort(c.key)}
                  style={{ cursor: c.sortable !== false ? "pointer" : "default", userSelect: "none" }}>
                {c.label}{sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : (c.sortable !== false ? " ↕" : "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={columns.length} className="muted">No matching records.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id ?? i}>
              {columns.map(c => (
                <td key={c.key} className={c.type === "num" ? "num" : ""}
                    style={c.wrap ? { whiteSpace: "normal", wordBreak: "break-word", verticalAlign: "top", lineHeight: 1.4, fontSize: 12.5 } : {}}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <span className="muted">
          {paged && filtered.length > pageSize
            ? `Showing ${rangeFrom}–${rangeTo} of ${filtered.length}` : `${filtered.length} of ${(rows||[]).length} records`}
          {" · click a column heading to sort"}
        </span>
        {paged && pageCount > 1 && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <button style={{ fontSize: 12 }} disabled={curPage === 0} onClick={() => setPage(0)}>«</button>
            <button style={{ fontSize: 12 }} disabled={curPage === 0} onClick={() => setPage(curPage - 1)}>‹ Prev</button>
            <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>Page {curPage + 1} / {pageCount}</span>
            <button style={{ fontSize: 12 }} disabled={curPage >= pageCount - 1} onClick={() => setPage(curPage + 1)}>Next ›</button>
            <button style={{ fontSize: 12 }} disabled={curPage >= pageCount - 1} onClick={() => setPage(pageCount - 1)}>»</button>
          </span>
        )}
      </div>
    </div>
  );
}
