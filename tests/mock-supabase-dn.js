// update480: a tiny in-memory PostgREST/Auth stand-in for the Next SERVER (service-role calls from /api/dn/* and /dn/[token]).
// Run: node mocksb.js 54321   — the Next server is started with SUPABASE_URL=http://127.0.0.1:54321
const http = require("http");
const FIX = require("./dnfixture.js");
const T = JSON.parse(JSON.stringify(FIX.tables));
let current = { auth_id: "auth-7" }; let missing = new Set(); let slowMs = 0;
const seq = { delivery_note_links: 1, delivery_note_sends: 1, module_audit_log: 1 };
function parse(url) { const u = new URL(url, "http://x"); const filters = []; let order = null, limit = null; for (const [k, v] of u.searchParams) { if (k === "select" || k === "on_conflict") continue; if (k === "order") { order = v; continue; } if (k === "limit") { limit = Number(v); continue; } filters.push([k, v]); } return { table: u.pathname.replace("/rest/v1/", ""), filters, order, limit, select: u.searchParams.get("select") || "*" }; }
function match(row, [k, v]) {
  const val = row[k];
  if (v === "is.null") return val == null; if (v === "not.is.null") return val != null;
  if (v.startsWith("eq.")) return String(val) === v.slice(3); if (v.startsWith("neq.")) return String(val) !== v.slice(4);
  if (v.startsWith("in.(")) return v.slice(4, -1).split(",").map(s => s.replace(/^"|"$/g, "")).includes(String(val));
  if (v.startsWith("gt.")) return Number(val) > Number(v.slice(3));
  return true;
}
function embed(table, row) {
  const r = { ...row };
  if (table === "delivery_challans") { r.sites = T.sites.find(s => s.id === row.site_id) || null; r.purchase_orders = T.purchase_orders.find(p => p.id === row.po_id) || null; r.clients = T.clients.find(c => c.id === row.client_id) || null; r.delivery_challan_items = T.delivery_challan_items.filter(i => i.challan_id === row.id); }
  if (table === "user_sites") r.app_users = T.app_users.find(u => u.id === row.user_id) || null;
  return r;
}
const srv = http.createServer((req, res) => {
  let body = ""; req.on("data", c => body += c); req.on("end", async () => {
    if (slowMs && req.url.startsWith("/rest/v1/delivery_note_links")) await new Promise(r => setTimeout(r, slowMs));
    const json = (o, st = 200) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url === "/__user" && req.method === "POST") { current = JSON.parse(body || "{}"); return json({ ok: true }); }
    if (req.url === "/__dump") return json(T);
    if (req.url === "/__missing" && req.method === "POST") { missing = new Set(JSON.parse(body || "{}").tables || []); return json({ ok: true }); }
    if (req.url === "/__slow" && req.method === "POST") { slowMs = Number(JSON.parse(body || "{}").ms || 0); return json({ ok: true }); }
    if (req.url === "/__reset" && req.method === "POST") { missing = new Set(); slowMs = 0; for (const k of Object.keys(FIX.tables)) T[k] = JSON.parse(JSON.stringify(FIX.tables[k])); return json({ ok: true }); }
    if (req.url.startsWith("/auth/v1/user")) { const tok = (req.headers.authorization || "").replace(/^Bearer /, ""); if (!tok || tok === "bad") return json({ msg: "invalid" }, 401); return json({ id: current.auth_id, role: "authenticated" }); }
    if (!req.url.startsWith("/rest/v1/")) return json({ error: "not found" }, 404);
    if ((req.headers.apikey || "") !== "svc") return json({ message: "permission denied" }, 401);
    const q = parse(req.url);
    if (missing.has(q.table)) return json({ code: "PGRST205", details: null, hint: null, message: `Could not find the table 'public.${q.table}' in the schema cache` }, 404);
    if (slowMs && q.table === "delivery_note_links") { setTimeout(() => { slowMs = slowMs; }, 0); }
    const rows = T[q.table]; if (!rows) return json({ message: "relation " + q.table + " does not exist" }, 404);
    if (req.method === "GET") {
      let out = rows.filter(r => q.filters.every(f => match(r, f))).map(r => embed(q.table, r));
      if (q.order) { const [col, dir] = q.order.split("."); out.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === "desc" ? -1 : 1)); }
      if (q.limit != null) out = out.slice(0, q.limit);
      return json(out);
    }
    if (req.method === "POST") { const b = JSON.parse(body || "{}"); const row = { id: seq[q.table] ? seq[q.table]++ : rows.length + 1, created_at: new Date().toISOString(), sent_at: new Date().toISOString(), open_count: 0, ...b }; rows.push(row); return json([row], 201); }
    if (req.method === "PATCH") { const b = JSON.parse(body || "{}"); const hit = rows.filter(r => q.filters.every(f => match(r, f))); hit.forEach(r => Object.assign(r, b)); return json(hit); }
    json({ error: "unsupported" }, 400);
  });
});
srv.listen(Number(process.argv[2] || 54321), "127.0.0.1", () => console.log("mock supabase on", process.argv[2] || 54321));
