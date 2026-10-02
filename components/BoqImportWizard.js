"use client";
// update455: SMART BOQ IMPORT. Reads any client's BOQ Excel (KEI / SOUL / Brigade…), shows what it understood,
// lets the user correct a column with a dropdown, and saves the confirmed mapping as THIS SITE's template.
//   • site has a template and the header matches → silent import summary (one line) with "Review mapping"
//   • no template / low confidence / totals mismatch → mapping preview opens, confirm once, template saved
//   • the client's own TOTAL rows are used as a cross-check before anything is written
//   • rows that look like payment terms are kept OUT of the BOQ grid (Contract Terms card instead)
import { useEffect, useMemo, useRef, useState } from "react";
import { readWorkbook, analyseWorkbook, reclassify, templateFrom, ROLES, REQUIRED, fmtInr } from "@/lib/boqImport";
import { getBoqTemplate, getUnassignedBoqTemplates, assignBoqTemplate, saveBoqTemplate, logBoqImport, bulkImportBoq } from "@/lib/boq";

const TAG = {
  item: ["Line item", "#ECFDF5", "#065f46"], rate_only: ["Rate-only (qty 0)", "#fdf4ff", "#86198f"], section: ["Section", "#fff4e5", "#c9531f"],
  parent: ["Heading (children below)", "#eff6ff", "#1d4ed8"], subhead: ["Sub-heading", "#eff6ff", "#1d4ed8"], spec: ["Spec / make line (not imported)", "#f5f5f5", "#666"],
  total: ["Total row (check)", "#fef9c3", "#854d0e"], terms: ["Payment terms (kept out)", "#fee2e2", "#991b1b"], blank: ["", "#fff", "#999"],
};
const Badge = ({ conf }) => <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: conf >= 85 ? "#ECFDF5" : conf >= 60 ? "#fef9c3" : "#fee2e2", color: conf >= 85 ? "#065f46" : conf >= 60 ? "#854d0e" : "#991b1b" }}>{conf}%</span>;

export default function BoqImportWizard({ site, siteName, existingCount = 0, onClose, onDone }) {
  const [tpl, setTpl] = useState(undefined);          // undefined = loading, null = none
  const [unassigned, setUnassigned] = useState([]); const [assignId, setAssignId] = useState("");
  const [file, setFile] = useState(null); const [analysis, setAnalysis] = useState(null);
  const [view, setView] = useState("file");           // file | summary | mapping
  const [rules, setRules] = useState({ attach_specs: false, section_with_code: false });
  const [saveTpl, setSaveTpl] = useState(true); const [tplName, setTplName] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [showRows, setShowRows] = useState(18);
  const fileRef = useRef(null);

  useEffect(() => { getBoqTemplate(site).then(t => { setTpl(t); setTplName(t?.name || `${siteName} — BOQ template`); if (!t) getUnassignedBoqTemplates().then(setUnassigned); }); }, [site, siteName]);

  async function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return; setErr("");
    try {
      const buf = await f.arrayBuffer();
      const sheets = readWorkbook(new Uint8Array(buf));
      const a = analyseWorkbook(sheets, tpl?.template || null);
      setFile(f); setAnalysis(a);
      setView(a.usedTemplate && a.confident ? "summary" : "mapping");
    } catch (ex) { setErr("Could not read the file: " + (ex?.message || ex)); }
  }
  async function doAssign() {
    if (!assignId) return; setBusy(true);
    const r = await assignBoqTemplate(assignId, site); setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    const t = await getBoqTemplate(site); setTpl(t); setTplName(t?.name || ""); setUnassigned([]);
    if (analysis && file) { const sheets = readWorkbook(new Uint8Array(await file.arrayBuffer())); const a = analyseWorkbook(sheets, t?.template || null); setAnalysis(a); setView(a.usedTemplate && a.confident ? "summary" : "mapping"); }
  }
  const setRole = (sheetName, col, role) => setAnalysis(a => {
    const sheets = a.sheets.map(s => s.name !== sheetName ? s : reclassify(s, s.columns.map(c => c.col === col ? { ...c, role, conf: 100 } : (role !== "ignore" && c.role === role ? { ...c, role: "ignore", conf: 100 } : c)), rules));
    return refresh({ ...a, sheets });
  });
  const setInclude = (sheetName, inc) => setAnalysis(a => refresh({ ...a, sheets: a.sheets.map(s => s.name === sheetName ? { ...s, include: inc } : s) }));
  const setRule = (k, v) => { const nr = { ...rules, [k]: v }; setRules(nr); setAnalysis(a => a && refresh({ ...a, sheets: a.sheets.map(s => s.headerIdx >= 0 ? reclassify(s, s.columns, nr) : s) })); };
  function refresh(a) {
    const probs = [];
    a.sheets.filter(s => s.include).forEach(s => {
      REQUIRED.forEach(r => { if (s.roleOf[r] == null) probs.push(`${s.name}: no ${r} column`); });
      if (s.cls.totalsBad) probs.push(`${s.name}: ${s.cls.totalsBad} total row(s) do not match our sum`);
    });
    if (!a.sheets.some(s => s.include)) probs.push("No sheet selected");
    return { ...a, problems: probs, confident: probs.length === 0, items: a.sheets.filter(s => s.include).flatMap(s => s.cls.items) };
  }

  const included = useMemo(() => (analysis?.sheets || []).filter(s => s.include), [analysis]);
  const totals = useMemo(() => {
    const items = analysis?.items || []; const checks = included.flatMap(s => s.cls.checks);
    return { items: items.filter(i => !i.rate_only).length, rateOnly: items.filter(i => i.rate_only).length, sections: new Set(items.map(i => i.section).filter(Boolean)).size,
      amount: items.reduce((t, i) => t + (i.amount ?? (i.rate != null ? i.boq_qty * i.rate : 0)), 0), checks, ok: checks.filter(c => c.ok).length, bad: checks.filter(c => c.ok === false).length,
      skipped: included.reduce((t, s) => t + (s.cls.counts.spec || 0) + (s.cls.counts.terms || 0), 0), terms: included.reduce((t, s) => t + (s.cls.counts.terms || 0), 0) };
  }, [analysis, included]);
  const expected = tpl?.template?.expected;

  async function runImport() {
    setErr(""); if (!analysis?.items?.length) { setErr("Nothing to import."); return; }
    const missing = included.flatMap(s => REQUIRED.filter(r => s.roleOf[r] == null).map(r => `${s.name}: ${r}`));
    if (missing.length) { setErr("Set these columns first — " + missing.join(", ")); return; }
    setBusy(true);
    try {
      let templateId = tpl?.id || null;
      const main = included[0];
      if (saveTpl && main) {
        const t = templateFrom(main, analysis.sheets, rules);
        t.expected = { items: totals.items, rate_only: totals.rateOnly, sections: totals.sections, grand_total: totals.amount };
        const r = await saveBoqTemplate(site, tplName || `${siteName} — BOQ template`, t, tpl?.client_name || null, file?.name);
        if (!r.ok) { setErr(r.error); return; }
        templateId = r.id;
      }
      const grand = totals.checks.find(c => c.grand);
      const log = await logBoqImport(site, templateId, { file_name: file?.name, sheets: included.map(s => s.name), title: main?.title || null,
        items: totals.items, sections: totals.sections, rate_only: totals.rateOnly, skipped: totals.skipped, amount_total: totals.amount,
        totals_checked: totals.checks.filter(c => !c.grand).length, totals_ok: totals.ok, grand_total_matches: grand ? grand.ok : (totals.bad === 0 && totals.checks.length > 0 ? true : null),
        mapping_source: main?.source || "detected" });
      if (!log.ok) { setErr(log.error); return; }
      const rows = analysis.items.map(i => ({ item_code: i.item_code, description: i.spec ? `${i.description}\n${i.spec}` : i.description, unit: i.unit, boq_qty: i.boq_qty, rate: i.rate, section: i.section, basic_rate: i.basic_rate }));
      const res = await bulkImportBoq(rows, site, log.id);
      if (!res.ok && !res.created) { setErr(res.error || res.errors?.join("; ")); return; }
      onDone(`${res.created} BOQ lines imported into ${siteName} (${totals.sections} sections · ${fmtInr(totals.amount)}${totals.bad === 0 && totals.checks.length ? " · file totals match" : ""}).${saveTpl ? " Mapping saved as this site's template." : ""}`);
    } finally { setBusy(false); }
  }

  const wrap = c => (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }}>
      <div onClick={e => e.stopPropagation()} className="panel" style={{ width: "min(1180px,100%)", margin: 0, maxHeight: "94vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 style={{ margin: 0 }}>⬆ Import BOQ — {siteName}</h2><button type="button" onClick={onClose}>✕</button></div>
        {c}
      </div>
    </div>);

  // ------------------------------------------------------------ step 1: file
  if (view === "file") return wrap(<>
    <div className="muted" style={{ fontSize: 12.5, margin: "6px 0 12px" }}>
      {tpl === undefined ? "Checking this site's template…" : tpl
        ? <>This site has a saved template: <b>{tpl.name}</b>{tpl.client_name ? ` (${tpl.client_name})` : ""} — a file in that layout imports automatically; anything else opens the mapping preview.</>
        : <>No template yet for <b>{siteName}</b>. Upload the client's BOQ — the app will read it, show what it understood, and save your confirmation as this site's template.</>}
    </div>
    {tpl === null && unassigned.length > 0 && (
      <div className="note amber" style={{ fontSize: 12.5, marginBottom: 12 }}>A ready template is waiting to be assigned to a site:&nbsp;
        <select value={assignId} onChange={e => setAssignId(e.target.value)}><option value="">— choose —</option>{unassigned.map(t => <option key={t.id} value={t.id}>{t.name}{t.client_name ? ` · ${t.client_name}` : ""}</option>)}</select>&nbsp;
        <button type="button" disabled={!assignId || busy} onClick={doAssign}>Assign to {siteName}</button>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Assigning also brings that client's Contract Terms (LOI payment stages, retention, PBG) onto this site.</div>
      </div>)}
    {existingCount > 0 && <div className="note" style={{ fontSize: 12.5, marginBottom: 12 }}>This site already has <b>{existingCount}</b> BOQ lines. Importing <b>adds</b> lines — it never replaces or deletes. For a revised BOQ, amend changed lines instead.</div>}
    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={onFile} />
    <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: "34px 16px", textAlign: "center", cursor: "pointer", background: "#fafafa" }}>
      <div style={{ fontSize: 28 }}>📄</div><div style={{ fontWeight: 700 }}>Choose the client's BOQ Excel</div>
      <div className="muted" style={{ fontSize: 12 }}>.xlsx / .xls / .csv — any layout. Title rows, notes, make lines and total rows are understood, not rejected.</div>
    </div>
    {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
  </>);

  // ------------------------------------------------------------ step 2a: silent summary (template matched)
  if (view === "summary") return wrap(<>
    <div className="note" style={{ background: "#ECFDF5", border: "1px solid #6ee7b7", color: "#065f46", marginTop: 8 }}>
      <b>Recognised</b> — {file?.name} matches the <b>{tpl.name}</b> template. {included[0]?.title && <span className="muted" style={{ color: "#065f46" }}>{included[0].title}</span>}
    </div>
    <SummaryStrip totals={totals} expected={expected} />
    <ChecksList checks={totals.checks} />
    {existingCount > 0 && <div className="note amber" style={{ fontSize: 12.5 }}>This site already has {existingCount} lines — this import adds {totals.items + totals.rateOnly} more.</div>}
    {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
    <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="primary" disabled={busy} onClick={() => { setSaveTpl(false); runImport(); }}>{busy ? "Importing…" : `Import ${totals.items + totals.rateOnly} lines`}</button>
      <button type="button" onClick={() => setView("mapping")}>Review mapping</button>
      <span className="muted" style={{ fontSize: 12 }}>Spec / make lines ({totals.skipped}) are not imported as separate items.</span>
    </div>
  </>);

  // ------------------------------------------------------------ step 2b: mapping preview
  return wrap(<>
    <div className="muted" style={{ fontSize: 12.5, margin: "4px 0 10px" }}>{file?.name} · {analysis.sheets.length} sheet(s). Check each column's meaning, correct any dropdown, then import. Your confirmation becomes this site's template.</div>
    {analysis.problems.length > 0 && <div className="note amber" style={{ fontSize: 12.5 }}>⚠ {analysis.problems.join(" · ")}</div>}
    {analysis.sheets.map(s => (
      <div key={s.name} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, margin: "10px 0", opacity: s.include ? 1 : .6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label style={{ fontWeight: 700 }}><input type="checkbox" checked={!!s.include} disabled={s.headerIdx < 0} onChange={e => setInclude(s.name, e.target.checked)} style={{ accentColor: "var(--copper)", marginRight: 6 }} />Sheet “{s.name}”{s.headerIdx < 0 ? <span className="muted" style={{ fontWeight: 400 }}> — {s.reason}</span> : <span className="muted" style={{ fontWeight: 400 }}> — header on row {s.headerIdx + 1} · {s.cls.items.length} lines · {fmtInr(s.cls.grandTotal)}{s.source === "template" ? " · mapping from template" : ""}</span>}</label>
          {s.title && <span className="muted" style={{ fontSize: 11.5 }}>{s.title}</span>}
        </div>
        {s.headerIdx >= 0 && s.include && (
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 720 }}>
              <thead>
                <tr>{s.columns.map(c => (
                  <th key={c.col} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "2px solid var(--border)", verticalAlign: "top", minWidth: c.role === "description" ? 300 : 110 }}>
                    <div className="muted" style={{ fontSize: 10.5, fontWeight: 500 }}>Excel: {c.header || `column ${c.col + 1}`}</div>
                    <select value={c.role} onChange={e => setRole(s.name, c.col, e.target.value)} style={{ fontSize: 12, width: "100%", fontWeight: 700, color: c.role === "ignore" ? "#999" : undefined }}>
                      {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <div style={{ marginTop: 3 }}>{c.role !== "ignore" && <Badge conf={c.conf} />}{REQUIRED.includes(c.role) && <span className="muted" style={{ fontSize: 10, marginLeft: 4 }}>required</span>}</div>
                  </th>))}
                  <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "2px solid var(--border)", fontSize: 10.5 }} className="muted">Read as</th>
                </tr>
              </thead>
              <tbody>
                {s.cls.rows.filter(r => r.tag !== "blank").slice(0, showRows).map(r => { const [lbl, bg, fg] = TAG[r.tag] || TAG.blank; return (
                  <tr key={r.i} style={{ background: bg }}>
                    {s.columns.map(c => { const v = s.rows[r.i][c.col]; return <td key={c.col} style={{ padding: "3px 6px", borderBottom: "1px solid #eee", verticalAlign: "top", maxWidth: c.role === "description" ? 420 : 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: r.tag === "section" ? 700 : 400 }} title={v == null ? "" : String(v)}>{v == null ? "" : String(v)}</td>; })}
                    <td style={{ padding: "3px 6px", borderBottom: "1px solid #eee", color: fg, fontSize: 11, whiteSpace: "nowrap" }}>{lbl}{r.item?.item_code && r.tag !== "section" ? <span className="muted"> → {r.item.item_code}</span> : ""}{r.check ? (r.check.ok ? " ✓ matches" : r.check.ok === false ? ` ✗ ours ${fmtInr(r.check.ours)}` : "") : ""}</td>
                  </tr>); })}
              </tbody>
            </table>
            {s.cls.rows.length > showRows && <button type="button" style={{ fontSize: 11.5, marginTop: 6 }} onClick={() => setShowRows(n => n + 40)}>Show more rows ({s.cls.rows.filter(r => r.tag !== "blank").length - showRows} more)</button>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 11.5 }}>{Object.entries(s.cls.counts).filter(([k]) => k !== "blank").map(([k, n]) => <span key={k} style={{ background: TAG[k]?.[1], color: TAG[k]?.[2], padding: "1px 8px", borderRadius: 999 }}>{TAG[k]?.[0] || k}: {n}</span>)}</div>
          </div>)}
      </div>))}
    <SummaryStrip totals={totals} expected={expected} />
    <ChecksList checks={totals.checks} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10, fontSize: 12.5 }}>
      <div>
        <div className="muted" style={{ fontSize: 12 }}>Reading rules</div>
        <label style={{ display: "block" }}><input type="checkbox" checked={rules.attach_specs} onChange={e => setRule("attach_specs", e.target.checked)} style={{ accentColor: "var(--copper)" }} /> Append spec / make lines to the item's description (long descriptions)</label>
        <label style={{ display: "block" }}><input type="checkbox" checked={rules.section_with_code} onChange={e => setRule("section_with_code", e.target.checked)} style={{ accentColor: "var(--copper)" }} /> Prefix section names with their number (“1 · A) CP &amp; SANITARY FIXTURES”)</label>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Lettered children (a, b, c) under a numbered heading become “7.10a — heading text — child text”. Total rows are skipped and used as checks. Payment-terms rows are kept out of the grid.</div>
      </div>
      <div>
        <label style={{ display: "block", fontWeight: 700 }}><input type="checkbox" checked={saveTpl} onChange={e => setSaveTpl(e.target.checked)} style={{ accentColor: "var(--copper)" }} /> Save this mapping as {siteName}'s template</label>
        {saveTpl && <input value={tplName} onChange={e => setTplName(e.target.value)} style={{ width: "100%", marginTop: 4 }} placeholder="Template name" />}
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Next time a file with these headers is uploaded for this site, it imports without this screen.</div>
      </div>
    </div>
    {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
    <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="primary" disabled={busy || !analysis.items.length} onClick={runImport}>{busy ? "Importing…" : `Import ${totals.items + totals.rateOnly} lines`}</button>
      <button type="button" onClick={() => { setView("file"); setAnalysis(null); setFile(null); }}>Choose another file</button>
      {totals.bad > 0 && <span style={{ color: "#991b1b", fontSize: 12 }}>⚠ {totals.bad} total row(s) do not match — check the Quantity / Rate / Amount columns before importing.</span>}
    </div>
  </>);
}

function SummaryStrip({ totals, expected }) {
  const Box = ({ l, v, sub, warn }) => <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", minWidth: 130, background: warn ? "#fee2e2" : "#fff" }}><div className="muted" style={{ fontSize: 11 }}>{l}</div><div style={{ fontWeight: 800, fontSize: 16 }}>{v}</div>{sub && <div className="muted" style={{ fontSize: 10.5 }}>{sub}</div>}</div>;
  const exp = expected ? ` (template expects ${expected.items})` : "";
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      <Box l="Line items" v={totals.items} sub={`${totals.rateOnly} rate-only (qty 0)${exp}`} />
      <Box l="Sections" v={totals.sections} />
      <Box l="BOQ value" v={fmtInr(totals.amount)} sub={expected?.grand_total ? `template: ${fmtInr(expected.grand_total)}` : ""} warn={expected?.grand_total && Math.abs(expected.grand_total - totals.amount) > 1 ? true : false} />
      <Box l="File totals" v={totals.checks.filter(c => !c.grand).length ? `${totals.ok} ✓ / ${totals.bad} ✗` : "none in file"} sub="client's own total rows vs our sum" warn={totals.bad > 0} />
      <Box l="Skipped" v={totals.skipped} sub={`spec / make / note lines${totals.terms ? ` · ${totals.terms} payment-terms rows` : ""}`} />
    </div>);
}
function ChecksList({ checks }) {
  if (!checks.length) return null;
  return (
    <details style={{ marginTop: 8, fontSize: 12 }}>
      <summary className="muted" style={{ cursor: "pointer" }}>Total-row checks ({checks.length})</summary>
      <table style={{ borderCollapse: "collapse", marginTop: 4 }}><tbody>
        {checks.map((c, i) => <tr key={i}><td style={{ padding: "2px 8px" }}>{c.ok ? "✓" : c.ok === false ? "✗" : "•"}</td><td style={{ padding: "2px 8px" }}>{c.label.slice(0, 60)}</td><td style={{ padding: "2px 8px", textAlign: "right" }}>file {fmtInr(c.theirs)}</td><td style={{ padding: "2px 8px", textAlign: "right", color: c.ok === false ? "#991b1b" : undefined }}>ours {fmtInr(c.ours)}</td><td className="muted" style={{ padding: "2px 8px" }}>row {c.excelRow}</td></tr>)}
      </tbody></table>
    </details>);
}
