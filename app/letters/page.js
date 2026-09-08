"use client";
// update330: LETTERS & DOCUMENTS — card grid.
//
// The grid is DATA-DRIVEN. One card per document type, read from letter_templates
// (icon / accent / description are columns). Adding a row — by SQL or from the
// "Add document type" tile — adds a card. Nothing on this page enumerates the
// types, so new ones never mean a redesign.
//
// Flow: card -> that letter's own screen (employee picker + editable document)
//       -> Issue & Print. Company Rules and the Register are separate top options.
//
// Unchanged from 329: an issued letter is FROZEN. Editing the text here changes
// THIS letter only; the template and the company rules are untouched, and the
// letter records that it was hand-edited.
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession, canAnySite } from "@/lib/auth";
import {
  getCompany, saveCompany, getClauses, saveClause, getClauseHistory,
  getTemplates, saveTemplate, getTemplateHistory, addTemplate,
  getStaffPeople, getLabourPeople, getRoleLabels,
  buildTokens, renderTemplate, clauseKeysUsed, tokenLabel, fixHint, splitTokens,
  issueLetter, getLetters, cancelLetter, todayIso, fmtDate, accentOf,
} from "@/lib/letters";

const NAVY = "#1f2a4b";
const ORANGE = "#FF7A1A";

// ---- module scope: never define a component inside a component (update204) ----

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, marginBottom: 4, color: NAVY }}>{label}</label>
      {children}
      {hint && <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function TopOption({ icon, title, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="lt-top">
      <span className="lt-top-ic">{icon}</span>
      <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
        <b style={{ display: "block", fontSize: 13.5, color: NAVY }}>{title}</b>
        <span className="muted" style={{ fontSize: 11.5 }}>{sub}</span>
      </span>
      <span style={{ color: "#9ca3af", fontSize: 16 }}>›</span>
    </button>
  );
}

function DocCard({ tpl, onCreate }) {
  const a = accentOf(tpl.accent);
  return (
    <div className="lt-card">
      <div className="lt-card-ic" style={{ background: a.bg, color: a.fg }}>{tpl.icon || "\uD83D\uDCC4"}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 4 }}>{tpl.label}</div>
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.55, flex: 1 }}>{tpl.description || ""}</div>
      <button className="primary lt-card-btn" onClick={() => onCreate(tpl.code)}>Create →</button>
    </div>
  );
}

function AddTypeCard({ onClick, canManage }) {
  return (
    <div className="lt-card lt-card-add">
      <div style={{ fontSize: 26, color: "#9ca3af", marginBottom: 6 }}>＋</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 4 }}>More document types</div>
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.55, flex: 1 }}>
        Add a new document type with its own wording, number series and fields — it appears here as a card.
      </div>
      <button onClick={onClick} disabled={!canManage} style={{ marginTop: 10, width: "100%" }}>Add document type</button>
    </div>
  );
}

function InputBox({ keys, values, onChange, title, note, tone }) {
  if (!keys.length) return null;
  const warn = tone === "warn";
  return (
    <div style={{
      background: warn ? "#fff7ed" : "#f7f9fc", border: "1px solid " + (warn ? "#fdba74" : "#dbe3ec"),
      borderRadius: 10, padding: 14, marginBottom: 14,
    }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, color: warn ? "#9a3412" : NAVY, marginBottom: 2 }}>{title}</div>
      {note && <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>{note}</div>}
      {keys.map(k => {
        const hint = fixHint(k);
        const multi = /details|reason|terms/.test(k);
        return (
          <div key={k} style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, marginBottom: 3 }}>{tokenLabel(k)}</label>
            {multi
              ? <textarea style={{ width: "100%", minHeight: 64, fontFamily: "inherit", fontSize: 12.5 }}
                          value={values[k] || ""} onChange={e => onChange(k, e.target.value)} />
              : <input style={{ width: "100%", fontSize: 12.5 }} value={values[k] || ""}
                       placeholder={warn ? "type a value for this letter" : ""}
                       onChange={e => onChange(k, e.target.value)} />}
            {hint && <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{hint}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Paper({ heading, text, company }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "24px 28px" }}>
      <div style={{ borderBottom: "3px solid " + ORANGE, paddingBottom: 8, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: NAVY }}>{company?.name || "PIPESKOOL PROJECTS PVT LTD."}</div>
        <div className="muted" style={{ fontSize: 10.5, fontStyle: "italic" }}>{company?.address}</div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 15, color: NAVY, letterSpacing: "0.02em", marginBottom: 16 }}>{heading}</div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.8 }}>{text}</div>
    </div>
  );
}

function HistoryList({ rows, onClose, title }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 700, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
        <h2 style={{ marginBottom: 10 }}>{title}</h2>
        {!rows.length ? <div className="muted">No changes recorded yet — this is the version created when the module was installed.</div> : rows.map(h => (
          <div key={h.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>v{h.version} · {new Date(h.changed_at).toLocaleString("en-IN")} · {h.changed_by_name || "—"}</div>
            {h.change_note && <div className="muted" style={{ fontSize: 11, fontStyle: "italic" }}>{h.change_note}</div>}
            <div style={{ whiteSpace: "pre-wrap", fontSize: 11.5, marginTop: 4, color: "#374151" }}>{h.body}</div>
          </div>
        ))}
        <div style={{ marginTop: 12, textAlign: "right" }}><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

const STYLES = `
.lt-tops { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 22px; }
.lt-top { display: flex; align-items: center; gap: 12px; background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 14px 16px; cursor: pointer; width: 100%; text-align: left; }
.lt-top:hover { border-color: ${ORANGE}; }
.lt-top-ic { width: 40px; height: 40px; border-radius: 10px; background: #fff1e6; color: #c2410c;
             display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.lt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); gap: 14px; }
.lt-card { display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--border);
           border-radius: 12px; padding: 16px 18px 14px; min-height: 190px; }
.lt-card:hover { border-color: ${ORANGE}; box-shadow: 0 2px 10px rgba(31,42,75,0.07); }
.lt-card-add { border-style: dashed; align-items: center; text-align: center; }
.lt-card-ic { width: 44px; height: 44px; border-radius: 11px; display: flex; align-items: center;
              justify-content: center; font-size: 20px; margin-bottom: 12px; }
.lt-card-btn { width: 100%; margin-top: 12px; }
.lt-two { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
.lt-side { flex: 0 0 300px; min-width: 260px; }
.lt-body { flex: 1; min-width: 300px; }
@media (max-width: 760px) {
  .lt-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  .lt-card { min-height: 0; padding: 13px 14px 12px; }
  .lt-card-ic { width: 36px; height: 36px; font-size: 17px; margin-bottom: 9px; }
  .lt-side, .lt-body { flex: 1 1 100%; min-width: 0; }
}
@media (max-width: 460px) { .lt-grid { grid-template-columns: 1fr; } }
`;

export default function LettersPage() {
  const sess = typeof window !== "undefined" ? getSession() : null;
  const isDirector = sess?.role === "director";
  const canManage = isDirector || canAnySite(sess, "letters", "manage");
  const canIssue = canManage || canAnySite(sess, "letters", "create");

  // view: "home" | "doc" | "rules" | "register"
  const [view, setView] = useState("home");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [company, setCompany] = useState(null);
  const [clauses, setClauses] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [roleLabels, setRoleLabels] = useState({});
  const [staff, setStaff] = useState([]);
  const [labour, setLabour] = useState([]);

  // ---- the open document ----
  const [code, setCode] = useState("");
  const [family, setFamily] = useState("staff");
  const [personId, setPersonId] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [overrides, setOverrides] = useState({});
  const [draft, setDraft] = useState(null);      // non-null = hand-edited text for THIS letter
  const [editing, setEditing] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const [editTpl, setEditTpl] = useState(null);
  const [editClause, setEditClause] = useState(null);
  const [newTpl, setNewTpl] = useState(null);
  const [hist, setHist] = useState(null);
  const [reg, setReg] = useState(null);
  const [companyEdit, setCompanyEdit] = useState(null);

  async function loadAll() {
    setLoading(true); setErr("");
    try {
      const [c, cl, tp, rl, st, lb] = await Promise.all([
        getCompany(), getClauses(), getTemplates(), getRoleLabels(), getStaffPeople(), getLabourPeople(),
      ]);
      setCompany(c); setClauses(cl); setTemplates(tp); setRoleLabels(rl); setStaff(st); setLabour(lb);
    } catch (e) { setErr(e.message); }        // loud: never a silent empty screen (update272 lesson)
    finally { setLoading(false); }
  }
  useEffect(() => { loadAll(); }, []);

  // ONE card per document type. The label drops the "(Staff)" suffix — the family is
  // chosen inside the document, not by picking a different card.
  const docTypes = useMemo(() => {
    const seen = new Map();
    templates.slice().sort((a, b) => a.sort_order - b.sort_order).forEach(t => {
      if (seen.has(t.code)) return;
      seen.set(t.code, { ...t, label: t.name.replace(/\s*\((Staff|Labour)\)\s*$/i, "") });
    });
    return [...seen.values()];
  }, [templates]);

  const people = family === "staff" ? staff : labour;
  const person = people.find(p => String(p.id) === String(personId)) || null;
  const template = templates.find(t => t.code === code && t.family === family) || null;
  const familiesFor = code ? templates.filter(t => t.code === code).map(t => t.family) : [];

  const tokens = useMemo(
    () => buildTokens({ person, family, company, clauses, roleLabels, issueDate, letterNo: "" }),
    [person, family, company, clauses, roleLabels, issueDate]);

  const auto = useMemo(() => {
    if (!template) return { text: "", missing: [] };
    return renderTemplate(template.body, { ...tokens, "letter.no": "(assigned on issue)" }, overrides);
  }, [template, tokens, overrides]);

  // Which fields this letter ASKS FOR is computed WITHOUT the typed values, so a box never
  // disappears the moment it is filled — otherwise a typo could not be corrected.
  const asked = useMemo(() => {
    if (!template) return { typed: [], missing: [] };
    const base = renderTemplate(template.body, { ...tokens, "letter.no": "(assigned on issue)" }, {}).missing;
    return splitTokens(base);
  }, [template, tokens]);

  const shown = draft != null ? draft : auto.text;
  const unfilled = [...asked.typed, ...asked.missing].filter(k => !String(overrides[k] || "").trim());
  const blocked = draft != null ? /\{\{/.test(draft) : unfilled.length > 0;

  function openDoc(c) {
    const fams = templates.filter(t => t.code === c).map(t => t.family);
    setCode(c); setFamily(fams.includes("staff") ? "staff" : fams[0]);
    setPersonId(""); setOverrides({}); setDraft(null); setEditing(false);
    setErr(""); setMsg(""); setView("doc");
  }
  function backHome() { setView("home"); setErr(""); setMsg(""); setDraft(null); setEditing(false); }

  async function reloadRegister() { try { setReg(await getLetters()); } catch (e) { setErr(e.message); } }
  useEffect(() => { if (view === "register" && reg === null) reloadRegister(); }, [view]);   // eslint-disable-line

  async function doIssue() {
    setErr(""); setMsg("");
    if (!person) { setErr("Pick the employee this letter is for."); return; }
    if (!template) { setErr("Pick a letter type."); return; }
    if (blocked) { setErr("Fill every remaining field before issuing."); return; }
    setIssuing(true);
    try {
      const used = clauses.filter(c => clauseKeysUsed(template.body).includes(c.ckey));
      // The number is assigned by the database. Render with {{letter.no}} left INTACT
      // (renderTemplate is a single pass, so re-inserting the token is safe) and let
      // fn_issue_letter substitute the real number as it stamps the letter.
      const body = draft != null
        ? draft.replace("(assigned on issue)", "{{letter.no}}")
        : renderTemplate(template.body, { ...tokens, "letter.no": "{{letter.no}}" }, overrides).text;
      const r = await issueLetter({
        code: template.code, family, person, issueDate, body,
        tokens: { ...tokens, ...overrides }, clauses: used, wasEdited: draft != null,
      });
      if (!r.ok) { setErr(r.error); return; }
      setMsg(`Issued ${r.letter_no}. Opening the print view…`);
      setReg(null);
      window.open(`/letters/print?id=${r.id}`, "_blank");
    } finally { setIssuing(false); }
  }

  async function doSaveTemplate() {
    setErr(""); setMsg("");
    const r = await saveTemplate(editTpl);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`Template saved as version ${r.version}. Letters already issued are unchanged.`);
    setEditTpl(null);
    try { setTemplates(await getTemplates()); } catch (e) { setErr(e.message); }
  }
  async function doAddTemplate() {
    setErr(""); setMsg("");
    const r = await addTemplate(newTpl);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`"${newTpl.name}" added — it now has its own card and its own number series.`);
    setNewTpl(null); loadAll();
  }
  async function doSaveClause() {
    setErr(""); setMsg("");
    const r = await saveClause(editClause);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`Rule saved as version ${r.version}. It applies to letters generated from now on — issued letters keep the wording they were signed with.`);
    setEditClause(null);
    try { setClauses(await getClauses()); } catch (e) { setErr(e.message); }
  }
  async function doSaveCompany() {
    setErr(""); setMsg("");
    const r = await saveCompany(companyEdit);
    if (!r.ok) { setErr(r.error); return; }
    setMsg("Company details saved."); setCompany(companyEdit); setCompanyEdit(null);
  }
  async function doCancel(l) {
    const reason = prompt(`Cancel ${l.letter_no}?\n\nThe letter is kept in the register, struck out, with the reason recorded. Enter the reason:`);
    if (!reason || !reason.trim()) return;
    const r = await cancelLetter(l.id, reason.trim());
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`${l.letter_no} cancelled.`); reloadRegister();
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <style>{STYLES}</style>

        <div className="page-head">
          <div>
            <h1>{view === "home" ? "Letters & Documents" : view === "rules" ? "Company Rules" : view === "register" ? "Document Register" : (template?.name || "Letter")}</h1>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {view === "home" ? "Generate and manage employee letters and documents"
                : view === "rules" ? "Clauses and company details, written once and pulled into every letter"
                : view === "register" ? "Every document issued, with its frozen text"
                : "Employee details come from Workers & Staff Master; the terms come from Company Rules"}
            </div>
          </div>
          {view !== "home" && <button onClick={backHome}>← All documents</button>}
        </div>

        {err && <div className="error" style={{ marginBottom: 10, whiteSpace: "pre-wrap" }}>{err}</div>}
        {msg && <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", padding: "8px 12px", borderRadius: 6, marginBottom: 10, fontSize: 12.5 }}>{msg}</div>}
        {loading && <div className="muted">Loading…</div>}

        {/* ================================================================ HOME */}
        {!loading && view === "home" && (
          <>
            <div className="lt-tops">
              <TopOption icon="⚙️" title="Company Rules" sub="Manage clauses & templates" onClick={() => { setView("rules"); setErr(""); setMsg(""); }} />
              <TopOption icon="🗂" title="Document Register" sub="View all issued documents" onClick={() => { setView("register"); setErr(""); setMsg(""); }} />
            </div>
            <div className="lt-grid">
              {docTypes.map(t => <DocCard key={t.code} tpl={t} onCreate={openDoc} />)}
              <AddTypeCard canManage={canManage} onClick={() => setNewTpl({ code: "", family: "staff", name: "", heading: "", series_prefix: "", body: "", icon: "\uD83D\uDCC4", accent: "slate", description: "" })} />
            </div>
          </>
        )}

        {/* ============================================================ DOCUMENT */}
        {!loading && view === "doc" && (
          <div className="lt-two">
            <div className="card lt-side">
              {familiesFor.length > 1 && (
                <Field label="Who is this letter for?">
                  <div style={{ display: "flex", gap: 6 }}>
                    {familiesFor.map(f => (
                      <button key={f} className={family === f ? "primary" : ""} style={{ flex: 1, fontSize: 12, textTransform: "capitalize" }}
                              onClick={() => { setFamily(f); setPersonId(""); setOverrides({}); setDraft(null); }}>{f}</button>
                    ))}
                  </div>
                </Field>
              )}

              <Field label={family === "staff" ? "Staff member" : "Worker"}>
                <select style={{ width: "100%" }} value={personId}
                        onChange={e => { setPersonId(e.target.value); setOverrides({}); setDraft(null); }}>
                  <option value="">— select —</option>
                  {people.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}{p.is_active === false ? " (inactive)" : ""}
                      {family === "labour" && p.site_name ? " · " + p.site_name : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Letter date" hint="The number is assigned when you issue, from this type's own series.">
                <input type="date" style={{ width: "100%" }} value={issueDate} max={todayIso()}
                       onChange={e => { setIssueDate(e.target.value); setDraft(null); }} />
              </Field>

              {template?.issued_by === "employee" && (
                <div className="muted" style={{ fontSize: 11, background: "#f3f4f6", padding: 8, borderRadius: 6, marginBottom: 12 }}>
                  This document is signed <b>by the employee</b>, not issued by the company.
                </div>
              )}

              <button className="primary" style={{ width: "100%" }}
                      disabled={!canIssue || issuing || !person || blocked} onClick={doIssue}>
                {issuing ? "Issuing…" : "✅ Issue & Print"}
              </button>
              {!canIssue && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>You can preview letters but not issue them. A Director grants Letters → Create.</div>}

              <div style={{ borderTop: "1px solid var(--border)", marginTop: 14, paddingTop: 12 }}>
                <button style={{ width: "100%", fontSize: 12 }} disabled={!canManage || !template}
                        onClick={() => setEditTpl({ code: template.code, family: template.family, name: template.name, heading: template.heading, body: template.body, note: "" })}>
                  ✎ Edit this template permanently
                </button>
                <div className="muted" style={{ fontSize: 10.5, marginTop: 5 }}>
                  Changes the wording for every future letter of this type. To change wording for this one letter only, edit the document on the right.
                </div>
              </div>
            </div>

            <div className="lt-body">
              {!person ? (
                <div className="card"><div className="muted">Select an employee to build the document.</div></div>
              ) : (
                <>
                  {draft == null && (
                    <>
                      <InputBox keys={asked.typed} values={overrides} tone="plain"
                                title="Details for this letter"
                                note="These belong to this document only — they are not stored on the employee's record."
                                onChange={(k, v) => setOverrides(o => ({ ...o, [k]: v }))} />
                      <InputBox keys={asked.missing} values={overrides} tone="warn"
                                title={asked.missing.length + " detail" + (asked.missing.length > 1 ? "s" : "") + " missing from the employee's record"}
                                note="Type a value to use it for this letter only, or fix it at the source so every future letter is right."
                                onChange={(k, v) => setOverrides(o => ({ ...o, [k]: v }))} />
                    </>
                  )}

                  <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button className={editing ? "" : "primary"} style={{ fontSize: 12 }} onClick={() => setEditing(false)}>👁 Preview</button>
                    <button className={editing ? "primary" : ""} style={{ fontSize: 12 }}
                            onClick={() => { if (draft == null) setDraft(shown); setEditing(true); }}>✎ Edit this letter</button>
                    {draft != null && (
                      <>
                        <span className="badge" style={{ background: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74" }}>Hand-edited</span>
                        <button style={{ fontSize: 12 }} onClick={() => { setDraft(null); setEditing(false); }}>↺ Reset to template</button>
                      </>
                    )}
                  </div>

                  {editing
                    ? <textarea style={{ width: "100%", minHeight: 460, fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.8, padding: 16 }}
                                value={draft ?? ""} onChange={e => setDraft(e.target.value)} />
                    : <Paper heading={template?.heading} text={shown} company={company} />}

                  {draft != null && /\{\{/.test(draft) && (
                    <div className="error" style={{ marginTop: 10 }}>
                      The text still contains a {"{{token}}"} placeholder. Replace it before issuing — a letter is never issued with a placeholder printed on it.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* =============================================================== RULES */}
        {!loading && view === "rules" && (
          <>
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: 13 }}>Company rules and clauses</b>
                <button className="primary" style={{ fontSize: 12 }} disabled={!canManage}
                        onClick={() => setEditClause({ ckey: "", title: "", body: "", sort_order: 100, is_active: true, note: "" })}>＋ Add rule</button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Change a rule here and every letter generated from now on carries the new wording. Letters already issued keep what was signed.
              </div>
              <table>
                <thead><tr><th>Rule</th><th>Wording</th><th>Token</th><th>Last edited</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
                <tbody>
                  {clauses.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{c.title}</td>
                      <td style={{ fontSize: 11.5 }}>{c.body}</td>
                      <td><code style={{ fontSize: 10.5 }}>{"{{clause." + c.ckey + "}}"}</code></td>
                      <td className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{c.updated_by_name ? c.updated_by_name + " · " + new Date(c.updated_at).toLocaleDateString("en-IN") : "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button style={{ fontSize: 11.5 }} disabled={!canManage} onClick={() => setEditClause({ ...c, note: "" })}>✎ Edit</button>{" "}
                        <button style={{ fontSize: 11.5 }} onClick={async () => {
                          try { setHist({ title: c.title + " — version history", rows: await getClauseHistory(c.ckey) }); } catch (e) { setErr(e.message); }
                        }}>🕘 History</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <b style={{ fontSize: 13, display: "block", marginBottom: 8 }}>Letter templates</b>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Each document type has a staff and a labour version. Editing creates a new version; issued letters are never touched.
              </div>
              <table>
                <thead><tr><th>Template</th><th>For</th><th>Series</th><th>Version</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
                <tbody>
                  {templates.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.icon} {t.name}</td>
                      <td style={{ textTransform: "capitalize" }}>{t.family}</td>
                      <td>{t.series_prefix}</td>
                      <td>v{t.version}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button style={{ fontSize: 11.5 }} disabled={!canManage}
                                onClick={() => setEditTpl({ code: t.code, family: t.family, name: t.name, heading: t.heading, body: t.body, note: "" })}>✎ Edit</button>{" "}
                        <button style={{ fontSize: 11.5 }} onClick={async () => {
                          try { setHist({ title: t.name + " — version history", rows: await getTemplateHistory(t.code, t.family) }); } catch (e) { setErr(e.message); }
                        }}>🕘 History</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>Company details on the letterhead</b>
                <button style={{ fontSize: 12 }} disabled={!isDirector} onClick={() => setCompanyEdit({ ...company })}>✎ Edit</button>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                <div><b>{company?.name}</b></div>
                <div className="muted">{company?.address}</div>
                <div className="muted">CIN {company?.cin || "—"} · GSTIN {company?.gstin || "—"} · {company?.email}</div>
                <div className="muted">Signed by: {company?.signatory_name || "—"} ({company?.signatory_title})</div>
              </div>
            </div>
          </>
        )}

        {/* ============================================================ REGISTER */}
        {!loading && view === "register" && (
          <div className="panel">
            {reg === null ? <div className="muted">Loading…</div> : !reg.length ? (
              <div className="muted">No letters issued yet.</div>
            ) : (
              <table>
                <thead><tr><th>Letter No.</th><th>Type</th><th>Employee</th><th>Date</th><th>Issued by</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
                <tbody>
                  {reg.map(l => {
                    const off = l.status === "cancelled";
                    return (
                      <tr key={l.id} style={off ? { opacity: 0.6 } : undefined}>
                        <td style={{ fontWeight: 600, textDecoration: off ? "line-through" : "none" }}>{l.letter_no}</td>
                        <td style={{ fontSize: 11.5 }}>{l.heading}<span className="muted"> · {l.family}</span>
                          {l.was_edited && <span className="badge" title="The wording was hand-edited before issuing" style={{ marginLeft: 6, background: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74" }}>edited</span>}</td>
                        <td>{l.subject_name}</td>
                        <td>{fmtDate(l.issue_date)}</td>
                        <td className="muted" style={{ fontSize: 11.5 }}>{l.created_by_name || "—"}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {off
                            ? <span className="badge" title={l.cancel_reason} style={{ color: "var(--red)", border: "1px solid var(--red)", background: "transparent" }}>Cancelled</span>
                            : <>
                                <button style={{ fontSize: 11.5 }} onClick={() => window.open("/letters/print?id=" + l.id, "_blank")}>🖨 Print</button>{" "}
                                <button style={{ fontSize: 11.5, color: "var(--red)" }} disabled={!canManage} onClick={() => doCancel(l)}>✕ Cancel</button>
                              </>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ============================================================== MODALS */}
        {editTpl && (
          <div onClick={() => setEditTpl(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 780, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
              <h2 style={{ marginBottom: 10 }}>Edit — {editTpl.name}</h2>
              <Field label="Printed heading"><input style={{ width: "100%" }} value={editTpl.heading} onChange={e => setEditTpl(x => ({ ...x, heading: e.target.value }))} /></Field>
              <Field label="Letter wording" hint="From the employee: {{emp.name}} {{emp.designation}} {{emp.department}} {{emp.salary}} {{emp.salary_words}} {{emp.daily_wage}} {{emp.category}} {{emp.site}} {{emp.joining_date}} {{emp.last_working_day}} {{emp.tenure}} {{emp.exit_reason}} · From Company Rules: {{clause.key}} · Typed per letter: {{input.anything_you_like}} — the page will ask for it.">
                <textarea style={{ width: "100%", minHeight: 320, fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.7 }}
                          value={editTpl.body} onChange={e => setEditTpl(x => ({ ...x, body: e.target.value }))} />
              </Field>
              <Field label="What changed? (optional, kept in the history)">
                <input style={{ width: "100%" }} value={editTpl.note} onChange={e => setEditTpl(x => ({ ...x, note: e.target.value }))} />
              </Field>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setEditTpl(null)}>Cancel</button>
                <button className="primary" onClick={doSaveTemplate}>Save as new version</button>
              </div>
            </div>
          </div>
        )}

        {newTpl && (
          <div onClick={() => setNewTpl(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 720, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
              <h2 style={{ marginBottom: 4 }}>Add a document type</h2>
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>It gets its own card, its own running number series, and any {"{{input.x}}"} fields you write into the wording.</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}><Field label="Name" hint="e.g. Bonus Letter (Staff)"><input style={{ width: "100%" }} value={newTpl.name} onChange={e => setNewTpl(x => ({ ...x, name: e.target.value }))} /></Field></div>
                <div style={{ width: 120 }}><Field label="Code" hint="one word"><input style={{ width: "100%" }} value={newTpl.code} onChange={e => setNewTpl(x => ({ ...x, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} /></Field></div>
                <div style={{ width: 110 }}><Field label="For"><select style={{ width: "100%" }} value={newTpl.family} onChange={e => setNewTpl(x => ({ ...x, family: e.target.value }))}><option value="staff">Staff</option><option value="labour">Labour</option></select></Field></div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}><Field label="Printed heading"><input style={{ width: "100%" }} value={newTpl.heading} onChange={e => setNewTpl(x => ({ ...x, heading: e.target.value }))} /></Field></div>
                <div style={{ width: 110 }}><Field label="Series" hint="PSP/___/2026-27"><input style={{ width: "100%" }} maxLength={5} value={newTpl.series_prefix} onChange={e => setNewTpl(x => ({ ...x, series_prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") }))} /></Field></div>
                <div style={{ width: 80 }}><Field label="Icon"><input style={{ width: "100%" }} value={newTpl.icon} onChange={e => setNewTpl(x => ({ ...x, icon: e.target.value }))} /></Field></div>
                <div style={{ width: 120 }}><Field label="Colour"><select style={{ width: "100%" }} value={newTpl.accent} onChange={e => setNewTpl(x => ({ ...x, accent: e.target.value }))}>{["orange", "blue", "green", "purple", "red", "amber", "teal", "slate"].map(a => <option key={a} value={a}>{a}</option>)}</select></Field></div>
              </div>
              <Field label="Card description"><input style={{ width: "100%" }} value={newTpl.description} onChange={e => setNewTpl(x => ({ ...x, description: e.target.value }))} /></Field>
              <Field label="Letter wording" hint="Same tokens as any other template.">
                <textarea style={{ width: "100%", minHeight: 200, fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.7 }}
                          value={newTpl.body} onChange={e => setNewTpl(x => ({ ...x, body: e.target.value }))} />
              </Field>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setNewTpl(null)}>Cancel</button>
                <button className="primary" onClick={doAddTemplate}>Add document type</button>
              </div>
            </div>
          </div>
        )}

        {editClause && (
          <div onClick={() => setEditClause(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
              <h2 style={{ marginBottom: 10 }}>{editClause.id ? "Edit rule" : "Add rule"}</h2>
              <Field label="Rule name"><input style={{ width: "100%" }} value={editClause.title} onChange={e => setEditClause(x => ({ ...x, title: e.target.value }))} /></Field>
              <Field label="Token key" hint={editClause.id ? "The key cannot change — templates refer to it." : "Lower case, no spaces, e.g. gratuity. Templates will use {{clause.gratuity}}."}>
                <input style={{ width: "100%" }} disabled={!!editClause.id} value={editClause.ckey}
                       onChange={e => setEditClause(x => ({ ...x, ckey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} />
              </Field>
              <Field label="Wording (this exact text goes into every letter that uses it)">
                <textarea style={{ width: "100%", minHeight: 110, fontFamily: "inherit", fontSize: 12.5 }}
                          value={editClause.body} onChange={e => setEditClause(x => ({ ...x, body: e.target.value }))} />
              </Field>
              <Field label="What changed? (optional, kept in the history)">
                <input style={{ width: "100%" }} value={editClause.note} onChange={e => setEditClause(x => ({ ...x, note: e.target.value }))} />
              </Field>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setEditClause(null)}>Cancel</button>
                <button className="primary" onClick={doSaveClause}>Save rule</button>
              </div>
            </div>
          </div>
        )}

        {companyEdit && (
          <div onClick={() => setCompanyEdit(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
              <h2 style={{ marginBottom: 10 }}>Company details</h2>
              {[["name", "Company name"], ["address", "Address"], ["cin", "CIN"], ["gstin", "GSTIN"], ["email", "Email"], ["place", "Place (for declarations)"], ["signatory_name", "Signatory name"], ["signatory_title", "Signatory title"]].map(([k, l]) => (
                <Field key={k} label={l}>
                  <input style={{ width: "100%" }} value={companyEdit[k] || ""} onChange={e => setCompanyEdit(x => ({ ...x, [k]: e.target.value }))} />
                </Field>
              ))}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setCompanyEdit(null)}>Cancel</button>
                <button className="primary" onClick={doSaveCompany}>Save</button>
              </div>
            </div>
          </div>
        )}

        {hist && <HistoryList title={hist.title} rows={hist.rows} onClose={() => setHist(null)} />}
      </main>
    </div>
  );
}
