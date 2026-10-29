// update486 e2e — PDF bills on the Local Purchase Voucher print. Real Next.js server + the real
// /api/vendor-voucher/bill route; the server's Supabase (auth, RLS-like visibility, storage) is mock486.js on :80.
const { chromium } = require("/home/claude/.npm-global/lib/node_modules/playwright");
const { PDFDocument } = require("/home/claude/.npm-global/lib/node_modules/pdf-lib");
const base = require("/home/claude/work/test475/mock471.js");
const SETS = require("./sets486.js");
const fs = require("fs"); const { execFileSync } = require("child_process");
const OUT = process.argv[2] || "/tmp/claude-0/e2e486"; fs.mkdirSync(OUT, { recursive: true });
const APP = "http://localhost:3475"; const DB = "http://mock.supabase.test";
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const mode = m => fetch(DB + "/__mode", { method: "POST", body: JSON.stringify(m) });
const voucher = id => ({ id, voucher_no: "PSP/LPV/2026-27/" + id, expense_date: "2026-10-05", amount: 57792, category: "local_material", note: "Direct vendor payment — Nyalkaran",
  remarks: null, paid_to: "Nyalkaran", vendor_address: null, pay_mode: "cash", payment_status: "paid", paid_on: "2026-10-29", payment_ref: null, status: "approved",
  reviewed_at: null, site_id: 2, sites: { name: "SOUL Campus, GIFT City" }, claimant: { full_name: "KISHAN MEVADA" }, reviewer: { full_name: "Keyal Shah" } });

async function open(b, id, { outsider = false } = {}) {
  await mode({ outsider });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage(); const log = { selects: [], rpc: [], denied: [], writes: [], px: [] };
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  const net = []; page.on("response", r => { if (/\/api\/vendor-voucher\/bill/.test(r.url())) net.push({ status: r.status(), type: r.headers()["content-type"], cache: r.headers()["cache-control"], method: r.request().method() }); });
  const consoleMsgs = []; page.on("console", m => consoleMsgs.push(m.text()));
  await base.install(page, "director", log);
  await page.route(`${DB}/rest/v1/**`, route => {
    const u = new URL(route.request().url()); const t = u.pathname.replace("/rest/v1/", ""); const single = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
    const vid = Number((u.searchParams.get("id") || u.searchParams.get("expense_id") || "").replace(/^eq\./, ""));
    const j = x => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(x) });
    if (t === "expenses") return j(single ? (SETS[vid] ? voucher(vid) : null) : (SETS[vid] ? [voucher(vid)] : []));
    if (t === "expense_items") return j([]);
    if (t === "expense_bills") return j((SETS[vid] || []).map((f, i) => ({ id: i + 1, path: "bills/" + f, file_name: "site-" + f })));
    if (t === "app_settings") return j([{ key: "company.name", value: "PIPESKOOL PROJECTS PVT LTD." }, { key: "company.cin", value: "U26956GJ2021PTC126015" }]);
    return route.fallback();
  });
  await page.route("**/api/files/session", r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(`${APP}/vendor-voucher/print?id=${id}`, { waitUntil: "domcontentloaded" });
  return { ctx, page, errs, net, consoleMsgs };
}
const ready = (page, t = 60000) => page.waitForFunction(() => { const b = document.querySelector("[data-print]"); return b && !b.disabled; }, null, { timeout: t });
const slots = page => page.evaluate(() => [...document.querySelectorAll(".vp-slot")].map(s => ({ status: s.dataset.slot, cap: s.querySelector(".vp-cap").textContent, err: s.querySelector(".vp-err")?.textContent || "",
  ratio: (() => { const i = s.querySelector("img"); if (!i) return null; const r = i.getBoundingClientRect(); return r.width / r.height; })(), src: s.querySelector("img")?.getAttribute("src")?.slice(0, 5) })));
async function printPdf(page, file) { await page.emulateMedia({ media: "print" }); const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true }); await page.emulateMedia({ media: "screen" }); fs.writeFileSync(file, buf); return (await PDFDocument.load(buf)).getPageCount(); }
const png = (pdf, prefix) => { try { execFileSync("pdftoppm", ["-r", "45", "-png", pdf, prefix]); } catch {} };

(async () => {
  const b = await chromium.launch();

  console.log("0. Root cause, reproduced: the file route redirects to a private storage link without CORS");
  { const ctx = await b.newContext(); const page = await ctx.newPage();
    await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
    const r = await page.evaluate(async () => {   // r2.test = a storage host that, like R2 here, sends no Access-Control-Allow-Origin
      const img = await new Promise(res => { const i = new Image(); i.onload = () => res("loaded " + i.naturalWidth + "px"); i.onerror = () => res("error"); i.src = "http://r2.test/r2/portrait.jpg"; });
      let f; try { await fetch("http://r2.test/r2/three.pdf"); f = "ok"; } catch (e) { f = e.message; }
      return { img, f };
    });
    ok(/^loaded/.test(r.img) && r.f === "Failed to fetch", `<img> through the redirect: ${r.img} · fetch() of the PDF (what pdf.js does): "${r.f}" — the exact error on the live print`);
    await ctx.close(); }

  console.log("1. Voucher like id 474: 2 PDFs (3 pages + 1 page) + 2 JPGs — all from /api/vendor-voucher/bill");
  { const { ctx, page, errs, net } = await open(b, 474); await ready(page); const S = await slots(page);
    ok(S.length === 6 && S.every(s => s.status === "ok"), `6 slots (3 + 1 PDF pages, 2 photos), all loaded: ${S.map(s => s.cap.split(" – ")[0]).join(" | ")}`);
    ok(S.filter(s => s.src === "data:").length === 4 && S.filter(s => s.src === "blob:").length === 2, "PDF pages rendered to images; photos as same-origin blob: images");
    ok(!(await page.textContent("body")).includes("Failed to fetch"), "no 'Failed to fetch' anywhere");
    ok(net.length === 4 && net.every(n => n.status === 200 && /private/.test(n.cache || "")) && net.filter(n => n.type === "application/pdf").length === 2, "4 requests to our route: 200, correct Content-Type, Cache-Control: private");
    const pr = await printPdf(page, `${OUT}/print-474.pdf`); png(`${OUT}/print-474.pdf`, `${OUT}/print-474`);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-pdf]")]); await dl.saveAs(`${OUT}/download-474.pdf`);
    const dp = (await PDFDocument.load(fs.readFileSync(`${OUT}/download-474.pdf`))).getPageCount(); png(`${OUT}/download-474.pdf`, `${OUT}/download-474`);
    ok(pr === 2 && dp === 2, `Print ${pr} pages = Download PDF ${dp} pages (2 bills on page 1, 4 on page 2)`);
    const txt = execFileSync("pdftotext", [`${OUT}/download-474.pdf`, "-"]).toString();
    ok(!/https?:\/\//.test(txt.replace(/pipeskool/gi, "")), "the downloaded PDF holds the rendered bills, not links");
    ok(errs.length === 0, "no page errors " + errs.join(" | ").slice(0, 120)); await ctx.close(); }

  console.log("2. Large 20-page PDF (22.7 MB), scanned PDF, rotated page");
  { const { ctx, page } = await open(b, 601); const t0 = Date.now(); await page.waitForSelector("[data-loading]"); await ready(page, 120000); const S = await slots(page);
    ok(S.length === 20 && S.every(s => s.status === "ok") && /Bill 1 of 1 \(page 20 of 20\)/.test(S[19].cap), `20 PDF pages → 20 slots in ${((Date.now() - t0) / 1000).toFixed(1)} s, captions to "(page 20 of 20)"`);
    const pr = await printPdf(page, `${OUT}/print-601.pdf`); ok(pr === 1 + Math.ceil(18 / 4), `${pr} A4 pages (2 + 4 × 4 + 2)`); png(`${OUT}/print-601.pdf`, `${OUT}/print-601`); await ctx.close(); }
  { const { ctx, page } = await open(b, 602); await ready(page); const S = await slots(page);
    ok(S.length === 2 && S.every(s => s.status === "ok"), "scanned PDF and rotated PDF render");
    ok(S[0].ratio < 0.8 && S[1].ratio < 0.8, `rotated page (landscape stored, /Rotate 90) shown portrait: ratio ${S[1].ratio?.toFixed(2)}`);
    await printPdf(page, `${OUT}/print-602.pdf`); png(`${OUT}/print-602.pdf`, `${OUT}/print-602`); await ctx.close(); }

  console.log("3. Clear reasons: password-protected, corrupt, missing — the other bills still print, Retry + Open original");
  { const { ctx, page, net } = await open(b, 603); await ready(page); const S = await slots(page);
    ok(S[0].status === "error" && /Password-protected PDF/.test(S[0].err) && /Retry/.test(S[0].err) && /Open original file/.test(S[0].err) && S[1].status === "ok", "password PDF → 'Password-protected PDF — open the original file' + Retry + Open original; photo fine");
    ok(!(await page.locator("input[type=password]").count()), "no password prompt");
    await ctx.close(); }
  { const { ctx, page, net } = await open(b, 604); await ready(page); const S = await slots(page);
    ok(/Corrupt PDF/.test(S[0].err), "corrupt file → 'Corrupt PDF — the file is damaged'");
    ok(/Not found/.test(S[1].err) && net.some(n => n.status === 404), "missing file → 404 → 'Not found'");
    ok(S[2].status === "ok", "the third bill still prints");
    await printPdf(page, `${OUT}/print-604.pdf`); png(`${OUT}/print-604.pdf`, `${OUT}/print-604`);
    ok(net.some(n => n.method === "POST"), "the PDF failure is logged to the server (POST to the bill route)");
    await page.click("[data-slot=error] button:has-text('Retry')"); await page.waitForTimeout(1500);
    ok((await slots(page))[0].status === "error", "Retry re-fetches (still corrupt → same clear message)"); await ctx.close(); }

  console.log("4. A user who may not see the voucher gets 403 from the bill route");
  { const r = await fetch(`${APP}/api/vendor-voucher/bill?v=474&b=1`); ok(r.status === 401, "no login token → 401");
    await mode({ outsider: true }); const r2 = await fetch(`${APP}/api/vendor-voucher/bill?v=474&b=1`, { headers: { authorization: "Bearer x" } });
    ok(r2.status === 403 && /permission/.test(await r2.text()), "voucher not visible to this user (RLS) → 403, no bytes");
    await mode({ outsider: false }); const r3 = await fetch(`${APP}/api/vendor-voucher/bill?v=474&b=9`, { headers: { authorization: "Bearer x" } });
    ok(r3.status === 404, "a bill id that is not on this voucher → 404");
    const r4 = await fetch(`${APP}/api/vendor-voucher/bill?v=474&b=2`, { headers: { authorization: "Bearer x" } });
    ok(r4.status === 200 && r4.headers.get("content-type") === "application/pdf" && !/r2|storage|supabase/i.test(JSON.stringify([...r4.headers])), "200 PDF, no storage link or key in the response"); }

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
