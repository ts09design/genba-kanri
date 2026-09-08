const CACHE_NAME = 'genba-kanri-v5-mobile-ui';
const ASSETS = [
  './genba-kanri.html',
  './manifest.json',
  './assets/icon.png',
  './assets/adaptive-icon.png',
  './assets/field-log-logo.png',
  './assets/apple-touch-icon.png',
  './assets/icon-512.png'
];

// Install — cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('genba-kanri-') && k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache (ensures latest version)
self.addEventListener('fetch', e => {
  // Weather freshness is managed by its timestamped application cache.
  if (e.request.method !== 'GET' || new URL(e.request.url).hostname === 'www.jma.go.jp') return;
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
