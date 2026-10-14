// update461: GET /api/files/v?k=<stored path>[&download=1&name=x] — every file view in the app goes through here.
// Checks the login cookie + folder rules, then redirects to a 5-minute private R2 link. See lib/server/fileRoutes.js.
import { viewFile } from "@/lib/server/fileRoutes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req) { return viewFile(req, new URL(req.url).searchParams.get("k") || ""); }
