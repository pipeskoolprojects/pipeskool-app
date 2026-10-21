// update461: the logic behind every file view / share open, shared by the query-string routes
// (/api/files/v?k=… and /api/files/s?k=…&sig=…) and the older path-style routes (/api/files/v/<path>).
// Query-string routes need no "[...key]" folder, so they deploy reliably from a GitHub web upload.
import { authIdFromCookie, staffByAuthId, canView, validKey, folderOf, SHARE_FOLDERS, shareSig } from "./fileAuth";
import { safeEqual, backend, fallbackOn, headObject, presignGet } from "./r2";
import { supabaseUrl } from "./supabaseFallback";

const text = (s, status) => new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const go = (location, maxAge) => new Response(null, { status: 302, headers: { location, "cache-control": `private, max-age=${maxAge}`, "referrer-policy": "no-referrer" } });

async function target(key, { download = false, name = "", ttl = 300 } = {}) {
  if (backend() === "supabase") return supabaseUrl(key, { download, name });
  if (fallbackOn()) { const h = await headObject(key); if (!h.ok) return supabaseUrl(key, { download, name }); }
  return presignGet(key, { ttl, download, filename: name });
}

// logged-in staff view (cookie session)
export async function viewFile(req, key) {
  try {
    if (!validKey(key)) return text("File not found.", 404);
    const authId = authIdFromCookie(req);
    if (!authId) return text("Your file session has expired — reload the Pipeskool app and open the file again.", 401);
    const staff = await staffByAuthId(authId);
    if (!staff) return text("Your account is not active.", 403);
    if (!(await canView(staff, key))) return text("You do not have permission to open this document.", 403);
    const u = new URL(req.url);
    const download = u.searchParams.get("download") === "1", name = u.searchParams.get("name") || "";
    return go(await target(key, { download, name, ttl: 300 }), 240);
  } catch (e) {
    console.error("FILES_VIEW_FAILED", (e?.message || String(e)).slice(0, 160));
    return text("Could not open the file right now — try again.", 500);
  }
}


/**
 * Same-origin image bytes for PDF export. Normal file views redirect to storage,
 * which taints browser canvases when storage does not send CORS headers.
 */
export async function viewRepairImage(req, key) {
  try {
    if (!/^repairs\/site-\d+-\d+-\d+\.jpg$/i.test(String(key || ""))) return text("Image not found.", 404);
    const authId = authIdFromCookie(req);
    if (!authId) return text("Your file session has expired — reload the Pipeskool app and open the file again.", 401);
    const staff = await staffByAuthId(authId);
    if (!staff) return text("Your account is not active.", 403);
    if (!(await canView(staff, key))) return text("You do not have permission to open this image.", 403);
    const upstream = await fetch(await target(key, { ttl: 60 }), { cache: "no-store" });
    if (!upstream.ok) return text("Could not load this image.", upstream.status === 404 ? 404 : 502);
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.toLowerCase().startsWith("image/")) return text("Invalid image type.", 415);
    return new Response(upstream.body, { status: 200, headers: {
      "content-type": contentType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    } });
  } catch (e) {
    console.error("REPAIR_IMAGE_PROXY_FAILED", (e?.message || String(e)).slice(0, 160));
    return text("Could not load this image right now — try again.", 502);
  }
}

// no-login challan link (WhatsApp)
export async function openShared(key, sig) {
  if (!validKey(key) || !SHARE_FOLDERS.includes(folderOf(key)) || !safeEqual(sig || "", shareSig(key)))
    return text("This link is not valid.", 404);
  try { return go(await target(key, { ttl: 600 }), 300); }
  catch (e) {
    console.error("FILES_SHARE_OPEN_FAILED", (e?.message || String(e)).slice(0, 160));
    return text("Could not open the file right now — try again.", 500);
  }
}

// "/api/files/v/bills/1.jpg" style → key (Next gives decoded segments; decode again only if still encoded)
export function keyFromParams(params) {
  return (params?.key || []).map(s => { try { return decodeURIComponent(s); } catch { return s; } }).join("/");
}
