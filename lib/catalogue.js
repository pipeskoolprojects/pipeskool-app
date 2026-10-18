"use client";
// update464: ORDER MATERIALS — the Astral catalogue grouped into product cards (one card per product, every
// size a separate Material Master item). Read-only over catalogue_products / catalogue_product_items + item_master.
// No price column is read here; prices come only through v_item_current_price, which the database empties for
// anyone without Price access (update 463) — site roles never even make that request.
import { supabase, isDemo } from "./supabase";
import { canViewPrices } from "./prices";

export const catalogueImage = f => (f ? "/catalogue/" + f : null);

const FAMILY_ORDER = ["CPVC Pro", "Aquarius", "Aquasafe", "Drainmaster", "Silencio", "Drain Pro", "Foamcore", "Underground", "Drex", "Telerex"];
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
      .select("id, product_id, item_id, size_label, variant, maker_code, link_basis, sort_order, item_master(id, display_name, unit, item_type, is_active, pending_review)")
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
      id: r.id, item_id: r.item_id, size: r.size_label, variant: r.variant || "", code: r.maker_code || "",
      unit: im.unit || "Nos", name: im.display_name, item_type: im.item_type || "", basis: r.link_basis, sort: Number(r.sort_order) || 0,
    });
  });
  const products = (p.data || []).map(x => ({
    id: x.id, family: x.family, category: x.category, name: x.name, image: x.image, pending: Number(x.pending_sizes) || 0,
    opts: (byP[x.id] || []).sort((a, b) => a.sort - b.sort || a.id - b.id),
  })).filter(x => x.opts.length);
  const families = [...new Set(products.map(x => x.family))].sort((a, b) => famRank(a) - famRank(b) || a.localeCompare(b));
  return { products, families, missing: false };
}

// list / net price per Material Master item — price viewers only (others get {} without asking)
export async function getCataloguePrices(itemIds) {
  if (isDemo || !itemIds?.length) return {};
  if (!(await canViewPrices())) return {};
  const ids = [...new Set(itemIds)], out = {};
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from("v_item_current_price").select("item_id, list_price_pcs, discount_pct, net_pcs, per_mtr").in("item_id", ids.slice(i, i + 300));
    (data || []).forEach(r => { out[r.item_id] = { list: Number(r.list_price_pcs) || null, disc: Number(r.discount_pct) || 0, net: Number(r.net_pcs) || null, per_m: r.per_mtr != null ? Number(r.per_mtr) : null }; });
  }
  return out;
}

// search: every word must appear somewhere in the product or one of its sizes / codes / item names (any order)
export function matchProduct(p, words) {
  if (!words.length) return true;
  const hay = (p.name + " " + p.family + " " + p.category + " " + p.opts.map(o => o.size + " " + o.variant + " " + o.code + " " + o.name).join(" ")).toLowerCase();
  return words.every(w => hay.includes(w));
}
export const searchWords = q => String(q || "").toLowerCase().replace(/[^a-z0-9.°½¼¾"/x ]+/g, " ").split(/\s+/).filter(Boolean);
