"use client";
// update401: HELP CENTER — home + search, module categories, step-by-step articles, FAQs, related,
// feedback, role-based visibility, contextual (?ctx=/path) and an admin editor (Director / IT).
// Uses the app's own design system (.layout / .panel / .badge / button.primary).
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession, canSeeModuleAnySite } from "@/lib/auth";
import { getArticles, forRoute, search, saveArticle, deleteArticle, sendFeedback, feedbackStats, canEditHelp, roleMatch, MODULE_META } from "@/lib/help";

const qs = () => { try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); } };
const setQs = obj => { try { const u = new URL(window.location.href); Object.entries(obj).forEach(([k, v]) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k)); window.history.replaceState(null, "", u.toString()); } catch {} };
const Chip = ({ children, on, onClick }) => <button type="button" onClick={onClick} className={on ? "primary" : ""} style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 999 }}>{children}</button>;

export default function HelpPage() {
  const [session, setSession] = useState(null);
  const [all, setAll] = useState(null);
  const [q, setQ] = useState(""); const [mod, setMod] = useState(""); const [slug, setSlug] = useState(""); const [ctx, setCtx] = useState("");
  const [admin, setAdmin] = useState(false); const [form, setForm] = useState(null); const [stats, setStats] = useState({});
  const [fb, setFb] = useState({}); const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const editor = canEditHelp(session);

  const load = () => getArticles().then(setAll).catch(e => { setErr(e.message); setAll([]); });
  useEffect(() => { const s = getSession(); if (!s) { window.location.replace("/login"); return; } setSession(s); const p = qs(); setQ(p.get("q") || ""); setMod(p.get("module") || ""); setSlug(p.get("a") || ""); setCtx(p.get("ctx") || ""); setAdmin(p.get("admin") === "1"); load(); }, []);
  useEffect(() => { if (admin && editor) feedbackStats().then(setStats); }, [admin, editor]);

  // role-based: article roles must match, and the user must be able to see the module (Directors see all)
  const visible = useMemo(() => (all || []).filter(a => (a.status === "published" || editor) && roleMatch(a, session) && (session?.role === "director" || !MODULE_META[a.module] || a.module === "general" || a.module === "admin" ? true : canSeeModuleAnySite(session, a.module) || a.module === "attendance")), [all, session, editor]);
  const modules = useMemo(() => { const m = {}; visible.forEach(a => { (m[a.module] = m[a.module] || []).push(a); }); return Object.entries(m).sort((x, y) => (MODULE_META[x[0]]?.[1] || x[0]).localeCompare(MODULE_META[y[0]]?.[1] || y[0])); }, [visible]);
  const contextual = useMemo(() => ctx ? forRoute(visible, ctx) : [], [visible, ctx]);
  const results = useMemo(() => search(mod ? visible.filter(a => a.module === mod) : visible, q), [visible, q, mod]);
  const article = useMemo(() => visible.find(a => a.slug === slug) || (all || []).find(a => a.slug === slug && editor), [visible, all, slug, editor]);
  const open = s => { setSlug(s); setQs({ a: s }); window.scrollTo({ top: 0 }); };
  const home = () => { setSlug(""); setMod(""); setQ(""); setQs({ a: "", module: "", q: "" }); };

  async function vote(helpful) { if (!article) return; const c = fb[article.id]?.comment || ""; const r = await sendFeedback(article.id, helpful, c); if (!r.ok) { setErr(r.error); return; } setFb(f => ({ ...f, [article.id]: { ...f[article.id], done: true, helpful } })); }
  // ---- admin
  const blank = () => ({ id: null, slug: "", title: "", module: "attendance", category: MODULE_META.attendance[1], summary: "", roles: ["all"], routes: [], steps: [{ title: "", body: "" }], faqs: [], callouts: [], related: [], status: "draft", sort: 0 });
  async function save(status) { setBusy(true); setErr(""); const p = { ...form, status: status || form.status }; const r = await saveArticle(form.id, p); setBusy(false); if (!r.ok) { setErr(r.error); return; } setMsg(status === "published" ? "Article published." : "Draft saved."); setForm(null); load(); }
  async function del(a) { if (!window.confirm(`Delete "${a.title}"?`)) return; const r = await deleteArticle(a.id); if (!r.ok) { setErr(r.error); return; } setMsg("Deleted."); load(); }
  const inp = { width: "100%", boxSizing: "border-box" };
  const listEdit = (key, fields, label) => (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 13 }}>{label}</b><button type="button" style={{ fontSize: 12 }} onClick={() => setForm(f => ({ ...f, [key]: [...f[key], Object.fromEntries(fields.map(x => [x[0], x[0] === "type" ? "tip" : ""]))] }))}>＋ Add</button></div>
      {form[key].map((row, i) => (
        <div key={i} style={{ background: "var(--gray-bg)", borderRadius: 8, padding: 8, marginTop: 6 }}>
          {fields.map(([k, ph, kind]) => kind === "select" ? <select key={k} style={{ ...inp, marginBottom: 4 }} value={row[k]} onChange={e => setForm(f => { const l = [...f[key]]; l[i] = { ...l[i], [k]: e.target.value }; return { ...f, [key]: l }; })}><option value="tip">tip</option><option value="warning">warning</option></select>
            : kind === "area" ? <textarea key={k} style={{ ...inp, minHeight: 60, marginBottom: 4 }} placeholder={ph} value={row[k]} onChange={e => setForm(f => { const l = [...f[key]]; l[i] = { ...l[i], [k]: e.target.value }; return { ...f, [key]: l }; })} />
            : <input key={k} style={{ ...inp, marginBottom: 4 }} placeholder={ph} value={row[k]} onChange={e => setForm(f => { const l = [...f[key]]; l[i] = { ...l[i], [k]: e.target.value }; return { ...f, [key]: l }; })} />)}
          <div style={{ display: "flex", gap: 6 }}><button type="button" style={{ fontSize: 11.5 }} disabled={i === 0} onClick={() => setForm(f => { const l = [...f[key]]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; return { ...f, [key]: l }; })}>↑</button><button type="button" style={{ fontSize: 11.5 }} onClick={() => setForm(f => ({ ...f, [key]: f[key].filter((_, j) => j !== i) }))}>Remove</button></div>
        </div>))}
    </div>
  );

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div><h1 style={{ marginBottom: 2, cursor: "pointer" }} onClick={home}>❓ Help Center</h1><div className="muted" style={{ fontSize: 12.5 }}>How Pipeskool works — step by step, for your role</div></div>
          {editor && <button className={admin ? "primary" : ""} onClick={() => { setAdmin(a => !a); setQs({ admin: admin ? "" : "1" }); setForm(null); }}>✎ {admin ? "Exit admin" : "Manage articles"}</button>}
        </div>
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && !form && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

        {/* ===== ADMIN ===== */}
        {admin && editor ? (
          <div className="panel">
            {form ? (
              <div>
                <h2>{form.id ? "Edit article" : "New article"}</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
                  <div style={{ gridColumn: "1/-1" }}><label className="muted">Title</label><input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value, slug: f.id ? f.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") }))} /></div>
                  <div><label className="muted">Slug</label><input style={inp} value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} /></div>
                  <div><label className="muted">Module</label><select style={inp} value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value, category: MODULE_META[e.target.value]?.[1] || f.category }))}>{Object.keys(MODULE_META).map(m => <option key={m} value={m}>{MODULE_META[m][1]}</option>)}</select></div>
                  <div><label className="muted">Category label</label><input style={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /></div>
                  <div><label className="muted">Sort</label><input style={inp} value={form.sort} onChange={e => setForm(f => ({ ...f, sort: Number(e.target.value) || 0 }))} /></div>
                  <div style={{ gridColumn: "1/-1" }}><label className="muted">Summary</label><input style={inp} value={form.summary || ""} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} /></div>
                  <div><label className="muted">Roles (comma: all, director, it_executive, accountant, supervisor, staff)</label><input style={inp} value={form.roles.join(", ")} onChange={e => setForm(f => ({ ...f, roles: e.target.value.split(",").map(x => x.trim()).filter(Boolean) }))} /></div>
                  <div><label className="muted">Contextual routes (comma, e.g. /wages, /m/muster)</label><input style={inp} value={form.routes.join(", ")} onChange={e => setForm(f => ({ ...f, routes: e.target.value.split(",").map(x => x.trim()).filter(Boolean) }))} /></div>
                  <div style={{ gridColumn: "1/-1" }}><label className="muted">Related article slugs (comma)</label><input style={inp} value={form.related.join(", ")} onChange={e => setForm(f => ({ ...f, related: e.target.value.split(",").map(x => x.trim()).filter(Boolean) }))} /></div>
                </div>
                {listEdit("steps", [["title", "Step title"], ["body", "What to do, where to click, what happens", "area"]], "Steps")}
                {listEdit("faqs", [["q", "Question"], ["a", "Answer", "area"]], "FAQs")}
                {listEdit("callouts", [["type", "", "select"], ["title", "Callout title"], ["body", "Text", "area"]], "Callouts (tip / warning)")}
                {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button onClick={() => setForm(null)} disabled={busy}>Cancel</button>
                  <button onClick={() => save("draft")} disabled={busy}>Save draft</button>
                  <button className="primary" onClick={() => save("published")} disabled={busy}>{busy ? "Saving…" : "Publish"}</button>
                  {form.id && form.status === "published" && <button onClick={() => save("draft")} disabled={busy}>Unpublish</button>}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><h2 style={{ margin: 0 }}>Articles</h2><button className="primary" onClick={() => { setErr(""); setForm(blank()); }}>＋ New article</button></div>
                <div className="dt-scroll"><table className="dt-compact" style={{ width: "100%" }}>
                  <thead><tr><th>Title</th><th>Module</th><th>Roles</th><th>Routes</th><th>Status</th><th className="num">👍</th><th className="num">👎</th><th>Updated</th><th></th></tr></thead>
                  <tbody>{(all || []).map(a => (<tr key={a.id}>
                    <td style={{ fontWeight: 700 }}>{a.title}<div className="muted" style={{ fontSize: 10.5 }}>{a.slug}</div></td><td>{MODULE_META[a.module]?.[1] || a.module}</td><td style={{ fontSize: 12 }}>{(a.roles || []).join(", ")}</td><td style={{ fontSize: 11.5 }}>{(a.routes || []).join(", ")}</td>
                    <td>{a.status === "published" ? <span className="badge p">Published</span> : <span className="badge gray">Draft</span>}</td>
                    <td className="num">{stats[a.id]?.yes ?? 0}</td><td className="num" title={(stats[a.id]?.comments || []).map(c => c.c).join("\n")}>{stats[a.id]?.no ?? 0}</td>
                    <td style={{ fontSize: 11.5 }}>{String(a.updated_at).slice(0, 10)}</td>
                    <td style={{ whiteSpace: "nowrap" }}><button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => { setErr(""); setForm({ ...a, steps: a.steps || [], faqs: a.faqs || [], callouts: a.callouts || [], roles: a.roles || ["all"], routes: a.routes || [], related: a.related || [] }); }}>✎ Edit</button><button style={{ fontSize: 11.5 }} onClick={() => open(a.slug)}>View</button> <button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => del(a)}>Delete</button></td>
                  </tr>))}</tbody></table></div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Hover 👎 to read comments. Drafts are visible only to Directors and IT.</div>
              </div>
            )}
          </div>
        ) : article ? (
          /* ===== ARTICLE ===== */
          <div>
            <div style={{ fontSize: 12.5, marginBottom: 8 }}><a href="#" onClick={e => { e.preventDefault(); home(); }}>Help Center</a> › <a href="#" onClick={e => { e.preventDefault(); setSlug(""); setMod(article.module); setQs({ a: "", module: article.module }); }}>{MODULE_META[article.module]?.[1] || article.category}</a> › {article.title}</div>
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div><h2 style={{ fontSize: 20, marginBottom: 4 }}>{MODULE_META[article.module]?.[0]} {article.title}</h2><div className="muted" style={{ fontSize: 13 }}>{article.summary}</div></div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(article.roles || []).map(r => <span key={r} className="badge gray">{r === "all" ? "Everyone" : r.replace("_", " ")}</span>)}{article.status !== "published" && <span className="badge warn">Draft</span>}</div>
              </div>
              {(article.callouts || []).filter(c => c.type === "warning").map((c, i) => <div key={i} className="note amber" style={{ marginTop: 12 }}><b>⚠ {c.title}</b> — {c.body}</div>)}
              <ol style={{ paddingLeft: 0, listStyle: "none", marginTop: 16 }}>
                {(article.steps || []).map((s, i) => (
                  <li key={i} style={{ display: "flex", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 15, background: "var(--copper)", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{i + 1}</div>
                    <div><div style={{ fontWeight: 700, fontSize: 14.5 }}>{s.title}</div><div style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.55 }}>{s.body}</div></div>
                  </li>))}
              </ol>
              {(article.callouts || []).filter(c => c.type === "tip").map((c, i) => <div key={i} style={{ background: "var(--green-bg)", color: "var(--green)", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginTop: 6 }}><b>💡 {c.title}</b> — {c.body}</div>)}
            </div>
            {(article.faqs || []).length > 0 && (
              <div className="panel"><h2>FAQs</h2>{article.faqs.map((f, i) => <details key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--border)" : "none" }}><summary style={{ fontWeight: 600, cursor: "pointer", fontSize: 14 }}>{f.q}</summary><div style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.55 }}>{f.a}</div></details>)}</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="panel"><h2>Was this helpful?</h2>
                {fb[article.id]?.done ? <div style={{ color: "var(--green)", fontSize: 13.5 }}>✓ Thanks — {fb[article.id].helpful ? "glad it helped." : "we'll improve this article."}</div> : (<>
                  <div style={{ display: "flex", gap: 8 }}><button className="primary" onClick={() => vote(true)}>👍 Yes</button><button onClick={() => vote(false)}>👎 No</button></div>
                  <input style={{ ...inp, marginTop: 8 }} placeholder="Optional: what was missing or unclear?" value={fb[article.id]?.comment || ""} onChange={e => setFb(f => ({ ...f, [article.id]: { ...f[article.id], comment: e.target.value } }))} />
                </>)}
              </div>
              <div className="panel"><h2>Related articles</h2>
                {(article.related || []).map(s => visible.find(a => a.slug === s)).filter(Boolean).map(a => <div key={a.slug} style={{ padding: "6px 0" }}><a href="#" onClick={e => { e.preventDefault(); open(a.slug); }} style={{ fontWeight: 600 }}>{a.title}</a><div className="muted" style={{ fontSize: 12 }}>{a.summary}</div></div>)}
                {!(article.related || []).length && <div className="muted" style={{ fontSize: 13 }}>Browse {MODULE_META[article.module]?.[1]} for more.</div>}
              </div>
            </div>
          </div>
        ) : (
          /* ===== HOME / SEARCH / CATEGORY ===== */
          <div>
            <div className="panel" style={{ background: "var(--navy, #0F1419)", color: "#fff", border: "none" }}>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>What do you need help with?</div>
              <input autoFocus placeholder="Search — e.g. punch out, PO approval, petty cash return, salary slip" value={q} onChange={e => { setQ(e.target.value); setQs({ q: e.target.value }); }} style={{ width: "100%", boxSizing: "border-box", fontSize: 15, padding: "12px 14px", borderRadius: 10, border: "none" }} />
              <div className="muted" style={{ fontSize: 12, marginTop: 8, color: "#cbd5e1" }}>Showing help for your role: <b style={{ color: "#fff" }}>{(session?.role || "").replace("_", " ") || "—"}</b> · {visible.length} articles</div>
            </div>
            {contextual.length > 0 && !q && !mod && (
              <div className="panel" style={{ borderColor: "var(--copper)" }}><h2>For the page you came from ({ctx})</h2>
                {contextual.map(a => <div key={a.slug} style={{ padding: "6px 0" }}><a href="#" onClick={e => { e.preventDefault(); open(a.slug); }} style={{ fontWeight: 600 }}>{a.title}</a><div className="muted" style={{ fontSize: 12.5 }}>{a.summary}</div></div>)}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <Chip on={!mod} onClick={() => { setMod(""); setQs({ module: "" }); }}>All modules</Chip>
              {modules.map(([m]) => <Chip key={m} on={mod === m} onClick={() => { setMod(m); setQs({ module: m }); }}>{MODULE_META[m]?.[0]} {MODULE_META[m]?.[1] || m}</Chip>)}
            </div>
            {all === null ? <div className="muted">Loading…</div> : (q || mod) ? (
              <div className="panel"><h2>{q ? `${results.length} result(s) for “${q}”` : MODULE_META[mod]?.[1]}</h2>
                {results.length === 0 ? <div className="muted">Nothing matched. Try a different word, or ask in Support Tickets.</div> : results.map(a => (
                  <div key={a.slug} style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}><a href="#" onClick={e => { e.preventDefault(); open(a.slug); }} style={{ fontWeight: 700, fontSize: 14.5 }}>{MODULE_META[a.module]?.[0]} {a.title}</a><div className="muted" style={{ fontSize: 12.5 }}>{a.summary}</div><div style={{ fontSize: 11.5, marginTop: 3 }}><span className="badge gray">{MODULE_META[a.module]?.[1]}</span> {a.status !== "published" && <span className="badge warn">Draft</span>}</div></div>))}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
                {modules.map(([m, list]) => (
                  <div key={m} className="panel" style={{ marginBottom: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><h2 style={{ margin: 0 }}>{MODULE_META[m]?.[0]} {MODULE_META[m]?.[1] || m}</h2><span className="badge gray">{list.length}</span></div>
                    {list.slice(0, 5).map(a => <div key={a.slug} style={{ padding: "5px 0" }}><a href="#" onClick={e => { e.preventDefault(); open(a.slug); }} style={{ fontSize: 13.5 }}>{a.title}</a></div>)}
                    {list.length > 5 && <a href="#" onClick={e => { e.preventDefault(); setMod(m); setQs({ module: m }); }} style={{ fontSize: 12.5 }}>All {list.length} →</a>}
                  </div>))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
