const cache = "memory-everyday-v146";
const files = [
  "/",
  "/index.html",
  "/styles.css?v=59",
  "/calendar-month.css?v=59",
  "/push-notifications.css?v=63",
  "/memo.css?v=2",
  "/memo-editor.css?v=4",
  "/memo-popover.css?v=3",
  "/memo-color-fix.css?v=1",
  "/memo-mobile-toolbar.css?v=1",
  "/memo-editor-visibility.css?v=1",
  "/memo-status.css?v=1",
  "/memo-delete-confirm.css?v=1",
  "/memo-integration.css?v=3",
  "/force-sync-confirm.css?v=1",
  "/memo-inline-media.css?v=1",
  "/memo-bold-fix.css?v=1",
  "/memo-alignment-integration.css?v=1",
  "/anniversaries.css?v=10",
  "/anniversary-swipe.css?v=1",
  "/mobile-dialog-fixes.css?v=3",
  "/app-polish.css?v=4",
  "/mobile-input-fix.css?v=2",
  "/floating-action.css?v=1",
  "/bottom-navigation.css?v=1",
  "/settings.css?v=21",
  "/app.js?v=131",
  "/settings.js?v=6",
  "/release-info.json?v=29",
  "/manifest.webmanifest",
  "/icon.svg",
  "/wecom-daily-memo-icon.png",
];

self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(cache)
      .then((storage) => storage.addAll(files))
      .then(() => self.skipWaiting()),
  ),
);

self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== cache).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (event) =>
  event.respondWith(
    caches
      .match(event.request)
      .then((response) => response || fetch(event.request)),
  ),
);

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "你有一项日程需要查看" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "每日备忘", {
      body: payload.body || "你有一项日程需要查看",
      icon: "/wecom-daily-memo-icon.png",
      badge: "/wecom-daily-memo-icon.png",
      tag: payload.tag || "memory-everyday-reminder",
      renotify: true,
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        let found = null;
        for (const client of windows) {
          if ("navigate" in client) {
            await client.navigate(target);
            found = client;
            break;
          }
        }
        if (found) return found.focus();
        return clients.openWindow(target);
      }),
  );
});
