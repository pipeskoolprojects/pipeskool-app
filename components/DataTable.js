"use client";
import { useEffect, useMemo, useRef, useState } from "react";

/*
  Reusable filterable / sortable / exportable table.
  Props:
    columns: [{ key, label, type: 'text'|'num'|'date'|'badge', render?(row), filter?: 'search'|'select'|false, sortable?: bool }]
    rows: array of objects
    title, exportName
    dateField: key used by the from/to date-range picker (optional)
    server (update446, optional): SERVER MODE for ledgers that grow without limit. The table no longer
      filters an array it was given — every search / filter / date / sort / page change is sent to the
      database, which returns one page plus the count and totals of ALL matching rows.
      { load(q) -> { rows, total, summary, scope, options },   q = { search, filters, from, to, sort, dir, offset, limit, with_options }
        sortKeys: [column keys the database can sort by], reloadKey (change it to refetch after an action — page is kept),
        onResult(result) (parent shows totals / badges), label: "expenses" }
      Select filters take their options from the database (every value that exists, not only the loaded page),
      and ⬇ Export fetches every matching row, 1,000 at a time.
*/
// update183: text cells WRAP by default (long "Paid to"/query/note text used to force
// huge column widths and sideways scrolling). Numbers/dates and columns marked
// { nowrap: true } stay single-line. Column may set maxWidth (px) to override 260.
// v2 (same update): only free-text columns wrap (filter:"search" or wrap:true); short
// categorical columns, badges, numbers, dates, actions stay single-line at their natural
// width. Wrapped columns get a floor width so they never collapse to a sliver, and words
// break only at spaces (no mid-word "Indu-stries"). Table sizes to content, scrolls if wider.
function wrapCell(c) {
  if (c.nowrap) return false;
  if (c.wrap) return true;
  return c.filter === "search" && c.type !== "num" && c.type !== "date";
}

export default function DataTable({ columns, rows, exportName = "export", dateField, rightExtra, fixed, pageSize = 25, fill, server }) {
  const visCols = columns.filter(c => !c.hidden);   // update176: hidden cols export-only
  const [search, setSearch] = useState("");
  const [selects, setSelects] = useState({});      // {colKey: value}
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);
  // update310: reset to page 1 only when FILTERS change. A data refresh (rows array
  // replaced after approve / mark-posted / any action reload) keeps the current page —
  // render already clamps via curPage if the list shrinks below it.
  useEffect(() => { setPage(0); }, [search, selects, from, to]);

  // ---------------- update446: server mode state ----------------
  const [size, setSize] = useState(pageSize > 0 ? pageSize : 25);
  const [dSearch, setDSearch] = useState("");          // search text, debounced so each keystroke is not a query
  const [res, setRes] = useState(null);                // last { rows, total, summary, scope }
  const [srvOpts, setSrvOpts] = useState({});          // select options from the database
  const [srvErr, setSrvErr] = useState("");
  const [srvBusy, setSrvBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [retry, setRetry] = useState(0);
  const seq = useRef(0);
  const optsFor = useRef(null);                        // reloadKey the options were loaded for
  useEffect(() => { if (!server) return; const t = setTimeout(() => setDSearch(search.trim()), 350); return () => clearTimeout(t); }, [search, server]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (server) setPage(0); }, [sortKey, sortDir, size]);   // eslint-disable-line react-hooks/exhaustive-deps
  const srvQuery = () => ({ search: dSearch, from, to, sort: sortKey || "", dir: sortDir,
    filters: Object.fromEntries(Object.entries(selects).filter(([, v]) => v !== "" && v != null)) });
  useEffect(() => {
    if (!server) return;
    const my = ++seq.current;
    const withOpts = optsFor.current !== (server.reloadKey ?? 0);
    setSrvBusy(true); setSrvErr("");
    server.load({ ...srvQuery(), offset: page * size, limit: size, with_options: withOpts })
      .then(r => {
        if (my !== seq.current) return;             // a newer request already went out — ignore this answer
        if (withOpts) { optsFor.current = server.reloadKey ?? 0; setSrvOpts(r?.options || {}); }
        setRes(r); server.onResult?.(r);
        // the list shrank under the current page (e.g. after an approval) — step back to the last page
        const last = Math.max(0, Math.ceil((r?.total || 0) / size) - 1);
        if (page > last) setPage(last);
      })
      .catch(e => { if (my === seq.current) setSrvErr(e?.message || String(e)); })
      .finally(() => { if (my === seq.current) setSrvBusy(false); });
  }, [server ? 1 : 0, dSearch, JSON.stringify(selects), from, to, sortKey, sortDir, page, size, server?.reloadKey, retry]);   // eslint-disable-line react-hooks/exhaustive-deps

  // build select options from data
  const selectCols = columns.filter(c => c.filter === "select");
  const options = useMemo(() => {
    const o = {};
    selectCols.forEach(c => {
      if (server) {   // update446: [{ value, label }] — label goes through optionLabel ("true"/"false" arrive as text)
        o[c.key] = (srvOpts[c.key] || []).map(x => {
          const v = typeof x === "object" && x !== null ? String(x.v) : String(x);
          const raw = typeof x === "object" && x !== null ? x.l : x;
          const lv = raw === "true" ? true : raw === "false" ? false : raw;
          return { value: v, label: c.optionLabel ? c.optionLabel(lv) : String(raw) };
        });
        return;
      }
      o[c.key] = Array.from(new Set((rows || []).map(r => r[c.key]).filter(v => v !== null && v !== undefined && v !== "")))
        .map(v => ({ value: v, label: c.optionLabel ? c.optionLabel(v) : v }));
    });
    return o;
  }, [rows, srvOpts, server ? 1 : 0]);   // eslint-disable-line react-hooks/exhaustive-deps

  const searchCols = columns.filter(c => c.filter === "search").map(c => c.key);

  const filtered = useMemo(() => {
    if (server) return res?.rows || [];   // update446: the database already filtered, sorted and paged
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
  }, [rows, search, selects, from, to, sortKey, sortDir, res, server ? 1 : 0]);   // eslint-disable-line react-hooks/exhaustive-deps

  const canSort = c => c.sortable !== false && (!server || (server.sortKeys || []).includes(c.key));
  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  async function exportCSV() {
    let all = filtered;
    if (server) {   // update446: export EVERY matching row, not just the page on screen
      setExporting(true);
      try {
        all = [];
        const q = srvQuery();
        for (let off = 0; ; off += 1000) {
          const r = await server.load({ ...q, offset: off, limit: 1000 });
          all.push(...(r?.rows || []));
          if (!r?.rows || r.rows.length < 1000 || all.length >= (r.total || 0)) break;
        }
      } catch (e) { setSrvErr("Export failed: " + (e?.message || e)); setExporting(false); return; }
      setExporting(false);
    }
    const head = columns.map(c => c.label).join(",");
    const body = all.map(r =>
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

  const clearAll = () => { setSearch(""); setDSearch(""); setSelects({}); setFrom(""); setTo(""); setSortKey(null); };
  const hasFilters = search || from || to || Object.values(selects).some(Boolean);

  // pagination — display only; export always covers the full filtered set
  // update446: in server mode the count is the DATABASE count of all matching rows
  const paged = server ? true : pageSize > 0;
  const ps = server ? size : pageSize;
  const nAll = server ? (res?.total || 0) : filtered.length;
  const pageCount = paged ? Math.max(1, Math.ceil(nAll / ps)) : 1;
  const curPage = Math.min(page, pageCount - 1);
  const shown = server ? filtered : paged ? filtered.slice(curPage * ps, (curPage + 1) * ps) : filtered;
  const rangeFrom = nAll === 0 ? 0 : curPage * ps + 1;
  const rangeTo = server ? curPage * ps + shown.length : paged ? Math.min((curPage + 1) * ps, nAll) : nAll;

  return (
    <div style={fill ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } : undefined}>
      <div className={fill ? "dt-filterbar" : undefined}>
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
            {options[c.key]?.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {hasFilters && <button onClick={clearAll} style={{ fontSize: 12 }}>Clear</button>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {rightExtra}
          <button onClick={exportCSV} disabled={exporting} style={{ fontSize: 12.5 }}>{exporting ? "Exporting…" : "⬇ Export Excel"}</button>
        </div>
      </div>

      {server && srvErr && (
        <div className="note red" style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ flex: 1 }}>⚠ {srvErr}</span>
          <button style={{ fontSize: 12 }} onClick={() => setRetry(x => x + 1)}>Retry</button>
        </div>)}
      </div>
      <div className="dt-scroll" style={fill ? { maxHeight: "none", flex: 1, minHeight: 0, marginBottom: 4 } : undefined}>
      <table style={fixed ? { width: "100%", tableLayout: "fixed" } : { width: "max-content", minWidth: "100%" }} className="dt-compact">
        {fixed && <colgroup>{visCols.map(c => <col key={c.key} style={c.width ? { width: c.width } : {}} />)}</colgroup>}
        <thead>
          <tr>
            {visCols.map(c => (
              <th key={c.key} className={c.type === "num" ? "num" : ""}
                  onClick={() => canSort(c) && toggleSort(c.key)}
                  style={{ cursor: canSort(c) ? "pointer" : "default", userSelect: "none" }}>
                {c.label}{sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : (canSort(c) ? " ↕" : "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={columns.length} className="muted">{server && (!res || srvBusy) && !srvErr ? "Loading…" : server && srvErr ? "Could not load — see the message above." : "No matching records."}</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id ?? i}>
              {visCols.map(c => (
                <td key={c.key} className={c.type === "num" ? "num" : ""}
                    style={wrapCell(c) ? { whiteSpace: "normal", wordBreak: "normal", overflowWrap: "normal", lineHeight: 1.4, fontSize: 12.5, minWidth: c.minWidth || 170, maxWidth: c.maxWidth || 300 } : {}}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div style={fill ? { display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap", flexShrink: 0, paddingTop: 6, borderTop: "1px solid var(--border)" } : { display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <span className="muted">
          {server
            ? (res ? `Showing ${rangeFrom}–${rangeTo} of ${nAll.toLocaleString("en-IN")} ${server.label || "records"}` : "Loading…")
            : paged && filtered.length > pageSize
            ? `Showing ${rangeFrom}–${rangeTo} of ${filtered.length}` : `${filtered.length} of ${(rows||[]).length} records`}
          {server && res && hasFilters && res.scope?.total != null ? ` (filtered from ${Number(res.scope.total).toLocaleString("en-IN")})` : ""}
          {server && srvBusy && res ? " · updating…" : ""}
          {" · click a column heading to sort"}
        </span>
        {server && (
          <select value={size} onChange={e => setSize(Number(e.target.value))} style={{ fontSize: 12 }} title="Rows per page">
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>)}
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
