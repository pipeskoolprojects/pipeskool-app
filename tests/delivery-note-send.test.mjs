// update480: Delivery Note + Send to site — unit tests (model, validation, tokens, rate limit, link rules, server routes with a fake database)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { noteFromChallan, dnMessage, dnSubject, isMobile, isEmail, maskMobile, maskEmail, waUrl, smsUrl, mailtoUrl, safeFileName, DN_LINK_DAYS } from "../lib/dnModel.js";
import * as dn from "../lib/server/dn.js";
import { buildDnPdf } from "../lib/dnPdf.js";

const DC = { id: 312, dc_ref: "PSP/319/2026-27", date: "2026-10-27", site: "SOUL Campus, GIFT City", po_no: "PO/2610/0190", client: "SOUL", vendor: "SECRET VENDOR LTD", vendor_dc_no: "VDC-991", status: "matched",
  clientRow: { name: "SCHOOL OF ULTIMATE LEADERSHIP FOUNDATION", bill_line1: "924, Maple Trade Center", bill_city: "Ahmedabad", bill_pincode: "380054", bill_state: "Gujarat", bill_state_code: "24", ship_same: true },
  lines: [{ item_id: 15, item_name: "HDPE - DUTRON HDPE PIPE PE-80 110 X 10 KG", unit: "Rmt", received_qty: 400, rate: 999 }, { item_id: 16, item_name: "Elbow 110", unit: "Nos", received_qty: 4, rate: 50 }] };

test("note model carries no vendor, no vendor DC number, no rate; empty Tally boxes are omitted", () => {
  const n = noteFromChallan(DC, { 15: "3917" });
  const s = JSON.stringify(n);
  assert.doesNotMatch(s, /SECRET VENDOR|VDC-991|999|rate/i);
  assert.equal(n.refNo, ""); assert.equal(n.terms, "");
  assert.equal(n.lines[0].hsn, "3917"); assert.equal(n.lines[1].hsn, ""); assert.equal(n.totalQty, 404); assert.equal(n.unitLabel, "");
  assert.equal(n.consignee.name, "SCHOOL OF ULTIMATE LEADERSHIP FOUNDATION"); assert.deepEqual(n.consignee.lines, ["924, Maple Trade Center", "Ahmedabad - 380054"]);
});
test("message text matches the required format and never names the vendor", () => {
  const m = dnMessage(noteFromChallan(DC), "https://x/dn/abc");
  assert.equal(m, "Pipeskool Projects Pvt. Ltd.\nDelivery Note PSP/319/2026-27 dated 27-10-2026\nAgainst PO: PO/2610/0190\nItem: HDPE - DUTRON HDPE PIPE PE-80 110 X 10 KG + 1 more item, 404.00\nDelivery to: SOUL Campus, GIFT City\n\nView / download: https://x/dn/abc");
  assert.doesNotMatch(m, /VENDOR|VDC/); assert.equal(dnSubject(noteFromChallan(DC)), "Delivery Note PSP/319/2026-27 - Pipeskool Projects");
  assert.equal(safeFileName("PSP/319/2026-27"), "Delivery-Note-PSP-319-2026-27.pdf");
});
test("validation + masking + deep links", () => {
  for (const v of ["9876543210", "6000000000"]) assert.equal(isMobile(v), true, v);
  for (const v of ["5876543210", "98765", "98765432101", "+919876543210", "", null]) assert.equal(isMobile(v), false, String(v));
  assert.equal(isEmail("a@b.co"), true); for (const v of ["nope", "a@b", "a b@c.com", ""]) assert.equal(isEmail(v), false, v);
  assert.equal(maskMobile("9876543210"), "98765 xxxx0"); assert.equal(maskEmail("store@site.com"), "stxxx@site.com");
  assert.equal(waUrl("9876543210", "a b&c"), "https://wa.me/919876543210?text=a%20b%26c");
  assert.equal(smsUrl("9876543210", "hi"), "sms:+919876543210?&body=hi");
  assert.match(mailtoUrl("a@b.co", "S", "B"), /^mailto:a%40b\.co\?subject=S&body=B$/);
});
test("tokens are random, 192-bit, url-safe; link liveness follows expiry and revocation", () => {
  const a = dn.newToken(), b = dn.newToken();
  assert.notEqual(a, b); assert.match(a, /^[A-Za-z0-9_-]{32}$/); assert.equal(dn.tokenOk(a), true); assert.equal(dn.tokenOk("PSP/319/2026-27"), false); assert.equal(dn.tokenOk("short"), false);
  const future = new Date(Date.now() + 86400e3).toISOString(), past = new Date(Date.now() - 1000).toISOString();
  assert.equal(dn.isLive({ expires_at: future, revoked_at: null }), true);
  assert.equal(dn.isLive({ expires_at: past, revoked_at: null }), false);
  assert.equal(dn.isLive({ expires_at: future, revoked_at: past }), false);
  assert.equal(DN_LINK_DAYS, 30);
});
test("rate limit: 60 per minute per IP, then refused, then a new window", () => {
  const ip = "198.51.100.77"; let t = 1_000_000;
  for (let i = 0; i < 60; i++) assert.equal(dn.rateLimited(ip, t), false, "request " + (i + 1));
  assert.equal(dn.rateLimited(ip, t), true); assert.equal(dn.rateLimited("198.51.100.78", t), false, "other ip unaffected");
  assert.equal(dn.rateLimited(ip, t + 61_000), false, "window reset");
});
test("recipient handling: masked + hashed, invalid refused", () => {
  const r = dn.recipientFor("whatsapp", { mobile: "9876543210" }); assert.equal(r.masked, "98765 xxxx0"); assert.match(r.hash, /^[a-f0-9]{64}$/); assert.doesNotMatch(JSON.stringify(r), /9876543210/);
  assert.equal(dn.recipientFor("sms", { mobile: "123" }).error, "Enter a valid 10-digit mobile number.");
  assert.equal(dn.recipientFor("email", { email: "x" }).error, "Enter a valid email address.");
  assert.equal(dn.recipientFor("copy", {}).masked, "link copied");
});
test("server: public note refuses unknown / revoked / expired tokens; the note has no vendor (fake database)", async () => {
  const links = [{ id: 1, challan_id: 312, token: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", expires_at: new Date(Date.now() + 86400e3).toISOString(), revoked_at: null, open_count: 0 },
    { id: 2, challan_id: 312, token: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", expires_at: new Date(Date.now() - 1000).toISOString(), revoked_at: null },
    { id: 3, challan_id: 312, token: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", expires_at: new Date(Date.now() + 86400e3).toISOString(), revoked_at: new Date().toISOString() }];
  const realFetch = globalThis.fetch; process.env.SUPABASE_URL = "http://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  globalThis.fetch = async (url) => { const u = new URL(url); const json = o => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    if (u.pathname.endsWith("/delivery_note_links")) { const tok = (u.searchParams.get("token") || "").replace("eq.", ""); return json(links.filter(l => l.token === tok)); }
    if (u.pathname.endsWith("/delivery_challans")) return json([{ id: 312, dc_ref: "PSP/319/2026-27", dc_date: "2026-10-27", status: "matched", site_id: 2, po_id: 1, client_id: null, vendor_name: "SECRET VENDOR LTD", sites: { name: "SOUL Campus" }, purchase_orders: { po_no: "PO/1" }, clients: null, delivery_challan_items: [{ id: 1, item_id: 15, item_name: "Pipe", unit: "Rmt", received_qty: 10 }] }]);
    if (u.pathname.endsWith("/item_master")) return json([]);
    return json([]); };
  try {
    assert.equal((await dn.publicNote("nope")).status, "invalid");
    assert.equal((await dn.publicNote("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")).status, "expired");
    assert.equal((await dn.publicNote("CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC")).status, "revoked");
    const r = await dn.publicNote("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"); assert.equal(r.status, "ok"); assert.doesNotMatch(JSON.stringify(r.note), /SECRET VENDOR/); assert.equal(r.note.destination, "SOUL Campus");
    const pdf = await buildDnPdf(r.note); assert.ok(pdf.bytes.length > 5000 && pdf.bytes.length < 150 * 1024, "pdf size " + pdf.bytes.length); assert.equal(pdf.pages, 1);
    assert.doesNotMatch(Buffer.from(pdf.bytes).toString("latin1"), /SECRET VENDOR/);
  } finally { globalThis.fetch = realFetch; }
});
test("migration + capability are registered; public route headers configured", () => {
  const sql = fs.readFileSync(new URL("../pipeskool_delivery_note_send.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.delivery_note_links/); assert.match(sql, /token text not null unique/); assert.match(sql, /create table if not exists public\.delivery_note_sends/);
  assert.match(sql, /'challan\.send'/); assert.doesNotMatch(sql, /alter table public\.delivery_challans/);
  assert.match(fs.readFileSync(new URL("../lib/access.js", import.meta.url), "utf8"), /code: "challan\.send", group: "Delivery Challans"/);
  assert.match(fs.readFileSync(new URL("../next.config.js", import.meta.url), "utf8"), /source: "\/dn\/:path\*"[\s\S]*noindex/);
  const doc = fs.readFileSync(new URL("../components/DnDoc.js", import.meta.url), "utf8").split("\n").filter(l => !l.trim().startsWith("//")).join("\n"); assert.doesNotMatch(doc, /Dispatched through|vendor/i);
});
