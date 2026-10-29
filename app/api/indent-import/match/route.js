// update484: POST { import_id, phase: "fast" | "ai" } (Authorization: Bearer <supabase token>)
// fast → layers 1–3 + guardrails for every pending row (usually well under 3 s).
// ai   → layers 4–5 for the rows still unresolved: embeddings (Gemini) + vector search, then the LLM judge (Groq →
//        Gemini, batches of 20), then the same guardrails. Any AI failure leaves those rows on "please confirm".
// Every database call runs AS THE USER (their token): the SQL functions check the rights.
import { userClient, embed, judge, aiConfigured } from "@/lib/server/importAI";
import { decideFast, decideAI, round } from "@/lib/importMatch.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;
const BUDGET_MS = 50000;

const bad = (msg, status = 400) => Response.json({ ok: false, error: msg }, { status });

async function rpc(sb, fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) { const e = new Error(error.message); e.code = error.code; throw e; }
  return data;
}
async function itemMap(sb, ids) {
  const m = new Map(); const list = [...new Set(ids.map(Number).filter(Boolean))];
  for (let i = 0; i < list.length; i += 400) {
    const part = await rpc(sb, "fn_import_items", { p_ids: list.slice(i, i + 400) });
    (part || []).forEach(it => m.set(Number(it.id), it));
  }
  return m;
}
const idsOf = c => [...(c.alias || []).map(a => a.item_id), ...(c.exact || []), ...(c.fuzzy || []).map(f => f.item_id)];
const toSave = d => ({ row_id: d.row_id, status: d.status, layer: d.layer, confidence: d.confidence, item_id: d.item_id, candidates: d.candidates, reason: d.reason, guard: d.guard });

export async function GET() {
  const c = aiConfigured();
  return Response.json({ ok: true, ai: c.groq || c.gemini, embeddings: c.gemini, providers: c });
}

export async function POST(req) {
  const t0 = Date.now();
  const { user, sb } = await userClient(req);
  if (!user) return bad("Please log in again.", 401);
  let body; try { body = await req.json(); } catch { return bad("Bad request."); }
  const importId = Number(body?.import_id); if (!importId) return bad("import_id missing.");
  const phase = body?.phase === "ai" ? "ai" : "fast";
  try {
    const settings = await rpc(sb, "fn_import_settings", {});
    const makes = await rpc(sb, "fn_import_makes", {});
    const imp = await rpc(sb, "fn_import_get", { p_import_id: importId });
    if (!imp) return bad("Not allowed.", 403);
    if (imp.import.status !== "review") return bad("This import is already closed.");

    if (phase === "fast") {
      const pending = imp.rows.filter(r => r.status === "pending").map(r => r.id);
      if (!pending.length) return Response.json({ ok: true, phase, done: 0, unresolved: imp.rows.filter(r => ["confirm", "not_found"].includes(r.status)).length });
      const cands = await rpc(sb, "fn_import_candidates", { p_import_id: importId, p_row_ids: pending });
      const items = await itemMap(sb, cands.flatMap(idsOf));
      const decided = cands.map(c => decideFast(c, items, makes, settings));
      await rpc(sb, "fn_import_save_matches", { p_import_id: importId, p_rows: decided.map(toSave), p_ai_status: null });
      const count = s => decided.filter(d => d.status === s).length;
      return Response.json({ ok: true, phase, ms: Date.now() - t0, auto: count("auto"), confirm: count("confirm"), not_found: count("not_found"),
                             unresolved: decided.filter(d => d.unresolved).length, ai_available: !!(settings.ai_enabled && (aiConfigured().groq || aiConfigured().gemini)) });
    }

    // ---------------------------------------------------------------- AI phase (leftovers only)
    const leftovers = imp.rows.filter(r => ["confirm", "not_found"].includes(r.status) && !r.confirmed_by && r.match_layer !== "alias");
    if (!leftovers.length) return Response.json({ ok: true, phase, improved: 0, rows: 0 });
    if (!settings.ai_enabled) { await rpc(sb, "fn_import_save_matches", { p_import_id: importId, p_rows: [], p_ai_status: "skipped: AI switched off in settings" }); return Response.json({ ok: true, phase, skipped: "AI is switched off in settings" }); }
    const conf = aiConfigured();
    if (!conf.groq && !conf.gemini) { await rpc(sb, "fn_import_save_matches", { p_import_id: importId, p_rows: [], p_ai_status: "skipped: no AI key configured" }); return Response.json({ ok: true, phase, skipped: "No AI key configured" }); }
    const notes = [];
    const cands = await rpc(sb, "fn_import_candidates", { p_import_id: importId, p_row_ids: leftovers.map(r => r.id) });
    const fastById = new Map(leftovers.map(r => [Number(r.id), { candidates: r.candidates || [], layer: r.match_layer, status: r.status }]));

    // layer 4: embeddings (top up item embeddings first if some are missing / stale)
    const vectorByRow = new Map();
    if (conf.gemini) {
      try {
        for (let round_ = 0; round_ < 3 && Date.now() - t0 < 20000; round_++) {
          const todo = await rpc(sb, "fn_import_items_to_embed", { p_limit: 300 });
          if (!todo?.length) break;
          const vecs = await embed(todo.map(x => x.text), { model: settings.embedding_model, task: "RETRIEVAL_DOCUMENT" });
          await rpc(sb, "fn_import_save_embeddings", { p_rows: todo.map((x, i) => ({ id: x.id, hash: x.hash, vec: vecs[i] })), p_model: settings.embedding_model });
        }
        const texts = cands.map(c => [c.text, c.remarks].filter(Boolean).join(" "));
        const vecs = await embed(texts, { model: settings.embedding_model, task: "RETRIEVAL_QUERY" });
        for (let i = 0; i < cands.length; i += 40) {
          const part = await rpc(sb, "fn_import_vector_candidates", { p_import_id: importId, p_rows: cands.slice(i, i + 40).map((c, k) => ({ row_id: c.row_id, vec: vecs[i + k] })) });
          (part || []).forEach(p => vectorByRow.set(Number(p.row_id), p.vector || []));
        }
      } catch (e) { notes.push("embeddings failed: " + String(e?.message || e).slice(0, 80)); }
    } else notes.push("no Gemini key: vector search skipped");

    // candidate union (fast + vector, max 8) with names for the judge
    const allIds = cands.flatMap(c => [...idsOf(c), ...(vectorByRow.get(Number(c.row_id)) || []).map(v => v.item_id), ...((fastById.get(Number(c.row_id))?.candidates) || []).map(x => x.item_id)]);
    const items = await itemMap(sb, allIds);
    const work = cands.map(c => {
      const fast = fastById.get(Number(c.row_id)) || decideFast(c, items, makes, settings);
      const merged = new Map();
      for (const x of fast.candidates || []) merged.set(Number(x.item_id), Number(x.score) || 0);
      for (const v of vectorByRow.get(Number(c.row_id)) || []) if (!merged.has(Number(v.item_id))) merged.set(Number(v.item_id), Math.min(0.85, Number(v.sim) || 0));
      const list = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).filter(([id]) => items.has(id))
        .map(([id]) => ({ item_id: id, name: items.get(id).name, unit: items.get(id).unit }));
      return { c, fast, list };
    });

    // layer 5: LLM judge, 20 rows per call
    const aiByRow = new Map(); let provider = ""; let aiFailed = 0;
    const order = (settings.ai_order || ["groq", "gemini"]).filter(p => conf[p]);
    const judgeable = work.filter(w => w.list.length);
    for (let i = 0; i < judgeable.length && order.length; i += 20) {
      if (Date.now() - t0 > BUDGET_MS) { notes.push("time budget reached — remaining rows left for you to confirm"); break; }
      const batch = judgeable.slice(i, i + 20).map(w => ({ row_id: Number(w.c.row_id), text: [w.c.text, w.c.remarks].filter(Boolean).join(" "), unit: w.c.unit, candidates: w.list, examples: w.c.shots || [] }));
      const r = await judge(batch, order);
      if (!r.results) { aiFailed += batch.length; notes.push(r.error); continue; }
      provider = r.provider; r.results.forEach((v, k) => aiByRow.set(k, v));
    }

    // layer 6 + decision; never overwrite a row a human already decided (the SQL also checks)
    const decided = work.map(w => decideAI(w.c, { candidates: w.list.map(x => ({ item_id: x.item_id, score: (w.fast.candidates || []).find(f => Number(f.item_id) === x.item_id)?.score ?? Math.min(0.85, (vectorByRow.get(Number(w.c.row_id)) || []).find(v => Number(v.item_id) === x.item_id)?.sim || 0) })), layer: w.fast.layer },
      vectorByRow.get(Number(w.c.row_id)) || [], aiByRow.get(Number(w.c.row_id)) || null, items, makes, settings));
    const improved = decided.filter(d => { const f = fastById.get(Number(d.row_id)); return f && (d.status !== f.status || d.layer === "ai"); }).length;
    const aiStatus = (aiByRow.size ? "done" + (provider ? " (" + provider + ")" : "") : aiFailed ? "failed" : "done") + (notes.length ? ": " + notes.join(" · ") : "");
    await rpc(sb, "fn_import_save_matches", { p_import_id: importId, p_rows: decided.map(toSave), p_ai_status: aiStatus.slice(0, 200) });
    return Response.json({ ok: true, phase, ms: Date.now() - t0, rows: decided.length, improved, auto: decided.filter(d => d.status === "auto").length,
                           ai_rows: aiByRow.size, provider, notes, confidence_avg: round(decided.reduce((s, d) => s + (d.confidence || 0), 0) / Math.max(1, decided.length)) });
  } catch (e) {
    const msg = String(e?.message || e);
    if (/fn_import|schema cache|item_alias|indent_import/i.test(msg) && /not find|does not exist|schema cache/i.test(msg)) return bad("The import tables are not set up yet (pipeskool_excel_indent_import.sql). Error: " + msg.slice(0, 160), 500);
    return bad(msg.slice(0, 300), /Not allowed/.test(msg) ? 403 : 500);
  }
}
