// Scroll + paint cost per page, same mock data, before (3476) vs after (3475). CPU throttled 4x to mimic a mid-range phone.
const { chromium } = require("playwright"); const { install } = require("./mock471");
const PAGES = [["home","/dashboard"],["wages","/wages"],["stock","/stock"],["procure","/procure"],["order","/order"],["expenses","/expenses"],["notices","/notices"],["pending","/procure/pending"]];
async function run(port, w, mob) {
  const b = await chromium.launch(); const out = {};
  for (const [name, path] of PAGES) {
    const ctx = await b.newContext({ viewport: { width: w, height: 860 }, isMobile: mob, hasTouch: mob }); const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await install(page, "it", { selects: [], denied: [], rpc: [], px: [], writes: [] });
    const t0 = Date.now(); await page.goto("http://localhost:" + port + path, { waitUntil: "networkidle", timeout: 40000 }).catch(() => {}); const load = Date.now() - t0;
    await page.waitForTimeout(800);
    const r = await page.evaluate(async () => {
      const bf = [...document.querySelectorAll("*")].filter(el => { const s = getComputedStyle(el); return s.backdropFilter !== "none" || (s.webkitBackdropFilter && s.webkitBackdropFilter !== "none"); }).length;
      const anim = document.getAnimations().length;
      const sc = document.querySelector(".main") && getComputedStyle(document.querySelector(".main")).overflowY === "auto" ? document.querySelector(".main") : document.scrollingElement;
      let frames = 0, long = 0, t = performance.now(); const start = t;
      const po = new PerformanceObserver(l => { long += l.getEntries().filter(e => e.duration > 50).length; }); try { po.observe({ type: "longtask", buffered: false }); } catch {}
      await new Promise(res => { let y = 0; const step = () => { y += 40; sc.scrollTop = y; frames++; if (performance.now() - start < 1500) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
      const dur = performance.now() - start; po.disconnect();
      return { bf, anim, fps: Math.round(frames / (dur / 1000)), long };
    });
    out[name] = { load, ...r }; await ctx.close();
  }
  await b.close(); return out;
}
(async () => {
  for (const [w, mob] of [[1440, false], [412, true]]) {
    const before = await run(3476, w, mob), after = await run(3475, w, mob);
    console.log(`\n== ${w}px ${mob ? "phone" : "desktop"} (CPU 4x slower) ==`);
    console.log("page        | load ms before→after | backdrop els | animations | scroll fps | long tasks");
    for (const k of Object.keys(before)) { const a = before[k], c = after[k]; console.log(`${k.padEnd(11)} | ${String(a.load).padStart(5)} → ${String(c.load).padEnd(5)} | ${a.bf} → ${c.bf} | ${a.anim} → ${c.anim} | ${a.fps} → ${c.fps} | ${a.long} → ${c.long}`); }
  }
})();
