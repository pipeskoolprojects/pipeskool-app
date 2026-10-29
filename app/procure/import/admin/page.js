"use client";
// update484: Excel import — admin (Director / IT Executive / HO admin): thresholds and switches, the AI item index,
// remembered texts (aliases: view / switch off / re-point / delete) and the accuracy report.
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { searchItems } from "@/lib/stock";
import { getSettings, saveSettings, getAliases, editAlias, getAccuracy, embedStatus, buildEmbeddings, aiStatus } from "@/lib/indentImport";

const ADMIN = ["director", "it_executive", "ho_admin"];
export default function ImportAdmin() {
  const [session, setSession] = useState(null);
  useEffect(() => { setSession(getSession()); }, []);
  if (!session) return null;
  if (!ADMIN.includes(session.role)) return <div className="layout"><Sidebar /><main className="main"><div className="muted" style={{ padding: 20 }}>Director / IT only.</div></main></div>;
  return <div className="layout"><Sidebar /><main className="main">
    <div className="page-head"><h1>Excel import: settings and learning</h1><a href="/procure/import">Go to Excel import</a></div>
    <Settings /><Accuracy /><Aliases />
  </main></div>;
}

function Settings() {
  const [s, setS] = useState(null); const [msg, setMsg] = useState(""); const [emb, setEmb] = useState(null); const [ai, setAi] = useState(null); const [building, setBuilding] = useState(false);
  useEffect(() => { getSettings().then(setS); embedStatus().then(setEmb); aiStatus().then(setAi); }, []);
  if (!s) return <div className="panel">Loading settings… (if this stays empty, run pipeskool_excel_indent_import.sql)</div>;
  const f = (k, label, step = "0.01", hint = "") => <label style={{ fontSize: 12.5 }}>{label}<br /><input type="number" step={step} value={s[k] ?? ""} onChange={e => setS({ ...s, [k]: e.target.value })} style={{ width: 120 }} />{hint && <div className="muted" style={{ fontSize: 11 }}>{hint}</div>}</label>;
  const t = (k, label, hint) => <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" checked={!!s[k]} onChange={e => setS({ ...s, [k]: e.target.checked })} /><span>{label}{hint && <div className="muted" style={{ fontSize: 11 }}>{hint}</div>}</span></label>;
  async function save() { setMsg(""); const r = await saveSettings({ ...s, ai_order: String(s.ai_order_text ?? (s.ai_order || []).join(",")).split(",").map(x => x.trim()).filter(Boolean) }); setMsg(r?.ok ? "Saved." : r?.error || "Failed."); setS(await getSettings()); }
  async function build() { setBuilding(true); setMsg(""); for (let i = 0; i < 20; i++) { const r = await buildEmbeddings(300); if (!r.ok) { setMsg(r.error); break; } setEmb(r); if (!r.saved || r.embedded >= r.items) break; } setBuilding(false); }
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Settings</div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {f("auto_threshold", "Auto-accept at or above", "0.01", "0–1, default 0.92")}{f("confirm_threshold", "Ask to confirm at or above", "0.01", "below this: not found")}
        {f("rate_window_days", "Rate window (days)", "1", "older rates are not used")}{f("price_rise_pct", "Price-rise warning %", "1")}
        {f("qty_ratio_flag", "Quantity difference flag (×)", "0.5", "source PO qty vs indent qty")}{f("override_limit", "Overrides before an alias is switched off", "1")}
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {t("shadow_mode", "Learning phase (shadow mode)", "Only remembered texts are accepted automatically; every other match needs a Yes. Keep on for the first two weeks, check the accuracy report, then switch off.")}
        {t("ai_enabled", "Use AI for doubtful rows", "AI only suggests an item from the candidate list. It never creates items, chooses rates or vendors.")}
        {t("always_ask_ai", "Always ask for AI matches", "AI-matched rows always need a human Yes.")}
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
        <label style={{ fontSize: 12.5 }}>AI provider order<br /><input value={s.ai_order_text ?? (s.ai_order || []).join(",")} onChange={e => setS({ ...s, ai_order_text: e.target.value })} style={{ width: 160 }} /><div className="muted" style={{ fontSize: 11 }}>groq,gemini</div></label>
        <label style={{ fontSize: 12.5 }}>Embedding model<br /><input value={s.embedding_model || ""} onChange={e => setS({ ...s, embedding_model: e.target.value })} style={{ width: 220 }} /><div className="muted" style={{ fontSize: 11 }}>Gemini, 768 dimensions</div></label>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="primary" onClick={save}>Save settings</button>{msg && <span className="muted">{msg}</span>}
      </div>
      <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 10, fontSize: 13 }}>
        <b>AI</b>: {ai ? (ai.ai ? `available (${Object.entries(ai.providers || {}).filter(([, v]) => v).map(([k]) => k).join(", ")})` : "no AI key on the server — imports still work with remembered, exact and similar-name matching") : "…"}
        {" · "}<b>AI item index</b>: {emb ? `${emb.embedded} of ${emb.items} items` : "…"}
        <button style={{ marginLeft: 10 }} disabled={building || !ai?.embeddings} onClick={build}>{building ? "Building…" : "Build / refresh index"}</button>
        <div className="muted" style={{ fontSize: 11.5 }}>Each item is indexed once from type + name + brand + size + unit, and again only when its name changes. Imports top it up by themselves.</div>
      </div>
    </div>
  );
}

function Accuracy() {
  const [days, setDays] = useState(30); const [a, setA] = useState(null);
  useEffect(() => { getAccuracy(days).then(setA); }, [days]);
  return (
    <div className="panel" style={{ marginBottom: 14 }} data-accuracy="">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 700 }}>Accuracy report</div>
        <select value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 14, 30, 90, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}</select></div>
      {!a ? <div className="muted">Loading…</div> : a.error ? <div className="muted">{a.error}</div> : <>
        <div className="muted" style={{ fontSize: 12.5, margin: "4px 0 8px" }}>{a.imports} imports · {a.rows} rows · {a.aliases} remembered texts</div>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}><thead><tr style={{ textAlign: "left", color: "#6b7280" }}><th style={{ paddingRight: 14 }}>Layer</th><th style={{ paddingRight: 14 }}>Auto-accepted</th><th style={{ paddingRight: 14 }}>…then changed by a user</th><th style={{ paddingRight: 14 }}>Auto precision</th><th style={{ paddingRight: 14 }}>Suggested</th><th>Suggestion accepted</th></tr></thead>
          <tbody>{(a.by_layer || []).map(l => <tr key={l.layer} style={{ borderTop: "1px solid var(--border)" }}><td style={{ paddingRight: 14 }}>{l.layer}</td><td>{l.auto_rows}</td><td>{l.auto_overridden}</td>
            <td><b>{l.auto_rows ? Math.round((1 - l.auto_overridden / l.auto_rows) * 1000) / 10 + "%" : "—"}</b></td><td>{l.suggested_rows}</td><td>{l.suggested_rows ? Math.round(l.suggested_accepted / l.suggested_rows * 100) + "%" : "—"}</td></tr>)}</tbody></table>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginTop: 12 }}>
          <div><div style={{ fontWeight: 600, fontSize: 13 }}>Most-overridden items</div>{(a.overridden_items || []).length ? a.overridden_items.map(x => <div key={x.item_id} style={{ fontSize: 12.5 }}>{x.n} × {x.item_name}</div>) : <div className="muted" style={{ fontSize: 12.5 }}>None</div>}</div>
          <div><div style={{ fontWeight: 600, fontSize: 13 }}>Most frequent unmatched texts</div><div className="muted" style={{ fontSize: 11 }}>Often a sign of unclear Item Master naming</div>{(a.unmatched_texts || []).length ? a.unmatched_texts.map(x => <div key={x.norm_text} style={{ fontSize: 12.5 }}>{x.n} × {x.example}</div>) : <div className="muted" style={{ fontSize: 12.5 }}>None</div>}</div>
        </div></>}
    </div>
  );
}

function Aliases() {
  const [q, setQ] = useState(""); const [list, setList] = useState(null); const [edit, setEdit] = useState(null); const [msg, setMsg] = useState("");
  const load = () => getAliases(q).then(setList);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function act(id, action, itemId) { const r = await editAlias(id, action, itemId); setMsg(r?.ok ? "Saved." : r?.error || "Failed."); setEdit(null); load(); }
  return (
    <div className="panel" data-aliases="">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><div style={{ fontWeight: 700 }}>Remembered texts (aliases)</div>
        <input placeholder="Search text or item…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 240 }} /></div>
      <div className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>Learned only from human confirmations (Yes / Change / Add item). A text corrected {""}repeatedly is switched off by itself.{msg ? " · " + msg : ""}</div>
      {list == null ? <div className="muted">Loading…</div> : !list.length ? <div className="muted">Nothing remembered yet.</div> : (
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: "left", color: "#6b7280" }}><th style={{ padding: 6 }}>Excel text (normalised)</th><th>Item</th><th>Site</th><th>Confirmed</th><th>Overrides</th><th>Last by</th><th></th></tr></thead>
          <tbody>{list.map(a => <tr key={a.id} style={{ borderTop: "1px solid var(--border)", opacity: a.active ? 1 : 0.55 }}>
            <td style={{ padding: 6 }}>{a.normalized_text}</td><td>{a.item_name}</td><td>{a.site_name || "All sites"}</td><td>{a.times_confirmed}×</td><td>{a.overrides}</td>
            <td className="muted">{a.last_by || ""}{a.last_confirmed_at ? " · " + String(a.last_confirmed_at).slice(0, 10) : ""}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              <button style={{ fontSize: 11.5 }} onClick={() => act(a.id, a.active ? "deactivate" : "activate")}>{a.active ? "Switch off" : "Switch on"}</button>{" "}
              <button style={{ fontSize: 11.5 }} onClick={() => setEdit(a)}>Change item</button>{" "}
              <button style={{ fontSize: 11.5 }} onClick={() => window.confirm("Delete this remembered text?") && act(a.id, "delete")}>Delete</button></td></tr>)}</tbody>
        </table></div>)}
      {edit && <ItemPick title={`New item for "${edit.normalized_text}"`} close={() => setEdit(null)} choose={it => act(edit.id, "item", it.id)} />}
    </div>
  );
}
function ItemPick({ title, close, choose }) {
  const [q, setQ] = useState(""); const [res, setRes] = useState([]);
  useEffect(() => { const t = setTimeout(async () => setRes(q.trim().length > 1 ? await searchItems(q, 40).catch(() => []) : []), 250); return () => clearTimeout(t); }, [q]);
  return (
    <div role="dialog" style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.45)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "8vh 12px" }} onClick={close}>
      <div className="panel" style={{ width: "min(640px, 100%)", maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search Item Master…" style={{ width: "100%" }} />
        {res.map(it => <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--border)" }}><span style={{ fontSize: 13 }}>{it.display_name}</span><button style={{ fontSize: 12 }} onClick={() => choose(it)}>Choose</button></div>)}
        <div style={{ textAlign: "right", marginTop: 8 }}><button onClick={close}>Close</button></div>
      </div>
    </div>
  );
}
