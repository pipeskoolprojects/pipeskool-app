"use client";
// update487: Item Master data the Excel-import Review page needs for "Add item" — fetched once when the page opens and
// kept in memory, so the Add-item drawer opens instantly and never waits. Names / attributes / HSN only (no prices).
import { getItemTypes, getAllItems, ITEM_TYPES } from "./stock";

let cache = null;            // { types, items, makes, at }
let pending = null;
const TTL = 10 * 60 * 1000;

function makesOf(items) {
  const count = new Map();
  for (const it of items) { const m = String(it.make || "").trim(); if (!m) continue; const k = m.toLowerCase(); const c = count.get(k) || { m, n: 0 }; c.n++; count.set(k, c); }
  return [...count.values()].sort((a, b) => b.n - a.n).map(x => x.m);   // the most used spelling of each brand
}
export function prefetchMaster(force = false) {
  if (cache && !force && Date.now() - cache.at < TTL) return Promise.resolve(cache);
  if (pending && !force) return pending;
  pending = Promise.all([getItemTypes().catch(() => ITEM_TYPES), getAllItems().catch(() => ({ rows: [] }))]).then(([types, res]) => {
    const items = (Array.isArray(res) ? res : res?.rows || []).filter(r => r.is_active !== false);
    cache = { types: types?.length ? types : ITEM_TYPES, items, makes: makesOf(items), at: Date.now() };
    pending = null; return cache;
  });
  return pending;
}
export const masterNow = () => cache;
/** a just-created item goes straight into the cache (duplicate checks see it at once) */
export function rememberItem(it) { if (!cache || !it?.id) return; cache.items = [it, ...cache.items.filter(x => x.id !== it.id)]; cache.makes = makesOf(cache.items); }
export function forgetItem(id) { if (!cache) return; cache.items = cache.items.filter(x => x.id !== id); }
export function rememberType(label) { if (cache && label && !cache.types.includes(label)) cache.types = [...cache.types, label].sort(); }
