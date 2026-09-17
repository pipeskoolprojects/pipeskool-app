"use client";
// update394: ATTENDANCE RULES — 4 tabs over the 386 rule tables. Purely for setting rules;
// the calendar and both payroll engines read the same rows, so a change here is live everywhere.
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession, canAnySite } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { iso } from "@/lib/calendar";
import { saveHoliday, deleteHoliday, getHolidaysBetween, _resetHolidayCache } from "@/lib/holidays";
import { notifyUsers } from "@/lib/notify";
import { CATS, SUN_CODES, ruleCode, setWorkerOverride, setStaffOverride, setTypeDefaults, setSundayRule, getOverrides, getSundayRules, getTypesList, getPeople, staffForSites } from "@/lib/attendanceRules";

const fmtX = n => n == null || n === "" ? "" : Number(n).toFixed(2).replace(/\.?0+$/, "") + "×";
const dmy = k => k ? String(k).split("-").reverse().join("/") : "";
const TABS = [["holiday", "Holiday Rules"], ["sunday", "Sunday Rules"], ["category", "Category Pay Rules"], ["override", "Worker Overrides"]];
const DESC = {
  holiday: "Every holiday and its pay multiplier per category. Saving notifies the site staff and shows a banner on the worker punch screen for 3 days before.",
  sunday: "Sunday policy per site. Company default is Working Day (Sunday is a normal day). Mark single Sundays differently with a one-day rule.",
  category: "Default multipliers per rule type × category. These pre-fill every new holiday rule and apply to holidays without their own override.",
  override: "One-time pay overrides for an individual worker or staff member on a date. An override beats every rule above for that person and day.",
};
const typeLabel = t => t.label || t.name || t.code;

export default function AttendanceRulesPage() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("holiday");
  const [sites, setSites] = useState([]); const [types, setTypes] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [hols, setHols] = useState(null); const [sun, setSun] = useState({});
  const [ovFrom, setOvFrom] = useState(iso(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)));
  const [ovTo, setOvTo] = useState(iso(new Date()));
  const [ovs, setOvs] = useState(null); const [people, setPeople] = useState({ workers: [], staff: [] });
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [hForm, setHForm] = useState(null); const [oForm, setOForm] = useState(null); const [sForm, setSForm] = useState(null);
  const [cats, setCats] = useState({});   // draft for Tab 3: code -> { present:{cat:n}, absent:{cat:n} }
  const canManage = !!session && (session.role === "director" || canAnySite(session, "attendance", "manage"));

  async function loadAll() {
    try {
      const [s, t, h, r, p] = await Promise.all([getSites(), getTypesList(), getHolidaysBetween(`${year}-01-01`, `${year}-12-31`), getSundayRules(), getPeople()]);
      setSites(Array.isArray(s) ? s : (s?.data || [])); setTypes(t); setHols(h); setSun(r); setPeople(p);
      const d = {}; t.forEach(x => { d[x.code] = { present: { ...(x.default_multipliers_present || {}) }, absent: { ...(x.default_multipliers_absent || {}) } }; }); setCats(d);
    } catch (e) { setErr(e.message); setHols([]); }
  }
  useEffect(() => { const s = getSession(); if (!s) { window.location.replace("/login"); return; } setSession(s); }, []);
  useEffect(() => { loadAll(); }, [year]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "override") getOverrides(ovFrom, ovTo).then(setOvs).catch(e => { setErr(e.message); setOvs([]); }); }, [tab, ovFrom, ovTo]);

  const typeByCode = useMemo(() => { const m = {}; types.forEach(t => { m[t.code] = t; }); return m; }, [types]);
  const siteName = id => sites.find(s => Number(s.id) === Number(id))?.name || ("Site " + id);
  // effective multiplier for a holiday row × category: row override, else type default (present)
  const effMult = (h, cat) => {
    const cr = h.category_rules || {};
    const v = cr[cat] ?? cr["*"];
    if (v != null) return { v: typeof v === "number" ? v : v.present, own: true };
    const t = typeByCode[h.type_code]; const m = t?.default_multipliers_present || {};
    return { v: m[cat] ?? m["*"] ?? null, own: false };
  };

  // ---- Tab 1
  function openHoliday(h, presetDate, presetSite) {
    const type = h?.type_code || types[0]?.code || "paid_off";
    const m = {}; CATS.forEach(([c]) => { m[c] = h ? (effMult(h, c).v ?? "") : (typeByCode[type]?.default_multipliers_present?.[c] ?? typeByCode[type]?.default_multipliers_present?.["*"] ?? "") ; });
    setErr(""); setHForm({ id: h?.id || null, name: h?.name || "", on_date: h?.on_date || presetDate || iso(new Date()), type_code: type,
      site: h ? ((h.site_ids || []).length ? String(h.site_ids[0]) : "all") : (presetSite || "all"), mult: m, notify: !h });
  }
  const onTypeChange = code => setHForm(f => { const m = {}; CATS.forEach(([c]) => { m[c] = typeByCode[code]?.default_multipliers_present?.[c] ?? typeByCode[code]?.default_multipliers_present?.["*"] ?? ""; }); return { ...f, type_code: code, mult: m }; });
  async function saveHol() {
    setBusy(true); setErr("");
    const cr = {}; CATS.forEach(([c]) => { if (hForm.mult[c] !== "" && hForm.mult[c] != null) cr[c] = Number(hForm.mult[c]); });
    const site_ids = hForm.site === "all" ? [] : [Number(hForm.site)];
    const r = await saveHoliday({ id: hForm.id, name: hForm.name, on_date: hForm.on_date, type_code: hForm.type_code, site_ids, applies_to: "both", category_rules: cr });
    if (!r.ok) { setBusy(false); setErr(r.error); return; }
    _resetHolidayCache();
    if (hForm.notify) {   // bell + push to the staff of the affected sites (workers see the punch-screen banner)
      const ids = await staffForSites(site_ids);
      await notifyUsers({ userIds: ids, kind: "holiday", siteId: site_ids[0] || null, title: `Holiday: ${hForm.name} · ${dmy(hForm.on_date)}`,
        body: `${typeLabel(typeByCode[hForm.type_code] || { code: hForm.type_code })} · ${hForm.site === "all" ? "All sites" : siteName(hForm.site)}`, link: "/calendar" });
    }
    setBusy(false); setHForm(null); setMsg("Holiday rule saved" + (hForm.notify ? " · site staff notified." : ".")); loadAll();
  }
  async function delHol(h) { if (!window.confirm(`Delete "${h.name}" (${dmy(h.on_date)})?`)) return; const r = await deleteHoliday(h.id); if (!r.ok) { setErr(r.error); return; } _resetHolidayCache(); setMsg("Deleted."); loadAll(); }

  // ---- Tab 2
  async function saveSun(siteId, code) { setBusy(true); setErr(""); const r = await setSundayRule(siteId, code); setBusy(false); if (!r.ok) { setErr(r.error); return; } setMsg("Sunday rule saved."); setSun(await getSundayRules()); }
  const sundaysOf = y => { const out = []; for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) if (d.getDay() === 0) out.push(iso(d)); return out; };
  const specialSundays = (hols || []).filter(h => new Date(h.on_date + "T00:00:00").getDay() === 0);

  // ---- Tab 3
  async function saveCats() {
    setBusy(true); setErr("");
    for (const t of types) {
      const d = cats[t.code]; if (!d) continue;
      const pr = {}; CATS.forEach(([c]) => { if (d.present[c] !== "" && d.present[c] != null) pr[c] = Number(d.present[c]); });
      const ab = {}; CATS.forEach(([c]) => { if (d.absent[c] !== "" && d.absent[c] != null) ab[c] = Number(d.absent[c]); });
      const r = await setTypeDefaults(t.code, pr, ab); if (!r.ok) { setBusy(false); setErr(r.error); return; }
    }
    _resetHolidayCache(); setBusy(false); setMsg("Category defaults saved."); loadAll();
  }
  const setCat = (code, key, cat, v) => setCats(c => ({ ...c, [code]: { ...c[code], [key]: { ...c[code][key], [cat]: v.replace(/[^0-9.]/g, "") } } }));

  // ---- Tab 4
  async function saveOv() {
    setBusy(true); setErr("");
    const r = oForm.kind === "worker" ? await setWorkerOverride(oForm.person_id, oForm.on_date, oForm.mult, oForm.reason) : await setStaffOverride(oForm.person_id, oForm.on_date, oForm.mult, oForm.reason);
    setBusy(false); if (!r.ok) { setErr(r.error); return; }
    setOForm(null); setMsg("Override saved."); getOverrides(ovFrom, ovTo).then(setOvs);
  }
  async function delOv(o) {
    if (!window.confirm(`Remove the ${fmtX(o.multiplier)} override for ${o.person_name} on ${dmy(o.on_date)}? The normal rule applies again.`)) return;
    const r = o.kind === "worker" ? await setWorkerOverride(o.person_id, o.on_date, null, null) : await setStaffOverride(o.person_id, o.on_date, null, null);
    if (!r.ok) { setErr(r.error); return; } setMsg("Override removed."); getOverrides(ovFrom, ovTo).then(setOvs);
  }
  const originalRule = o => { const h = (hols || []).find(x => x.on_date === o.on_date && (!(x.site_ids || []).length || (x.site_ids || []).map(Number).includes(Number(o.site_id)))); if (h) return h.name + " · " + typeLabel(typeByCode[h.type_code] || { code: h.type_code || "classic" }); const r = sun[String(o.site_id)]; return new Date(o.on_date + "T00:00:00").getDay() === 0 ? "Sunday · " + SUN_CODES.find(s => s[0] === ruleCode(r))[1] : "Working day"; };

  const inp = { width: "100%", boxSizing: "border-box" };
  // plain render helper (NOT a component — a component defined here would remount on every keystroke)
  const renderModal = ({ title, children, onSave, saveLabel = "Save", onClose }) => (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }}>
      <div onClick={e => e.stopPropagation()} className="panel" style={{ width: "min(620px,100%)", margin: 0, maxHeight: "92vh", overflowY: "auto" }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>{children}
        {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button onClick={onClose} disabled={busy}>Cancel</button><button className="primary" onClick={onSave} disabled={busy}>{busy ? "Saving…" : saveLabel}</button></div>
      </div>
    </div>
  );

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          <div><h1 style={{ marginBottom: 2 }}>Attendance Rules</h1><div className="muted" style={{ fontSize: 12.5 }}>Single source of truth for holiday, Sunday, category and override pay rules — payroll and the calendar read these rows.</div></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={year} onChange={e => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}</select>
            <a href="/calendar"><button>← Calendar</button></a>
          </div>
        </div>
        {!canManage && session && <div className="note amber" style={{ marginBottom: 10 }}>View only — editing needs Director or the Attendance manage right.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && !hForm && !oForm && !sForm && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {TABS.map(([k, l]) => <button key={k} className={tab === k ? "primary" : ""} onClick={() => { setTab(k); setMsg(""); setErr(""); }}>{l}</button>)}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{DESC[tab]}</div>

        {tab === "holiday" && (
          <div className="panel">
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>{canManage && <button className="primary" onClick={() => openHoliday(null)}>＋ Add Holiday Rule</button>}</div>
            {hols === null ? <div className="muted">Loading…</div> : hols.length === 0 ? <div className="muted">No holiday rules in {year}.</div> : (
              <div className="dt-scroll"><table className="dt-compact" style={{ width: "100%" }}>
                <thead><tr><th>Holiday Name</th><th>Date</th><th>Rule Type</th><th>Site</th><th className="num">Workers</th><th className="num">Site Staff</th><th className="num">Office Staff</th><th>Actions</th></tr></thead>
                <tbody>{hols.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 700 }}>{h.name}</td><td>{dmy(h.on_date)}</td>
                    <td>{typeLabel(typeByCode[h.type_code] || { code: h.type_code || "Classic (2×/1×)" })}</td>
                    <td>{(h.site_ids || []).length ? h.site_ids.map(siteName).join(", ") : "All Sites"}</td>
                    {CATS.map(([c]) => { const e = effMult(h, c); return <td key={c} className="num" style={{ color: e.own ? "inherit" : "var(--muted)" }} title={e.own ? "Set on this holiday" : "Default from Category Pay Rules"}>{e.v == null ? "—" : fmtX(e.v)}</td>; })}
                    <td style={{ whiteSpace: "nowrap" }}>{canManage && <><button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => openHoliday(h)}>✎ Edit</button><button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => delHol(h)}>Delete</button></>}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Grey multipliers are inherited from Category Pay Rules; black ones are set on that holiday.</div>
          </div>
        )}

        {tab === "sunday" && (
          <div className="panel">
            <table className="dt-compact" style={{ width: "100%", marginBottom: 14 }}>
              <thead><tr><th>Site</th><th>Sunday policy</th><th></th></tr></thead>
              <tbody>{sites.map(s => { const code = ruleCode(sun[String(s.id)]); return (
                <tr key={s.id}><td style={{ fontWeight: 700 }}>{s.name}</td>
                  <td><span className={"badge " + (code === "weekly_off" ? "warn" : code === "special_pay" ? "p" : "gray")}>{SUN_CODES.find(x => x[0] === code)[1]}</span></td>
                  <td>{canManage && <select value={code} disabled={busy} onChange={e => saveSun(s.id, e.target.value)}>{SUN_CODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</td>
                </tr>); })}</tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div><b>Special Sundays {year}</b> <span className="muted" style={{ fontSize: 12 }}>— single Sundays that differ from the site's default</span></div>
              {canManage && <button className="primary" onClick={() => { setErr(""); setSForm({ site: "all", on_date: sundaysOf(year).find(d => d >= iso(new Date())) || sundaysOf(year)[0], type_code: types[0]?.code || "paid_off", name: "" }); }}>＋ Mark a Sunday</button>}
            </div>
            {specialSundays.length === 0 ? <div className="muted">None marked.</div> : (
              <table className="dt-compact" style={{ width: "100%" }}><thead><tr><th>Sunday</th><th>Name</th><th>Rule Type</th><th>Site</th><th></th></tr></thead>
                <tbody>{specialSundays.map(h => <tr key={h.id}><td>{dmy(h.on_date)}</td><td>{h.name}</td><td>{typeLabel(typeByCode[h.type_code] || { code: h.type_code || "Classic" })}</td><td>{(h.site_ids || []).length ? h.site_ids.map(siteName).join(", ") : "All Sites"}</td><td>{canManage && <button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => delHol(h)}>Delete</button>}</td></tr>)}</tbody></table>
            )}
          </div>
        )}

        {tab === "category" && (
          <div className="panel">
            {types.length === 0 ? <div className="muted">No rule types found — run pipeskool_holiday_rules_v2.sql (update 386).</div> : (
              <table className="dt-compact" style={{ width: "100%" }}>
                <thead><tr><th>Rule type</th>{CATS.map(([c, l]) => <th key={c} className="num">{l}<div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>worked · absent</div></th>)}</tr></thead>
                <tbody>{types.map(t => (
                  <tr key={t.code}><td style={{ fontWeight: 700 }}>{typeLabel(t)}<div className="muted" style={{ fontSize: 10.5 }}>{t.code}{t.counts_as_paid_day === false ? " · not a paid day" : ""}</div></td>
                    {CATS.map(([c]) => <td key={c} className="num" style={{ whiteSpace: "nowrap" }}>
                      <input disabled={!canManage} style={{ width: 54, textAlign: "right" }} value={cats[t.code]?.present?.[c] ?? ""} placeholder={cats[t.code]?.present?.["*"] ?? "—"} onChange={e => setCat(t.code, "present", c, e.target.value)} /> ×
                      <span className="muted"> · </span>
                      <input disabled={!canManage} style={{ width: 54, textAlign: "right" }} value={cats[t.code]?.absent?.[c] ?? ""} placeholder={cats[t.code]?.absent?.["*"] ?? "—"} onChange={e => setCat(t.code, "absent", c, e.target.value)} /> ×
                    </td>)}
                  </tr>))}</tbody>
              </table>
            )}
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>"worked" = multiplier when the person attends that day; "absent" = what a no-show on the holiday is paid (1 = paid holiday, 0 = unpaid). Blank falls back to the type's * default.</div>
            {canManage && types.length > 0 && <div style={{ textAlign: "right", marginTop: 10 }}><button className="primary" onClick={saveCats} disabled={busy}>{busy ? "Saving…" : "Save defaults"}</button></div>}
          </div>
        )}

        {tab === "override" && (
          <div className="panel">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>From</span><input type="date" value={ovFrom} onChange={e => setOvFrom(e.target.value)} />
              <span className="muted" style={{ fontSize: 12 }}>to</span><input type="date" value={ovTo} onChange={e => setOvTo(e.target.value)} />
              <div style={{ marginLeft: "auto" }}>{canManage && <button className="primary" onClick={() => { setErr(""); setOForm({ kind: "worker", person_id: "", on_date: iso(new Date()), mult: "2", reason: "" }); }}>＋ Add Override</button>}</div>
            </div>
            {ovs === null ? <div className="muted">Loading…</div> : ovs.length === 0 ? <div className="muted">No overrides in this range.</div> : (
              <div className="dt-scroll"><table className="dt-compact" style={{ width: "100%" }}>
                <thead><tr><th>Person</th><th>Date</th><th>Site</th><th>Original rule</th><th className="num">Override</th><th>Reason</th><th>Set by</th><th>Actions</th></tr></thead>
                <tbody>{ovs.map((o, i) => (
                  <tr key={i}><td style={{ fontWeight: 700 }}>{o.person_name}<div className="muted" style={{ fontSize: 10.5 }}>{o.kind === "worker" ? "Worker" : "Staff"}</div></td><td>{dmy(o.on_date)}</td><td>{o.site_name || "—"}</td><td style={{ fontSize: 12 }}>{originalRule(o)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmtX(o.multiplier)}</td><td style={{ fontSize: 12 }}>{o.reason || "—"}</td><td style={{ fontSize: 12 }}>{o.set_by_name || <span className="muted">—</span>}{o.set_at && <div className="muted" style={{ fontSize: 10.5 }}>{dmy(String(o.set_at).slice(0, 10))}</div>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{canManage && <><button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => { setErr(""); setOForm({ kind: o.kind, person_id: String(o.person_id), on_date: o.on_date, mult: String(o.multiplier), reason: o.reason || "", lock: true }); }}>✎ Edit</button><button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => delOv(o)}>Delete</button></>}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </div>
        )}

        {hForm && (
          renderModal({ title: hForm.id ? "Edit holiday rule" : "Add holiday rule", onSave: saveHol, onClose: () => setHForm(null), children: (<>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              <div style={{ gridColumn: "1/-1" }}><label className="muted">Holiday name *</label><input style={inp} value={hForm.name} onChange={e => setHForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
              <div><label className="muted">Date *</label><input type="date" style={inp} value={hForm.on_date} onChange={e => setHForm(f => ({ ...f, on_date: e.target.value }))} /></div>
              <div><label className="muted">Rule type</label><select style={inp} value={hForm.type_code} onChange={e => onTypeChange(e.target.value)}>{types.map(t => <option key={t.code} value={t.code}>{typeLabel(t)}</option>)}</select></div>
              <div><label className="muted">Site</label><select style={inp} value={hForm.site} onChange={e => setHForm(f => ({ ...f, site: e.target.value }))}><option value="all">All Sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            </div>
            <div className="muted" style={{ fontSize: 11.5, margin: "12px 0 4px" }}>Multiplier when worked, per category (pre-filled from Category Pay Rules — change to override for this holiday)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {CATS.map(([c, l]) => <div key={c}><label className="muted">{l}</label><input style={inp} inputMode="decimal" value={hForm.mult[c] ?? ""} onChange={e => setHForm(f => ({ ...f, mult: { ...f.mult, [c]: e.target.value.replace(/[^0-9.]/g, "") } }))} /></div>)}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13 }}><input type="checkbox" checked={hForm.notify} onChange={e => setHForm(f => ({ ...f, notify: e.target.checked }))} /> Notify site staff (bell + push). Workers see the punch-screen banner automatically.</label>
          </>) })
        )}
        {sForm && (
          renderModal({ title: "Mark a Sunday", saveLabel: "Save", onClose: () => setSForm(null), onSave: async () => {
            setBusy(true); setErr("");
            const r = await saveHoliday({ name: sForm.name || (typeLabel(typeByCode[sForm.type_code] || { code: sForm.type_code }) + " Sunday"), on_date: sForm.on_date, type_code: sForm.type_code, site_ids: sForm.site === "all" ? [] : [Number(sForm.site)], applies_to: "both", category_rules: null });
            setBusy(false); if (!r.ok) { setErr(r.error); return; } _resetHolidayCache(); setSForm(null); setMsg("Sunday marked."); loadAll(); }, children: (<>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              <div><label className="muted">Sunday</label><select style={inp} value={sForm.on_date} onChange={e => setSForm(f => ({ ...f, on_date: e.target.value }))}>{sundaysOf(year).map(d => <option key={d} value={d}>{dmy(d)}</option>)}</select></div>
              <div><label className="muted">Treat as</label><select style={inp} value={sForm.type_code} onChange={e => setSForm(f => ({ ...f, type_code: e.target.value }))}>{types.map(t => <option key={t.code} value={t.code}>{typeLabel(t)}</option>)}</select></div>
              <div><label className="muted">Site</label><select style={inp} value={sForm.site} onChange={e => setSForm(f => ({ ...f, site: e.target.value }))}><option value="all">All Sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="muted">Label (optional)</label><input style={inp} value={sForm.name} onChange={e => setSForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Paid Sunday — Navratri" /></div>
            </div>
          </>) })
        )}
        {oForm && (
          renderModal({ title: oForm.lock ? "Edit override" : "Add override", onSave: saveOv, onClose: () => setOForm(null), children: (<>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              <div><label className="muted">Who</label><select style={inp} disabled={oForm.lock} value={oForm.kind} onChange={e => setOForm(f => ({ ...f, kind: e.target.value, person_id: "" }))}><option value="worker">Worker / labour</option><option value="staff">Staff</option></select></div>
              <div><label className="muted">Person</label><select style={inp} disabled={oForm.lock} value={oForm.person_id} onChange={e => setOForm(f => ({ ...f, person_id: e.target.value }))}><option value="">— select —</option>
                {(oForm.kind === "worker" ? people.workers : people.staff).map(p => <option key={p.id} value={p.id}>{p.full_name}{p.sites?.name ? " · " + p.sites.name : p.site_id ? " · " + siteName(p.site_id) : ""}</option>)}</select></div>
              <div><label className="muted">Date</label><input type="date" style={inp} disabled={oForm.lock} value={oForm.on_date} onChange={e => setOForm(f => ({ ...f, on_date: e.target.value }))} /></div>
              <div><label className="muted">Multiplier</label><div style={{ display: "flex", gap: 6 }}>{["1", "1.5", "2"].map(v => <button key={v} type="button" className={oForm.mult === v ? "primary" : ""} onClick={() => setOForm(f => ({ ...f, mult: v }))}>{v}×</button>)}<input style={{ width: 70 }} inputMode="decimal" value={oForm.mult} onChange={e => setOForm(f => ({ ...f, mult: e.target.value.replace(/[^0-9.]/g, "") }))} /></div></div>
              <div style={{ gridColumn: "1/-1" }}><label className="muted">Reason</label><input style={inp} value={oForm.reason} onChange={e => setOForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. came in on Diwali" /></div>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Worker overrides need an attendance row on that date (mark attendance first). Staff overrides apply through the salary sheet.</div>
          </>) })
        )}
      </main>
    </div>
  );
}
