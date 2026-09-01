"use client";
// update256: PENDING DELIVERIES REGISTER.
// Purely derived — every quantity comes from v_po_item_pending (PO lines vs GRN receipts).
// Recording a GRN or Delivery Challan updates this list on its own; nothing is typed twice.
import { Fragment, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { inr } from "@/lib/procure";
import {
  getPendingDeliveries, getPendingSummary, getFollowups, addFollowup, shortClose,
  ageBand, LINE_STATUS, AGE_AMBER, AGE_RED, groupByPO,
} from "@/lib/pending";

const qty = (n, u) => Number(n || 0).toLocaleString("en-IN") + (u ? " " + u : "");

// module scope — never define a component inside a component (update204)
function Stat({ label, value, sub, color }) {
  return (
    <div style={{ flex: "1 1 170px", minWidth: 150, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "12px 14px" }}>
      <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: color || "var(--text)", marginTop: 2 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

function Bar({ pct, tone }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ height: 6, background: "#eee7df", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: Math.min(pct, 100) + "%", height: 6, background: tone }} />
      </div>
      <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{pct}% received</div>
    </div>
  );
}

export default function PendingDeliveriesPage() {
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState(null);
  const [sum, setSum] = useState(null);
  const [sites, setSites] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [site, setSite] = useState("all");
  const [vendor, setVendor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");

  const [open, setOpen] = useState({});          // update257: which PO rows are expanded
  const [panel, setPanel] = useState(null);      // { row, mode: "followup" | "close" | "letter" }
  const [letterNote, setLetterNote] = useState("");
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [promised, setPromised] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) { window.location.replace("/login"); return; }
    setSession(s);
    getSites().then(r => setSites(r?.rows || r || []));
  }, []);

  const load = () => {
    const f = { siteId: site === "all" ? null : site, vendor, from, to, status };
    getPendingDeliveries(f).then(setRows).catch(e => { setRows([]); setErr(e.message || String(e)); });
    getPendingSummary(f).then(setSum).catch(() => setSum(null));
  };
  useEffect(() => { if (session) load(); }, [session, site, vendor, from, to, status]);   // eslint-disable-line react-hooks/exhaustive-deps

  const vendors = useMemo(() => [...new Set((rows || []).map(r => r.vendor_name).filter(Boolean))].sort(), [rows]);
  // update257: ONE row per PO. The per-item detail moves one level down, into the expansion.
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const filtered = !t ? (rows || [])
      : (rows || []).filter(r => (r.po_no + " " + r.item_name + " " + r.vendor_name).toLowerCase().includes(t));
    return groupByPO(filtered);
  }, [rows, q]);

  async function openPanel(row, mode) {
    setPanel({ row, mode }); setNoteText(""); setPromised("");
    setNotes(await getFollowups(row.po_item_id));
  }

  async function saveFollowup() {
    setBusy(true);
    const r = await addFollowup({ poItemId: panel.row.po_item_id, poId: panel.row.po_id, note: noteText, promisedBy: promised }, session?.id);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setNoteText(""); setPromised("");
    setNotes(await getFollowups(panel.row.po_item_id));
    setMsg("Follow-up logged.");
  }

  async function doShortClose() {
    if (!noteText.trim()) { setErr("A reason is required to short-close."); return; }
    setBusy(true);
    const r = await shortClose(panel.row.po_item_id, noteText);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setPanel(null); setMsg("Short-closed — the reason is kept on the record.");
    load();
  }

  if (!session) return null;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Pending deliveries</h1></div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>
          Ordered vs received, derived automatically from every linked GRN / Delivery Challan — no manual entry.
        </div>

        {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        {sum && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <Stat label="📋 PO lines pending" value={sum.lines} sub={sum.pos + " PO(s) · " + sum.vendors + " vendor(s)"} />
            <Stat label="💰 Pending value" value={inr(sum.value)} sub="at PO rate" />
            <Stat label={"🟢 Recent (<" + AGE_AMBER + " days)"} value={sum.green} sub="on track" color="var(--green)" />
            <Stat label={"🟡 Aging (" + AGE_AMBER + "–" + AGE_RED + " days)"} value={sum.amber} sub="needs follow-up" color="var(--amber)" />
            <Stat label={"🔴 Overdue (" + AGE_RED + "+ days)"} value={sum.red} sub="escalate" color="var(--red)" />
          </div>
        )}

        <div className="panel">
          <div className="filters" style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">Site: all</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={vendor} onChange={e => setVendor(e.target.value)}>
              <option value="">Vendor: all</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} title="PO date from" />
            <span className="muted" style={{ alignSelf: "center", fontSize: 12 }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} title="PO date to" />
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="open">Status: still pending</option>
              <option value="partial">Partially received</option>
              <option value="pending">Nothing received</option>
              <option value="received">Fully received</option>
              <option value="excess">Excess</option>
              <option value="short_closed">Short-closed</option>
              <option value="all">All lines</option>
            </select>
            <input placeholder="🔍 Search PO / item / vendor" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 190 }} />
            {(site !== "all" || vendor || from || to || q || status !== "open") &&
              <button onClick={() => { setSite("all"); setVendor(""); setFrom(""); setTo(""); setQ(""); setStatus("open"); }}>✕ Clear</button>}
          </div>

          {rows === null ? <div className="muted">Loading…</div> : groups.length === 0
            ? <div className="muted" style={{ padding: 18, textAlign: "center" }}>
                Nothing pending with these filters. {status === "open" && "Every ordered line has been received."}</div>
            : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr>
                    <th style={{ width: 26 }}></th>
                    <th>PO</th><th>Vendor</th><th>Site</th>
                    <th className="num">Items pending</th><th className="num">Pending value</th>
                    <th>Progress</th><th>Oldest</th><th>Status</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {groups.map(g => {
                      const band = ageBand(g.days_pending);
                      const st = LINE_STATUS[g.po_status] || [g.po_status, "gray"];
                      const isOpen = !!open[g.po_id];
                      return (
                        <Fragment key={g.po_id}>
                          {/* update257: ONE row per PO. Items live in the expansion below. */}
                          <tr style={{ cursor: "pointer" }} onClick={() => setOpen(o => ({ ...o, [g.po_id]: !o[g.po_id] }))}>
                            <td style={{ textAlign: "center", color: "var(--muted)" }}>{isOpen ? "▾" : "▸"}</td>
                            <td><b style={{ fontSize: 12.5 }}>{g.po_no}</b>
                              <div className="muted" style={{ fontSize: 11 }}>{String(g.po_date || "").slice(0, 10)}</div></td>
                            <td style={{ fontSize: 12 }}>{g.vendor_name}</td>
                            <td style={{ fontSize: 12 }}>{g.site_name || "—"}</td>
                            <td className="num" style={{ fontWeight: 700, color: g.pending_lines ? "var(--red)" : "var(--green)" }}>
                              {g.pending_lines || 0}<span className="muted" style={{ fontWeight: 400 }}> / {g.item_count}</span></td>
                            <td className="num">{inr(g.pending_value)}</td>
                            <td><Bar pct={g.pct_received} tone={band.color} /></td>
                            <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                              {g.pending_lines > 0
                                ? <span style={{ color: band.color, fontWeight: 700 }}>● {g.days_pending} days</span>
                                : <span className="muted">—</span>}</td>
                            <td><span className={"badge " + st[1]}>{st[0]}</span></td>
                            <td style={{ whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                              {g.pending_lines > 0 && (<>
                                <a href={"/stock/grn?po=" + g.po_id} target="_blank" rel="noreferrer">
                                  <button className="primary" style={{ fontSize: 11.5, marginRight: 4 }}>Record delivery</button></a>
                                <button style={{ fontSize: 11.5, marginRight: 4 }}
                                  onClick={() => { setLetterNote(""); setPanel({ row: g, mode: "letter" }); }}>Follow up</button>
                              </>)}
                              <button style={{ fontSize: 11.5 }}
                                onClick={() => setOpen(o => ({ ...o, [g.po_id]: true }))}>Items</button>
                            </td>
                          </tr>

                          {isOpen && g.items.map(r => {
                            const ib = ageBand(r.days_pending);
                            const ist = LINE_STATUS[r.line_status] || [r.line_status, "gray"];
                            const closed = r.line_status === "short_closed";
                            return (
                              <tr key={r.po_item_id} style={{ background: "#fbf8f5", opacity: closed ? 0.6 : 1 }}>
                                <td></td>
                                <td colSpan={3} style={{ paddingLeft: 18, fontSize: 12 }}>
                                  ↳ {r.item_name}
                                  {closed && r.short_close_note &&
                                    <div className="muted" style={{ fontSize: 10.5 }}>{r.short_close_note}</div>}
                                </td>
                                <td className="num" style={{ fontSize: 11.5 }}>
                                  {qty(r.ordered_qty, r.unit)}<div className="muted" style={{ fontSize: 10.5 }}>received {qty(r.received_qty, r.unit)}{r.dc_qty > 0 && <span title="On a delivery challan not yet converted to GRN — counts as delivered" style={{ color: "#b45309" }}> (incl. {qty(r.dc_qty, r.unit)} on challan · GRN pending)</span>}</div></td>
                                <td className="num" style={{ fontWeight: 700, color: r.excess_qty > 0 ? "var(--copper)" : r.pending_qty > 0 ? "var(--red)" : "var(--green)" }}>
                                  {r.excess_qty > 0 ? "+" + qty(r.excess_qty, r.unit) : qty(r.pending_qty, r.unit)}</td>
                                <td><Bar pct={r.pct_received} tone={r.excess_qty > 0 ? "var(--copper)" : ib.color} /></td>
                                <td style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                                  {r.pending_qty > 0 && !closed
                                    ? <span style={{ color: ib.color, fontWeight: 700 }}>{r.days_pending} d</span>
                                    : <span className="muted">—</span>}</td>
                                <td><span className={"badge " + ist[1]} style={{ fontSize: 10 }}>{ist[0]}</span></td>
                                <td style={{ whiteSpace: "nowrap" }}>
                                  {r.pending_qty > 0 && !closed && (<>
                                    <button style={{ fontSize: 11, marginRight: 4 }} onClick={() => openPanel(r, "followup")}>Note</button>
                                    <button style={{ fontSize: 11, color: "var(--red)" }} onClick={() => openPanel(r, "close")}>Short-close</button>
                                  </>)}
                                  {closed && <button style={{ fontSize: 11 }} onClick={() => openPanel(r, "followup")}>History</button>}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>

        {panel && (
          <div onClick={() => setPanel(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 520, width: "100%", padding: 20, maxHeight: "85vh", overflowY: "auto" }}>
              <h2 style={{ marginBottom: 2, fontSize: 17 }}>
                {panel.mode === "close" ? "Short-close this line"
                  : panel.mode === "letter" ? "Follow-up reminder to vendor" : "Follow-up history"}</h2>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                {panel.mode === "letter"
                  ? panel.row.po_no + " · " + panel.row.vendor_name + " · " + panel.row.pending_lines + " item(s) still pending"
                  : panel.row.po_no + " · " + panel.row.item_name + " · pending " + qty(panel.row.pending_qty, panel.row.unit) + " of " + qty(panel.row.ordered_qty, panel.row.unit)}
              </div>

              {/* update257: compose a note, then open the printable reminder for this PO */}
              {panel.mode === "letter" && (
                <>
                  <label style={{ fontSize: 12.5, fontWeight: 700 }}>Note to the vendor (optional)</label>
                  <textarea rows={3} value={letterNote} onChange={e => setLetterNote(e.target.value)}
                    placeholder="e.g. Please confirm the dispatch date for the balance quantity."
                    style={{ width: "100%", marginTop: 4 }} />
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                    The reminder lists every item still pending on this PO, with ordered, received and
                    pending quantities and how long each has been outstanding.
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={() => setPanel(null)}>Cancel</button>
                    <button className="primary" onClick={() => {
                      const url = "/procure/followup?po=" + panel.row.po_id +
                        (letterNote.trim() ? "&note=" + encodeURIComponent(letterNote.trim()) : "");
                      window.open(url, "_blank", "noopener");
                      setPanel(null);
                    }}>Open reminder</button>
                  </div>
                </>
              )}

              {panel.mode === "letter" ? null : panel.mode === "close" ? (
                <>
                  <div className="note amber" style={{ fontSize: 12, marginBottom: 10 }}>
                    This closes the remaining {qty(panel.row.pending_qty, panel.row.unit)} permanently and removes the line
                    from the active list. Nothing is deleted — the reason, who closed it and when are kept on the record.
                  </div>
                  <label style={{ fontSize: 12.5, fontWeight: 700 }}>Reason (required)</label>
                  <textarea rows={3} value={noteText} onChange={e => setNoteText(e.target.value)}
                    placeholder="e.g. Vendor out of stock, balance sourced from another vendor"
                    style={{ width: "100%", marginTop: 4 }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                    <button onClick={() => setPanel(null)}>Cancel</button>
                    <button className="primary" disabled={busy || !noteText.trim()} onClick={doShortClose}>
                      {busy ? "Saving…" : "Short-close"}</button>
                  </div>
                </>
              ) : (
                <>
                  {panel.row.line_status !== "short_closed" && (
                    <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 12 }}>
                      <textarea rows={2} value={noteText} onChange={e => setNoteText(e.target.value)}
                        placeholder="e.g. Called vendor, promised delivery by 5 Sep" style={{ width: "100%" }} />
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                        <label style={{ fontSize: 12 }} className="muted">Promised by</label>
                        <input type="date" value={promised} onChange={e => setPromised(e.target.value)} />
                        <button className="primary" style={{ marginLeft: "auto" }} disabled={busy || !noteText.trim()} onClick={saveFollowup}>
                          {busy ? "Saving…" : "Log follow-up"}</button>
                      </div>
                    </div>
                  )}
                  {notes.length === 0
                    ? <div className="muted" style={{ fontSize: 12.5 }}>No follow-ups logged yet.</div>
                    : notes.map(n => (
                        <div key={n.id} style={{ borderLeft: "3px solid var(--copper)", paddingLeft: 10, marginBottom: 10 }}>
                          <div style={{ fontSize: 12.5 }}>{n.note}</div>
                          <div className="muted" style={{ fontSize: 11 }}>
                            {n.author?.full_name || "—"} · {String(n.created_at).slice(0, 16).replace("T", " ")}
                            {n.promised_by ? " · promised by " + n.promised_by : ""}
                          </div>
                        </div>
                      ))}
                  {panel.row.line_status === "short_closed" && (
                    <div className="note" style={{ marginTop: 12, fontSize: 12 }}>
                      <b>Short-closed</b> by {panel.row.short_closed_by_name || "—"} on {String(panel.row.short_closed_at || "").slice(0, 10)}
                      <div style={{ marginTop: 4 }}>{panel.row.short_close_note}</div>
                    </div>
                  )}
                  <div style={{ textAlign: "right", marginTop: 14 }}><button onClick={() => setPanel(null)}>Close</button></div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
