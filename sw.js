const CACHE_NAME = 'proattend-v13';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './dist/bundle.js?v=7',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './faculty-logo.png',
  './geo.js?v=7.5.2',
  './notifications.css',
  './profile-style.css',
  './ramadan_theme.js',
  './screen-guard.js',
  './banner.jpg',
  './fp.min.js',
  './vendor/fa/css/all.min.css',
  './vendor/fa/webfonts/fa-solid-900.woff2',
  './vendor/fa/webfonts/fa-regular-400.woff2'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ASSETS_TO_CACHE.map(async (url) => {
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error(`[${res.status}] ${url}`);
      await cache.put(url, res);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    const update = fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
      }
      return res;
    }).catch(() => null);
    event.waitUntil(update);
    event.respondWith(
      caches.match('./index.html')
        .then((c) => c || update.then((r) => r || caches.match('./')))
        .then((r) => r || Response.error())
    );
    return;
  }

  const isStatic = url.search.includes('v=') || /\.(woff2|png|jpg|ico)$/.test(url.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) {
      if (!isStatic) fetch(req).then((r) => { if (r.ok && r.type === 'basic') cache.put(req, r); }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch { return new Response('', { status: 408 }); }
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'إشعار جديد', body: event.data.text() };
    }
  }

  const title = data.notification?.title || data.title || 'ProAttend';
  const options = {
    body: data.notification?.body || data.body || 'لديك تنبيه جديد من النظام',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.data?.url || './index.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data.url || './');
    })
  );
});
