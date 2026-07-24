const cache = 'memory-everyday-v39';
const files = ['/', '/index.html', '/styles.css?v=39', '/calendar-month.css?v=39', '/app.js?v=39', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => event.waitUntil(
  caches.open(cache).then((storage) => storage.addAll(files)).then(() => self.skipWaiting())
));

self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== cache).map((key) => caches.delete(key)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', (event) => event.respondWith(
  caches.match(event.request).then((response) => response || fetch(event.request))
));
