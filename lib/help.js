"use client";
// update401: HELP CENTER data — articles (module-wise, role-based, contextual by route), feedback, admin editor.
import { supabase, isDemo } from "./supabase";
import { getSession } from "./auth";

const clean = e => { const m = String(e?.message || e || ""); return /help_articles|fn_help_|schema cache/i.test(m) ? "Run pipeskool_help_center.sql (update 401) in Supabase first." : m.replace(/^.*?ERROR:\s*/i, ""); };
export const MODULE_META = {
  attendance: ["🕒", "Attendance & Labour"], wages: ["₹", "Payroll"], workers: ["👷", "Workers & Staff"], indent: ["🧾", "Indent & Purchase"],
  stock: ["📦", "Material Stock"], money: ["💸", "Money & Expenses"], dpr: ["📋", "Site Execution"], letters: ["📄", "Letters & Documents"],
  billing: ["📐", "Commercial / Billing"], assets: ["🔧", "Tools & Assets"], rentals: ["🚜", "Rentals"], notices: ["📢", "Communication"], admin: ["⚙️", "Admin"], general: ["❓", "General"],
};
export function canEditHelp(s = getSession()) { return !!s && (s.role === "director" || s.role === "it_executive"); }
export function roleMatch(a, s) { const r = a.roles || ["all"]; return r.includes("all") || (s?.role && r.includes(s.role)); }

export async function getArticles() {
  if (isDemo) return [];
  const { data, error } = await supabase.from("help_articles").select("*").order("module").order("sort").order("title");
  if (error) throw new Error(clean(error));
  return data || [];
}
// contextual: articles whose routes match the current path (longest prefix wins first)
export function forRoute(list, path) {
  const p = (path || "").replace(/\?.*$/, "");
  return list.filter(a => (a.routes || []).some(r => p === r || p.startsWith(r + "/") || (r.endsWith("/page") && p === r.replace(/\/page$/, "")))).sort((x, y) => (x.sort || 0) - (y.sort || 0));
}
export function search(list, q) {
  const s = q.trim().toLowerCase(); if (!s) return list;
  const hit = t => String(t || "").toLowerCase().includes(s);
  return list.filter(a => hit(a.title) || hit(a.summary) || hit(a.category) || (a.steps || []).some(x => hit(x.title) || hit(x.body)) || (a.faqs || []).some(x => hit(x.q) || hit(x.a)));
}
export async function saveArticle(id, p) { if (isDemo) return { ok: false, error: "Demo mode." }; const { data, error } = await supabase.rpc("fn_help_save", { p_id: id || null, p }); return error ? { ok: false, error: clean(error) } : { ok: true, id: data }; }
export async function deleteArticle(id) { if (isDemo) return { ok: false, error: "Demo mode." }; const { error } = await supabase.rpc("fn_help_delete", { p_id: id }); return error ? { ok: false, error: clean(error) } : { ok: true }; }
export async function sendFeedback(articleId, helpful, comment) { if (isDemo) return { ok: false, error: "Demo mode." }; const { error } = await supabase.rpc("fn_help_feedback", { p_article_id: articleId, p_helpful: helpful, p_comment: comment || null }); return error ? { ok: false, error: clean(error) } : { ok: true }; }
export async function feedbackStats() { if (isDemo) return {}; const { data, error } = await supabase.rpc("fn_help_feedback_stats"); if (error) return {}; const m = {}; (data || []).forEach(r => { m[r.article_id] = r; }); return m; }
