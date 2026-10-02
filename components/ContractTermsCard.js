"use client";
// update455: CONTRACT TERMS per site — the payment side of the BOQ, kept OUT of the BOQ grid. Some clients put
// payment terms / milestones inside the BOQ Excel (the importer keeps those rows out and points here); others,
// like Brigade, only have them in the LOI. Either way they live here: contract value, GST, billing cycle, ad-hoc /
// balance / final-bill days, payment stages (% per stage), retention and its release, PBG, DLP, special notes, LOI PDF.
import { useEffect, useState } from "react";
import { getSiteTerms, saveSiteTerms, uploadLoi, inr } from "@/lib/boq";
import { billUrl } from "@/lib/bills";

const F = [
  ["client_name", "Client (employer)", "text", 2], ["loi_ref", "LOI / WO reference", "text", 2], ["loi_date", "LOI date", "date", 1], ["contract_type", "Contract type", "text", 1],
  ["work_title", "Work title", "text", 4],
  ["contract_value", "Contract value ₹ (excl. GST)", "number", 1], ["gst_pct", "GST %", "number", 1], ["completion_months", "Completion (months)", "number", 1], ["mobilisation_days", "Mobilise within (days)", "number", 1],
  ["billing_cycle", "Billing cycle", "text", 3], ["min_bill_value", "Minimum RA bill ₹", "number", 1],
  ["adhoc_pct", "Ad-hoc payment %", "number", 1], ["adhoc_days", "…within (working days)", "number", 1], ["balance_days", "Balance within (working days)", "number", 1], ["final_bill_days", "Final bill within (working days)", "number", 1],
  ["retention_pct", "Retention %", "number", 1], ["retention_release", "Retention release", "text", 3],
  ["pbg_pct", "Performance BG %", "number", 1], ["pbg_days", "PBG within (days)", "number", 1], ["dlp_months", "DLP (months)", "number", 1], ["fim_handling_pct", "FIM handling %", "number", 1],
  ["mobilisation_advance", "Mobilisation advance", "text", 4],
];

export default function ContractTermsCard({ site, siteName, canEdit, onClose }) {
  const [t, setT] = useState(null); const [edit, setEdit] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  useEffect(() => { getSiteTerms(site).then(x => { setT(x || { payment_stages: [] }); setEdit(!x && canEdit); }); }, [site, canEdit]);
  const set = (k, v) => setT(x => ({ ...x, [k]: v }));
  const stages = t?.payment_stages || [];
  const setStage = (i, k, v) => set("payment_stages", stages.map((s, j) => j === i ? { ...s, [k]: k === "pct" ? v : v } : s));
  const groups = [...new Set(stages.map(s => s.group || ""))];
  const sumOf = g => stages.filter(s => (s.group || "") === g).reduce((a, s) => a + Number(s.pct || 0), 0);

  async function save() {
    setErr(""); setBusy(true);
    const payload = { ...t, payment_stages: stages.filter(s => s.stage).map(s => ({ group: s.group || "", stage: s.stage, pct: Number(s.pct || 0) })) };
    delete payload.site_id; delete payload.updated_at; delete payload.updated_by; delete payload.updated_by_name;
    const r = await saveSiteTerms(site, payload); setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setMsg("Contract terms saved."); setEdit(false);
  }
  async function onLoi(e) {
    const f = e.target.files?.[0]; if (!f) return; setBusy(true); setErr("");
    const r = await uploadLoi(site, f); setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    set("loi_path", r.path);
    const s = await saveSiteTerms(site, { ...t, loi_path: r.path, payment_stages: stages }); if (!s.ok) setErr(s.error); else setMsg("LOI attached.");
  }

  const num = v => v == null || v === "" ? "—" : Number(v).toLocaleString("en-IN");
  return (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }}>
      <div onClick={e => e.stopPropagation()} className="panel" style={{ width: "min(1000px,100%)", margin: 0, maxHeight: "94vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>📜 Contract terms — {siteName}</h2>
          <div style={{ display: "flex", gap: 6 }}>
            {canEdit && !edit && t && <button type="button" onClick={() => setEdit(true)}>✎ Edit</button>}
            <button type="button" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>Payment terms are kept here, not in the BOQ grid. Source: the LOI / work order{t?.loi_path ? <> — <a href={billUrl(t.loi_path)} target="_blank" rel="noreferrer">📎 open LOI</a></> : ""}. {t?.updated_by_name && <span>Last saved by {t.updated_by_name}{t.updated_at ? ` · ${String(t.updated_at).slice(0, 10)}` : ""}.</span>}</div>
        {!t ? <div className="muted">Loading…</div> : (
          <>
            {!edit && !t.client_name && !t.contract_value && <div className="note amber" style={{ fontSize: 12.5 }}>No contract terms recorded for this site yet.{canEdit ? " Press Edit to fill them from the LOI." : ""}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {F.map(([k, l, type, span]) => (
                <div key={k} style={{ gridColumn: `span ${span}` }}>
                  <label className="muted" style={{ fontSize: 11.5 }}>{l}</label>
                  {edit ? <input type={type === "date" ? "date" : "text"} inputMode={type === "number" ? "decimal" : undefined} style={{ width: "100%" }} value={t[k] ?? ""} onChange={e => set(k, e.target.value)} />
                    : <div style={{ fontWeight: k === "contract_value" ? 800 : 600, fontSize: 13 }}>{type === "number" ? (k === "contract_value" || k === "min_bill_value" ? (t[k] != null && t[k] !== "" ? inr(t[k]) : "—") : num(t[k])) : (t[k] || "—")}</div>}
                </div>))}
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b>Payment stages (% of item rate, pro-rata)</b>
                {edit && <button type="button" style={{ fontSize: 11.5 }} onClick={() => set("payment_stages", [...stages, { group: groups[groups.length - 1] || "", stage: "", pct: "" }])}>＋ Add stage</button>}
              </div>
              {groups.map(g => (
                <div key={g} style={{ margin: "8px 0" }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{g || "General"} <span style={{ fontWeight: 400, color: sumOf(g) === 100 ? "#065f46" : "#991b1b" }}>· total {sumOf(g)}%{sumOf(g) !== 100 ? " (should be 100%)" : ""}</span></div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}><tbody>
                    {stages.map((s, i) => (s.group || "") === g && (
                      <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                        {edit ? <>
                          <td style={{ padding: 4, width: "28%" }}><input style={{ width: "100%" }} value={s.group || ""} onChange={e => setStage(i, "group", e.target.value)} placeholder="Group (e.g. Supply & Installation)" /></td>
                          <td style={{ padding: 4 }}><input style={{ width: "100%" }} value={s.stage || ""} onChange={e => setStage(i, "stage", e.target.value)} placeholder="Stage" /></td>
                          <td style={{ padding: 4, width: 80 }}><input style={{ width: "100%" }} inputMode="decimal" value={s.pct ?? ""} onChange={e => setStage(i, "pct", e.target.value)} /></td>
                          <td style={{ padding: 4, width: 40 }}><button type="button" style={{ fontSize: 11 }} onClick={() => set("payment_stages", stages.filter((_, j) => j !== i))}>✕</button></td>
                        </> : <>
                          <td style={{ padding: "5px 4px" }}>{s.stage}</td><td style={{ padding: "5px 4px", textAlign: "right", fontWeight: 700, width: 70 }}>{s.pct}%</td>
                        </>}
                      </tr>))}
                  </tbody></table>
                </div>))}
              {!stages.length && <div className="muted" style={{ fontSize: 12 }}>No stages recorded.</div>}
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="muted" style={{ fontSize: 11.5 }}>Special conditions / notes</label>
              {edit ? <textarea style={{ width: "100%", minHeight: 90 }} value={t.special_notes || ""} onChange={e => set("special_notes", e.target.value)} />
                : <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{t.special_notes || "—"}</div>}
            </div>
            {canEdit && <div style={{ marginTop: 10, fontSize: 12.5 }}><label>📎 {t.loi_path ? "Replace" : "Attach"} LOI / work order (PDF): <input type="file" accept=".pdf,image/*" onChange={onLoi} disabled={busy} /></label></div>}
            {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
            {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)", marginTop: 10 }}>{msg}</div>}
            {edit && <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button type="button" className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save contract terms"}</button><button type="button" onClick={() => { setEdit(false); getSiteTerms(site).then(x => setT(x || { payment_stages: [] })); }}>Cancel</button></div>}
          </>)}
      </div>
    </div>);
}
