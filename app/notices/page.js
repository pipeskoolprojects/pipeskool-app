"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { getStaff } from "@/lib/access";
import { getRoles } from "@/lib/access";
import {
  PRIORITIES, CATEGORIES, canAny,
  getTodayQuote, getTodayQuoteRow, regenerateTodayQuote, saveQuoteText, toggleQuoteFavorite, getQuoteHistory,
  getNotices, getMyReadsAcks, markRead, acknowledge, getNoticeStats,
  getComments, addComment, createNotice, updateNotice, setPinned, deactivateNotice,
} from "@/lib/notices";

const PRIO_BADGE = { normal: "gray", important: "warn", urgent: "a", emergency: "a" };
const catLabel = c => (CATEGORIES.find(x => x[0] === c) || ["", c])[1];

export default function NoticesPage() {
  const [sess, setSess] = useState(null);
  const [sites, setSites] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [roles, setRoles] = useState([]);
  const [list, setList] = useState(null);
  const [mine, setMine] = useState({ reads: new Set(), acks: new Set() });
  const [quote, setQuote] = useState(null);
  const [quoteRow, setQuoteRow] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [editingQuote, setEditingQuote] = useState(null);   // text being edited
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [files, setFiles] = useState([]);
  const [openComments, setOpenComments] = useState({});     // {id: comments[]}
  const [commentText, setCommentText] = useState({});
  const [statsFor, setStatsFor] = useState(null);           // {notice, stats}
  const [q, setQ] = useState(""); const [fCat, setFCat] = useState(""); const [fPrio, setFPrio] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = getSession(); setSess(s);
    getSites().then(setSites);
    getTodayQuote().then(setQuote);
    getRoles().then(rs => setRoles((rs || []).map(r => [r.code, r.label])));
  }, []);
  const isAdmin = sess && (sess.role === "director" || canAny(sess, "notices", "manage"));
  const isITExecutive = String(sess?.role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive";
  const canCreate = sess && (sess.role === "director" || canAny(sess, "notices", "create"));

  useEffect(() => { if (isAdmin) { getStaff().then(setStaffList); getTodayQuoteRow().then(setQuoteRow); } }, [isAdmin]);

  const load = () => { if (!sess) return; getNotices(sess).then(async ns => { setList(ns); const m = await getMyReadsAcks(sess.id); setMine(m);
    // read receipts: everything now on screen counts as seen
    ns.filter(n => !m.reads.has(n.id)).forEach(n => markRead(n.id, sess.id));
  }); };
  useEffect(() => { load(); }, [sess, msg]);

  const blank = { title: "", body: "", priority: "normal", category: "general", audience_type: "company",
    start_date: new Date().toISOString().slice(0, 10), expiry_date: "", is_pinned: false, allow_comments: true, require_ack: false,
    siteIds: [], roleCodes: [], staffIds: [] };

  async function submit() {
    setErr("");
    if (!form.title.trim() || !form.body.trim()) { setErr("Title and description are mandatory."); return; }
    const targets = form.audience_type === "sites" ? form.siteIds.map(id => ({ site_id: Number(id) }))
      : form.audience_type === "roles" ? form.roleCodes.map(r => ({ role: r }))
      : form.audience_type === "staff" ? form.staffIds.map(id => ({ staff_id: Number(id) })) : [];
    if (form.audience_type !== "company" && targets.length === 0) { setErr("Pick at least one target for the selected audience."); return; }
    setBusy(true);
    const res = editId ? await updateNotice(editId, form, sess) : await createNotice(form, targets, files, sess);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setForm(null); setEditId(null); setFiles([]);
    setMsg(editId ? "Notice updated." : "Notice published.");
  }

  async function toggleComments(n) {
    if (openComments[n.id]) { setOpenComments(o => { const x = { ...o }; delete x[n.id]; return x; }); return; }
    setOpenComments(o => ({ ...o, [n.id]: [] }));
    const cs = await getComments(n.id);
    setOpenComments(o => ({ ...o, [n.id]: cs }));
  }
  async function sendComment(n) {
    const t = (commentText[n.id] || "").trim(); if (!t) return;
    const r = await addComment(n.id, sess.id, t);
    if (!r.ok) { setErr(r.error); return; }
    setCommentText(c => ({ ...c, [n.id]: "" }));
    setOpenComments(o => ({ ...o })); // refresh below
    getComments(n.id).then(cs => setOpenComments(o => ({ ...o, [n.id]: cs })));
  }

  const shown = (list || []).filter(n =>
    (!q.trim() || (n.title + " " + n.body).toLowerCase().includes(q.toLowerCase())) &&
    (!fCat || n.category === fCat) && (!fPrio || n.priority === fPrio));
  const noticePriorityCounts = PRIORITIES.map(([key, label]) => ({ key, label, value: shown.filter(n => n.priority === key).length }))
    .filter(x => x.value > 0);
  const noticePriorityTotal = noticePriorityCounts.reduce((total, item) => total + item.value, 0);
  const priorityColors = { normal: "#2e90fa", important: "#f79009", urgent: "#f04438", emergency: "#b42318" };
  let priorityCursor = 0;
  const noticePriorityGradient = noticePriorityTotal
    ? noticePriorityCounts.map(item => { const start = priorityCursor; priorityCursor += item.value / noticePriorityTotal * 100; return `${priorityColors[item.key] || "#98a2b3"} ${start}% ${priorityCursor}%`; }).join(", ")
    : "#e4e7ec 0% 100%";
  const activeNotices = list || [];
  const urgentNotices = activeNotices.filter(n => n.priority === "urgent" || n.priority === "emergency").length;
  const pinnedNotices = activeNotices.filter(n => n.is_pinned).length;
  const pendingAcks = activeNotices.filter(n => n.require_ack && !mine.acks.has(n.id)).length;

  const multi = (arr, id, on) => on ? [...arr, id] : arr.filter(x => x !== id);

  return (
    <div className="layout">
      <Sidebar />
      <main className={"main" + (isITExecutive ? " it-notices-page" : "")}>
        <div className="page-head"><h1>Notice Board</h1>
          {canCreate && <button className="primary" onClick={() => { setEditId(null); setFiles([]); setForm({ ...blank }); }}>＋ New notice</button>}
        </div>
        {isITExecutive && <section aria-label="Live notice overview" className="it-notice-overview">
          {[["Active notices", activeNotices.length], ["Urgent notices", urgentNotices], ["Pinned notices", pinnedNotices], ["Acknowledgements pending", pendingAcks]].map(([label, value]) => <article key={label} className="panel" style={{ padding: 14, display: "grid", alignContent: "center", gap: 5 }}><span className="muted" style={{ fontSize: 12 }}>{label}</span><strong style={{ fontSize: 25, lineHeight: 1.1 }}>{list === null ? "—" : value.toLocaleString("en-IN")}</strong><small className="muted" style={{ fontSize: 10.5 }}>{list === null ? "Loading live notices" : "From notices visible to your account"}</small></article>)}
          <article className="panel" style={{ padding: 14, minWidth: 0 }}><span className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: "var(--copper)" }}>LIVE PRIORITY MIX</span><h2 style={{ fontSize: 15, margin: "5px 0" }}>Visible notices by priority</h2><p className="muted" style={{ fontSize: 11, margin: 0 }}>Current search and filters applied.</p><div style={{ display: "grid", gridTemplateColumns: "76px minmax(0,1fr)", alignItems: "center", gap: 12, marginTop: 10 }}><div style={{ width: 74, aspectRatio: 1, borderRadius: "50%", display: "grid", placeItems: "center", position: "relative", background: `conic-gradient(${noticePriorityGradient})` }}><span style={{ position: "absolute", inset: 11, borderRadius: "50%", background: "var(--card)", display: "grid", placeItems: "center", fontWeight: 800 }}>{list === null ? "—" : shown.length.toLocaleString("en-IN")}</span></div><div style={{ display: "grid", gap: 6, fontSize: 11.5 }}>{noticePriorityCounts.map(item => <span key={item.key} style={{ display: "flex", alignItems: "center", gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: "50%", background: priorityColors[item.key] }} />{item.label}<b style={{ marginLeft: "auto" }}>{item.value.toLocaleString("en-IN")}</b></span>)}{!noticePriorityCounts.length && <span className="muted">No matching notices</span>}</div></div></article>
        </section>}
        {msg && <div className="note green" style={{ marginBottom: 10 }}>{msg}</div>}
        {err && <div className="note red" style={{ marginBottom: 10 }}>{err}</div>}

        {/* ---- Today's quote ---- */}
        <div className="panel" style={{ marginBottom: 14, background: "var(--copper-soft)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>💡</span>
            {editingQuote === null ? (
              <b style={{ fontSize: 15, flex: 1, minWidth: 220 }}>{quote || "…"}</b>
            ) : (
              <input style={{ flex: 1, minWidth: 220 }} value={editingQuote} onChange={e => setEditingQuote(e.target.value)} />
            )}
            {isAdmin && quoteRow && (
              <span style={{ display: "flex", gap: 6 }}>
                {editingQuote === null ? <>
                  <button style={{ fontSize: 11.5 }} onClick={async () => { const r = await regenerateTodayQuote(); if (r.ok) { setQuote(r.text); getTodayQuoteRow().then(setQuoteRow); setMsg("New quote picked."); } }}>↻ Another</button>
                  <button style={{ fontSize: 11.5 }} onClick={() => setEditingQuote(quote || "")}>✎ Edit</button>
                  <button style={{ fontSize: 11.5 }} title="Favorite" onClick={async () => { await toggleQuoteFavorite(quoteRow.id, !quoteRow.is_favorite); getTodayQuoteRow().then(setQuoteRow); }}>{quoteRow.is_favorite ? "★" : "☆"}</button>
                  <button style={{ fontSize: 11.5 }} onClick={async () => { setShowHistory(h => !h); if (!showHistory) setHistory(await getQuoteHistory(30)); }}>{showHistory ? "Hide history" : "History"}</button>
                </> : <>
                  <button className="primary" style={{ fontSize: 11.5 }} onClick={async () => { const r = await saveQuoteText(quoteRow.id, editingQuote); if (r.ok) { setQuote(editingQuote.trim()); setEditingQuote(null); setMsg("Quote updated."); } else setErr(r.error); }}>Save</button>
                  <button style={{ fontSize: 11.5 }} onClick={() => setEditingQuote(null)}>✕</button>
                </>}
              </span>
            )}
          </div>
          {showHistory && (
            <table className="dt-compact" style={{ marginTop: 10, background: "#fff", borderRadius: 8 }}>
              <tbody>{history.map(h => (
                <tr key={h.id}><td className="muted" style={{ whiteSpace: "nowrap" }}>{h.quote_date}</td><td>{h.text}</td>
                  <td><button style={{ fontSize: 11 }} onClick={async () => { await toggleQuoteFavorite(h.id, !h.is_favorite); setHistory(await getQuoteHistory(30)); }}>{h.is_favorite ? "★" : "☆"}</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>

        {/* ---- Create / edit ---- */}
        {form && (
          <div className="panel" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{editId ? "Edit notice" : "New notice"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}><label className="muted">Title *</label>
                <input style={{ width: "100%" }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label className="muted">Description *</label>
                <textarea rows={4} style={{ width: "100%" }} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} /></div>
              <div><label className="muted">Priority</label>
                <select style={{ width: "100%" }} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}</select></div>
              <div><label className="muted">Category</label>
                <select style={{ width: "100%" }} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</select></div>
              <div><label className="muted">Start date</label>
                <input type="date" style={{ width: "100%" }} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
              <div><label className="muted">Expiry date (blank = never)</label>
                <input type="date" style={{ width: "100%" }} value={form.expiry_date || ""} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} /></div>
              {!editId && (
                <div style={{ gridColumn: "1 / -1" }}><label className="muted">Audience</label><br />
                  <select value={form.audience_type} onChange={e => setForm(f => ({ ...f, audience_type: e.target.value }))}>
                    <option value="company">Entire company</option>
                    <option value="sites">Selected sites</option>
                    <option value="roles">Selected departments (roles)</option>
                    <option value="staff">Selected employees</option>
                  </select>
                  {form.audience_type === "sites" && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                      {sites.map(s => <label key={s.id} style={{ fontSize: 12.5 }}><input type="checkbox" checked={form.siteIds.includes(s.id)} onChange={e => setForm(f => ({ ...f, siteIds: multi(f.siteIds, s.id, e.target.checked) }))} /> {s.name}</label>)}
                    </div>)}
                  {form.audience_type === "roles" && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                      {roles.map(r => <label key={r[0]} style={{ fontSize: 12.5 }}><input type="checkbox" checked={form.roleCodes.includes(r[0])} onChange={e => setForm(f => ({ ...f, roleCodes: multi(f.roleCodes, r[0], e.target.checked) }))} /> {r[1]}</label>)}
                    </div>)}
                  {form.audience_type === "staff" && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6, maxHeight: 120, overflowY: "auto" }}>
                      {staffList.map(u => <label key={u.id} style={{ fontSize: 12.5 }}><input type="checkbox" checked={form.staffIds.includes(u.id)} onChange={e => setForm(f => ({ ...f, staffIds: multi(f.staffIds, u.id, e.target.checked) }))} /> {u.full_name}</label>)}
                    </div>)}
                </div>
              )}
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 18, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={form.is_pinned} onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))} /> 📌 Pin to top</label>
                <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={form.require_ack} onChange={e => setForm(f => ({ ...f, require_ack: e.target.checked }))} /> Require acknowledgement</label>
                <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={form.allow_comments} onChange={e => setForm(f => ({ ...f, allow_comments: e.target.checked }))} /> Allow comments</label>
              </div>
              {!editId && (
                <div style={{ gridColumn: "1 / -1" }}><label className="muted">Attachments (PDF / image / video / Excel / Word — max 50MB each)</label><br />
                  <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []).filter(f => f.size <= 50 * 1024 * 1024))} />
                  {files.length > 0 && <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{files.length} file(s) selected</span>}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : editId ? "Save changes" : "Publish notice"}</button>
              <button onClick={() => { setForm(null); setEditId(null); }}>Cancel</button>
            </div>
          </div>
        )}

        {/* ---- Filters ---- */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input placeholder="🔍 Search notices…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 180 }} />
          <select value={fCat} onChange={e => setFCat(e.target.value)}><option value="">Category: all</option>{CATEGORIES.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</select>
          <select value={fPrio} onChange={e => setFPrio(e.target.value)}><option value="">Priority: all</option>{PRIORITIES.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}</select>
          {(q || fCat || fPrio) && <button onClick={() => { setQ(""); setFCat(""); setFPrio(""); }} style={{ fontSize: 12 }}>Clear</button>}
        </div>

        {/* ---- Notice list ---- */}
        {!list ? <div className="muted">Loading…</div> : shown.length === 0 ? (
          <div className="panel muted">No notices{q || fCat || fPrio ? " match the filters" : " yet"}.</div>
        ) : shown.map(n => (
          <div key={n.id} className="panel" style={{ marginBottom: 10, borderLeft: n.priority === "emergency" ? "4px solid var(--red)" : n.priority === "urgent" ? "4px solid #E65100" : undefined }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {n.is_pinned && <span title="Pinned">📌</span>}
              <b style={{ fontSize: 15 }}>{n.title}</b>
              <span className={"badge " + PRIO_BADGE[n.priority]}>{n.priority.toUpperCase()}</span>
              <span className="badge gray">{catLabel(n.category)}</span>
              {!mine.reads.has(n.id) && <span className="badge a">NEW</span>}
              <span className="muted" style={{ marginLeft: "auto", fontSize: 11.5 }}>
                {String(n.created_at).slice(0, 10)}{n.creator?.full_name ? " · " + n.creator.full_name : ""}{n.expiry_date ? " · till " + n.expiry_date : ""}</span>
            </div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.5 }}>{n.body}</div>
            {n.notice_attachments?.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {n.notice_attachments.map(a => <a key={a.id} href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, background: "#F4F5F7", padding: "5px 9px", borderRadius: 7, textDecoration: "none" }}>📎 {a.name}</a>)}
              </div>)}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              {n.require_ack && (mine.acks.has(n.id)
                ? <span className="badge green">✓ Acknowledged</span>
                : <button className="primary" style={{ fontSize: 12 }} onClick={async () => { const r = await acknowledge(n.id, sess.id); if (r.ok) { setMine(m => ({ ...m, acks: new Set([...m.acks, n.id]) })); } }}>✋ Acknowledge</button>)}
              {n.allow_comments && <button style={{ fontSize: 12 }} onClick={() => toggleComments(n)}>💬 Comments</button>}
              {isAdmin && <>
                <button style={{ fontSize: 12 }} onClick={async () => setStatsFor({ notice: n, stats: await getNoticeStats(n.id) })}>👁 Seen / Ack</button>
                <button style={{ fontSize: 12 }} onClick={async () => { const r = await setPinned(n.id, !n.is_pinned, sess); if (r.ok) setMsg(n.is_pinned ? "Unpinned." : "Pinned."); }}>{n.is_pinned ? "Unpin" : "📌 Pin"}</button>
                <button style={{ fontSize: 12 }} onClick={() => { setEditId(n.id); setForm({ ...blank, title: n.title, body: n.body, priority: n.priority, category: n.category, start_date: n.start_date, expiry_date: n.expiry_date || "", is_pinned: n.is_pinned, allow_comments: n.allow_comments, require_ack: n.require_ack, audience_type: n.audience_type }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                <button style={{ fontSize: 12, color: "var(--red)" }} onClick={async () => { if (confirm("Remove this notice for everyone?")) { const r = await deactivateNotice(n.id, sess); if (r.ok) setMsg("Notice removed."); } }}>Remove</button>
              </>}
            </div>
            {openComments[n.id] && (
              <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                {openComments[n.id].length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No comments yet.</div> :
                  openComments[n.id].map(c => (
                    <div key={c.id} style={{ fontSize: 12.5, marginBottom: 5 }}><b>{c.app_users?.full_name || "Staff"}:</b> {c.body} <span className="muted" style={{ fontSize: 10.5 }}>{String(c.created_at).slice(0, 16).replace("T", " ")}</span></div>
                  ))}
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input style={{ flex: 1 }} placeholder="Write a comment…" value={commentText[n.id] || ""} onChange={e => setCommentText(c => ({ ...c, [n.id]: e.target.value }))} onKeyDown={e => e.key === "Enter" && sendComment(n)} />
                  <button className="primary" style={{ fontSize: 12 }} onClick={() => sendComment(n)}>Send</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* ---- Seen/Ack modal ---- */}
        {statsFor && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }} onClick={() => setStatsFor(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 460, width: "100%", padding: 20, maxHeight: "85vh", overflowY: "auto" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{statsFor.notice.title}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><b style={{ fontSize: 13 }}>👁 Seen ({statsFor.stats.reads.length})</b>
                  {statsFor.stats.reads.map((r, i) => <div key={i} style={{ fontSize: 12 }}>{r.name}</div>)}</div>
                <div><b style={{ fontSize: 13 }}>✋ Acknowledged ({statsFor.stats.acks.length})</b>
                  {statsFor.stats.acks.map((r, i) => <div key={i} style={{ fontSize: 12 }}>{r.name}</div>)}</div>
              </div>
              <div style={{ marginTop: 12, textAlign: "right" }}><button onClick={() => setStatsFor(null)}>Close</button></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}