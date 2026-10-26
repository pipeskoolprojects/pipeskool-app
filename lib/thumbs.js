"use client";
// update478: product pictures on PO lines — ONE small thumbnail per Material Master item.
//
// Where a picture comes from (first match wins):
//   1. item_thumbs — a 96×96 JPEG (≈2–6 KB) made ONCE from the Material Master photo (at upload, or by the backfill
//      page /items/thumbnails) and kept in the database, so a PO never has to fetch the originals (R2, often MBs).
//   2. the Astral catalogue picture bundled with the app (lib/catalogueImages.js, tiny WebP), through the item's
//      catalogue link (catalogue_product_items.item_id). Already thumbnail-sized — nothing to store.
// A line whose item has neither shows a blank cell. Pictures never block anything: every lookup swallows errors.
import { supabase, isDemo } from "./supabase";
import { fileHref } from "./files";

export const THUMB_PX = 96;          // stored thumbnail edge (prints at 11–12 mm ≈ 200 dpi)
export const THUMB_QUALITY = 0.65;   // JPEG quality at creation (the PDF builder may re-encode lower to stay in budget)
const FETCH_MS = 8000;               // originals are fetched only when making a thumbnail — never on the PO page itself

const dataUri = b64 => (b64 && !/^data:/.test(b64) ? "data:image/jpeg;base64," + b64 : b64);

/** Decode a File / Blob / URL into a bitmap, in a bounded way (a 10 MB phone photo must not freeze the page). */
async function decode(src, signal) {
  let blob = src;
  if (typeof src === "string") {
    const r = await fetch(src, { credentials: "same-origin", signal });
    if (!r.ok) throw new Error("fetch " + r.status);
    blob = await r.blob();
  }
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(blob); } catch {}   // full decode (a 12 MP phone photo is fine); the canvas below does the aspect-correct downscale
  }
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob); const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); }; im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("decode failed")); };
    im.src = url;
  });
}

/**
 * Make the thumbnail: fit inside THUMB_PX×THUMB_PX, centred on WHITE (transparent PNG logos print cleanly), JPEG.
 * Returns { b64, bytes, w, h } or null when the picture cannot be read / takes too long. Never throws.
 * @param src File | Blob | same-origin URL
 */
export async function makeThumb(src, { size = THUMB_PX, quality = THUMB_QUALITY, timeoutMs = FETCH_MS } = {}) {
  if (typeof document === "undefined") return null;
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), timeoutMs);
  try {
    const bmp = await Promise.race([decode(src, ctl?.signal), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]);
    const sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
    if (!sw || !sh) return null;
    const c = document.createElement("canvas"); c.width = size; c.height = size;
    const g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, size, size);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    const k = Math.min(size / sw, size / sh), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    g.drawImage(bmp, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
    if (bmp.close) bmp.close();
    const url = c.toDataURL("image/jpeg", quality);
    const b64 = url.split(",")[1] || "";
    return { b64, bytes: Math.floor(b64.length * 3 / 4), w: size, h: size };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

/** Re-encode an existing thumbnail (data URI or base64) at a lower JPEG quality — the PDF size step-down. */
export async function reencodeThumb(b64OrUri, quality) {
  const t = await makeThumb(await (await fetch(dataUri(b64OrUri))).blob(), { quality, timeoutMs: 3000 });
  return t ? t.b64 : null;
}

/** Save a thumbnail for an item (same right as editing the Material Master). Never throws. */
export async function saveItemThumb(itemId, b64, source = "photo", src = null) {
  if (isDemo || !itemId || !b64) return { ok: false, error: "nothing to save" };
  try {
    const { data, error } = await supabase.rpc("fn_item_thumb_save", { p_item_id: Number(itemId), p_data: b64, p_source: source, p_src: src });
    if (error) return { ok: false, error: /fn_item_thumb_save|schema cache/i.test(error.message) ? "Thumbnails not enabled yet — run pipeskool_po_item_thumbs.sql (update 478)." : error.message };
    return data?.ok ? { ok: true, bytes: data.bytes } : { ok: false, error: data?.error || "Failed" };
  } catch (e) { return { ok: false, error: e?.message || "Failed" }; }
}

/** Make + save in one go, from the uploaded File and the stored photo key. Used right after a Material Master upload. */
export async function makeAndSaveThumb(itemIds, fileOrUrl, photoKey) {
  const ids = (Array.isArray(itemIds) ? itemIds : [itemIds]).filter(Boolean);
  if (!ids.length) return { ok: false, error: "no item" };
  const t = await makeThumb(fileOrUrl);
  if (!t) return { ok: false, error: "could not read the picture" };
  let saved = 0, err = "";
  for (const id of ids) { const r = await saveItemThumb(id, t.b64, "photo", photoKey || null); if (r.ok) saved++; else err = r.error; }
  return { ok: saved > 0, saved, error: err, bytes: t.bytes };
}

let catMap = null;
async function catalogueImage(file) {
  if (!file) return null;
  try {
    catMap = catMap || (await import("./catalogueImages")).default || {};
    const e = catMap[file]; if (!e) return null;
    return "data:image/webp;base64," + (typeof e === "string" ? e : e[2]);
  } catch { return null; }
}

/**
 * Pictures for PO lines. lines: [{ item_id, item_name }] → Map(index → { src, full, kind, b64? })
 *   src  : what the <img> shows (data URI)      full: what tap-to-enlarge opens (original photo link, or the same picture)
 *   kind : "photo" (item_thumbs) | "catalogue"   b64 : base64 JPEG when kind === "photo" (the PDF uses it as-is)
 * One query for thumbs, one for catalogue links, one (only if needed) to match OLD lines by name. All failures → fewer pictures, never an error.
 */
export async function getLineImages(lines) {
  const out = new Map();
  if (isDemo || !lines?.length) return out;
  try {
    const byIdx = lines.map((l, i) => ({ i, id: l.item_id ? Number(l.item_id) : null, name: String(l.item_name || "").split(" — ")[0].trim() }));
    // old POs (before item_id was stored): match the line text to a Material Master name, exact
    const unnamed = byIdx.filter(x => !x.id && x.name);
    if (unnamed.length) {
      const names = [...new Set(unnamed.map(x => x.name))].slice(0, 100);
      const { data } = await supabase.from("item_master").select("id, display_name").in("display_name", names);
      const m = new Map((data || []).map(r => [r.display_name, r.id]));
      unnamed.forEach(x => { if (m.has(x.name)) x.id = m.get(x.name); });
    }
    const ids = [...new Set(byIdx.map(x => x.id).filter(Boolean))];
    if (!ids.length) return out;
    const thumbs = new Map();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from("item_thumbs").select("item_id, data, src, item_master(photo_url)").in("item_id", ids.slice(i, i + 200));
      if (error) break;   // table not there yet (SQL not run) → catalogue pictures only
      // a thumb is shown only while it still matches the item's CURRENT photo (photo removed or replaced → blank until re-made)
      (data || []).forEach(r => { const cur = r.item_master?.photo_url || null; if (r.data && /^\/9j\//.test(r.data) && cur && (!r.src || r.src === cur)) thumbs.set(Number(r.item_id), r); });   // /9j/ = JPEG magic: anything else is not a picture
    }
    const need = ids.filter(id => !thumbs.has(id));
    const cat = new Map();
    for (let i = 0; i < need.length; i += 200) {
      const { data } = await supabase.from("catalogue_product_items").select("item_id, catalogue_products(image)").in("item_id", need.slice(i, i + 200));
      for (const r of data || []) { const f = r.catalogue_products?.image; if (f && !cat.has(Number(r.item_id))) cat.set(Number(r.item_id), f); }
    }
    for (const x of byIdx) {
      if (!x.id) continue;
      const t = thumbs.get(x.id);
      if (t) { out.set(x.i, { kind: "photo", b64: t.data, src: dataUri(t.data), full: t.src ? fileHref(t.src) : dataUri(t.data), item_id: x.id }); continue; }
      const f = cat.get(x.id);
      if (f) { const img = await catalogueImage(f); if (img) out.set(x.i, { kind: "catalogue", src: img, full: img, item_id: x.id, file: f }); }
    }
  } catch {}
  return out;
}

/** Items whose Material Master photo has no thumbnail yet (or the photo changed since) — the backfill list. */
export async function listThumbTargets() {
  if (isDemo) return { items: [], done: 0 };
  const items = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("item_master").select("id, display_name, photo_url").not("photo_url", "is", null).order("id").range(from, from + 999);
    if (error) return { items: [], done: 0, error: error.message };
    items.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  const have = new Map();
  for (let i = 0; i < items.length; i += 200) {
    const { data, error } = await supabase.from("item_thumbs").select("item_id, src, bytes, updated_at").in("item_id", items.slice(i, i + 200).map(x => x.id));
    if (error) return { items: [], done: 0, error: /item_thumbs|schema cache/i.test(error.message) ? "Thumbnails not enabled yet — run pipeskool_po_item_thumbs.sql (update 478)." : error.message };
    (data || []).forEach(r => have.set(Number(r.item_id), r));
  }
  const pending = items.filter(x => { const h = have.get(x.id); return !h || (h.src && h.src !== x.photo_url); });
  return { items: pending, done: items.length - pending.length, total: items.length };
}

/** Backfill: make thumbnails for the given items (sequentially, 8 s per picture), reporting progress. */
export async function backfillThumbs(items, onProgress, { force = false } = {}) {
  const res = { made: 0, failed: [], skipped: 0 };
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const t = await makeThumb(fileHref(it.photo_url));
    if (!t) res.failed.push({ id: it.id, name: it.display_name, why: "picture could not be read (missing, corrupt or too slow)" });
    else { const r = await saveItemThumb(it.id, t.b64, "photo", it.photo_url); if (r.ok) res.made++; else res.failed.push({ id: it.id, name: it.display_name, why: r.error }); }
    onProgress && onProgress({ done: i + 1, total: items.length, ...res });
  }
  return res;
}
