/*
 * Minimal service worker: makes the app installable (needs a fetch handler) and
 * serves a cached shell when offline. Navigations are network-first, so a
 * redeploy is picked up immediately; the cached page is only a fallback.
 */
const CACHE = 'tradenexus-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || req.mode !== 'navigate') return;
    event.respondWith(
        fetch(req)
            .then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
                return res;
            })
            .catch(() => caches.match('/index.html'))
    );
});
