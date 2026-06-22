"use client";
import { supabase, isDemo } from "./supabase";
import { todayLocal } from "./today";

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

export async function submitDPR(siteId, payload) {
  if (isDemo) return { ok: true };
  const today = todayLocal();
  const { data: hdr, error: e1 } = await supabase.from("dpr").upsert({
    site_id: siteId, dpr_date: today,
    manpower_present: payload.manpower,
    tomorrow_plan: payload.plan,
    status: "submitted", submitted_at: new Date().toISOString(),
  }, { onConflict: "site_id,dpr_date" }).select().single();
  if (e1) return { ok: false, error: e1.message };
  await supabase.from("dpr_work_items").delete().eq("dpr_id", hdr.id);
  if (payload.work.length) {
    const { error: e2 } = await supabase.from("dpr_work_items").insert(
      payload.work.map(w => ({ dpr_id: hdr.id, activity_id: w.activity_id || null,
        boq_item_id: w.boq_item_id || null, item_id: w.item_id || null,
        activity_text: w.activity_text || null, unit: w.unit || null,
        qty: w.qty, location_tag: w.loc })));
    if (e2) return { ok: false, error: e2.message };
  }
  await supabase.from("dpr_hindrances").delete().eq("dpr_id", hdr.id);
  if (payload.hindrances.length) {
    await supabase.from("dpr_hindrances").insert(
      payload.hindrances.map(h => ({ dpr_id: hdr.id, reason: h.reason, hours_lost: h.hours, description: h.desc })));
  }
  if (payload.materials.length) {
    await supabase.from("dpr_materials").delete().eq("dpr_id", hdr.id);
    await supabase.from("dpr_materials").insert(
      payload.materials.map(m => ({ dpr_id: hdr.id, item_name: m.name, qty: m.qty, unit: m.unit })));
  }
  for (const f of payload.photoFiles || []) {
    const path = `dpr/${hdr.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
    const { error: upErr } = await supabase.storage.from("attendance-photos").upload(path, f.file);
    if (!upErr) await supabase.from("dpr_photos").insert({
      dpr_id: hdr.id, photo_url: path, caption: f.caption, lat: f.lat, lng: f.lng });
  }
  return { ok: true };
}

export async function getDigest(dateStr) {
  if (isDemo) return demoDigest;
  const { data: dprs } = await supabase.from("dpr")
    .select("id, status, manpower_present, tomorrow_plan, sites(name), app_users(full_name)")
    .eq("dpr_date", dateStr);
  if (!dprs?.length) return [];
  const out = [];
  for (const d of dprs) {
    const { data: work } = await supabase.from("dpr_work_items")
      .select("qty, location_tag, activities(description, unit)").eq("dpr_id", d.id);
    const { data: hin } = await supabase.from("dpr_hindrances")
      .select("reason, hours_lost, description").eq("dpr_id", d.id);
    const { count: photos } = await supabase.from("dpr_photos")
      .select("id", { count: "exact", head: true }).eq("dpr_id", d.id);
    out.push({
      site: d.sites?.name, engineer: d.app_users?.full_name || "", manpower: d.manpower_present,
      status: d.status, plan: d.tomorrow_plan, photos: photos || 0,
      work: (work || []).map(w => ({ activity: w.activities?.description, qty: Number(w.qty), unit: w.activities?.unit, loc: w.location_tag })),
      hindrances: (hin || []).map(h => ({ reason: h.reason, hours: Number(h.hours_lost), desc: h.description })),
    });
  }
  return out;
}

export async function getProgress() {
  if (isDemo) return demoProgress;
  const { data } = await supabase.from("v_activity_progress")
    .select("description, unit, boq_qty, done_qty, pct_complete, sites(code)");
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
