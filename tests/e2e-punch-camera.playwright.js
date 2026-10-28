// update481 e2e: the punch selfie step — every camera outcome shows a state (spinner → live / error with steps + Try again),
// (update483: denied/no-API cases here run with an expired tap gesture, so the card is shown; the fallback to the
// phone camera app is covered by e2e483.js)
// the camera starts from the tap, fallbacks run, every attempt is logged (fn_camera_log), and the IT screen shows the pattern.
const { chromium } = require("playwright");
const base = require("./mock471.js");
const fs = require("fs");
const OUT = process.argv[2] || "/tmp/claude-0/cam481"; fs.mkdirSync(OUT, { recursive: true });
const PORT = process.argv[3] || 3475;
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const WORKER = { id: 501, full_name: "Abinash Shastri", mobile: "9000000012", category: "site engineer", site_id: 2, site_name: "SOUL Campus, GIFT City", geofence_lat: 23.16, geofence_lng: 72.68, geofence_radius_m: 200, is_active: true };

// scenario: how navigator.mediaDevices.getUserMedia behaves on this "phone"
const SCENARIOS = {
  ok: `window.__cam = { calls: [] }; const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = c => { window.__cam.calls.push(c); return real(c); };`,
  denied: `Object.defineProperty(navigator, "userActivation", { value: { isActive: false, hasBeenActive: true }, configurable: true }); window.__cam = { calls: [] }; navigator.mediaDevices.getUserMedia = c => { window.__cam.calls.push(c); const e = new DOMException("Permission denied", "NotAllowedError"); return Promise.reject(e); };`,
  nofront: `window.__cam = { calls: [] }; const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = c => { window.__cam.calls.push(c); if (c.video && c.video.facingMode) return Promise.reject(new DOMException("no front camera", "OverconstrainedError")); return real(c); };`,
  hang: `window.__cam = { calls: [] }; navigator.mediaDevices.getUserMedia = c => { window.__cam.calls.push(c); return new Promise(() => {}); };`,
  noapi: `Object.defineProperty(navigator, "userActivation", { value: { isActive: false, hasBeenActive: true }, configurable: true }); window.__cam = { calls: [] }; Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });`,
};
async function open(b, scenario, ua) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, geolocation: { latitude: 23.1601, longitude: 72.6801, accuracy: 30 }, permissions: ["geolocation", "camera"], userAgent: ua || "Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36" });
  const page = await ctx.newPage(); const log = { selects: [], rpc: [], denied: [], writes: [], px: [], camLogs: [] };
  const errs = []; page.on("pageerror", e => errs.push(String(e))); page.on("console", m => { if (m.type() === "error" && !/WebSocket|realtime|ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await base.install(page, "supervisor", log);
  await page.addInitScript(w => { localStorage.setItem("psk_worker", JSON.stringify(w)); const p = JSON.parse(localStorage.getItem("psk_session") || "{}"); p.mobile = w.mobile; p.currentSite = 2; localStorage.setItem("psk_session", JSON.stringify(p)); }, WORKER);
  await page.addInitScript(SCENARIOS[scenario]);
  await page.route("http://mock.supabase.test/rest/v1/rpc/**", async route => {   // registered after the base → wins
    const fn = route.request().url().split("/").pop().split("?")[0]; const json = b => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (fn === "fn_camera_log") { log.camLogs.push(route.request().postDataJSON().p); return json(null); }
    if (fn === "fn_worker_site_geo") return json([{ site_id: 2, site_name: WORKER.site_name, geofence_lat: 23.16, geofence_lng: 72.68, geofence_radius_m: 200 }]);
    if (fn === "fn_worker_today") return json({ punch_in: null, punch_out: null, status: null });
    return route.fallback();
  });
  return { ctx, page, log, errs };
}

(async () => {
  const b = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  async function tapPunch(page) { await page.goto(`http://localhost:${PORT}/m`, { waitUntil: "networkidle" }); await page.waitForSelector("text=Punch in", { timeout: 20000 }); await page.waitForTimeout(800); await page.click("text=Punch in"); }

  console.log("1. Normal phone: tap → 'Starting camera…' → live preview → Capture enabled; attempt logged as started");
  { const { ctx, page, log, errs } = await open(b, "ok");
    await tapPunch(page);
    await page.waitForSelector("[data-cam-state]"); const first = await page.getAttribute("[data-cam-state]", "data-cam-state");
    ok(first === "starting" || first === "live", "overlay opens with a state (" + first + "), never blank");
    await page.waitForSelector("[data-cam-state='live']", { timeout: 8000 }); await page.waitForSelector("button:has-text('Capture'):not([disabled])", { timeout: 8000 }); await page.waitForFunction(() => (document.querySelector("video")?.videoWidth || 0) > 0, null, { timeout: 8000 });
    const vid = await page.evaluate(() => { const v = document.querySelector("video"); return { w: v.videoWidth, playing: !v.paused, auto: v.autoplay, inline: v.playsInline, muted: v.muted }; });
    ok(vid.w > 0 && vid.playing && vid.auto && vid.inline && vid.muted, `live video ${vid.w}px, autoplay playsinline muted`);
    ok(await page.isEnabled("button:has-text('Capture')"), "Capture enabled once the stream is live");
    await page.screenshot({ path: `${OUT}/cam-live.png` });
    ok((await page.evaluate(() => window.__cam.calls.length)) === 1 && (await page.evaluate(() => JSON.stringify(window.__cam.calls[0].video.facingMode))) === '{"ideal":"user"}', "getUserMedia called once from the tap, facingMode ideal user");
    await page.waitForTimeout(600);
    const L = log.camLogs; ok(L.length === 1 && L[0].result === "started" && L[0].kind === "punch" && L[0].worker_id === 501 && L[0].chrome_version === "118" && L[0].device_model === "SM-A135F" && L[0].permission_state && L[0].secure_context === true && L[0].media_devices === true && typeof L[0].start_ms === "number", "diagnostic row: started, kind, worker, Chrome 118, SM-A135F, permission, secure, API present, start_ms (" + JSON.stringify(L[0]).slice(0, 200) + ")");
    await page.click("button:has-text('Cancel')"); ok((await page.locator("[data-cam-state]").count()) === 0, "Cancel closes the overlay and stops the stream");
    ok(errs.length === 0, "no page errors"); await ctx.close(); }

  console.log("2. Permission denied: clear steps + Try again; re-check when the app regains focus; logged as NotAllowedError");
  { const { ctx, page, log } = await open(b, "denied");
    await tapPunch(page); await page.waitForSelector("[data-cam-state='error']", { timeout: 8000 });
    const t = await page.textContent("[role=alert]");
    ok(/Camera is blocked for this site/.test(t) && /lock icon/.test(t) && /Permissions → Camera → Allow/.test(t) && /Try again/.test(t) && /NotAllowedError/.test(t), "denied → in-app steps (lock icon → Permissions → Camera → Allow) + Try again");
    await page.screenshot({ path: `${OUT}/cam-denied.png` });
    await page.click("button:has-text('Try again')"); await page.waitForTimeout(800);
    ok((await page.evaluate(() => window.__cam.calls.length)) === 2 && log.camLogs.length === 2 && log.camLogs.every(l => l.result === "error" && l.error_name === "NotAllowedError"), "Try again re-requests the camera; both attempts logged as NotAllowedError");
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); }); await page.waitForTimeout(800);
    ok((await page.evaluate(() => window.__cam.calls.length)) === 3, "regaining focus re-checks the camera by itself");
    await ctx.close(); }

  console.log("3. No front camera: facingMode rejected → retry without facingMode → live (fallback logged)");
  { const { ctx, page, log } = await open(b, "nofront");
    await tapPunch(page); await page.waitForSelector("[data-cam-state='live']", { timeout: 8000 });
    const calls = await page.evaluate(() => window.__cam.calls.map(c => JSON.stringify(c.video)));
    ok(calls.length === 2 && /facingMode/.test(calls[0]) && !/facingMode/.test(calls[1]), "OverconstrainedError → second call without facingMode → preview shown");
    await page.waitForTimeout(500); ok(log.camLogs[0]?.result === "started" && /fallback: no-facing/.test(log.camLogs[0]?.error_message || ""), "logged as started with 'fallback: no-facing'");
    await ctx.close(); }

  console.log("4. Camera never answers: 5 s timeout → error with Try again (never a stuck overlay)");
  { const { ctx, page, log } = await open(b, "hang");
    await tapPunch(page); await page.waitForSelector("[data-cam-state='starting']");
    const t3 = await page.textContent("[data-cam-state]"); ok(/Starting camera/.test(t3), "spinner text while waiting");
    await page.waitForSelector("[data-cam-state='error']", { timeout: 9000 });
    const t = await page.textContent("[role=alert]"); ok(/did not start in 5 seconds/.test(t) && /Try again/.test(t), "timeout after 5 s → clear message + Try again");
    await page.waitForTimeout(400); ok(log.camLogs[0]?.result === "timeout" && log.camLogs[0]?.start_ms >= 4900, `logged as timeout (${log.camLogs[0]?.start_ms} ms)`);
    await page.screenshot({ path: `${OUT}/cam-timeout.png` }); await ctx.close(); }

  console.log("5. In-app browser (WhatsApp) with no camera API: explains 'open in Chrome'; logged with in_app + no API");
  { const { ctx, page, log } = await open(b, "noapi", "Mozilla/5.0 (Linux; Android 12; RMX3261) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/115.0.0.0 Mobile Safari/537.36 WhatsApp");
    await tapPunch(page); await page.waitForSelector("[data-cam-state='error']", { timeout: 8000 });
    const t = await page.textContent("[role=alert]"); ok(/cannot open the camera/.test(t) && /Chrome/.test(t), "no API → update/open in Chrome guidance");
    await page.waitForTimeout(400); ok(log.camLogs[0]?.in_app === "WhatsApp" && log.camLogs[0]?.media_devices === false && log.camLogs[0]?.error_name === "NoCameraApi" && log.camLogs[0]?.device_model === "RMX3261", "logged: in_app WhatsApp, no camera API, RMX3261");
    await ctx.close(); }

  console.log("6. IT diagnostics screen: filters by user and error, shows the pattern");
  { const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } }); const page = await ctx.newPage(); const log = { selects: [], rpc: [], denied: [], writes: [], px: [] };
    await base.install(page, "it", log);
    const ROWS = [{ id: 1, at: new Date().toISOString(), kind: "punch", user_id: 12, worker_id: 501, app_version: "v481", in_app: null, webview: null, chrome_version: "118", os_version: "Android 13", device_model: "SM-A135F", standalone: false, secure_context: true, permission_state: "denied", media_devices: true, facing: "user", result: "error", error_name: "NotAllowedError", error_message: "Permission denied", start_ms: 120 },
      { id: 2, at: new Date().toISOString(), kind: "punch", user_id: 12, worker_id: 501, app_version: "v481", in_app: null, chrome_version: "118", os_version: "Android 13", device_model: "SM-A135F", secure_context: true, permission_state: "denied", media_devices: true, facing: "user", result: "error", error_name: "NotAllowedError", error_message: "Permission denied", start_ms: 90 },
      { id: 3, at: new Date().toISOString(), kind: "punch", user_id: 10, worker_id: 502, app_version: "v481", in_app: "WhatsApp", chrome_version: "115", os_version: "Android 12", device_model: "RMX3261", secure_context: true, permission_state: "unsupported", media_devices: false, facing: "user", result: "error", error_name: "NoCameraApi", error_message: "no api", start_ms: 5 },
      { id: 4, at: new Date().toISOString(), kind: "punch", user_id: 7, worker_id: 503, app_version: "v481", chrome_version: "130", os_version: "Android 14", device_model: "Pixel 7", secure_context: true, permission_state: "granted", media_devices: true, facing: "user", result: "started", error_name: null, error_message: null, start_ms: 640 }];
    await page.route("http://mock.supabase.test/rest/v1/punch_camera_log**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROWS) }));
    await page.goto(`http://localhost:${PORT}/it/camera-log`, { waitUntil: "networkidle" }); await page.waitForSelector("table");
    const body = await page.textContent("main");
    ok(/Error:.*NotAllowedError \(2\).*NoCameraApi \(1\)/.test(body) && /In-app browser:.*WhatsApp \(1\)/.test(body) && /Phone:.*SM-A135F \(2\)/.test(body), "pattern block: errors, in-app browser, phone brand counts");
    ok((await page.locator("[data-log] tbody tr").count()) === 4, "4 attempts listed");
    await page.selectOption("select >> nth=3", "NotAllowedError"); await page.waitForTimeout(300); ok((await page.locator("[data-log] tbody tr").count()) === 2, "filter by error → 2 rows");
    await page.selectOption("select >> nth=3", ""); await page.selectOption("select >> nth=1", "10"); await page.waitForTimeout(300); ok((await page.locator("[data-log] tbody tr").count()) === 1 && /WhatsApp/.test(await page.textContent("[data-log] tbody")), "filter by user → the WhatsApp in-app row");
    await page.screenshot({ path: `${OUT}/it-camera-log.png`, fullPage: true });
    const { ctx: c2, page: p2 } = { ctx: await b.newContext(), page: null }; const pg = await c2.newPage(); const l2 = { selects: [], rpc: [], denied: [], writes: [], px: [] }; await base.install(pg, "storekeeper", l2); await pg.goto(`http://localhost:${PORT}/it/camera-log`, { waitUntil: "networkidle" }); ok(/IT \/ Director only/.test(await pg.textContent("main")), "storekeeper cannot open the diagnostics screen"); await c2.close();
    await ctx.close(); }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
