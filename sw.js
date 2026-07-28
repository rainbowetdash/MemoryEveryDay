const cache = 'memory-everyday-v56';
const files = ['/', '/index.html', '/styles.css?v=56', '/calendar-month.css?v=56', '/push-notifications.css?v=56', '/app.js?v=56', '/manifest.webmanifest', '/icon.svg', '/wecom-daily-memo-icon.png'];

self.addEventListener('install', (event) => event.waitUntil(
  caches.open(cache).then((storage) => storage.addAll(files)).then(() => self.skipWaiting())
));

self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== cache).map((key) => caches.delete(key)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', (event) => event.respondWith(
  caches.match(event.request).then((response) => response || fetch(event.request))
));

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || '你有一项日程需要查看' }; }
  event.waitUntil(self.registration.showNotification(payload.title || '每日备忘', {
    body: payload.body || '你有一项日程需要查看',
    icon: '/wecom-daily-memo-icon.png',
    badge: '/wecom-daily-memo-icon.png',
    tag: payload.tag || 'memory-everyday-reminder',
    renotify: true,
    data: { url: payload.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(target);
      return client.focus();
    }
    return clients.openWindow(target);
  }));
});
