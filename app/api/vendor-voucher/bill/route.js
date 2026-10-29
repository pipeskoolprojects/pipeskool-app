// update486: GET /api/vendor-voucher/bill?v=<voucher id>&b=<expense_bills id>   (Authorization: Bearer <supabase token>)
// Streams one attached bill of a Direct Vendor Payment voucher from OUR origin, so the print page can read it with
// fetch() / pdf.js / canvas. (The normal file route answers with a redirect to a private Cloudflare R2 link; an <img>
// follows that without CORS, but fetch() — and so pdf.js — is blocked: "Failed to fetch".)
// Access: the voucher must be visible to this user under the database rules (RLS on expenses), and the bill must
// belong to it. Storage keys and signed links never reach the browser.
// POST (same query) with {error} → logs a print-side failure (corrupt / password PDF …) to the server log.
import { createClient } from "@supabase/supabase-js";
import { validKey } from "@/lib/server/fileAuth";
import { target } from "@/lib/server/fileRoutes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
const TYPES = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif" };
const text = (s, status) => new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

async function check(req) {
  const u = new URL(req.url); const v = Number(u.searchParams.get("v")), b = Number(u.searchParams.get("b"));
  if (!v || !b) return { res: text("Bad request.", 400) };
  const auth = req.headers.get("authorization") || ""; const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { res: text("Your session has expired — reload the page.", 401) };
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: who } = await sb.auth.getUser(token);
  if (!who?.user) return { res: text("Your session has expired — reload the page.", 401) };
  const { data: exp } = await sb.from("expenses").select("id, voucher_no").eq("id", v).maybeSingle();   // RLS decides
  if (!exp) return { res: text("You do not have permission to see this voucher.", 403) };
  let { data: bill, error } = await sb.from("expense_bills").select("id, path, file_name").eq("id", b).eq("expense_id", v).maybeSingle();
  if (error && /file_name/i.test(error.message || "")) ({ data: bill } = await sb.from("expense_bills").select("id, path").eq("id", b).eq("expense_id", v).maybeSingle());
  if (!bill) return { res: text("This bill is not attached to the voucher.", 404) };
  return { v, b, exp, bill, user: who.user };
}

export async function GET(req) {
  try {
    const c = await check(req); if (c.res) return c.res;
    const key = String(c.bill.path || "").replace(/^\/+/, "");
    if (!validKey(key)) return text("File not found.", 404);
    const upstream = await fetch(await target(key, { ttl: 120 }), { cache: "no-store" });
    if (upstream.status === 404 || upstream.status === 400) return text("File not found in storage.", 404);
    if (!upstream.ok) { console.error("DVP_BILL_UPSTREAM", c.v, c.b, upstream.status); return text("Storage did not answer (" + upstream.status + ").", 502); }
    const ext = key.split(".").pop().toLowerCase();
    const type = TYPES[ext] || upstream.headers.get("content-type") || "application/octet-stream";
    const name = String(c.bill.file_name || key.split("/").pop()).replace(/["\r\n]/g, "");
    const headers = { "content-type": type, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-disposition": `inline; filename="${name}"` };
    const len = upstream.headers.get("content-length"); if (len) headers["content-length"] = len;
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    console.error("DVP_BILL_FAILED", (e?.message || String(e)).slice(0, 160));
    return text("Could not load the bill right now — try again.", 500);
  }
}

export async function POST(req) {
  try {
    const c = await check(req); if (c.res) return c.res;
    const body = await req.json().catch(() => ({}));
    console.error("DVP_BILL_PRINT_ERROR", JSON.stringify({ voucher: c.exp.voucher_no, bill: c.b, user: c.user.id, error: String(body?.error || "").slice(0, 200) }));
    return Response.json({ ok: true });
  } catch { return Response.json({ ok: false }); }
}
