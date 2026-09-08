"use client";
// update329: LETTERS & DOCUMENTS
// Four tabs: Generate · Letter Templates · Company Rules · Register.
//
// The point of the design: the WORDING lives in letter_templates, the RULES live
// in company_clauses, and a template refers to a rule as {{clause.notice_period}}.
// Change the notice period once and every letter generated from then on carries it.
// Letters already issued are FROZEN and never re-render (Director, 8 Sep).
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession, canAnySite } from "@/lib/auth";
import {
  getCompany, saveCompany, getClauses, saveClause, getClauseHistory,
  getTemplates, saveTemplate, getTemplateHistory,
  getStaffPeople, getLabourPeople, getRoleLabels,
  buildTokens, renderTemplate, clauseKeysUsed, tokenLabel, fixHint,
  issueLetter, getLetters, cancelLetter, todayIso, fmtDate, FAMILIES,
} from "@/lib/letters";

const TABS = [
  ["generate", "📄 Generate"],
  ["templates", "✎ Letter Templates"],
  ["rules", "📋 Company Rules"],
  ["register", "🗂 Register"],
];

// ---- module scope: never define a component inside a component (update204) ----

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, marginBottom: 3 }}>{label}</label>
      {children}
      {hint && <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function MissingBox({ missing, values, onChange }) {
  if (!missing.length) return null;
  return (
    <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, color: "#9a3412", marginBottom: 2 }}>
        {missing.length} detail{missing.length > 1 ? "s" : ""} missing — the letter cannot be issued until these are filled
      </div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
        Type a value here to use it for this letter only, or fix it at the source so every future letter is right.
      </div>
      {missing.map(k => (
        <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, minWidth: 140 }}>{tokenLabel(k)}</span>
          <input style={{ flex: 1, minWidth: 180, fontSize: 12 }} value={values[k] || ""}
                 placeholder="type a value for this letter"
                 onChange={e => onChange(k, e.target.value)} />
          <span className="muted" style={{ fontSize: 10.5, flexBasis: "100%" }}>{fixHint(k)}</span>
        </div>
      ))}
    </div>
  );
}

function Paper({ heading, text, company }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "22px 26px", maxWidth: 780 }}>
      <div style={{ borderBottom: "3px solid #FF7A1A", paddingBottom: 8, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#1f2a4b" }}>{company?.name || "PIPESKOOL PROJECTS PVT LTD."}</div>
        <div className="muted" style={{ fontSize: 10.5, fontStyle: "italic" }}>{company?.address}</div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 15, color: "#1f2a4b", letterSpacing: "0.02em", marginBottom: 14 }}>{heading}</div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.75 }}>{text}</div>
    </div>
  );
}

function HistoryList({ rows, onClose, title }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 700, padding: 22, maxHeight: "88vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 10 }}>{title}</h2>
        {!rows.length ? <div className="muted">No changes recorded yet — this is the version created when the module was installed.</div> : rows.map(h => (
          <div key={h.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>
              v{h.version} · {new Date(h.changed_at).toLocaleString("en-IN")} · {h.changed_by_name || "—"}
            </div>
            {h.change_note && <div className="muted" style={{ fontSize: 11, fontStyle: "italic" }}>{h.change_note}</div>}
            <div style={{ whiteSpace: "pre-wrap", fontSize: 11.5, marginTop: 4, color: "#374151" }}>{h.body}</div>
          </div>
        ))}
        <div style={{ marginTop: 12, textAlign: "right" }}><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

export default function LettersPage() {
  const sess = typeof window !== "undefined" ? getSession() : null;
  const isDirector = sess?.role === "director";
  const canManage = isDirector || canAnySite(sess, "letters", "manage");
  const canIssue = canManage || canAnySite(sess, "letters", "create");

  const [tab, setTab] = useState("generate");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [company, setCompany] = useState(null);
  const [clauses, setClauses] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [roleLabels, setRoleLabels] = useState({});
  const [staff, setStaff] = useState([]);
  const [labour, setLabour] = useState([]);

  // ---- generate state ----
  const [family, setFamily] = useState("staff");
  const [personId, setPersonId] = useState("");
  const [code, setCode] = useState("offer");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [overrides, setOverrides] = useState({});
  const [issuing, setIssuing] = useState(false);

  // ---- other tabs ----
  const [editTpl, setEditTpl] = useState(null);
  const [editClause, setEditClause] = useState(null);
  const [hist, setHist] = useState(null);
  const [reg, setReg] = useState(null);
  const [companyEdit, setCompanyEdit] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr("");
      try {
        const [c, cl, tp, rl, st, lb] = await Promise.all([
          getCompany(), getClauses(), getTemplates(), getRoleLabels(), getStaffPeople(), getLabourPeople(),
        ]);
        setCompany(c); setClauses(cl); setTemplates(tp); setRoleLabels(rl); setStaff(st); setLabour(lb);
      } catch (e) { setErr(e.message); }      // loud: never a silent empty screen (update272 lesson)
      finally { setLoading(false); }
    })();
  }, []);

  const people = family === "staff" ? staff : labour;
  const person = people.find(p => String(p.id) === String(personId)) || null;
  const famTemplates = templates.filter(t => t.family === family);
  const template = famTemplates.find(t => t.code === code) || famTemplates[0] || null;

  const tokens = useMemo(
    () => buildTokens({ person, family, company, clauses, roleLabels, issueDate, letterNo: "" }),
    [person, family, company, clauses, roleLabels, issueDate]);

  const rendered = useMemo(() => {
    if (!template) return { text: "", missing: [] };
    // letter.no is assigned by the database at issue — show a placeholder, don't ask for it
    const t = { ...tokens, "letter.no": tokens["letter.no"] || "(assigned on issue)" };
    return renderTemplate(template.body, t, overrides);
  }, [template, tokens, overrides]);

  const realMissing = rendered.missing.filter(k => k !== "letter.no");

  async function reloadRegister() {
    try { setReg(await getLetters()); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { if (tab === "register" && reg === null) reloadRegister(); }, [tab]);   // eslint-disable-line

  async function doIssue() {
    setErr(""); setMsg("");
    if (!person) { setErr("Pick the employee this letter is for."); return; }
    if (!template) { setErr("Pick a letter type."); return; }
    if (realMissing.length) { setErr(`Fill the ${realMissing.length} missing detail(s) above before issuing.`); return; }
    setIssuing(true);
    try {
      const used = clauses.filter(c => clauseKeysUsed(template.body).includes(c.ckey));
      // The number is assigned by the database, not here. Render with {{letter.no}} left
      // INTACT (renderTemplate is a single pass, so re-inserting the token is safe) and let
      // fn_issue_letter substitute the real number as it stamps the letter.
      const issueBody = renderTemplate(template.body, { ...tokens, "letter.no": "{{letter.no}}" }, overrides).text;
      const r = await issueLetter({
        code: template.code, family, person, issueDate,
        body: issueBody,
        tokens: { ...tokens, ...overrides }, clauses: used,
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
    setMsg("Company details saved.");
    setCompany(companyEdit); setCompanyEdit(null);
  }

  async function doCancel(l) {
    const reason = prompt(`Cancel ${l.letter_no}?\n\nThe letter is kept in the register, struck out, with the reason recorded. Enter the reason:`);
    if (!reason || !reason.trim()) return;
    const r = await cancelLetter(l.id, reason.trim());
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`${l.letter_no} cancelled.`);
    reloadRegister();
  }

  return (
    <>
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Letters &amp; Documents</h1>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Employee details come from Workers &amp; Staff Master; the terms come from Company Rules. Issued letters never change.
          </div>
        </div>

        {err && <div className="error" style={{ marginBottom: 10, whiteSpace: "pre-wrap" }}>{err}</div>}
        {msg && <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", padding: "8px 12px", borderRadius: 6, marginBottom: 10, fontSize: 12.5 }}>{msg}</div>}

        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {TABS.map(([k, l]) => (
            <button key={k} className={tab === k ? "primary" : ""} onClick={() => { setTab(k); setErr(""); setMsg(""); }}>{l}</button>
          ))}
        </div>

        {loading && <div className="muted">Loading…</div>}

        {/* ---------------------------------------------------------- GENERATE */}
        {!loading && tab === "generate" && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div className="card" style={{ flex: "0 0 320px", minWidth: 280 }}>
              <Field label="Who is this letter for?">
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {FAMILIES.map(([k, l]) => (
                    <button key={k} className={family === k ? "primary" : ""} style={{ flex: 1, fontSize: 12 }}
                            onClick={() => { setFamily(k); setPersonId(""); setOverrides({}); }}>{l}</button>
                  ))}
                </div>
                <select style={{ width: "100%" }} value={personId} onChange={e => { setPersonId(e.target.value); setOverrides({}); }}>
                  <option value="">— select {family === "staff" ? "staff member" : "worker"} —</option>
                  {people.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}{p.is_active === false ? " (inactive)" : ""}
                      {family === "labour" && p.site_name ? " · " + p.site_name : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Letter type">
                <select style={{ width: "100%" }} value={template?.code || ""} onChange={e => { setCode(e.target.value); setOverrides({}); }}>
                  {famTemplates.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                </select>
              </Field>

              <Field label="Letter date" hint="The number is assigned when you issue, from that type's own series.">
                <input type="date" style={{ width: "100%" }} value={issueDate} max={todayIso()} onChange={e => setIssueDate(e.target.value)} />
              </Field>

              {template?.issued_by === "employee" && (
                <div className="muted" style={{ fontSize: 11, background: "#f3f4f6", padding: 8, borderRadius: 6, marginBottom: 10 }}>
                  This document is signed <b>by the employee</b>, not issued by the company. Print it for them to sign.
                </div>
              )}

              <button className="primary" style={{ width: "100%" }} disabled={!canIssue || issuing || !person || realMissing.length > 0}
                      onClick={doIssue}>
                {issuing ? "Issuing…" : "✅ Issue & Print"}
              </button>
              {!canIssue && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>You can preview letters but not issue them. A Director grants Letters → Create.</div>}
            </div>

            <div style={{ flex: 1, minWidth: 320 }}>
              <MissingBox missing={realMissing} values={overrides}
                          onChange={(k, v) => setOverrides(o => ({ ...o, [k]: v }))} />
              {!person
                ? <div className="muted">Pick an employee to see the letter.</div>
                : <Paper heading={template?.heading} text={rendered.text} company={company} />}
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- TEMPLATES */}
        {!loading && tab === "templates" && (
          <div className="panel">
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Edit the wording of any letter. Write <b>{"{{clause.notice_period}}"}</b> to pull in a company rule — that way the rule stays in one place.
              Saving creates a new version; letters already issued are never touched.
            </div>
            <table>
              <thead><tr><th>Letter</th><th>For</th><th>Series</th><th>Version</th><th>Last edited</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td style={{ textTransform: "capitalize" }}>{t.family}</td>
                    <td>{t.series_prefix}</td>
                    <td>v{t.version}</td>
                    <td className="muted" style={{ fontSize: 11.5 }}>{t.updated_by_name ? `${t.updated_by_name} · ${new Date(t.updated_at).toLocaleDateString("en-IN")}` : "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button style={{ fontSize: 11.5 }} disabled={!canManage}
                              onClick={() => setEditTpl({ code: t.code, family: t.family, name: t.name, heading: t.heading, body: t.body, note: "" })}>✎ Edit</button>{" "}
                      <button style={{ fontSize: 11.5 }} onClick={async () => {
                        try { setHist({ title: `${t.name} — version history`, rows: await getTemplateHistory(t.code, t.family) }); }
                        catch (e) { setErr(e.message); }
                      }}>🕘 History</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!canManage && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Only a Director — or a user granted Letters → Manage — can edit templates.</div>}
          </div>
        )}

        {/* ------------------------------------------------------- COMPANY RULES */}
        {!loading && tab === "rules" && (
          <>
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
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
                      <td><code style={{ fontSize: 10.5 }}>{`{{clause.${c.ckey}}}`}</code></td>
                      <td className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{c.updated_by_name ? `${c.updated_by_name} · ${new Date(c.updated_at).toLocaleDateString("en-IN")}` : "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button style={{ fontSize: 11.5 }} disabled={!canManage}
                                onClick={() => setEditClause({ ...c, note: "" })}>✎ Edit</button>{" "}
                        <button style={{ fontSize: 11.5 }} onClick={async () => {
                          try { setHist({ title: `${c.title} — version history`, rows: await getClauseHistory(c.ckey) }); }
                          catch (e) { setErr(e.message); }
                        }}>🕘 History</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
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

        {/* ---------------------------------------------------------- REGISTER */}
        {!loading && tab === "register" && (
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
                        <td style={{ fontSize: 11.5 }}>{l.heading}<span className="muted"> · {l.family}</span></td>
                        <td>{l.subject_name}</td>
                        <td>{fmtDate(l.issue_date)}</td>
                        <td className="muted" style={{ fontSize: 11.5 }}>{l.created_by_name || "—"}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {off
                            ? <span className="badge" title={l.cancel_reason} style={{ color: "var(--red)", border: "1px solid var(--red)", background: "transparent" }}>Cancelled</span>
                            : <>
                                <button style={{ fontSize: 11.5 }} onClick={() => window.open(`/letters/print?id=${l.id}`, "_blank")}>🖨 Print</button>{" "}
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

        {/* ------------------------------------------------------------ modals */}
        {editTpl && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => setEditTpl(null)}>
            <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 780, padding: 22, maxHeight: "88vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
              <h2 style={{ marginBottom: 10 }}>Edit — {editTpl.name}</h2>
              <Field label="Printed heading"><input style={{ width: "100%" }} value={editTpl.heading} onChange={e => setEditTpl(x => ({ ...x, heading: e.target.value }))} /></Field>
              <Field label="Letter wording" hint="Available: {{emp.name}} {{emp.designation}} {{emp.department}} {{emp.salary}} {{emp.salary_words}} {{emp.daily_wage}} {{emp.category}} {{emp.site}} {{emp.joining_date}} {{emp.last_working_day}} {{emp.tenure}} {{emp.exit_reason}} {{letter.no}} {{letter.date}} {{company.place}} — plus any {{clause.key}} from Company Rules.">
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

        {editClause && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => setEditClause(null)}>
            <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, padding: 22, maxHeight: "88vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
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
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => setCompanyEdit(null)}>
            <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, padding: 22, maxHeight: "88vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
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
    </>
  );
}
