// Other roles must look identical before (3476) and after (3475): pixel-diff the same pages.
const { chromium } = require("playwright"); const { install } = require("./mock471"); const { PNG } = require("pngjs"); const fs = require("fs");
const PAGES = ["/home", "/stock", "/procure", "/wages", "/m/dashboard"];
(async () => { const b = await chromium.launch(); fs.mkdirSync("/home/claude/work/it475/audit/roles", { recursive: true });
  for (const who of ["director", "supervisor", "hoadmin"]) for (const w of [1366, 390]) for (const path of PAGES) {
    const shots = [];
    for (const port of [3476, 3475]) { const ctx = await b.newContext({ viewport: { width: w, height: 860 }, isMobile: w < 760, hasTouch: w < 760 }); const page = await ctx.newPage();
      await install(page, who, { selects: [], denied: [], rpc: [], px: [], writes: [] }); await page.addInitScript(() => { const d = Date; /* freeze clock text */ });
      await page.goto("http://localhost:" + port + path, { waitUntil: "networkidle", timeout: 40000 }).catch(() => {}); await page.waitForTimeout(1500);
      await page.addStyleTag({ content: "*{animation:none!important;transition:none!important;caret-color:transparent}" }).catch(() => {});
      shots.push(PNG.sync.read(await page.screenshot())); await ctx.close(); }
    const [a, c] = shots; let diff = 0; if (a.width === c.width && a.height === c.height) { for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - c.data[i]) + Math.abs(a.data[i + 1] - c.data[i + 1]) + Math.abs(a.data[i + 2] - c.data[i + 2]) > 30) diff++; } else diff = -1;
    const pct = diff < 0 ? "size differs" : (100 * diff / (a.width * a.height)).toFixed(3) + "%";
    console.log(`${who} ${w} ${path}: ${pct} pixels differ`);
    if (diff > a.width * a.height * 0.002) { fs.writeFileSync(`/home/claude/work/it475/audit/roles/${who}-${w}${path.replace(/\//g, "_")}-before.png`, PNG.sync.write(a)); fs.writeFileSync(`/home/claude/work/it475/audit/roles/${who}-${w}${path.replace(/\//g, "_")}-after.png`, PNG.sync.write(c)); }
  }
  await b.close(); })();
