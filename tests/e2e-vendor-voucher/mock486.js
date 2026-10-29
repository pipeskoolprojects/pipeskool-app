// update486 e2e: what the Next SERVER talks to (host mock.supabase.test → 127.0.0.1:80): Supabase Auth + REST (RLS-like
// visibility per test mode) and Supabase Storage (FILE_BACKEND=supabase), serving the test bill files.
const http = require("http"); const fs = require("fs");
const SETS = { ...require("./sets485.js"), ...require("./sets486.js") };
let MODE = { outsider: false, allowMissing: false, slow: 0 }; const hits = [];
const TYPE = { jpg: "image/jpeg", png: "image/png", pdf: "application/pdf", webp: "image/webp", heic: "image/heic" };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); const p = u.pathname;
  const json = (o, st = 200) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  let body = ""; req.on("data", c => body += c); req.on("end", () => {
    if (p === "/__mode") { MODE = { ...MODE, ...JSON.parse(body || "{}") }; return json({ ok: true }); }
    if (p === "/__hits") return json(hits.splice(0));
    if (p.startsWith("/auth/v1/user")) return json({ id: "auth-1", aud: "authenticated", role: "authenticated" });
    const id = n => Number(String(u.searchParams.get(n) || "").replace(/^eq\./, ""));
    if (p === "/rest/v1/expenses") { const v = id("id"); return json(!MODE.outsider && SETS[v] ? { id: v, voucher_no: "PSP/LPV/2026-27/" + v } : null); }
    if (p === "/rest/v1/expense_bills") { const v = id("expense_id"), b = id("id"); const list = SETS[v] || []; const f = list[b - 1]; return json(f ? { id: b, path: "bills/" + f, file_name: "site-" + f } : null); }
    if (p.startsWith("/r2/")) { const name = p.split("/").pop(); res.writeHead(200, { "content-type": TYPE[name.split(".").pop()] }); return fs.createReadStream(__dirname + "/assets/" + name).pipe(res); }   // no CORS header, like the private R2 link
    if (p.startsWith("/storage/v1/object/public/attendance-photos/bills/")) {
      let name = p.split("/").pop(); hits.push(name);
      if (name === "missing.jpg" && MODE.allowMissing) name = "portrait.jpg";
      if (MODE.slow) { const n = name; return setTimeout(() => { res.writeHead(200, { "content-type": TYPE[n.split(".").pop()] || "application/octet-stream" }); fs.createReadStream(__dirname + "/assets/" + n).pipe(res); }, MODE.slow); }
      if (!fs.existsSync(__dirname + "/assets/" + name)) { res.writeHead(400, { "content-type": "application/json" }); return res.end('{"error":"not_found"}'); }
      res.writeHead(200, { "content-type": TYPE[name.split(".").pop()] || "application/octet-stream" }); return fs.createReadStream(__dirname + "/assets/" + name).pipe(res);
    }
    json({ message: "unhandled " + p }, 404);
  });
}).listen(80, "127.0.0.1", () => console.log("mock486 on :80"));
