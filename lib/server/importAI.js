// update484: AI helpers for the Excel → indent import (server only). Embeddings: Gemini. Judge: Groq first, Gemini
// fallback (order from settings). 8 s timeout per call, one retry with backoff. Only item text and candidate
// names are sent — never vendors, rates or personal data. Any failure returns null so the import never blocks.
import { createClient } from "@supabase/supabase-js";
import { judgePrompt, parseJudge } from "@/lib/importMatch.mjs";

export const AI_TIMEOUT_MS = 8000;
const GROQ_BASE = () => (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
const GEMINI_BASE = () => (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
export const EMBED_DIM = 768;

export async function userClient(req) {
  const auth = req.headers.get("authorization") || ""; const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { user: null };
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data } = await sb.auth.getUser(token);
  return { user: data?.user || null, sb };
}

async function fetchJSON(url, init, timeoutMs = AI_TIMEOUT_MS) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let r;
    try { r = await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" }); }
    catch (e) { const c = e?.cause?.code || e?.cause?.message || e?.name; throw new Error((e?.name === "AbortError" ? "timeout" : "network error") + (c ? " (" + c + ")" : "")); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j?.error?.message || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return j;
  } finally { clearTimeout(t); }
}
async function withRetry(fn, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; if (e?.status && e.status < 500 && e.status !== 429) break; await new Promise(r => setTimeout(r, 400 * (i + 1) * (i + 1))); }
  }
  throw last;
}

export const aiConfigured = () => ({ groq: !!process.env.GROQ_API_KEY, gemini: !!process.env.GEMINI_API_KEY });

const unit = v => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map(x => Math.round((x / n) * 1e6) / 1e6); };
/** texts → 768-d unit vectors (null on failure). taskType RETRIEVAL_DOCUMENT for items, RETRIEVAL_QUERY for rows. */
export async function embed(texts, { model = "gemini-embedding-001", task = "RETRIEVAL_QUERY" } = {}) {
  const key = process.env.GEMINI_API_KEY; if (!key || !texts.length) return null;
  const m = String(model || "gemini-embedding-001").replace(/^models\//, "");
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100);
    const j = await withRetry(() => fetchJSON(`${GEMINI_BASE()}/models/${encodeURIComponent(m)}:batchEmbedContents`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ requests: chunk.map(t => ({ model: `models/${m}`, content: { parts: [{ text: String(t).slice(0, 1000) }] }, taskType: task, outputDimensionality: EMBED_DIM })) }),
    }, 15000));
    const vecs = (j.embeddings || []).map(e => e.values || []);
    if (vecs.length !== chunk.length || vecs.some(v => v.length !== EMBED_DIM)) throw new Error("Embedding size mismatch");
    out.push(...vecs.map(unit));
  }
  return out;
}

async function chat(provider, system, user) {
  if (provider === "groq" && process.env.GROQ_API_KEY) {
    const models = [process.env.GROQ_MODEL || "openai/gpt-oss-20b", process.env.GROQ_FALLBACK_MODEL || "llama-3.3-70b-versatile"];
    let last;
    for (const model of models) {
      try {
        const j = await withRetry(() => fetchJSON(`${GROQ_BASE()}/chat/completions`, {
          method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        }));
        return { text: j.choices?.[0]?.message?.content || "", provider: "groq:" + model };
      } catch (e) { last = e; }
    }
    throw last;
  }
  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const j = await withRetry(() => fetchJSON(`${GEMINI_BASE()}/openai/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    }));
    return { text: j.choices?.[0]?.message?.content || "", provider: "gemini:" + model };
  }
  throw new Error(provider + " not configured");
}

/** one batched judge call (≤ 20 rows). Returns {results: Map(row_id → {...}), provider} or {results: null, error} */
export async function judge(batch, order = ["groq", "gemini"]) {
  const { system, user } = judgePrompt(batch);
  const errors = [];
  for (const p of order) {
    try { const r = await chat(p, system, user); return { results: parseJudge(r.text, batch), provider: r.provider }; }
    catch (e) { errors.push(p + ": " + String(e?.message || e).slice(0, 80)); }
  }
  return { results: null, error: errors.join(" · ") || "no AI provider configured" };
}
