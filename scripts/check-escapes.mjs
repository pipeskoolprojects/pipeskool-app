// Guard against the literal-escape bug that has now shipped four times.
//
// A \uXXXX escape is DECODED only inside a real JavaScript string. It is NOT decoded in:
//   * JSX text            <div>\u20b9 500</div>
//   * JSX attribute values  <Stat label="\u{1F4CB} Pending" />   <-- this is JSX text, not JS
// The second case is what update256 shipped, and what the earlier version of this checker
// missed: it treated every quoted region as a safe JS string.
//
// Run:  node scripts/check-escapes.mjs      (exit 1 if anything is found)
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// walk the source tree with node built-ins only, so this runs with no dependencies
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

const ESC = /\\u\{?[0-9a-fA-F]{4}/;
let bad = 0;

for (const file of ["app", "components", "lib"].flatMap(d => walk(d))) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const hits = [];

    // 1. escapes inside a JSX ATTRIBUTE value: name="..." or name='...'
    //    these never decode, so any escape here is a bug
    for (const m of line.matchAll(/[A-Za-z_][\w.-]*\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
      if (ESC.test(m[1])) hits.push("JSX attribute " + m[0].slice(0, 40));
    }

    // 2. escapes in bare JSX text — anything left once real strings are blanked out
    const bare = line
      .replace(/\/\[[^\]]*\]\/[gimsuy]*/g, "RX")          // regex char classes: \u ranges are valid there
      .replace(/[A-Za-z_][\w.-]*\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, "=X")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''");
    if (ESC.test(bare)) hits.push("JSX text");

    hits.forEach(h => { bad++; console.log(`${file}:${i + 1}  ${h}\n    ${line.trim().slice(0, 110)}`); });
  });
}

console.log(bad === 0 ? "\nOK — no undecoded escapes." : `\n${bad} undecoded escape(s) found.`);
process.exit(bad ? 1 : 0);
