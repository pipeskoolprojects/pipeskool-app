/* Pipeskool service worker — update202: web push */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Pipeskool", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Pipeskool", {
    body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png",
    data: { link: d.link || "/" }, tag: d.tag || undefined,
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || "/";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) { c.navigate(link); return c.focus(); } }
    return clients.openWindow(link);
  }));
});
