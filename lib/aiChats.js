"use client";
// update429: AI Assistant chat history — stored in Supabase (ai_chats), RLS = own rows only.
import { supabase, isDemo } from "./supabase";
const clean = e => /ai_chats|schema cache|fn_my_app_user_id/i.test(String(e?.message || "")) ? "Run pipeskool_ai_chats.sql (update 429) first." : (e?.message || "Chat history unavailable.");
const strip = msgs => (msgs || []).filter(m => !m.thinking).map(m => { const { _file, ...rest } = m.bill ? { ...m, bill: { ...m.bill, _file: undefined } } : m; return rest; }).slice(-200);
export function autoTitle(text) {
  const t = String(text || "").trim().replace(/\s+/g, " "); if (!t) return "New chat";
  const name = (t.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/) || [])[1];
  const topic = /attend|hazri|absent|present/i.test(t) ? "Attendance" : /expense|kharch|voucher|petty/i.test(t) ? "Expense" : /\bpo\b|purchase order/i.test(t) ? "PO" : /indent/i.test(t) ? "Indent" : /grn|stock|inventory/i.test(t) ? "Stock" : /vendor|turakhia|outstanding/i.test(t) ? "Vendor" : /worker|staff|employee/i.test(t) ? "Workers" : /salary|payroll/i.test(t) ? "Payroll" : null;
  const month = (t.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i) || [])[1];
  const po = (t.match(/PO\/\d{4}\/\d{3,4}/i) || [])[0];
  if (po) return `${po} ${/deliver/i.test(t) ? "Delivery" : "Detail"}`;
  if (name && topic) return `${name} ${month ? month + " " : ""}${topic}`;
  if (topic) return `${month ? month + " " : ""}${/pending/i.test(t) ? "Pending " : ""}${topic} ${/report|excel|pdf|summary|total|kitna/i.test(t) ? "Report" : "Query"}`.trim();
  return t.slice(0, 40) + (t.length > 40 ? "…" : "");
}
export async function listChats(q = "") { if (isDemo) return []; let s = supabase.from("ai_chats").select("id, title, updated_at, created_at, archived, lang").eq("archived", false).order("updated_at", { ascending: false }).limit(60); if (q) s = s.ilike("title", `%${q}%`); const { data, error } = await s; if (error) throw new Error(clean(error)); return data || []; }
export async function loadChat(id) { if (isDemo) return null; const { data, error } = await supabase.from("ai_chats").select("*").eq("id", id).maybeSingle(); if (error) throw new Error(clean(error)); return data; }
export async function saveChat(id, { userId, title, messages, ctx, lang }) {
  if (isDemo) return { ok: true, id };
  const row = { messages: strip(messages), ctx: ctx || null, lang: lang || "en", updated_at: new Date().toISOString() }; if (title) row.title = title;
  if (id) { const { error } = await supabase.from("ai_chats").update(row).eq("id", id); return error ? { ok: false, error: clean(error) } : { ok: true, id }; }
  const { data, error } = await supabase.from("ai_chats").insert({ ...row, user_id: userId, title: title || "New chat" }).select("id").single(); return error ? { ok: false, error: clean(error) } : { ok: true, id: data.id };
}
export async function renameChat(id, title) { const { error } = await supabase.from("ai_chats").update({ title, updated_at: new Date().toISOString() }).eq("id", id); return error ? { ok: false, error: clean(error) } : { ok: true }; }
export async function archiveChat(id) { const { error } = await supabase.from("ai_chats").update({ archived: true }).eq("id", id); return error ? { ok: false, error: clean(error) } : { ok: true }; }
export async function deleteChat(id) { const { error } = await supabase.from("ai_chats").delete().eq("id", id); return error ? { ok: false, error: clean(error) } : { ok: true }; }
