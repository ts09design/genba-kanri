const CACHE_NAME = 'genba-kanri-v2';
const ASSETS = [
  './genba-kanri.html',
  './manifest.json',
  './assets/icon.png',
  './assets/adaptive-icon.png',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.css',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js'
];

// Install — cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache (ensures latest version)
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
