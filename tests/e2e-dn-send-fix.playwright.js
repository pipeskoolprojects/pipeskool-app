// update482 e2e: Delivery Note "Send to site" when the link cannot be made — the exact production failure (tables missing),
// readable error + code + Copy details + Retry, never-blocked sending, link on open with expiry, normalised numbers, no
// placeholder sent, history with link id, roles, attach on/off, slow network (10 s timeout), public link / wrong / expired token.
const { chromium } = require("playwright");
const mock = require("./mockdn.js");
const http = require("http");
const fs = require("fs");
const OUT = process.argv[2] || "/tmp/claude-0/dn482"; fs.mkdirSync(OUT, { recursive: true });
const PORT = process.argv[3] || 3475, BASE = `http://localhost:${PORT}`;
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const sb = (method, path, body) => new Promise((res, rej) => { const r = http.request({ host: "127.0.0.1", port: 54321, path, method, headers: { "content-type": "application/json", apikey: "svc" } }, x => { let d = ""; x.on("data", c => d += c); x.on("end", () => res(d ? JSON.parse(d) : null)); }); r.on("error", rej); r.end(body ? JSON.stringify(body) : undefined); });
const VENDOR = /SECRET VENDOR|VDC-99|Dispatched through/i;
let ipn = 30;
(async () => {
  await mock.ctl("/__reset");
  const b = await chromium.launch();
  const mk = async (who, { share = false } = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"], extraHTTPHeaders: { "x-forwarded-for": "198.51.100." + (ipn++) } });
    const opened = []; await ctx.route("https://wa.me/**", r => { opened.push(r.request().url()); r.fulfill({ status: 200, contentType: "text/html", body: "wa" }); });
    const page = await ctx.newPage(); const log = { selects: [], rpc: [], denied: [], writes: [], px: [] }; const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("console", m => { if (m.type() === "error" && !/WebSocket|realtime|ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await mock.install(page, who, log);
    if (share) await page.addInitScript(() => { window.__shared = []; navigator.canShare = d => true; navigator.share = async d => { window.__shared.push({ text: d.text, url: d.url || null, files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) }); }; });
    return { ctx, page, opened, errs };
  };
  const openSend = async (page, id = 312) => { await page.goto(`${BASE}/stock/challans/send?id=${id}`, { waitUntil: "networkidle" }); await page.waitForSelector("#dn-panel"); await page.waitForFunction(() => document.querySelector(".linkrow")?.dataset.linkState !== "creating", null, { timeout: 20000 }); };
  const histText = page => page.textContent("#dn-panel .hist");

  console.log("1. Reproduce the production failure: delivery-note tables missing (migration not run)");
  await mock.ctl("/__missing", { tables: ["delivery_note_links", "delivery_note_sends"] });
  { const { ctx, page, opened, errs } = await mk("it", { share: true });
    const resp = page.waitForResponse(r => r.url().endsWith("/api/dn/link"));
    await openSend(page); const r = await resp; const body = await r.json();
    ok(r.status() === 500 && body.code === "DN_TABLE_MISSING" && /PGRST205/.test(body.detail), `POST /api/dn/link → ${r.status()} ${body.code} (${body.detail.slice(0, 90)}…)`);
    const t = await page.textContent(".linkrow");
    ok(/Could not create the link \(500 – server error\): The delivery-note tables are missing — run pipeskool_delivery_note_send\.sql/.test(t) && /DN_TABLE_MISSING/.test(t), "panel shows the real reason with the code (no generic text)");
    ok(/You can still send/.test(t) && (await page.locator(".linkrow button:has-text('Retry')").count()) === 1 && (await page.locator(".linkrow button:has-text('Copy error details')").count()) === 1, "Retry + Copy error details offered; panel says sending still works");
    await page.click(".linkrow button:has-text('Copy error details')"); const det = await page.evaluate(() => navigator.clipboard.readText());
    ok(/Code: DN_TABLE_MISSING/.test(det) && /Status: 500/.test(det) && /PSP\/319\/2026-27/.test(det), "Copy error details → note no., status, code, detail, browser");
    await page.screenshot({ path: `${OUT}/1-link-failed.png`, fullPage: true });
    // sending is not blocked
    await page.fill("#dn-mob", "+91 90000 00012"); await page.click("#dn-panel button.wa"); await page.waitForTimeout(1500);
    const wa = decodeURIComponent((opened[0] || "").split("text=")[1] || "");
    ok((opened[0] || "").startsWith("https://wa.me/919000000012?text=") && !/link is created when you send/.test(wa) && /The delivery note PDF is attached \/ sent separately\./.test(wa) && !VENDOR.test(wa), "WhatsApp still opens (normalised +91 90000 00012 → 9000000012), placeholder replaced by the 'PDF sent separately' line");
    ok(await page.inputValue("#dn-mob") === "9000000012", "number field normalised");
    await page.click("#dn-panel button:has-text('Share')"); await page.waitForTimeout(1500);
    const sh = await page.evaluate(() => window.__shared[0]);
    ok(sh && sh.files.length === 1 && sh.files[0].name === "Delivery-Note-PSP-319-2026-27.pdf" && sh.files[0].size > 5000 && !/link is created/.test(sh.text), "Share… carries the PDF file (link-less), no placeholder");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dn-panel button:has-text('Download PDF')")]);
    ok(dl.suggestedFilename() === "Delivery-Note-PSP-319-2026-27.pdf", "Download PDF works on its own");
    ok(await page.isDisabled("#dn-panel button:has-text('Copy link')"), "Copy link disabled while there is no link (title explains)");
    await page.waitForTimeout(1500); ok(/record this send in the history/.test(await page.textContent("#dn-panel")) , "history could not be saved → said so (sends table missing), sending not blocked");
    // tables come back (migration run) → Retry → live link with expiry
    await mock.ctl("/__missing", { tables: [] });
    await page.click(".linkrow button:has-text('Retry')"); await page.waitForFunction(() => document.querySelector(".linkrow")?.dataset.linkState === "live", null, { timeout: 15000 });
    const lr = await page.textContent(".linkrow");
    ok(/Secure link · valid till \d{2} \w{3} \d{4} \(30 days\)/.test(lr) && /\/dn\/[A-Za-z0-9_-]{32}/.test(lr), "Retry after the fix → real link + expiry shown in the panel");
    ok(/\/dn\/[A-Za-z0-9_-]{32}/.test(await page.inputValue("#dn-msg")) && !/link is created when you send/.test(await page.inputValue("#dn-msg")), "message now carries the real link");
    ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
    await ctx.close(); }

  console.log("2. Normal flow as IT Executive: link on open, every channel, history with link id, attach on/off");
  await mock.ctl("/__reset");
  { const { ctx, page, opened } = await mk("it", { share: true });
    const t0 = Date.now(); await openSend(page); ok(await page.getAttribute(".linkrow", "data-link-state") === "live" && Date.now() - t0 < 10000, `link created as the panel opens (${Date.now() - t0} ms)`);
    const link = (/\/dn\/[A-Za-z0-9_-]{32}/.exec(await page.textContent(".linkrow")) || [""])[0];
    for (const bad of ["", "12345", "5876543210", "98765 4321"]) { await page.fill("#dn-mob", bad); await page.click("#dn-panel button.wa"); ok(/Type the mobile number first|valid 10-digit/.test(await page.textContent("#dn-panel .err")), `invalid number "${bad}" → message, nothing opened`); }
    ok(opened.length === 0, "no WhatsApp tab for invalid numbers");
    await page.fill("#dn-mob", "098765 43210"); await page.click("#dn-panel button.wa"); await page.waitForTimeout(1200);
    ok(opened[0]?.startsWith("https://wa.me/919876543210?text=") && decodeURIComponent(opened[0]).includes(link), "098765 43210 → wa.me/919876543210 with the real link");
    await page.click("#dn-panel button:has-text('Send SMS')"); await page.waitForTimeout(900);
    ok(/On a computer SMS cannot be opened/.test(await page.textContent("#dn-panel")) && (await page.evaluate(() => navigator.clipboard.readText())).includes(link), "SMS on desktop → message (with link) shown + copied");
    await page.fill("#dn-mail", "bad@"); await page.click("#dn-panel button.em"); ok(/valid email/.test(await page.textContent("#dn-panel")), "invalid email → message");
    await page.fill("#dn-mail", "  store@site.com "); await page.click("#dn-panel button.em"); await page.waitForTimeout(1500);
    let sh = await page.evaluate(() => window.__shared.slice(-1)[0]); ok(sh?.files?.[0]?.name === "Delivery-Note-PSP-319-2026-27.pdf", "Email with 'Attach PDF' ticked on a share-capable device → share sheet with the PDF");
    await page.click("#dn-attach"); await page.click("#dn-panel button:has-text('Share')"); await page.waitForTimeout(1000);
    sh = await page.evaluate(() => window.__shared.slice(-1)[0]); ok(sh && sh.files.length === 0 && sh.url && sh.url.includes(link), "Share… with attach unticked → message + link, no file");
    await page.click("#dn-attach"); await page.click("#dn-panel button:has-text('Share')"); await page.waitForTimeout(1200);
    sh = await page.evaluate(() => window.__shared.slice(-1)[0]); ok(sh?.files?.length === 1, "Share… with attach ticked → PDF file");
    await page.click("#dn-panel button:has-text('Copy link')"); await page.waitForTimeout(700); ok((await page.evaluate(() => navigator.clipboard.readText())).endsWith(link), "Copy link → the secure link");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dn-panel button:has-text('Download PDF')")]); ok(!!dl, "Download PDF");
    await page.waitForTimeout(1200);
    const h = await histText(page);
    ok(/WhatsApp · 98765 xxxx0[\s\S]*Sent via WhatsApp/.test(h) && /SMS · 98765 xxxx0[\s\S]*Sent via SMS/.test(h) && /Email · stxxx@site\.com[\s\S]*Sent via email/.test(h) && /Share[\s\S]*Sent via share sheet/.test(h) && /Copy link/.test(h) && /Download PDF/.test(h), "history: every channel, masked recipient, 'Sent via <channel>'");
    const d = await mock.dump(); const linkRow = d.delivery_note_links.find(l => link.endsWith(l.token));
    ok(d.delivery_note_sends.length >= 6 && d.delivery_note_sends.every(s => s.link_id === linkRow.id) && d.delivery_note_links.length === 1, `every send row carries link_id ${linkRow.id}; one link only (idempotent)`);
    await page.reload({ waitUntil: "networkidle" }); await page.waitForSelector("#dn-panel .hist .hi"); ok((await page.locator("#dn-panel .hist .hi").count()) >= 6 && (await page.textContent(".linkrow")).includes(link), "after reload: same link reused, history kept");
    await page.screenshot({ path: `${OUT}/2-sent.png`, fullPage: true });
    // public link in a private window; open is reflected in history
    const priv = await b.newContext({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.200" } }); const pp = await priv.newPage();
    await pp.goto(BASE + link); ok(/DELIVERY NOTE/.test(await pp.textContent("body")) && !VENDOR.test(await pp.textContent("body")), "public link opens without login (private window), no vendor");
    const pr = await pp.request.get(BASE + link + "/pdf"); ok(pr.status() === 200 && pr.headers()["content-type"] === "application/pdf", "public PDF without login");
    ok((await pp.request.get(BASE + "/dn/WRONGWRONGWRONGWRONGWRONGWRONG12/pdf")).status() === 410 && /no longer available/.test(await (await pp.goto(BASE + "/dn/WRONGWRONGWRONGWRONGWRONGWRONG12")).text()), "wrong token refused (page message, PDF 410)");
    await sb("PATCH", `/rest/v1/delivery_note_links?id=eq.${linkRow.id}`, { expires_at: new Date(Date.now() - 60000).toISOString() });
    ok(/no longer available/.test(await (await pp.goto(BASE + link)).text()) && (await pp.request.get(BASE + link + "/pdf")).status() === 410, "expired token refused");
    await priv.close();
    await page.reload({ waitUntil: "networkidle" }); await page.waitForFunction(() => document.querySelector(".linkrow")?.dataset.linkState === "live", null, { timeout: 15000 });
    ok(!(await page.textContent(".linkrow")).includes(link) && /link opened/.test(await histText(page)), "expired link → a fresh link on open; earlier rows show 'link opened'");
    await ctx.close(); }

  console.log("3. Roles");
  for (const [who, expect] of [["supervisor", "live"], ["director", "live"], ["hoadmin", "denied"], ["storekeeper", "denied"]]) {
    const { ctx, page } = await mk(who); await page.goto(`${BASE}/stock/challans/send?id=312`, { waitUntil: "networkidle" }); await page.waitForSelector("#dn-panel"); await page.waitForTimeout(1500);
    const st = await page.getAttribute(".linkrow", "data-link-state").catch(() => null); const t = await page.textContent("#dn-panel");
    ok(expect === "live" ? st === "live" : /do not have the/.test(t), `${who}: ${expect === "live" ? "link created" : "panel explains the missing right (capability not granted in this fixture)"}`);
    if (who === "director") { await page.fill("#dn-mob", "9000000012"); const [pop] = await Promise.all([ctx.waitForEvent("page"), page.click("#dn-panel button.wa")]); await page.waitForTimeout(800); ok(/Sent via WhatsApp/.test(await histText(page)), "director: WhatsApp send recorded"); }
    await ctx.close();
  }
  { const { ctx, page } = await mk("hoadmin"); await page.goto(`${BASE}/stock/challans`, { waitUntil: "domcontentloaded" }); const r = await page.evaluate(async () => { const x = await fetch("/api/dn/link", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" }, body: JSON.stringify({ challan_id: 312 }) }); return [x.status, (await x.json()).code]; }); ok(r[0] === 403 && r[1] === "DN_NO_RIGHT", "403 carries code DN_NO_RIGHT"); await ctx.close(); }

  console.log("4. Slow network: link call times out after 10 s, panel stays usable, Retry");
  await mock.ctl("/__reset"); await mock.ctl("/__slow", { ms: 12000 });
  { const { ctx, page, opened } = await mk("it");
    const t0 = Date.now(); await page.goto(`${BASE}/stock/challans/send?id=312`, { waitUntil: "domcontentloaded" }); await page.waitForSelector("#dn-panel", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector(".linkrow")?.dataset.linkState === "failed", null, { timeout: 20000 }); const took = Date.now() - t0;
    ok(/no answer/.test(await page.textContent(".linkrow")) && /DN_TIMEOUT/.test(await page.textContent(".linkrow")) && took < 16000, `timeout shown after ~10 s (${(took / 1000).toFixed(1)} s): DN_TIMEOUT`);
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#dn-panel button:has-text('Download PDF')")]); ok(!!dl, "Download PDF still works during the slow period");
    await mock.ctl("/__slow", { ms: 0 }); await page.click(".linkrow button:has-text('Retry')"); await page.waitForFunction(() => document.querySelector(".linkrow")?.dataset.linkState === "live", null, { timeout: 15000 });
    ok(true, "network back → Retry → live link");
    await page.screenshot({ path: `${OUT}/4-after-retry.png`, fullPage: true });
    await ctx.close(); }

  console.log("5. Server returns an error on send: shown with code, the chat still opened");
  { const { ctx, page, opened } = await mk("it"); await openSend(page);
    await page.route("**/api/dn/send", r => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, code: "DN_SEND_FAILED", error: "Could not record the send.", detail: "simulated" }) }));
    await page.fill("#dn-mob", "9000000012"); await page.click("#dn-panel button.wa"); await page.waitForTimeout(1200);
    ok(opened.length === 1 && /Could not record this send in the history \(500 – server error\)/.test(await page.textContent("#dn-panel")) && /DN_SEND_FAILED/.test(await page.textContent("#dn-panel")), "WhatsApp opened; history failure shown with code");
    await ctx.close(); }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
