// update202: sends web pushes to the given staff ids. Called fire-and-forget by lib/notify.
// Needs Vercel env vars: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// SUPABASE_SERVICE_ROLE_KEY (+ existing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!pub || !priv || !url || !service) return Response.json({ ok: false, error: "push env vars not set" }, { status: 200 });
    webpush.setVapidDetails("mailto:info@pipeskool.com", pub, priv);
    const admin = createClient(url, service, { auth: { persistSession: false } });
    // caller must be a logged-in Pipeskool user (verified against Supabase auth)
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !who?.user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const { userIds, title, body, link, tag } = await req.json();
    if (!Array.isArray(userIds) || !userIds.length) return Response.json({ ok: true, sent: 0 });
    const { data: subs } = await admin.from("push_subscriptions")
      .select("id, endpoint, p256dh, auth").in("staff_id", userIds.map(Number)).limit(500);
    let sent = 0;
    await Promise.all((subs || []).map(async s => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, link, tag }));
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410)   // dead subscription — clean up
          await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }));
    return Response.json({ ok: true, sent });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 200 });
  }
}
