"use client";
// update479: data for the IT Executive's Attendance Register (app/attendance → components/ITAttendanceRegister.js).
// Every number comes from two database functions (pipeskool_it_attendance_register.sql):
//   fn_att_it_summary(date, site)  → every chart / instrument in ONE payload, aggregated in SQL
//   fn_att_it_register(…)          → one page of the register, filtered / sorted / counted in SQL
//   fn_att_it_verify(ids)          → verify (who + when + audit row per record), idempotent
// The database refuses any caller who is not an IT Executive (403) and narrows everything to the caller's assigned
// sites, so this file never decides scope — it only caches for ≤ 30 s and invalidates after every action.
import { supabase, isDemo } from "./supabase";
import { fileStore } from "./files";

const TTL = 30_000;
const cache = new Map();   // key → { at, p: Promise }
export function invalidateItAtt() { cache.clear(); }
function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = fn().then(r => { if (r?.error) cache.delete(key); return r; }, e => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), p });
  return p;
}
const siteArg = s => (s && s !== "all" ? Number(s) : null);
export const FORBIDDEN = "403 — this view is for the IT Executive role only.";
function errText(error) {
  const m = error?.message || String(error || "");
  if (error?.code === "42501" || /IT Executive role only|permission denied|Login required/i.test(m)) return FORBIDDEN;
  if (/fn_att_it_|schema cache/i.test(m)) return "Run pipeskool_it_attendance_register.sql (update 479) in Supabase first.";
  return m || "Request failed";
}

/** All chart / instrument figures for a date and site scope. { ok, error? , ...payload } */
export async function getItAttSummary(date, siteId) {
  if (isDemo) return { ok: false, error: "Demo mode: the IT register needs the live database." };
  return cached("sum|" + date + "|" + siteArg(siteId), async () => {
    const { data, error } = await supabase.rpc("fn_att_it_summary", { p_date: date, p_site_id: siteArg(siteId) });
    if (error) return { ok: false, error: errText(error), status: error.code === "42501" ? 403 : 500 };
    return data || { ok: false, error: "Empty response" };
  });
}

/** One page of the register. q = { tab, filters:{search,category,contractor,site_id,status,punch,verify}, sort, dir, offset, limit } */
export async function getItAttRegister(date, siteId, q = {}) {
  if (isDemo) return { ok: false, error: "Demo mode: the IT register needs the live database." };
  const args = { p_date: date, p_site_id: siteArg(siteId), p_tab: q.tab || "labour", p_f: q.filters || {}, p_sort: q.sort || "in", p_dir: q.dir || "asc", p_offset: q.offset || 0, p_limit: q.limit == null ? 25 : q.limit };
  return cached("reg|" + JSON.stringify(args), async () => {
    const { data, error } = await supabase.rpc("fn_att_it_register", args);
    if (error) return { ok: false, error: errText(error), status: error.code === "42501" ? 403 : 500 };
    const d = data || { ok: false, error: "Empty response" };
    if (d.rows) d.rows = d.rows.map(rowView);
    return d;
  });
}

/** every pending id in the filtered view (for "Verify visible") */
export async function getItAttPendingIds(date, siteId, q = {}) {
  const r = await getItAttRegister(date, siteId, { ...q, offset: 0, limit: 0 });
  return r.ok ? (r.ids || []).map(Number) : [];
}

/** every row of the filtered view, 1,000 at a time (Export) */
export async function getItAttAllRows(date, siteId, q = {}) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await getItAttRegister(date, siteId, { ...q, offset: off, limit: 1000 });
    if (!r.ok) return { ok: false, error: r.error };
    out.push(...(r.rows || []));
    if (!r.rows || r.rows.length < 1000) break;
  }
  return { ok: true, rows: out };
}

const photoUrl = p => { if (!p) return null; if (/^https?:/.test(p)) return p; try { return fileStore.from("attendance-photos").getPublicUrl(p).data.publicUrl; } catch { return null; } };
/** the same field names the current register uses (DataTable columns) + the extras this view adds */
function rowView(r) {
  return {
    id: r.id, workerId: r.worker_id, worker: r.worker || "", category: r.category || "", contractor: r.contractor || "",
    site: r.site || "", site_id: r.site_id, out_site_id: r.out_site_id, in_dist: r.in_dist, out_dist: r.out_dist,
    in: r.in_hm || "—", out: r.out_hm || "—", inMin: r.in_min, late: !!r.late, shiftStart: r.shift_start, shiftMin: r.shift_min,
    hours: r.hours, status: r.status, review_status: r.review_status, auto_closed: !!r.auto_closed, site_manual: !!r.site_manual,
    ot: Number(r.ot || 0), otApproved: !!r.ot_approved, otApprovedHours: r.ot_approved_hours == null ? null : Number(r.ot_approved_hours), otEligible: r.ot_eligible !== false,
    punch: r.punch, verify: r.verify, photoIn: photoUrl(r.photo_in), photoOut: photoUrl(r.photo_out), isStaff: !!r.is_staff, isOffice: !!r.is_office,
  };
}

/** Verify rows (same right and state change as the current register, plus who/when + audit). Idempotent. */
export async function itVerifyRows(ids) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const list = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (!list.length) return { ok: true, verified: 0 };
  const { data, error } = await supabase.rpc("fn_att_it_verify", { p_ids: list });
  invalidateItAtt();
  if (error) return { ok: false, error: errText(error) };
  return data?.ok ? { ok: true, verified: Number(data.verified || 0) } : { ok: false, error: data?.error || "Could not verify." };
}

export const hm = m => (m == null || isNaN(m)) ? "--:--" : String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
export const toMin = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const ddmmyyyy = iso => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) ? iso.slice(8, 10) + "-" + iso.slice(5, 7) + "-" + iso.slice(0, 4) : iso || "";
export const shiftDate = (iso, days) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + days); return d.toLocaleDateString("en-CA"); };
