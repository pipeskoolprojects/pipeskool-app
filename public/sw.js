/* Pipeskool service worker — update202: web push · update353: device-aware notification links */

// update353: a notification link is written on the SERVER when the notification is sent, so it
// cannot know whether it will be tapped on a phone or a laptop. Links now point at /go?to=…,
// which resolves the right shell on the device. These two entries rescue the notifications
// already stored with a hard-coded desktop path — an Android tap on any of them used to land
// on the wide Money & Expenses table with no Approve buttons in reach.
// update364: rows already in the notifications table point at old destinations. Money kinds
// go to Expenses & Petty Cash, which is the module that owns them — not to the combined
// Approvals screen, which was the wrong answer and has been withdrawn.
const LEGACY = {
  "/expenses": "/go?to=money",
  "/approvals": "/go?to=money",
  "/go?to=approvals": "/go?to=money",
};
function resolve(link) {
  const clean = String(link || "/").split("#")[0];
  return LEGACY[clean] || link || "/";
}

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Pipeskool", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Pipeskool", {
    body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png",
    data: { link: resolve(d.link) }, tag: d.tag || undefined,
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const link = resolve(e.notification.data && e.notification.data.link);
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) { c.navigate(link); return c.focus(); } }
    return clients.openWindow(link);
  }));
});
