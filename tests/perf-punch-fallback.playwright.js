// update483: tap → camera-app timing under 4x / 6x CPU throttle (stand-in for a mid-range Android; not a real device)
const { chromium } = require("playwright"); const base = require(process.env.MOCK471 || "./mock471.js");
const WORKER = { id: 501, full_name: "A", mobile: "9000000012", site_id: 2, site_name: "S", geofence_lat: 23.16, geofence_lng: 72.68, geofence_radius_m: 200, is_active: true };
(async () => { const b = await chromium.launch();
  for (const rate of [1, 4, 6]) { const res = [];
    for (let i = 0; i < 5; i++) {
      const ctx = await b.newContext({ geolocation: { latitude: 23.1601, longitude: 72.6801, accuracy: 30 }, permissions: ["geolocation"], hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });
      const page = await ctx.newPage(); await base.install(page, "supervisor", { selects: [], rpc: [], denied: [], writes: [], px: [] });
      await page.addInitScript(w => { localStorage.setItem("psk_worker", JSON.stringify(w)); }, WORKER);
      await page.addInitScript(`navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("x","NotAllowedError")); const c = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function(){ window.__clickAt = performance.now(); return c.call(this); }; document.addEventListener("pointerdown", () => { window.__tapAt = performance.now(); }, true); document.addEventListener("touchstart", () => { window.__tapAt = performance.now(); }, true);`);
      await page.route("http://mock.supabase.test/rest/v1/rpc/**", r => { const fn = r.request().url().split("/").pop(); if (fn === "fn_worker_site_geo") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ site_id: 2, site_name: "S", geofence_lat: 23.16, geofence_lng: 72.68, geofence_radius_m: 200 }]) }); if (fn === "fn_worker_today") return r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); if (fn === "fn_camera_log") return r.fulfill({ status: 200, body: "null" }); return r.fallback(); });
      await page.goto("http://localhost:3475/m", { waitUntil: "networkidle" }); await page.waitForSelector("button.punch-btn:not([disabled])", { timeout: 20000 }); await page.waitForTimeout(500);
      const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      const fc = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null); await page.tap("button.punch-btn"); const ok = !!(await fc);
      const d = await page.evaluate(() => window.__clickAt - window.__tapAt); res.push(ok ? d : NaN); await ctx.close(); }
    console.log(`CPU ${rate}x: tap → camera app requested (ms): ${res.map(x => x.toFixed(1)).join(", ")}  avg ${(res.reduce((a, c) => a + c, 0) / res.length).toFixed(1)}`); }
  await b.close(); })();
