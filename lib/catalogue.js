"use client";
// update464: ORDER MATERIALS — the Astral catalogue grouped into product cards (one card per product, every
// size a separate Material Master item). Read-only over catalogue_products / catalogue_product_items + item_master.
// No price column is read here; prices come only through v_item_current_price, which the database empties for
// anyone without Price access (update 463) — site roles never even make that request.
import { supabase, isDemo } from "./supabase";
import { canViewPrices } from "./prices";

// product pictures: bundled in lib/catalogueImages.js (loaded on demand, only on this screen) — no public/ upload,
// no storage bucket, no signed URLs to expire. Key = catalogue_products.image.
let IMG = null;
export async function loadCatalogueImages() {
  if (IMG) return IMG;
  try { IMG = (await import("./catalogueImages")).default || {}; } catch { IMG = {}; }
  return IMG;
}
export const catalogueImage = (f, map) => (f && map && map[f] ? "data:image/webp;base64," + map[f] : null);

const FAMILY_ORDER = ["CPVC Pro", "Aquarius", "Aquasafe", "Drainmaster", "Silencio", "Drain Pro", "Foamcore", "Underground", "Drex", "Telerex"];
const CAT_OF = { pipe: "Pipes", pipes: "Pipes", fitting: "Fittings", fittings: "Fittings", valve: "Valves", valves: "Valves" };
const famRank = f => { const i = FAMILY_ORDER.indexOf(f); return i < 0 ? 99 : i; };

async function fetchAll(build, page = 1000) {
  let out = [], from = 0;
  for (let guard = 0; guard < 20; guard++) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) return { error };
    out = out.concat(data || []);
    if (!data || data.length < page) break;
    from += page;
  }
  return { data: out };
}

// → { products: [{ id, family, category, name, image, pending, opts: [{ id, item_id, size, variant, code, unit, name, basis }] }], families, missing }
export async function getCatalogue() {
  if (isDemo) return { products: [], families: [], missing: false };
  const [p, l] = await Promise.all([
    supabase.from("catalogue_products").select("id, make, family, category, name, image, pending_sizes, sort_order").eq("is_active", true).order("sort_order").order("id").limit(5000),
    fetchAll(() => supabase.from("catalogue_product_items")
      .select("id, product_id, item_id, size_label, variant, maker_code, link_basis, sort_order, item_master(id, display_name, unit, item_type, material, sub_type, size, make, is_active, pending_review)")
      .order("product_id").order("sort_order").order("id")),
  ]);
  if (p.error || l.error) {
    const msg = (p.error || l.error).message || "";
    if (/catalogue_product|does not exist|schema cache/i.test(msg)) return { products: [], families: [], missing: true };
    return { products: [], families: [], error: msg };
  }
  const byP = {};
  (l.data || []).forEach(r => {
    const im = r.item_master;
    if (!im || im.is_active === false || im.pending_review === true) return;   // deactivated items leave the catalogue by themselves
    (byP[r.product_id] = byP[r.product_id] || []).push({
      // Material Master is the source of truth: its size wins; the catalogue label is only a fallback for items without one
      id: r.id, item_id: r.item_id, size: (im.size || "").trim() || r.size_label, catSize: r.size_label, variant: r.variant || "", code: r.maker_code || "",
      make: im.make || "", material: im.material || "",
      unit: im.unit || "Nos", name: im.display_name, item_type: im.item_type || "", basis: r.link_basis, sort: Number(r.sort_order) || 0,
    });
  });
  const products = (p.data || []).map(x => ({
    id: x.id, family: x.family, category: x.category, name: x.name, image: x.image, pending: Number(x.pending_sizes) || 0,
    opts: (byP[x.id] || []).sort((a, b) => a.sort - b.sort || a.id - b.id),
  })).filter(x => x.opts.length);
  const linked = new Set((l.data || []).map(r => r.item_id));
  const mm = await fetchAll(() => supabase.from("item_master").select("id, display_name, unit, item_type, material, sub_type, size, make").eq("is_active", true).order("display_name").order("id"));
  (mm.data || []).filter(im => !linked.has(im.id) && im.display_name).forEach(im => {
    products.push({ id: "mm" + im.id, family: "Other Material Master", category: CAT_OF[String(im.item_type || "").toLowerCase()] || im.item_type || "Other", name: im.display_name, image: null, pending: 0, master: true,
      opts: [{ id: "mm" + im.id, item_id: im.id, size: (im.size || "").trim() || "—", variant: "", code: "", unit: im.unit || "Nos", name: im.display_name,
               item_type: im.item_type || "", make: im.make || "", material: im.material || "", basis: "master", sort: 0 }] });
  });
  const families = [...new Set(products.map(x => x.family))].sort((a, b) => famRank(a) - famRank(b) || a.localeCompare(b));
  return { products, families, missing: false };
}

// rate per Material Master item, in the item's OWN unit — price viewers only (others get {} without asking).
// Price list gives a piece price (a pipe length) and a per-metre price; an item kept in Rmt/Mtr uses the per-metre one.
// Items not on the price list fall back to their last purchase rate (item_master.last_rate via item_master_px).
const PER_METRE = /^(rmt|mtr|m|meter|metre|rm|r\.?mt)$/i;
export async function getCataloguePrices(items) {
  if (isDemo || !items?.length) return {};
  if (!(await canViewPrices())) return {};
  const unitOf = {}; items.forEach(o => { unitOf[o.item_id] = o.unit || ""; });
  const ids = Object.keys(unitOf).map(Number), out = {};
  for (let i = 0; i < ids.length; i += 300) {
    const part = ids.slice(i, i + 300);
    const { data } = await supabase.from("v_item_current_price").select("item_id, list_price_pcs, discount_pct, net_pcs, per_mtr").in("item_id", part);
    (data || []).forEach(r => {
      const perM = PER_METRE.test(String(unitOf[r.item_id]).trim());
      const net = Number(r.net_pcs) || null, pm = r.per_mtr != null ? Number(r.per_mtr) : null;
      out[r.item_id] = perM
        ? { rate: pm, per: unitOf[r.item_id], src: "list", list: Number(r.list_price_pcs) || null, disc: Number(r.discount_pct) || 0, pcs: net }
        : { rate: net, per: unitOf[r.item_id] || "Nos", src: "list", list: Number(r.list_price_pcs) || null, disc: Number(r.discount_pct) || 0 };
    });
  }
  const miss = ids.filter(id => out[id]?.rate == null);
  for (let i = 0; i < miss.length; i += 300) {
    const { data } = await supabase.from("item_master_px").select("id, last_rate").in("id", miss.slice(i, i + 300));
    (data || []).forEach(r => { if (Number(r.last_rate) > 0) out[r.id] = { ...(out[r.id] || {}), rate: Number(r.last_rate), per: unitOf[r.id] || "Nos", src: "last" }; });
  }
  return out;
}

// search: every word must appear somewhere in the product or one of its sizes / codes / item names (any order)
export function matchProduct(p, words) {
  if (!words.length) return true;
  const hay = (p.name + " " + p.family + " " + p.category + " " + p.opts.map(o => o.size + " " + (o.catSize || "") + " " + o.variant + " " + o.code + " " + o.name + " " + o.make + " " + o.material).join(" ")).toLowerCase();
  return words.every(w => hay.includes(w));
}
export const searchWords = q => String(q || "").toLowerCase().replace(/[^a-z0-9.°½¼¾"/x ]+/g, " ").split(/\s+/).filter(Boolean);
