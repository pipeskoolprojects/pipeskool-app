// Assistant engine — update135.
// Grounded strictly in the KB + live personal data. No invented features.
import { supabase, isDemo } from "./supabase";
import { notifyUsers } from "./notify";
import { KB, ROLE_SUGGEST, PAGE_CONTEXT } from "./assistantKB";
import { getLeaveContext, typeLabel } from "./leave";

// ---- language detection by script ----
// Full answers exist in en/hi/gu. Other Indian scripts are detected and get a
// polite note + the English answer until the live-AI layer is enabled.
const SCRIPTS = [
  [/[\u0A80-\u0AFF]/, "gu", "Gujarati"], [/[\u0900-\u097F]/, "hi", "Hindi/Marathi"],
  [/[\u0B80-\u0BFF]/, "ta", "Tamil"], [/[\u0C00-\u0C7F]/, "te", "Telugu"],
  [/[\u0C80-\u0CFF]/, "kn", "Kannada"], [/[\u0D00-\u0D7F]/, "ml", "Malayalam"],
  [/[\u0A00-\u0A7F]/, "pa", "Punjabi"], [/[\u0980-\u09FF]/, "bn", "Bengali/Odia*"],
  [/[\u0B00-\u0B7F]/, "or", "Odia"],
];
export function detectLang(text) {
  for (const [re, code, label] of SCRIPTS) if (re.test(text)) return { code, label };
  return { code: "en", label: "English" };
}
const answerLang = c => (c === "hi" || c === "gu" ? c : "en");

// ---- KB matching ----
const norm = s => String(s || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
export function matchKB(query, sess, pathname) {
  const q = norm(query);
  if (!q) return [];
  const boosted = PAGE_CONTEXT[pathname] || [];
  const scored = KB.map(e => {
    let s = 0;
    for (const k of e.k) { const nk = norm(k); if (nk && q.includes(nk)) s += nk.length > 6 ? 3 : 2; }
    for (const w of q.split(" ")) if (w.length > 3 && e.k.some(k => norm(k).includes(w))) s += 1;
    if (boosted.includes(e.id)) s += 1.5;
    if (e.roles && sess && !e.roles.includes(sess.role) && sess.role !== "director") s -= 1;
    return { e, s };
  }).filter(x => x.s > 1.5).sort((a, b) => b.s - a.s);
  return scored.slice(0, 3).map(x => x.e);
}

export function suggestionsFor(sess, pathname) {
  const ids = [...(PAGE_CONTEXT[pathname] || []), ...(ROLE_SUGGEST[sess?.role] || ROLE_SUGGEST.default)];
  const seen = new Set(); const out = [];
  for (const id of ids) { if (seen.has(id)) continue; seen.add(id); const e = KB.find(x => x.id === id); if (e) out.push(e); if (out.length >= 5) break; }
  return out;
}

// ---- live personal-data answers (deterministic, always correct) ----
export async function liveAnswer(query, sess, lang) {
  if (!sess || isDemo) return null;
  const q = norm(query);
  const L = (en, hi, gu) => (lang === "hi" ? hi : lang === "gu" ? gu : en);
  try {
    if (/\b(my|मेरी|मेरा|મારી|મારો)?\s*(leave balance|balance|बैलेंस|બેલેન્સ|kitni chutti|छुट्टी बची|રજા બાકી)/.test(q) || q.includes("leave balance")) {
      const c = await getLeaveContext(sess.id);
      if (c) return { title: L("Your leave balance", "आपका छुट्टी बैलेंस", "તમારું રજા બેલેન્સ"),
        steps: [
          L(`Annual entitlement: ${c.annual} · used: ${c.used}${c.reserved ? ` · reserved (approved upcoming): ${c.reserved}` : ""}`,
            `सालाना: ${c.annual} · इस्तेमाल: ${c.used}${c.reserved ? ` · आरक्षित: ${c.reserved}` : ""}`,
            `વાર્ષિક: ${c.annual} · વપરાયેલ: ${c.used}${c.reserved ? ` · અનામત: ${c.reserved}` : ""}`),
          L(`Available now: ${c.availableNow}${c.inH1 ? " (50% cap till September)" : ""}`,
            `अभी उपलब्ध: ${c.availableNow}${c.inH1 ? " (सितंबर तक 50% सीमा)" : ""}`,
            `અત્યારે ઉપલબ્ધ: ${c.availableNow}${c.inH1 ? " (સપ્ટે. સુધી 50% મર્યાદા)" : ""}`),
          ...(c.inH1 ? [L(`Unlocking in October: ${c.unlockingOct}`, `अक्टूबर में खुलेगा: ${c.unlockingOct}`, `ઑક્ટોબરમાં ખુલશે: ${c.unlockingOct}`)] : []),
        ], link: "/leave" };
    }
    if (/\b(approval status|pending request|my request|status|स्टेटस|સ્ટેટસ|मेरी अर्ज़ी|મારી અરજી)\b/.test(q) || q.includes("approval status")) {
      const { data } = await supabase.from("leave_requests").select("*").eq("staff_id", sess.id)
        .in("status", ["pending", "info_needed", "approved"]).order("applied_at", { ascending: false }).limit(5);
      const rows = data || [];
      return { title: L("Your recent requests", "आपकी हाल की अर्ज़ियाँ", "તમારી તાજેતરની અરજીઓ"),
        steps: rows.length ? rows.map(r =>
          `${typeLabel(r.leave_type)} · ${r.from_date}${r.to_date !== r.from_date ? "→" + r.to_date : ""} · ${r.days}d — ${r.status.toUpperCase()}`)
          : [L("No pending leave requests. Expense/indent status shows on their own pages.",
               "कोई लंबित छुट्टी अर्ज़ी नहीं। ख़र्च/इंडेंट का स्टेटस उनके पेज पर दिखता है।",
               "કોઈ પેન્ડિંગ રજા અરજી નથી. ખર્ચ/ઇન્ડેન્ટ સ્ટેટસ તેમના પેજ પર દેખાય.")],
        link: "/leave" };
    }
    if (/\b(my ticket|ticket status|टिकट|ટિકિટ)\b/.test(q)) {
      const { data } = await supabase.from("support_tickets").select("id, subject, status, created_at")
        .eq("staff_id", sess.id).order("created_at", { ascending: false }).limit(5);
      const rows = data || [];
      return { title: L("Your support tickets", "आपके सपोर्ट टिकट", "તમારી સપોર્ટ ટિકિટ"),
        steps: rows.length ? rows.map(t => `#${t.id} ${t.subject} — ${t.status.toUpperCase()}`)
          : [L("You have no tickets yet.", "अभी कोई टिकट नहीं।", "હજી કોઈ ટિકિટ નથી.")], link: null };
    }
  } catch {}
  return null;
}

// ---- support tickets ----
export async function createTicket(sess, route, subject, body, screenshotFile, pathname) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  let screenshot_url = null;
  if (screenshotFile) {
    const path = `tickets/${sess.id}/${Date.now()}_${screenshotFile.name.replace(/[^\w.\-]/g, "_")}`;
    const up = await supabase.storage.from("attendance-photos").upload(path, screenshotFile, { upsert: true });
    if (!up.error) screenshot_url = supabase.storage.from("attendance-photos").getPublicUrl(path).data.publicUrl;
  }
  const diagnostic = {
    page: pathname, role: sess.role, staff: sess.name, sites: (sess.sites || []).map(s => s.name),
    device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 140) : null,
    app_version: 135, at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("support_tickets").insert({
    staff_id: sess.id, route, subject: subject.trim(), body: body?.trim() || null, screenshot_url, diagnostic,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  // notify directors + IT on the bell (best effort)
  try {
    const { data: admins } = await supabase.from("app_users").select("id").in("role", ["director", "it_executive"]).eq("is_active", true);
    if (admins?.length) await notifyUsers({ userIds: admins.map(a => a.id), kind: "ticket",
      requestId: data.id, status: "open",
      title: `Support ticket #${data.id} (${route})`, body: subject.trim() });
  } catch {}
  return { ok: true, id: data.id };
}

export async function getTicketQueue() {
  // update240: support_tickets also has TWO foreign keys to app_users (staff_id and
  // resolved_by) — same ambiguous-embed bug as staff_payouts. Name the column.
  const { data, error } = await supabase.from("support_tickets")
    .select("*, app_users:staff_id(full_name, role)").order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}
export async function updateTicket(sess, id, patch) {
  const { error } = await supabase.from("support_tickets").update({
    ...patch, ...(patch.status === "resolved" ? { resolved_at: new Date().toISOString(), resolved_by: sess.id } : {}),
  }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export { answerLang };

// update416: Groq-backed answer via the server route. Returns null when the key is not set (KB-only mode) or on error.
export async function askAI(history, lang, sess, pathname) {
  try {
    const { supabase, isDemo } = await import("./supabase");
    if (isDemo) return { error: "Demo mode — AI is off." };
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) { console.warn("ASSISTANT_AI_SKIPPED no session token"); return { error: "No login session on this device — log in again to use the AI assistant." }; }
    console.log("ASSISTANT_AI_CALL", JSON.stringify({ turns: history.length, lang }));
    const r = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: history, lang, role: sess?.role || "", pathname }) });
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    console.log("ASSISTANT_AI_RESULT", JSON.stringify({ status: r.status, ok: !!j.ok, error: j.error || null }));
    if (!j.ok) return { error: j.error === "no_key" ? "AI assistant is not configured yet — please tell the admin." : /rate limit|429|busy|unavailable/i.test(j.error || "") ? "AI service is temporarily busy. Please try again." : /validation|schema|null/i.test(j.error || "") ? "I couldn't process that request. Please rephrase it." : (j.error || "AI service is temporarily busy. Please try again.") };
    return { text: j.text, dataset: j.dataset || null, tools: j.tools || [], confirm: j.confirm || null };
  } catch (e) { console.error("ASSISTANT_AI_RESULT", "network error", e?.message); return { error: "Could not reach /api/ai/chat (" + (e?.message || "network") + ")." }; }
}
export async function aiStatus() { try { const r = await fetch("/api/ai/chat"); const j = await r.json(); return j?.configured ? { on: true, model: j.model } : { on: false }; } catch { return { on: false }; } }

// update418: questions that need REAL ERP data skip the how-to Help Center and go straight to the ERP agent
export function isDataQuery(text) {
  const t = String(text || "").toLowerCase();
  return /\b(kitne|kitna|kitni|kaun|kon|batao|bata|dikhao|list|count|how many|how much|who is|which|total|summary|report|trend|aaj|today|kal|yesterday|last \d+|pichle|pichhle|is (month|week|hafte|mahine)|this (month|week)|pending|absent|present|nahi aa|expense|kharch|indent|po\b|purchase order|grn|received|site[- ]?wise|excel|xlsx|export)\b/.test(t)
    && !/\b(how do i|how to|kaise|kese|where do i|kahan|steps?)\b/.test(t);
}
export function wantsExcel(text) { return /\b(excel|xlsx|export|spreadsheet|sheet bana|excel me|excel bana|report (bana|export|download))\b/i.test(String(text || "")); }
export async function downloadDataset(ds, meta = {}) {   // update421: built on the server (valid .xlsx, tested with openpyxl)
  if (!ds?.rows?.length) return false;
  try {
    const { supabase } = await import("./supabase"); const { data } = await supabase.auth.getSession(); const token = data?.session?.access_token;
    const r = await fetch("/api/ai/export", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ dataset: ds, meta }) });
    if (!r.ok) throw new Error("export " + r.status);
    const blob = await r.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = (ds.title || "pipeskool-report").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "_") + ".xlsx"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch (e) { console.error("ASSISTANT_EXPORT_FAILED", e?.message); alert("Excel export failed — please try again."); return false; }
}
export function openPdfReport(ds, meta = {}) {   // update421: branded print page → native Save as PDF
  if (!ds?.rows?.length) return false;
  try { sessionStorage.setItem("psk_ai_report", JSON.stringify({ dataset: ds, meta })); window.open("/assistant-report", "_blank"); return true; } catch { return false; }
}
export function wantsPdf(text) { return /\b(pdf)\b/i.test(String(text || "")); }
export async function uploadBillForMatch(file, sess, poHint) {
  const { supabase } = await import("./supabase");
  const { data } = await supabase.auth.getSession(); const token = data?.session?.access_token; if (!token) return { ok: false, error: "Login required." };
  const base64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = () => rej(new Error("read failed")); fr.readAsDataURL(file); });
  let file_path = null;
  try { const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}_${file.name.replace(/[^A-Za-z0-9._-]+/g, "_")}`; const { error } = await supabase.storage.from("vendor-bills").upload(path, file, { contentType: file.type || undefined }); if (!error) file_path = path; } catch {}
  const r = await fetch("/api/ai/bill", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ file_name: file.name, mime: file.type || "image/jpeg", data_base64: base64, file_path, po_hint: poHint || null }) });
  return r.json().catch(() => ({ ok: false, error: "Upload failed." }));
}

// update420: confirmed ERP actions — executed by the APP's own functions (permissions enforced by the database), never by the AI
export async function performAssistantAction(confirm, sess) {
  try {
    if (confirm.action === "mark_po_delivered") {
      const { updatePODelivery } = await import("./procure");
      const r = await updatePODelivery(confirm.params.po_id, { delivery_status: "delivered", delivery_note: `Marked delivered via Assistant by ${sess?.name || "user"} on ${new Date().toISOString().slice(0, 10)}` });
      return r.ok ? { ok: true, text: `✅ ${confirm.params.po_no} marked DELIVERED (by ${sess?.name || "you"}).` } : { ok: false, error: r.error };
    }
    if (confirm.action === "approve_expense" || confirm.action === "reject_expense") {
      const { reviewExpenseClaim } = await import("./money");
      const r = await reviewExpenseClaim(confirm.params.expense_id, confirm.params.status, confirm.params.reason || (confirm.action === "approve_expense" ? "Approved via Assistant" : ""), sess?.id);
      return r.ok ? { ok: true, text: `✅ Expense #${confirm.params.expense_id} ${confirm.params.status} (by ${sess?.name || "you"}).` } : { ok: false, error: r.error };
    }
    return { ok: false, error: "Unknown action." };
  } catch (e) { return { ok: false, error: e.message || "Action failed." }; }
}
