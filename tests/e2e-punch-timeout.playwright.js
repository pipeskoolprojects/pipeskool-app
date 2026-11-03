// update488 e2e: punch selfie when the camera request hangs (permission question never answered / never shown).
const { chromium } = require("playwright");
const fs = require("fs"); const OUT = "/tmp/claude-0/cam488"; fs.mkdirSync(OUT, { recursive: true });
const APP = "http://localhost:" + (process.argv[2] || 3488);
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const WORKER = { id: 501, full_name: "Abinash Shastri", mobile: "9000000012", category: "site engineer", site_id: 2, site_name: "SAPTARSHI SCHOOL", geofence_lat: 23.16, geofence_lng: 72.68, geofence_radius_m: 200, is_active: true };
// getUserMedia variants. perm = what navigator.permissions.query({name:"camera"}) answers.
const GUM = {
  hang: `navigator.mediaDevices.getUserMedia = c => { window.__gum = (window.__gum||0)+1; return new Promise(() => {}); };`,
  // resolves after 7 s with a real fake-device stream; we spy on track.stop()
  late: `const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); window.__stopped = 0; window.__gum = 0;
    navigator.mediaDevices.getUserMedia = c => { window.__gum++; return new Promise(r => setTimeout(() => real(c).then(s => { s.getTracks().forEach(t => { const st = t.stop.bind(t); t.stop = () => { window.__stopped++; st(); }; }); r(s); }), window.__gum === 1 ? 7000 : 300)); };`,
  // permission question answered after 9 s (Allow) → stream
  allow9: `const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = c => new Promise(r => setTimeout(() => r(real(c)), 9000));`,
  ok: ``,
};
const PERM = p => `if (navigator.permissions) { const q = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = d => d && d.name === "camera" ? Promise.resolve({ state: "${p}" }) : q(d); }`;
async function open(b, gum, perm) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, geolocation: { latitude: 23.1601, longitude: 72.6801, accuracy: 13 }, permissions: ["geolocation", "camera"],
    userAgent: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36" });
  const page = await ctx.newPage(); const log = { cam: [], punches: [], puts: [] }; const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.addInitScript(w => { localStorage.setItem("psk_worker", JSON.stringify(w)); }, WORKER);
  await page.addInitScript(PERM(perm) + GUM[gum] + `const clk = HTMLInputElement.prototype.click; window.__clicks = []; HTMLInputElement.prototype.click = function () { if (this.type === "file") window.__clicks.push({ active: navigator.userActivation ? navigator.userActivation.isActive : null, capture: this.getAttribute("capture") }); return clk.call(this); };`);
  let today = { punch_in: null, punch_out: null, status: null };
  await page.route("http://mock.supabase.test/**", async route => {
    const u = route.request().url(); const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
    if (route.request().method() === "OPTIONS") return json({});
    if (/\/rpc\//.test(u)) { const fn = u.split("/").pop().split("?")[0];
      if (fn === "fn_camera_log") { log.cam.push(route.request().postDataJSON().p); return json(null); }
      if (fn === "fn_worker_site_geo") return json([{ site_id: 2, site_name: WORKER.site_name, geofence_lat: 23.16, geofence_lng: 72.68, geofence_radius_m: 200 }]);
      if (fn === "fn_worker_today") return json(today);
      if (fn === "fn_worker_punch") { log.punches.push(route.request().postDataJSON()); today = { ...today, punch_in: new Date().toISOString() }; return json({ ok: true, data: today }); }
      return json(null); }
    if (/\/auth\//.test(u)) return json({});
    return json([]);
  });
  await page.route("**/api/files/upload", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "http://r2.test/put/" + JSON.parse(r.request().postData()).key }) }));
  await page.route("http://r2.test/**", r => { log.puts.push({ url: r.request().url(), size: (r.request().postDataBuffer() || []).length }); return r.fulfill({ status: 200, body: "" }); });
  await page.goto(APP + "/m", { waitUntil: "domcontentloaded" });
  return { ctx, page, log, errs };
}
const punchBtn = page => page.locator("button", { hasText: /Punch In|Punch in/i }).first();
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

(async () => {
  const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

  console.log("1. Abhinash's case: camera request never answers, permission still 'prompt' (Chrome 136, Android 10)");
  { const { ctx, page, log, errs } = await open(b, "hang", "prompt");
    await punchBtn(page).waitFor({ timeout: 20000 }); await page.waitForFunction(() => !document.querySelector("button[disabled]") || true);
    await page.waitForTimeout(1500);
    const t0 = Date.now(); await punchBtn(page).click();
    await page.waitForSelector("[data-cam-state=starting]");
    await page.waitForSelector("[data-phone-camera-early]", { timeout: 5000 }); const early = Date.now() - t0;
    ok(early < 4500, `'Use phone camera instead' button appears while starting (${early} ms after tap)`);
    await page.waitForTimeout(Math.max(0, 6500 - (Date.now() - t0)));
    ok((await page.getAttribute("[data-cam-state]", "data-cam-state")) === "starting", "at 6.5 s it is still waiting (no 5-second error while the phone is asking)");
    await page.screenshot({ path: OUT + "/1-waiting.png" });
    await page.waitForSelector("[data-cam-state=error]", { timeout: 15000 }); const tErr = Date.now() - t0;
    ok(tErr > 14000 && tErr < 17500, `gives up only after ~15 s (${tErr} ms)`);
    const card = await page.textContent("[role=alert]");
    ok(/did not let the app use the camera/.test(card) && /Site settings/.test(card), "card explains the permission problem and how to fix it");
    ok(await page.locator("[data-phone-camera]").isVisible(), "card has 'Open phone camera' button");
    await page.screenshot({ path: OUT + "/2-card.png" });
    const chooser = page.waitForEvent("filechooser", { timeout: 5000 });
    await page.click("[data-phone-camera]");
    const fc = await chooser; const clicks = await page.evaluate(() => window.__clicks);
    ok(clicks.length === 1 && clicks[0].active !== false && clicks[0].capture === "user", "tap opens the phone's camera app (front camera, inside the tap) " + JSON.stringify(clicks));
    ok((await page.locator("[data-cam-state]").count()) === 0, "selfie overlay closed");
    await fc.setFiles({ name: "IMG_1.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await page.waitForTimeout(2500);
    ok(log.punches.length === 1, "punch went through with the camera-app photo (" + log.punches.length + " punch call)");
    ok(log.puts.length === 1 && log.puts[0].size === JPEG.length, "photo uploaded unchanged (" + (log.puts[0] && log.puts[0].size) + " bytes)");
    const kinds = log.cam.map(r => r.result + (r.permission_state ? ":" + r.permission_state : ""));
    ok(kinds.includes("timeout:prompt") && kinds.includes("fallback_opened") && kinds.includes("punch_confirmed"), "IT log: " + kinds.join(", "));
    ok(errs.length === 0, "no page errors " + errs.join(" | ").slice(0, 200));
    await page.screenshot({ path: OUT + "/3-punched.png" }); await ctx.close(); }

  console.log("2. Early button: tap 'Use phone camera instead' while it is still starting");
  { const { ctx, page, log } = await open(b, "hang", "prompt");
    await punchBtn(page).waitFor({ timeout: 20000 }); await page.waitForTimeout(1500); await punchBtn(page).click();
    await page.waitForSelector("[data-phone-camera-early]", { timeout: 5000 });
    const chooser = page.waitForEvent("filechooser", { timeout: 5000 }); await page.click("[data-phone-camera-early]");
    const fc = await chooser; await fc.setFiles({ name: "IMG_2.jpg", mimeType: "image/jpeg", buffer: JPEG }); await page.waitForTimeout(2500);
    ok(log.punches.length === 1, "punch done without waiting for the timeout"); await ctx.close(); }

  console.log("3. Permission granted but camera slow (stream arrives at 7 s, after the 5 s limit)");
  { const { ctx, page } = await open(b, "late", "granted");
    await punchBtn(page).waitFor({ timeout: 20000 }); await page.waitForTimeout(1500); const t0 = Date.now(); await punchBtn(page).click();
    await page.waitForSelector("[data-cam-state=error]", { timeout: 9000 }); const t = Date.now() - t0;
    ok(t > 4500 && t < 6500, `granted + slow → error at 5 s as before (${t} ms)`);
    ok(/did not start in 5 seconds/.test(await page.textContent("[role=alert]")) && await page.locator("[data-phone-camera]").isVisible(), "card offers Open phone camera + Try again");
    await page.waitForTimeout(3500);
    ok((await page.evaluate(() => window.__stopped)) >= 1, "the late stream is switched off at once (camera not left busy for Try again)");
    await page.click("button:has-text(\"Try again\")"); await page.waitForSelector("[data-cam-state=live]", { timeout: 12000 });
    ok(true, "Try again → live camera starts"); await ctx.close(); }

  console.log("4. Phone asks and the worker taps Allow after 9 s → live camera (no error in between)");
  { const { ctx, page } = await open(b, "allow9", "prompt");
    await punchBtn(page).waitFor({ timeout: 20000 }); await page.waitForTimeout(1500); await punchBtn(page).click();
    const states = []; for (let i = 0; i < 24; i++) { states.push(await page.getAttribute("[data-cam-state]", "data-cam-state").catch(() => "none")); if (states[states.length - 1] === "live") break; await page.waitForTimeout(500); }
    ok(states[states.length - 1] === "live" && !states.includes("error"), "starting → live, never the error card: " + [...new Set(states)].join(" → "));
    await page.waitForTimeout(800); await page.click("button:has-text(\"Capture\")"); await page.waitForTimeout(2000);
    await ctx.close(); }

  console.log("5. Normal phone (permission granted, camera fine): unchanged");
  { const { ctx, page, log } = await open(b, "ok", "granted");
    await punchBtn(page).waitFor({ timeout: 20000 }); await page.waitForTimeout(1500); await punchBtn(page).click();
    await page.waitForSelector("[data-cam-state=live]", { timeout: 6000 });
    ok((await page.locator("[data-phone-camera-early]").count()) === 0, "no extra button when the camera opens quickly");
    await page.waitForTimeout(800); await page.click("button:has-text(\"Capture\")"); await page.waitForTimeout(2500);
    ok(log.punches.length === 1, "live selfie → punch"); await ctx.close(); }

  await b.close(); console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
