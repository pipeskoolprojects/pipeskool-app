// update480: the public note's PDF (same link rules, same rate limit)
import { publicNote, rateLimited, clientIp, pdfBytes, pdfResponse } from "@/lib/server/dn";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req, { params }) {
  try {
    if (rateLimited(clientIp(req))) return new Response("Too many requests", { status: 429 });
    const r = await publicNote(params.token);
    if (r.status !== "ok") return new Response("This delivery note link is no longer available.", { status: 410, headers: { "content-type": "text/plain", "x-robots-tag": "noindex" } });
    return pdfResponse(await pdfBytes(r.note), r.note, true);
  } catch (e) { console.error("DN_PUBLIC_PDF_FAILED", (e?.message || String(e)).slice(0, 160)); return new Response("The PDF could not be generated right now.", { status: 500 }); }
}
