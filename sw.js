const cache = "memory-everyday-v193";
const files = [
  "/",
  "/index.html",
  "/styles.css?v=59",
  "/calendar-month.css?v=59",
  "/push-notifications.css?v=63",
  "/memo.css?v=2",
  "/memo-theme-fix.css?v=1",
  "/memo-editor.css?v=5",
  "/memo-paste.css?v=2",
  "/memo-popover.css?v=3",
  "/memo-color-fix.css?v=1",
  "/memo-mobile-toolbar.css?v=1",
  "/memo-editor-visibility.css?v=1",
  "/memo-status.css?v=2",
  "/event-notes.css?v=1",
  "/memo-delete-confirm.css?v=1",
  "/memo-integration.css?v=4",
  "/memo-folders.css?v=1",
  "/memo-sorting.css?v=3",
  "/memo-scroll.css?v=1",
  "/memo-time-suggestions.css?v=2",
  "/force-sync-confirm.css?v=1",
  "/memo-inline-media.css?v=1",
  "/memo-audio.css?v=3",
  "/memo-bold-fix.css?v=1",
  "/memo-alignment-integration.css?v=1",
  "/anniversaries.css?v=13",
  "/anniversary-swipe.css?v=1",
  "/mobile-dialog-fixes.css?v=3",
  "/app-polish.css?v=4",
  "/mobile-input-fix.css?v=2",
  "/floating-action.css?v=1",
  "/bottom-navigation.css?v=1",
  "/settings.css?v=27",
  "/calendar-focus.css?v=3",
  "/interaction-feedback.css?v=1",
  "/event-colors.css?v=5",
  "/todos.css?v=2",
  "/voice-assistant.css?v=2",
  "/memo-time-suggestions.js?v=1",
  "/app.js?v=165",
  "/settings.js?v=10",
  "/voice-assistant.js?v=3",
  "/release-info.json?v=42",
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
