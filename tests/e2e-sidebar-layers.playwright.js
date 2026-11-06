// update489 e2e: expanded / full-screen layers never sit under the sidebar.
const { chromium } = require("playwright");
const fs = require("fs"); const OUT = "/tmp/claude-0/s489"; fs.mkdirSync(OUT, { recursive: true });
const NEW = "http://localhost:3489", OLD = "http://localhost:3490";
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const MODS = ["attendance","dpr","money","wages","stock","indent","assets","rentals","workers","notices","leave","billing","letters","dashboard","boq_material"];
const perms = Object.fromEntries(MODS.map(m => [m, ["view","create","approve","verify","manage"]]));
const sess = role => ({ id: 7, name: role === "director" ? "Keyal Shah" : "Satyam Chaurasiya", role, mobile: "9000000001", sites: [{ id: 1, name: "KEI Industries, Sanand" }, { id: 2, name: "SOUL Campus, GIFT City" }], permsBySite: { 1: perms, 2: perms }, currentSite: 2 });
// Windows scaling and browser zoom = a smaller CSS viewport at a higher device pixel ratio
const SIZES = [["1366x768", 1366, 768, 1], ["1536x864", 1536, 864, 1], ["1920x1080", 1920, 1080, 1], ["1536@125%", 1229, 691, 1.25], ["1920@150%", 1280, 720, 1.5],
  ["1366 zoom 90%", 1518, 853, 0.9], ["1366 zoom 110%", 1242, 698, 1.1], ["1366 zoom 125%", 1093, 614, 1.25]];
async function open(b, app, { w, h, dpr = 1, role = "it_executive", hidden = false, path = "/expenses" }) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  await page.addInitScript(([s, hid]) => { localStorage.setItem("psk_session", JSON.stringify(s)); localStorage.setItem("psk_sidebar_hidden_v2", hid ? "1" : "0"); }, [sess(role), hidden]);
  await page.goto(app + path, { waitUntil: "networkidle" }); await page.waitForTimeout(800);
  return { ctx, page, errs };
}
const tab = (page, txt) => page.evaluate(t => [...document.querySelectorAll(".it-money-tabs button")].find(b => b.textContent.includes(t)).click(), txt);
async function toLedger(page) { await tab(page, "Expenses ledger"); await page.waitForTimeout(700); }
const geo = page => page.evaluate(() => {
  const r = el => el ? el.getBoundingClientRect() : null;
  const aside = document.querySelector("aside.sidebar"); const ar = aside && getComputedStyle(aside).display !== "none" ? r(aside) : null;
  const layer = [...document.querySelectorAll("div")].find(d => getComputedStyle(d).position === "fixed" && d.querySelector(".it-money-tabs"));
  const sec = [...document.querySelectorAll(".money-sec")].find(s => s.offsetParent && s.querySelector("table"));
  const ths = sec ? [...sec.querySelectorAll("thead th")] : [];
  const th = lbl => ths.find(t => t.textContent.trim().startsWith(lbl));
  const tabs = [...document.querySelectorAll(".it-money-tabs button")]; const close = tabs.find(b => /Close|Expand/.test(b.textContent));
  const firstTab = tabs[0];
  // is a point covered by the sidebar? (sidebar is the top element there)
  const covered = el => { if (!el) return null; const q = el.getBoundingClientRect(); const x = Math.max(q.left + 3, 1), y = q.top + q.height / 2; const top = document.elementFromPoint(x, y); return !!(top && top.closest("aside.sidebar")); };
  return { sb: ar ? Math.round(ar.right) : 0, sbw: getComputedStyle(document.documentElement).getPropertyValue("--sb-w").trim(),
    layerLeft: layer ? Math.round(r(layer).left) : null, rows: sec ? sec.querySelectorAll("tbody tr").length : 0,
    chk: ths[0] ? Math.round(r(ths[0]).left) : null, date: th("Date") ? Math.round(r(th("Date")).left) : null, claimant: th("Claimant") ? Math.round(r(th("Claimant")).left) : null,
    coveredDate: covered(th("Date")), coveredClaimant: covered(th("Claimant")), coveredChk: covered(ths[0]), coveredTab: covered(firstTab),
    firstTab: firstTab ? Math.round(r(firstTab).left) : null, closeRight: close ? Math.round(r(close).right) : null, closeText: close ? close.textContent.trim() : "",
    hScroll: document.scrollingElement.scrollWidth - innerWidth, vw: innerWidth };
});

const MOCK = "http://localhost:3491";
const NAMES = ["Mukesh Prajapati", "Nisarg Patel", "SAPARA RAJUBHAI BHIMJIBHAI", "Abhinash Shastri", "KISHAN MEVADA", "Satyendra Yadav"];
const ROWS = Array.from({ length: 40 }, (_, i) => ({ id: 1000 + i, claimant_user_id: 10 + (i % 6), site_id: 2, expense_date: "2026-11-0" + (1 + (i % 5)), category: "transport", amount: 100 + i * 7,
  paid_to: "Porter balance add " + i, note: "Transport / tempo", funding_source: "petty", status: i % 3 ? "approved" : "pending", posted_to_tally: false, sites: { name: "SAPTARSHI SCHOOL" }, claimant: { full_name: NAMES[i % 6] }, reviewer: { full_name: "Keyal Shah" }, reviewed_at: "2026-11-05", expense_bills: [] }));
async function openMock(b, { w, h, dpr = 1, role = "it_executive" }) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  await page.addInitScript(s => { localStorage.setItem("psk_session", JSON.stringify(s)); localStorage.setItem("psk_sidebar_hidden_v2", "0");
    localStorage.setItem("sb-mock-auth-token", JSON.stringify({ access_token: "test", refresh_token: "test", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: "u1", aud: "authenticated" } })); }, sess(role));
  await page.route("http://mock.supabase.test/**", route => { const u = route.request().url(); const j = (x, st = 200) => route.fulfill({ status: st, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(x) });
    if (route.request().method() === "OPTIONS") return j({});
    if (u.includes("/rpc/fn_expense_ledger_page")) return j({ rows: ROWS.slice(0, 25), total: ROWS.length });
    if (u.includes("/rpc/")) return j(null);
    if (u.includes("/auth/")) return j({ error: "no session" }, 400);
    const one = /vnd\.pgrst\.object/.test(route.request().headers()["accept"] || "");
    if (u.includes("/rest/v1/app_users")) { const me = { id: 7, full_name: "Satyam Chaurasiya", mobile: "9000000001", role, requires_punch: true, is_active: true, site_id: 2 }; return j(one ? me : [me]); }
    if (u.includes("/rest/v1/user_sites")) return j([{ site_id: 1, sites: { name: "KEI Industries, Sanand" } }, { site_id: 2, sites: { name: "SOUL Campus, GIFT City" } }]);
    if (u.includes("/rest/v1/sites")) return j(one ? { id: 2, name: "SOUL Campus, GIFT City" } : [{ id: 1, name: "KEI Industries, Sanand" }, { id: 2, name: "SOUL Campus, GIFT City" }]);
    if (u.includes("/rest/v1/permissions")) return j([1, 2].flatMap(site_id => MODS.flatMap(module => ["view", "create", "approve", "verify", "manage"].map(action => ({ site_id, module, action })))));
    if (one) return j(null);
    return j([]); });
  await page.goto(MOCK + "/expenses", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(3000);
  return { ctx, page, errs };
}
(async () => {
  const b = await chromium.launch();
  console.log("1. Money & expenses → Expenses ledger → Expand, sidebar open (IT executive layout, as in the video)");
  for (const [name, w, h, dpr] of SIZES) {
    for (const app of [OLD, NEW]) {
      const { ctx, page, errs } = await open(b, app, { w, h, dpr }); await toLedger(page);
      const n0 = await geo(page);
      await tab(page, "Expand"); await page.waitForTimeout(500);
      const g = await geo(page);
      const tag = name.replace(/[^a-z0-9]+/gi, "_");
      if (app === OLD) { console.log(`     before ${name}: layer starts at ${g.layerLeft}px, sidebar ends at ${g.sb}px → Date covered: ${g.coveredDate}, Claimant covered: ${g.coveredClaimant}, first tab covered: ${g.coveredTab}`);
        if (["1366x768", "1920x1080", "1536@125%"].includes(name)) await page.screenshot({ path: `${OUT}/before-expand-${tag}.png` }); await ctx.close(); continue; }
      ok(g.layerLeft === g.sb && !g.coveredDate && !g.coveredClaimant && !g.coveredChk && !g.coveredTab && g.chk >= g.sb && g.firstTab >= g.sb && g.closeRight <= g.vw && g.closeText.includes("Close") && g.hScroll <= 0 && g.rows > 0,
        `${name}: layer starts at ${g.layerLeft} = sidebar edge ${g.sb}; checkbox/Date/Claimant at ${g.chk}/${g.date}/${g.claimant}, first tab ${g.firstTab} — none covered; Close inside (${g.closeRight}/${g.vw}); no page side-scroll; ${g.rows} rows`);
      ok(!n0.coveredDate && n0.hScroll <= 0, `${name}: normal view unchanged (Date at ${n0.date}, not covered)`);
      if (["1366x768", "1920x1080", "1536@125%"].includes(name)) await page.screenshot({ path: `${OUT}/after-expand-${tag}.png` });
      // Close works
      await page.locator(".it-money-tabs button", { hasText: "Close" }).click({ timeout: 5000 }); await page.waitForTimeout(300);
      const c = await geo(page); ok(c.layerLeft === null && c.closeText.includes("Expand"), `${name}: Close returns to the normal view`);
      ok(errs.length === 0, `${name}: no page errors ${errs.join("|")}`);
      await ctx.close();
    }
  }
  console.log("2. Expanded: hide the sidebar, then open it again (animation, ☰ button)");
  { const { ctx, page } = await open(b, NEW, { w: 1366, h: 768 }); await toLedger(page);
    await tab(page, "Expand"); await page.waitForTimeout(400);
    await page.click(".sidebar-hide"); await page.waitForTimeout(400);
    const hid = await geo(page);
    const show = await page.evaluate(() => { const s = document.querySelector(".sidebar-show").getBoundingClientRect(); const t = document.querySelector(".it-money-tabs button").getBoundingClientRect(); return { showRight: Math.round(s.right), tabLeft: Math.round(t.left) }; });
    ok(hid.layerLeft === 0 && hid.sbw === "0px" && show.tabLeft >= show.showRight, `sidebar hidden → layer uses the full width (left ${hid.layerLeft}); ☰ (${show.showRight}) does not cover the first tab (${show.tabLeft})`);
    await page.screenshot({ path: `${OUT}/after-expand-sidebar-hidden.png` });
    await page.click(".sidebar-show");
    const frames = []; for (let i = 0; i < 8; i++) { frames.push(await page.evaluate(() => { const a = document.querySelector("aside.sidebar"); const l = [...document.querySelectorAll("div")].find(d => getComputedStyle(d).position === "fixed" && d.querySelector(".it-money-tabs"));
      return { side: a ? Math.round(a.getBoundingClientRect().right) : 0, layer: l ? Math.round(l.getBoundingClientRect().left) : null }; })); await page.waitForTimeout(40); }
    const moving = new Set(frames.map(f => f.layer)).size > 2;
    const overlapMax = Math.max(...frames.map(f => f.side - f.layer));
    ok(moving, "re-opening slides the layer across smoothly: " + frames.map(f => f.layer).join("→"));
    ok(overlapMax <= 12, `during the slide the sidebar edge never runs more than a few px over the layer (max ${overlapMax}px)`);
    await page.waitForTimeout(400); const g = await geo(page); ok(g.layerLeft === g.sb && !g.coveredDate, `after the slide: layer at ${g.layerLeft} = sidebar edge ${g.sb}`);
    await ctx.close(); }
  console.log("3. Sticky first columns: scroll the ledger sideways (expanded, narrow window)");
  { const { ctx, page } = await openMock(b, { w: 1093, h: 614, dpr: 1.25 }); await toLedger(page); await page.waitForTimeout(800);
    await tab(page, "Expand"); await page.waitForTimeout(400);
    const r = await page.evaluate(async () => { const sec = [...document.querySelectorAll(".money-sec")].find(s => s.offsetParent && s.querySelector("table")); const sc = sec.querySelector(".dt-scroll");
      const before = [...sec.querySelectorAll("thead th")].slice(0, 4).map(t => Math.round(t.getBoundingClientRect().left));
      sc.scrollLeft = sc.scrollWidth; await new Promise(r => setTimeout(r, 200));
      const ths = [...sec.querySelectorAll("thead th")]; const after = ths.slice(0, 4).map(t => Math.round(t.getBoundingClientRect().left));
      const td = sec.querySelector("tbody tr").cells; const cellAfter = [0, 1, 2].map(i => Math.round(td[i].getBoundingClientRect().left));
      return { can: sc.scrollWidth > sc.clientWidth, scrolled: sc.scrollLeft, before, after, cellAfter, wrapLeft: Math.round(sc.getBoundingClientRect().left), labels: ths.slice(0, 3).map(t => t.textContent.trim()) }; });
    ok(r.can && r.scrolled > 0, `table scrolls sideways inside its own box (${r.scrolled}px)`);
    ok(r.after[0] === r.before[0] && r.after[1] === r.before[1] && r.after[2] === r.before[2] && r.after[3] < r.before[3], `checkbox / ${r.labels[1]} / ${r.labels[2]} stay put while the rest scrolls (${r.before.slice(0, 3)} → ${r.after.slice(0, 3)}; next column ${r.before[3]} → ${r.after[3]})`);
    ok(r.cellAfter[0] === r.after[0] && r.cellAfter[2] === r.after[2], "row cells stick with their headers");
    await page.screenshot({ path: `${OUT}/after-sticky-columns-scrolled.png` }); await ctx.close(); }
  console.log("4. Director layout (other sidebar style): Expand starts after the sidebar");
  for (const app of [OLD, NEW]) { const { ctx, page } = await open(b, app, { w: 1366, h: 768, role: "director" }); await toLedger(page);
    await tab(page, "Expand"); await page.waitForTimeout(500); const g = await geo(page);
    if (app === OLD) console.log(`     before: layer at ${g.layerLeft}, sidebar ${g.sb} (sidebar ${g.sb && g.layerLeft === 0 ? "hidden under / behind the layer" : "?"})`);
    else ok(g.layerLeft === g.sb && g.sb > 0, `director: layer at ${g.layerLeft} = sidebar edge ${g.sb}, sidebar stays usable`);
    await page.screenshot({ path: `${OUT}/${app === OLD ? "before" : "after"}-director-expand.png` }); await ctx.close(); }
  console.log("5. Pop-ups and the Assistant full screen also start after the sidebar");
  { const { ctx, page } = await openMock(b, { w: 1366, h: 768 }); await toLedger(page); await page.waitForTimeout(800);
    await tab(page, "Expand"); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/after-expand-with-rows-1366.png` });
    const name = page.locator(".money-sec:visible tbody tr a").first();
    if (await name.count()) { await name.click(); await page.waitForTimeout(600);
      const m = await page.evaluate(() => { const d = [...document.querySelectorAll("div")].filter(x => getComputedStyle(x).position === "fixed" && x.getBoundingClientRect().height > innerHeight - 5 && !x.querySelector(".it-money-tabs")).pop(); return d ? Math.round(d.getBoundingClientRect().left) : null; });
      const sb = (await geo(page)).sb; ok(m === sb, `claimant profile pop-up backdrop starts at ${m} = sidebar edge ${sb}`); await page.screenshot({ path: `${OUT}/after-popup-profile.png` }); await page.keyboard.press("Escape"); await page.mouse.click(1300, 40); await page.waitForTimeout(300); }
    else ok(false, "no claimant link to open a pop-up");
    await ctx.close(); }
  { const { ctx, page } = await open(b, NEW, { w: 1366, h: 768 });
    await page.click("[aria-label='Open Pipeskool Assistant']").catch(() => {}); await page.waitForTimeout(500);
    const full = page.locator("button[title=Fullscreen]"); if (await full.count()) { await full.click(); await page.waitForTimeout(400);
      const a = await page.evaluate(() => { const d = [...document.querySelectorAll("div")].find(x => getComputedStyle(x).position === "fixed" && getComputedStyle(x).zIndex === "200"); return d ? Math.round(d.getBoundingClientRect().left) : null; });
      const sb = (await geo(page)).sb; ok(a >= sb, `Assistant full screen starts at ${a} (sidebar edge ${sb})`); await page.screenshot({ path: `${OUT}/after-assistant-full.png` }); }
    else console.log("     (Assistant button not shown in demo mode — skipped)");
    await ctx.close(); }
  console.log("6. Other pages: a full-window layer created the way React does it starts after the sidebar; sidebar open + hidden");
  for (const path of ["/attendance", "/wages", "/procure", "/items", "/assets", "/rentals", "/dpr", "/stock"]) {
    for (const hidden of [false, true]) {
      const { ctx, page, errs } = await open(b, NEW, { w: 1366, h: 768, hidden, path });
      const r = await page.evaluate(() => { const d = document.createElement("div"); d.style.position = "fixed"; d.style.inset = "0"; d.style.zIndex = "90"; d.style.background = "rgba(0,0,0,.3)"; document.body.appendChild(d);
        const a = document.querySelector("aside.sidebar"); const out = { layer: Math.round(d.getBoundingClientRect().left), sb: a && getComputedStyle(a).display !== "none" ? Math.round(a.getBoundingClientRect().right) : 0, hs: document.scrollingElement.scrollWidth - innerWidth }; d.remove(); return out; });
      const other = errs.filter(e => !/React error #(418|423)/.test(e)); ok(r.layer === r.sb && r.hs <= 0 && other.length === 0, `${path} sidebar ${hidden ? "hidden" : "open"}: layer left ${r.layer} = sidebar edge ${r.sb}; no side-scroll${errs.length > other.length ? " (React #418/#423 warning — same on the current version)" : ""}`);
      if (!hidden) await page.screenshot({ path: `${OUT}/after-page${path.replace(/\//g, "-")}.png` });
      await ctx.close();
    }
  }
  console.log("7. Phone width: sidebar not shown, layers full width");
  { const { ctx, page } = await open(b, NEW, { w: 412, h: 915 }); const g = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sb-w").trim()); ok(g === "0px", "--sb-w is 0px on a phone"); await ctx.close(); }
  await b.close(); console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
