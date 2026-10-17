"use client";
// update184: GRN REGISTER — every goods receipt, who entered it, both challan numbers,
// downloadable challan pages, expandable item list. Quantities are the stored GRN
// transaction rows (historical) — never recomputed from current stock.
import { useCanViewPrices } from "@/lib/prices";   // update463
import { Fragment, useEffect, useMemo, useState } from "react";
import { getGrnRegister, getGrnDocUrl, grnDocName, cancelGrn, getGrnHistory, migrateGrnDocsToPrivate, GRN_BUCKET, getVendorReturnHistory, editGrnHeader, addGrnDocs, setRtvStatus } from "@/lib/stock";
import { getSites } from "@/lib/data";
import { getSession, canSeeModuleAnySite } from "@/lib/auth";
import { isDemo } from "@/lib/supabase";
import { getAdminRights } from "@/lib/access";
import GrnQuickEntry from "@/components/GrnQuickEntry";   // update405
import VendorLink from "@/components/VendorLink";   // update410

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const qty = n => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const isPdf = p => /\.pdf($|\?)/i.test(String(p || ""));
const fmtDT = iso => { if (!iso) return "—"; const d = new Date(iso); return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); };
const monthStart = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01"; };
const todayStr = () => new Date().toISOString().slice(0, 10);

// update185: pages may live in the private bucket -> URLs are signed on demand (10 min).
async function openDoc(g, kind, i, d, download) {
  const name = grnDocName(g.grn_no, kind, i, d.path);
  const url = await getGrnDocUrl(d, download ? name : null);
  if (!url) { alert("Could not open this page (no access or file missing)."); return; }
  if (download) { const a = document.createElement("a"); a.href = url; a.download = name; a.rel = "noreferrer"; document.body.appendChild(a); a.click(); a.remove(); }
  else window.open(url, "_blank", "noopener");
}
function DocLinks({ g, kind }) {
  const list = g.docs.filter(d => d.kind === kind);
  if (!list.length) return <span className="muted">—</span>;
  return (
    <span>
      {list.map((d, i) => (
        <span key={d.id} style={{ whiteSpace: "nowrap", marginRight: 8 }}>
          <a onClick={() => openDoc(g, kind, i, d, false)} style={{ fontSize: 11.5, cursor: "pointer" }} title={isPdf(d.path) ? "View PDF" : "View image"}>{isPdf(d.path) ? "📄" : "🖼"} Pg {i + 1}{d.bucket === GRN_BUCKET ? "" : "°"}</a>
          <a onClick={() => openDoc(g, kind, i, d, true)} style={{ fontSize: 11.5, marginLeft: 3, cursor: "pointer" }} title="Download">⬇</a>
        </span>
      ))}
    </span>
  );
}

export default function GrnView({ siteId = null, embedded = false }) {
  // update244: de-iframed. Inside a project tab siteId is a PROP and the shell belongs to the
  // parent, so there is no duplicate header and no leaked sidebar chrome.
  const [session, setSession] = useState(null);
  const [sites, setSites] = useState([]);
  const [site, setSite] = useState("all");
  useEffect(() => {   // update206: project scoping — ?site= from a project workspace pre-filters this page
    // update244: siteId now arrives as a PROP; the ?site= URL read stays as a fallback for
    // anyone who bookmarked a scoped link.
    if (siteId) { setSite(String(siteId)); return; }
    try { const sp = new URLSearchParams(window.location.search).get("site"); if (sp) setSite(String(sp)); } catch {}
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState(() => { try { return new URLSearchParams(window.location.search).get("q") || ""; } catch { return ""; } });   // update410: deep link from vendor profile
  const [vendor, setVendor] = useState("all");
  const [who, setWho] = useState("all");
  const [flag, setFlag] = useState("all");   // all | short | nodocs | docs
  const [open, setOpen] = useState({});
  const [viewer, setViewer] = useState(null); // { g, docs, idx, url }
  const [cancelFor, setCancelFor] = useState(null); const [cancelReason, setCancelReason] = useState(""); const [busy, setBusy] = useState(false);
  // update192: edit GRN header + upload pending challans
  const [editFor, setEditFor] = useState(null);       // grn object
  const [editVals, setEditVals] = useState({});
  const [editSup, setEditSup] = useState([]); const [editCo, setEditCo] = useState([]);
  const [history, setHistory] = useState({});   // grn_no -> rows (director)
  const [migr, setMigr] = useState(null);       // migration progress text
  const [msg, setMsg] = useState("");
  // update191: vendor-return history view
  const [view, setView] = useState("grns");   // grns | returns
  const [page, setPage] = useState(1); const PAGE = 20;   // update405: pagination
  const [advOpen, setAdvOpen] = useState(false); const [quick, setQuick] = useState(false);   // update405
  useEffect(() => { setPage(1); }, [q, vendor, who, flag, site, from, to]);
  const [retRows, setRetRows] = useState(null);
  const [retSt, setRetSt] = useState("all");     // update205: status filter
  const [stMenu, setStMenu] = useState(null);    // ref whose status dropdown is open
  const [inr2] = useState(() => n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
  const canPx = useCanViewPrices() === true;   // update463: GRN rates / values only for price viewers
  useEffect(() => { if (view === "returns") { setRetRows(null); getVendorReturnHistory({ siteId: site, from, to }).then(r => setRetRows(r.rows || [])); } }, [view, site, from, to]);   // eslint-disable-line react-hooks/exhaustive-deps
  // resolve the viewer's current page URL (signed if private)
  useEffect(() => {
    if (!viewer) return;
    let alive = true;
    setViewer(v => v ? { ...v, url: null } : v);
    getGrnDocUrl(viewer.docs[viewer.idx]).then(u => { if (alive) setViewer(v => v ? { ...v, url: u || "" } : v); });
    return () => { alive = false; };
  }, [viewer?.g?.grn_no, viewer?.kind, viewer?.idx]);   // eslint-disable-line react-hooks/exhaustive-deps
  const isDirector = session?.role === "director";
  const [caps, setCaps] = useState([]);
  useEffect(() => { if (session?.id && session.role !== "director") getAdminRights(session.id).then(setCaps); }, [session?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const canCancel = isDirector || session?.role === "it_executive" || caps.includes("cancel_grn");   // DB enforces the same rule
  async function doCancel() {
    if (!cancelReason.trim()) return;
    setBusy(true); const r = await cancelGrn(cancelFor.grn_no, cancelReason.trim()); setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setMsg("GRN " + cancelFor.grn_no + " cancelled — " + r.reversed + " line(s) reversed. Stock updated."); setCancelFor(null); setCancelReason(""); load();
  }
  async function loadHistory(grn) { const rows = await getGrnHistory(grn); setHistory(h => ({ ...h, [grn]: rows })); }
  const canEditGrn = g => session && (isDirector || session.role === "it_executive" || Number(session.id) === Number(g.created_by));
  function openEdit(g) { setEditFor(g); setEditVals({ vendor: g.vendor || "", challan_no: g.challan_no || "", our_challan_no: g.our_challan_no || "", challan_date: g.challan_date || "", note: g.note || "" }); setEditSup([]); setEditCo([]); }
  async function saveEdit() {
    setBusy(true);
    let ok = true, errText = "";
    const r1 = await editGrnHeader(editFor.grn_no, editVals);
    if (!r1.ok) { ok = false; errText = r1.error; }
    if (ok && (editSup.length || editCo.length)) {
      const r2 = await addGrnDocs(editFor.grn_no, editFor.site_id, { supplier: editSup, company: editCo }, session?.id);
      if (!r2.ok) { ok = false; errText = "Header saved, but page upload failed: " + r2.error; }
    }
    setBusy(false);
    if (!ok) { setErr(errText); return; }
    setMsg(`GRN ${editFor.grn_no} updated` + (editSup.length + editCo.length ? ` — ${editSup.length + editCo.length} challan page(s) added.` : "."));
    setEditFor(null); load();
  }
  async function runMigration() {
    if (!confirm("Move all challan pages from the public bucket into the private grn-docs bucket? Existing links keep working through the app.")) return;
    setMigr("Starting…");
    const r = await migrateGrnDocsToPrivate((done, total) => setMigr(`Moving ${done} / ${total}…`));
    setMigr(r.ok ? `Done — moved ${r.moved}, failed ${r.failed} of ${r.total}.` + (r.errors?.length ? " " + r.errors.join(" | ") : "") : "Failed: " + r.error);
    load();
  }

  useEffect(() => { setSession(getSession()); getSites().then(setSites); }, []);
  const load = () => {
    setLoading(true); setErr("");
    getGrnRegister({ siteId: site, from, to }).then(r => { setRows(r.rows || []); if (r.error) setErr(r.error); setLoading(false); });
  };
  useEffect(load, [site, from, to]);   // eslint-disable-line react-hooks/exhaustive-deps
  // update405: stats and rows refresh on their own when you come back from entering a GRN (tab focus / app resume)
  useEffect(() => { const onVis = () => { if (document.visibilityState === "visible") load(); }; document.addEventListener("visibilitychange", onVis); window.addEventListener("focus", onVis); return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); }; }, [site, from, to]);   // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => rows.filter(g => {
    const s = q.trim().toLowerCase();
    if (s && ![g.grn_no, g.po_no, g.challan_no, g.our_challan_no, g.vendor, g.site, g.entered_by, ...g.lines.map(l => l.item_name)].some(x => String(x || "").toLowerCase().includes(s))) return false;
    if (vendor !== "all" && g.vendor !== vendor) return false;
    if (who !== "all" && g.entered_by !== who) return false;
    if (flag === "short" && !g.short_lines) return false;
    if (flag === "nodocs" && g.docs.length) return false;
    if (flag === "docs" && !g.docs.length) return false;
    if (flag === "po" && !g.po_id) return false;
    if (flag === "nopo" && g.po_id) return false;
    if (flag === "cancelled" && g.status !== "cancelled") return false;
    if (flag === "changes" && !(g.changes || []).length) return false;
    return true;
  }), [rows, q, vendor, who, flag]);

  const today = todayStr(), mStart = monthStart();
  const summary = {
    total: shown.length,
    month: shown.filter(g => g.date >= mStart).length,
    today: shown.filter(g => g.date === today).length,
    sites: new Set(shown.map(g => g.site_id)).size,
    value: shown.reduce((s, g) => s + g.value, 0),
    short: shown.filter(g => g.short_lines).length,
    docs: shown.reduce((s, g) => s + g.docs.length, 0),
    nodocs: shown.filter(g => !g.docs.length).length,
    cancelled: shown.filter(g => g.status === "cancelled").length,
    po: shown.filter(g => g.po_id).length,
  };

  const exportCsv = () => {
    const esc = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ["GRN no", "Status", "PO no", "Entered on", "Entered by", "Site", "Vendor", "Supplier challan no", "Our challan no", "Challan date", "Item", "Unit", "Challan qty", "Received qty", "Short/Excess", ...(canPx ? ["Rate", "Value"] : []), "Supplier pages", "Our pages", "Tally exported"];
    const body = [];
    shown.forEach(g => g.lines.forEach(l => body.push([g.grn_no, g.status, g.po_no, fmtDT(g.entered_at), g.entered_by, g.site, g.vendor, g.challan_no, g.our_challan_no, g.challan_date, l.item_name, l.unit, l.challan_qty, l.received_qty, -l.short_qty, ...(canPx ? [l.rate, l.value] : []), g.sup_docs, g.our_docs, g.exported ? "Yes" : ""].map(esc).join(","))));
    const blob = new Blob([head.join(",") + "\n" + body.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `grn_register_${from || "all"}_${to || today}.csv`; a.click();
  };

  const toggle = grn => setOpen(o => ({ ...o, [grn]: !o[grn] }));
  const allOpen = shown.length && shown.every(g => open[g.grn_no]);

  const openViewer = (g, kind, idx) => { const docs = g.docs.filter(d => d.kind === kind); if (docs.length) setViewer({ g, kind, docs, idx }); };

  const allowed = session && (canSeeModuleAnySite(session, "stock") || session.role === "director");

  return (
    <>
      {/* update244: embedded keeps the FILTERS (dates, search, export still needed inside the
          tab) and drops only the page title — the project page already says where you are. */}
      {/* update405: header — title + segmented Receipts/Returns, primary New GRN */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <h1 style={embedded ? { fontSize: 15, fontWeight: 600, margin: 0 } : { margin: 0 }}>{embedded ? "GRN / Challan" : "GRN register"}</h1>
          <div style={{ display: "inline-flex", background: "var(--gray-bg)", borderRadius: 8, padding: 3, gap: 2 }}>
            {[["grns", "Receipts"], ["returns", "↩ Returns"]].map(([k, l]) => <button key={k} type="button" onClick={() => setView(k)} style={{ border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 13, background: view === k ? "#fff" : "transparent", color: view === k ? "var(--text)" : "var(--muted)", fontWeight: view === k ? 600 : 400, boxShadow: view === k ? "0 0 0 1px var(--border)" : "none", cursor: "pointer" }}>{l}</button>)}
          </div>
        </div>
        {!embedded && <button className="primary" style={{ padding: "9px 18px", fontSize: 14, borderRadius: 8 }} onClick={() => setQuick(true)}>＋ New GRN</button>}
      </div>

        {isDemo && <div className="demo-banner">Demo mode — no GRN data.</div>}
        {session && !allowed && <div className="error">You don't have Material Stock access.</div>}

        {view === "grns" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 18 }}>
            {[["📋", "#E8F0FE", "#1D4ED8", summary.total, `GRNs in filter · ${summary.cancelled} cancelled`],
              ["🔗", "#EDE9FE", "#6D28D9", summary.po, `Against PO · ${summary.total - summary.po} direct`],
              ["📅", "#DCFCE7", "#15803D", summary.today, `Entered today · ${summary.month} this month`],
              canPx ? ["₹", "#FFF3E8", "#C2410C", inr(summary.value), `Received · ${summary.sites} site${summary.sites === 1 ? "" : "s"}${summary.short ? ` · ${summary.short} short/excess` : ""}`] : ["🏗", "#FFF3E8", "#C2410C", summary.sites, `Site${summary.sites === 1 ? "" : "s"}${summary.short ? ` · ${summary.short} short/excess` : ""}`]].map(([ic, bg, fg, n, l], k) => (
              <div key={k} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{ic}</div>
                <div style={{ fontSize: k === 3 ? 20 : 24, fontWeight: 700, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={String(n)}>{n}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{l}</div>
              </div>))}
          </div>
        )}


        {view === "returns" && (
          <div className="panel">
            {(() => { const rs = retRows || []; const cnt = { awaiting: 0, delayed: 0, returned: 0 };
              rs.forEach(r => { cnt[r.status] = (cnt[r.status] || 0) + 1; });
              const shownR = retSt === "all" ? rs : rs.filter(r => r.status === retSt);
              const retVal = shownR.reduce((t, r) => t + (r.total_value || 0), 0);
              const stBadge = { awaiting: ["●", "Awaiting", "var(--amber)"], delayed: ["●", "Delayed", "var(--red)"], returned: ["●", "Returned", "var(--green)"] };
              return (<>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>Return status:</span>
                {[["all", "All", rs.length], ["awaiting", "Awaiting", cnt.awaiting], ["delayed", "Delayed", cnt.delayed], ["returned", "Returned", cnt.returned]].map(([v, l, n]) => (
                  <button key={v} type="button" onClick={() => setRetSt(v)}
                    style={{ fontSize: 12, borderRadius: 999, background: retSt === v ? "var(--copper)" : "#fff", color: retSt === v ? "#fff" : v === "awaiting" ? "var(--amber)" : v === "delayed" ? "var(--red)" : v === "returned" ? "var(--green)" : "var(--text)", fontWeight: retSt === v ? 800 : 600 }}>
                    {l} · {n}</button>
                ))}
                <div style={{ marginLeft: "auto", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 12px", textAlign: "right" }}>
                  <div className="muted" style={{ fontSize: 10.5 }}>↩ Returned value (this filter)</div>
                  <b style={{ fontSize: 15 }}>{inr2(retVal)}</b> <span className="muted" style={{ fontSize: 11 }}>· {shownR.length} RTVs</span>
                </div>
              </div>
            {!retRows ? <div className="muted">Loading returns…</div> : shownR.length === 0 ? <div className="muted">No vendor returns match this filter.</div> : (
              <div style={{ overflowX: "auto" }}>
                <table className="dt-compact">
                  <thead><tr><th>Ref</th><th>Date</th><th>Site</th><th>Vendor</th><th>Against GRN</th><th>Items</th><th className="num">Qty</th>{canPx && <th className="num">Value ₹</th>}<th>Status</th><th>Reason</th><th>By</th><th>Receipt</th></tr></thead>
                  <tbody>
                    {shownR.map((r, i) => { const [dot, sl, sc] = stBadge[r.status] || stBadge.awaiting; return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{r.ref}</td>
                        <td className="muted">{fmtDT(r.date)}</td>
                        <td>{r.site}</td>
                        <td>{r.vendor}</td>
                        <td>{r.src_grn || <span className="badge gray">No GRN</span>}</td>
                        <td>{r.lines.map((l, j) => <div key={j} style={{ fontSize: 12 }}>{l.item} — {l.qty} {l.unit}</div>)}</td>
                        <td className="num">{qty(r.total_qty)}</td>
                        {canPx && <td className="num">{r.total_value ? inr2(r.total_value) : <span className="muted" title="No rate found on the source GRN">—</span>}</td>}
                        <td style={{ position: "relative", whiteSpace: "nowrap" }}>
                          <button type="button" onClick={() => setStMenu(stMenu === r.ref ? null : r.ref)}
                            style={{ borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: sc, background: sc + "18", border: "1px solid " + sc }}>
                            {dot} {sl} ▾</button>
                          {r.status_by && <div className="muted" style={{ fontSize: 10 }}>{r.status_by} · {r.status_at}</div>}
                          {stMenu === r.ref && (
                            <div style={{ position: "absolute", zIndex: 30, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: 4, marginTop: 2 }}>
                              {["awaiting", "delayed", "returned"].map(st2 => (
                                <div key={st2} role="button" onClick={async () => { setStMenu(null); const res = await setRtvStatus(r.ref, st2);
                                    if (!res.ok) { alert(res.error); return; }
                                    setRetRows(rows => rows.map(x => x.ref === r.ref ? { ...x, status: st2, status_by: res.by, status_at: new Date().toISOString().slice(0, 10) } : x)); }}
                                  style={{ padding: "6px 14px", fontSize: 12.5, cursor: "pointer", color: stBadge[st2][2], fontWeight: r.status === st2 ? 800 : 500 }}>
                                  ● {stBadge[st2][1]}{r.status === st2 ? " ✓" : ""}</div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="muted" style={{ maxWidth: 200 }}>{r.reason || "—"}</td>
                        <td>{r.by || "—"}</td>
                        <td>
                          {r.status === "awaiting"
                            ? <button type="button" disabled title="Receipt available once the return is marked Delayed or Returned" style={{ fontSize: 11.5, color: "var(--muted)" }}>⬇ Receipt</button>
                            : <a href={"/stock/rtv-print?ref=" + encodeURIComponent(r.ref)} target="_blank" rel="noreferrer"><button type="button" style={{ fontSize: 11.5 }}>⬇ Receipt</button></a>}
                        </td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
            )}
              </>); })()}
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Every return-to-vendor transaction, newest first. {canPx ? "Value uses each item's rate from the SOURCE GRN. " : ""}Click a status pill to change it (Directors / IT / stock managers); the receipt opens print-ready — use the browser's Print → Save as PDF.</div>
          </div>
        )}
        {view === "grns" && <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <div style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "0 10px", height: 36 }}>
              <span className="muted">🔍</span><input placeholder="Search GRN, vendor, item, person…" value={q} onChange={e => setQ(e.target.value)} style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontSize: 13 }} />
            </div>
            {!embedded && <select value={site} onChange={e => setSite(e.target.value)} style={{ height: 36 }}><option value="all">All sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
            <button type="button" className={from === monthStart() && !to ? "primary" : ""} style={{ height: 36 }} onClick={() => { if (from === monthStart() && !to) { setFrom(""); setTo(""); } else { setFrom(monthStart()); setTo(""); } }}>📅 {from === monthStart() && !to ? "This month" : (!from && !to ? "All time" : `${from || "…"} → ${to || "…"}`)}</button>
            <button type="button" className={advOpen ? "primary" : ""} style={{ height: 36 }} onClick={() => setAdvOpen(a => !a)}>⚙ Filters{(vendor !== "all" || who !== "all" || flag !== "all") ? " •" : ""}</button>
            <button type="button" style={{ height: 36, marginLeft: "auto" }} onClick={exportCsv} disabled={!shown.length}>⬇ Export</button>
          </div>
          {advOpen && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <span className="muted" style={{ fontSize: 12 }}>Entered</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} /><span className="muted" style={{ fontSize: 12 }}>to</span><input type="date" value={to} onChange={e => setTo(e.target.value)} />
              <select value={vendor} onChange={e => setVendor(e.target.value)}><option value="all">Vendor: all</option>{[...new Set(rows.map(g => g.vendor).filter(Boolean))].sort().map(v => <option key={v} value={v}>{v}</option>)}</select>
              <select value={who} onChange={e => setWho(e.target.value)}><option value="all">Entered by: all</option>{[...new Set(rows.map(g => g.entered_by).filter(Boolean))].sort().map(v => <option key={v} value={v}>{v}</option>)}</select>
              <select value={flag} onChange={e => setFlag(e.target.value)}>
                <option value="all">Show: all</option><option value="short">Only short / excess</option><option value="nodocs">Only without challan pages</option><option value="docs">Only with challan pages</option><option value="po">Only against a PO</option><option value="nopo">Only without PO</option><option value="cancelled">Only cancelled</option><option value="changes">Only with material change</option>
              </select>
              <button type="button" style={{ fontSize: 11.5 }} onClick={() => setOpen(allOpen ? {} : Object.fromEntries(shown.map(g => [g.grn_no, true])))}>{allOpen ? "▾ Collapse all" : "▸ Expand all"}</button>
              <button type="button" style={{ fontSize: 11.5 }} onClick={load}>↻ Refresh</button>
              <button type="button" style={{ fontSize: 11.5, marginLeft: "auto" }} onClick={() => { setVendor("all"); setWho("all"); setFlag("all"); }}>Clear</button>
            </div>
          )}
          {err && <div className="error" style={{ marginBottom: 8 }}>{err}</div>}
          {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)", marginBottom: 8 }}>{msg}</div>}
          {isDirector && rows.some(g => g.docs.some(d => d.bucket !== GRN_BUCKET)) && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>° = page still in the public bucket. <a onClick={runMigration} style={{ cursor: "pointer" }}>Move all challan pages to private storage</a>{migr ? " — " + migr : ""}</div>
          )}
          {loading ? <div className="muted">Loading GRNs…</div> : shown.length === 0 ? <div className="muted">No GRNs match. Widen the date range (top-right) or clear the filters.</div> : (
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <style>{`.grn405 tbody tr.grn-row:hover td { background: #FAFAFC; } .grn405 th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 500; padding: 10px 12px; background: var(--gray-bg); } .grn405 td { padding: 11px 12px; font-size: 13px; border-top: 1px solid var(--border); vertical-align: middle; } .grn405 .ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } @media (max-width: 720px) { .grn405 .hide-m { display: none; } }`}</style>
              <table className="grn405" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "24%" }} /><col style={{ width: "28%" }} /><col className="hide-m" style={{ width: "14%" }} /><col className="hide-m" style={{ width: "18%" }} /><col style={{ width: "16%" }} /></colgroup>
                <thead><tr><th>GRN no</th><th>Vendor</th><th className="hide-m">Entered</th><th className="hide-m">Site</th><th>Status</th></tr></thead>
                <tbody>
                  {shown.slice((page - 1) * PAGE, page * PAGE).map(g => (
                    <Fragment key={g.grn_no}>
                      <tr className="grn-row" style={{ cursor: "pointer", background: open[g.grn_no] ? "#FAFAFC" : undefined }} onClick={() => toggle(g.grn_no)}>
                        <td className="ell" style={{ fontWeight: 600, textDecoration: g.status === "cancelled" ? "line-through" : "none" }}>{open[g.grn_no] ? "▾ " : "▸ "}{g.grn_no}{g.status === "cancelled" && <span className="badge a" style={{ marginLeft: 6 }}>Cancelled</span>}</td>
                        <td><div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: ["#E8F0FE", "#EDE9FE", "#DCFCE7", "#FFF3E8", "#FCE7F3"][(g.vendor || "").length % 5], color: ["#1D4ED8", "#6D28D9", "#15803D", "#C2410C", "#BE185D"][(g.vendor || "").length % 5], fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(g.vendor || "—").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()}</div><span className="ell" onClick={e => e.stopPropagation()}><VendorLink name={g.vendor} /></span></div></td>
                        <td className="muted hide-m">{g.entered_at ? new Date(g.entered_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</td>
                        <td className="ell hide-m">{g.site}</td>
                        <td><span style={{ background: g.po_id ? "#E8F0FE" : "#FFF3E8", color: g.po_id ? "#1D4ED8" : "#C2410C", fontSize: 11, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{g.po_id ? "Against PO" : "No PO"}</span>{g.short_lines ? <span style={{ background: "#FEF3C7", color: "#92400E", fontSize: 11, padding: "2px 8px", borderRadius: 999, marginLeft: 4, whiteSpace: "nowrap" }}>⚠ {g.short_lines}</span> : null}</td>
                      </tr>
                      {open[g.grn_no] && (
                        <tr>
                          <td colSpan={5} style={{ background: "#FAFAFC", padding: "10px 14px 14px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 10, fontSize: 12.5 }}>
                              <div><div className="muted" style={{ fontSize: 11 }}>PO</div>{g.po_no ? <a href={"/purchase/po?po=" + g.po_id} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{g.po_no}</a> : <span className="muted">No PO</span>}</div>
                              <div><div className="muted" style={{ fontSize: 11 }}>Supplier challan</div>{g.challan_no || "—"}{g.challan_date ? <span className="muted"> · {g.challan_date}</span> : null}</div>
                              <div><div className="muted" style={{ fontSize: 11 }}>Our challan</div>{g.our_challan_no || "—"}</div>
                              <div><div className="muted" style={{ fontSize: 11 }}>Entered by</div>{g.entered_by || "—"}<span className="muted"> · {fmtDT(g.entered_at)}</span></div>
                              <div><div className="muted" style={{ fontSize: 11 }}>Items · qty{canPx ? " · value" : ""}</div>{g.items} · {qty(g.total_qty)}{canPx && <> · <b>{inr(g.value)}</b></>}</div>
                              <div><div className="muted" style={{ fontSize: 11 }}>Short / excess</div>{g.short_lines ? <span style={{ color: "var(--amber)" }}>⚠ {g.short_lines} line(s)</span> : <span style={{ color: "var(--green)" }}>OK</span>}{g.returned_qty > 0 && <span className="badge a" style={{ marginLeft: 6 }}>↩ {qty(g.returned_qty)} returned</span>}{(g.changes || []).length > 0 && <span className="badge h" style={{ marginLeft: 6 }}>≠ {g.changes.length} changed</span>}{g.exported && <span className="badge gray" style={{ marginLeft: 6 }}>Tally</span>}</div>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }} onClick={e => e.stopPropagation()}>
                              <span className="muted" style={{ fontSize: 12 }}>Supplier pages:</span>{g.sup_docs ? <span><button style={{ fontSize: 11 }} onClick={() => openViewer(g, "supplier", 0)}>👁 {g.sup_docs} pg</button> <DocLinks g={g} kind="supplier" /></span> : <span className="muted" style={{ fontSize: 12 }}>none</span>}
                              <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Our pages:</span>{g.our_docs ? <span><button style={{ fontSize: 11 }} onClick={() => openViewer(g, "company", 0)}>👁 {g.our_docs} pg</button> <DocLinks g={g} kind="company" /></span> : <span className="muted" style={{ fontSize: 12 }}>none</span>}
                              <span style={{ marginLeft: "auto" }} />
                              <a href={"/purchase/challan?grn=" + encodeURIComponent(g.grn_no)} target="_blank" rel="noreferrer"><button style={{ fontSize: 11.5 }}>🖨 Print</button></a>
                              {canEditGrn(g) && g.status !== "cancelled" && <button style={{ fontSize: 11.5 }} onClick={() => openEdit(g)}>✎ Edit</button>}
                              {canCancel && g.status !== "cancelled" && <button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => { setCancelFor(g); setCancelReason(""); }}>Cancel</button>}
                            </div>
                            <table className="dt-compact" style={{ width: "auto", minWidth: 620, background: "#fff", border: "1px solid var(--border)", borderRadius: 8 }}>
                              <thead><tr><th>#</th><th>Material</th><th>Unit</th><th className="num">Challan qty</th><th className="num">Received</th><th className="num">↩ Returned</th><th className="num">Short / Excess</th>{canPx && <><th className="num">Rate</th><th className="num">Value</th></>}</tr></thead>
                              <tbody>
                                {g.lines.map((l, i) => (
                                  <tr key={i}>
                                    <td className="muted">{i + 1}</td>
                                    <td>{l.item_name}</td>
                                    <td className="muted">{l.unit}</td>
                                    <td className="num">{qty(l.challan_qty)}</td>
                                    <td className="num" style={{ fontWeight: 600 }}>{qty(l.received_qty)}</td>
                                    <td className="num" style={{ color: l.returned ? "var(--red)" : "var(--muted)" }}>{l.returned ? "−" + qty(l.returned) : "—"}</td>
                                    <td className="num" style={{ color: l.short_qty > 0 ? "var(--red)" : l.short_qty < 0 ? "var(--amber)" : "var(--muted)" }}>{l.short_qty ? (l.short_qty > 0 ? "−" + qty(l.short_qty) + " short" : "+" + qty(-l.short_qty) + " excess") : "—"}</td>
                                    {canPx && <><td className="num muted">{l.rate ? inr(l.rate) : "—"}</td>
                                    <td className="num">{l.value ? inr(l.value) : "—"}</td></>}
                                  </tr>
                                ))}
                                <tr style={{ fontWeight: 600 }}><td colSpan={4} style={{ textAlign: "right" }}>Total</td><td className="num">{qty(g.total_qty)}</td><td className="num" style={{ color: g.returned_qty ? "var(--red)" : undefined }}>{g.returned_qty ? "−" + qty(g.returned_qty) : ""}</td><td></td>{canPx && <><td></td><td className="num">{inr(g.value)}</td></>}</tr>
                              </tbody>
                            </table>
                            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                              Entered by <b>{g.entered_by || "Not available"}</b> on {fmtDT(g.entered_at)}{g.po_no ? <> · against <b>{g.po_no}</b>{canPx ? " (rate = PO net rate)" : ""}</> : canPx ? " · Rate = item's last known rate at receipt (valuation only, not vendor billing)" : ""}.
                              {g.docs.length === 0 && <span style={{ color: "var(--amber)" }}> · No challan pages uploaded for this GRN.</span>}
                              {g.last_edit && <span> · Last edited by <b>{g.last_edit.by || "—"}</b> on {fmtDT(g.last_edit.at)}</span>}
                              {g.note && <div>Note: {g.note}</div>}
                            </div>
                            {g.cancel && <div className="error" style={{ marginTop: 8, fontSize: 12.5 }}>Cancelled by <b>{g.cancel.by || "—"}</b> on {fmtDT(g.cancel.at)} — reason: {g.cancel.reason}. Stock reversed; the original lines above are kept as history.</div>}
                            {(g.changes || []).length > 0 && (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 4 }}>Material changes at receipt</div>
                                <table className="dt-compact" style={{ width: "auto", background: "#fff", border: "1px solid var(--border)", borderRadius: 8 }}>
                                  <thead><tr><th>Ordered</th><th>Received as</th><th className="num">Qty</th><th>Reason</th></tr></thead>
                                  <tbody>{g.changes.map(c => <tr key={c.id}><td>{c.ordered_name}</td><td style={{ fontWeight: 600 }}>{c.received_name}</td><td className="num">{qty(c.qty)}</td><td className="muted">{c.reason || "—"}</td></tr>)}</tbody>
                                </table>
                              </div>
                            )}
                            {isDirector && (
                              <div style={{ marginTop: 10, fontSize: 12 }}>
                                {history[g.grn_no] ? (history[g.grn_no].length ? history[g.grn_no].map((h, i) => <div key={i} className="muted">🕓 {fmtDT(h.at)} · <b>{h.action}</b> by {h.by || "—"}{h.meta?.reason ? " — " + h.meta.reason : ""}{h.meta?.lines ? ` (${h.meta.lines} lines, ${h.meta.docs || 0} pages)` : ""}</div>) : <span className="muted">No history rows (GRN created before update 185).</span>)
                                  : <a onClick={() => loadHistory(g.grn_no)} style={{ cursor: "pointer" }}>Show history</a>}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>Showing {Math.min((page - 1) * PAGE + 1, shown.length)}–{Math.min(page * PAGE, shown.length)} of {shown.length}</span>
                <div style={{ display: "flex", gap: 4 }}><button type="button" style={{ padding: "5px 9px" }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button><button type="button" style={{ padding: "5px 9px" }} disabled={page * PAGE >= shown.length} onClick={() => setPage(p => p + 1)}>›</button></div>
              </div>
            </div>
          )}
        </div>}

        {editFor && (
          <div onClick={() => setEditFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 96, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 520, width: "100%", padding: 22, maxHeight: "92vh", overflowY: "auto" }}>
              <h2 style={{ marginBottom: 2 }}>✎ Edit GRN {editFor.grn_no}</h2>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Header details only — quantities and items are corrected via vendor return or cancel. Every edit is logged with your name.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}><label className="muted">Vendor</label><input style={{ width: "100%" }} value={editVals.vendor} onChange={e => setEditVals(v => ({ ...v, vendor: e.target.value }))} /></div>
                <div><label className="muted">Supplier challan no</label><input style={{ width: "100%" }} value={editVals.challan_no} onChange={e => setEditVals(v => ({ ...v, challan_no: e.target.value }))} /></div>
                <div><label className="muted">Our challan no (duly signed &amp; stamped)</label><input style={{ width: "100%" }} value={editVals.our_challan_no} onChange={e => setEditVals(v => ({ ...v, our_challan_no: e.target.value }))} /></div>
                <div><label className="muted">Challan date</label><input type="date" style={{ width: "100%" }} value={editVals.challan_date} onChange={e => setEditVals(v => ({ ...v, challan_date: e.target.value }))} /></div>
                <div><label className="muted">Note</label><input style={{ width: "100%" }} value={editVals.note} onChange={e => setEditVals(v => ({ ...v, note: e.target.value }))} /></div>
                <div><label className="muted">➕ Supplier challan pages ({editFor.sup_docs} on file)</label><input type="file" accept="image/*,.pdf" multiple style={{ width: "100%" }} onChange={e => setEditSup(Array.from(e.target.files || []))} /></div>
                <div><label className="muted">➕ Our challan pages ({editFor.our_docs} on file — signed &amp; stamped)</label><input type="file" accept="image/*,.pdf" multiple style={{ width: "100%" }} onChange={e => setEditCo(Array.from(e.target.files || []))} /></div>
              </div>
              {(editFor.sup_docs === 0 || editFor.our_docs === 0) && <div style={{ color: "var(--amber)", fontSize: 12, marginTop: 8 }}>⚠ {editFor.sup_docs === 0 ? "Supplier challan pages pending. " : ""}{editFor.our_docs === 0 ? "Our challan pages pending — upload the signed & stamped copy." : ""}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="primary" disabled={busy} onClick={saveEdit}>{busy ? "Saving…" : "Save changes"}</button>
                <button onClick={() => setEditFor(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {cancelFor && (
          <div onClick={() => setCancelFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 96, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 460, width: "100%", padding: 22 }}>
              <h2 style={{ marginBottom: 4 }}>Cancel GRN {cancelFor.grn_no}?</h2>
              <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{cancelFor.items} item(s), {qty(cancelFor.total_qty)} qty at {cancelFor.site}. Stock will be reversed for every line; the original entry stays visible as history. If any of this material was already issued, the cancel is refused — record the return first.</div>
              <label className="muted">Reason (mandatory)</label>
              <input style={{ width: "100%" }} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. duplicate entry / wrong site / wrong vendor" autoFocus />
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="primary" style={{ background: "var(--red)" }} disabled={busy || !cancelReason.trim()} onClick={doCancel}>{busy ? "Cancelling…" : "Cancel this GRN"}</button>
                <button onClick={() => setCancelFor(null)}>Keep it</button>
              </div>
            </div>
          </div>
        )}
        {viewer && (
          <div onClick={() => setViewer(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 95, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "min(960px, 100%)", maxHeight: "94vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 600 }}>{viewer.kind === "supplier" ? "Supplier challan" : "Our challan"} · {viewer.g.grn_no}</div>
                <div className="muted" style={{ fontSize: 12 }}>{viewer.kind === "supplier" ? viewer.g.challan_no : viewer.g.our_challan_no}</div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                  <button style={{ fontSize: 11.5 }} disabled={viewer.idx === 0} onClick={() => setViewer(v => ({ ...v, idx: v.idx - 1 }))}>‹ Prev</button>
                  <span className="muted" style={{ fontSize: 12 }}>Page {viewer.idx + 1} / {viewer.docs.length}</span>
                  <button style={{ fontSize: 11.5 }} disabled={viewer.idx >= viewer.docs.length - 1} onClick={() => setViewer(v => ({ ...v, idx: v.idx + 1 }))}>Next ›</button>
                  <button style={{ fontSize: 11.5 }} onClick={() => openDoc(viewer.g, viewer.kind, viewer.idx, viewer.docs[viewer.idx], true)}>⬇ Download</button>
                  <button style={{ fontSize: 11.5 }} onClick={() => setViewer(null)}>✕</button>
                </div>
              </div>
              <div style={{ flex: 1, overflow: "auto", background: "#222", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
                {viewer.url === null || viewer.url === undefined ? <div style={{ color: "#fff", padding: 40 }}>Loading…</div>
                  : viewer.url === "" ? <div style={{ color: "#fff", padding: 40, textAlign: "center" }}>Could not open this page (no access or file missing).</div>
                  : isPdf(viewer.docs[viewer.idx].path)
                  ? <iframe title="challan" src={viewer.url} style={{ width: "100%", height: "78vh", border: 0, background: "#fff" }} />
                  : /\.(jpe?g|png|webp|gif|heic)$/i.test(viewer.docs[viewer.idx].path) || !/\.[a-z0-9]{2,5}$/i.test(viewer.docs[viewer.idx].path)
                    ? <img alt="challan page" src={viewer.url} style={{ maxWidth: "100%", maxHeight: "78vh", objectFit: "contain" }} onError={e => { e.currentTarget.replaceWith(Object.assign(document.createElement("div"), { textContent: "Preview unavailable — use Download.", style: "color:#fff;padding:40px" })); }} />
                    : <div style={{ color: "#fff", padding: 40, textAlign: "center" }}>Preview unavailable for this file type.<br /><span className="muted">Use ⬇ Download.</span></div>}
              </div>
            </div>
          </div>
        )}
      {quick && <GrnQuickEntry sites={sites} rows={rows} onClose={() => setQuick(false)} />}{/* update405 */}
    </>
  );
}
