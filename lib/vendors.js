"use client";
import { supabase, isDemo } from "./supabase";

let demoVendors = [
  { id: 1, name: "Turakhia Steel", gstin: "24ABCDE1234F1Z5", contact: "Nilesh Patel", phone: "9825000001", email: "", address: "GIDC Phase 2, Ahmedabad", payment_terms: "50% advance, 50% on delivery", categories: "Pipe, Fitting", is_active: true },
  { id: 2, name: "Shree Pipe Traders", gstin: "24XYZAB5678K1Z2", contact: "", phone: "9825000002", email: "", address: "Odhav, Ahmedabad", payment_terms: "30 days credit", categories: "Pipe", is_active: true },
  { id: 3, name: "Gujarat Fittings Co", gstin: "24LMNOP9012Q1Z8", contact: "", phone: "9825000003", email: "", address: "Vatva, Ahmedabad", payment_terms: "Against delivery", categories: "Fitting, Valve", is_active: true },
];

export async function getVendors(includeInactive = true, options = {}) {
  if (isDemo) return includeInactive ? demoVendors : demoVendors.filter(v => v.is_active);
  let q = supabase.from("vendors").select("*").order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error && options?.strict) throw new Error(error.message);
  return data || [];
}

export async function saveVendor(v) {
  if (isDemo) {
    if (v.id) demoVendors = demoVendors.map(x => x.id === v.id ? { ...x, ...v } : x);
    else demoVendors = [...demoVendors, { ...v, id: Date.now() }];
    return { ok: true };
  }
  const payload = { name: v.name, gstin: v.gstin || null, contact: v.contact || null, phone: v.phone || null,
    email: v.email || null, address: v.address || null, payment_terms: v.payment_terms || null,
    categories: v.categories || null, is_active: v.is_active !== false };
  let error;
  if (v.id) ({ error } = await supabase.from("vendors").update(payload).eq("id", v.id));
  else ({ error } = await supabase.from("vendors").insert(payload));
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function toggleVendorActive(id, active) {
  if (isDemo) { demoVendors = demoVendors.map(v => v.id === id ? { ...v, is_active: active } : v); return { ok: true }; }
  const { error } = await supabase.from("vendors").update({ is_active: active }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Hard delete — only possible when the vendor has no POs/records (FK-protected).
export async function deleteVendor(id) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (!error) return { ok: true };
  if (String(error.code) === "23503" || /foreign key/i.test(error.message))
    return { ok: false, error: "This vendor has purchase orders / records in their name. History must be preserved — deactivate instead." };
  return { ok: false, error: error.message };
}
