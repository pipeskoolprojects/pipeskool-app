import { viewRepairImage } from "@/lib/server/fileRoutes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req) {
  const key = new URL(req.url).searchParams.get("k") || "";
  return viewRepairImage(req, key);
}
