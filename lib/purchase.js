"use client";
import { supabase, isDemo } from "./supabase";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
export { inr };

// ---------- demo data ----------
let demoIndents = [
  { id: 1, indent_no: "IND/26/041", site: "KEI Sanand", site_code: "KEI", required_by: "2026-06-18", urgency: "urgent", status: "pending",
    items: [{ item_id: 3, name: "Pipe - MS 350NB (Heavy)", qty: 300, unit: "Rmt", inStockSame: 88, inStockOther: [{ site: "The Creek", qty: 0 }] }] },
  { id: 2, indent_no: "IND/26/042", site: "SOUL Campus", site_code: "SOUL", required_by: "2026-06-20", urgency: "normal", status: "pending",
    items: [{ item_id: 6, name: "Fitting - CPVC Elbow 25mm [Astral]", qty: 200, unit: "Nos", inStockSame: 55, inStockOther: [{ site: "KEI Sanand", qty: 120 }] }] },
  { id: 3, indent_no: "IND/26/039", site: "KEI Sanand", site_code: "KEI", required_by: "2026-06-15", urgency: "normal", status: "po_issued",
    items: [{ item_id: 4, name: "Pipe - MS 200NB (Heavy)", qty: 400, unit: "Rmt", inStockSame: 82, inStockOther: [] }] },
  { id: 4, indent_no: "IND/26/036", site: "The Creek", site_code: "CREEK", required_by: "2026-06-10", urgency: "normal", status: "dispatched",
    items: [{ item_id: 5, name: "Pipe - HDPE 160mm (PE-80) [Dutron]", qty: 200, unit: "Rmt", inStockSame: 128, inStockOther: [] }] },
];

const demoVendors = [
  { id: 1, name: "Shree Hardware & Pipes", contact: "Jayesh Shah", mobile: "9824011111", terms: "30 days credit", rating: 4.2, gst: "24ABCDS1234A1Z5" },
  { id: 2, name: "Gujarat Pipe Traders", contact: "Nilesh Patel", mobile: "9824022222", terms: "50% adv, 50% delivery", rating: 3.8, gst: "24XYZGP5678B1Z3" },
  { id: 3, name: "Astral Distributor - Ahmedabad", contact: "Ramesh Mehta", mobile: "9824033333", terms: "Advance", rating: 4.6, gst: "24ASTRL9012C1Z7" },
];

const demoQuotes = [
  { vendor: "Shree Hardware & Pipes", vendor_id: 1, rate: 1850, delivery_days: 4 },
  { vendor: "Gujarat Pipe Traders", vendor_id: 2, rate: 1795, delivery_days: 6 },
  { vendor: "Astral Distributor - Ahmedabad", vendor_id: 3, rate: 1880, delivery_days: 3 },
];

const demoMatch = [
  { po_no: "PO/26/051", vendor: "Gujarat Pipe Traders", site_code: "KEI", display_name: "Pipe - MS 200NB (Heavy)", po_qty: 400, received_qty: 400, billed_qty: 400, rate: 1120, match_flag: "matched" },
  { po_no: "PO/26/048", vendor: "Shree Hardware & Pipes", site_code: "SOUL", display_name: "Pipe - UPVC 110mm (SWR)", po_qty: 2000, received_qty: 1800, billed_qty: 2000, rate: 410, match_flag: "overbilled" },
  { po_no: "PO/26/046", vendor: "Astral Distributor", site_code: "CREEK", display_name: "Pipe - HDPE 160mm (PE-80)", po_qty: 200, received_qty: 150, billed_qty: 150, rate: 620, match_flag: "short_supply" },
];

const demoPendingDel = [
  { po_no: "PO/26/053", vendor: "Gujarat Pipe Traders", item: "Pipe - MS 350NB (Heavy)", qty: 300, received: 0, eta: "2026-06-17", site: "KEI" },
  { po_no: "PO/26/046", vendor: "Astral Distributor", item: "Pipe - HDPE 160mm", qty: 200, received: 150, eta: "2026-06-14", site: "CREEK" },
];

const demoTrend = {
  3: [ // MS 350NB
    { date: "2026-02", rate: 1720 }, { date: "2026-03", rate: 1760 }, { date: "2026-04", rate: 1810 },
    { date: "2026-05", rate: 1795 }, { date: "2026-06", rate: 1850 },
  ],
};

const demoPerf = [
  { vendor: "Astral Distributor - Ahmedabad", orders: 14, onTime: 13, rejections: 0, rating: 4.6 },
  { vendor: "Shree Hardware & Pipes", orders: 22, onTime: 18, rejections: 1, rating: 4.2 },
  { vendor: "Gujarat Pipe Traders", orders: 16, onTime: 11, rejections: 2, rating: 3.8 },
];

// ---------- mobile: indents ----------
export async function createIndent(payload) {
  if (isDemo) {
    const no = "IND/26/" + String(40 + demoIndents.length + 1).padStart(3, "0");
    demoIndents = [{ id: Date.now(), indent_no: no, site: "KEI Sanand", site_code: "KEI",
      required_by: payload.required_by, urgency: payload.urgency, status: "pending",
      items: payload.items.map(i => ({ item_id: i.item_id, name: i.name, qty: i.qty, unit: i.unit, inStockSame: 0, inStockOther: [] })) }, ...demoIndents];
    return { ok: true, no };
  }
  const no = "IND/" + new Date().getFullYear().toString().slice(2) + "/" + Date.now().toString().slice(-4);
  const { data: hdr, error } = await supabase.from("indents").insert({
    indent_no: no, site_id: payload.site_id, required_by: payload.required_by,
    purpose: payload.purpose, urgency: payload.urgency, raised_by: payload.raised_by,
  }).select().single();
  if (error) return { ok: false, error: error.message };
  const { error: e2 } = await supabase.from("indent_items").insert(
    payload.items.map(i => ({ indent_id: hdr.id, item_id: i.item_id, qty: i.qty })));
  return e2 ? { ok: false, error: e2.message } : { ok: true, no };
}

export async function getMyIndents(siteId) {
  if (isDemo) return demoIndents;
  const { data } = await supabase.from("indents")
    .select("id, indent_no, required_by, urgency, status, sites(name), indent_items(qty, item_master(display_name, unit))")
    .order("created_at", { ascending: false }).limit(20);
  return (data || []).map(d => ({
    id: d.id, indent_no: d.indent_no, site: d.sites?.name, required_by: d.required_by,
    urgency: d.urgency, status: d.status,
    items: (d.indent_items || []).map(it => ({ name: it.item_master?.display_name, qty: Number(it.qty), unit: it.item_master?.unit })),
  }));
}

// ---------- web: approval queue with stock check ----------
export async function getIndentQueue() {
  if (isDemo) return demoIndents.filter(i => i.status === "pending");
  const { data } = await supabase.from("indents")
    .select("id, indent_no, required_by, urgency, status, sites(name, code), indent_items(item_id, qty, item_master(display_name, unit))")
    .eq("status", "pending");
  // stock check per item across sites
  const out = [];
  for (const d of data || []) {
    const items = [];
    for (const it of d.indent_items || []) {
      const { data: bal } = await supabase.from("v_stock_balance")
        .select("site_name, balance, site_code").eq("item_id", it.item_id);
      const same = (bal || []).find(b => b.site_code === d.sites?.code);
      const other = (bal || []).filter(b => b.site_code !== d.sites?.code && Number(b.balance) > 0)
        .map(b => ({ site: b.site_name, qty: Number(b.balance) }));
      items.push({ item_id: it.item_id, name: it.item_master?.display_name, qty: Number(it.qty),
        unit: it.item_master?.unit, inStockSame: same ? Number(same.balance) : 0, inStockOther: other });
    }
    out.push({ id: d.id, indent_no: d.indent_no, site: d.sites?.name, site_code: d.sites?.code,
      required_by: d.required_by, urgency: d.urgency, status: d.status, items });
  }
  return out;
}

export async function reviewIndent(id, status, note) {
  if (isDemo) { demoIndents = demoIndents.map(i => i.id === id ? { ...i, status } : i); return { ok: true }; }
  const { error } = await supabase.from("indents")
    .update({ status, reject_note: note || null, approved_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- vendors & rate comparison ----------
export async function getVendors() {
  if (isDemo) return demoVendors;
  const { data } = await supabase.from("vendors").select("*").eq("is_active", true).order("name");
  return (data || []).map(v => ({ id: v.id, name: v.name, contact: v.contact_person,
    mobile: v.contact_mobile, terms: v.payment_terms, rating: Number(v.rating), gst: v.gst_number }));
}

export async function getQuotesDemo() { return demoQuotes; }

// ---------- 3-way match, pending deliveries, performance, trend ----------
export async function getThreeWayMatch() {
  if (isDemo) return demoMatch;
  const { data } = await supabase.from("v_three_way_match").select("*");
  return (data || []).map(m => ({ po_no: m.po_no, vendor: m.vendor, site_code: m.site_code,
    display_name: m.display_name, po_qty: Number(m.po_qty), received_qty: Number(m.received_qty),
    billed_qty: Number(m.billed_qty), rate: Number(m.rate), match_flag: m.match_flag }));
}

export async function getPendingDeliveries() {
  if (isDemo) return demoPendingDel;
  const { data } = await supabase.from("po_items")
    .select("qty, received_qty, item_master(display_name), purchase_orders(po_no, vendors(name), sites(code))")
    .neq("status", "closed");
  return (data || []).filter(r => Number(r.received_qty) < Number(r.qty)).map(r => ({
    po_no: r.purchase_orders?.po_no, vendor: r.purchase_orders?.vendors?.name,
    item: r.item_master?.display_name, qty: Number(r.qty), received: Number(r.received_qty),
    eta: "", site: r.purchase_orders?.sites?.code }));
}

export async function getVendorPerformance() {
  if (isDemo) return demoPerf;
  const { data } = await supabase.from("vendors").select("name, rating").eq("is_active", true);
  return (data || []).map(v => ({ vendor: v.name, orders: 0, onTime: 0, rejections: 0, rating: Number(v.rating) }));
}

export async function getPriceTrend(itemId) {
  if (isDemo) return demoTrend[itemId] || demoTrend[3];
  const { data } = await supabase.from("vendor_rates")
    .select("rate, quoted_on").eq("item_id", itemId).order("quoted_on");
  return (data || []).map(r => ({ date: r.quoted_on?.slice(0, 7), rate: Number(r.rate) }));
}
