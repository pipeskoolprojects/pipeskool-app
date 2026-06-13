"use client";
import { supabase, isDemo } from "./supabase";
import { todayLocal } from "./today";

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
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
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
  const { data, error } = await supabase
    .from("workers")
    .select("id, full_name, category, site_id, profile_complete, sites(name, geofence_lat, geofence_lng, geofence_radius_m)")
    .eq("mobile", mobile).eq("is_active", true).maybeSingle();
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
    const { data, error } = await supabase.from("attendance").update({
      punch_out: now, punch_out_lat: pos?.lat, punch_out_lng: pos?.lng,
      punch_out_selfie_url: selfieUrl,
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

export async function getMuster(siteId) {
  if (isDemo) {
    try { return JSON.parse(localStorage.getItem("psk_muster")) || demoMuster; }
    catch { return demoMuster; }
  }
  const today = todayLocal();
  const { data: workers } = await supabase.from("workers")
    .select("id, full_name, category, labour_type, contractors(name)")
    .eq("site_id", siteId).eq("is_active", true);
  const { data: att } = await supabase.from("attendance")
    .select("worker_id, punch_in, punch_out, status, punch_type, verify_status")
    .eq("site_id", siteId).eq("att_date", today);
  const t = ts => ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : null;
  return (workers || []).map(w => {
    const a = (att || []).find(x => x.worker_id === w.id) || {};
    return {
      id: w.id, name: w.full_name,
      cat: w.category?.charAt(0).toUpperCase() + w.category?.slice(1),
      lab: w.labour_type === "contractor" ? (w.contractors?.name || "Contractor") : "Own",
      in: t(a.punch_in), out: t(a.punch_out),
      status: a.status || null, punch: a.punch_type || null,
      verify: a.verify_status || "pending", attId: a.id,
    };
  });
}

export async function proxyPunch(workerId, siteId, photoFile, markedByName) {
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
  const { error } = await supabase.from("attendance").upsert({
    worker_id: workerId, site_id: siteId, att_date: today,
    punch_in: now, punch_type: "proxy", proxy_photo_url: photoUrl,
  }, { onConflict: "worker_id,att_date" });
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

export async function getSitesList() {
  if (isDemo) return [
    { id: 1, name: "KEI Industries, Sanand" },
    { id: 2, name: "SOUL Campus, GIFT City" },
    { id: 3, name: "The Creek" },
  ];
  const { data } = await supabase.from("sites").select("id, name").eq("is_active", true);
  return data || [];
}
