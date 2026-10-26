"use client";
// update477: DPR rebuilt from pipeskool-dpr-mockup.html — free-text work points (no quantity), free-text material,
// no hindrances on the form, Today / Past date / Many days with a required late reason, and the pending-DPR calendar.
// Old DPRs (BOQ-linked work, quantities, hindrances) still render read-only in History.
import { getSession as __gs, setCurrentSite, can } from "@/lib/auth";
import { useEffect, useMemo, useRef, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getManpowerToday, getManpowerOn, submitDPRCore, uploadDPRPhotos, getDprHistory, getAllSitesDprHistory, getTodayDpr,
  saveLateDprs, editDprDay, getRecentDprTexts, getDprDates, getDprMonthStatus, getDprPendingCount, invalidateDprMonths,
  DPR_UNITS, LATE_REASONS, reasonLabel } from "@/lib/dpr";
import { classifyMonth, validateLateEntry, DPR_RANGE_MAX_DAYS, monthBounds, isoDate, fromIso } from "@/lib/dpr-pending.mjs";
import { todayLocal } from "@/lib/today";
import { getSitesList } from "@/lib/mobile";

const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmtD = k => k ? fromIso(k).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
const fmtL = k => k ? fromIso(k).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";
const shift = (k, n) => { const d = fromIso(k); d.setDate(d.getDate() + n); return isoDate(d); };
const blankMat = () => ({ name: "", qty: "", unit: "Nos" });

export default function DPRScreen() {
  if (typeof window !== "undefined" && !__gs()) { window.location.replace("/m"); return null; }
  const sess = typeof window !== "undefined" ? __gs() : null;
  const today = todayLocal(), yesterday = shift(today, -1);
  const [siteId, setSiteId] = useState(() => { const s0 = __gs(); return Number(s0?.currentSite || s0?.sites?.[0]?.id || 1); });
  const pickSite = id => { const n = Number(id); setSiteId(n); setCurrentSite(n); setPicked(new Set()); };
  const [sites, setSites] = useState([]);
  const canBackdate = !!sess && (sess.role === "director" || can(sess, "dpr_backdate", "create", siteId) || can(sess, "dpr", "manage", siteId));
  const [view, setView] = useState(sess?.role === "director" ? "history" : "entry");

  // ---- form state ----
  const [mode, setMode] = useState("today");          // today | past | range | pick | edit
  const [editDate, setEditDate] = useState("");        // edit mode: which existing day
  const [d1, setD1] = useState(yesterday);
  const [d2, setD2] = useState(monthBounds(Number(today.slice(0, 4)), Number(today.slice(5, 7))).from);
  const [d3, setD3] = useState(yesterday);
  const [skipSun, setSkipSun] = useState(true); const [skipDone, setSkipDone] = useState(true);
  const [reason, setReason] = useState(""); const [reasonChip, setReasonChip] = useState("");
  const [reasonErr, setReasonErr] = useState("");
  const [manpower, setManpower] = useState(0); const [mpAuto, setMpAuto] = useState(0); const [mpToday, setMpToday] = useState(0);
  const [works, setWorks] = useState([""]);
  const [mats, setMats] = useState([blankMat()]);
  const [sugW, setSugW] = useState([]); const [sugM, setSugM] = useState([]);
  const [photos, setPhotos] = useState([]); const [existingPhotos, setExistingPhotos] = useState([]);
  const [plan, setPlan] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(""); const toastT = useRef(null);
  const showToast = t => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 4500); };
  const [photoProg, setPhotoProg] = useState(null); const [photoErr, setPhotoErr] = useState(""); const [savedDprId, setSavedDprId] = useState(null);
  const [editingToday, setEditingToday] = useState(false);
  const [existsFor, setExistsFor] = useState(null);   // { date, id } when a single past date already has a DPR
  const [rangeExisting, setRangeExisting] = useState([]);
  const fileRef = useRef(null);
  // render the live form only after mount: session, dates and locale strings differ between server and browser
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    const set = () => { const nav = document.querySelector(".m-nav"); const h = nav ? nav.getBoundingClientRect().height : 0; if (h > 0) document.documentElement.style.setProperty("--dp-nav", h + "px"); };
    const t = [50, 300, 1000].map(ms => setTimeout(set, ms)); window.addEventListener("resize", set);
    return () => { t.forEach(clearTimeout); window.removeEventListener("resize", set); };
  }, [mounted, view]);
  // ---- calendar ----
  const [cal, setCal] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; });
  const [status, setStatus] = useState(null); const [statusErr, setStatusErr] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [pendingNow, setPendingNow] = useState(0);
  // ---- history ----
  const [history, setHistory] = useState([]); const [allHistory, setAllHistory] = useState([]);
  const [histScope, setHistScope] = useState("site"); const [histDate, setHistDate] = useState(""); const [lightbox, setLightbox] = useState(null);

  useEffect(() => { getSitesList().then(setSites); }, []);
  useEffect(() => { getRecentDprTexts(siteId, "work").then(setSugW); getRecentDprTexts(siteId, "material").then(setSugM); }, [siteId]);
  const loadMonth = async (y = cal.y, m = cal.m) => { setStatusErr(""); const r = await getDprMonthStatus(siteId, y, m); if (r?.ok) setStatus(r); else { setStatus(null); setStatusErr(r?.error || ""); } };
  useEffect(() => { loadMonth(); getDprPendingCount(siteId).then(setPendingNow); }, [siteId, cal.y, cal.m]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view === "history") { getDprHistory(siteId).then(setHistory); if (histScope === "all") getAllSitesDprHistory({ date: histDate || null }).then(setAllHistory); } }, [view, histScope, histDate, siteId, savedDprId]);
  // today's DPR → edit-in-place like before
  useEffect(() => {
    getManpowerToday(siteId).then(n => { setMpToday(n); setMpAuto(n); if (mode === "today") setManpower(n); });
    getTodayDpr(siteId).then(t => { setEditingToday(!!t); if (t && mode === "today") fillFrom(t); else if (mode === "today") resetForm(); });
  }, [siteId]);   // eslint-disable-line react-hooks/exhaustive-deps
  // past date: that day's manpower + duplicate check
  useEffect(() => {
    if (mode !== "past" || !d1) return;
    getManpowerOn(siteId, d1).then(n => { setMpAuto(n); setManpower(n); });
    getDprDates(siteId, d1, d1).then(r => setExistsFor(r[0] || null));
  }, [mode, d1, siteId]);
  useEffect(() => { if (mode === "range" && d2 && d3) getDprDates(siteId, d2, d3).then(r => setRangeExisting(r.map(x => x.date))); }, [mode, d2, d3, siteId]);

  function resetForm() { setWorks([""]); setMats([blankMat()]); setPlan(""); setPhotos([]); setExistingPhotos([]); setReason(""); setReasonChip(""); setReasonErr(""); setErr(""); setMsg(""); }
  function fillFrom(t) {
    setWorks((t.work || []).length ? t.work.map(w => w.label + (w.qty != null && w.qty !== "" ? ` — ${w.qty}${w.unit ? " " + w.unit : ""}` : "") + (w.loc ? ` — ${w.loc}` : "")) : [""]);
    setMats((t.materials || []).length ? t.materials.map(m => ({ name: m.name, qty: m.qty ?? "", unit: m.unit || "Nos" })) : [blankMat()]);
    setPlan(t.plan || ""); if (t.manpower != null) setManpower(t.manpower); setExistingPhotos(t.existingPhotos || []); setPhotos([]);
  }
  async function openEdit(date) {
    const t = await getTodayDpr(siteId, date); if (!t) { setErr("That DPR could not be opened."); return; }
    setMode(date === today ? "today" : "edit"); setEditDate(date); fillFrom(t); setExistsFor(null); setView("entry"); setMsg(""); setErr("");
    setTimeout(() => document.getElementById("dpr-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function switchMode(m) {
    if (m !== "today" && !canBackdate) { setErr("You do not have the \"DPR late entries\" right. Ask a Director to enable it under Access Rights."); return; }
    setErr(""); setMsg(""); setMode(m); setEditDate("");
    if (m === "today") { getManpowerToday(siteId).then(n => { setMpAuto(n); setManpower(n); }); getTodayDpr(siteId).then(t => t ? fillFrom(t) : resetForm()); }
    else { if (editingToday || mode === "edit") resetForm(); if (m !== "pick") setPicked(new Set()); }
  }

  // ---- which days does this save cover? ----
  const dates = useMemo(() => {
    if (mode === "today") return [today];
    if (mode === "edit") return [editDate];
    if (mode === "past") return d1 ? [d1] : [];
    if (mode === "pick") return [...picked].sort();
    if (!d2 || !d3 || d2 > d3) return [];
    const out = []; const off = new Set(status && `${cal.y}-${String(cal.m).padStart(2, "0")}` === d2.slice(0, 7) ? status.off : []);
    for (let k = d2; k <= d3; k = shift(k, 1)) { if (skipSun && (fromIso(k).getDay() === 0 || off.has(k))) continue; if (skipDone && rangeExisting.includes(k)) continue; out.push(k); }
    return out;
  }, [mode, today, editDate, d1, d2, d3, picked, skipSun, skipDone, rangeExisting, status, cal]);
  const late = mode === "past" || mode === "range" || mode === "pick";
  const rangeSpan = d2 && d3 && d3 >= d2 ? Math.round((fromIso(d3) - fromIso(d2)) / 864e5) + 1 : 0;
  const rangeTooLong = mode === "range" && rangeSpan > DPR_RANGE_MAX_DAYS;

  // ---- work / material rows ----
  const setWorkAt = (i, v) => setWorks(w => w.map((x, j) => j === i ? v : x));
  const removeWork = i => setWorks(w => w.length > 1 ? w.filter((_, j) => j !== i) : w);
  const addWorkChip = t => setWorks(w => { const i = w.findIndex(x => !x.trim()); if (i >= 0) { const c = [...w]; c[i] = t; return c; } return [...w, t]; });
  const setMatAt = (i, k, v) => setMats(m => m.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const removeMat = i => setMats(m => m.length > 1 ? m.filter((_, j) => j !== i) : m);
  const addMatChip = t => setMats(m => { const i = m.findIndex(x => !x.name.trim()); if (i >= 0) { const c = [...m]; c[i] = { ...c[i], name: t }; return c; } return [...m, { ...blankMat(), name: t }]; });

  function onPhoto(e) {
    const files = Array.from(e.target.files || []);
    navigator.geolocation?.getCurrentPosition(
      p => setPhotos(ph => [...ph, ...files.map(f => ({ file: f, caption: "", lat: p.coords.latitude, lng: p.coords.longitude }))]),
      () => setPhotos(ph => [...ph, ...files.map(f => ({ file: f, caption: "" }))]));
    e.target.value = "";
  }
  const pickReason = r => { setReasonChip(r); setReason(r === "Other" ? "" : r); setReasonErr(""); };

  async function uploadPhotosTo(id) {
    if (!photos.length || !id || id === "demo") { setPhotos([]); return; }
    setSavedDprId(id); setPhotoProg({ done: 0, total: photos.length });
    const r = await uploadDPRPhotos(id, photos, (done, total) => setPhotoProg({ done, total })); setPhotoProg(null);
    if (r.failedFiles.length) { setPhotos(r.failedFiles); setPhotoErr(`${r.failedFiles.length} of ${r.total} photo(s) didn't upload (${r.errors[0]}). Your DPR is saved — tap "Retry photos".`); } else setPhotos([]);
  }
  async function retryPhotos() { if (!savedDprId) return; setPhotoErr(""); await uploadPhotosTo(savedDprId); if (!photos.length) setMsg("All photos uploaded ✓"); }

  async function save() {
    if (busy) return;
    setErr(""); setMsg(""); setPhotoErr(""); setReasonErr("");
    const work = works.map(w => w.trim()).filter(Boolean);
    const materials = mats.filter(m => m.name.trim());
    if (!work.length) { setErr("Add at least one work point."); return; }
    if (materials.some(m => m.qty !== "" && !(Number(m.qty) >= 0))) { setErr("Material quantity must be a number."); return; }
    if (mode === "today" || mode === "edit") {
      if (mode === "today" && (photos.length + existingPhotos.length) < 2) { setErr(`Minimum 2 site photos required (currently ${photos.length + existingPhotos.length}).`); return; }
      if (mode === "today" && !plan.trim()) { setErr("Write one line for tomorrow's plan."); return; }
      setBusy(true);
      const r = mode === "today"
        ? await submitDPRCore(siteId, { manpower, plan, work: work.map(t => ({ activity_text: t })), materials: materials.map(m => ({ name: m.name, qty: m.qty, unit: m.unit })), userId: sess?.id, manpowerSource: manpower === mpAuto ? "attendance" : "manual" })
        : await editDprDay(siteId, editDate, { manpower, plan, work, materials });
      setBusy(false);
      if (!r.ok) { setErr(r.error || "Could not save. Your entries are still here — try again."); return; }
      const okMsg = mode === "today" ? (editingToday ? "DPR updated ✓" : "DPR saved ✓") : `DPR for ${fmtD(editDate)} updated ✓`; setMsg(okMsg); showToast(okMsg);
      await uploadPhotosTo(r.dprId); invalidateDprMonths(siteId); loadMonth(); getDprPendingCount(siteId).then(setPendingNow);
      if (mode === "today") { setEditingToday(true); getTodayDpr(siteId).then(t => t && setExistingPhotos(t.existingPhotos || [])); } else { setSavedDprId(r.dprId); setView("history"); }
      return;
    }
    // late entries (past / range / picked)
    if (rangeTooLong) { setErr(`A range can cover at most ${DPR_RANGE_MAX_DAYS} days — split it into two saves.`); return; }
    const v = validateLateEntry({ dates, reason, work, today });
    if (v) { if (/reason/i.test(v)) { setReasonErr(v); document.getElementById("late-reason")?.focus(); } else setErr(v); return; }
    if (mode === "past" && existsFor) { setErr("A DPR already exists for this date."); return; }
    setBusy(true);
    const r = await saveLateDprs({ siteId, dates, reason, work, materials, plan, skipSundays: skipSun, skipExisting: skipDone, source: mode });
    setBusy(false);
    if (!r.ok) { if (r.code === "exists") { setExistsFor({ date: dates[0], id: r.existing_id }); setErr("A DPR already exists for this date."); } else setErr(r.error || "Nothing was saved. Try again."); return; }
    const n = (r.created || []).length, sk = r.skipped || [];
    const skNote = sk.length ? ` · ${sk.length} skipped (${[...new Set(sk.map(s => s.reason))].join(", ")})` : "";
    const done = n === 1 ? `Late DPR for ${fmtD(r.created[0].date)} saved ✓${skNote}` : `${n} DPRs saved as late entries ✓${skNote}`;
    if (photos.length && n) await uploadPhotosTo(r.created[0].id);   // photos go with the first saved day only
    const savedDates = new Set((r.created || []).map(c => c.date)); setPicked(p => new Set([...p].filter(k => !savedDates.has(k))));
    invalidateDprMonths(siteId); loadMonth(); getDprPendingCount(siteId).then(setPendingNow);
    setSavedDprId((r.created || [])[0]?.id || Date.now()); switchMode("today"); showToast(done); setView("history");
  }

  // ---- calendar helpers ----
  const days = status ? classifyMonth({ year: cal.y, month: cal.m, filled: status.filled, pending: status.pending, off: status.off, today, startDate: status.start_date }) : [];
  const lead = (new Date(cal.y, cal.m - 1, 1).getDay() + 6) % 7;
  const isCurMonth = cal.y === Number(today.slice(0, 4)) && cal.m === Number(today.slice(5, 7));
  const startYM = status?.start_date ? status.start_date.slice(0, 7) : null;
  const canPrev = !startYM || `${cal.y}-${String(cal.m).padStart(2, "0")}` > startYM;
  const prevMonth = () => setCal(c => c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 });
  const nextMonth = () => setCal(c => c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 });
  const togglePick = k => { if (!canBackdate) return; setPicked(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }); };
  const selectAllPending = () => { if (!canBackdate) return; setPicked(p => new Set([...p, ...(status?.pending || [])])); };
  const fillSelected = () => { const a = [...picked].sort(); if (!a.length) return; if (a.length === 1) { setMode("past"); setD1(a[0]); } else setMode("pick"); setEditDate(""); resetForm(); setTimeout(() => document.getElementById("dpr-summary")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
  const setQuick = r => { const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)); if (r === "week") { setD2(shift(today, -7)); setD3(yesterday); } else if (r === "month") { setD2(monthBounds(y, m).from); setD3(yesterday); } else { const pm = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }; const b = monthBounds(pm.y, pm.m); setD2(b.from); setD3(b.to); } };

  const summary = (() => {
    if (mode === "today") return <>Report for <b>today, {fmtD(today)}</b>.</>;
    if (mode === "edit") return <>Editing the DPR of <b>{fmtL(editDate)}</b>. Saving updates that day.</>;
    if (mode === "past") return existsFor ? <>A DPR already exists for <b>{fmtD(d1)}</b>. <a onClick={() => openEdit(d1)} style={{ color: "var(--copper-deep)", textDecoration: "underline", cursor: "pointer" }}>Open it to edit</a></> : dates.length ? <>Late report for <b>{fmtD(d1)}</b>. Will be marked as a late entry.</> : "Pick a date.";
    if (mode === "pick") return <><b>{dates.length} selected day{dates.length > 1 ? "s" : ""}</b>: {dates.map(fmtD).join(", ")}. The same work, material and plan will be saved for each day. Each is marked as a late entry.</>;
    if (rangeTooLong) return <span style={{ color: "var(--red)" }}>This range is {rangeSpan} days — the limit is {DPR_RANGE_MAX_DAYS}. Shorten it.</span>;
    return dates.length ? <><b>{dates.length} day{dates.length > 1 ? "s" : ""}</b> selected ({fmtD(dates[0])} to {fmtD(dates[dates.length - 1])}). The same work, material and plan will be saved for each day. You can edit any day later from History.</> : "No days to fill in this range.";
  })();
  const saveLabel = busy ? "Saving…" : mode === "today" ? (editingToday ? "Update DPR" : "Save DPR") : mode === "edit" ? "Save changes" : dates.length > 1 ? `Save ${dates.length} DPRs` : "Save late DPR";
  const saveDisabled = busy || !!photoProg || !dates.length || rangeTooLong || (mode === "past" && !!existsFor);
  const siteName = sites.find(s => Number(s.id) === Number(siteId))?.name || "this site";
  const CSS = `
.dp-seg{display:flex;gap:8px}.dp-seg button{flex:1;min-height:44px;padding:0 6px;font-size:14px}.dp-seg button.on{background:var(--copper);border-color:var(--copper);color:#fff;font-weight:600}
.dp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.dp-chip{min-height:36px;padding:7px 12px;border:1px solid var(--border);border-radius:20px;background:var(--card,#fff);font-size:13px;color:var(--text)}
.dp-chip.on{background:var(--copper-soft);border-color:var(--copper);color:var(--copper-deep);font-weight:600}
.dp-box{border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--gray-bg);margin-top:10px}
.dp-late{border-color:#f3c7a1;background:var(--copper-soft)}.dp-tag{display:inline-block;background:var(--copper);color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:700;margin-bottom:6px}
.dp-sum{background:var(--card,#fff);border:1px solid var(--border);border-radius:12px;padding:12px;font-size:14px;margin-top:10px}.dp-sum b{color:var(--copper-deep)}
.dp-pt{display:grid;grid-template-columns:24px minmax(0,1fr) 36px;gap:6px;margin-bottom:8px;align-items:center}.dp-pt i{font-style:normal;font-size:13px;color:var(--muted);text-align:center}
.dp-x{border:0;background:transparent;font-size:22px;color:var(--muted);min-height:44px;padding:0}
.dp-mat{display:grid;grid-template-columns:minmax(0,1fr) 72px 84px 36px;gap:6px;margin-bottom:8px;align-items:center}.dp-mat input,.dp-mat select{padding:11px 8px;font-size:14px;width:100%}
.dp-add{background:var(--card,#fff);border:1px dashed var(--copper);color:var(--copper-deep);border-radius:10px;padding:11px;width:100%;font-size:14px;font-weight:600;min-height:44px}
.dp-sw{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;font-size:14px}.dp-sw input{width:22px;height:22px;accent-color:var(--copper)}
.dp-h3{font-size:16px;margin:20px 0 4px}.dp-hint{margin:0 0 10px;font-size:13px;color:var(--muted)}.dp-l{display:block;font-size:13px;color:var(--muted);margin:14px 0 6px}
.dp-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.dp-col{min-width:0}
.dp-sticky{position:fixed;left:50%;transform:translateX(-50%);width:100%;max-width:430px;bottom:max(64px,var(--dp-nav,64px));background:var(--card,#fff);border-top:1px solid var(--border);padding:10px 16px;z-index:35}
.dp-save{width:100%;min-height:50px;border:0;border-radius:12px;background:var(--copper);color:#fff;font-weight:700;font-size:16px}.dp-save:disabled{opacity:.55}
.dp-pend{border:1px solid var(--border);border-radius:12px;padding:12px;margin:12px 0;background:var(--card,#fff)}
.dp-pend .hd{display:flex;align-items:center;justify-content:space-between;gap:6px}.dp-pend .hd button{width:44px;height:44px;font-size:18px;padding:0}.dp-pend .hd button:disabled{opacity:.35}
.dp-pend .mt{font-weight:700;font-size:15px;text-align:center;flex:1}
.dp-cnt{display:inline-block;margin-top:8px;font-size:13px;padding:4px 10px;border-radius:12px;font-weight:700}.dp-cnt.bad{background:var(--red-bg);color:var(--red)}.dp-cnt.good{background:var(--green-bg);color:var(--green)}
.dp-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:10px}.dp-cal .w{font-size:11px;color:var(--muted);text-align:center}
.dp-cal button{aspect-ratio:1;min-height:0;border-radius:9px;border:1px solid var(--border);background:var(--card,#fff);font-size:13px;color:var(--text);padding:0}
.dp-cal button.done{background:var(--green-bg);border-color:#b9e3cb;color:var(--green);font-weight:600}.dp-cal button.pending{background:var(--red-bg);border-color:#f3b7b3;color:var(--red);font-weight:700}
.dp-cal button.off{background:var(--gray-bg);color:var(--muted)}.dp-cal button.future,.dp-cal button.before{border-style:dashed;color:var(--muted);opacity:.7}
.dp-cal button.sel{background:var(--copper);border-color:var(--copper);color:#fff}.dp-cal button.today{outline:2px solid var(--text)}
.dp-leg{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:var(--muted);margin-top:10px}.dp-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px;border:1px solid var(--border)}
.dp-leg .a{background:var(--green-bg)}.dp-leg .b{background:var(--red-bg)}.dp-leg .c{background:var(--gray-bg)}
.dp-fill{display:flex;gap:8px;margin-top:10px}.dp-fill button{min-height:44px;font-weight:700;font-size:14px}.dp-fill .g{flex:0 0 auto}.dp-fill .p{flex:1;background:var(--copper);border-color:var(--copper);color:#fff}.dp-fill .p:disabled{opacity:.5}
.dp-hist{border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:10px}.dp-hist .t{display:flex;justify-content:space-between;gap:8px;font-weight:600;font-size:14px}
.dp-pill{font-size:11px;padding:2px 8px;border-radius:10px;background:var(--copper-soft);color:var(--copper-deep);font-weight:700;white-space:nowrap}.dp-pill.ok{background:var(--green-bg);color:var(--green)}
.dp-rs{font-size:12px;color:#b45309;margin-top:6px}.dp-badge{background:var(--red);color:#fff;font-size:11px;border-radius:10px;padding:1px 7px;margin-left:6px;font-weight:700}
`;

  if (!mounted) return <div className="m-wrap"><style>{CSS}</style><div className="m-head"><div><div className="title">Daily progress report</div><div className="sub">Loading…</div></div></div><MobileNav /></div>;
  return (
    <div className="m-wrap" style={{ paddingBottom: view === "entry" ? 150 : 90 }}>
      <style>{CSS}</style>
      <div className="m-head">
        <div style={{ minWidth: 0 }}>
          <div className="title">Daily progress report{pendingNow > 0 && <span className="dp-badge" title="DPRs pending this month">{pendingNow}</span>}</div>
          <div className="sub">{fmtL(today).replace(/, \d{4}$/, "")} · Manpower today: <b>{mpToday}</b> (auto from attendance)</div>
        </div>
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — form works, data not stored.</div>}
        <label className="dp-l" style={{ marginTop: 0 }}>Site</label>
        <select value={siteId} onChange={e => pickSite(e.target.value)}>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <div className="dp-seg" style={{ marginTop: 12 }}>
          <button className={view === "entry" ? "on" : ""} onClick={() => setView("entry")}>{mode === "edit" ? "Edit DPR" : editingToday && mode === "today" ? "Edit today" : "New entry"}</button>
          <button className={view === "history" ? "on" : ""} onClick={() => setView("history")}>History{history.length ? ` (${history.length})` : ""}</button>
        </div>

        {view === "history" ? (
          <div>
            <div className="dp-seg" style={{ marginTop: 10 }}>
              <button className={histScope === "site" ? "on" : ""} style={{ fontSize: 12.5 }} onClick={() => setHistScope("site")}>This site</button>
              <button className={histScope === "all" ? "on" : ""} style={{ fontSize: 12.5 }} onClick={() => setHistScope("all")}>All sites · date-wise</button>
            </div>
            {histScope === "all" && <div className="m-field" style={{ margin: "10px 0" }}><label>Jump to a date (blank = recent)</label>
              <div style={{ display: "flex", gap: 6 }}><input type="date" value={histDate} max={today} onChange={e => setHistDate(e.target.value)} style={{ flex: 1 }} />{histDate && <button onClick={() => setHistDate("")} style={{ fontSize: 12, whiteSpace: "nowrap" }}>Recent</button>}</div></div>}
            {(histScope === "site" ? history : allHistory).length === 0 && <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>No DPRs yet.</div>}
            {(histScope === "site" ? history : allHistory).map(d => (
              <div key={d.id} className="dp-hist">
                <div className="t"><span>{fmtL(d.date)}{histScope === "all" && <span className="muted" style={{ fontSize: 12 }}> · {d.site}</span>}</span>
                  {"isLate" in d && (d.isLate ? <span className="dp-pill">Late entry</span> : <span className="dp-pill ok">On time</span>)}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Manpower {d.manpower} · {d.work.length} work{d.work.length === 1 ? "" : "s"}{d.materials ? ` · ${d.materials.length} material${d.materials.length === 1 ? "" : "s"}` : ""} · {d.photos.length} photo{d.photos.length === 1 ? "" : "s"}</div>
                {d.isLate && <div className="dp-rs">Reason: {d.lateReason || "—"}. Filled on {fmtD(d.filledAt)}{d.enteredBy ? ` by ${d.enteredBy}` : ""}.</div>}
                {d.work.map((w, i) => <div key={i} style={{ fontSize: 13, marginTop: 4 }}>{i + 1}. {w.activity}{w.qty != null ? ` — ${w.qty}${w.unit ? " " + w.unit : ""}` : ""}{w.loc ? ` — ${w.loc}` : ""}</div>)}
                {d.materials?.length > 0 && <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--muted)" }}>Material: {d.materials.map(m => `${m.name}${m.qty != null ? ` ${m.qty} ${m.unit}` : ""}`).join(", ")}</div>}
                {d.hindrances?.length > 0 && <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--red)" }}>Hindrances: {d.hindrances.map(h => `${reasonLabel(h.reason)} (${h.hours}h)${h.desc ? " — " + h.desc : ""}`).join("; ")}</div>}
                {d.plan && <div style={{ fontSize: 12.5, marginTop: 4, color: "var(--muted)" }}>Plan: {d.plan}</div>}
                {d.photos.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>{d.photos.map((p, i) => p.url && <img key={i} src={p.url} alt="" onClick={() => setLightbox(p.url)} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />)}</div>}
                {histScope === "site" && (d.date === today || canBackdate) && !d.work.some(w => w.linked) && <button style={{ marginTop: 8, fontSize: 12.5 }} onClick={() => openEdit(d.date)}>✎ {d.date === today ? "Edit today's DPR" : "Open to edit"}</button>}
              </div>))}
          </div>
        ) : (<>
          {/* ---- pending DPR calendar ---- */}
          <div className="dp-pend" aria-label="Pending DPR calendar">
            <div className="hd"><button type="button" aria-label="Previous month" disabled={!canPrev} onClick={prevMonth}>‹</button><div className="mt">{MN[cal.m - 1]} {cal.y}</div><button type="button" aria-label="Next month" disabled={isCurMonth} onClick={nextMonth}>›</button></div>
            {statusErr && <div className="note red" style={{ marginTop: 8 }}>{statusErr}</div>}
            {status && <div style={{ textAlign: "center" }}><span className={"dp-cnt " + (status.pending_count ? "bad" : "good")}>{status.pending_count ? `${status.pending_count} DPR pending this month` : "All DPRs filled for this month"}</span></div>}
            <div className="dp-cal">
              {["Mo","Tu","We","Th","Fr","Sa","Su"].map(w => <div key={w} className="w">{w}</div>)}
              {Array.from({ length: lead }, (_, i) => <i key={"l" + i} />)}
              {days.map(d => { const sel = picked.has(d.date); const clickable = d.state === "pending" && canBackdate; return (
                <button key={d.date} type="button" className={d.state + (sel ? " sel" : "") + (d.isToday ? " today" : "")} disabled={!clickable && !sel} aria-pressed={sel}
                  title={d.state === "pending" ? (canBackdate ? "Pending — tap to select" : "Pending — you need the DPR late entries right to fill it") : d.state} onClick={() => togglePick(d.date)}>{d.day}</button>); })}
            </div>
            <div className="dp-leg"><span><i className="a" />DPR filled</span><span><i className="b" />Pending{canBackdate ? ", tap to select" : ""}</span><span><i className="c" />Sunday / holiday</span></div>
            {!canBackdate && status?.pending_count > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>You can see pending days, but filling past dates needs the "DPR late entries" right — ask a Director.</div>}
            {canBackdate && (status?.pending_count > 0 || picked.size > 0) && <div className="dp-fill">
              <button type="button" className="g" onClick={selectAllPending}>Select all pending</button>
              <button type="button" className="p" disabled={!picked.size} onClick={fillSelected}>{picked.size ? `Fill ${picked.size} selected day${picked.size > 1 ? "s" : ""}` : "Tap pending days to select"}</button>
            </div>}
          </div>

          <div id="dpr-form" />
          {mode !== "edit" && <>
            <label className="dp-l">Which day is this report for?</label>
            <div className="dp-seg">
              <button type="button" className={mode === "today" ? "on" : ""} onClick={() => switchMode("today")}>Today</button>
              <button type="button" className={mode === "past" ? "on" : ""} onClick={() => switchMode("past")}>Past date</button>
              <button type="button" className={mode === "range" || mode === "pick" ? "on" : ""} onClick={() => switchMode("range")}>Many days</button>
            </div>
          </>}
          {late && <div className="dp-box dp-late">
            <span className="dp-tag">LATE ENTRY</span>
            {mode === "past" && <><label className="dp-l" style={{ marginTop: 0 }}>Date</label><input type="date" value={d1} max={yesterday} onChange={e => { setD1(e.target.value); setExistsFor(null); }} /></>}
            {mode === "range" && <>
              <div className="dp-row2"><div className="dp-col"><label className="dp-l" style={{ marginTop: 0 }}>From</label><input type="date" value={d2} max={yesterday} onChange={e => setD2(e.target.value)} /></div><div className="dp-col"><label className="dp-l" style={{ marginTop: 0 }}>To</label><input type="date" value={d3} max={yesterday} onChange={e => setD3(e.target.value)} /></div></div>
              <div className="dp-chips" style={{ marginTop: 10 }}><button type="button" className="dp-chip" onClick={() => setQuick("week")}>Last 7 days</button><button type="button" className="dp-chip" onClick={() => setQuick("month")}>This month so far</button><button type="button" className="dp-chip" onClick={() => setQuick("prev")}>Last month</button></div>
              <label className="dp-sw"><span>Skip Sundays &amp; holidays</span><input type="checkbox" checked={skipSun} onChange={e => setSkipSun(e.target.checked)} /></label>
              <label className="dp-sw"><span>Skip days that already have a DPR</span><input type="checkbox" checked={skipDone} onChange={e => setSkipDone(e.target.checked)} /></label>
            </>}
            {mode === "pick" && <div style={{ fontSize: 13 }}>Days picked from the calendar: <b>{dates.map(fmtD).join(", ")}</b>. <a onClick={() => { setPicked(new Set()); switchMode("today"); }} style={{ color: "var(--copper-deep)", textDecoration: "underline", cursor: "pointer" }}>Clear</a></div>}
            <label className="dp-l">Why is it being filled late? <span style={{ color: "var(--red)" }}>*</span></label>
            <div className="dp-chips">{LATE_REASONS.map(r => <button type="button" key={r} className={"dp-chip" + (reasonChip === r ? " on" : "")} onClick={() => pickReason(r)}>{r}</button>)}</div>
            <textarea id="late-reason" value={reason} onChange={e => { setReason(e.target.value); setReasonErr(""); }} placeholder="Add a short reason (required)" rows={2} style={{ width: "100%" }} />
            {reasonErr && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{reasonErr}</div>}
          </div>}
          <div className="dp-sum" id="dpr-summary">{summary}</div>

          <label className="dp-l">Manpower {mode === "range" || mode === "pick" ? "(auto from each day's attendance — 0 is stored and flagged where no attendance exists)" : mode === "past" ? "for that day (auto from attendance, edit if needed)" : "today (auto from attendance, edit if needed)"}</label>
          {mode === "range" || mode === "pick" ? <div className="dp-box" style={{ marginTop: 0, fontSize: 13 }}>Each day takes its own attendance count.</div>
            : <input type="number" inputMode="numeric" value={manpower} onChange={e => setManpower(Number(e.target.value) || 0)} />}

          <h3 className="dp-h3">Work done</h3><p className="dp-hint">Point-wise likhiye: kya kaam hua aur kahan hua. Quantity nahi likhni.</p>
          {works.map((w, i) => <div key={i} className="dp-pt"><i>{i + 1}</i><input value={w} onChange={e => setWorkAt(i, e.target.value)} placeholder="e.g. 110mm PVC pipe laying, Block A basement" /><button type="button" className="dp-x" aria-label="Remove point" onClick={() => removeWork(i)}>×</button></div>)}
          {sugW.length > 0 && <div className="dp-chips"><span className="muted" style={{ width: "100%", fontSize: 12 }}>Used recently, tap to add:</span>{sugW.map(t => <button type="button" key={t} className="dp-chip" onClick={() => addWorkChip(t)}>{t}</button>)}</div>}
          <button type="button" className="dp-add" onClick={() => setWorks(w => [...w, ""])}>+ Add another point</button>

          <h3 className="dp-h3">Material used</h3><p className="dp-hint">Type the material name and quantity used. Optional.</p>
          {mats.map((m, i) => <div key={i} className="dp-mat"><input value={m.name} onChange={e => setMatAt(i, "name", e.target.value)} placeholder="Material, e.g. 110mm PVC pipe" /><input type="number" inputMode="decimal" step="any" value={m.qty} onChange={e => setMatAt(i, "qty", e.target.value)} placeholder="Qty" /><select value={m.unit} onChange={e => setMatAt(i, "unit", e.target.value)}>{DPR_UNITS.map(u => <option key={u}>{u}</option>)}</select><button type="button" className="dp-x" aria-label="Remove material" onClick={() => removeMat(i)}>×</button></div>)}
          {sugM.length > 0 && <div className="dp-chips"><span className="muted" style={{ width: "100%", fontSize: 12 }}>Used recently, tap to add:</span>{sugM.map(t => <button type="button" key={t} className="dp-chip" onClick={() => addMatChip(t)}>{t}</button>)}</div>}
          <button type="button" className="dp-add" onClick={() => setMats(m => [...m, blankMat()])}>+ Add another material</button>

          <h3 className="dp-h3">Site photos <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400 }}>{mode === "today" ? "(min 2, geo-tagged)" : "(optional for past dates)"}</span>{(photos.length + existingPhotos.length) > 0 && <span className="badge p" style={{ marginLeft: 6 }}>{photos.length + existingPhotos.length}</span>}</h3>
          {existingPhotos.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{existingPhotos.map((p, i) => p.url && <img key={i} src={p.url} alt="" onClick={() => setLightbox(p.url)} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />)}</div>}
          {photos.map((p, i) => <div key={i} className="photo-chip"><span className="badge gray">📷 {i + 1}{p.lat != null ? " · geo" : ""}</span><input placeholder="Caption (optional)" value={p.caption} onChange={e => setPhotos(ph => ph.map((r, j) => j === i ? { ...r, caption: e.target.value } : r))} style={{ flex: 1 }} /></div>)}
          <button type="button" onClick={() => fileRef.current?.click()} style={{ fontSize: 13, minHeight: 44 }}>📷 Take photo</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPhoto} />
          {late && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>For past dates, photos are optional.{mode !== "past" ? " In a multi-day save they are attached to the first day only." : ""}</div>}

          <h3 className="dp-h3">Tomorrow&apos;s plan (one line)</h3>
          <input value={plan} onChange={e => setPlan(e.target.value)} placeholder="e.g. Continue Bay-5 erection Grid F-H" />
          {(late || mode === "edit") && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>For past dates this is the plan you made on that day. Leave blank if not known.</div>}

          {err && <div className="note red" role="alert">{err}</div>}
          {msg && <div className="note green" role="status">{msg}</div>}
          {photoProg && <div className="note amber">Uploading photos… {photoProg.done}/{photoProg.total} (your DPR is already saved)</div>}
          {photoErr && <div><div className="note red">{photoErr}</div><button className="btn-block" onClick={retryPhotos} disabled={!!photoProg}>Retry photos ({photos.length})</button></div>}
          <div className="dp-sticky"><button type="button" className="dp-save" onClick={save} disabled={saveDisabled}>{saveLabel}</button></div>
        </>)}
      </div>
      {toast && <div role="status" style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", background: "#14161a", color: "#fff", padding: "10px 16px", borderRadius: 10, fontSize: 13, zIndex: 210, maxWidth: "min(380px, 92vw)" }}>{toast}</div>}
      {lightbox && <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}><img src={lightbox} alt="" style={{ maxWidth: "92%", maxHeight: "85%", borderRadius: 8 }} /></div>}
      <MobileNav />
    </div>
  );
}
