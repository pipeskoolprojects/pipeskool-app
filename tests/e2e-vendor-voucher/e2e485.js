// update485 e2e — Direct Vendor Payment voucher print: bills on A4 pages, Print = Download PDF.
// Real Next.js build; Supabase + the file route are mocked in the browser. Each voucher id has a different bill set.
const { chromium } = require("/home/claude/.npm-global/lib/node_modules/playwright");
const { PDFDocument } = require("/home/claude/.npm-global/lib/node_modules/pdf-lib");
const base = require("/home/claude/work/test475/mock471.js");
const fs = require("fs"); const { execFileSync } = require("child_process");
const OUT = process.argv[2] || "/tmp/claude-0/e2e485"; fs.mkdirSync(OUT, { recursive: true });
const APP = "http://localhost:3475"; const DB = "http://mock.supabase.test";
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const A = n => fs.readFileSync(__dirname + "/assets/" + n);
const TYPE = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", heic: "image/heic" };
const img = n => ({ path: "bills/" + n, file_name: "site-" + n });
const SETS = require("./sets485.js");
const LONG = "Direct vendor payment — " + "Ashapur traders, supply of river sand, cement bags, binding wire, GI nuts and bolts for the toilet block and the terrace waterproofing work ".repeat(3);
function voucher(id) {
  return { id, voucher_no: "PSP/LPV/2026-27/" + String(id).slice(1), expense_date: "2026-10-21", amount: id === 512 ? 98765 : 11200, category: "local_material",
    note: id === 510 ? LONG : "Direct vendor payment — Ashapur traders", remarks: id === 510 ? "Remarks ".repeat(30) : null,
    paid_to: id === 510 ? "Ashapur Traders and Building Material Suppliers Private Limited, Sanand GIDC Road" : "Ashapur traders", vendor_address: null,
    pay_mode: "cash", payment_status: id === 511 ? "paid" : "pending", paid_on: id === 511 ? "2026-10-29" : null, payment_ref: null, status: "approved",
    reviewed_at: null, site_id: 2, sites: { name: "ATOS" }, claimant: { full_name: "SATYENDRA RAI" }, reviewer: { full_name: "Keyal Shah" } };
}
const items = id => id === 512 ? Array.from({ length: 22 }, (_, i) => ({ item_name: "GI pipe fitting item number " + (i + 1), qty: 10, unit: "Nos", rate: 100, amount: 1000 })) : [];

async function open(b, id, { slow = 0, failMissing = true } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage(); const log = { selects: [], rpc: [], denied: [], writes: [], px: [], files: [] };
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await base.install(page, "director", log);
  await fetch(DB + "/__mode", { method: "POST", body: JSON.stringify({ allowMissing: !failMissing, slow }) });
  await page.route(`${DB}/rest/v1/**`, route => {
    const u = new URL(route.request().url()); const t = u.pathname.replace("/rest/v1/", ""); const single = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
    const vid = Number((u.searchParams.get("id") || u.searchParams.get("expense_id") || "").replace(/^eq\./, ""));
    const j = b => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (t === "expenses") return j(single ? (SETS[vid] ? voucher(vid) : null) : (SETS[vid] ? [voucher(vid)] : []));
    if (t === "expense_items") return j(items(vid));
    if (t === "expense_bills") return j((SETS[vid] || []).map((n, i) => ({ id: i + 1, ...img(n) })));
    if (t === "app_settings") return j([["company.name", "PIPESKOOL PROJECTS PVT LTD."], ["company.address", "102, Darshak, Opp Shrey Hospital, Punjabi Hall Lane, Navrangpura, Ahmedabad - 09"], ["company.cin", "U26956GJ2021PTC126015"], ["company.gstin", "24AAMCP3389A1ZF"], ["company.email", "pipeskoolprojects@gmail.com"]].map(([key, value]) => ({ key, value })));
    return route.fallback();
  });
  await page.route(u => /\/api\/files\/v\?/.test(u.href), async r => {
    const k = new URL(r.request().url()).searchParams.get("k"); const name = k.split("/").pop(); log.files.push(name);
    if (slow) await new Promise(x => setTimeout(x, slow));
    if (name === "missing.jpg" && !allowMissing) return r.fulfill({ status: 404, body: "not found" });
    if (name === "missing.jpg") return r.fulfill({ status: 200, contentType: "image/jpeg", body: A("portrait.jpg") });
    if (name === "photo.heic") return r.fulfill({ status: 200, contentType: "image/heic", body: Buffer.from("not-really-heic") });
    return r.fulfill({ status: 200, contentType: TYPE[name.split(".").pop()], body: A(name) });
  });
  await page.route("**/api/files/session", r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(`${APP}/vendor-voucher/print?id=${id}`, { waitUntil: "domcontentloaded" });
  return { ctx, page, log, errs, allow: () => fetch(DB + "/__mode", { method: "POST", body: JSON.stringify({ allowMissing: true }) }) };
}
const ready = page => page.waitForFunction(() => { const b = document.querySelector("[data-print]"); return b && !b.disabled; }, null, { timeout: 30000 });
async function layout(page) {
  return page.evaluate(() => [...document.querySelectorAll(".vp-page")].map(p => {
    const pr = p.getBoundingClientRect();
    return { page: p.dataset.page, h: pr.height, slots: [...p.querySelectorAll(".vp-slot")].map(s => {
      const r = s.getBoundingClientRect(); const im = s.querySelector("img"); const ir = im?.getBoundingClientRect();
      return { status: s.dataset.slot, cap: s.querySelector(".vp-cap").textContent, inside: !im || (ir.left >= r.left - 0.5 && ir.right <= r.right + 0.5 && ir.top >= r.top - 0.5 && ir.bottom <= r.bottom + 0.5),
               inPage: r.bottom <= pr.bottom + 0.5, ratio: im ? ir.width / ir.height : null, nat: im ? im.naturalWidth / im.naturalHeight : null, loaded: im ? im.complete && im.naturalWidth > 0 : false };
    }), foot: p.textContent.match(/Page \d+ of \d+/)?.[0] };
  }));
}
async function printPdf(page, file) {   // Chromium "Print → Save as PDF" with the print CSS (@page A4, 10 mm)
  await page.emulateMedia({ media: "print" });
  const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: "screen" });
  fs.writeFileSync(file, buf); const doc = await PDFDocument.load(buf);
  return { pages: doc.getPageCount(), size: doc.getPage(0).getSize() };
}
const png = (pdf, prefix) => { try { execFileSync("pdftoppm", ["-r", "45", "-png", pdf, prefix]); } catch {} };

(async () => {
  const b = await chromium.launch();
  const EXPECT = { 500: [0], 501: [1], 502: [2], 503: [2, 1], 504: [2, 2], 505: [2, 3], 507: [2, 4, 1], 508: [2, 3] };
  console.log("1. Page plan for 0 / 1 / 2 / 3 / 4 / 5 / 7 bills and a JPG + multi-page PDF mix (print preview = PDF)");
  for (const id of Object.keys(EXPECT).map(Number)) {
    const { ctx, page, errs } = await open(b, id); await ready(page);
    const L = await layout(page); const counts = L.map(p => p.slots.length);
    ok(JSON.stringify(counts) === JSON.stringify(EXPECT[id]), `${SETS[id].length} file(s) → slots per page ${JSON.stringify(counts)}`);
    ok(L.every(p => p.slots.every(s => s.status === "ok" && s.loaded && s.inside && s.inPage)), "every bill loaded, inside its box, box inside the page (never split)");
    ok(L.every(p => p.slots.every(s => s.ratio == null || Math.abs(s.ratio - s.nat) / s.nat < 0.02)), "aspect ratio kept (no stretch / crop)");
    ok(L.every((p, i) => p.foot === `Page ${i + 1} of ${L.length}`), "Page x of y on every page");
    const att = await page.textContent("[data-attached]");
    ok(id === 500 ? /No bills attached/.test(att) : new RegExp(`${SETS[id].length} file\\(s\\) – site-`).test(att) && !/— \./.test(att), "attached line: " + att.trim().slice(0, 90));
    if (id === 508) ok(L.flatMap(p => p.slots).some(s => /Bill 2 of 3 \(page 2 of 3\) – site-three\.pdf/.test(s.cap)), "PDF pages captioned 'Bill 2 of 3 (page 2 of 3) – site-three.pdf'");
    const pr = await printPdf(page, `${OUT}/print-${id}.pdf`);
    ok(pr.pages === L.length && Math.abs(pr.size.width - 595.3) < 2 && Math.abs(pr.size.height - 841.9) < 2, `browser print: ${pr.pages} A4 portrait page(s)`);
    png(`${OUT}/print-${id}.pdf`, `${OUT}/print-${id}`);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-pdf]")]);
    const f = `${OUT}/download-${id}.pdf`; await dl.saveAs(f); const doc = await PDFDocument.load(fs.readFileSync(f));
    ok(doc.getPageCount() === pr.pages, `Download PDF: ${doc.getPageCount()} page(s) — same as print`);
    png(f, `${OUT}/download-${id}`);
    ok(errs.length === 0, "no page errors " + errs.join(" | ").slice(0, 150));
    await ctx.close();
  }

  console.log("2. EXIF rotation, very large photo, portrait + landscape");
  { const { ctx, page } = await open(b, 507); await ready(page); const L = await layout(page);
    const ex = L.flatMap(p => p.slots).find(s => /exif6/.test(s.cap)); const huge = L.flatMap(p => p.slots).find(s => /huge/.test(s.cap));
    ok(ex && ex.nat > 1.3 && Math.abs(ex.ratio - 1.4) < 0.03, `EXIF-6 photo (stored 1000×1400, orientation 6) shown upright as 1400×1000 (ratio ${ex?.ratio.toFixed(2)})`);
    ok(huge && huge.loaded && huge.inside, "6000 × 4500 photo scaled into its box");
    await page.screenshot({ path: `${OUT}/screen-507.png`, fullPage: true }); await ctx.close(); }

  console.log("3. Loading state: Print and PDF stay disabled until every bill has loaded");
  { const { ctx, page } = await open(b, 504, { slow: 1500 });
    await page.waitForSelector("[data-loading]", { timeout: 10000 });
    ok(await page.isDisabled("[data-print]") && await page.isDisabled("[data-pdf]") && /Loading bills/.test(await page.textContent("[data-loading]")), "'Loading bills… k of 4' with Print / PDF disabled");
    await ready(page); ok(await page.isEnabled("[data-pdf]"), "enabled once all 4 have loaded"); await ctx.close(); }

  console.log("4. A bill that fails to load: error tile + Retry, the other pages still print");
  { const { ctx, page, allow } = await open(b, 509); await ready(page);
    let L = await layout(page); const slots = L.flatMap(p => p.slots);
    ok(slots.filter(s => s.status === "error").length === 1 && slots.filter(s => s.status === "ok").length === 2, "1 error tile, 2 bills fine");
    ok(/Not found/.test(await page.textContent("[data-slot=error]")), "error tile gives the real reason (Not found)");
    const pr = await printPdf(page, `${OUT}/print-509.pdf`); png(`${OUT}/print-509.pdf`, `${OUT}/print-509`);
    ok(pr.pages === L.length, "prints anyway (" + pr.pages + " pages)");
    await allow(); await page.click("[data-slot=error] button:has-text('Retry')"); await page.waitForFunction(() => !document.querySelector("[data-slot=error]") && !document.querySelector("[data-slot=loading]"), null, { timeout: 15000 });
    L = await layout(page); ok(L.flatMap(p => p.slots).every(s => s.status === "ok"), "Retry loads it"); await ctx.close(); }

  console.log("5. Long vendor / particulars, PAID voucher, tall voucher, HEIC");
  { const { ctx, page } = await open(b, 510); await ready(page); const L = await layout(page);
    ok(L.length === 1 && L[0].slots.every(s => s.inPage), "long vendor + particulars wrap; bill still fits page 1");
    const pr = await printPdf(page, `${OUT}/print-510.pdf`); png(`${OUT}/print-510.pdf`, `${OUT}/print-510`); ok(pr.pages === 1, "1 page"); await ctx.close(); }
  { const { ctx, page } = await open(b, 511); await ready(page);
    ok((await page.textContent(".vp-wm")).trim() === "PAID" && (await page.locator(".vp-wm").count()) === 1, "paid voucher: PAID watermark, page 1 only");
    const pr = await printPdf(page, `${OUT}/print-511.pdf`); png(`${OUT}/print-511.pdf`, `${OUT}/print-511`); await ctx.close(); }
  { const { ctx, page } = await open(b, 501); await ready(page);
    ok((await page.textContent(".vp-wm")).trim() === "PAYMENT PENDING", "pending voucher: PAYMENT PENDING watermark"); await ctx.close(); }
  { const { ctx, page } = await open(b, 512); await ready(page); const L = await layout(page);
    ok(L[0].slots.length === 0 && L[1]?.slots.length === 2, "22-line voucher: no room on page 1 → bills start on page 2");
    const pr = await printPdf(page, `${OUT}/print-512.pdf`); png(`${OUT}/print-512.pdf`, `${OUT}/print-512`); ok(pr.pages === L.length, `${pr.pages} pages`); await ctx.close(); }
  { const { ctx, page } = await open(b, 513); await ready(page);
    ok(/HEIC/.test(await page.textContent("[data-slot=error]")), "HEIC this browser cannot decode → clear tile with Open file"); await ctx.close(); }

  console.log("6. A voucher the user may not see");
  { const { ctx, page } = await open(b, 999); await page.waitForTimeout(2500);
    ok(/not found, or you do not have rights/.test(await page.textContent("body")) && !(await page.locator(".vp-page").count()), "refused — no voucher, no bills"); await ctx.close(); }

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
