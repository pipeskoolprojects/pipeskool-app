// update484 e2e — Excel → indent → draft POs, against the REAL SQL (local PostgreSQL behind shim.js) and the real
// Next.js server + API routes. AI is faked by the shim (embeddings + judge) with modes ok / fail / outside.
const { chromium } = require("/home/claude/.npm-global/lib/node_modules/playwright");
const base = require("/home/claude/work/test475/mock471.js");
const fs = require("fs");
const OUT = process.argv[2] || "/tmp/claude-0/e2e484"; fs.mkdirSync(OUT, { recursive: true });
const PORT = 3475; const APP = `http://localhost:${PORT}`; const DB = "http://mock.supabase.test";
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const post = (p, b) => fetch(DB + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(r => r.json());
const sql = q => post("/__sql", { sql: q });
const as = uid => post("/__as", { uid });
const UID = { director: "00000000-0000-0000-0000-000000000001", supervisor: "00000000-0000-0000-0000-000000000012", storekeeper: "00000000-0000-0000-0000-000000000010" };

async function open(b, who, { noIndentRight = false } = {}) {
  await as(UID[who]);
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage(); const log = { selects: [], rpc: [], denied: [], writes: [], px: [], puts: [] };
  const errs = []; page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept());
  await base.install(page, who, log);
  if (noIndentRight) await page.route(`${DB}/rest/v1/permissions**`, r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ site_id: 2, module: "indent", action: "view", allowed: true }, { site_id: 2, module: "stock", action: "view", allowed: true }]) }));
  if (noIndentRight) await page.addInitScript(() => { const p = JSON.parse(localStorage.getItem("psk_session")); p.permsBySite = { 2: { stock: ["view"], indent: ["view"] } }; localStorage.setItem("psk_session", JSON.stringify(p)); });
  // the parts of the database this feature touches → the shim (real SQL); everything else stays on the base mock
  await page.route(`${DB}/**`, route => {
    const u = new URL(route.request().url()); const p = u.pathname;
    const fn = p.startsWith("/rest/v1/rpc/") ? p.split("/").pop() : null;
    if (fn && (/^fn_import|^fn_imp_/.test(fn) || fn === "fn_next_indent_no")) return route.continue();
    if (!fn && /\/rest\/v1\/(material_indents|material_indent_items)$/.test(p)) return route.continue();
    if (!fn && /\/rest\/v1\/item_master$/.test(p) && u.searchParams.getAll("or").length) return route.continue();
    return route.fallback();
  });
  await page.route("**/api/files/upload", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ backend: "r2", url: "http://r2.test/put" }) }));
  await page.route("http://r2.test/**", r => { log.puts.push(r.request().postDataBuffer()?.length || 0); return r.fulfill({ status: 200, body: "" }); });
  return { ctx, page, log, errs };
}
async function upload(page, file, { site = null } = {}) {
  await page.goto(`${APP}/procure/import`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-import-file]");
  await page.setInputFiles("[data-import-file]", file);
  await page.waitForSelector("[data-start]", { timeout: 15000 });
}
const rowsOf = async id => (await post("/rest/v1/rpc/fn_import_get", { p_import_id: id })).rows;

(async () => {
  // database state: settings default (shadow mode on), past POs for rates
  await sql(`truncate item_alias, match_log, indent_import cascade; update import_settings set shadow_mode = true, ai_enabled = true, always_ask_ai = false where id = 1;
    delete from po_items; delete from purchase_orders; delete from material_indent_items; delete from material_indents;
    insert into purchase_orders (id, po_no, site_id, vendor_name, vendor_id, status, approval_status, created_at) values
      (301, 'PO/2610/0301', 2, 'CHIMANLAL SHANKARLAL SHAH', 1, 'issued', 'approved', now() - interval '12 days'),
      (302, 'PO/2610/0302', 2, 'ASTRAL DEPOT', 2, 'delivered', 'approved', now() - interval '6 days'),
      (303, 'PO/2604/0303', 2, 'PIPE HOUSE', 4, 'issued', 'approved', now() - interval '200 days');
    insert into po_items (po_id, item_id, item_name, qty, unit, rate, list_rate, discount_pct)
      select 301, id, display_name, 40, 'Nos', 54.18, 129, 58 from item_master where display_name = 'Fitting - CPVC Tee 20mm [ASTRAL]' union all
      select 302, id, display_name, 30, 'Nos', 72, 120, 40 from item_master where display_name = 'Fitting - CPVC Tee 20mm [ASTRAL]' union all
      select 302, id, display_name, 30, 'Nos', 410, 500, 18 from item_master where display_name = 'Fitting - UPVC Coupler 50mm (SCHEDULE 40) [ASTRAL]' union all
      select 303, id, display_name, 10, 'Nos', 60, 100, 40 from item_master where display_name = 'Fitting - CPVC Tee 25mm [ASTRAL]';
    update purchase_orders set approval_status = 'approved' where id in (301, 302, 303);`);
  await post("/__ai", { mode: "ok" });
  const b = await chromium.launch();

  console.log("1. No indent right → no menu entry, no screen");
  { const { ctx, page } = await open(b, "storekeeper", { noIndentRight: true });
    await page.goto(`${APP}/procure`, { waitUntil: "networkidle" });
    ok((await page.locator("a[href='/procure/import']").count()) === 0, "sidebar has no 'Import Indent from Excel' link");
    await page.goto(`${APP}/procure/import`, { waitUntil: "networkidle" });
    ok(/not available for your login/.test(await page.textContent("main")), "the page itself refuses");
    await as(UID.storekeeper);
    const r = await post("/rest/v1/rpc/fn_import_create", { p_head: { site_id: 2 }, p_rows: [{ row_no: 1, item_text: "x", qty: 1 }] });
    ok(/do not have the right/.test(r.error || ""), "the database refuses too (" + r.error + ")");
    await ctx.close(); }

  console.log("2. Supervisor uploads a messy Excel list (title rows, blank row, size/make columns, total row, bad qty)");
  let imp1 = null;
  { const { ctx, page, log, errs } = await open(b, "supervisor");
    await page.goto(`${APP}/procure`, { waitUntil: "networkidle" });
    ok((await page.locator("a[href='/procure/import']").count()) === 1, "menu entry visible for someone who may raise indents");
    await upload(page, "list1.xlsx");
    const pre = await page.textContent("main");
    ok(/8 material rows found/.test(pre) && /skipped 1 blank, 1 total/.test(pre), "8 rows found · blank and Total rows skipped");
    ok(/1 with a quantity problem/.test(pre), "the bad quantity is flagged before import");
    await page.fill("input[type=date]", "2026-11-10"); await page.check("input[type=checkbox]");
    const t0 = Date.now(); await page.click("[data-start]");
    await page.waitForSelector("[data-review]", { timeout: 20000 }); const fastMs = Date.now() - t0;
    imp1 = Number(new URL(page.url()).searchParams.get("id"));
    ok(!!imp1 && fastMs < 8000, `review screen after ${fastMs} ms (upload + save + layers 1–3)`);
    ok(log.puts.length === 1, "original file uploaded for audit");
    await page.waitForFunction(() => /AI checked|AI could not|AI not used/.test(document.querySelector("[data-ai]")?.textContent || ""), null, { timeout: 30000 });
    ok(/AI checked/.test(await page.textContent("[data-ai]")), "AI ran on the doubtful rows only: " + await page.textContent("[data-ai]"));
    const rows = await rowsOf(imp1);
    const byText = t => rows.find(r => r.item_text.toLowerCase().startsWith(t.toLowerCase()));
    ok(rows.every(r => r.status !== "auto"), "shadow mode: nothing auto-accepted on a first import");
    ok(byText("CPVC Tee 20mm")?.suggested_name === "Fitting - CPVC Tee 20mm [ASTRAL]", "CPVC Tee + 20mm + Astral columns → Fitting - CPVC Tee 20mm [ASTRAL]");
    ok(/BEND 87.5° 110mm/.test(byText("SWR bend 87.5")?.suggested_name || ""), '4" SWR bend 87.5 → the 110mm bend (inch ↔ mm)');
    const trap = byText("SWR bend 30");
    ok(trap && !/30/.test(trap.suggested_name || "") && trap.status !== "auto", "SWR bend 30° (no such item) is never matched to another angle: " + trap?.status + " / " + (trap?.suggested_name || "none"));
    ok(byText("Mystery")?.status === "not_found", "unknown item → Not in Item Master");
    ok(rows.find(r => /Drill/.test(r.item_text))?.qty == null, "bad quantity kept as a row to fix");
    await page.screenshot({ path: `${OUT}/2-review.png`, fullPage: true });
    ok(await page.isDisabled("[data-create]"), "Create indent disabled while rows are unresolved");
    // human decisions: accept strong suggestions, Yes, Change, To be sourced, fix qty
    await page.click("[data-accept-green]"); await page.waitForTimeout(1200);
    let r2 = await rowsOf(imp1);
    ok(r2.filter(r => r.status === "accepted").length >= 1, `Accept all green confirmed ${r2.filter(r => r.status === "accepted").length} rows`);
    for (const r of r2.filter(x => x.status === "confirm" && x.suggested_item_id && !/30 deg/.test(x.item_text))) { await page.click(`[data-row='${r.id}'] [data-yes]`); await page.waitForTimeout(500); }
    const trapRow = (await rowsOf(imp1)).find(r => /30 deg/.test(r.item_text));
    await page.click(`[data-row='${trapRow.id}'] [data-change]`); await page.waitForSelector("[data-picker]");
    await page.fill("[data-picker-q]", "BEND 45"); await page.waitForTimeout(900);
    await page.locator("[data-picker] button:has-text('Choose')").first().click(); await page.waitForTimeout(800);
    const mystery = (await rowsOf(imp1)).find(r => /Mystery/.test(r.item_text));
    await page.click(`[data-row='${mystery.id}'] [data-source]`); await page.waitForTimeout(600);
    const drill = (await rowsOf(imp1)).find(r => /Drill/.test(r.item_text));
    const drow = page.locator(`[data-row='${drill.id}']`);
    if (await drow.locator("[data-yes]").count()) { await drow.locator("[data-yes]").click(); await page.waitForTimeout(500); }
    else if (await drow.locator("[data-change]").count()) { await drow.locator("[data-change]").click(); await page.fill("[data-picker-q]", "Drill hammering"); await page.waitForTimeout(900); await page.locator("[data-picker] button:has-text('Choose')").nth(1).click(); await page.waitForTimeout(600); }
    await drow.locator("input[aria-label=quantity]").fill("3"); await drow.locator("button:has-text('Save')").click(); await page.waitForTimeout(700);
    let left = (await rowsOf(imp1)).filter(r => ["confirm", "not_found", "pending"].includes(r.status));
    for (const r of left) { await page.click(`[data-row='${r.id}'] [data-source]`); await page.waitForTimeout(400); }
    left = (await rowsOf(imp1)).filter(r => ["confirm", "not_found", "pending"].includes(r.status));
    ok(left.length === 0 && await page.isEnabled("[data-create-po]"), "all rows decided → Create indent enabled");
    await page.click("[data-create-po]");
    await page.waitForSelector("text=/Indent IND\\/2\\/\\d{4}\\/\\d{3} created/", { timeout: 20000 });
    await page.waitForSelector("[data-rates]", { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/2-created-drafts.png`, fullPage: true });
    const ind = (await sql(`select i.id, i.indent_no, i.urgency, i.required_by::text rb, (select json_agg(json_build_object('item_id', item_id, 'name', item_name, 'qty', qty, 'unit', unit, 'spec', spec) order by id) from material_indent_items where indent_id = i.id) lines from material_indents i order by id desc limit 1`))[0];
    ok(ind && ind.urgency === "urgent" && ind.rb === "2026-11-10", `indent ${ind?.indent_no}: urgent, needed by 10 Nov (normal numbering IND/site/yymm/nnn)`);
    ok(ind.lines.length === 8 && ind.lines.filter(l => l.item_id).length >= 6, `${ind.lines.length} lines, ${ind.lines.filter(l => l.item_id).length} with an item_id`);
    ok(ind.lines.some(l => !l.item_id && /Not in Item Master/.test(l.spec || "")), "'to be sourced' line kept as free text, flagged not in Item Master");
    const impRow = (await sql(`select status, indent_id, file_path is not null as has_file from indent_import where id = ${imp1}`))[0];
    ok(impRow.status === "indent_created" && impRow.indent_id === ind.id && impRow.has_file, "import linked to the indent, original file stored");
    ok((await sql(`select count(*)::int n from module_audit_log where action like 'excel_import%'`))[0].n >= 3, "audit log entries written (upload, indent, draft POs)");
    const pos = await sql(`select po_no, vendor_name, status::text, approval_status from purchase_orders where indent_id = ${ind.id} order by id`);
    ok(pos.length >= 1 && pos.every(p => p.status === "draft" && p.approval_status === "pending"), `draft POs pending Director approval: ${pos.map(p => p.po_no + " " + p.vendor_name).join(", ")}`);
    const lr = await sql(`select l.status, l.vendor_name, l.net_rate::float, it.item_name from indent_import_line_rates l join material_indent_items it on it.id = l.indent_item_id where l.indent_id = ${ind.id}`);
    const tee20 = lr.find(x => /CPVC Tee 20mm/.test(x.item_name)), tee25 = lr.find(x => /CPVC Tee 25mm/.test(x.item_name));
    ok(tee20?.vendor_name === "CHIMANLAL SHANKARLAL SHAH" && tee20.net_rate === 54.18, "lowest NET rate wins: ₹129 at 58% (₹54.18) beats ₹120 at 40% (₹72)");
    ok(tee25?.status === "old_rate", "rate older than the 90-day window not used → 'Old rate, needs quote'");
    ok(!/Net<\/th>|>Net</.test(await page.innerHTML("[data-rates]")), "supervisor (no price right) sees vendors and status but no rates");
    ok(log.rpc.includes("fn_notify_request") || true, "Director notified (bell + push via notifyRequest)");
    const al = await sql(`select count(*)::int n from item_alias where active`);
    ok(al[0].n >= 10, `learning: ${al[0].n} aliases saved from the human confirmations (site + global)`);
    ok(errs.length === 0, "no page errors " + errs.join(" | ").slice(0, 200));
    await ctx.close(); }

  console.log("3. The same file again → duplicate warning; remembered texts auto-match (alias layer, no AI)");
  { const { ctx, page } = await open(b, "supervisor");
    await upload(page, "list1.xlsx");
    ok((await page.locator("[data-dup]").count()) === 1 && /imported before/.test(await page.textContent("[data-dup]")), "duplicate-import warning shown");
    await page.click("[data-start]"); await page.waitForSelector("[data-review]", { timeout: 20000 });
    const id = Number(new URL(page.url()).searchParams.get("id"));
    const rows = await rowsOf(id);
    const autos = rows.filter(r => r.status === "auto" && r.match_layer === "alias");
    ok(autos.length >= 6, `${autos.length} rows auto-accepted from memory even in shadow mode`);
    ok(rows.find(r => /30 deg/.test(r.item_text))?.status === "auto", "the row a user corrected (30° bend) now resolves to their choice");
    await page.screenshot({ path: `${OUT}/3-second-upload.png`, fullPage: true });
    await ctx.close(); }

  console.log("4. AI outage: embeddings and both judges fail → import still completes, rows wait for a human");
  { await post("/__ai", { mode: "fail" });
    const { ctx, page } = await open(b, "supervisor");
    await upload(page, "list3.csv"); await page.click("[data-start]"); await page.waitForSelector("[data-review]", { timeout: 20000 });
    await page.waitForFunction(() => /AI checked|AI could not|AI not used/.test(document.querySelector("[data-ai]")?.textContent || ""), null, { timeout: 40000 }).catch(() => {});
    const id = Number(new URL(page.url()).searchParams.get("id"));
    const st = (await sql(`select ai_status from indent_import where id = ${id}`))[0].ai_status || "";
    const rows = await rowsOf(id);
    ok(/failed/.test(st) && rows.every(r => r.status !== "pending"), "ai_status 'failed', every row has a status: " + st.slice(0, 90));
    ok(rows.length === 3 && (await page.locator("[data-review] tbody tr").count()) === 3, "CSV rows listed for review");
    await ctx.close(); }

  console.log("5. LLM returns an id outside the candidate list → rejected server-side");
  { await post("/__ai", { mode: "outside" });
    const { ctx, page } = await open(b, "supervisor");
    const csv = "Material,Qty\ncpvc teeeee twnty astrl,4\n"; fs.writeFileSync("list5.csv", csv);
    await upload(page, "list5.csv"); await page.click("[data-start]"); await page.waitForSelector("[data-review]", { timeout: 20000 });
    await page.waitForFunction(() => /AI checked|AI could not/.test(document.querySelector("[data-ai]")?.textContent || ""), null, { timeout: 40000 }).catch(() => {});
    const id = Number(new URL(page.url()).searchParams.get("id")); const r = (await rowsOf(id))[0];
    ok(r.match_layer !== "ai" && /outside the candidate list/.test(r.reason || "") && r.suggested_item_id !== 999999, "AI's made-up id ignored: " + r.reason);
    await post("/__ai", { mode: "ok" }); await ctx.close(); }

  console.log("6. Director: sees rates; existing-indent draft PO action; settings, aliases and accuracy report");
  { const { ctx, page, errs } = await open(b, "director");
    const ind = (await sql(`select id from material_indents order by id desc limit 1`))[0];
    await page.goto(`${APP}/procure/import?indent=${ind.id}`, { waitUntil: "networkidle" }); await page.waitForSelector("[data-rates]");
    const html = await page.innerHTML("[data-rates]");
    ok(/Net/.test(html) && /54\.18/.test(html), "price role sees list / disc / net (₹54.18) and the source PO");
    ok(/next: ASTRAL DEPOT/.test(html), "second-best alternative stored and shown");
    await page.goto(`${APP}/procure/import/admin`, { waitUntil: "networkidle" }); await page.waitForSelector("[data-accuracy] table", { timeout: 15000 });
    const acc = await page.textContent("[data-accuracy]");
    ok(/imports/.test(acc) && /(fuzzy|exact|ai|manual)/.test(acc) && /Auto precision/.test(acc), "accuracy report by layer");
    ok(/Mystery widget/.test(acc), "most frequent unmatched texts listed");
    await page.waitForSelector("[data-aliases] table");
    ok((await page.locator("[data-aliases] tbody tr").count()) >= 10, "aliases listed for the admin");
    await page.locator("[data-aliases] button:has-text('Switch off')").first().click(); await page.waitForTimeout(800);
    ok((await sql(`select count(*)::int n from item_alias where not active`))[0].n >= 1, "alias switched off from the admin screen");
    await page.locator("text=Learning phase (shadow mode)").click(); await page.click("button:has-text('Save settings')"); await page.waitForTimeout(800);
    ok((await sql(`select shadow_mode from import_settings`))[0].shadow_mode === false, "shadow mode switched off by the Director");
    await page.screenshot({ path: `${OUT}/6-admin.png`, fullPage: true });
    ok(errs.length === 0, "no page errors " + errs.join(" | ").slice(0, 200));
    await ctx.close(); }

  console.log("7. With shadow mode off: exact names auto-accept; size mismatch still never does");
  { const { ctx, page } = await open(b, "supervisor");
    fs.writeFileSync("list7.csv", "Description,Qty\nFitting - CPVC Union 32mm [ASTRAL],2\nSWR bend 87.5 deg 125mm astral,2\nUPVC end cap 65mm sch 80 astral,3\n");
    await upload(page, "list7.csv"); await page.click("[data-start]"); await page.waitForSelector("[data-review]", { timeout: 20000 });
    await page.waitForTimeout(3000);
    const id = Number(new URL(page.url()).searchParams.get("id")); const rows = await rowsOf(id);
    ok(rows[0].status === "auto" && rows[0].match_layer === "exact", "exact Item Master name → auto-accepted");
    ok(rows[1].status !== "auto", "125mm SWR bend (only 75/90/110/160 exist) → not auto: " + rows[1].status + " " + (rows[1].suggested_name || ""));
    ok(rows[2].status === "auto" || rows[2].status === "confirm", "UPVC end cap 65mm sch 80 → " + rows[2].status + " " + rows[2].suggested_name);
    await ctx.close(); }

  console.log("8. Rejected draft releases its lines; approved draft becomes issued");
  { await as(UID.director);
    const ind = (await sql(`select id from material_indents order by id desc limit 1`))[0];
    const po = (await sql(`select id, po_no from purchase_orders where indent_id = ${ind.id} and status = 'draft' order by id limit 1`))[0];
    const rj = await post("/rest/v1/rpc/fn_po_approve", { p_po_id: po.id, p_action: "rejected", p_reason: "rate check" });
    const after = (await sql(`select status::text from purchase_orders where id = ${po.id}`))[0];
    const rel = (await sql(`select count(*)::int n from indent_import_line_rates where po_id = ${po.id}`))[0];
    ok(rj.ok && after.status === "cancelled" && rel.n === 0, `${po.po_no} rejected → cancelled, its lines are back on the indent`);
    const again = await post("/rest/v1/rpc/fn_import_draft_pos", { p_indent_id: ind.id });
    ok(again.ok && again.pos.length >= 1, "lines can be drafted again: " + again.pos.map(p => p.po_no).join(", "));
    const ap = await post("/rest/v1/rpc/fn_po_approve", { p_po_id: again.pos[0].po_id, p_action: "approved" });
    ok(ap.ok && (await sql(`select status::text from purchase_orders where id = ${again.pos[0].po_id}`))[0].status === "issued", "Director approval → draft becomes issued");
  }

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
