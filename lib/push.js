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
    // update267: the server assigns this device to WHOEVER IS LOGGED IN NOW. The old
    // delete+insert could not remove another user's row for the same phone (RLS), so a
    // device first enabled as Satyam never became the Director's — hence no Director push.
    const { data, error } = await supabase.rpc("fn_push_subscribe", {
      p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
    if (error) return { ok: false, error: error.message };
    if (data && data.ok === false) return { ok: false, error: data.error };
    return { ok: true, reclaimed: !!data?.reclaimed };
  }
  return { ok: true };
}

// update267: the TRUE state of this device — permission alone is not enough (the old check
// hid the Enable button as soon as permission was granted, even with no working subscription).
export async function pushStatus() {
  if (!pushSupported()) return { supported: false, permission: "unsupported", subscribed: false };
  const permission = Notification.permission;
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub && !isDemo) {   // is the browser subscription registered to ME on the server?
      const { data } = await supabase.from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).limit(1);
      subscribed = !!(data && data.length);   // RLS: only my own rows are visible, so a hit = mine
    }
  } catch {}
  return { supported: true, permission, subscribed };
}

// update267: self-test — sends a push to the current user only, through the normal sender.
export async function sendTestPush(staffId) {
  if (!staffId) return;
  await sendPush([staffId], { title: "Pipeskool test", body: "Phone notifications are working on this device.", link: "/m/dashboard", tag: "test" });
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
