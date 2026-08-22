// update202: device-side web push — permission, service worker, subscription storage.
import { supabase, isDemo } from "./supabase";

const b64ToU8 = s => { const p = "=".repeat((4 - s.length % 4) % 4); const b = (s + p).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export function pushEnabled() { return pushSupported() && Notification.permission === "granted"; }

export async function enablePush(staffId) {
  if (!pushSupported()) return { ok: false, error: "This browser doesn't support push. On iPhone: add Pipeskool to the Home Screen first (Share → Add to Home Screen), then enable from inside that app." };
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, error: "Push keys not configured on the server yet (Vercel env vars — update 202 setup)." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "Permission was not granted. Enable notifications for this site in browser settings." };
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
  const j = sub.toJSON();
  if (!isDemo) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", j.endpoint);
    const { error } = await supabase.from("push_subscriptions").insert({
      staff_id: staffId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
      ua: navigator.userAgent.slice(0, 200) });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

// fire-and-forget fan-out to phones (in-app bell rows are written separately by lib/notify)
export async function sendPush(userIds, { title, body, link, tag }) {
  try {
    if (!userIds?.length) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    fetch("/api/push", { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ userIds, title, body, link, tag }) }).catch(() => {});
  } catch { /* never block the action */ }
}
