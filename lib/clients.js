"use client";
// update393: CLIENT MASTER — one place for client name / GSTIN / PAN / addresses / contact.
// Delivery Challans (and later RA bills) read from here; nothing is typed twice.
import { supabase, isDemo } from "./supabase";

export const INDIAN_STATES = [
  ["01","Jammu & Kashmir"],["02","Himachal Pradesh"],["03","Punjab"],["04","Chandigarh"],["05","Uttarakhand"],["06","Haryana"],["07","Delhi"],["08","Rajasthan"],["09","Uttar Pradesh"],["10","Bihar"],["11","Sikkim"],["12","Arunachal Pradesh"],["13","Nagaland"],["14","Manipur"],["15","Mizoram"],["16","Tripura"],["17","Meghalaya"],["18","Assam"],["19","West Bengal"],["20","Jharkhand"],["21","Odisha"],["22","Chhattisgarh"],["23","Madhya Pradesh"],["24","Gujarat"],["26","Dadra & Nagar Haveli and Daman & Diu"],["27","Maharashtra"],["29","Karnataka"],["30","Goa"],["31","Lakshadweep"],["32","Kerala"],["33","Tamil Nadu"],["34","Puducherry"],["35","Andaman & Nicobar"],["36","Telangana"],["37","Andhra Pradesh"],["38","Ladakh"],
];
export const stateName = code => (INDIAN_STATES.find(s => s[0] === code) || [])[1] || "";

const COLS = "id, name, company_name, gstin, pan, bill_line1, bill_line2, bill_city, bill_state, bill_state_code, bill_pincode, ship_same, ship_line1, ship_line2, ship_city, ship_state, ship_state_code, ship_pincode, contact_name, mobile, is_active, created_at, updated_at";

export async function getClients({ activeOnly = false } = {}) {
  if (isDemo) return [];
  let q = supabase.from("clients").select(COLS).order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const [{ data, error }, { data: sites }] = await Promise.all([q, supabase.from("sites").select("id, name, client_id")]);
  if (error) {
    if (/clients|schema cache/i.test(error.message)) throw new Error("Run pipeskool_clients.sql (update 393) in Supabase first.");
    throw new Error(error.message);
  }
  const bySite = {}; (sites || []).forEach(s => { if (s.client_id) (bySite[s.client_id] = bySite[s.client_id] || []).push(s); });
  return (data || []).map(c => ({ ...c, sites: bySite[c.id] || [] }));
}

// Effective ship-to block (falls back to billing when "same as billing")
export function shipBlock(c) {
  if (!c) return null;
  if (c.ship_same !== false) return { line1: c.bill_line1, line2: c.bill_line2, city: c.bill_city, state: c.bill_state, state_code: c.bill_state_code, pincode: c.bill_pincode };
  return { line1: c.ship_line1, line2: c.ship_line2, city: c.ship_city, state: c.ship_state, state_code: c.ship_state_code, pincode: c.ship_pincode };
}
export const addrLines = b => b ? [b.line1, b.line2, [b.city, b.pincode].filter(Boolean).join(" - ")].filter(x => x && String(x).trim()) : [];

export async function saveClient(f, siteIds) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const name = String(f.name || "").trim();
  if (!name) return { ok: false, error: "Client name is required." };
  const gstin = String(f.gstin || "").trim().toUpperCase();
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return { ok: false, error: "GSTIN must be 15 characters (e.g. 24AAMCP3389A1ZF)." };
  const pan = String(f.pan || "").trim().toUpperCase();
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return { ok: false, error: "PAN must be 10 characters (e.g. AAMCP3389A)." };
  const t = v => { const s = String(v ?? "").trim(); return s || null; };
  const row = {
    name, company_name: t(f.company_name), gstin: gstin || null, pan: pan || null,
    bill_line1: t(f.bill_line1), bill_line2: t(f.bill_line2), bill_city: t(f.bill_city), bill_state_code: t(f.bill_state_code), bill_state: stateName(f.bill_state_code) || null, bill_pincode: t(f.bill_pincode),
    ship_same: f.ship_same !== false,
    ship_line1: t(f.ship_line1), ship_line2: t(f.ship_line2), ship_city: t(f.ship_city), ship_state_code: t(f.ship_state_code), ship_state: stateName(f.ship_state_code) || null, ship_pincode: t(f.ship_pincode),
    contact_name: t(f.contact_name), mobile: t(f.mobile), is_active: f.is_active !== false, updated_at: new Date().toISOString(),
  };
  let id = f.id;
  if (id) {
    const { error } = await supabase.from("clients").update(row).eq("id", id);
    if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? "A client with this name already exists." : error.message };
  } else {
    const { data, error } = await supabase.from("clients").insert(row).select("id").single();
    if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? "A client with this name already exists." : error.message };
    id = data.id;
  }
  if (Array.isArray(siteIds)) {   // site ↔ client link lives on sites.client_id (one client per site)
    const ids = siteIds.map(Number);
    const r1 = await supabase.from("sites").update({ client_id: null }).eq("client_id", id).not("id", "in", `(${ids.length ? ids.join(",") : 0})`);
    if (r1.error) return { ok: false, error: "Client saved, but site links failed: " + r1.error.message };
    if (ids.length) { const r2 = await supabase.from("sites").update({ client_id: id }).in("id", ids); if (r2.error) return { ok: false, error: "Client saved, but site links failed: " + r2.error.message }; }
  }
  return { ok: true, id };
}
