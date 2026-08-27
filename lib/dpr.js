"use client";
import { supabase, isDemo } from "./supabase";
import { todayLocal } from "./today";
import { assignedSiteIds } from "./auth";
import { scoped, isScoped } from "./scope";

export function dprPhotoUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  try { return supabase.storage.from("attendance-photos").getPublicUrl(path).data.publicUrl; } catch { return null; }
}

// Shrink a camera photo in the browser before upload: downscale to maxDim, re-encode JPEG.
// Turns a 3-5MB photo into ~200-400KB so uploads are fast and reliable on site mobile data.
// Falls back to the original file if anything in the canvas path fails.
async function compressImage(file, maxDim = 1600, quality = 0.7) {
  try {
    if (typeof document === "undefined" || !file) return file;
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
    return (blob && blob.size > 0) ? blob : file;
  } catch {
    return file;
  }
}

export const HINDRANCE_REASONS = [
  ["front_not_available", "Front not available"],
  ["drawing_pending", "Drawing pending"],
  ["material_shortage", "Material shortage"],
  ["client_hold", "Client hold"],
  ["power_water_issue", "Power / water issue"],
  ["weather", "Weather"],
  ["manpower_shortage", "Manpower shortage"],
  ["other", "Other"],
];
export const reasonLabel = k => (HINDRANCE_REASONS.find(r => r[0] === k) || ["", k])[1];

// ---------- demo data ----------
const demoActivities = {
  1: [
    { id: 1, description: "350NB MS pipe welding - Trench", unit: "Rmt", boq_qty: 850 },
    { id: 2, description: "200NB MS pipe erection - Bay 5", unit: "Rmt", boq_qty: 1200 },
    { id: 3, description: "Pipe supports fabrication & fixing", unit: "Nos", boq_qty: 640 },
    { id: 4, description: "Hydro-testing of welded lines", unit: "Rmt", boq_qty: 2050 },
  ],
  2: [
    { id: 5, description: "110mm UPVC SWR pipe laying", unit: "Rmt", boq_qty: 2400 },
    { id: 6, description: "CPVC concealed piping - toilets", unit: "Points", boq_qty: 980 },
    { id: 7, description: "GI header piping - terrace", unit: "Rmt", boq_qty: 420 },
  ],
  3: [
    { id: 8, description: "160mm HDPE external drainage", unit: "Rmt", boq_qty: 1100 },
    { id: 9, description: "CPVC water supply riser piping", unit: "Rmt", boq_qty: 760 },
  ],
};

const demoDigest = [
  {
    site: "KEI Industries, Sanand", engineer: "S. Desai", manpower: 64, status: "submitted",
    work: [
      { activity: "350NB MS pipe welding - Trench", qty: 18, unit: "Rmt", loc: "Trench, CH 420-438" },
      { activity: "200NB MS pipe erection - Bay 5", qty: 36, unit: "Rmt", loc: "Bay-5, Grid B-F" },
      { activity: "Pipe supports fabrication & fixing", qty: 22, unit: "Nos", loc: "Bay-5" },
    ],
    hindrances: [{ reason: "client_hold", hours: 2, desc: "Crane occupied by civil contractor till 11 AM" }],
    photos: 4, plan: "Continue Bay-5 erection Grid F-H; fit-up for trench joints CH 438+",
  },
  {
    site: "SOUL Campus, GIFT City", engineer: "M. Joshi", manpower: 61, status: "submitted",
    work: [
      { activity: "110mm UPVC SWR pipe laying", qty: 42, unit: "Rmt", loc: "Block A, 3rd floor" },
      { activity: "CPVC concealed piping - toilets", qty: 14, unit: "Points", loc: "Block B, 2nd floor toilets" },
    ],
    hindrances: [
      { reason: "front_not_available", hours: 3, desc: "Block B 3rd floor masonry incomplete" },
      { reason: "drawing_pending", hours: 1.5, desc: "Terrace header revised drawing awaited" },
    ],
    photos: 3, plan: "SWR Block A 4th floor; CPVC Block B 2nd floor balance toilets",
  },
  {
    site: "The Creek", engineer: "R. Mehta", manpower: 37, status: "draft",
    work: [{ activity: "160mm HDPE external drainage", qty: 28, unit: "Rmt", loc: "South boundary, MH-7 to MH-9" }],
    hindrances: [], photos: 2, plan: "Drainage MH-9 to MH-11; chamber benching",
  },
];

const demoProgress = [
  { site: "KEI", description: "350NB MS pipe welding - Trench", unit: "Rmt", boq: 850, done: 512, manDays: 410 },
  { site: "KEI", description: "200NB MS pipe erection - Bay 5", unit: "Rmt", boq: 1200, done: 318, manDays: 290 },
  { site: "KEI", description: "Hydro-testing of welded lines", unit: "Rmt", boq: 2050, done: 380, manDays: 95 },
  { site: "SOUL", description: "110mm UPVC SWR pipe laying", unit: "Rmt", boq: 2400, done: 1685, manDays: 520 },
  { site: "SOUL", description: "CPVC concealed piping - toilets", unit: "Points", boq: 980, done: 545, manDays: 610 },
  { site: "CREEK", description: "160mm HDPE external drainage", unit: "Rmt", boq: 1100, done: 372, manDays: 230 },
];

const demoHindranceRegister = [
  { date: "2026-06-12", site: "SOUL Campus", reason: "front_not_available", hours: 3, desc: "Block B 3rd floor masonry incomplete" },
  { date: "2026-06-12", site: "SOUL Campus", reason: "drawing_pending", hours: 1.5, desc: "Terrace header revised drawing awaited" },
  { date: "2026-06-12", site: "KEI Sanand", reason: "client_hold", hours: 2, desc: "Crane occupied by civil contractor" },
  { date: "2026-06-11", site: "SOUL Campus", reason: "front_not_available", hours: 4, desc: "Block B 3rd floor not released" },
  { date: "2026-06-10", site: "KEI Sanand", reason: "material_shortage", hours: 2.5, desc: "200NB elbows awaited from vendor" },
];

// ---------- queries ----------
export async function getActivities(siteId) {
  if (isDemo) return demoActivities[siteId] || demoActivities[1];
  const { data } = await supabase.from("activities")
    .select("id, description, unit, boq_qty")
    .eq("site_id", siteId).eq("is_active", true).order("sort_order");
  return data || [];
}

export async function getManpowerToday(siteId) {
  if (isDemo) return 64;
  const today = todayLocal();
  const { count } = await supabase.from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId).eq("att_date", today)
    .in("status", ["present", "half_day"]);
  return count || 0;
}

// Fail fast instead of hanging forever on a dead connection.
function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error((label || "Operation") + " timed out — check your connection")), ms);
  });
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(t)), timeout]);
}

// PHASE 1 — the engineer's actual record. Header + work + hindrances + materials.
// Work/hindrance/material writes run in PARALLEL (not one-after-another) so this
// returns in ~1-2s even on site mobile data. Photos are NOT touched here.
export async function submitDPRCore(siteId, payload) {
  if (isDemo) return { ok: true, dprId: "demo" };
  const today = todayLocal();
  const { data: hdr, error: e1 } = await supabase.from("dpr").upsert({
    site_id: siteId, dpr_date: today,
    manpower_present: payload.manpower,
    tomorrow_plan: payload.plan,
    status: "submitted", submitted_at: new Date().toISOString(),
  }, { onConflict: "site_id,dpr_date" }).select().single();
  if (e1) return { ok: false, error: e1.message };

  const tasks = [
    (async () => {
      await supabase.from("dpr_work_items").delete().eq("dpr_id", hdr.id);
      if (payload.work.length) {
        const { error } = await supabase.from("dpr_work_items").insert(
          payload.work.map(w => ({ dpr_id: hdr.id, activity_id: w.activity_id || null,
            boq_item_id: w.boq_item_id || null, item_id: w.item_id || null,
            activity_text: w.activity_text || null, unit: w.unit || null,
            qty: w.qty, location_tag: w.loc })));
        if (error) throw new Error(error.message);
      }
    })(),
    (async () => {
      await supabase.from("dpr_hindrances").delete().eq("dpr_id", hdr.id);
      if (payload.hindrances.length) {
        const { error } = await supabase.from("dpr_hindrances").insert(
          payload.hindrances.map(h => ({ dpr_id: hdr.id, reason: h.reason, hours_lost: h.hours, description: h.desc })));
        if (error) throw new Error(error.message);
      }
    })(),
    (async () => {
      if (payload.materials && payload.materials.length) {
        await supabase.from("dpr_materials").delete().eq("dpr_id", hdr.id);
        const { error } = await supabase.from("dpr_materials").insert(
          payload.materials.map(m => ({ dpr_id: hdr.id, item_name: m.name, qty: m.qty, unit: m.unit })));
        if (error) throw new Error(error.message);
      }
    })(),
  ];
  try { await Promise.all(tasks); }
  catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, dprId: hdr.id };
}

// PHASE 2 — runs AFTER the record is already saved & confirmed, so it never blocks
// the engineer. Compresses + uploads each photo in parallel, reports live progress,
// and times out a stalled upload (25s) instead of hanging. Returns the files that
// failed so the caller can offer a one-tap retry of only those.
export async function uploadDPRPhotos(dprId, files, onProgress) {
  const list = files || [];
  if (isDemo) { if (onProgress) onProgress(list.length, list.length); return { failedFiles: [], errors: [], total: list.length }; }
  let done = 0;
  const failedFiles = [];
  const errors = [];
  await Promise.all(list.map(async (f) => {
    try {
      const blob = await compressImage(f.file);
      const path = `dpr/${dprId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
      const { error: upErr } = await withTimeout(
        supabase.storage.from("attendance-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false }),
        25000, "Photo upload");
      if (upErr) throw new Error("upload: " + upErr.message);
      const { error: insErr } = await supabase.from("dpr_photos").insert({
        dpr_id: dprId, photo_url: path, caption: f.caption || null, lat: f.lat ?? null, lng: f.lng ?? null });
      if (insErr) throw new Error("link: " + insErr.message);
    } catch (e) {
      failedFiles.push(f); errors.push(String(e?.message || e));
    } finally {
      done++; if (onProgress) onProgress(done, list.length);
    }
  }));
  return { failedFiles, errors, total: list.length };
}

export async function getDigest(dateStr, siteId) {
  if (isDemo) return demoDigest;
  siteId = scoped(siteId);   // update245
  let qd = supabase.from("dpr")
    .select("id, site_id, status, manpower_present, tomorrow_plan, sites(name), app_users(full_name)")
    .eq("dpr_date", dateStr);
  if (isScoped(siteId)) qd = qd.eq("site_id", siteId);
  const { data: dprs } = await qd;
  if (!dprs?.length) return [];
  const out = [];
  for (const d of dprs) {
    const { data: work } = await supabase.from("dpr_work_items")
      .select("qty, location_tag, unit, activity_text, activities(description, unit), boq_items(description, unit), item_master(display_name, unit)").eq("dpr_id", d.id);
    const { data: hin } = await supabase.from("dpr_hindrances")
      .select("reason, hours_lost, description").eq("dpr_id", d.id);
    const { data: photoRows } = await supabase.from("dpr_photos")
      .select("photo_url, caption").eq("dpr_id", d.id);
    const photos = (photoRows || []).map(p => ({ url: dprPhotoUrl(p.photo_url), caption: p.caption }));
    out.push({
      site: d.sites?.name, engineer: d.app_users?.full_name || "", manpower: d.manpower_present,
      status: d.status, plan: d.tomorrow_plan, photos,
      work: (work || []).map(w => ({
        activity: w.activities?.description || w.boq_items?.description || w.item_master?.display_name || w.activity_text || "Work",
        qty: Number(w.qty),
        unit: w.unit || w.activities?.unit || w.boq_items?.unit || w.item_master?.unit || "",
        loc: w.location_tag })),
      hindrances: (hin || []).map(h => ({ reason: h.reason, hours: Number(h.hours_lost), desc: h.description })),
    });
  }
  return out;
}

export async function getProgress(siteId) {
  if (isDemo) return demoProgress;
  siteId = scoped(siteId);   // update245
  let q0 = supabase.from("v_activity_progress")
    .select("site_id, description, unit, boq_qty, done_qty, pct_complete, sites(code)");
  if (isScoped(siteId)) q0 = q0.eq("site_id", siteId);
  const { data } = await q0;
  return (data || []).map(r => ({
    site: r.sites?.code, description: r.description, unit: r.unit,
    boq: Number(r.boq_qty), done: Number(r.done_qty), manDays: null,
  }));
}

export async function getHindranceRegister(fromStr, toStr) {
  if (isDemo) return demoHindranceRegister;
  const { data } = await supabase.from("dpr_hindrances")
    .select("reason, hours_lost, description, dpr(dpr_date, sites(name))")
    .gte("dpr.dpr_date", fromStr).lte("dpr.dpr_date", toStr);
  return (data || []).map(h => ({
    date: h.dpr?.dpr_date, site: h.dpr?.sites?.name,
    reason: h.reason, hours: Number(h.hours_lost), desc: h.description,
  }));
}


// ---- recent DPRs for a site (history) ----
export async function getDprHistory(siteId, limit = 30) {
  if (isDemo) return [];
  const { data } = await supabase.from("dpr")
    .select("id, dpr_date, status, manpower_present, tomorrow_plan").eq("site_id", siteId)
    .order("dpr_date", { ascending: false }).limit(limit);
  if (!data) return [];
  const out = [];
  for (const d of data) {
    const { data: work } = await supabase.from("dpr_work_items")
      .select("qty, location_tag, unit, activity_text, activities(description, unit), boq_items(description, unit), item_master(display_name, unit)").eq("dpr_id", d.id);
    const { data: photoRows } = await supabase.from("dpr_photos").select("photo_url, caption").eq("dpr_id", d.id);
    out.push({
      id: d.id, date: d.dpr_date, status: d.status, manpower: d.manpower_present, plan: d.tomorrow_plan,
      work: (work || []).map(w => ({
        activity: w.activities?.description || w.boq_items?.description || w.item_master?.display_name || w.activity_text || "Work",
        qty: Number(w.qty), unit: w.unit || w.activities?.unit || w.boq_items?.unit || w.item_master?.unit || "", loc: w.location_tag })),
      photos: (photoRows || []).map(p => ({ url: dprPhotoUrl(p.photo_url), caption: p.caption })),
    });
  }
  return out;
}

// All-sites history. Pass {date} to get just that day across every site, or leave
// it blank for the most recent {limit} DPRs. Efficient: 1 header query + 1 batched
// work query + 1 batched photo query, grouped in memory.
export async function getAllSitesDprHistory({ date = null, limit = 40, siteId = null } = {}) {
  if (isDemo) return [];
  let q = supabase.from("dpr")
    .select("id, site_id, dpr_date, status, manpower_present, tomorrow_plan, sites(name)")
    .order("dpr_date", { ascending: false });
  const scope = assignedSiteIds();   // non-directors: assigned sites only (update139)
  if (scope) q = q.in("site_id", scope);
  const one = scoped(siteId);        // update245: inside a project, one site only
  if (one && one !== "all") q = q.eq("site_id", one);
  q = date ? q.eq("dpr_date", date) : q.limit(limit);
  const { data: dprs } = await q;
  if (!dprs?.length) return [];
  const ids = dprs.map(d => d.id);
  const [{ data: works }, { data: photos }] = await Promise.all([
    supabase.from("dpr_work_items")
      .select("dpr_id, qty, location_tag, unit, activity_text, activities(description, unit), boq_items(description, unit), item_master(display_name, unit)").in("dpr_id", ids),
    supabase.from("dpr_photos").select("dpr_id, photo_url, caption").in("dpr_id", ids),
  ]);
  const workBy = {}, photoBy = {};
  (works || []).forEach(w => { if (!workBy[w.dpr_id]) workBy[w.dpr_id] = []; workBy[w.dpr_id].push(w); });
  (photos || []).forEach(p => { if (!photoBy[p.dpr_id]) photoBy[p.dpr_id] = []; photoBy[p.dpr_id].push(p); });
  return dprs.map(d => ({
    id: d.id, date: d.dpr_date, status: d.status, manpower: d.manpower_present, plan: d.tomorrow_plan,
    site: d.sites?.name || "Site",
    work: (workBy[d.id] || []).map(w => ({
      activity: w.activities?.description || w.boq_items?.description || w.item_master?.display_name || w.activity_text || "Work",
      qty: Number(w.qty), unit: w.unit || w.activities?.unit || w.boq_items?.unit || w.item_master?.unit || "", loc: w.location_tag })),
    photos: (photoBy[d.id] || []).map(p => ({ url: dprPhotoUrl(p.photo_url), caption: p.caption })),
  }));
}
export async function getTodayDpr(siteId) {
  if (isDemo) return null;
  const today = todayLocal();
  const { data: d } = await supabase.from("dpr").select("id, manpower_present, tomorrow_plan, dpr_date").eq("site_id", siteId).eq("dpr_date", today).maybeSingle();
  if (!d) return null;
  const { data: work } = await supabase.from("dpr_work_items")
    .select("qty, location_tag, unit, boq_item_id, item_id, activity_text, boq_items(description, unit), item_master(display_name, unit)").eq("dpr_id", d.id);
  const { data: hin } = await supabase.from("dpr_hindrances").select("reason, hours_lost, description").eq("dpr_id", d.id);
  const { data: photoRows } = await supabase.from("dpr_photos").select("photo_url, caption").eq("dpr_id", d.id);
  return {
    manpower: d.manpower_present, plan: d.tomorrow_plan,
    work: (work || []).map(w => ({
      boq_item_id: w.boq_item_id, item_id: w.item_id, activity_text: w.activity_text,
      label: w.boq_items?.description || w.item_master?.display_name || w.activity_text || "Work",
      unit: w.unit || w.boq_items?.unit || w.item_master?.unit || "", qty: w.qty, loc: w.location_tag,
      kind: w.boq_item_id ? "boq" : (w.item_id ? "material" : "free") })),
    hindrances: (hin || []).map(h => ({ reason: h.reason, hours: h.hours_lost, desc: h.description })),
    existingPhotos: (photoRows || []).map(p => ({ url: dprPhotoUrl(p.photo_url), caption: p.caption })),
  };
}
