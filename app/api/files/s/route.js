// update461: GET /api/files/s?k=dc/<file>.pdf&sig=… — opens ONE shared challan PDF without login (WhatsApp links).
import { openShared } from "@/lib/server/fileRoutes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req) { const u = new URL(req.url); return openShared(u.searchParams.get("k") || "", u.searchParams.get("sig") || ""); }
