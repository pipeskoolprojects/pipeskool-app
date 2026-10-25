import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isITExecutiveRole, itLayoutFor } from "../lib/it-ui.mjs";

const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const itBlock = css.slice(css.lastIndexOf("/*", css.indexOf("IT EXECUTIVE UI (fix pass"))).replace(/\/\*[\s\S]*?\*\//g, "");

test("only the IT Executive role gets the IT UI, whatever the role string looks like", () => {
  for (const r of ["it_executive", "IT Executive", "itexecutive", "It-Executive"]) assert.equal(isITExecutiveRole(r), true, r);
  for (const r of ["director", "supervisor", "ho_admin", "storekeeper", "", null, undefined, "it"]) assert.equal(isITExecutiveRole(r), false, String(r));
});
test("layout buckets match the CSS breakpoints", () => {
  assert.equal(itLayoutFor(360), "phone"); assert.equal(itLayoutFor(759), "phone"); assert.equal(itLayoutFor(1024, true), "phone");
  assert.equal(itLayoutFor(760), "tablet"); assert.equal(itLayoutFor(1099), "tablet"); assert.equal(itLayoutFor(1100), "desktop"); assert.equal(itLayoutFor(1440), "desktop");
});
test("every IT rule is scoped under html.it-executive-ui (other roles untouched)", () => {
  const selectors = itBlock.split("}").map(x => x.split("{")[0].trim()).filter(x => x && !x.startsWith("@") && !x.startsWith("/*") && !x.startsWith("*"));
  const unscoped = selectors.flatMap(s => s.split(",").map(x => x.trim())).filter(s => s && !/^html\.it-executive-ui/.test(s) && !/^\d+%|^from|^to$/.test(s));
  assert.deepEqual(unscoped, [], "unscoped selectors inside the IT block");
});
test("glass (backdrop-filter) is limited to the shell: sidebar, page head, phone head, phone nav", () => {
  // walk declaration blocks: the selector is the text between the previous "}" (or "{" of an @-rule) and this "{"
  const flat = itBlock.replace(/@[^{]+\{/g, "{");
  const offenders = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (/backdrop-filter/.test(m[2]) && !/\.sidebar|\.page-head|\.m-head|\.m-nav|co-app|co-portal/.test(m[1])) offenders.push(m[1].trim());
  assert.deepEqual(offenders, [], "backdrop-filter outside the shell");
  assert.doesNotMatch(itBlock, /\[class\*="card"\]/, "the [class*=card] catch-all must not come back");
  assert.doesNotMatch(itBlock, /background-attachment/, "no background-attachment: fixed (repaints every scroll frame)");
});
test("one hairline and one z-index scale are defined and used", () => {
  for (const t of ["--it-hair", "--it-r-xl", "--it-r-lg", "--it-r-md", "--it-r-sm", "--z-sticky", "--z-sidebar", "--z-drawer", "--z-modal", "--z-toast"]) assert.match(itBlock, new RegExp(t + ":"), t);
  assert.doesNotMatch(itBlock, /border: ?(2|3)px solid/, "no thick borders in the IT UI");
  assert.doesNotMatch(itBlock, /border-radius: ?\d{2}px( !important)?;/, "radii must come from tokens, not literal px (pills use var(--it-r-pill))");
});
test("the dashboard prototype no longer blurs every card or fixes its background", () => {
  const html = fs.readFileSync(new URL("../public/it-dashboard-home.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /background-attachment/);
  const cardRule = html.match(/\n\.card\{[^}]*\}/)[0];
  assert.doesNotMatch(cardRule, /backdrop-filter/);
  assert.match(html, /min\(var\(--i,0\),8\)/, "entry stagger capped at 8 steps");
  assert.match(html, /data-nosb=on\] \.studio\{padding-left/, "title clears the floating menu button when the sidebar is hidden");
});
