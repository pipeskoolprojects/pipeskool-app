// update483 e2e: punch selfie — when getUserMedia is denied / missing, the phone's camera app (hidden
// <input type=file accept=image/* capture=user>) is opened synchronously inside the tap; no permission pre-check,
// no intermediate screen, photo goes through the same punch upload untouched, 2-minute freshness check, timing logs.
const { chromium } = require("playwright");
const base = require(process.env.MOCK471 || "./mock471.js");
const fs = require("fs");
const OUT = process.argv[2] || "/tmp/claude-0/cam483"; fs.mkdirSync(OUT, { recursive: true });
const PORT = process.argv[3] || 3475;
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const WORKER = { id: 501, full_name: "Abinash Shastri", mobile: "9000000012", category: "site engineer", site_id: 2, site_name: "SOUL Campus, GIFT City", geofence_lat: 23.16, geofence_lng: 72.68, geofence_radius_m: 200, is_active: true };

// instrumentation: order of permission query / getUserMedia / input.click, user activation at click time, overlay states seen
const SPY = `window.__ev = []; const T = () => performance.now();
  if (navigator.permissions && navigator.permissions.query) { const q = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = d => { window.__ev.push({ e: "perm", t: T() }); return q(d); }; }
  const clk = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { if (this.type === "file") window.__ev.push({ e: "click", t: T(), active: navigator.userActivation ? navigator.userActivation.isActive : null, capture: this.getAttribute("capture"), accept: this.accept }); return clk.call(this); };
  window.__states = []; new MutationObserver(() => { const el = document.querySelector("[data-cam-state]"); const s = el ? el.getAttribute("data-cam-state") : "none"; if (window.__states[window.__states.length - 1] !== s) window.__states.push(s); }).observe(document, { subtree: true, childList: true, attributes: true });`;
const GUM = { ok: `const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = c => { window.__ev.push({ e: "gum", t: performance.now() }); return real(c); };` };
for (const n of ["NotAllowedError", "PermissionDeniedError", "NotFoundError"]) GUM[n] = `navigator.mediaDevices.getUserMedia = c => { window.__ev.push({ e: "gum", t: performance.now() }); return Promise.reject(new DOMException("x", "${n}")); };`;
GUM.noapi = `Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });`;
const NOGESTURE = `window.__act = false; Object.defineProperty(navigator, "userActivation", { get: () => ({ isActive: window.__act, hasBeenActive: true }), configurable: true });`;

async function open(b, gum, { noGesture = false, punchedIn = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, geolocation: { latitude: 23.1601, longitude: 72.6801, accuracy: 30 }, permissions: ["geolocation", "camera"], userAgent: "Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36" });
  const page = await ctx.newPage(); const log = { selects: [], rpc: [], denied: [], writes: [], px: [], camLogs: [], puts: [], punches: [] };
  const errs = []; page.on("pageerror", e => errs.push(String(e))); page.on("console", m => { if (m.type() === "error" && !/WebSocket|realtime|ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await base.install(page, "supervisor", log);
  await page.addInitScript(w => { localStorage.setItem("psk_worker", JSON.stringify(w)); const p = JSON.parse(localStorage.getItem("psk_session") || "{}"); p.mobile = w.mobile; p.currentSite = 2; localStorage.setItem("psk_session", JSON.stringify(p)); }, WORKER);
  await page.addInitScript(SPY + (noGesture ? NOGESTURE : "") + GUM[gum]);
  let today = punchedIn ? { punch_in: new Date().toISOString(), punch_out: null, status: null } : { punch_in: null, punch_out: null, status: null };
  await page.route("http://mock.supabase.test/rest/v1/rpc/**", async route => {
    const fn = route.request().url().split("/").pop().split("?")[0]; const json = b => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (fn === "fn_camera_log") { log.camLogs.push(route.request().postDataJSON().p); return json(null); }
    if (fn === "fn_worker_site_geo") return json([{ site_id: 2, site_name: WORKER.site_name, geofence_lat: 23.16, geofence_lng: 72.68, geofence_radius_m: 200 }]);
    if (fn === "fn_worker_today") return json(today);
    if (fn === "fn_worker_punch") { const a = route.request().postDataJSON(); log.punches.push(a); today = today.punch_in ? { ...today, punch_out: new Date().toISOString(), status: "present", ot_hours: 0 } : { ...today, punch_in: new Date().toISOString() }; return json({ ok: true, data: today }); }
    return route.fallback();
  });
  await page.route("**/api/files/upload", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "http://r2.test/put/" + JSON.parse(r.request().postData()).key }) }));
  await page.route("http://r2.test/**", r => { log.puts.push({ url: r.request().url(), body: r.request().postDataBuffer(), type: r.request().headers()["content-type"] }); return r.fulfill({ status: 200, body: "" }); });
  return { ctx, page, log, errs };
}
async function load(page) { await page.goto(`http://localhost:${PORT}/m`, { waitUntil: "networkidle" }); await page.waitForSelector("button.punch-btn:not([disabled])", { timeout: 20000 }); await page.waitForTimeout(600); }
const PHOTO = (() => { const b = Buffer.alloc(350 * 1024); for (let i = 0; i < b.length; i++) b[i] = (i * 31 + 7) & 255; b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; })();   // ~350 KB "camera" JPEG
const ev = page => page.evaluate(() => window.__ev);

(async () => {
  const b = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });

  console.log("1. Live path unchanged: getUserMedia is the first call (no permission query before it) → preview → Capture → punch; timings logged");
  { const { ctx, page, log, errs } = await open(b, "ok");
    await load(page); await page.click("button.punch-btn");
    await page.waitForSelector("[data-cam-state='live']", { timeout: 8000 }); await page.waitForSelector("button:has-text('Capture'):not([disabled])", { timeout: 8000 });
    await page.waitForFunction(() => (document.querySelector("video")?.videoWidth || 0) > 0, null, { timeout: 8000 });
    const E = await ev(page); ok(E[0]?.e === "gum" && !E.some(x => x.e === "perm"), "getUserMedia called first; navigator.permissions.query never called on the live path (" + E.map(x => x.e).join(",") + ")");
    ok(/Live selfie for punch/.test(await page.textContent("[data-cam-state]")), "same 'Live selfie for punch' screen");
    await page.screenshot({ path: `${OUT}/1-live.png` });
    await page.click("button:has-text('Capture')"); await page.waitForTimeout(1500);
    ok(log.punches.length === 1 && /^selfies\/501_\d+\.jpg$/.test(log.punches[0].p_selfie_path || ""), "punch saved with the selfie path (" + log.punches[0]?.p_selfie_path + ")");
    const st = log.camLogs.find(l => l.result === "started"), cf = log.camLogs.find(l => l.result === "punch_confirmed");
    ok(st && st.path === "live" && typeof st.t_open_ms === "number" && st.attempt_id && st.app_version === "v483", "camera-open row: path live, t_open_ms " + st?.t_open_ms + " ms, attempt id, v483");
    ok(cf && cf.path === "live" && cf.attempt_id === st?.attempt_id && cf.t_confirm_ms >= st?.t_open_ms, "punch-confirmed row: path live, same attempt, t_confirm_ms " + cf?.t_confirm_ms + " ms");
    ok(/Pipeskool v483/.test(await page.textContent("body")), "build tag v483");
    ok(errs.length === 0, "no page errors " + errs.join(" | ")); await ctx.close(); }

  for (const name of ["NotAllowedError", "PermissionDeniedError", "NotFoundError"]) {
    console.log(`2. ${name}: tap opens the phone camera app at once — synchronously, inside the tap, no screen in between`);
    const { ctx, page, log, errs } = await open(b, name);
    await load(page);
    const chooserP = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null);
    await page.click("button.punch-btn");
    const fc = await chooserP; ok(!!fc, "file chooser (phone camera) opened from the Punch tap");
    const E = await ev(page); const g = E.find(x => x.e === "gum"), c = E.find(x => x.e === "click"), pi = E.findIndex(x => x.e === "perm");
    ok(E[0]?.e === "gum" && (pi === -1 || pi > E.findIndex(x => x.e === "click")), "order: getUserMedia first, click next; no permission query before them (" + E.map(x => x.e).join(",") + ")");
    ok(c && c.active === true && c.capture === "user" && c.accept === "image/*", "input.click() ran with user activation still active; capture=user accept=image/*");
    ok(c && g && c.t - g.t < 50, `tap → camera app requested in ${c && g ? (c.t - g.t).toFixed(1) : "?"} ms after getUserMedia (same handler, no setTimeout)`);
    const states = await page.evaluate(() => window.__states);
    ok(!states.includes("error") && (await page.locator("[data-cam-state]").count()) === 0, "no error card, no spinner left behind (states seen: " + states.join(" → ") + ")");
    if (name === "NotAllowedError") {
      await fc.setFiles({ name: "IMG_20261028_101500.jpg", mimeType: "image/jpeg", buffer: PHOTO });
      await page.waitForFunction(() => /Punched in|punched in/i.test(document.body.innerText), null, { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(600);
      ok(log.punches.length === 1 && /^selfies\/501_\d+\.jpg$/.test(log.punches[0].p_selfie_path || ""), "punch saved through the same fn_worker_punch call with the selfie path");
      ok(log.puts.length === 1 && Buffer.compare(log.puts[0].body, PHOTO) === 0 && log.puts[0].type === "image/jpeg", `photo uploaded byte-for-byte (${log.puts[0]?.body.length} bytes, no resize / compression)`);
      const er = log.camLogs.find(l => l.result === "error"), fo = log.camLogs.find(l => l.result === "fallback_opened"), cf = log.camLogs.find(l => l.result === "punch_confirmed");
      ok(er && er.error_name === "NotAllowedError" && er.permission_state, "denied attempt logged (permission read AFTER the failure: " + er?.permission_state + ")");
      ok(fo && fo.path === "fallback" && typeof fo.t_open_ms === "number" && fo.attempt_id === er?.attempt_id, "fallback_opened row: tap → camera app " + fo?.t_open_ms + " ms");
      ok(cf && cf.path === "fallback" && cf.attempt_id === fo?.attempt_id && cf.t_confirm_ms >= fo?.t_open_ms, "punch_confirmed row: path fallback, " + cf?.t_confirm_ms + " ms");
      await page.screenshot({ path: `${OUT}/2-fallback-punched.png` });
      console.log("3. Second punch (punch out): again no permission pre-check — straight to getUserMedia → camera app");
      await page.evaluate(() => { window.__ev = []; }); await page.waitForSelector("button.punch-btn:not([disabled])");
      const c2 = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null); await page.click("button.punch-btn"); const fc2 = await c2;
      const E2 = await ev(page); ok(!!fc2 && E2[0]?.e === "gum" && E2[1]?.e === "click", "punch out: " + E2.map(x => x.e).join(","));
      await fc2?.setFiles([]); await page.waitForTimeout(500);
      ok(log.punches.length === 1 && (await page.isEnabled("button.punch-btn")), "camera app closed without a photo → nothing saved, back on the punch screen");
    }
    ok(errs.length === 0, "no page errors " + errs.join(" | ")); await ctx.close();
  }

  console.log("4. Old photo (lastModified > 2 min): rejected with a short message, nothing uploaded — synchronous check, no network");
  { const { ctx, page, log } = await open(b, "NotAllowedError");
    await load(page); const cp = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null); await page.click("button.punch-btn"); await cp;
    const before = log.selects.length + log.rpc.length;
    await page.evaluate(() => { const i = document.querySelector("[data-punch-fallback]"); const f = new File([new Uint8Array([255, 216, 255, 0])], "old.jpg", { type: "image/jpeg", lastModified: Date.now() - 180000 }); const dt = new DataTransfer(); dt.items.add(f); i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); });
    const msg = await page.textContent("body"); await page.waitForTimeout(500);
    ok(/older than 2 minutes/.test(msg), "message shown at once: 'older than 2 minutes … take a new selfie'");
    ok(log.puts.length === 0 && log.punches.length === 0, "no upload, no punch");
    ok(log.camLogs.some(l => l.result === "fallback_stale" && /age 18\d s/.test(l.error_message || "")), "logged as fallback_stale (age 180 s)");
    // a fresh photo right after still works
    const cp2 = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null); await page.click("button.punch-btn"); const f2 = await cp2; await f2?.setFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: PHOTO }); await page.waitForTimeout(1500);
    ok(log.punches.length === 1, "next fresh photo punches normally"); await ctx.close(); }

  console.log("5. Denial arrives after the tap gesture expired: the usual 'Camera is blocked' card; its Try again tap opens the camera app");
  { const { ctx, page, log } = await open(b, "NotAllowedError", { noGesture: true });
    await load(page); await page.click("button.punch-btn"); await page.waitForSelector("[data-cam-state='error']", { timeout: 6000 });
    ok(/Camera is blocked for this site/.test(await page.textContent("[role=alert]")) && (await page.evaluate(() => window.__ev.filter(x => x.e === "click").length)) === 0, "card shown (no blocked programmatic click attempted)");
    await page.evaluate(() => { window.__act = true; });   // the Try again tap is a fresh gesture
    const cp = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null); await page.click("button:has-text('Try again')"); const fc = await cp;
    ok(!!fc && (await page.locator("[data-cam-state]").count()) === 0, "Try again → phone camera app opens, card closes");
    await fc?.setFiles({ name: "b.jpg", mimeType: "image/jpeg", buffer: PHOTO }); await page.waitForTimeout(1500);
    ok(log.punches.length === 1 && log.camLogs.some(l => l.result === "punch_confirmed" && l.path === "fallback"), "punch saved via fallback"); await ctx.close(); }

  console.log("6. No camera API at all (old browser / in-app browser): camera app opens from the tap");
  { const { ctx, page } = await open(b, "noapi");
    await load(page); const cp = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null); await page.click("button.punch-btn");
    ok(!!(await cp), "file chooser opened"); await ctx.close(); }

  console.log("7. IT camera-log screen: simple averages per path (tap → camera open, tap → punch confirmed)");
  { const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } }); const page = await ctx.newPage(); const log = { selects: [], rpc: [], denied: [], writes: [], px: [] };
    await base.install(page, "it", log);
    const at = new Date().toISOString(); const R = (id, o) => ({ id, at, kind: "punch", user_id: 12, worker_id: 501, app_version: "v483", facing: "user", ...o });
    const ROWS = [R(1, { result: "started", path: "live", t_open_ms: 400, start_ms: 400 }), R(2, { result: "started", path: "live", t_open_ms: 800, start_ms: 800 }), R(3, { result: "punch_confirmed", path: "live", t_confirm_ms: 6000 }), R(4, { result: "punch_confirmed", path: "live", t_confirm_ms: 8000 }),
      R(5, { result: "error", path: "live", error_name: "NotAllowedError", start_ms: 20 }), R(6, { result: "fallback_opened", path: "fallback", t_open_ms: 30, start_ms: 30 }), R(7, { result: "punch_confirmed", path: "fallback", t_confirm_ms: 12000 }), R(8, { result: "fallback_stale", path: "fallback", error_message: "age 300 s" })];
    await page.route("http://mock.supabase.test/rest/v1/punch_camera_log**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROWS) }));
    await page.goto(`http://localhost:${PORT}/it/camera-log`, { waitUntil: "networkidle" }); await page.waitForSelector("[data-timing] table");
    const rows = await page.$$eval("[data-timing] tbody tr", trs => trs.map(t => t.innerText.replace(/\s+/g, " ").trim()));
    ok(/camera open Live camera 600 ms 800 ms 2/.test(rows[0]) && /camera open Phone camera app \(fallback\) 30 ms 30 ms 1/.test(rows[1]), "camera open: live avg 600 ms (2) · fallback 30 ms (1) — " + rows.slice(0, 2).join(" | "));
    ok(/punch confirmed Live camera 7\.0 s 8\.0 s 2/.test(rows[2]) && /punch confirmed Phone camera app \(fallback\) 12\.0 s 12\.0 s 1/.test(rows[3]), "punch confirmed: live avg 7.0 s · fallback 12.0 s — " + rows.slice(2).join(" | "));
    ok((await page.locator("[data-log] tbody tr").count()) === 8 && /Pattern in the failures shown \(2 of 8 rows\)/.test(await page.textContent("main")), "log lists all 8 rows; only error + stale count as failures (" + (await page.locator("[data-log] tbody tr").count()) + " · " + ((await page.textContent("main")).match(/Pattern[^)]*\)/) || [""])[0] + ")");
    await page.screenshot({ path: `${OUT}/7-it-timing.png`, fullPage: true }); await ctx.close(); }

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
