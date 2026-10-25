// Screenshot every IT page at the required widths, dark + light. Usage: node shots.js <outdir> [port]
const { chromium } = require("playwright"); const { install } = require("./mock471"); const fs = require("fs");
const OUT = process.argv[2] || "/home/claude/work/it475/audit/before"; const BASE = "http://localhost:" + (process.argv[3] || 3475);
const PAGES = [["home","/dashboard"],["wages","/wages"],["workers","/workers"],["challans","/stock/challans"],["pending","/procure/pending"],["stock","/stock"],["procure","/procure"],["order","/order"],["expenses","/expenses"],["billing","/billing"],["vendors","/vendors"],["assets","/assets"],["repairs","/repairs"],["letters","/letters"],["notices","/notices"]];
const WIDTHS = [1440, 1024, 820, 412, 360];
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); const b = await chromium.launch(); const report = [];
  for (const theme of ["dark", "light"]) for (const w of WIDTHS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 760, hasTouch: w < 760, deviceScaleFactor: 1 });
    for (const [name, path] of PAGES) {
      const page = await ctx.newPage(); const errs = [];
      page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
      await install(page, "it", { selects: [], denied: [], rpc: [], px: [], writes: [] });
      await page.addInitScript(t => { try { localStorage.setItem("pk-theme", t); } catch {} }, theme);
      try { await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 }); } catch {}
      await page.waitForTimeout(1200);
      const m = await page.evaluate(() => {
        const de = document.documentElement; const over = de.scrollWidth - window.innerWidth;
        // elements wider than the viewport (horizontal overflow culprits)
        const wide = [...document.querySelectorAll("body *")].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed"; }).slice(0, 6).map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""));
        const it = de.classList.contains("it-executive-ui"); const bf = [...document.querySelectorAll("*")].filter(el => { const s = getComputedStyle(el); return (s.backdropFilter && s.backdropFilter !== "none") || (s.webkitBackdropFilter && s.webkitBackdropFilter !== "none"); }).length;
        return { over, wide, it, backdrops: bf, theme: de.dataset.itTheme, layout: de.dataset.itLayout };
      });
      await page.screenshot({ path: `${OUT}/${name}-${w}-${theme}.png`, fullPage: false });
      report.push({ name, w, theme, ...m, errs: errs.slice(0, 3) }); await page.close();
    }
    await ctx.close();
  }
  await b.close(); fs.writeFileSync(OUT + "/report.json", JSON.stringify(report, null, 1));
  report.forEach(r => console.log(`${r.name}@${r.w} ${r.theme}: it=${r.it} layout=${r.layout} overflow=${r.over} backdrops=${r.backdrops}${r.wide.length ? " wide=" + r.wide.join(",") : ""}${r.errs.length ? " ERR=" + r.errs.join(" | ") : ""}`));
})();
