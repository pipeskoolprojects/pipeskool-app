// update275: daily job — close overdue open punches at their site's shift-end and alert supervisors.
// Scheduled in vercel.json (20:00 IST = 14:30 UTC). Also safe to hit manually. Uses the service
// role so it runs without a user session; optional CRON_SECRET must match if set.
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return Response.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("fn_autoclose_missing_punchouts");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, closed: data, at: new Date().toISOString() });
}
