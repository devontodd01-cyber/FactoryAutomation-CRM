const CACHE = 'axiscrm-v2';
const ASSETS = ['/', '/index.html'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// Phone alerts (2026-11-20): a new correction syncs -> notification; tap -> that machine in Fleet.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Axis CRM', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Axis CRM', {
    body: d.body || '', icon: '/logo192.png', badge: '/logo192.png',
    tag: d.tag || 'axiscrm', renotify: true, data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        try { await w.navigate(url); } catch { /* navigate not allowed: fall through */ }
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
