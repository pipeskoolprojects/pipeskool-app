// update484: POST { limit } → embeds Item Master items whose embedding is missing or stale (text changed), as the
// logged-in user (fn_import_items_to_embed / fn_import_save_embeddings check the rights). Called in a loop from the
// admin screen ("Build AI item index") and topped up automatically during an import.
import { userClient, embed, aiConfigured } from "@/lib/server/importAI";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  const { user, sb } = await userClient(req);
  if (!user) return Response.json({ ok: false, error: "Please log in again." }, { status: 401 });
  if (!aiConfigured().gemini) return Response.json({ ok: false, error: "GEMINI_API_KEY is not set on the server." }, { status: 400 });
  let limit = 300; try { limit = Math.min(500, Math.max(10, Number((await req.json())?.limit) || 300)); } catch {}
  try {
    const { data: st } = await sb.rpc("fn_import_settings");
    const { data: todo, error } = await sb.rpc("fn_import_items_to_embed", { p_limit: limit });
    if (error) throw new Error(error.message);
    let saved = 0;
    if (todo?.length) {
      const vecs = await embed(todo.map(x => x.text), { model: st?.embedding_model, task: "RETRIEVAL_DOCUMENT" });
      const { data: n, error: e2 } = await sb.rpc("fn_import_save_embeddings", { p_rows: todo.map((x, i) => ({ id: x.id, hash: x.hash, vec: vecs[i] })), p_model: st?.embedding_model || "gemini-embedding-001" });
      if (e2) throw new Error(e2.message);
      saved = n || 0;
    }
    const { data: status } = await sb.rpc("fn_import_embed_status");
    return Response.json({ ok: true, saved, ...(status || {}) });
  } catch (e) { return Response.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 500 }); }
}
