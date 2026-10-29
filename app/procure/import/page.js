"use client";
// update484: Import an indent from Excel / CSV — an extra way in. The manual indent and PO screens are unchanged.
// Upload → rows matched to Item Master (remembered texts, exact, fuzzy, then AI for the leftovers) → review
// (Yes / Change / Add item / To be sourced) → the normal indent → optional draft POs from past rates (pure SQL,
// lowest net rate per item), which wait for Director approval like any PO.
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSession, can, canAnySite } from "@/lib/auth";
import { getSitesList } from "@/lib/mobile";
import { searchItems } from "@/lib/stock";
import { getOpenIndents } from "@/lib/procure";
import { useCanViewPrices } from "@/lib/prices";
import {
  ACCEPT, readFile, sha256, checkDuplicate, uploadOriginal, createImport, matchFast, matchAI, getImport, listImports, getSettings,
  confirmRow, acceptGreen, markRow, setQty, requestItem, cancelImport, overlap, blockers, indentLines, createIndentFromImport,
  computeRates, lineRates, createDraftPOs,
} from "@/lib/indentImport";

const C = { green: "#15803D", greenBg: "#DCFCE7", amber: "#B45309", amberBg: "#FEF3C7", red: "#B91C1C", redBg: "#FEE2E2", blue: "#1D4ED8", blueBg: "#DBEAFE", grey: "#6B7280", greyBg: "#F3F4F6" };
const STATUS = {
  auto: { label: "Matched", fg: C.green, bg: C.greenBg }, accepted: { label: "Confirmed", fg: C.green, bg: C.greenBg },
  confirm: { label: "Please confirm", fg: C.amber, bg: C.amberBg }, not_found: { label: "Not in Item Master", fg: C.red, bg: C.redBg },
  to_source: { label: "To be sourced", fg: C.blue, bg: C.blueBg }, pending: { label: "Matching", fg: C.grey, bg: C.greyBg },
};
const LAYER = { alias: "remembered", exact: "exact name", fuzzy: "similar name", vector: "AI search", ai: "AI", manual: "chosen by you" };
const chip = (s, n) => <span key={s} style={{ background: STATUS[s].bg, color: STATUS[s].fg, borderRadius: 999, padding: "4px 12px", fontSize: 12.5, fontWeight: 700 }}>{n} {STATUS[s].label.toLowerCase()}</span>;
const fmtD = d => d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const inr = v => v == null ? "—" : "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function Page() { return <Suspense fallback={null}><ImportPage /></Suspense>; }

function ImportPage() {
  const params = useSearchParams(); const router = useRouter();
  const [session, setSession] = useState(null);
  useEffect(() => { setSession(getSession()); }, []);
  const id = params.get("id"), indent = params.get("indent");
  const canRaise = s => !!s && (s.role === "director" || canAnySite(s, "indent", "create") || canAnySite(s, "indent", "manage"));
  if (!session) return <div className="layout"><Sidebar /><main className="main"><div className="muted" style={{ padding: 20 }}>Loading…</div></main></div>;
  if (!canRaise(session)) return <div className="layout"><Sidebar /><main className="main"><div className="panel" style={{ margin: 20 }}>You do not have the right to raise indents, so Excel import is not available for your login.</div></main></div>;
  return (
    <div className="layout"><Sidebar /><main className="main">
      {id ? <Review id={Number(id)} session={session} go={q => router.push("/procure/import" + q)} />
        : indent ? <DraftPOs indentId={Number(indent)} session={session} back={() => router.push("/procure/import")} />
        : <Upload session={session} go={q => router.push("/procure/import" + q)} />}
    </main></div>
  );
}

// ============================================================== step 1: upload
function Upload({ session, go }) {
  const [sites, setSites] = useState([]); const [site, setSite] = useState(""); const [need, setNeed] = useState(""); const [urgent, setUrgent] = useState(false);
  const [file, setFile] = useState(null); const [book, setBook] = useState(null); const [sheet, setSheet] = useState(0); const [map, setMap] = useState(null);
  const [dup, setDup] = useState(null); const [hash, setHash] = useState(""); const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const [recent, setRecent] = useState([]); const [openInd, setOpenInd] = useState([]); const [indPick, setIndPick] = useState("");
  const canSite = s => session.role === "director" || can(session, "indent", "create", s.id) || can(session, "indent", "manage", s.id);
  useEffect(() => {
    getSitesList().then(list => { const ok = (list || []).filter(canSite); setSites(ok); const cur = Number(session.currentSite); setSite(String(ok.find(s => s.id === cur)?.id || ok[0]?.id || "")); }).catch(() => setSites([]));
    listImports().then(setRecent);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!site) return; getOpenIndents(Number(site)).then(list => setOpenInd((list || []).filter(i => ["open", "quoting"].includes(i.status)).slice(0, 60))).catch(() => setOpenInd([])); }, [site]);

  async function pick(f) {
    setErr(""); setDup(null); setBook(null); setFile(f || null); if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { setErr("Choose an .xlsx, .xls or .csv file."); return; }
    if (f.size > 8 * 1024 * 1024) { setErr("This file is larger than 8 MB."); return; }
    setBusy("Reading the file…");
    try {
      const { buf, sheets } = await readFile(f);
      if (!sheets.length) { setErr("The file has no rows."); setBusy(""); return; }
      const best = Math.max(0, sheets.findIndex(s => !s.analysis.needs_mapping && s.analysis.lines.length));
      const h = await sha256(buf); setHash(h); setDup(await checkDuplicate(h));   // known before the Match button appears
      setBook(sheets); setSheet(best); setMap(sheets[best].analysis.map);
    } catch (e) { setErr("Could not read this file: " + String(e?.message || e).slice(0, 120)); }
    setBusy("");
  }
  const cur = book?.[sheet];
  const [remapped, setRemapped] = useState(null);
  useEffect(() => { setRemapped(null); if (!cur || !map || map === cur.analysis.map) return;
    import("@/lib/importParse.mjs").then(m => setRemapped({ ...m.extractLines(cur.rows, cur.analysis.header_row ?? -1, map), header_row: cur.analysis.header_row, map })); }, [cur, map]);
  const analysis = cur && map === cur.analysis.map ? cur.analysis : null;
  const view = remapped || analysis;
  const cols = cur ? Math.max(0, ...cur.rows.slice(0, 40).map(r => (r || []).length)) : 0;
  const headerCells = cur ? (cur.rows[cur.analysis.header_row ?? 0] || []) : [];
  const colName = c => `Column ${String.fromCharCode(65 + (c % 26))}${headerCells[c] ? " · " + String(headerCells[c]).slice(0, 24) : ""}`;
  const bad = view ? view.lines.filter(l => l.problems.length).length : 0;

  async function start() {
    if (!site) { setErr("Choose the site."); return; }
    if (!view?.lines?.length) { setErr("No material rows found — check the column mapping."); return; }
    if (view.lines.length > 500) { setErr(`This file has ${view.lines.length} rows. The limit is 500 rows per file — split it into two files.`); return; }
    if (dup && !window.confirm(`This same file was already imported on ${new Date(dup.at).toLocaleString("en-IN")} by ${dup.by || "someone"}${dup.indent_no ? " (indent " + dup.indent_no + ")" : ""}. Import it again?`)) return;
    setErr(""); setBusy("Saving the file…");
    const up = await uploadOriginal(file);
    setBusy("Saving the rows…");
    const res = await createImport({ site_id: Number(site), required_by: need || null, urgency: urgent ? "urgent" : "normal", file_name: file.name, file_path: up.path, file_hash: hash,
      sheet_name: cur.name, header_row: view.header_row, col_map: view.map }, view.lines.map(l => ({ row_no: l.row_no, raw_text: l.raw_text, item_text: l.item_text, qty: l.qty, unit: l.unit, remarks: l.remarks })));
    if (!res.ok) { setErr(res.error); setBusy(""); return; }
    setBusy("Matching with Item Master…");
    await matchFast(res.import_id);
    go("?id=" + res.import_id);
  }

  return (
    <>
      <div className="page-head"><h1>Import indent from Excel</h1><div className="muted" style={{ fontSize: 13 }}>Upload a material list; each row is matched to Item Master and becomes a normal indent.</div>
        {["director", "it_executive", "ho_admin"].includes(session.role) && <a href="/procure/import/admin" style={{ fontSize: 13 }}>Settings and learning</a>}</div>
      <div className="panel" style={{ maxWidth: 980 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end" }}>
          <label>Site<select value={site} onChange={e => setSite(e.target.value)} style={{ width: "100%" }}>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Needed by<input type="date" value={need} onChange={e => setNeed(e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 8 }}><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} /> Urgent</label>
        </div>
        <div style={{ marginTop: 14, border: "2px dashed var(--border)", borderRadius: 12, padding: 18, textAlign: "center" }}>
          <input type="file" accept={ACCEPT} onChange={e => pick(e.target.files?.[0])} data-import-file="" />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>.xlsx, .xls or .csv · up to 500 rows · columns like Description / Item, Qty, Unit, Size, Make, Remarks are found automatically</div>
        </div>
        {busy && <div className="muted" style={{ marginTop: 10 }}>{busy}</div>}
        {err && <div role="alert" style={{ marginTop: 10, background: C.redBg, color: C.red, borderRadius: 8, padding: "8px 12px" }}>{err}</div>}
        {dup && <div style={{ marginTop: 10, background: C.amberBg, color: C.amber, borderRadius: 8, padding: "8px 12px" }} data-dup="">This exact file was imported before — {new Date(dup.at).toLocaleString("en-IN")}{dup.by ? " by " + dup.by : ""}{dup.indent_no ? " · indent " + dup.indent_no : ""}. You can still import it again.</div>}
        {book && (
          <div style={{ marginTop: 14 }}>
            {book.length > 1 && <label style={{ marginRight: 12 }}>Sheet <select value={sheet} onChange={e => { const i = Number(e.target.value); setSheet(i); setMap(book[i].analysis.map); }}>{book.map((s, i) => <option key={i} value={i}>{s.name} ({s.analysis.lines.length} rows)</option>)}</select></label>}
            {(cur?.analysis.needs_mapping || remapped) && <div style={{ background: C.amberBg, color: C.amber, borderRadius: 8, padding: "8px 12px", margin: "8px 0", fontSize: 13 }}>The column headings were not recognised — tell us which column is which.</div>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0" }}>
              {[["item", "Item / description"], ["qty", "Quantity"], ["unit", "Unit"]].map(([k, label]) => (
                <label key={k} style={{ fontSize: 12.5 }}>{label}<br /><select value={map?.[k] ?? ""} onChange={e => setMap({ ...map, [k]: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">—</option>{Array.from({ length: cols }, (_, c) => <option key={c} value={c}>{colName(c)}</option>)}</select></label>))}
              <label style={{ fontSize: 12.5 }}>Size / make columns (added to the item text)<br />
                <select multiple size={3} value={(map?.attrs || []).map(String)} onChange={e => setMap({ ...map, attrs: [...e.target.selectedOptions].map(o => Number(o.value)) })} style={{ minWidth: 180 }}>
                  {Array.from({ length: cols }, (_, c) => <option key={c} value={c}>{colName(c)}</option>)}</select></label>
            </div>
            {view && <>
              <div style={{ fontSize: 13, margin: "6px 0" }}><b>{view.lines.length}</b> material rows found{view.skipped ? ` · skipped ${view.skipped.blank} blank, ${view.skipped.total} total${view.skipped.header ? ", " + view.skipped.header + " repeated header" : ""}` : ""}{bad ? <span style={{ color: C.red }}> · {bad} with a quantity problem (you can fix them on the next screen)</span> : null}</div>
              <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}><thead><tr style={{ textAlign: "left", color: C.grey }}><th style={{ padding: 6 }}>Row</th><th>Item text</th><th>Qty</th><th>Unit</th><th>Remarks</th></tr></thead>
                  <tbody>{view.lines.slice(0, 40).map(l => <tr key={l.row_no} style={{ borderTop: "1px solid var(--border)" }}><td style={{ padding: 6 }}>{l.row_no}</td><td>{l.item_text}</td><td style={{ color: l.problems.length ? C.red : undefined }}>{l.qty ?? "?"}</td><td>{l.unit}</td><td className="muted">{l.remarks}</td></tr>)}</tbody></table>
                {view.lines.length > 40 && <div className="muted" style={{ padding: 6, fontSize: 12 }}>…and {view.lines.length - 40} more</div>}
              </div>
              <button className="primary" style={{ marginTop: 12, minHeight: 42, padding: "8px 22px" }} disabled={!!busy || !view.lines.length} onClick={start} data-start="">Match {view.lines.length} rows with Item Master</button>
            </>}
          </div>
        )}
      </div>

      <div className="panel" style={{ maxWidth: 980, marginTop: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Draft POs for an existing indent</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Prepares draft POs from past rates (lowest net rate per item, recent rates only). They wait for Director approval.</div>
        <select value={indPick} onChange={e => setIndPick(e.target.value)} style={{ minWidth: 280 }}><option value="">Choose an open indent…</option>{openInd.map(i => <option key={i.id} value={i.id}>{i.indent_no} · {i.status}</option>)}</select>
        <button style={{ marginLeft: 8 }} disabled={!indPick} onClick={() => go("?indent=" + indPick)}>Check rates</button>
      </div>

      {recent.length > 0 && <div className="panel" style={{ maxWidth: 980, marginTop: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Recent imports</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}><tbody>{recent.map(r => <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
          <td style={{ padding: 6 }}>{new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td><td>{r.file_name}</td><td>{r.site_name}</td><td>{r.row_count} rows</td>
          <td>{r.status === "indent_created" ? <b>{r.indent_no}</b> : r.status === "cancelled" ? <span className="muted">cancelled</span> : <span style={{ color: C.amber }}>in review</span>}</td><td className="muted">{r.by_name}</td>
          <td><button style={{ fontSize: 12 }} onClick={() => go("?id=" + r.id)}>Open</button></td></tr>)}</tbody></table>
      </div>}
    </>
  );
}

// ============================================================== steps 4–7: review and create the indent
function Review({ id, session, go }) {
  const [data, setData] = useState(null); const [err, setErr] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(""); const [picker, setPicker] = useState(null); const [settings, setSettings] = useState(null); const [filter, setFilter] = useState("");
  const [overlaps, setOverlaps] = useState([]); const [done, setDone] = useState(null); const ranAI = useRef(false);
  const canAddMaster = session.role === "director" || canAnySite(session, "stock", "manage");
  async function load() { const d = await getImport(id); if (d.error) { setErr(d.error); return null; } setData(d); return d; }
  useEffect(() => { (async () => {
    setSettings(await getSettings());
    let d = await load(); if (!d) return;
    if (d.rows.some(r => r.status === "pending")) { await matchFast(id); d = await load(); }
    if (d && d.import.status === "review" && !ranAI.current && !d.import.ai_status && d.rows.some(r => ["confirm", "not_found"].includes(r.status) && !r.confirmed_by && r.match_layer !== "alias")) {
      ranAI.current = true; setAi(`AI is checking ${d.rows.filter(r => ["confirm", "not_found"].includes(r.status)).length} doubtful rows…`);
      const res = await matchAI(id);
      setAi(res.ok ? (res.skipped ? "AI not used: " + res.skipped : `AI checked ${res.rows || 0} rows${res.improved ? " · " + res.improved + " improved" : ""}`) : "AI could not run (" + res.error + ") — please confirm those rows yourself.");
      await load();
    }
  })(); }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!data) return; const ids = data.rows.map(r => r.final_item_id || r.suggested_item_id).filter(Boolean); if (ids.length) overlap(data.import.site_id, ids).then(setOverlaps); }, [data?.import?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="panel" style={{ margin: 20, color: C.red }}>{err}</div>;
  if (!data) return <div className="muted" style={{ padding: 20 }}>Loading…</div>;
  const imp = data.import, rows = data.rows, open = imp.status === "review";
  const n = s => rows.filter(r => r.status === s).length;
  const b = blockers(rows);
  const shown = filter ? rows.filter(r => filter === "green" ? ["auto", "accepted"].includes(r.status) : r.status === filter) : rows;
  const greenable = rows.filter(r => r.status === "auto" || (r.status === "confirm" && Number(r.confidence) >= Number(settings?.auto_threshold || 0.92) && !r.guard && r.suggested_item_id)).length;
  const act = async (fn, msg) => { setBusy(true); setNote(""); const r = await fn(); setBusy(false); if (r && r.ok === false) setErr(r.error); else { setErr(""); if (msg) setNote(typeof msg === "function" ? msg(r) : msg); } await load(); };

  async function create(withPOs) {
    setErr(""); setNote("");
    if (overlaps.length && !window.confirm(`Open indent${overlaps.length > 1 ? "s" : ""} for this site already contain some of these items: ${overlaps.map(o => o.indent_no + " (" + o.items + " items)").join(", ")}. Create the indent anyway?`)) return;
    setBusy(true);
    let res = await createIndentFromImport({ ...imp }, rows, session);
    if (!res.ok && res.duplicate && window.confirm(res.error + "\n\nCreate it anyway?")) res = await createIndentFromImport({ ...imp }, rows, session, { allowDuplicate: true });
    if (!res.ok) { setBusy(false); setErr(res.error); return; }
    let po = null;
    if (withPOs && res.indent_id) po = await createDraftPOs(res.indent_id);
    setBusy(false); setDone({ ...res, po }); await load();
  }

  if (!open || done) return <Created imp={imp} rows={rows} done={done} session={session} go={go} />;
  return (
    <>
      <div className="page-head"><h1>Review: {imp.file_name}</h1><div className="muted" style={{ fontSize: 13 }}>{imp.site_name} · needed by {fmtD(imp.required_by)}{imp.urgency === "urgent" ? " · URGENT" : ""} · {rows.length} rows</div></div>
      {settings?.shadow_mode && <div style={{ background: C.blueBg, color: C.blue, borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>Learning phase: only items confirmed before are accepted automatically. Strong suggestions still need your Yes — every Yes teaches the next import.</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }} data-chips="">
        {chip("auto", n("auto") + n("accepted"))}{chip("confirm", n("confirm"))}{chip("not_found", n("not_found"))}{n("to_source") ? chip("to_source", n("to_source")) : null}
        {ai && <span className="muted" style={{ fontSize: 12.5 }} data-ai="">{ai}</span>}
        <span style={{ flex: 1 }} />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ fontSize: 12.5 }}><option value="">All rows</option><option value="confirm">Please confirm</option><option value="not_found">Not in Item Master</option><option value="green">Matched</option><option value="to_source">To be sourced</option></select>
        <button disabled={busy || !greenable} onClick={() => act(() => acceptGreen(id), r => `${r.n} rows confirmed.`)} data-accept-green="">Accept all green ({greenable})</button>
      </div>
      {err && <div role="alert" style={{ background: C.redBg, color: C.red, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>{err}</div>}
      {note && <div style={{ background: C.greenBg, color: C.green, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>{note}</div>}
      <div className="panel" style={{ overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }} data-review="">
          <thead><tr style={{ textAlign: "left", color: C.grey, background: "var(--panel-2, #F9FAFB)" }}><th style={{ padding: "8px 10px" }}>#</th><th>Excel text</th><th>Matched item</th><th style={{ textAlign: "right" }}>Qty</th><th>Unit</th><th>Status</th><th style={{ minWidth: 220 }}></th></tr></thead>
          <tbody>{shown.map(r => <Row key={r.id} r={r} busy={busy} canAddMaster={canAddMaster} act={act} pick={() => setPicker(r)} />)}</tbody>
        </table>
      </div>
      <div style={{ position: "sticky", bottom: 0, background: "var(--bg, #fff)", padding: "12px 0", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="primary" style={{ minHeight: 42, padding: "8px 20px" }} disabled={busy || !b.ok} onClick={() => create(false)} data-create="">Create indent</button>
        <button style={{ minHeight: 42, padding: "8px 20px" }} disabled={busy || !b.ok} onClick={() => create(true)} data-create-po="">Create indent + draft POs</button>
        <button style={{ minHeight: 42 }} disabled={busy} onClick={async () => { if (window.confirm("Discard this import?")) { await cancelImport(id); go(""); } }}>Discard</button>
        <span className="muted" style={{ fontSize: 12.5 }}>{b.ok ? `${indentLines(rows).length} lines will go into the indent.` : `${b.open ? b.open + " row" + (b.open > 1 ? "s" : "") + " still need a decision" : ""}${b.open && b.badQty ? " · " : ""}${b.badQty ? b.badQty + " with a quantity problem" : ""}.`}</span>
        {overlaps.length > 0 && <span style={{ color: C.amber, fontSize: 12.5 }}>Open indent {overlaps.map(o => o.indent_no).join(", ")} already has some of these items.</span>}
      </div>
      {picker && <Picker row={picker} close={() => setPicker(null)} choose={async it => { const r = picker; setPicker(null); await act(() => confirmRow(r.id, it.id, r.suggested_item_id && r.suggested_item_id !== it.id ? "change" : "yes"), "Saved — this text will be remembered."); }} />}
    </>
  );
}

function Row({ r, busy, canAddMaster, act, pick }) {
  const st = STATUS[r.status] || STATUS.pending;
  const [qty, setQ] = useState(r.qty ?? ""); const badQty = !(Number(r.qty) > 0);
  const name = r.final_name || r.suggested_name;
  return (
    <tr style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }} data-row={r.id} data-status={r.status}>
      <td style={{ padding: "8px 10px", color: C.grey }}>{r.row_no}</td>
      <td style={{ maxWidth: 260 }}>{r.item_text}{r.remarks ? <div className="muted" style={{ fontSize: 11.5 }}>{r.remarks}</div> : null}</td>
      <td style={{ maxWidth: 340 }}>
        {r.status === "to_source" ? <span className="muted">Free-text line, flagged "not in Item Master"</span> : name ? <b style={{ fontWeight: 600 }}>{name}</b> : <span className="muted">—</span>}
        {r.status === "not_found" ? <div className="muted" style={{ fontSize: 11.5 }}>{r.reason || "No close item"}{(r.candidate_items || []).some(c => !c.hard) ? " · Change shows the closest items" : ""}</div>
          : r.status !== "to_source" && (r.match_layer || r.confidence != null) && <div className="muted" style={{ fontSize: 11.5 }}>{LAYER[r.match_layer] || r.match_layer}{r.confidence != null && r.match_layer !== "alias" ? " · " + Math.round(Number(r.confidence) * 100) + "%" : ""}{r.reason ? " · " + r.reason : ""}</div>}
        {r.guard && name && r.status !== "not_found" && <div style={{ fontSize: 11.5, color: C.amber }}>Check: {r.guard}</div>}
      </td>
      <td style={{ textAlign: "right" }}>{badQty && ["confirm", "not_found", "auto", "accepted", "to_source"].includes(r.status)
        ? <span><input value={qty} onChange={e => setQ(e.target.value)} style={{ width: 70, borderColor: C.red }} aria-label="quantity" /> <button style={{ fontSize: 11 }} disabled={busy} onClick={() => act(() => setQty(r.id, qty, r.unit))}>Save</button></span>
        : Number(r.qty).toLocaleString("en-IN")}</td>
      <td>{r.unit || <span className="muted">{r.final_unit || r.suggested_unit || "—"}</span>}</td>
      <td><span style={{ background: st.bg, color: st.fg, borderRadius: 999, padding: "2px 10px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{st.label}</span></td>
      <td style={{ whiteSpace: "nowrap" }}>
        {r.status === "confirm" && r.suggested_item_id && <button className="primary" style={{ fontSize: 12, marginRight: 4 }} disabled={busy} onClick={() => act(() => confirmRow(r.id, r.suggested_item_id, "yes"), "Confirmed.")} data-yes="">Yes</button>}
        {["confirm", "not_found", "auto", "accepted"].includes(r.status) && <button style={{ fontSize: 12, marginRight: 4 }} disabled={busy} onClick={pick} data-change="">Change</button>}
        {["confirm", "not_found"].includes(r.status) && (canAddMaster
          ? <a href="/items" target="_blank" rel="noreferrer" style={{ fontSize: 12, marginRight: 4 }} title="Opens Item Master in a new tab. Add the item there, then use Change to pick it.">+ Add item</a>
          : <button style={{ fontSize: 12, marginRight: 4 }} disabled={busy} onClick={() => act(() => requestItem(r.id), "Request sent to the Item Master admin.")}>Request new item</button>)}
        {["confirm", "not_found"].includes(r.status) && <button style={{ fontSize: 12 }} disabled={busy} onClick={() => act(() => markRow(r.id, "to_source"))} data-source="">To be sourced</button>}
        {["accepted", "to_source"].includes(r.status) && <button style={{ fontSize: 12 }} disabled={busy} onClick={() => act(() => markRow(r.id, "reopen"))}>Undo</button>}
      </td>
    </tr>
  );
}

function Picker({ row, close, choose }) {
  const [q, setQ] = useState(row.item_text.replace(/[^\w\s.]/g, " ").split(/\s+/).filter(w => w.length > 2).slice(0, 3).join(" "));
  const [res, setRes] = useState([]); const [loading, setLoading] = useState(false);
  useEffect(() => { const t = setTimeout(async () => { if (q.trim().length < 2) { setRes([]); return; } setLoading(true); setRes(await searchItems(q, 40).catch(() => [])); setLoading(false); }, 250); return () => clearTimeout(t); }, [q]);
  const cands = (row.candidate_items || []).filter(c => !c.hard);
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.45)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 12px" }} onClick={close}>
      <div className="panel" style={{ width: "min(720px, 100%)", maxHeight: "82vh", overflow: "auto" }} onClick={e => e.stopPropagation()} data-picker="">
        <div style={{ fontWeight: 700 }}>Choose the Item Master item for</div><div style={{ margin: "2px 0 10px" }}>"{row.item_text}"</div>
        {cands.length > 0 && <><div className="muted" style={{ fontSize: 12 }}>Closest matches</div>{cands.map(c => <PickRow key={c.id} it={{ id: c.id, display_name: c.name, unit: c.unit }} note={c.soft?.join("; ")} choose={choose} />)}</>}
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search Item Master…" style={{ width: "100%", margin: "10px 0" }} data-picker-q="" />
        {loading ? <div className="muted">Searching…</div> : res.map(it => <PickRow key={it.id} it={it} choose={choose} />)}
        <div style={{ textAlign: "right", marginTop: 10 }}><button onClick={close}>Close</button></div>
      </div>
    </div>
  );
}
const PickRow = ({ it, note, choose }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: "1px solid var(--border)", alignItems: "center" }}>
    <div style={{ fontSize: 13 }}>{it.display_name}<span className="muted"> · {it.unit}</span>{note ? <div style={{ fontSize: 11, color: C.amber }}>{note}</div> : null}</div>
    <button style={{ fontSize: 12 }} onClick={() => choose(it)}>Choose</button>
  </div>
);

// ============================================================== after the indent: draft POs
function Created({ imp, rows, done, session, go }) {
  return (
    <>
      <div className="page-head"><h1>Indent {done?.indent_no || imp.indent_no} created</h1><div className="muted" style={{ fontSize: 13 }}>From {imp.file_name} · {imp.site_name} · {rows.filter(r => ["auto", "accepted", "to_source"].includes(r.status)).length} lines{rows.some(r => r.status === "to_source") ? ` (${rows.filter(r => r.status === "to_source").length} to be sourced)` : ""}</div></div>
      {done?.warning && <div style={{ background: C.amberBg, color: C.amber, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>{done.warning}</div>}
      <DraftPOs indentId={done?.indent_id || imp.indent_id} session={session} first={done?.po} back={() => go("")} embedded />
    </>
  );
}

function DraftPOs({ indentId, session, first, back, embedded }) {
  const [lines, setLines] = useState(null); const [res, setRes] = useState(first || null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(first && first.ok === false ? first.error : "");
  const [indentNo, setIndentNo] = useState(""); const prices = useCanViewPrices();
  async function load() { const c = await computeRates(indentId); if (c && c.ok === false) { setErr(c.error); setLines([]); return; } setLines(await lineRates(indentId)); }
  useEffect(() => { load(); }, [indentId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (res?.indent_no) setIndentNo(res.indent_no); }, [res]);
  async function draft() { setBusy(true); setErr(""); const r = await createDraftPOs(indentId); setBusy(false); if (!r.ok) setErr(r.error); else setRes(r); await load(); }
  const STAT = { ok: ["Rate found", C.green, C.greenBg], old_rate: ["Old rate, needs quote", C.amber, C.amberBg], no_rate: ["No past rate", C.grey, C.greyBg], unit_mismatch: ["Past rate in another unit", C.amber, C.amberBg],
                 covered: ["Already on a PO", C.blue, C.blueBg], no_item: ["Not in Item Master", C.red, C.redBg], not_computed: ["—", C.grey, C.greyBg] };
  const ready = (lines || []).filter(l => l.status === "ok" && !l.po_id).length;
  return (
    <>
      {!embedded && <div className="page-head"><h1>Draft POs from past rates{indentNo ? " · " + indentNo : ""}</h1><button onClick={back}>Back</button></div>}
      <div className="panel">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Draft POs from past rates</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>For each item: the latest rate from every vendor (approved POs and saved quotes, active vendors, same unit, inside the rate window), then the lowest net rate before GST. One draft PO per vendor. Nothing is sent to a vendor; every draft waits for Director approval, and rates stay editable with a logged reason.</div>
        {err && <div role="alert" style={{ background: C.redBg, color: C.red, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>{err}</div>}
        {res?.pos && <div style={{ background: C.greenBg, color: C.green, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }} data-drafts="">
          {res.pos.length ? <>{res.pos.length} draft PO{res.pos.length > 1 ? "s" : ""} created and sent to the Director for approval: {res.pos.map(p => `${p.po_no} (${p.vendor}, ${p.lines} line${p.lines === 1 ? "" : "s"})`).join(" · ")}. <a href="/procure">Open Procurement & POs</a></> : "No line had a usable past rate, so no draft PO was made — the indent goes through the normal quoting."}
          {(Number(res.old_rate) || Number(res.no_rate) || Number(res.unit_mismatch)) ? <div style={{ fontSize: 12.5, marginTop: 4 }}>Still on the indent for quotes: {Number(res.old_rate) || 0} old rate, {Number(res.no_rate) || 0} no past rate, {Number(res.unit_mismatch) || 0} other unit.</div> : null}
        </div>}
        {lines == null ? <div className="muted">Checking past rates…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }} data-rates="">
              <thead><tr style={{ textAlign: "left", color: C.grey }}><th style={{ padding: 6 }}>Item</th><th style={{ textAlign: "right" }}>Qty</th><th>Status</th><th>Vendor</th>{prices && <><th style={{ textAlign: "right" }}>List</th><th style={{ textAlign: "right" }}>Disc</th><th style={{ textAlign: "right" }}>Net</th></>}<th>Source</th><th>Flags</th><th>Draft PO</th></tr></thead>
              <tbody>{lines.map(l => { const s = STAT[l.status] || STAT.not_computed; return (
                <tr key={l.indent_item_id} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                  <td style={{ padding: 6, maxWidth: 300 }}>{l.item_name}</td><td style={{ textAlign: "right" }}>{Number(l.qty).toLocaleString("en-IN")} {l.unit}</td>
                  <td><span style={{ background: s[2], color: s[1], borderRadius: 999, padding: "2px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{s[0]}</span></td>
                  <td>{l.vendor_name || "—"}{l.alt?.vendor ? <div className="muted" style={{ fontSize: 11 }}>next: {l.alt.vendor}{prices && l.alt.net_rate != null ? " " + inr(l.alt.net_rate) : ""}</div> : null}</td>
                  {prices && <><td style={{ textAlign: "right" }}>{inr(l.list_rate)}</td><td style={{ textAlign: "right" }}>{l.discount_pct != null ? Number(l.discount_pct) + "%" : "—"}</td><td style={{ textAlign: "right" }}><b>{inr(l.net_rate)}</b></td></>}
                  <td>{l.source_no ? <>{l.source_kind === "quote" ? "Quote, " : ""}{l.source_no}<div className="muted" style={{ fontSize: 11 }}>{fmtD(l.source_date)}{l.source_qty ? " · qty " + Number(l.source_qty).toLocaleString("en-IN") : ""}</div></> : "—"}</td>
                  <td style={{ fontSize: 11.5 }}>{[l.one_vendor && "only one vendor in history", l.qty_flag && "source qty very different (bulk / small order rate)", l.price_rise_pct > 0 && `up ${l.price_rise_pct}% vs this vendor's previous rate`].filter(Boolean).map((t, i) => <div key={i} style={{ color: C.amber }}>{t}</div>)}</td>
                  <td>{l.po_no || "—"}</td>
                </tr>); })}</tbody>
            </table>
          </div>)}
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="primary" disabled={busy || !ready} onClick={draft} data-make-drafts="">Create draft POs ({ready} line{ready === 1 ? "" : "s"} with a rate)</button>
          {embedded && <button onClick={back}>New import</button>}
        </div>
      </div>
    </>
  );
}
