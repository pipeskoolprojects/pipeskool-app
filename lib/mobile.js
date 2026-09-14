"use client";
import { supabase, isDemo } from "./supabase";
import { getHolidaysBetween } from "./holidays";   // update345
import { getPayrollSettings } from "./payrollSettings";   // update345
import { todayLocal } from "./today";
import { assignedSiteIds } from "./auth";

// ---------- Geofence ----------
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = d => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),   // update224: accuracy for the punch screen
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export async function getSiteGeo(siteId) {
  if (isDemo || !siteId) return null;
  const { data } = await supabase.from("sites").select("geofence_lat, geofence_lng, geofence_radius_m").eq("id", siteId).maybeSingle();
  return data || null;
}

// ---------- Local session (v1 simple login; OTP upgrade later) ----------
export function getLocalWorker() {
  try { return JSON.parse(localStorage.getItem("psk_worker")); } catch { return null; }
}
export function setLocalWorker(w) { localStorage.setItem("psk_worker", JSON.stringify(w)); }

const todayKey = () => "psk_punch_" + todayLocal();

// ---------- Worker login by mobile ----------
export async function findWorkerByMobile(mobile) {
  if (isDemo) {
    return { id: 1, full_name: "Ramesh Yadav", category: "plumber",
      site_id: 1, site_name: "KEI Industries, Sanand",
      geofence_lat: null, geofence_lng: null, geofence_radius_m: 250, profile_complete: false };
  }
  // Hardening P2: workers have no login, so lookup runs through a narrow
  // SECURITY DEFINER function — direct table access for anon is closed.
  const { data: rw, error: re } = await supabase.rpc("fn_worker_lookup", { p_mobile: String(mobile).trim() });
  if (!re && rw) return rw;
  // fallback for the brief window between SQL run and code deploy
  const { data: rows, error } = await supabase
    .from("workers")
    .select("id, full_name, category, site_id, is_active, profile_complete, sites!workers_site_id_fkey(name, geofence_lat, geofence_lng, geofence_radius_m)")
    .eq("mobile", String(mobile).trim())
    .order("is_active", { ascending: false }).limit(1);
  const data = rows?.[0];
  if (error || !data) return null;
  return {
    id: data.id, full_name: data.full_name, category: data.category,
    site_id: data.site_id, site_name: data.sites?.name,
    geofence_lat: data.sites?.geofence_lat, geofence_lng: data.sites?.geofence_lng,
    geofence_radius_m: data.sites?.geofence_radius_m || 200,
    profile_complete: data.profile_complete,
  };
}

// ---------- Today's punch state for a worker ----------
export async function getTodayPunch(workerId) {
  if (isDemo) {
    try { return JSON.parse(localStorage.getItem(todayKey())) || {}; } catch { return {}; }
  }
  const { data: rt, error: te } = await supabase.rpc("fn_worker_today", { p_worker_id: workerId });
  if (!te && rt) return rt;
  const today = todayLocal();
  const { data } = await supabase.from("attendance")
    .select("id, punch_in, punch_out, hours_worked, status, ot_hours")
    .eq("worker_id", workerId).eq("att_date", today).maybeSingle();
  return data || {};
}

// ---------- Punch in / out ----------
export async function punch(worker, pos, selfieFile) {
  const today = todayLocal();
  const now = new Date().toISOString();
  if (isDemo) {
    const cur = (() => { try { return JSON.parse(localStorage.getItem(todayKey())) || {}; } catch { return {}; } })();
    const next = !cur.punch_in
      ? { punch_in: now }
      : { ...cur, punch_out: now, hours_worked: 9.1, status: "present", ot_hours: 1.1 };
    localStorage.setItem(todayKey(), JSON.stringify(next));
    return { ok: true, data: next };
  }
  let selfieUrl = null;
  if (selfieFile) {
    const path = `selfies/${worker.id}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("attendance-photos").upload(path, selfieFile);
    if (!upErr) selfieUrl = path;
  }
  // Hardening P2: the punch itself is validated and written server-side.
  const { data: pr, error: pe } = await supabase.rpc("fn_worker_punch", {
    p_worker_id: worker.id, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_selfie_path: selfieUrl,
    p_site_id: worker.punch_site_id ?? worker.site_id ?? null,   // update168: chosen allotted site (validated server-side)
  });
  if (!pe && pr) {
    // update344: fn_worker_punch is left exactly as it is — it does the GPS radius check,
    // the allotted-site validation and the selfie handling, and is the last thing worth
    // rewriting blind. The punch-OUT site is recorded by a separate, additive call, and a
    // failure here never fails the punch itself.
    if (pr.ok && pr.data?.punch_out) {
      const site = worker.punch_site_id ?? worker.site_id ?? null;
      if (site) { try { await supabase.rpc("fn_set_punch_out_site", { p_worker_id: worker.id, p_site_id: Number(site) }); } catch { /* ignore */ } }
    }
    return pr.ok ? { ok: true, data: pr.data } : { ok: false, error: pr.error };
  }
  const existing = await getTodayPunch(worker.id);
  if (!existing.id) {
    const { data, error } = await supabase.from("attendance").insert({
      worker_id: worker.id, site_id: worker.site_id, att_date: today,
      punch_in: now, punch_in_lat: pos?.lat, punch_in_lng: pos?.lng,
      punch_in_selfie_url: selfieUrl, punch_type: "self",
    }).select().single();
    return error ? { ok: false, error: error.message } : { ok: true, data };
  }
  if (!existing.punch_out) {
    const outSite = worker.punch_site_id ?? worker.site_id ?? null;   // update344
    const { data, error } = await supabase.from("attendance").update({
      punch_out: now, punch_out_lat: pos?.lat, punch_out_lng: pos?.lng,
      punch_out_selfie_url: selfieUrl,
      // only stored when it actually differs from where the day was opened
      ...(outSite && Number(outSite) !== Number(existing.site_id) ? { punch_out_site_id: Number(outSite) } : {}),
    }).eq("id", existing.id).select().single();
    return error ? { ok: false, error: error.message } : { ok: true, data };
  }
  return { ok: false, error: "Already punched out today." };
}

// ---------- Supervisor: today's muster ----------
const demoMuster = [
  { id: 1, name: "Ramesh Yadav", cat: "Plumber", lab: "Own", in: "08:02", out: "18:10", status: "present", punch: "self", verify: "pending" },
  { id: 2, name: "Sunil Kumar", cat: "Fitter", lab: "RK Labour Co.", in: "08:15", out: null, status: null, punch: "proxy", verify: "pending" },
  { id: 3, name: "Amit Sharma", cat: "Helper", lab: "RK Labour Co.", in: "08:05", out: "12:40", status: "half_day", punch: "self", verify: "pending" },
  { id: 4, name: "Vijay Patel", cat: "Welder", lab: "Own", in: null, out: null, status: null, punch: null, verify: "pending" },
  { id: 5, name: "Dinesh Rao", cat: "Operator", lab: "Own", in: null, out: null, status: "absent", punch: "self", verify: "pending" },
];

// update186: muster is GLOBAL per worker — today's attendance is fetched by worker, not by
// site, so a worker punched at another site shows "Present at <site>" here and can't be
// marked absent/duplicated. Absent marks come from attendance_absent_marks (own table).
export async function getMuster(siteId) {
  // update286: siteId may be ONE id or an ARRAY of ids (combined multi-site muster).
  const sids = (Array.isArray(siteId) ? siteId : [siteId]).map(Number);
  if (isDemo) {
    try { return JSON.parse(localStorage.getItem("psk_muster")) || demoMuster; }
    catch { return demoMuster; }
  }
  const today = todayLocal();
  // update286b: workers -> sites resolves TWO ways (home-site FK and the worker_sites allotment
  // table), so the embed MUST name the FK — without it PostgREST rejects the whole query and the
  // muster silently showed 0 workers. Errors now surface instead of vanishing.
  const { data: workers, error: wErr } = await supabase.from("workers")
    .select("id, full_name, category, labour_type, daily_wage, ot_eligible, site_id, sites!workers_site_id_fkey(name), contractors(name)")
    .in("site_id", sids).eq("is_active", true).order("full_name");
  if (wErr) throw new Error("Could not load workers: " + wErr.message);
  const ids = (workers || []).map(w => w.id);
  if (!ids.length) return [];
  const [{ data: att }, { data: marks, error: mErr }] = await Promise.all([
    supabase.from("attendance")
      .select("id, worker_id, site_id, punch_in, punch_out, hours_worked, status, punch_type, verify_status, ot_hours, ot_approved, ot_approved_hours, site_manual, proxy_marked_by, sites!attendance_site_id_fkey(name)")   // update286/287
      .in("worker_id", ids).eq("att_date", today),
    supabase.from("attendance_absent_marks").select("id, worker_id, reason, marked_at, app_users(full_name)").in("worker_id", ids).eq("att_date", today),
  ]);
  const t = ts => ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : null;
  return (workers || []).map(w => {
    const a = (att || []).find(x => x.worker_id === w.id) || {};
    const m = mErr ? null : (marks || []).find(x => x.worker_id === w.id) || null;
    const elsewhere = a.id && !sids.includes(Number(a.site_id));   // update286: outside ALL shown sites
    return {
      id: w.id, name: w.full_name, wage: Number(w.daily_wage || 0), otEligible: w.ot_eligible !== false,
      cat: w.category?.charAt(0).toUpperCase() + w.category?.slice(1),
      lab: w.labour_type === "contractor" ? (w.contractors?.name || "Contractor") : "Own",
      in: t(a.punch_in), out: t(a.punch_out), hours: a.hours_worked == null ? null : Number(a.hours_worked),
      status: a.status || null, punch: a.punch_type || null,
      verify: a.id ? (a.verify_status || "pending") : null, attId: a.id || null,
      ot: Number(a.ot_hours || 0), otApproved: !!a.ot_approved, otApprovedHours: a.ot_approved_hours == null ? null : Number(a.ot_approved_hours),
      elsewhere: elsewhere ? { site: a.sites?.name || ("Site " + a.site_id), time: t(a.punch_in) } : null,
      absentMark: m ? { id: m.id, reason: m.reason, by: m.app_users?.full_name || "", at: t(m.marked_at) } : null,
      homeSiteId: Number(w.site_id), homeSite: w.sites?.name || "", attSiteId: a.id ? Number(a.site_id) : null, attSite: a.sites?.name || "", siteManual: !!a.site_manual, proxyBy: a.proxy_marked_by || "",   // update286/287
      marksUnavailable: !!mErr,
    };
  });
}

export async function markAbsent(workerId, siteId, byUser, reason) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("attendance_absent_marks")
    .insert({ worker_id: workerId, site_id: siteId, att_date: todayLocal(), marked_by: byUser || null, reason: reason || null });
  if (error) {
    if (/row-level security/i.test(error.message)) return { ok: false, error: "Cannot mark absent — this worker already has attendance today (at this or another site), or you lack attendance rights here." };
    if (/does not exist|schema cache/i.test(error.message)) return { ok: false, error: "Absent marks not enabled yet — run pipeskool_muster_absent.sql." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
export async function unmarkAbsent(markId) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("attendance_absent_marks").delete().eq("id", markId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// one row verify (row stays locked afterwards unless attendance.manage / Director)
export async function verifyOne(attId) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("attendance")
    .update({ verify_status: "verified", verified_at: new Date().toISOString() }).eq("id", attId).eq("verify_status", "pending");
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Worker month detail for the supervisor's worker sheet (any site the worker punched at)
export async function getWorkerMonth(workerId, ym) {   // ym = "2026-08"
  if (isDemo) return null;
  const from = ym + "-01";
  const [y, m] = ym.split("-").map(Number);
  const to = new Date(y, m, 1).toISOString().slice(0, 10);   // first day of next month
  // update345: the slip needs the holiday list and the weekly-off rule to tell a real
  // absence apart from a day nobody was expected to work.
  const [{ data: w }, { data: att }, { data: pay }, { data: marks }, hols, pset] = await Promise.all([
    supabase.from("workers").select("id, full_name, mobile, category, labour_type, daily_wage, ot_eligible, site_id, created_at, auth_id, sites!workers_site_id_fkey(name, std_working_hours), contractors(name)").eq("id", workerId).single(),   // update309: auth_id for staff detection
    supabase.from("attendance").select("id, att_date, site_id, punch_in, punch_out, hours_worked, status, ot_hours, ot_approved, ot_approved_hours, punch_type, verify_status, sites!attendance_site_id_fkey(name)")
      .eq("worker_id", workerId).gte("att_date", from).lt("att_date", to).order("att_date"),
    supabase.from("wage_payouts").select("pay_month, days_full, days_half, ot_hours, daily_rate, ot_rate, gross, advances_deducted, net, status, pay_mode").eq("worker_id", workerId).order("pay_month", { ascending: false }).limit(6),
    supabase.from("attendance_absent_marks").select("att_date, reason, sites(name), app_users(full_name)")
      .eq("worker_id", workerId).gte("att_date", from).lt("att_date", to).order("att_date").then(r => r, () => ({ data: [] })),
    getHolidaysBetween(from, to).catch(() => []),
    getPayrollSettings().catch(() => ({})),
  ]);
  if (!w) return null;
  const otOn = w.ot_eligible !== false;
  const stdHrs = Number(w.sites?.std_working_hours) || 8;
  const rate = Number(w.daily_wage || 0), otRate = stdHrs ? Math.round((rate / stdHrs) * 100) / 100 : 0;
  const t = ts => ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
  // update381: staff-pay lookup was silently returning null for Kishan even though his
  // Staff Master record is right there. Two failure modes we've hit before:
  //   a) RLS on app_users refused the read for whoever was signed in — swallowed by the
  //      try/catch, staffPay ends up null, header falls back to labour daily_wage.
  //   b) Mobile string on workers and app_users don't match byte-for-byte (whitespace,
  //      +91 prefix, hyphens), so the .or filter finds nothing.
  // Both fixed at the DB via SECURITY DEFINER fn_staff_pay_for_worker (see
  // pipeskool_staff_pay_lookup.sql). We also stop swallowing errors — the resolver's
  // failure now surfaces in staffPayError so the slip can print a red banner instead of
  // silently reverting to labour numbers.
  // update381b: 381 shipped the client change without a runtime fallback for when the
  // definer RPC does not exist yet (the SQL is applied separately). If a build reaches
  // Vercel before pipeskool_staff_pay_lookup.sql runs, every worker profile hangs on
  // "Loading…" because this call throws. Now: try the RPC first, silently fall back to
  // the pre-381 direct lookup with normalisation done client-side. Either path works,
  // and the screen never breaks because a new SQL file hasn't been applied yet.
  const normMobile = (m) => {
    let x = String(m || "").replace(/\D+/g, "");
    if (x.length === 12 && x.startsWith("91")) x = x.slice(2);
    else if (x.length === 11 && x.startsWith("0")) x = x.slice(1);
    return x || null;
  };
  const parseSalary = (v) => {
    const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  let staffPay = null;
  let staffPayError = null;
  try {
    const { data, error } = await supabase.rpc("fn_staff_pay_for_worker", { p_worker_id: Number(workerId) });
    if (error) {
      // RPC missing (function-not-found), permission-denied, or any other server error:
      // fall through to the direct read below rather than break the whole page.
      staffPayError = error.message || String(error);
    } else if (data && parseSalary(data.monthly_salary) > 0) {
      const dd = new Date(ym + "-01");
      const dim = new Date(dd.getFullYear(), dd.getMonth() + 1, 0).getDate();
      const sal = parseSalary(data.monthly_salary);
      staffPay = { salary: sal, perDay: Math.round(sal / dim * 100) / 100, isStaff: true,
        matchedBy: data.matched_by || null, staffUserId: data.staff_user_id || null, staffName: data.staff_name || null };
    }
  } catch (e) {
    staffPayError = e?.message || String(e);
  }
  if (!staffPay && (w.auth_id || w.mobile)) {
    // fallback: same shape as pre-381, but with client-side mobile normalisation and
    // salary parsing so the two known data hazards (whitespace, comma) don't matter.
    try {
      const parts = [];
      if (w.auth_id) parts.push(`auth_id.eq.${w.auth_id}`);
      const norm = normMobile(w.mobile);
      if (norm) parts.push(`mobile.eq.${norm}`, `mobile.eq.${w.mobile}`);
      const { data: rows } = await supabase.from("app_users")
        .select("id, full_name, role, monthly_salary, mobile, auth_id")
        .or(parts.join(","))
        .eq("is_active", true).limit(20);
      const pick = (rows || []).find(r =>
        (r.auth_id && r.auth_id === w.auth_id) || normMobile(r.mobile) === norm);
      const sal = pick ? parseSalary(pick.monthly_salary) : 0;
      if (pick && sal > 0) {
        const dd = new Date(ym + "-01");
        const dim = new Date(dd.getFullYear(), dd.getMonth() + 1, 0).getDate();
        staffPay = { salary: sal, perDay: Math.round(sal / dim * 100) / 100, isStaff: true,
          matchedBy: pick.auth_id === w.auth_id ? "auth_id" : "mobile",
          staffUserId: pick.id, staffName: pick.full_name };
        // an RPC error is no longer worth showing if the fallback resolved everything
        if (staffPay) staffPayError = null;
      }
    } catch {}
  }
  const days = (att || []).map(a => ({ id: a.id, date: a.att_date, site: a.sites?.name || "", in: t(a.punch_in), out: t(a.punch_out),
    hours: Number(a.hours_worked || 0), status: a.status || (a.punch_in ? "on site" : "—"), ot: Number(a.ot_hours || 0),
    otApproved: a.ot_approved ? Number(a.ot_approved_hours || 0) : 0, punch: a.punch_type, verify: a.verify_status }));
  const present = days.filter(d => d.status === "present").length, half = days.filter(d => d.status === "half_day").length;
  const absentRows = days.filter(d => d.status === "absent").length;
  const today = todayLocal();
  const lastDay = to > today ? Number(today.slice(8, 10)) : new Date(y, m, 0).getDate();

  // update345: ABSENCE WAS BEING OVER-COUNTED. It used to be (days elapsed − attendance
  // rows), which silently called three different things an absence:
  //   · SUNDAYS / the weekly off — nobody was expected in
  //   · COMPANY HOLIDAYS — the office was shut
  //   · TODAY — before the person has even punched
  // Lakshman showed "Absent 2" for 1–9 September with a full attendance record: the two
  // were Sunday the 6th and the current day. A day is only absent if it was an expected
  // WORKING day, it has already finished, and no attendance exists for it.
  const holMap = {}; (hols || []).forEach(h => { holMap[h.on_date] = h.name; });
  const woDay = pset?.wo_weekday == null ? 0 : Number(pset.wo_weekday);   // 0 = Sunday
  const haveDate = new Set(days.map(d => d.date));
  const yest = Number(today.slice(8, 10)) - 1;
  const upto = to > today ? Math.max(yest, 0) : new Date(y, m, 0).getDate();   // today is never an absence

  let sundays = 0, holidayDays = 0, noRecord = 0;
  for (let dd = 1; dd <= lastDay; dd++) {
    const iso = `${ym}-${String(dd).padStart(2, "0")}`;
    const isWo = new Date(y, m - 1, dd).getDay() === woDay;
    if (isWo) sundays += 1;
    if (holMap[iso]) holidayDays += 1;
    if (dd > upto) continue;              // today and anything after it cannot be an absence
    if (haveDate.has(iso)) continue;      // there is a record — its own status decides
    if (isWo || holMap[iso]) continue;    // nobody was expected in
    noRecord += 1;
  }
  const otHours = otOn ? days.reduce((s, d) => s + d.otApproved, 0) : 0;   // update190: OT-off = 0 everywhere
  const totalHours = days.reduce((s, d) => s + d.hours, 0);
  // update375: for a staff-punch-profile the Earned card must reflect the STAFF sheet,
  // not the phantom labour ₹/day. attended × perDay is the staff earnings BEFORE deductions
  // and OT — deductions are applied on the Staff Salary sheet.
  const attended = present + half * 0.5;
  const earned = staffPay ? Math.round(attended * staffPay.perDay * 100) / 100 : attended * rate;
  const otAmt = Math.round(otHours * otRate * 100) / 100;
  return {
    worker: { id: w.id, name: w.full_name, mobile: w.mobile, category: w.category, labour: w.labour_type === "contractor" ? (w.contractors?.name || "Contractor") : "Own", site: w.sites?.name || "", joined: w.created_at?.slice(0, 10), wage: rate, otRate: otOn ? otRate : 0, stdHrs, otEligible: otOn, staffPay, staffPayError },   // update309/381
    month: ym, days, present, half, absent: absentRows + noRecord, absentRows, noRecord, sundays, holidayDays, daysElapsed: lastDay,   // update345: holidays are their own line
    totalHours: Math.round(totalHours * 100) / 100, otHours: Math.round(otHours * 100) / 100, otAmt, earned, gross: earned + otAmt,
// update375: if this worker is also on the Staff Salary sheet, hide the labour history —
    // it is a phantom on the paired punch-profile, never the real payroll.
    history: staffPay ? [] : (pay || []).map(p => ({ ...p, month: p.pay_month?.slice(0, 7) })),
    // update190: absent drill-down — recorded absents (attendance + supervisor marks). No-punch
    // days are counted in the summary but not listed as records (they aren't records).
    absentList: [
      ...days.filter(d => d.status === "absent").map(d => ({ date: d.date, site: d.site, status: "Absent (recorded)", reason: "" })),
      ...((marks || []).map(m => ({ date: m.att_date, site: m.sites?.name || "", status: "Marked absent", reason: (m.reason || "") + (m.app_users?.full_name ? " — by " + m.app_users.full_name : "") }))),
    ].sort((a, b) => a.date < b.date ? -1 : 1),
  };
}

export async function proxyPunch(workerId, siteId, photoFile, markedByName, siteManual, markerWorkerId) {   // update286/288: markerWorkerId = worker-app authority holder
  const today = todayLocal();
  const now = new Date().toISOString();
  if (isDemo) {
    const m = await getMuster(1);
    const upd = m.map(r => r.id === workerId
      ? { ...r, in: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }), punch: "proxy" }
      : r);
    localStorage.setItem("psk_muster", JSON.stringify(upd));
    return { ok: true };
  }
  let photoUrl = null;
  if (photoFile) {
    const path = `proxy/${workerId}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("attendance-photos").upload(path, photoFile);
    if (upErr) return { ok: false, error: "Photo upload failed: " + upErr.message };
    photoUrl = path;
  }
  if (!photoUrl) return { ok: false, error: "Live photo of the worker is mandatory for proxy punch." };
  // update287: the SERVER decides who may proxy-mark — Director, staff with attendance-create,
  // or a worker granted Proxy Attendance Authority. One enforced door; the checks below stay
  // only as a fallback while the SQL is not yet run.
  {
    const { data: pr, error: pe } = await supabase.rpc("fn_proxy_mark_present",
      { p_worker_id: workerId, p_site_id: Number(siteId), p_photo_path: photoUrl, p_site_manual: !!siteManual, p_marker_worker_id: markerWorkerId || null, p_mode: "in" });   // update288/291
    if (!pe) return pr?.ok ? { ok: true } : { ok: false, error: pr?.error || "Refused." };
    if (!/fn_proxy_mark_present|schema cache/i.test(pe.message)) return { ok: false, error: pe.message };
  }
  // update186: GLOBAL guard — never overwrite a punch recorded at another site today
  const { data: ex } = await supabase.from("attendance").select("id, site_id, punch_in, sites!attendance_site_id_fkey(name)")
    .eq("worker_id", workerId).eq("att_date", today).maybeSingle();
  if (ex?.id && Number(ex.site_id) !== Number(siteId)) {
    return { ok: false, error: `Already present at ${ex.sites?.name || "another site"} today — attendance is one record per worker per day.` };
  }
  if (ex?.id && ex.punch_in) return { ok: false, error: "Already punched in today." };
  const { error } = await supabase.from("attendance").upsert({
    worker_id: workerId, site_id: siteId, att_date: today,
    punch_in: now, punch_type: "proxy", proxy_photo_url: photoUrl, site_manual: !!siteManual,   // update286: audited
  }, { onConflict: "worker_id,att_date" });
  if (error) return { ok: false, error: error.message };
  // a supervisor "absent" mark is superseded by the real presence
  await supabase.from("attendance_absent_marks").delete().eq("worker_id", workerId).eq("att_date", today);
  return { ok: true };
}

// Proxy punch-OUT: supervisor marks an on-site worker out, with a mandatory live photo.
export async function proxyPunchOut(workerId, siteId, photoFile) {
  const today = todayLocal();
  const now = new Date().toISOString();
  if (isDemo) {
    const m = await getMuster(1);
    const upd = m.map(r => r.id === workerId
      ? { ...r, out: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) }
      : r);
    localStorage.setItem("psk_muster", JSON.stringify(upd));
    return { ok: true };
  }
  let photoUrl = null;
  if (photoFile) {
    const path = `proxy/${workerId}_out_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("attendance-photos").upload(path, photoFile);
    if (upErr) return { ok: false, error: "Photo upload failed: " + upErr.message };
    photoUrl = path;
  }
  if (!photoUrl) return { ok: false, error: "Live photo of the worker is mandatory for proxy punch-out." };
  const { error } = await supabase.from("attendance")
    .update({ punch_out: now, punch_out_selfie_url: photoUrl })
    .eq("worker_id", workerId).eq("site_id", siteId).eq("att_date", today);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function verifyDay(siteId, rows) {
  if (isDemo) {
    const upd = rows.map(r => ({ ...r, verify: "verified" }));
    localStorage.setItem("psk_muster", JSON.stringify(upd));
    return { ok: true, count: rows.length };
  }
  const today = todayLocal();
  const { error, count } = await supabase.from("attendance")
    .update({ verify_status: "verified", verified_at: new Date().toISOString() })
    .eq("site_id", siteId).eq("att_date", today).eq("verify_status", "pending")
    .select("id", { count: "exact" });
  return error ? { ok: false, error: error.message } : { ok: true, count };
}

// ---------- Add worker ----------
export async function addWorker(form) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("workers").insert(form);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getContractors() {
  if (isDemo) return [{ id: 1, name: "RK Labour Co." }];
  const { data } = await supabase.from("contractors").select("id, name").eq("is_active", true);
  return data || [];
}

// update168: a worker's punchable sites = home site + allotments
export async function getWorkerSiteOptions(worker) {
  if (isDemo || !worker?.id) return [];
  const [{ data: ws }, { data: sites }] = await Promise.all([
    supabase.from("worker_sites").select("site_id").eq("worker_id", worker.id),
    supabase.from("sites").select("id, name").eq("is_active", true),
  ]);
  const ids = new Set([Number(worker.site_id), ...((ws || []).map(x => Number(x.site_id)))]);
  return (sites || []).filter(x => ids.has(Number(x.id)));
}

export async function getSitesList() {
  if (isDemo) return [
    { id: 1, name: "KEI Industries, Sanand" },
    { id: 2, name: "SOUL Campus, GIFT City" },
    { id: 3, name: "The Creek" },
  ];
  const { data } = await supabase.from("sites").select("id, name").eq("is_active", true);
  const scope = assignedSiteIds();   // non-directors: assigned sites only (update139)
  return scope ? (data || []).filter(x => scope.includes(Number(x.id))) : (data || []);
}

// Staff (non-director) must punch too: create their punch profile automatically,
// linked to their mobile and current site. Wage 0 keeps payroll unaffected.
export async function createStaffPunchProfile(sess) {
  if (isDemo) return { ok: true };
  const siteId = sess.currentSite || sess.sites?.[0]?.id;
  if (!sess.mobile || !siteId) return { ok: false, error: "Your staff record has no mobile/site — ask the Director to check Workers & Staff Master." };
  // Hardening P2: direct insert into workers needs workers.create rights, which
  // most staff don't have — enrol server-side through a narrow SECURITY DEFINER RPC.
  const { data: rr, error: re } = await supabase.rpc("fn_staff_enrol_punch", { p_site_id: siteId });
  if (!re && rr) return rr.ok ? { ok: true } : { ok: false, error: rr.error };
  // fallback for the brief window between SQL run and code deploy
  // reuse any existing worker row on this number (active or not) before inserting
  const { data: ex } = await supabase.from("workers").select("id, is_active").eq("mobile", String(sess.mobile).trim()).limit(1);
  if (ex && ex[0]) {
    if (!ex[0].is_active) await supabase.from("workers").update({ is_active: true }).eq("id", ex[0].id);
    return { ok: true };
  }
  const { error } = await supabase.from("workers").insert({
    full_name: sess.name, mobile: String(sess.mobile).trim(), category: "supervisor",
    labour_type: "own", daily_wage: 0, site_id: siteId, is_active: true });
  if (error && String(error.message || "").includes("duplicate")) return { ok: true };  // raced/exists — fine
  return error ? { ok: false, error: error.message } : { ok: true };
}


// Staff punch follows the site switcher: pull the chosen site's identity + geofence.
export async function siteForPunch(siteId) {
  if (isDemo || !siteId) return null;
  const { data } = await supabase.from("sites")
    .select("id, name, geofence_lat, geofence_lng, geofence_radius_m").eq("id", siteId).maybeSingle();
  if (!data) return null;
  return { site_id: data.id, site_name: data.name, geofence_lat: data.geofence_lat,
           geofence_lng: data.geofence_lng, geofence_radius_m: data.geofence_radius_m || 200 };
}


// ---------------- update275: missing punch-out auto-close (review + opportunistic run) ----------------
export async function runAutoclose() {
  if (isDemo) return 0;
  try { const { data } = await supabase.rpc("fn_autoclose_missing_punchouts"); return data || 0; } catch { return 0; }
}
export async function getAutoClosedPending(siteId) {
  if (isDemo) return [];
  let q = supabase.from("attendance")
    .select("id, att_date, punch_in, punch_out, hours_worked, status, site_id, sites!attendance_site_id_fkey(name), workers(full_name)")
    .eq("review_status", "needs_review").order("att_date", { ascending: false }).limit(200);
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw new Error(/review_status|schema cache/i.test(error.message) ? "Run pipeskool_attendance_autoclose.sql (update 275) first." : error.message);
  return (data || []).map(a => ({ id: a.id, date: a.att_date, punch_in: a.punch_in, punch_out: a.punch_out,
    hours: Number(a.hours_worked || 0), status: a.status, site: a.sites?.name || "", worker: a.workers?.full_name || "" }));
}
export async function confirmAutoClose(attId, hhmm) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_confirm_autoclose", { p_att_id: attId, p_out_hhmm: hhmm || null });
  if (error) return { ok: false, error: error.message };
  return data || { ok: false, error: "No response." };
}


// update287: does MY login carry worker-level Proxy Attendance Authority?
export async function getMyProxyAuthority() {
  if (isDemo) return false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return false;
    const { data } = await supabase.from("workers").select("id").eq("auth_id", user.id).eq("is_active", true).eq("proxy_authority", true).limit(1);
    return !!(data && data.length);
  } catch { return false; }
}


// update288/289: live check of a worker's Proxy Attendance Authority (worker app, anon).
// v3: asks the DATABASE function (definer) so RLS can never silently answer "no";
// falls back to a direct read; failures THROW so the screen can say what's wrong.
export async function getWorkerProxyFlag(workerId) {
  if (isDemo) return false;
  const { data, error } = await supabase.rpc("fn_worker_proxy_state", { p_worker_id: Number(workerId) });
  if (!error) return !!data?.authorized;
  const { data: d2, error: e2 } = await supabase.from("workers").select("proxy_authority").eq("id", Number(workerId)).maybeSingle();
  if (e2) throw new Error(/proxy_authority|schema cache/i.test(e2.message) ? "Run pipeskool_proxy_authority_v3.sql (update 289) in Supabase first." : e2.message);
  return !!d2?.proxy_authority;
}


// update290: the proxy team list, the RPC-only way the worker app requires. Server-gated:
// an unauthorized marker gets authorized=false and zero data.
export async function getProxyTeam(markerWorkerId, siteId) {
  if (isDemo) return { authorized: false, rows: [] };
  const { data, error } = await supabase.rpc("fn_proxy_team", { p_marker_worker_id: Number(markerWorkerId), p_site_id: Number(siteId) });
  if (error) throw new Error(/fn_proxy_team|schema cache/i.test(error.message) ? "Run pipeskool_proxy_team.sql (update 290) in Supabase first." : error.message);
  return { authorized: !!data?.authorized, rows: data?.rows || [] };
}


// update291: proxy punch-OUT / absent / undo for the worker-app authority holder — all server-gated
export async function proxyMarkOut(markerWorkerId, workerId, siteId, photoFile) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  if (!photoFile) return { ok: false, error: "Live photo is mandatory." };
  const path = `proxy/${workerId}_out_${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage.from("attendance-photos").upload(path, photoFile);
  if (upErr) return { ok: false, error: "Photo upload failed: " + upErr.message };
  const { data, error } = await supabase.rpc("fn_proxy_mark_present",
    { p_worker_id: workerId, p_site_id: Number(siteId), p_photo_path: path, p_site_manual: false, p_marker_worker_id: Number(markerWorkerId), p_mode: "out" });
  if (error) return { ok: false, error: /p_mode|schema cache/i.test(error.message) ? "Run pipeskool_proxy_actions.sql (update 291) first." : error.message };
  return data || { ok: false, error: "No response." };
}
export async function proxyMarkAbsent(markerWorkerId, workerId, siteId, reason) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_proxy_mark_absent", { p_marker_worker_id: Number(markerWorkerId), p_worker_id: workerId, p_site_id: Number(siteId), p_reason: reason || null });
  if (error) return { ok: false, error: /fn_proxy_mark_absent|schema cache/i.test(error.message) ? "Run pipeskool_proxy_actions.sql (update 291) first." : error.message };
  return data || { ok: false, error: "No response." };
}
export async function proxyUnmarkAbsent(markerWorkerId, markId) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_proxy_unmark_absent", { p_marker_worker_id: Number(markerWorkerId), p_mark_id: markId });
  if (error) return { ok: false, error: error.message };
  return data || { ok: false, error: "No response." };
}


// update292: company-wide worker search for the proxy screen (Option 1) — server-gated
export async function proxySearchWorkers(markerWorkerId, q) {
  if (isDemo) return { authorized: false, rows: [] };
  const { data, error } = await supabase.rpc("fn_proxy_search_workers", { p_marker_worker_id: Number(markerWorkerId), p_q: q || "" });
  if (error) throw new Error(/fn_proxy_search_workers|schema cache/i.test(error.message) ? "Run pipeskool_proxy_search.sql (update 292) first." : error.message);
  return { authorized: !!data?.authorized, rows: data?.rows || [] };
}
