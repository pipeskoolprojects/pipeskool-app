// update484 e2e: a small PostgREST + Auth + AI stand-in on port 80 for host mock.supabase.test (see /etc/hosts).
// RPC calls run the REAL SQL functions in the local PostgreSQL test database (t484) as the current test user.
// AI endpoints fake Gemini embeddings (deterministic trigram hashing) and a Groq / Gemini judge (modes: ok | fail | outside | slow).
const http = require("http");
const { Pool } = require("pg");
const pool = new Pool({ host: "/home/claude/work/pg", port: 5433, user: "postgres", database: "t484", max: 8 });
let UID = "00000000-0000-0000-0000-000000000001"; let AIMODE = "ok"; const calls = { embed: 0, judge: 0, judgeRows: 0, gemini_chat: 0 };
const argTypes = new Map();
async function fnArgs(fn) {
  if (argTypes.has(fn)) return argTypes.get(fn);
  const { rows } = await pool.query(`select p.proargnames names, (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes) with ordinality u(t, o)) types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 limit 1`, [fn]);
  const v = rows[0] ? { names: rows[0].names || [], types: rows[0].types || [] } : null; argTypes.set(fn, v); return v;
}
async function asUser(fn) {
  const c = await pool.connect();
  try { await c.query("begin"); await c.query("select set_config('app.uid', $1, true), set_config('search_path', 'public, extensions', true)", [UID]); const r = await fn(c); await c.query("commit"); return r; }
  catch (e) { await c.query("rollback").catch(() => {}); throw e; } finally { c.release(); }
}
const pgLiteral = v => Array.isArray(v) ? "{" + v.map(x => x == null ? "NULL" : JSON.stringify(String(x))).join(",") + "}" : v;
// ---- fake embeddings: hashed character trigrams → 768-d unit vector (similar text → similar vector)
function fakeVec(t) { const v = new Array(768).fill(0); const s = " " + String(t).toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  for (let i = 0; i < s.length - 2; i++) { let h = 2166136261; for (const ch of s.slice(i, i + 3)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); v[Math.abs(h) % 768] += 1; }
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map(x => x / n); }
function fakeJudge(body) {
  const u = JSON.parse(body.messages.find(m => m.role === "user").content);
  const words = t => new Set(String(t).toLowerCase().replace(/[^a-z0-9.]+/g, " ").split(" ").filter(Boolean));
  const results = u.rows.map(r => {
    if (AIMODE === "outside") return { row_id: r.row_id, chosen_item_id: 999999, confidence: 0.99, reason: "made up" };
    const rw = words(r.text); let best = null, bs = 0;
    for (const c of r.candidates) { const cw = words(c.name); let n = 0; rw.forEach(w => { if (cw.has(w)) n++; }); const sc = n / Math.max(1, rw.size); if (sc > bs) { bs = sc; best = c; } }
    return { row_id: r.row_id, chosen_item_id: best && bs >= 0.5 ? best.id : null, confidence: best ? Math.min(0.99, 0.6 + bs * 0.39) : 0, reason: best ? "same words" : "none" };
  });
  calls.judgeRows += u.rows.length;
  return { choices: [{ message: { content: JSON.stringify({ results }) } }] };
}
// ---- tiny table API (GET with eq/in/gte/order/limit; POST insert returning rows)
const TABLES = new Set(["material_indents", "material_indent_items", "item_master"]);
function where(params, args) {
  const conds = [];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "or", "on_conflict", "columns"].includes(k)) continue;
    const m = /^(eq|gte|lte|gt|lt|in|is|neq|ilike)\.(.*)$/.exec(v); if (!m) continue;
    const col = '"' + k.replace(/"/g, "") + '"';
    if (m[1] === "in") { args.push(m[2].slice(1, -1).split(",").map(s => s.replace(/^"|"$/g, ""))); conds.push(`${col}::text = any($${args.length})`); }
    else if (m[1] === "is") conds.push(`${col} is ${m[2] === "null" ? "null" : m[2] === "true" ? "true" : "false"}`);
    else if (m[1] === "ilike") { args.push(m[2].replace(/\*/g, "%")); conds.push(`${col}::text ilike $${args.length}`); }
    else { args.push(m[2]); conds.push(`${col}::text ${{ eq: "=", gte: ">=", lte: "<=", gt: ">", lt: "<", neq: "<>" }[m[1]]} $${args.length}`); }
  }
  return conds;
}
const srv = http.createServer((req, res) => {
  let body = ""; req.on("data", c => body += c); req.on("end", async () => {
    const url = new URL(req.url, "http://x"); const path = url.pathname;
    const send = (o, st = 200) => { res.writeHead(st, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }); res.end(JSON.stringify(o)); };
    if (req.method === "OPTIONS") return send({});
    try {
      if (path === "/__as") { UID = JSON.parse(body).uid; return send({ ok: true }); }
      if (path === "/__ai") { AIMODE = JSON.parse(body).mode; return send({ ok: true }); }
      if (path === "/__calls") return send(calls);
      if (path === "/__sql") { const r = await pool.query(JSON.parse(body).sql); return send(Array.isArray(r) ? r.map(x => x.rows) : r.rows); }
      if (path.startsWith("/auth/v1/user")) return send({ id: UID, aud: "authenticated", role: "authenticated" });
      if (path.startsWith("/auth/")) return send({});
      if (path.startsWith("/__ai/gemini/models/")) {   // batchEmbedContents
        calls.embed++; if (AIMODE === "fail") return send({ error: { message: "quota" } }, 503);
        const b = JSON.parse(body); return send({ embeddings: b.requests.map(r => ({ values: fakeVec(r.content.parts[0].text) })) });
      }
      if (path.startsWith("/__ai/groq/chat/completions") || path.startsWith("/__ai/gemini/openai/chat/completions")) {
        calls.judge++; if (path.includes("gemini")) calls.gemini_chat++;
        if (AIMODE === "fail") return send({ error: { message: "down" } }, 503);
        if (AIMODE === "slow") { await new Promise(r => setTimeout(r, 9500)); }
        return send(fakeJudge(JSON.parse(body)));
      }
      if (path.startsWith("/rest/v1/rpc/")) {
        const fn = path.split("/").pop(); const meta = await fnArgs(fn);
        if (!meta) return send({ code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` }, 404);
        const a = body ? JSON.parse(body) : {}; const args = [], parts = [];
        meta.names.forEach((n, i) => { if (!(n in a)) return; const t = meta.types[i]; const v = a[n];
          args.push(v == null ? null : t === "jsonb" || t === "json" ? JSON.stringify(v) : pgLiteral(v)); parts.push(`${n} := $${args.length}::${t}`); });
        const r = await asUser(c => c.query(`select to_jsonb(public.${fn}(${parts.join(", ")})) as r`, args));
        return send(r.rows[0]?.r ?? null);
      }
      const table = path.replace("/rest/v1/", "");
      if (!TABLES.has(table)) return send(req.method === "GET" ? [] : [], req.method === "GET" ? 200 : 201);
      const single = /vnd\.pgrst\.object/.test(req.headers.accept || "");
      if (req.method === "GET") {
        const args = []; const conds = where(url.searchParams, args);
        if (table === "item_master") for (const o of url.searchParams.getAll("or")) { const toks = [...o.matchAll(/ilike\.\*?%?([^,*%)]+)/g)].map(m => m[1]); if (toks[0]) { args.push("%" + toks[0] + "%"); conds.push(`display_name ilike $${args.length}`); } }
        const ord = url.searchParams.get("order"); const lim = url.searchParams.get("limit");
        const sql = `select * from ${table}${conds.length ? " where " + conds.join(" and ") : ""}${ord ? " order by " + ord.split(",").map(p => { const [c, d] = p.split("."); return `"${c}" ${d === "desc" ? "desc" : "asc"}`; }).join(", ") : ""}${lim ? " limit " + Number(lim) : ""}`;
        const r = await asUser(c => c.query(sql, args));
        return send(single ? (r.rows[0] || null) : r.rows);
      }
      if (req.method === "POST") {
        const rows = [].concat(JSON.parse(body)); const out = [];
        await asUser(async c => { for (const row of rows) { const cols = Object.keys(row); const r = await c.query(`insert into ${table} (${cols.map(k => '"' + k + '"').join(",")}) values (${cols.map((_, i) => "$" + (i + 1)).join(",")}) returning *`, cols.map(k => row[k] != null && typeof row[k] === "object" ? JSON.stringify(row[k]) : row[k])); out.push(r.rows[0]); } });
        return send(single ? out[0] : out, 201);
      }
      if (req.method === "DELETE") { const args = []; const conds = where(url.searchParams, args); if (!conds.length) return send({ message: "refusing delete without filter" }, 400);
        const r = await asUser(c => c.query(`delete from ${table} where ${conds.join(" and ")} returning *`, args)); return send(r.rows, 200); }
      return send([]);
    } catch (e) { return send({ code: e.code || "XX000", message: e.message }, 400); }
  });
});
srv.listen(80, "127.0.0.1", () => console.log("shim on :80"));
