"use client";
// update440: vendor enquiries — pending-only items (server), ENQ numbers, send log, share link, message template
import { supabase, isDemo } from "./supabase";
const clean = e => /fn_enquiry|enquiries|enquiry_settings|schema cache/i.test(String(e?.message || "")) ? "Run pipeskool_enquiry.sql (update 440) first." : (e?.message || "Failed.");
export async function getPendingEnquiryItems(indentId, itemIds) {
  const { data, error } = await supabase.rpc("fn_enquiry_pending_items", { p_indent_id: Number(indentId), p_item_ids: itemIds && itemIds.length ? itemIds.map(Number) : null });
  if (error) return { rows: [], excluded: 0, error: clean(error) };
  const rows = (data || []).map(r => ({ id: r.item_id, item_name: r.item_name, category: r.category || "Other", unit: r.unit, spec: r.spec, indent_qty: Number(r.indent_qty), po_qty: Number(r.po_qty), balance_qty: Number(r.balance_qty), po_nos: r.po_nos || "" }));
  return { rows, excluded: data?.[0]?.excluded_count ?? 0 };
}
export async function getIndentHeader(indentId) {
  const { data } = await supabase.from("material_indents").select("id, indent_no, required_by, sites(name)").eq("id", Number(indentId)).maybeSingle();
  return data ? { id: data.id, indent_no: data.indent_no, required_by: data.required_by, site: data.sites?.name || "" } : null;
}
export async function getVendorContacts(names) {
  if (!names?.length) return {};
  const { data } = await supabase.from("vendors").select("id, name, phone, email").in("name", names);
  const m = {}; (data || []).forEach(v => { m[v.name.toLowerCase()] = v; }); return m;
}
export async function setVendorContact(name, phone, email) {
  const { data, error } = await supabase.rpc("fn_vendor_set_contact", { p_vendor_name: name, p_phone: phone || null, p_email: email || null });
  if (error) return { ok: false, error: clean(error) }; return data?.ok ? { ok: true } : { ok: false, error: data?.error };
}
export async function createEnquiry(indentId, vendorName, itemIds, via, message) {
  const { data, error } = await supabase.rpc("fn_enquiry_create", { p_indent_id: Number(indentId), p_vendor_name: vendorName, p_item_ids: itemIds.map(Number), p_via: via, p_message: message || null });
  if (error) return { ok: false, error: clean(error) }; return data?.ok ? { ok: true, ...data } : { ok: false, error: data?.error || "Could not create enquiry." };
}
export async function getEnquiriesForIndent(indentId) {
  const { data } = await supabase.from("enquiries").select("id, enq_no, vendor_name, items, via, sent_by_name, sent_at, share_token").eq("indent_id", Number(indentId)).order("sent_at", { ascending: false });
  return data || [];
}
export async function getEnquiry(id) { const { data } = await supabase.from("enquiries").select("*").eq("id", Number(id)).maybeSingle(); return data; }
export async function getPublicEnquiry(token) { const { data } = await supabase.rpc("fn_enquiry_public", { p_token: token }); return data || null; }
export async function getTemplate() { const { data } = await supabase.from("enquiry_settings").select("template").eq("id", 1).maybeSingle(); return data?.template || "Hello {vendor} 🙏\nGreetings from Pipeskool Projects! Please find our enquiry {enq_no} for {n} items (Indent {indent}, needed by {date}). Kindly share your best rates and delivery time. Thank you! 😊\n📎 {link}"; }
export async function saveTemplate(t) { const { error } = await supabase.from("enquiry_settings").upsert({ id: 1, template: t, updated_at: new Date().toISOString() }); return error ? { ok: false, error: clean(error) } : { ok: true }; }
export function fillTemplate(t, v) { return String(t || "").replace(/\{(vendor|enq_no|n|indent|date|link)\}/g, (_, k) => v[k] ?? ""); }
export function waLink(mobile, text) { const d = String(mobile || "").replace(/\D/g, "").slice(-10); return `https://wa.me/91${d}?text=${encodeURIComponent(text)}`; }
export function mailtoLink(email, subject, body) { return `mailto:${encodeURIComponent(email || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; }
