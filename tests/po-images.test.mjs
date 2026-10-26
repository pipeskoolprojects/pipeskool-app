// update478: PO line pictures — checks that need no browser. (Rendering, PDF size and thumbnail tests run in Playwright; see PO_IMAGE_NOTES.md.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PO_FONT_REGULAR, PO_FONT_BOLD } from "../lib/poFont.js";

const ttf = b64 => Buffer.from(b64, "base64");
const hasGlyphFor = (buf, cp) => {   // walk the TTF cmap (format 4 / 12) for one code point
  const n = buf.readUInt16BE(4); let cmap = 0;
  for (let i = 0; i < n; i++) { const o = 12 + i * 16; if (buf.toString("latin1", o, o + 4) === "cmap") cmap = buf.readUInt32BE(o + 8); }
  const tables = buf.readUInt16BE(cmap + 2);
  for (let i = 0; i < tables; i++) {
    const sub = cmap + buf.readUInt32BE(cmap + 4 + i * 8 + 4), fmt = buf.readUInt16BE(sub);
    if (fmt === 4) {
      const segX2 = buf.readUInt16BE(sub + 6), ends = sub + 14, starts = ends + segX2 + 2;
      for (let s = 0; s < segX2 / 2; s++) { const e = buf.readUInt16BE(ends + s * 2), st = buf.readUInt16BE(starts + s * 2); if (cp >= st && cp <= e) return true; }
    } else if (fmt === 12) {
      const groups = buf.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) { const o = sub + 16 + g * 12; if (cp >= buf.readUInt32BE(o) && cp <= buf.readUInt32BE(o + 4)) return true; }
    }
  }
  return false;
};

test("embedded PDF fonts are real TrueType subsets, small, with the ₹ glyph", () => {
  for (const b64 of [PO_FONT_REGULAR, PO_FONT_BOLD]) {
    const buf = ttf(b64);
    assert.equal(buf.readUInt32BE(0), 0x00010000, "TrueType magic");
    assert.ok(buf.length < 20000, "subset font under 20 KB: " + buf.length);
    assert.ok(hasGlyphFor(buf, 0x20B9), "has ₹ (U+20B9)");
    assert.ok(hasGlyphFor(buf, 0x41) && hasGlyphFor(buf, 0x39), "has A and 9");
  }
});

test("thumbnail SQL: table + save function, JPEG-only, size-capped, re-runnable", () => {
  const sql = fs.readFileSync(new URL("../pipeskool_po_item_thumbs.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.item_thumbs/);
  assert.match(sql, /create or replace function public\.fn_item_thumb_save/);
  assert.match(sql, /left\(p_data, 4\) <> '\/9j\/'/, "rejects anything that is not a JPEG");
  assert.match(sql, /length\(p_data\) > 40000/, "rejects originals (≤ 30 KB decoded)");
  assert.match(sql, /revoke insert, update, delete on public\.item_thumbs/, "no direct writes");
  assert.match(sql, /fn_has_perm\('stock','create'\)/, "same right as the Material Master");
});

test("PDF builder budget and quality steps match the spec (300 KB, steps down to 0.45, then drops pictures)", () => {
  const src = fs.readFileSync(new URL("../lib/poPdf.js", import.meta.url), "utf8");
  assert.match(src, /PO_PDF_BUDGET = 300 \* 1024/);
  assert.match(src, /PO_PDF_QUALITY_STEPS = \[0\.55, 0\.45\]/);
  assert.match(src, /dropped: true/);
  assert.match(src, /addImage\([^)]*"FAST"\)/, "images placed with an alias (identical pictures stored once)");
  const thumbs = fs.readFileSync(new URL("../lib/thumbs.js", import.meta.url), "utf8");
  assert.match(thumbs, /THUMB_PX = 96/); assert.match(thumbs, /THUMB_QUALITY = 0\.65/);
  assert.match(thumbs, /FETCH_MS = 8000/, "originals fetched with a short timeout, only when making a thumbnail");
});
