"use client";
// update260: BOQ master v2 (SOUL pilot) — Tender / Extra tabs, amendments with a
// mandatory reason + full history, tender BASIC RATE per line (CP/sanitary), and an
// optional link to the Item Master so the RA bill can auto-suggest purchase rates.
// Amendments never rewrite submitted bills — every bill freezes its own rates.
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getBoqItems, saveBoqItem, autoShortenBoq, amendBoqItem, getBoqAmendments, inr } from "@/lib/boq";
import { searchItems } from "@/lib/stock";
import { can } from "@/lib/auth";
import { getBoqKits, copyBoqKits } from "@/lib/boqMaterials";   // update369
import BoqKitModal from "@/components/BoqKitModal";
import BoqImportWizard from "@/components/BoqImportWizard";     // update455: smart import, template per site
import ContractTermsCard from "@/components/ContractTermsCard";   // update455: payment terms live here, not in the grid

const blank = { item_code: "", description: "", unit: "Rmt", boq_qty: "", rate: "", section: "", basic_rate: "", is_extra: false, extra_status: "pending", item_id: null, item_name: "" };

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 };
const sheetStyle = { background: "var(--card, #fff)", borderRadius: 12, padding: 18, width: "min(560px, 96vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 18px 50px rgba(0,0,0,.28)" };

// update260: MODULE scope (never define a component inside another component)
function AmendModal({ row, onClose, onDone }) {
  const [f, setF] = useState({ boq_qty: String(row.boq_qty ?? ""), rate: row.rate != null ? String(row.rate) : "", basic_rate: row.basic_rate != null ? String(row.basic_rate) : "", reason: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function submit() {
    setErr("");
    if (!f.reason.trim()) { setErr("A reason is required — it goes on the permanent amendment record."); return; }
    setBusy(true);
    const r = await amendBoqItem(row.id, f);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Amendment failed."); return; }
    onDone(r.changed || []);
  }
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>✎ Amend BOQ line</h2>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          <b>{row.item_code || "—"}</b> · {row.display || row.description}<br />
          Submitted bills stay exactly as billed — the new figures apply from the <b>next</b> RA bill onward.
          Every change is logged with your name, date and reason.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div><label className="muted">BOQ qty (now {row.boq_qty})</label><input style={{ width: "100%" }} value={f.boq_qty} onChange={e => setF(x => ({ ...x, boq_qty: e.target.value }))} /></div>
          <div><label className="muted">Rate ₹ (now {row.rate ?? "—"})</label><input style={{ width: "100%" }} value={f.rate} onChange={e => setF(x => ({ ...x, rate: e.target.value }))} /></div>
          <div><label className="muted">Basic rate ₹ (now {row.basic_rate ?? "—"})</label><input style={{ width: "100%" }} value={f.basic_rate} onChange={e => setF(x => ({ ...x, basic_rate: e.target.value }))} /></div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label className="muted">Reason for amendment * <span style={{ fontWeight: 400 }}>(e.g. "Client revised WC qty 50 → 60, mail dt 28-08")</span></label>
          <input style={{ width: "100%" }} value={f.reason} onChange={e => setF(x => ({ ...x, reason: e.target.value }))} />
        </div>
        {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Amend"}</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// update260: MODULE scope — amendment history, one line or the whole site
function HistoryModal({ siteId, row, onClose }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState("");
  useEffect(() => {
    getBoqAmendments(siteId, row?.id).then(setRows).catch(e => { setErr(e.message); setRows([]); });
  }, [siteId, row]);
  const FIELD = { boq_qty: "BOQ qty", rate: "Rate", basic_rate: "Basic rate" };
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...sheetStyle, width: "min(760px, 96vw)" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>🕘 Amendment history{row ? " — " + (row.item_code || row.display) : " (whole site)"}</h2>
        {err && <div className="error">{err}</div>}
        {!rows ? <div className="muted">Loading…</div> : rows.length === 0 ? (
          <div className="muted">No amendments recorded{row ? " for this line" : " on this site"} yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="dt-compact" style={{ width: "100%" }}>
              <thead><tr><th>When</th><th>Field</th><th className="num">Old</th><th className="num">New</th><th>Reason</th><th>By</th></tr></thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id}>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(a.amended_at).toLocaleDateString("en-IN")}</td>
                    <td>{FIELD[a.field] || a.field}</td>
                    <td className="num">{a.old_value != null ? Number(a.old_value).toLocaleString("en-IN") : "—"}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{a.new_value != null ? Number(a.new_value).toLocaleString("en-IN") : "—"}</td>
                    <td style={{ whiteSpace: "normal", fontSize: 12 }}>{a.reason}</td>
                    <td className="muted">{a.by?.full_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 12 }}><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

export default function BoqPage() {
  const [session, setSession] = useState(null);
  const [site, setSite] = useState(1);
  const [sites, setSites] = useState([]);
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("tender");            // update260: tender | extra
  const [form, setForm] = useState(null);
  const [amend, setAmend] = useState(null);            // update260: row being amended
  const [hist, setHist] = useState(null);              // update260: { row } or { row: null } = whole site
  const [itemQ, setItemQ] = useState(""); const [itemHits, setItemHits] = useState([]);   // update260: item-master link search
  const [importOpen, setImportOpen] = useState(false); const [termsOpen, setTermsOpen] = useState(false);   // update455
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const s = getSession(); setSession(s);
    if (s?.sites?.length) { setSites(s.sites); setSite(s.sites[0].id); }
  }, []);
  useEffect(() => { if (site) getBoqItems(site).then(setRows); }, [site, msg]);
  // update369: kits load alongside the lines; the Materials column reads them
  const [kits, setKits] = useState({});
  const [kitRow, setKitRow] = useState(null);
  const [kitErr, setKitErr] = useState("");
  const loadKits = () => { if (site) getBoqKits(site).then(setKits).catch(e => setKitErr(e.message)); };
  useEffect(() => { setKitErr(""); loadKits(); }, [site, msg]);   // eslint-disable-line
  const sessK = typeof window !== "undefined" ? getSession() : null;
  const canKit = !!sessK && (sessK.role === "director" || can(sessK, "boq_material", "manage"));
  const unmapped = (rows || []).filter(r => !(kits[r.id] || []).length).length;

  // update260: item-master search for the "link item" picker (min 2 chars)
  useEffect(() => {
    let live = true;
    if (itemQ.trim().length < 2) { setItemHits([]); return; }
    searchItems(itemQ).then(hits => { if (live) setItemHits((hits || []).slice(0, 6)); });
    return () => { live = false; };
  }, [itemQ]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function save() {
    setErr(""); if (!form.description) { setErr("Description is required."); return; }
    setBusy(true); const res = await saveBoqItem({ ...form, site_id: site }); setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(form.id ? "BOQ line updated." : (form.is_extra ? "Extra (non-tender) item added." : "BOQ line added.")); setForm(null); setItemQ("");
  }

  const shown = (rows || []).filter(r => tab === "extra" ? r.is_extra : !r.is_extra);   // update260

  const columns = [
    { key: "item_code", label: "Code", width: 72, filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.item_code || "—"}</span> },
    { key: "display", label: "Item", filter: "search", wrap: true,
      // update260b: clamp to 2 tidy lines whatever the description length — full text on hover.
      // Without this, a freshly imported BOQ (no short names yet) ballooned every row.
      render: r => <span title={r.description}>
        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 12.5, lineHeight: 1.35 }}>{r.display}</span>
        {r.short_name ? <span className="muted" style={{ fontSize: 10.5 }}>✎ </span> : null}
        {r.is_extra && r.extra_status !== "approved" && <span className="badge gray" style={{ fontSize: 10 }}>rate pending</span>}
        {r.is_extra && r.extra_status === "approved" && <span className="badge p" style={{ fontSize: 10 }}>approved</span>}
      </span> },
    { key: "section", label: "Section", width: 150, wrap: true, filter: "select",
      render: r => <span title={r.section} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 11.5, lineHeight: 1.3 }}>{r.section || "—"}</span> },   // update260b
    { key: "unit", label: "Unit", width: 58 },
    { key: "boq_qty", label: "BOQ qty", type: "num", render: r => r.boq_qty.toLocaleString("en-IN"), exportValue: r => r.boq_qty },
    // update369: the kit — which Item Master materials this line is built from
    { key: "_kit", label: "Materials", sortable: false, exportValue: r => (kits[r.id] || []).map(k => `${k.name} ×${k.qty_per_unit}`).join("; "),
      render: r => { const k = kits[r.id] || []; return (
        <button onClick={() => setKitRow(r)} title="Materials this BOQ line is built from"
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid " + (k.length ? "#86efac" : "#fdba74"),
                   background: k.length ? "#ecfdf5" : "#fff7ed", color: k.length ? "#166534" : "#9a3412", cursor: "pointer", whiteSpace: "nowrap" }}>
          {k.length ? `✓ ${k.length} material${k.length > 1 ? "s" : ""}` : "⚠ none"}
        </button>); } },
    { key: "rate", label: "Rate ₹", type: "num", render: r => r.rate != null ? r.rate.toLocaleString("en-IN") : "—", exportValue: r => r.rate ?? "" },   // update260
    { key: "basic_rate", label: "Basic ₹", type: "num", render: r => r.basic_rate != null ? r.basic_rate.toLocaleString("en-IN") : "—", exportValue: r => r.basic_rate ?? "" },   // update260
    { key: "done_qty", label: "Measured (RA)", type: "num", render: r => r.done_qty.toLocaleString("en-IN"), exportValue: r => r.done_qty },
    { key: "pct", label: "Progress (from RA bills)", type: "num", render: r => (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
        <div style={{ flex: 1, height: 7, background: "#eee", borderRadius: 4 }}><div style={{ width: Math.min(r.pct, 100) + "%", height: 7, borderRadius: 4, background: r.pct >= 100 ? "var(--green)" : "var(--copper)" }} /></div>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{r.pct}%</span>
      </div>), exportValue: r => r.pct + "%" },
    { key: "_a", label: "", sortable: false, render: r => (
      <span style={{ whiteSpace: "nowrap" }}>
        <button style={{ fontSize: 11.5 }} onClick={() => { setForm(r); setItemQ(""); setMsg(""); }}>Edit</button>{" "}
        <button style={{ fontSize: 11.5 }} title="Amend qty/rate with a logged reason" onClick={() => setAmend(r)}>✎ Amend</button>{" "}
        <button style={{ fontSize: 11.5 }} title="Amendment history" onClick={() => setHist({ row: r })}>🕘</button>
      </span>) },
  ];

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>BOQ master</h1>
          <div className="filters">
            <select value={site} onChange={e => setSite(Number(e.target.value))}>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={() => { setForm({ ...blank, is_extra: tab === "extra" }); setItemQ(""); setMsg(""); }}>＋ Add {tab === "extra" ? "extra item" : "line"}</button>
            <button onClick={() => setHist({ row: null })}>🕘 Amendments</button>
            <button onClick={async () => { setErr(""); const r = await autoShortenBoq(site); if (!r.ok) { setErr(r.error); return; } setMsg(r.count + " line(s) given short names — edit any line to refine."); }}>✂ Auto-shorten names</button>
            <button onClick={() => setImportOpen(true)}>⬆ Import BOQ (any client&apos;s Excel)</button>{/* update455 */}
            <button onClick={() => setTermsOpen(true)}>📜 Contract terms</button>
          </div>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — sample BOQ.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && !form && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

        <div className="muted" style={{ margin: "0 0 12px" }}>Upload the client&apos;s BOQ Excel as it came (KEI, SOUL, Brigade — any layout): the importer finds the header row, reads each column by its content, checks the file&apos;s own totals and remembers the mapping as this site&apos;s template. Payment terms go under <b>📜 Contract terms</b>, not into the grid. These lines feed the DPR work dropdown; progress % is driven by RA-bill measured quantities. To change qty/rate on a live line use <b>✎ Amend</b> — it logs the reason and never disturbs submitted bills.</div>
        {importOpen && <BoqImportWizard site={site} siteName={sites.find(s => s.id === site)?.name || ""} existingCount={(rows || []).length} onClose={() => setImportOpen(false)} onDone={m => { setImportOpen(false); setMsg(m); }} />}
        {termsOpen && <ContractTermsCard site={site} siteName={sites.find(s => s.id === site)?.name || ""} canEdit={!!session && (session.role === "director" || can(session, "billing", "manage"))} onClose={() => setTermsOpen(false)} />}

        {form && (
          <div className="panel">
            <h2>{form.id ? "Edit BOQ line" : form.is_extra ? "Add extra (non-tender) item" : "Add BOQ line"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <div><label className="muted">Item code</label><input style={{ width: "100%" }} value={form.item_code} onChange={e => set("item_code", e.target.value)} /></div>
              <div style={{ gridColumn: "span 2" }}><label className="muted">Full description * <span style={{ fontWeight: 400 }}>(prints on the client abstract — keep as per work order)</span></label><input style={{ width: "100%" }} value={form.description} onChange={e => set("description", e.target.value)} /></div>
              <div style={{ gridColumn: "span 2" }}><label className="muted">Short name <span style={{ fontWeight: 400 }}>(shown in app tables, billing worksheet & DPR — concise)</span></label><input style={{ width: "100%" }} value={form.short_name || ""} onChange={e => set("short_name", e.target.value)} placeholder="e.g. Handicap toilet set — EWC + basin + rails" /></div>
              <div><label className="muted">Section</label><input style={{ width: "100%" }} value={form.section} onChange={e => set("section", e.target.value)} /></div>
              <div><label className="muted">Unit</label><input style={{ width: "100%" }} value={form.unit} onChange={e => set("unit", e.target.value)} /></div>
              <div><label className="muted">BOQ qty</label><input style={{ width: "100%" }} value={form.boq_qty} onChange={e => set("boq_qty", e.target.value)} /></div>
              <div><label className="muted">Rate ₹</label><input style={{ width: "100%" }} value={form.rate} onChange={e => set("rate", e.target.value)} /></div>
              <div><label className="muted">Basic rate ₹ <span style={{ fontWeight: 400 }}>(tender basic — CP/sanitary items only)</span></label><input style={{ width: "100%" }} value={form.basic_rate ?? ""} onChange={e => set("basic_rate", e.target.value)} /></div>
            </div>

            {/* update260: extra-item flag + approval status */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
              <label style={{ display: "inline-flex", gap: 7, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={!!form.is_extra} onChange={e => set("is_extra", e.target.checked)} />
                Extra / non-tender item (came up during execution)
              </label>
              {form.is_extra && (
                <div>
                  <label className="muted" style={{ marginRight: 6 }}>Rate status</label>
                  <select value={form.extra_status || "pending"} onChange={e => set("extra_status", e.target.value)}>
                    <option value="pending">Pending client approval</option>
                    <option value="approved">Rate approved by client</option>
                  </select>
                </div>
              )}
            </div>

            {/* update260: optional Item-Master link — lets the RA bill pull the actual purchase rate from POs */}
            <div style={{ marginTop: 12, border: "1px dashed var(--border)", borderRadius: 8, padding: 10 }}>
              <label className="muted">Link to Item Master <span style={{ fontWeight: 400 }}>(optional — enables auto purchase-rate for the Basic Rate Difference)</span></label>
              {form.item_id ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                  <span className="badge p">🔗 {form.item_name || ("Item #" + form.item_id)}</span>
                  <button style={{ fontSize: 11.5 }} onClick={() => { set("item_id", null); set("item_name", ""); }}>✕ Unlink</button>
                </div>
              ) : (
                <div style={{ position: "relative", marginTop: 6 }}>
                  <input style={{ width: "100%" }} placeholder="Search item master… e.g. EWC Kohler" value={itemQ} onChange={e => setItemQ(e.target.value)} />
                  {itemHits.length > 0 && (
                    <div style={{ position: "absolute", zIndex: 20, background: "var(--card, #fff)", border: "1px solid var(--border)", borderRadius: 8, width: "100%", boxShadow: "0 8px 24px rgba(0,0,0,.14)" }}>
                      {itemHits.map(h => (
                        <div key={h.id} style={{ padding: "7px 10px", cursor: "pointer", fontSize: 13 }}
                          onClick={() => { set("item_id", h.id); set("item_name", h.display_name); setItemQ(""); setItemHits([]); }}>
                          {h.display_name} <span className="muted" style={{ fontSize: 11 }}>({h.unit})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
              <button onClick={() => { setForm(null); setItemQ(""); }}>Cancel</button>
            </div>
          </div>
        )}

        {/* update260: Tender / Extra tabs */}
        <div style={{ display: "flex", gap: 8, margin: "0 0 10px" }}>
          <button className={tab === "tender" ? "primary" : ""} onClick={() => setTab("tender")}>Tender BOQ ({(rows || []).filter(r => !r.is_extra).length})</button>
          <button className={tab === "extra" ? "primary" : ""} onClick={() => setTab("extra")}>Extra / Non-tender ({(rows || []).filter(r => r.is_extra).length})</button>
        </div>

        <div className="panel">
          {/* update369 */}
        {kitErr && <div className="error" style={{ marginBottom: 8 }}>{kitErr}</div>}
        {rows && rows.length > 0 && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8, fontSize: 12.5 }}>
            <span className={unmapped ? "badge warn" : "badge p"}>{unmapped ? `⚠ ${unmapped} of ${rows.length} BOQ lines have no materials mapped` : `✓ every BOQ line has materials mapped`}</span>
            <span className="muted" style={{ fontSize: 11.5 }}>Indents at this site in strict categories can only pick mapped materials.</span>
            {canKit && sites.length > 1 && (
              <button style={{ fontSize: 11.5 }} onClick={async () => {
                const from = prompt("Copy kits FROM which site? Enter the site id:\n" + sites.map(x => `${x.id} — ${x.name}`).join("\n"));
                if (!from) return;
                const r = await copyBoqKits(from, site);
                if (!r.ok) { setKitErr(r.error); return; }
                setKitErr(""); loadKits(); alert(`${r.copied} kit line(s) copied (matched by item code).`);
              }}>⧉ Copy kits from another site</button>
            )}
          </div>
        )}
          {!rows ? <div className="muted">Loading…</div> :
            shown.length === 0 && tab === "extra" ? <div className="muted">No extra items yet. When a non-tender item comes up on site, add it here with its rate — it bills in its own "Extra / Non-tender items" section on the RA bill.</div> :
            <DataTable fixed columns={columns} rows={shown} exportName={tab === "extra" ? "boq_extra_items" : "boq"} />}
        </div>

        {amend && <AmendModal row={amend} onClose={() => setAmend(null)}
          onDone={changed => { setAmend(null); setMsg("Amended (" + changed.join(", ") + ") — logged with reason. Applies from the next RA bill."); }} />}
        {hist && <HistoryModal siteId={site} row={hist.row} onClose={() => setHist(null)} />}
        {kitRow && <BoqKitModal row={kitRow} kit={kits[kitRow.id] || []} canEdit={canKit} onClose={() => setKitRow(null)} onChanged={loadKits} />}
      </main>
    </div>

  );
}
