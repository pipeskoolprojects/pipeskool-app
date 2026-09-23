// update416: /api/ai/chat — Groq-backed assistant. GROQ_API_KEY lives ONLY in Vercel env (server).
// - Caller must be a logged-in Pipeskool user (Supabase JWT in Authorization: Bearer …) — no anonymous use.
// - Grounded in the app's own Help Center articles (published) so answers describe THIS ERP, not generic software.
// - Model: openai/gpt-oss-20b via Groq's OpenAI-compatible endpoint. Change with GROQ_MODEL env if needed.
// - Never writes to the database; read-only knowledge. Existing ERP behaviour untouched.
import { createClient } from "@supabase/supabase-js";

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const MODULES = `Pipeskool modules and what they do:
- Attendance & Labour: geofenced punch in/out with live selfie (workers + staff; Directors don't punch), supervisor Daily Muster (verify, mark out, absent, OT approval — OT starts after site shift end, ≤1h → 0, round up only when extra minutes exceed 30, approval always manual), proxy attendance (supervisors / staff with rights / workers granted Proxy Authority), missing punch-out auto-closed at midnight at site shift end and held out of wages until confirmed, Calendar with holidays (paid: absent 1×, worked 2×, half 1×), Sunday policy per site (default Working Day), worker/staff pay overrides.
- Payroll: Muster Roll & Wages (labour: daily wage × paid days + OT; PT ₹200 once per worker per month when gross > ₹12,000; manual overrides; Approve → PAID locks), Staff salary sheet (salary ÷ 30 per day, Sundays paid, per-staff OT toggle, leave Apr–Mar with one paid pool, ≤50% Apr–Sep, max 10/stretch), advances recovered manually (never auto), contractor workers paid via the contractor.
- Procurement: Indent & Purchase — raise indent (site, need-by, items from Item Master, BOQ kit check), vendor quotes (vendors from master only; rates auto-fill from price master and the vendor's last PO), rate proofs, PO creation (partial POs allowed; items on live POs lock), POs by non-Directors need Director approval; PO page has Edit PO rates (Director access), Download PDF, Send to vendor, Duplicate.
- Stock & GRN: GRN register (receipts, returns), Delivery Challans (vendor challans → convert to GRN; internal Office → Site dispatch challans IDC/YYMM/nnn with Draft → In Transit → Delivered moving stock), Pending Deliveries (ordered − GRN − live challan qty), store balance = Received + Returned-to-store − Issued − Returned-to-vendor, Material Exchange (return + replacement from same vendor, EXC number, PO badges), Item Master (~2,200 items, make in name), Vendor Master, Clients master (GSTIN, addresses for challans).
- Money: Expense claims with bills (Director approval; query/respond), Cash Vouchers (NOT APPROVED watermark until approved), Direct Vendor Payment (5-field voucher with bill), Petty cash (person-wise, deducted on approval, two-step return), Advances (staff/labour), Contractor advances, Tally export (XML masters/vouchers).
- Letters & Documents: offer/appointment/warning/exit letters, Salary Slip (month-wise), numbered per type per FY (PSP/OFR/2026-27/001), issued letters frozen.
- Reports & admin: Payroll Summary, Site Summary, exports; Access Rights per module × action × site; Admin & access (Director access grant); Backup & Restore (backup before any SQL); Help Center (/help).
Roles: director, it_executive, accountant, supervisor, staff. Currency ₹ (Indian format), timezone IST.`;

async function userFromRequest(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await sb.auth.getUser(token);
  return data?.user || null;
}
async function helpContext(query) {
  // published Help Center articles, ranked by crude keyword overlap → the model answers about THIS app
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data } = await sb.from("help_articles").select("title, module, summary, steps, faqs").eq("status", "published");
    const q = String(query || "").toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const score = a => { const hay = (a.title + " " + a.summary + " " + JSON.stringify(a.steps) + " " + JSON.stringify(a.faqs)).toLowerCase(); return q.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0); };
    return (data || []).map(a => ({ a, s: score(a) })).filter(x => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 4)
      .map(({ a }) => `## ${a.title} (${a.module})\n${a.summary || ""}\n` + (a.steps || []).map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join("\n") + ((a.faqs || []).length ? "\nFAQ:\n" + a.faqs.map(f => `Q: ${f.q}\nA: ${f.a}`).join("\n") : "")).join("\n\n");
  } catch { return ""; }
}

// GET /api/ai/chat → configuration status only (no secrets). Used by the Assistant header badge.
export async function GET() {
  const configured = !!process.env.GROQ_API_KEY;
  console.log("GROQ_STATUS", JSON.stringify({ configured, model: MODEL, env: process.env.VERCEL_ENV || "local" }));
  return Response.json({ ok: true, configured, model: MODEL });
}

export async function POST(req) {
  const t0 = Date.now();
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) { console.warn("GROQ_REQUEST_SKIPPED", JSON.stringify({ reason: "GROQ_API_KEY not set", env: process.env.VERCEL_ENV || "local" })); return Response.json({ ok: false, error: "no_key" }, { status: 200 }); }
    const user = await userFromRequest(req);
    if (!user) { console.warn("GROQ_REQUEST_REJECTED", JSON.stringify({ reason: "no valid JWT" })); return Response.json({ ok: false, error: "Login required." }, { status: 401 }); }
    const { messages = [], lang = "en", role = "", pathname = "" } = await req.json();
    const recent = messages.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-8).map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!recent.length) return Response.json({ ok: false, error: "Empty message." });
    const lastUser = [...recent].reverse().find(m => m.role === "user")?.content || "";
    const ctx = await helpContext(lastUser);
    const langLine = lang === "hi" ? "Reply in simple Hindi (Devanagari)." : lang === "gu" ? "Reply in simple Gujarati." : "Reply in simple English.";
    const system = `You are the Pipeskool ERP assistant for Pipeskool Projects Pvt. Ltd. (plumbing/MEP contractor, Ahmedabad). ${langLine}
Answer ONLY about how to use this ERP. Be concrete: name the menu (e.g. "Material & Procurement → Indent & Purchase"), the button, and what happens next. Keep answers short (≤ 8 lines); use numbered steps for procedures. If something is not possible in the app, say so plainly and suggest the nearest real feature or creating a Support Ticket (Assistant → Create ticket). Never invent buttons, data, amounts or approvals. Do not give legal/tax advice beyond what the app does. The user is logged in as role "${role || "unknown"}" on page "${pathname}".
${MODULES}
${ctx ? "\nRelevant Help Center articles (source of truth):\n" + ctx : ""}`;
    console.log("GROQ_REQUEST_STARTED", JSON.stringify({ model: MODEL, turns: recent.length, lang, ctxArticles: ctx ? (ctx.match(/^## /gm) || []).length : 0, userId: user.id.slice(0, 8) }));
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, temperature: 0.2, max_tokens: 600, messages: [{ role: "system", content: system }, ...recent] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("GROQ_REQUEST_FAILED", JSON.stringify({ status: r.status, error: j?.error?.message || null, ms: Date.now() - t0 })); return Response.json({ ok: false, error: j?.error?.message || `Groq error ${r.status}` }); }
    const text = j?.choices?.[0]?.message?.content?.trim() || "";
    console.log("GROQ_REQUEST_SUCCESS", JSON.stringify({ model: MODEL, chars: text.length, ms: Date.now() - t0, usage: j?.usage || null }));
    return Response.json({ ok: true, text, model: MODEL });
  } catch (e) {
    console.error("GROQ_REQUEST_FAILED", JSON.stringify({ error: e.message || String(e), ms: Date.now() - t0 }));
    return Response.json({ ok: false, error: e.message || "AI unavailable" });
  }
}
