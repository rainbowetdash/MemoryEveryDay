const cache = 'memory-everyday-v27';
const files = ['/', '/index.html', '/styles.css?v=27', '/calendar-month.css?v=27', '/app.js?v=27', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => event.waitUntil(
  caches.open(cache).then((storage) => storage.addAll(files)).then(() => self.skipWaiting())
));

self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== cache).map((key) => caches.delete(key)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', (event) => event.respondWith(
  caches.match(event.request).then((response) => response || fetch(event.request))
));
