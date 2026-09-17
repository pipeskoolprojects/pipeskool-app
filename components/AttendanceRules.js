"use client";
// update397: RULES tab of /calendar, laid out to the Director's reference (17 Sep): eight sub-tabs,
// blue info strip, orange ＋ button, left form card + right table card. Every tab is wired to REAL
// tables/settings that payroll already reads — nothing here is decorative:
//   Holiday → company_holidays · Attendance → sites shift/hours/geofence · Overtime → payroll.ot_divisor + sites.ot_divisor
//   Sunday → sunday_site_rules + one-day rules · Festival → holiday_types category defaults
//   Worker/Staff → attendance.holiday_multiplier / staff_pay_days overrides · General → payroll.* + copy-year
import { useEffect, useMemo, useState } from "react";
import { getSession, canAnySite } from "@/lib/auth";
import { getSitesFull, updateSiteTimings, updateSiteGeofence } from "@/lib/data";
import { supabase, isDemo } from "@/lib/supabase";
import { iso } from "@/lib/calendar";
import { saveHoliday, deleteHoliday, getHolidaysBetween, _resetHolidayCache, copyHolidaysYear } from "@/lib/holidays";
import { getPayrollSettings, savePayrollSettings } from "@/lib/payrollSettings";
import { notifyUsers } from "@/lib/notify";
import { getOtRules, saveOtRule, deleteOtRule, getOtSlabs, saveOtSlab, deleteOtSlab, fmtRange } from "@/lib/otRules";   // update398
import { CATS, SUN_CODES, ruleCode, setWorkerOverride, setStaffOverride, setTypeDefaults, setSundayRule, getOverrides, getSundayRules, getTypesList, getPeople, staffForSites } from "@/lib/attendanceRules";

const fmtX = n => n == null || n === "" || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(2).replace(/\.?0+$/, "") + "x";
const dmy = k => k ? String(k).split("-").reverse().join("/") : "";
const typeLabel = t => t.label || t.name || t.code;
const MULTS = ["0", "0.5", "1", "1.5", "2", "2.5", "3"];
const TABS = [["holiday", "🎉", "Holiday Rules"], ["overtime", "🕘", "Overtime Rules"], ["sunday", "📆", "Sunday Rules"], ["festival", "✨", "Festival Rules"], ["worker", "👷", "Worker Rules"], ["staff", "👥", "Staff Rules"], ["general", "⚙️", "General"]];
const INFO = {
  holiday: "Add and manage all company holidays. Set pay rules, site-wise applicability and category-wise multipliers.",
  attendance: "Site working hours, shift timings and geofence. Hours are ACTUAL time at site — no lunch or break deduction, ever. A missing punch-out stays open until midnight, then closes at the site's shift end and is held out of wages until a supervisor confirms.",
  overtime: "Set overtime eligibility, start time, round-off rules and OT multipliers. These rules will be used in payroll and salary slip calculations.",
  sunday: "Sunday policy per site. Company default is Working Day (Sunday is a normal day; a half day worked on Sunday counts as a full paid day). Mark single Sundays differently below.",
  festival: "Default pay multipliers per rule type and category. These pre-fill every new holiday rule and apply to holidays without their own override.",
  worker: "One-time pay overrides for an individual worker on a date — beats every rule for that worker and day. Worker policy: daily wage; advances recovered manually; contractor workers are paid via the contractor.",
  staff: "One-time pay overrides for a staff member on a date. Staff policy: salary ÷ 30 per day, Sundays paid, OT per staff toggle; leave year Apr–Mar, one paid pool, ≤50% usable Apr–Sep, max 10 days per stretch.",
  general: "Pay period, Professional Tax slab and year-to-year holiday copy. Changes apply from the next payroll generation.",
};
const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 };
const inp = { width: "100%", boxSizing: "border-box" };
const lab = { fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 4 };
const req = <span style={{ color: "#dc2626" }}> *</span>;
const btnO = { background: "#FF7A1A", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer" };
const btnB = { background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer" };
const btnG = { background: "#fff", color: "#111827", border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer" };
const pillOk = { background: "#dcfce7", color: "#15803d", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600 };
const pillOff = { background: "#f3f4f6", color: "#6b7280", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600 };
const Toggle = ({ on, set, label, hint }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
    <span onClick={() => set(!on)} style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#1d4ed8" : "#d1d5db", position: "relative", flex: "none" }}><span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} /></span>
    <span><div style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</div>{hint && <div className="muted" style={{ fontSize: 11.5 }}>{hint}</div>}</span>
  </label>
);

const InfoStrip = ({ text, action }) => (
  <div style={{ display: "flex", gap: 14, alignItems: "stretch", marginBottom: 16, flexWrap: "wrap" }}>
    <div style={{ flex: 1, minWidth: 260, background: "#eff4ff", border: "1px solid #c7d7fe", color: "#1e40af", borderRadius: 10, padding: "12px 16px", fontSize: 13.5, display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 18 }}>ⓘ</span><span>{text}</span></div>
    {action}
  </div>
);
const TableCard = ({ children, search, onSearch }) => (
  <div style={{ ...card, padding: 0, overflow: "hidden" }}>
    {search !== undefined && <div style={{ display: "flex", justifyContent: "flex-end", padding: 12 }}><input placeholder="🔍  Search…" value={search} onChange={e => onSearch(e.target.value)} style={{ width: 260 }} /></div>}
    <div className="dt-scroll" style={{ padding: "0 12px 12px" }}>{children}</div>
  </div>
);

export default function AttendanceRules() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("holiday");
  const [year, setYear] = useState(new Date().getFullYear());
  const [sites, setSites] = useState([]); const [types, setTypes] = useState([]);
  const [hols, setHols] = useState(null); const [sun, setSun] = useState({});
  const [people, setPeople] = useState({ workers: [], staff: [] });
  const [pay, setPay] = useState(null); const [siteDraft, setSiteDraft] = useState({});
  const [ovFrom, setOvFrom] = useState(iso(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)));
  const [ovTo, setOvTo] = useState(iso(new Date())); const [ovs, setOvs] = useState(null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [q, setQ] = useState(""); const [pg, setPg] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [cats, setCats] = useState({});
  const [otRules, setOtRules] = useState(null); const [slabs, setSlabs] = useState(null);   // update398
  const blankR = () => ({ id: null, name: "", is_eligible: true, start_after: "", round_type: "custom", multiplier: "1", apply_labour: true, apply_site_staff: false, apply_office_staff: false, description: "", is_active: true });
  const [rForm, setRForm] = useState(blankR); const [rq, setRq] = useState("");
  const [slabForm, setSlabForm] = useState(null);   // { from_h, from_m, to_h, to_m, hours }
  const [copy, setCopy] = useState({ from: new Date().getFullYear(), to: new Date().getFullYear() + 1, preview: null });
  const canManage = !!session && (session.role === "director" || canAnySite(session, "attendance", "manage"));

  const blankH = () => ({ id: null, name: "", on_date: "", type_code: "", mult: { labour: "2", site_staff: "1", office_staff: "1" }, site: "all", note: "", is_active: true, notify: true });
  const [hForm, setHForm] = useState(blankH);
  const blankO = kind => ({ kind, person_id: "", on_date: iso(new Date()), mult: "2", reason: "" });
  const [oForm, setOForm] = useState(blankO("worker"));
  const [sForm, setSForm] = useState({ site: "all", on_date: "", type_code: "", name: "" });

  async function loadAll() {
    try {
      const [s, t, h, r, p, ps] = await Promise.all([getSitesFull(), getTypesList(), getHolidaysBetween(`${year}-01-01`, `${year}-12-31`), getSundayRules(), getPeople(), getPayrollSettings()]);
      const { data: otRows } = isDemo ? { data: [] } : await supabase.from("sites").select("id, ot_divisor").eq("is_active", true);
      const otBy = {}; (otRows || []).forEach(x => { otBy[x.id] = x.ot_divisor; });
      const full = (s || []).map(x => ({ ...x, ot_divisor: otBy[x.id] ?? null }));
      setSites(full); setTypes(t); setHols(h); setSun(r); setPeople(p); setPay(ps);
      const d = {}; full.forEach(x => { d[x.id] = { shift_start: (x.shift_start || "09:00").slice(0, 5), shift_end: (x.shift_end || "18:00").slice(0, 5), std: x.std_working_hours ?? 8, radius: x.geofence_radius_m ?? 200, lat: x.geofence_lat ?? "", lng: x.geofence_lng ?? "", ot: x.ot_divisor ?? "" }; }); setSiteDraft(d);
      const c = {}; t.forEach(x => { c[x.code] = { present: { ...(x.default_multipliers_present || {}) }, absent: { ...(x.default_multipliers_absent || {}) } }; }); setCats(c);
    } catch (e) { setErr(e.message); setHols([]); }
  }
  useEffect(() => { const s = getSession(); if (!s) { window.location.replace("/login"); return; } setSession(s); }, []);
  useEffect(() => { loadAll(); }, [year]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "worker" || tab === "staff") getOverrides(ovFrom, ovTo).then(setOvs).catch(e => { setErr(e.message); setOvs([]); }); }, [tab, ovFrom, ovTo]);
  const loadOt = () => Promise.all([getOtRules(), getOtSlabs()]).then(([r, sl]) => { setOtRules(r); setSlabs(sl); }).catch(e => { setErr(e.message); setOtRules([]); setSlabs([]); });
  useEffect(() => { if (tab === "overtime") loadOt(); }, [tab]);
  async function saveRule() { if (!rForm.name.trim()) { setErr("Rule name is required."); return; } setBusy(true); setErr(""); const r = await saveOtRule(rForm.id, { ...rForm, multiplier: Number(rForm.multiplier) || 1 }); setBusy(false); if (!r.ok) { setErr(r.error); return; } setMsg(rForm.id ? "Overtime rule updated." : "Overtime rule saved."); setRForm(blankR()); loadOt(); }
  async function delRule(r) { if (!window.confirm(`Delete "${r.name}"?`)) return; const x = await deleteOtRule(r.id); if (!x.ok) { setErr(x.error); return; } setMsg("Rule deleted."); loadOt(); }
  async function saveSlab() { const f = Number(slabForm.from_h) * 60 + Number(slabForm.from_m || 0), t = Number(slabForm.to_h) * 60 + Number(slabForm.to_m || 0); if (Number.isNaN(f) || Number.isNaN(t) || slabForm.hours === "") { setErr("Fill from, to and counted hours."); return; } setBusy(true); setErr(""); const r = await saveOtSlab(slabForm.id, f, t, slabForm.hours); setBusy(false); if (!r.ok) { setErr(r.error); return; } setMsg("Round-off rule saved."); setSlabForm(null); loadOt(); }
  async function delSlab(x) { if (!window.confirm(`Remove slab ${fmtRange(x.from_min, x.to_min)}?`)) return; const r = await deleteOtSlab(x.id); if (!r.ok) { setErr(r.error); return; } loadOt(); }
  const slabFor = min => (slabs || []).find(x => min >= x.from_min && min <= x.to_min);
  const exampleMin = 135;   // 11 h 15 m worked on a 9 h shift → 2 h 15 m extra
  const exSlab = slabFor(exampleMin);

  const typeByCode = useMemo(() => { const m = {}; types.forEach(t => { m[t.code] = t; }); return m; }, [types]);
  const siteName = id => sites.find(s => Number(s.id) === Number(id))?.name || ("Site " + id);
  const effMult = (h, cat) => { const cr = h.category_rules || {}; const v = cr[cat] ?? cr["*"]; if (v != null) return { v: typeof v === "number" ? v : v.present, own: true }; const t = typeByCode[h.type_code]; const m = t?.default_multipliers_present || {}; const dv = m[cat] ?? m["*"]; return { v: dv ?? (h.type_code ? null : 2 * (cat === "labour" ? 1 : 0.5)), own: false }; };
  const defaultsFor = code => { const m = {}; CATS.forEach(([c]) => { const d = typeByCode[code]?.default_multipliers_present; m[c] = d ? String(d[c] ?? d["*"] ?? "") : (c === "labour" ? "2" : "1"); }); return m; };

  // ---- holiday form
  function editHol(h) { const m = {}; CATS.forEach(([c]) => { m[c] = String(effMult(h, c).v ?? ""); }); setErr(""); setHForm({ id: h.id, name: h.name, on_date: h.on_date, type_code: h.type_code || "", mult: m, site: (h.site_ids || []).length ? String(h.site_ids[0]) : "all", note: h.note || "", is_active: h.is_active !== false, notify: false }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function saveHol() {
    if (!hForm.name.trim() || !hForm.on_date) { setErr("Holiday name and date are required."); return; }
    setBusy(true); setErr("");
    const cr = {}; CATS.forEach(([c]) => { if (hForm.mult[c] !== "" && hForm.mult[c] != null) cr[c] = Number(hForm.mult[c]); });
    const site_ids = hForm.site === "all" ? [] : [Number(hForm.site)];
    const r = await saveHoliday({ id: hForm.id, name: hForm.name, on_date: hForm.on_date, type_code: hForm.type_code || null, site_ids, applies_to: "both", note: hForm.note, category_rules: cr, is_active: hForm.is_active });
    if (!r.ok) { setBusy(false); setErr(r.error); return; }
    _resetHolidayCache();
    if (hForm.notify && hForm.is_active) { const ids = await staffForSites(site_ids); await notifyUsers({ userIds: ids, kind: "holiday", siteId: site_ids[0] || null, title: `Holiday: ${hForm.name} · ${dmy(hForm.on_date)}`, body: (hForm.type_code ? typeLabel(typeByCode[hForm.type_code] || { code: hForm.type_code }) : "Holiday") + " · " + (hForm.site === "all" ? "All sites" : siteName(hForm.site)), link: "/calendar" }); }
    setBusy(false); setMsg(hForm.id ? "Holiday rule updated." : "Holiday rule saved" + (hForm.notify ? " · site staff notified." : ".")); setHForm(blankH()); loadAll();
  }
  async function delHol(h) { if (!window.confirm(`Delete "${h.name}" (${dmy(h.on_date)})?`)) return; const r = await deleteHoliday(h.id); if (!r.ok) { setErr(r.error); return; } _resetHolidayCache(); setMsg("Deleted."); loadAll(); }
  const holRows = useMemo(() => (hols || []).filter(h => !q.trim() || (h.name + " " + h.on_date).toLowerCase().includes(q.trim().toLowerCase())), [hols, q]);
  const pages = Math.max(1, Math.ceil(holRows.length / pageSize)); const pageRows = holRows.slice((pg - 1) * pageSize, pg * pageSize);
  useEffect(() => { setPg(1); }, [q, pageSize, hols]);

  // ---- sites (attendance / overtime)
  const setSD = (id, k, v) => setSiteDraft(d => ({ ...d, [id]: { ...d[id], [k]: v } }));
  async function saveSiteTimes(s) { setBusy(true); setErr(""); const d = siteDraft[s.id]; const r1 = await updateSiteTimings(s.id, d.shift_start, d.shift_end); if (!r1.ok) { setBusy(false); setErr(r1.error); return; } const r2 = await updateSiteGeofence(s.id, d.lat, d.lng, d.radius); if (!r2.ok) { setBusy(false); setErr(r2.error); return; } if (Number(d.std) !== Number(s.std_working_hours)) { const { error } = await supabase.from("sites").update({ std_working_hours: Number(d.std) || 8 }).eq("id", s.id); if (error) { setBusy(false); setErr(error.message); return; } } setBusy(false); setMsg(s.name + " saved."); loadAll(); }
  async function saveSiteOt(s) { setBusy(true); setErr(""); const v = siteDraft[s.id].ot; const { error } = await supabase.from("sites").update({ ot_divisor: v === "" ? null : Number(v) }).eq("id", s.id); setBusy(false); if (error) { setErr(error.message); return; } setMsg(s.name + " OT divisor saved."); loadAll(); }
  async function savePay(part) { setBusy(true); setErr(""); const r = await savePayrollSettings(part); setBusy(false); if (!r?.ok && r?.error) { setErr(r.error); return; } setMsg("Settings saved."); }

  // ---- sunday
  async function saveSun(siteId, code) { setBusy(true); setErr(""); const r = await setSundayRule(siteId, code); setBusy(false); if (!r.ok) { setErr(r.error); return; } setMsg("Sunday rule saved."); setSun(await getSundayRules()); }
  const sundaysOf = y => { const out = []; for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) if (d.getDay() === 0) out.push(iso(d)); return out; };
  const specialSundays = (hols || []).filter(h => new Date(h.on_date + "T00:00:00").getDay() === 0);
  async function saveSpecialSunday() { if (!sForm.on_date) { setErr("Pick a Sunday."); return; } setBusy(true); setErr(""); const r = await saveHoliday({ name: sForm.name || ((sForm.type_code ? typeLabel(typeByCode[sForm.type_code] || { code: sForm.type_code }) : "Special") + " Sunday"), on_date: sForm.on_date, type_code: sForm.type_code || null, site_ids: sForm.site === "all" ? [] : [Number(sForm.site)], applies_to: "both", category_rules: null, is_active: true }); setBusy(false); if (!r.ok) { setErr(r.error); return; } _resetHolidayCache(); setMsg("Sunday marked."); setSForm({ site: "all", on_date: "", type_code: "", name: "" }); loadAll(); }

  // ---- festival (category defaults)
  const setCat = (code, key, cat, v) => setCats(c => ({ ...c, [code]: { ...c[code], [key]: { ...c[code][key], [cat]: v.replace(/[^0-9.]/g, "") } } }));
  async function saveCats() { setBusy(true); setErr(""); for (const t of types) { const d = cats[t.code]; if (!d) continue; const pr = {}; CATS.forEach(([c]) => { if (d.present[c] !== "" && d.present[c] != null) pr[c] = Number(d.present[c]); }); const ab = {}; CATS.forEach(([c]) => { if (d.absent[c] !== "" && d.absent[c] != null) ab[c] = Number(d.absent[c]); }); const r = await setTypeDefaults(t.code, pr, ab); if (!r.ok) { setBusy(false); setErr(r.error); return; } } _resetHolidayCache(); setBusy(false); setMsg("Category defaults saved."); loadAll(); }

  // ---- overrides
  async function saveOv() { if (!oForm.person_id || !oForm.on_date || !oForm.mult) { setErr("Pick a person, date and multiplier."); return; } setBusy(true); setErr(""); const r = oForm.kind === "worker" ? await setWorkerOverride(oForm.person_id, oForm.on_date, oForm.mult, oForm.reason) : await setStaffOverride(oForm.person_id, oForm.on_date, oForm.mult, oForm.reason); setBusy(false); if (!r.ok) { setErr(r.error); return; } setMsg("Override saved."); setOForm(blankO(oForm.kind)); getOverrides(ovFrom, ovTo).then(setOvs); }
  async function delOv(o) { if (!window.confirm(`Remove the ${fmtX(o.multiplier)} override for ${o.person_name} on ${dmy(o.on_date)}?`)) return; const r = o.kind === "worker" ? await setWorkerOverride(o.person_id, o.on_date, null, null) : await setStaffOverride(o.person_id, o.on_date, null, null); if (!r.ok) { setErr(r.error); return; } setMsg("Override removed."); getOverrides(ovFrom, ovTo).then(setOvs); }
  const originalRule = o => { const h = (hols || []).find(x => x.on_date === o.on_date && (!(x.site_ids || []).length || (x.site_ids || []).map(Number).includes(Number(o.site_id)))); if (h) return h.name; const r = sun[String(o.site_id)]; return new Date(o.on_date + "T00:00:00").getDay() === 0 ? "Sunday · " + SUN_CODES.find(s => s[0] === ruleCode(r))[1] : "Working day"; };

  // ---- shared pieces
  const th = { background: "#f8fafc", fontWeight: 600, fontSize: 12.5, color: "#374151", padding: "10px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" };
  const td = { padding: "12px 10px", borderBottom: "1px solid #eef0f4", fontSize: 13, verticalAlign: "top" };
  const renderOvTable = kind => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr>{["Name", "Date", "Site", "Original rule", "Override", "Reason", "Set by", "Actions"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{ovs === null ? <tr><td style={td} colSpan={8} className="muted">Loading…</td></tr> : ovs.filter(o => o.kind === kind).length === 0 ? <tr><td style={td} colSpan={8} className="muted">No overrides in this range.</td></tr>
        : ovs.filter(o => o.kind === kind).map((o, i) => <tr key={i}><td style={{ ...td, fontWeight: 700 }}>{o.person_name}</td><td style={td}>{dmy(o.on_date)}</td><td style={td}>{o.site_name || "—"}</td><td style={td}>{originalRule(o)}</td><td style={{ ...td, fontWeight: 700 }}>{fmtX(o.multiplier)}</td><td style={td}>{o.reason || "—"}</td><td style={td}>{o.set_by_name || "—"}</td>
          <td style={{ ...td, whiteSpace: "nowrap" }}>{canManage && <><button style={{ ...btnG, padding: "6px 10px", fontSize: 12, marginRight: 6 }} onClick={() => { setErr(""); setOForm({ kind: o.kind, person_id: String(o.person_id), on_date: o.on_date, mult: String(o.multiplier), reason: o.reason || "", lock: true }); }}>✎ Edit</button><button style={{ ...btnG, padding: "6px 10px", fontSize: 12, color: "#dc2626", borderColor: "#fecaca" }} onClick={() => delOv(o)}>🗑 Delete</button></>}</td></tr>)}</tbody>
    </table>
  );
  const renderOvForm = kind => (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>{oForm.lock ? "Edit Override" : "Add Override"}</div>
      <label style={lab}>{kind === "worker" ? "Worker" : "Staff member"}{req}</label>
      <select style={{ ...inp, marginBottom: 12 }} disabled={oForm.lock} value={oForm.person_id} onChange={e => setOForm(f => ({ ...f, kind, person_id: e.target.value }))}><option value="">— select —</option>{(kind === "worker" ? people.workers : people.staff).map(p => <option key={p.id} value={p.id}>{p.full_name}{p.sites?.name ? " · " + p.sites.name : p.site_id ? " · " + siteName(p.site_id) : ""}</option>)}</select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label style={lab}>Date{req}</label><input type="date" style={inp} disabled={oForm.lock} value={oForm.on_date} onChange={e => setOForm(f => ({ ...f, on_date: e.target.value }))} /></div>
        <div><label style={lab}>Multiplier{req}</label><select style={inp} value={MULTS.includes(oForm.mult) ? oForm.mult : "custom"} onChange={e => setOForm(f => ({ ...f, mult: e.target.value === "custom" ? "" : e.target.value }))}>{MULTS.map(m => <option key={m} value={m}>{m}x</option>)}<option value="custom">Custom…</option></select>{!MULTS.includes(oForm.mult) && <input style={{ ...inp, marginTop: 6 }} inputMode="decimal" placeholder="e.g. 1.25" value={oForm.mult} onChange={e => setOForm(f => ({ ...f, mult: e.target.value.replace(/[^0-9.]/g, "") }))} />}</div>
      </div>
      <label style={{ ...lab, marginTop: 12 }}>Reason</label><input style={inp} value={oForm.reason} placeholder="e.g. came in on Diwali" onChange={e => setOForm(f => ({ ...f, reason: e.target.value }))} />
      {kind === "worker" && <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Needs an attendance row on that date — mark attendance first.</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}><button style={{ ...btnG, flex: 1 }} onClick={() => setOForm(blankO(kind))}>↺ Reset</button><button style={{ ...btnB, flex: 2 }} disabled={busy || !canManage} onClick={saveOv}>💾 {oForm.lock ? "Update Override" : "Save Override"}</button></div>
    </div>
  );

  const title = TABS.find(t => t[0] === tab)[2];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div className="muted" style={{ fontSize: 13 }}>Single source of truth for holiday, Sunday, category and override pay rules — payroll and the calendar read these rows.</div>
        <select value={year} onChange={e => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}</select>
      </div>
      <h1 style={{ margin: "10px 0 2px" }}>{title}</h1>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{INFO[tab].split(". ")[0]}.</div>

      <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff", marginBottom: 14 }}>
        {TABS.map(([k, ic, l]) => <button key={k} onClick={() => { setTab(k); setErr(""); setMsg(""); }} style={{ flex: 1, minWidth: 120, border: "none", borderRight: "1px solid #e5e7eb", padding: "14px 8px", background: tab === k ? "#1d4ed8" : "#fff", color: tab === k ? "#fff" : "#111827", fontWeight: 600, fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span>{ic}</span>{l}</button>)}
      </div>
      {!canManage && session && <div className="note amber" style={{ marginBottom: 10 }}>View only — editing needs Director or the Attendance manage right.</div>}
      {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}

      {tab === "holiday" && (<>
        <InfoStrip text={INFO.holiday} action={canManage && <button style={btnO} onClick={() => { setHForm(blankH()); setErr(""); }}>＋ Add Holiday Rule</button>} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 16, alignItems: "start" }}>
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>{hForm.id ? "Edit Holiday Rule" : "Add / Edit Holiday Rule"}</div>
            <label style={lab}>Holiday Name{req}</label><input style={{ ...inp, marginBottom: 12 }} placeholder="e.g. Diwali" value={hForm.name} onChange={e => setHForm(f => ({ ...f, name: e.target.value }))} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={lab}>Date{req}</label><input type="date" style={inp} value={hForm.on_date} onChange={e => setHForm(f => ({ ...f, on_date: e.target.value }))} /></div>
              <div><label style={lab}>Holiday Type{req}</label><select style={inp} value={hForm.type_code} onChange={e => setHForm(f => ({ ...f, type_code: e.target.value, mult: e.target.value ? defaultsFor(e.target.value) : f.mult }))}><option value="">Classic (2×/1×)</option>{types.map(t => <option key={t.code} value={t.code}>{typeLabel(t)}</option>)}</select></div>
              <div><label style={lab}>Pay Multiplier (Workers){req}</label><select style={inp} value={hForm.mult.labour} onChange={e => setHForm(f => ({ ...f, mult: { ...f.mult, labour: e.target.value } }))}>{MULTS.map(m => <option key={m} value={m}>{m}x</option>)}</select></div>
              <div><label style={lab}>Pay Multiplier (Site Staff)</label><select style={inp} value={hForm.mult.site_staff} onChange={e => setHForm(f => ({ ...f, mult: { ...f.mult, site_staff: e.target.value } }))}>{MULTS.map(m => <option key={m} value={m}>{m}x</option>)}</select></div>
            </div>
            <label style={lab}>Pay Multiplier (Office Staff)</label><select style={{ ...inp, marginBottom: 12 }} value={hForm.mult.office_staff} onChange={e => setHForm(f => ({ ...f, mult: { ...f.mult, office_staff: e.target.value } }))}>{MULTS.map(m => <option key={m} value={m}>{m}x</option>)}</select>
            <label style={lab}>Applicable Sites{req}</label><select style={{ ...inp, marginBottom: 12 }} value={hForm.site} onChange={e => setHForm(f => ({ ...f, site: e.target.value }))}><option value="all">All Sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <label style={lab}>Description</label><textarea style={{ ...inp, minHeight: 56, marginBottom: 12 }} placeholder="Add description (optional)" value={hForm.note} onChange={e => setHForm(f => ({ ...f, note: e.target.value }))} />
            <div style={{ marginBottom: 8 }}><Toggle on={hForm.is_active} set={v => setHForm(f => ({ ...f, is_active: v }))} label="Active" hint="Show this holiday in calendar" /></div>
            <div style={{ marginBottom: 14 }}><Toggle on={hForm.notify} set={v => setHForm(f => ({ ...f, notify: v }))} label="Notify site staff" hint="Bell + push on save; workers see the punch-screen banner" /></div>
            <div style={{ display: "flex", gap: 10 }}><button style={{ ...btnG, flex: 1 }} onClick={() => { setHForm(blankH()); setErr(""); }}>↺ Reset</button><button style={{ ...btnB, flex: 2 }} disabled={busy || !canManage} onClick={saveHol}>💾 {hForm.id ? "Update Holiday Rule" : "Save Holiday Rule"}</button></div>
          </div>
          <TableCard search={q} onSearch={setQ}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Holiday Name", "Date", "Rule Type", "Workers", "Site Staff", "Office Staff", "Sites", "Status", "Actions"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{hols === null ? <tr><td style={td} colSpan={9} className="muted">Loading…</td></tr> : pageRows.length === 0 ? <tr><td style={td} colSpan={9} className="muted">No holiday rules{q ? " match" : " in " + year}.</td></tr>
                : pageRows.map(h => (<tr key={h.id}>
                  <td style={{ ...td, fontWeight: 700 }}>{h.name}</td><td style={td}>{dmy(h.on_date)}</td><td style={td}>{h.type_code ? typeLabel(typeByCode[h.type_code] || { code: h.type_code }) : "Classic (2×/1×)"}</td>
                  {CATS.map(([c]) => { const e = effMult(h, c); return <td key={c} style={{ ...td, color: e.own ? "#111827" : "#6b7280" }}>{fmtX(e.v)}</td>; })}
                  <td style={td}>{(h.site_ids || []).length ? h.site_ids.map(siteName).join(", ") : "All Sites"}</td>
                  <td style={td}><span style={h.is_active === false ? pillOff : pillOk}>{h.is_active === false ? "Inactive" : "Active"}</span></td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{canManage && <><button style={{ ...btnG, padding: "6px 10px", fontSize: 12, marginRight: 6 }} onClick={() => editHol(h)}>✎ Edit</button><button style={{ ...btnG, padding: "6px 10px", fontSize: 12, color: "#dc2626", borderColor: "#fecaca" }} onClick={() => delHol(h)}>🗑 Delete</button></>}</td>
                </tr>))}</tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <div className="muted" style={{ fontSize: 12 }}>Grey multipliers are inherited from Category Pay Rules; black ones are set on that holiday.</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button style={{ ...btnG, padding: "6px 10px" }} disabled={pg <= 1} onClick={() => setPg(p => p - 1)}>‹</button>
                {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, pg - 3), Math.max(0, pg - 3) + 5).map(n => <button key={n} onClick={() => setPg(n)} style={{ ...btnG, padding: "6px 10px", borderColor: n === pg ? "#1d4ed8" : "#d1d5db", color: n === pg ? "#1d4ed8" : "#111827" }}>{n}</button>)}
                <button style={{ ...btnG, padding: "6px 10px" }} disabled={pg >= pages} onClick={() => setPg(p => p + 1)}>›</button>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>{[10, 25, 50].map(n => <option key={n} value={n}>{n} / page</option>)}</select>
              </div>
            </div>
          </TableCard>
        </div>
      </>)}

      {tab === "overtime" && (<>
        <InfoStrip text={INFO.overtime} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 16, alignItems: "start" }}>
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>{rForm.id ? "Edit Overtime Rule" : "Add / Edit Overtime Rule"}</div>
            <label style={lab}>Rule Name{req}</label><input style={{ ...inp, marginBottom: 12 }} placeholder="e.g. Standard OT Rule" value={rForm.name} onChange={e => setRForm(f => ({ ...f, name: e.target.value }))} />
            <div style={{ marginBottom: 12 }}><Toggle on={rForm.is_eligible} set={v => setRForm(f => ({ ...f, is_eligible: v }))} label="OT Eligible" hint="Enable overtime for workers/staff" /></div>
            <label style={lab}>OT Start After</label><input type="time" style={inp} value={rForm.start_after || ""} onChange={e => setRForm(f => ({ ...f, start_after: e.target.value }))} />
            <div className="muted" style={{ fontSize: 11.5, margin: "4px 0 12px" }}>Working hours after which OT will be counted. Blank = the site's own shift end (current rule).</div>
            <label style={lab}>OT Round Off Type</label><select style={inp} value={rForm.round_type} onChange={e => setRForm(f => ({ ...f, round_type: e.target.value }))}><option value="custom">Custom (As per rules)</option><option value="nearest_hour">Nearest Hour</option><option value="none">No rounding</option></select>
            <div className="muted" style={{ fontSize: 11.5, margin: "4px 0 12px" }}>Choose how OT hours will be rounded</div>
            <label style={lab}>OT Rate / Multiplier</label><select style={inp} value={rForm.multiplier} onChange={e => setRForm(f => ({ ...f, multiplier: e.target.value }))}>{[["1", "1x (Standard)"], ["1.5", "1.5x"], ["2", "2x"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <div className="muted" style={{ fontSize: 11.5, margin: "4px 0 12px" }}>Set overtime calculation rate</div>
            <label style={lab}>Apply For</label>
            <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 13 }}>
              {[["apply_labour", "Workers"], ["apply_site_staff", "Site Staff"], ["apply_office_staff", "Office Staff"]].map(([k, l]) => <label key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={!!rForm[k]} onChange={e => setRForm(f => ({ ...f, [k]: e.target.checked }))} />{l}</label>)}
            </div>
            <label style={lab}>Description</label><textarea style={{ ...inp, minHeight: 56, marginBottom: 14 }} placeholder="Add description (optional)" value={rForm.description || ""} onChange={e => setRForm(f => ({ ...f, description: e.target.value }))} />
            <div style={{ display: "flex", gap: 10 }}><button style={{ ...btnG, flex: 1 }} onClick={() => { setRForm(blankR()); setErr(""); }}>↺ Reset</button><button style={{ ...btnB, flex: 2 }} disabled={busy || !canManage} onClick={saveRule}>💾 {rForm.id ? "Update Overtime Rule" : "Save Overtime Rule"}</button></div>
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, flexWrap: "wrap", gap: 8 }}><div style={{ fontWeight: 800, fontSize: 16 }}>Overtime Rules List</div><input placeholder="🔍  Search rules…" value={rq} onChange={e => setRq(e.target.value)} style={{ width: 260 }} /></div>
              <div className="dt-scroll" style={{ padding: "0 12px 12px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Rule Name", "OT Start After", "Round Off Type", "Rate / Multiplier", "Applicable To", "Status", "Actions"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{otRules === null ? <tr><td style={td} colSpan={7} className="muted">Loading…</td></tr> : otRules.filter(r => !rq.trim() || r.name.toLowerCase().includes(rq.trim().toLowerCase())).map(r => (<tr key={r.id}>
                    <td style={{ ...td, fontWeight: 700 }}>{r.name}</td><td style={td}>{r.start_after ? String(r.start_after).slice(0, 5) : "Site shift end"}</td>
                    <td style={td}>{r.round_type === "custom" ? "Custom" : r.round_type === "nearest_hour" ? "Nearest Hour" : "None"}</td><td style={td}>{fmtX(r.multiplier)}</td>
                    <td style={td}>{[r.apply_labour && "Workers", r.apply_site_staff && "Site Staff", r.apply_office_staff && "Office Staff"].filter(Boolean).join(", ") || "—"}</td>
                    <td style={td}><span style={r.is_active && r.is_eligible ? pillOk : pillOff}>{!r.is_active ? "Inactive" : r.is_eligible ? "Active" : "OT off"}</span></td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{canManage && <><button style={{ ...btnG, padding: "6px 10px", fontSize: 12, marginRight: 6 }} onClick={() => { setErr(""); setRForm({ ...r, multiplier: String(r.multiplier), start_after: r.start_after ? String(r.start_after).slice(0, 5) : "" }); }}>✎ Edit</button><button style={{ ...btnG, padding: "6px 10px", fontSize: 12, color: "#dc2626", borderColor: "#fecaca" }} onClick={() => delRule(r)}>🗑 Delete</button></>}</td>
                  </tr>))}</tbody>
                </table>
              </div>
              <div style={{ padding: "0 12px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8, margin: "6px 0 10px" }}>
                  <div><div style={{ fontWeight: 800, fontSize: 16 }}>OT Round Off Rules</div><div className="muted" style={{ fontSize: 12.5 }}>Define how OT hours will be rounded and calculated.</div></div>
                  {canManage && <button style={{ ...btnG, color: "#1d4ed8", borderColor: "#1d4ed8" }} onClick={() => { setErr(""); setSlabForm({ id: null, from_h: "", from_m: "0", to_h: "", to_m: "0", hours: "" }); }}>＋ Add Round Off Rule</button>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)", gap: 14, alignItems: "start" }}>
                  <div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr>{["Actual OT Hours", "Count as OT Hours", "Action"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                      <tbody>{slabs === null ? <tr><td style={td} colSpan={3} className="muted">Loading…</td></tr> : slabs.map(x => (<tr key={x.id}>
                        <td style={td}>{fmtRange(x.from_min, x.to_min)}</td><td style={td}>{Number(x.count_hours)} hour{Number(x.count_hours) === 1 ? "" : "s"}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{canManage && <><button style={{ ...btnG, padding: "4px 8px", fontSize: 12, marginRight: 4 }} onClick={() => setSlabForm({ id: x.id, from_h: String(Math.floor(x.from_min / 60)), from_m: String(x.from_min % 60), to_h: String(Math.floor(x.to_min / 60)), to_m: String(x.to_min % 60), hours: String(x.count_hours) })}>✎</button><button style={{ ...btnG, padding: "4px 8px", fontSize: 12, color: "#dc2626", borderColor: "#fecaca" }} onClick={() => delSlab(x)}>🗑</button></>}</td>
                      </tr>))}</tbody>
                    </table>
                    {slabForm && (
                      <div style={{ border: "1px solid #c7d7fe", background: "#f8faff", borderRadius: 8, padding: 10, marginTop: 10, fontSize: 13 }}>
                        <b>{slabForm.id ? "Edit slab" : "New slab"}</b>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                          From <input style={{ width: 44 }} placeholder="h" value={slabForm.from_h} onChange={e => setSlabForm(f => ({ ...f, from_h: e.target.value.replace(/\D/g, "") }))} />:<input style={{ width: 44 }} placeholder="m" value={slabForm.from_m} onChange={e => setSlabForm(f => ({ ...f, from_m: e.target.value.replace(/\D/g, "") }))} />
                          to <input style={{ width: 44 }} placeholder="h" value={slabForm.to_h} onChange={e => setSlabForm(f => ({ ...f, to_h: e.target.value.replace(/\D/g, "") }))} />:<input style={{ width: 44 }} placeholder="m" value={slabForm.to_m} onChange={e => setSlabForm(f => ({ ...f, to_m: e.target.value.replace(/\D/g, "") }))} />
                          → count <input style={{ width: 54 }} placeholder="hrs" value={slabForm.hours} onChange={e => setSlabForm(f => ({ ...f, hours: e.target.value.replace(/[^0-9.]/g, "") }))} /> h
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button style={{ ...btnG, padding: "6px 10px" }} onClick={() => setSlabForm(null)}>Cancel</button><button style={{ ...btnB, padding: "6px 12px" }} disabled={busy} onClick={saveSlab}>Save</button></div>
                      </div>)}
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ background: "#eff4ff", border: "1px solid #c7d7fe", borderRadius: 10, padding: 14, fontSize: 13.5, lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 800, color: "#1e40af", marginBottom: 4 }}>🧮 Example Calculation</div>
                      If an employee works 11 hours and 15 minutes on a 9-hour shift (OT = 2 hours 15 minutes)<br />
                      {exSlab ? <>As per rule → <b>{fmtRange(exSlab.from_min, exSlab.to_min)} = {Number(exSlab.count_hours)} OT hours</b><br /><b>So, OT counted = {Number(exSlab.count_hours)} hours</b></> : <>No slab covers 2:15 — the fallback formula counts <b>2 hours</b>.</>}
                    </div>
                    <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.7 }}>
                      <div style={{ fontWeight: 800, color: "#15803d", marginBottom: 4 }}>✅ Important Notes</div>
                      • The round-off slabs above set the OT hours suggested at approval; approval stays manual.<br />
                      • OT is calculated only if OT Eligible is ON (staff: the per-staff toggle on the Staff master).<br />
                      • Today's payroll applies: OT after the site's shift end, rate = daily ÷ divisor (General tab). A rule's fixed start time and rate multiplier are stored here and will be applied to payroll only after Director sign-off — they are not yet used in calculations.<br />
                      • Holiday OT stays at the normal OT rate.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>)}

      {tab === "sunday" && (<>
        <InfoStrip text={INFO.sunday} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 16, alignItems: "start" }}>
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Mark a single Sunday</div>
            <label style={lab}>Sunday{req}</label><select style={{ ...inp, marginBottom: 12 }} value={sForm.on_date} onChange={e => setSForm(f => ({ ...f, on_date: e.target.value }))}><option value="">— pick —</option>{sundaysOf(year).map(d => <option key={d} value={d}>{dmy(d)}</option>)}</select>
            <label style={lab}>Treat as{req}</label><select style={{ ...inp, marginBottom: 12 }} value={sForm.type_code} onChange={e => setSForm(f => ({ ...f, type_code: e.target.value }))}><option value="">Classic (2×/1×)</option>{types.map(t => <option key={t.code} value={t.code}>{typeLabel(t)}</option>)}</select>
            <label style={lab}>Site{req}</label><select style={{ ...inp, marginBottom: 12 }} value={sForm.site} onChange={e => setSForm(f => ({ ...f, site: e.target.value }))}><option value="all">All Sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <label style={lab}>Label</label><input style={{ ...inp, marginBottom: 14 }} placeholder="e.g. Paid Sunday — Navratri" value={sForm.name} onChange={e => setSForm(f => ({ ...f, name: e.target.value }))} />
            <div style={{ display: "flex", gap: 10 }}><button style={{ ...btnG, flex: 1 }} onClick={() => setSForm({ site: "all", on_date: "", type_code: "", name: "" })}>↺ Reset</button><button style={{ ...btnB, flex: 2 }} disabled={busy || !canManage} onClick={saveSpecialSunday}>💾 Save</button></div>
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            <TableCard>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Site", "Sunday policy", "Change"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{sites.map(s => { const code = ruleCode(sun[String(s.id)]); return (<tr key={s.id}><td style={{ ...td, fontWeight: 700 }}>{s.name}</td>
                  <td style={td}><span style={code === "working" ? pillOff : { ...pillOk, background: "#fff3e8", color: "#9a3412" }}>{SUN_CODES.find(x => x[0] === code)[1]}</span></td>
                  <td style={td}>{canManage && <select value={code} disabled={busy} onChange={e => saveSun(s.id, e.target.value)}>{SUN_CODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</td></tr>); })}</tbody>
              </table>
            </TableCard>
            <TableCard>
              <div style={{ fontWeight: 700, padding: "12px 0 6px" }}>Special Sundays {year}</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Sunday", "Name", "Rule Type", "Site", "Actions"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{specialSundays.length === 0 ? <tr><td style={td} colSpan={5} className="muted">None marked.</td></tr> : specialSundays.map(h => <tr key={h.id}><td style={td}>{dmy(h.on_date)}</td><td style={{ ...td, fontWeight: 700 }}>{h.name}</td><td style={td}>{h.type_code ? typeLabel(typeByCode[h.type_code] || { code: h.type_code }) : "Classic"}</td><td style={td}>{(h.site_ids || []).length ? h.site_ids.map(siteName).join(", ") : "All Sites"}</td><td style={td}>{canManage && <button style={{ ...btnG, padding: "6px 10px", fontSize: 12, color: "#dc2626", borderColor: "#fecaca" }} onClick={() => delHol(h)}>🗑 Delete</button>}</td></tr>)}</tbody>
              </table>
            </TableCard>
          </div>
        </div>
      </>)}

      {tab === "festival" && (<>
        <InfoStrip text={INFO.festival} action={canManage && types.length > 0 && <button style={btnO} disabled={busy} onClick={saveCats}>💾 Save Defaults</button>} />
        <TableCard>
          {types.length === 0 ? <div className="muted" style={{ padding: 12 }}>No rule types found — run the update 386 SQL.</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Rule type</th>{CATS.map(([c, l]) => <th key={c} style={th}>{l}<div className="muted" style={{ fontSize: 10.5, fontWeight: 400 }}>worked · absent</div></th>)}</tr></thead>
              <tbody>{types.map(t => (<tr key={t.code}><td style={{ ...td, fontWeight: 700 }}>{typeLabel(t)}<div className="muted" style={{ fontSize: 10.5 }}>{t.code}{t.counts_as_paid_day === false ? " · not a paid day" : ""}</div></td>
                {CATS.map(([c]) => <td key={c} style={{ ...td, whiteSpace: "nowrap" }}><input disabled={!canManage} style={{ width: 54, textAlign: "right" }} value={cats[t.code]?.present?.[c] ?? ""} placeholder={cats[t.code]?.present?.["*"] ?? "—"} onChange={e => setCat(t.code, "present", c, e.target.value)} /> x <span className="muted">·</span> <input disabled={!canManage} style={{ width: 54, textAlign: "right" }} value={cats[t.code]?.absent?.[c] ?? ""} placeholder={cats[t.code]?.absent?.["*"] ?? "—"} onChange={e => setCat(t.code, "absent", c, e.target.value)} /> x</td>)}
              </tr>))}</tbody>
            </table>)}
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>"worked" = multiplier when the person attends; "absent" = pay for a no-show on that holiday (1 = paid holiday, 0 = unpaid). Blank falls back to the type's * default.</div>
        </TableCard>
      </>)}

      {(tab === "worker" || tab === "staff") && (<>
        <InfoStrip text={INFO[tab]} action={canManage && <button style={btnO} onClick={() => { setOForm(blankO(tab)); setErr(""); }}>＋ Add Override</button>} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 16, alignItems: "start" }}>
          {renderOvForm(tab)}
          <TableCard>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 0 4px" }}><span className="muted" style={{ fontSize: 12 }}>From</span><input type="date" value={ovFrom} onChange={e => setOvFrom(e.target.value)} /><span className="muted" style={{ fontSize: 12 }}>to</span><input type="date" value={ovTo} onChange={e => setOvTo(e.target.value)} /></div>
            {renderOvTable(tab)}
          </TableCard>
        </div>
      </>)}

      {tab === "general" && (<>
        <InfoStrip text={INFO.general} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 16, alignItems: "start" }}>
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Payroll settings</div>
            {pay === null ? <div className="muted">Loading…</div> : (<>
              <label style={lab}>Pay period starts on day</label><input style={{ ...inp, marginBottom: 12 }} disabled={!canManage} value={pay.period_start_day ?? ""} onChange={e => setPay(p => ({ ...p, period_start_day: e.target.value.replace(/\D/g, "") }))} />
              <label style={lab}>Period label</label><input style={{ ...inp, marginBottom: 12 }} disabled={!canManage} value={pay.period_label ?? ""} onChange={e => setPay(p => ({ ...p, period_label: e.target.value }))} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={lab}>PT threshold (₹ gross)</label><input style={inp} disabled={!canManage} value={pay.pt_threshold ?? ""} onChange={e => setPay(p => ({ ...p, pt_threshold: e.target.value.replace(/\D/g, "") }))} /></div>
                <div><label style={lab}>PT amount (₹)</label><input style={inp} disabled={!canManage} value={pay.pt_amount ?? ""} onChange={e => setPay(p => ({ ...p, pt_amount: e.target.value.replace(/\D/g, "") }))} /></div>
              </div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>PT applies once per worker per month on total gross across all sites, on the largest-gross site.</div>
              <label style={lab}>OT divisor (company default)</label><input style={{ ...inp, marginBottom: 4 }} disabled={!canManage} value={pay.ot_divisor ?? ""} onChange={e => setPay(p => ({ ...p, ot_divisor: e.target.value.replace(/[^0-9.]/g, "") }))} />
              <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>OT rate per hour = daily rate ÷ divisor (₹800 ÷ 8 = ₹100/h). A site may override below.</div>
              {canManage && <button style={{ ...btnB, width: "100%" }} disabled={busy} onClick={() => savePay({ period_start_day: Number(pay.period_start_day) || 1, period_label: pay.period_label || "Monthly wages", pt_threshold: Number(pay.pt_threshold) || 0, pt_amount: Number(pay.pt_amount) || 0, ot_divisor: Number(pay.ot_divisor) || 8 })}>💾 Save settings</button>}
            </>)}
          </div>
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Copy holidays to another year</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Preview first — nothing is written until you confirm. Same names, dates shifted to the target year; duplicates are skipped.</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div><label style={lab}>From year</label><input style={{ width: 90 }} value={copy.from} onChange={e => setCopy(c => ({ ...c, from: e.target.value.replace(/\D/g, ""), preview: null }))} /></div>
              <div><label style={lab}>To year</label><input style={{ width: 90 }} value={copy.to} onChange={e => setCopy(c => ({ ...c, to: e.target.value.replace(/\D/g, ""), preview: null }))} /></div>
              <button style={btnG} disabled={busy || !canManage} onClick={async () => { setBusy(true); setErr(""); const r = await copyHolidaysYear(copy.from, copy.to, true); setBusy(false); if (!r.ok) { setErr(r.error); return; } setCopy(c => ({ ...c, preview: r.data })); }}>👁 Preview</button>
              <button style={btnB} disabled={busy || !canManage || copy.preview == null} onClick={async () => { if (!window.confirm(`Copy ${copy.from} holidays into ${copy.to}?`)) return; setBusy(true); setErr(""); const r = await copyHolidaysYear(copy.from, copy.to, false); setBusy(false); if (!r.ok) { setErr(r.error); return; } _resetHolidayCache(); setMsg(`Holidays copied to ${copy.to}.`); setCopy(c => ({ ...c, preview: null })); if (Number(copy.to) === year) loadAll(); }}>💾 Copy</button>
            </div>
            {copy.preview != null && <pre style={{ background: "#f8fafc", borderRadius: 8, padding: 10, fontSize: 12, marginTop: 12, maxHeight: 260, overflow: "auto" }}>{Array.isArray(copy.preview) ? copy.preview.map(x => typeof x === "object" ? Object.values(x).join(" · ") : String(x)).join("\n") : JSON.stringify(copy.preview, null, 1)}</pre>}
          </div>
          <div style={{ ...card, gridColumn: "1/-1" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Site working hours &amp; OT divisor</div>
            <div className="dt-scroll"><table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Site", "Shift start", "Shift end", "Std hrs", "Geofence m", "OT divisor", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{sites.map(s => { const d = siteDraft[s.id] || {}; return (<tr key={s.id}>
                <td style={{ ...td, fontWeight: 700 }}>{s.name}</td>
                <td style={td}><input type="time" disabled={!canManage} value={d.shift_start || ""} onChange={e => setSD(s.id, "shift_start", e.target.value)} /></td>
                <td style={td}><input type="time" disabled={!canManage} value={d.shift_end || ""} onChange={e => setSD(s.id, "shift_end", e.target.value)} /></td>
                <td style={td}><input style={{ width: 50 }} disabled={!canManage} value={d.std ?? ""} onChange={e => setSD(s.id, "std", e.target.value)} /></td>
                <td style={td}><input style={{ width: 60 }} disabled={!canManage} value={d.radius ?? ""} onChange={e => setSD(s.id, "radius", e.target.value)} /></td>
                <td style={td}><input style={{ width: 50 }} disabled={!canManage} placeholder={String(pay?.ot_divisor ?? 8)} value={d.ot ?? ""} onChange={e => setSD(s.id, "ot", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
                <td style={td}>{canManage && <button style={{ ...btnB, padding: "6px 10px", fontSize: 12 }} disabled={busy} onClick={async () => { await saveSiteTimes(s); await saveSiteOt(s); }}>💾</button>}</td>
              </tr>); })}</tbody>
            </table></div>
          </div>
        </div>
      </>)}
    </div>
  );
}
