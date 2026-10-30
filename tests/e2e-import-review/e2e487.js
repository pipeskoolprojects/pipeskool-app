// update487 e2e — Excel import Review page: in-page Add item (pre-filled, one confirm), bulk add, no new windows,
// fit-to-screen layout. Real SQL behind shim.js (local PostgreSQL), real Next.js server. NEW build :3475, OLD :3476.
const { chromium } = require("/home/claude/.npm-global/lib/node_modules/playwright");
const base = require("/home/claude/work/test475/mock471.js");
const fs = require("fs");
const OUT = process.argv[2] || "/tmp/claude-0/e2e487"; fs.mkdirSync(OUT, { recursive: true });
const NEW = "http://localhost:3475", OLD = "http://localhost:3476", DB = "http://mock.supabase.test";
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const post = (p, b) => fetch(DB + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(r => r.json());
const sql = q => post("/__sql", { sql: q });
const DIRECTOR = "00000000-0000-0000-0000-000000000001";
const ROWS29 = [["brass ball valve 50 mm sant", 3], ["brass ball valve 40 mm sant", 12], ["brass ball valve 32 mm sant", 15], ["brass ball valve 25 mm sant", 6], ["brass ball valve 20 mm sant", 8],
  ["CPVC Tee 20mm astral", 3], ["cpvc tee 25 mm astral", 1], ["BRASS ARV 20 MM SANT", 4], ["90 ELBOW 65 MM ASTRAL CPVC", 20], ["UPVC coupler 50mm sch 40 astral", 20],
  ...Array.from({ length: 19 }, (_, i) => ["Fitting - CPVC Union " + [20, 25, 32, 40, 50][i % 5] + "mm [ASTRAL]", i + 2])];

async function makeImport(rows, name) {
  await post("/__as", { uid: DIRECTOR });
  const r = await post("/rest/v1/rpc/fn_import_create", { p_head: { site_id: 2, file_name: name, required_by: "2026-10-29" }, p_rows: rows.map(([t, q], i) => ({ row_no: i + 2, item_text: t, qty: q, unit: "Nos" })) });
  await fetch(NEW + "/api/indent-import/match", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer x" }, body: JSON.stringify({ import_id: r.import_id, phase: "fast" }) });
  await sql(`update indent_import set ai_status = 'skipped: test' where id = ${r.import_id}`);   // no AI in this test
  return r.import_id;
}
async function open(b, app, importId, { w = 1366, h = 768, hideSidebar = false, scale = 1 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const page = await ctx.newPage(); const log = { selects: [], rpc: [], denied: [], writes: [], px: [] }; const popups = [];
  const errs = []; page.on("pageerror", e => errs.push(String(e))); page.on("popup", p => popups.push(p.url())); ctx.on("page", p => { if (p !== page) popups.push(p.url()); });
  await base.install(page, "director", log);
  if (hideSidebar) await page.addInitScript(() => { localStorage.setItem("psk_sidebar_hidden_v2", "1"); });
  await page.route(`${DB}/**`, route => {
    const u = new URL(route.request().url()); const p = u.pathname; const fn = p.startsWith("/rest/v1/rpc/") ? p.split("/").pop() : null;
    if (fn && (/^fn_import|^fn_imp_/.test(fn) || fn === "fn_next_indent_no")) return route.continue();
    if (!fn && /\/rest\/v1\/(material_indents|material_indent_items|item_master)$/.test(p)) return route.continue();
    return route.fallback();
  });
  await page.goto(`${app}/procure/import?id=${importId}`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-review]", { timeout: 20000 });
  return { ctx, page, popups, errs };
}
async function layoutCheck(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.main"); const meta = document.querySelector("[data-meta]") || [...document.querySelectorAll(".muted")].find(e => /rows$/.test(e.textContent.trim()));
    const bar = document.querySelector("[data-bar]") || [...document.querySelectorAll("button")].find(b => b.textContent === "Create indent")?.parentElement;
    const wrap = document.querySelector("[data-tablewrap]");
    const lastRow = [...document.querySelectorAll("[data-review] tbody tr")].pop();
    if (wrap) wrap.scrollTop = wrap.scrollHeight; else main.scrollTop = main.scrollHeight;
    const r = el => el ? el.getBoundingClientRect() : null;
    const lr = r(lastRow), br = r(bar), mr = r(meta);
    return { hScroll: Math.max(main.scrollWidth - main.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth), pageScroll: main.scrollHeight - main.clientHeight,
      metaRight: mr ? Math.round(mr.right) : null, vw: innerWidth, vh: innerHeight, lastBottom: lr ? Math.round(lr.bottom) : null, barTop: br ? Math.round(br.top) : null, barBottom: br ? Math.round(br.bottom) : null,
      overlap: !!(lr && br && lr.bottom > br.top + 1 && lr.top < br.bottom), sticky: wrap ? getComputedStyle(document.querySelector("[data-review] thead th")).position : "" };
  });
}

(async () => {
  await sql("truncate item_alias, match_log, indent_import cascade; update import_settings set shadow_mode = true where id = 1; delete from item_master where created_by is null and id > 334;");
  const imp = await makeImport(ROWS29, "Book1.xlsx");
  const b = await chromium.launch();

  console.log("1. Fit to screen — before (current main) vs after, at the sizes in the brief");
  const SIZES = [[1366, 768, "1366x768"], [1536, 864, "1536x864"], [1920, 1080, "1920x1080"], [1229, 691, "1536@125%"], [1280, 720, "1920@150%"], [1093, 614, "1366@125%"], [1517, 853, "1366@90%"], [1100, 640, "app window small"]];
  for (const [w, h, label] of SIZES) {
    for (const [app, tag] of [[OLD, "before"], [NEW, "after"]]) {
      for (const hide of [false, true]) {
        const { ctx, page } = await open(b, app, imp, { w, h, hideSidebar: hide });
        const L = await layoutCheck(page);
        if (tag === "after") {
          ok(L.hScroll <= 1 && L.metaRight <= L.vw && !L.overlap && L.lastBottom <= L.barTop + 1 && L.pageScroll <= 1 && L.sticky === "sticky",
            `${label}${hide ? " · sidebar hidden" : ""}: no side scroll (${L.hScroll}px), '29 rows' visible (${L.metaRight}/${L.vw}), last row above the bar (${L.lastBottom} ≤ ${L.barTop}), page itself does not scroll, sticky header`);
        } else if (!hide) console.log(`     before ${label}: side scroll ${L.hScroll}px · '29 rows' right edge ${L.metaRight}/${L.vw} · last row hidden behind bar: ${L.overlap || L.lastBottom > L.barTop}`);
        if (!hide && ["1366x768", "1920x1080", "1100x640", "app window small", "1920@150%"].includes(label)) await page.screenshot({ path: `${OUT}/${tag}-${label.replace(/[^\w@%]+/g, "_")}.png` });
        await ctx.close();
      }
    }
  }

  console.log("2. + Add item opens in place, pre-filled; Enter confirms; counts + toast + Undo");
  { const { ctx, page, popups, errs } = await open(b, NEW, imp, { w: 1366, h: 768 });
    const row = (await post("/rest/v1/rpc/fn_import_get", { p_import_id: imp })).rows.find(r => r.item_text === "brass ball valve 40 mm sant");
    ok(row.status === "not_found", "row 'brass ball valve 40 mm sant' is Not in Item Master");
    const chipsBefore = await page.textContent("[data-chips]");
    await page.locator(`[data-row='${row.id}'] [data-add]`).waitFor();
    const t0 = Date.now(); await page.click(`[data-row='${row.id}'] [data-add]`); await page.waitForSelector("[data-add-drawer]"); const ms = Date.now() - t0;
    ok(ms < 400 && popups.length === 0, `drawer open in ${ms} ms (click → visible, incl. test overhead); no new window`);
    const v = async id => page.inputValue("#aid-" + id);
    const pre = { type: await v("item_type"), material: await v("material"), size: await v("size"), make: await v("make"), unit: await v("unit"), hsn: await v("hsn_code") };
    ok(pre.type === "Valve" && pre.material === "Brass Ball Valve" && pre.size === "40mm" && pre.make === "Sant" && pre.unit === "Nos" && pre.hsn === "84818030", "pre-filled: " + JSON.stringify(pre));
    ok((await page.textContent("[data-preview]")) === "Valve - Brass Ball Valve 40mm [Sant]", "live name preview: Valve - Brass Ball Valve 40mm [Sant]");
    ok(/Similar items/.test(await page.textContent("[data-similar]")), "similar items shown (15mm / 20mm Sant ball valves)");
    await page.screenshot({ path: `${OUT}/drawer.png` });
    await page.fill("#aid-size", "41mm"); ok((await page.textContent("[data-preview]")).includes("41mm"), "preview follows edits"); await page.fill("#aid-size", "40mm");
    await page.focus("#aid-material"); await page.keyboard.press("Enter");
    await page.waitForSelector("[data-add-drawer]", { state: "detached", timeout: 8000 });
    await page.waitForSelector("[data-toast]");
    const it = await sql("select id, display_name, hsn_code from item_master where display_name = 'Valve - Brass Ball Valve 40mm [Sant]'");
    const r2 = (await post("/rest/v1/rpc/fn_import_get", { p_import_id: imp })).rows.find(r => r.id === row.id);
    ok(it.length === 1 && it[0].hsn_code === "84818030" && r2.status === "accepted" && String(r2.final_item_id) === String(it[0].id), "Enter → item created in Item Master (HSN kept) and the row Confirmed " + JSON.stringify({ it, st: r2 && r2.status, fi: r2 && r2.final_item_id }));
    const chipsAfter = await page.textContent("[data-chips]");
    const nb = +(chipsBefore.match(/(\d+) not in item master/i) || [])[1], na = +(chipsAfter.match(/(\d+) not in item master/i) || [])[1];
    ok(nb > 0 && na === nb - 1, `chips updated: "${chipsBefore.match(/\d+ not in item master/i)}" → "${chipsAfter.match(/\d+ not in item master/i)}"`);
    ok(/Added to Item Master and confirmed/.test(await page.textContent("[data-toast]")), "toast with Undo");
    await page.click("[data-undo]"); await page.waitForTimeout(1500);
    const r3 = (await post("/rest/v1/rpc/fn_import_get", { p_import_id: imp })).rows.find(r => r.id === row.id);
    ok(r3.status === "not_found" && !(await sql("select 1 from item_master where display_name = 'Valve - Brass Ball Valve 40mm [Sant]'")).length, "Undo → row back to Not in Item Master, new item removed again");
    ok(errs.length === 0 && popups.length === 0, "no page errors, no popups " + errs.join("|").slice(0, 100));
    await ctx.close(); }

  console.log("3. Esc cancels · create failure keeps the drawer open · 'Use this item instead' · Add & go to next");
  { const { ctx, page, popups } = await open(b, NEW, imp);
    const rows = (await post("/rest/v1/rpc/fn_import_get", { p_import_id: imp })).rows; const r40 = rows.find(r => r.item_text === "brass ball valve 40 mm sant");
    await page.click(`[data-row='${r40.id}'] [data-add]`); await page.waitForSelector("[data-add-drawer]"); await page.keyboard.press("Escape");
    ok(!(await page.locator("[data-add-drawer]").count()), "Esc closes the drawer, nothing saved");
    await page.route(`${DB}/rest/v1/item_master*`, r => r.request().method() === "POST" ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "server down for test" }) }) : r.fallback());
    await page.click(`[data-row='${r40.id}'] [data-add]`); await page.waitForSelector("[data-add-drawer]"); await page.fill("#aid-material", "Brass Ball Valve");
    await page.click("[data-add-confirm]"); await page.waitForSelector(".aid-err");
    ok(/server down for test/.test(await page.textContent(".aid-err")) && (await page.inputValue("#aid-material")) === "Brass Ball Valve", "create fails → error shown, drawer stays open with the values");
    await page.unroute(`${DB}/rest/v1/item_master*`);
    await page.fill("#aid-size", "15mm"); await page.waitForSelector("[data-use-existing]");
    ok(/Already in the master/.test(await page.textContent("[data-similar]")) && await page.isDisabled("[data-add-confirm]"), "15mm Sant valve exists → 'Already in the master', Add is blocked");
    await page.click("[data-use-existing]"); await page.waitForSelector("[data-add-drawer]", { state: "detached" });
    const m = (await post("/rest/v1/rpc/fn_import_get", { p_import_id: imp })).rows.find(r => r.id === r40.id);
    ok(m.status === "accepted" && /15mm \[Sant\]/.test(m.final_name || ""), "'Use this item instead' maps the row to the existing item: " + m.final_name);
    await page.click("[data-undo]"); await page.waitForTimeout(1200);
    const r32 = rows.find(r => r.item_text === "brass ball valve 32 mm sant");
    await page.click(`[data-row='${r32.id}'] [data-add]`); await page.waitForSelector("[data-add-next]"); await page.click("[data-add-next]");
    await page.waitForFunction(id => { const d = document.querySelector("[data-add-drawer]"); return d && !d.textContent.includes("brass ball valve 32 mm sant"); }, r32.id, { timeout: 8000 });
    ok(/Excel row \d+/.test(await page.textContent("[data-add-drawer]")), "Add & go to next → drawer moves to the next missing row: " + (await page.textContent(".aid-ref")).slice(0, 50));
    await page.keyboard.press("Escape");
    ok(popups.length === 0, "no new window in any of these actions"); await ctx.close(); }

  console.log("4. Add all missing items (one table, one button) · Change and To be sourced stay in place");
  { const { ctx, page, popups } = await open(b, NEW, imp);
    const before = (await post("/rest/v1/rpc/fn_import_get", { p_import_id: imp })).rows.filter(r => r.status === "not_found").length;
    await page.click("[data-add-all]"); await page.waitForSelector("[data-bulk]");
    const n = await page.locator("[data-bulk-row]").count();
    ok(n === before, `bulk table lists all ${before} missing rows, pre-filled and editable`);
    await page.screenshot({ path: `${OUT}/bulk.png` });
    await page.click("[data-bulk-create]"); await page.waitForFunction(() => !document.querySelector("[data-bulk]"), null, { timeout: 30000 }).catch(() => {});
    const after = (await post("/rest/v1/rpc/fn_import_get", { p_import_id: imp })).rows.filter(r => r.status === "not_found").length;
    ok(after === 0, `Create all & confirm → ${before} rows confirmed, 0 left Not in Item Master`);
    const any = (await post("/rest/v1/rpc/fn_import_get", { p_import_id: imp })).rows.find(r => r.status === "accepted");
    await page.click(`[data-row='${any.id}'] [data-change]`).catch(async () => { await page.click(`[data-row='${any.id}'] [data-more]`); await page.click(`[data-row='${any.id}'] [data-change]`); });
    await page.waitForSelector("[data-picker]"); ok(popups.length === 0, "Change opens the in-page picker (no window)"); await page.keyboard.press("Escape").catch(() => {});
    await ctx.close(); }

  console.log("5. Narrow window: actions collapse into a compact row + ⋯ menu");
  { const { ctx, page } = await open(b, NEW, imp, { w: 1100, h: 640 });
    ok((await page.locator("[data-more]").count()) > 0, "⋯ menus shown at 1100 px");
    const L = await layoutCheck(page); ok(L.hScroll <= 1, "still no side scroll"); await ctx.close(); }

  console.log("6. 500 rows (max per file): table scrolls smoothly, bar never covers a row");
  { const big = await makeImport(Array.from({ length: 500 }, (_, i) => ["Fitting - CPVC Tee " + [15, 20, 25, 32, 40, 50][i % 6] + "mm [ASTRAL]", i + 1]), "big.xlsx");
    const { ctx, page } = await open(b, NEW, big, { w: 1366, h: 768 });
    const res = await page.evaluate(async () => {
      const w = document.querySelector("[data-tablewrap]"); const frames = []; let last = performance.now();
      for (let i = 0; i < 90; i++) { w.scrollTop += w.scrollHeight / 90; await new Promise(r => requestAnimationFrame(r)); const t = performance.now(); frames.push(t - last); last = t; }
      frames.sort((a, b) => a - b); return { median: frames[45], p95: frames[85], rows: document.querySelectorAll("[data-review] tbody tr").length };
    });
    ok(res.rows === 500 && res.p95 < 50, `500 rows (the import maximum) · scroll frame time median ${res.median.toFixed(1)} ms, p95 ${res.p95.toFixed(1)} ms`);
    const L = await layoutCheck(page); ok(!L.overlap && L.lastBottom <= L.barTop + 1, "after scrolling to the end the last row sits above the bar");
    await page.screenshot({ path: `${OUT}/after-500rows-end.png` }); await ctx.close(); }

  console.log("7. Item Master page unchanged (old vs new build, Add item form)");
  { const shots = [];
    for (const app of [OLD, NEW]) {
      const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const page = await ctx.newPage(); await base.install(page, "director", { selects: [], rpc: [], denied: [], writes: [], px: [] });
      await page.goto(`${app}/items`, { waitUntil: "networkidle" }); await page.click("button:has-text('Add item')"); await page.waitForTimeout(500);
      const form = page.locator(".panel:has(h2:has-text('Add item'))");
      shots.push({ text: (await form.innerText()).replace(/\s+/g, " "), inputs: await form.locator("input, select").count(), png: await form.screenshot({ path: `${OUT}/items-form-${app.endsWith("6") ? "before" : "after"}.png` }) });
      await ctx.close();
    }
    ok(shots[0].text === shots[1].text && shots[0].inputs === shots[1].inputs, `same fields and labels (${shots[1].inputs} inputs)`);
    ok(Buffer.compare(shots[0].png, shots[1].png) === 0, "pixel-identical screenshot of the Add item form"); }

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
