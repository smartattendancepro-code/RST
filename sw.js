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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('✅ ProAttend: Caching assets...');
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((response) => {
              if (!response.ok) {
                throw new Error(`[404] File not found: ${url}`);
              }
              return cache.put(url, response);
            })
            .catch((error) => {
              console.error('❌ Failed to cache asset:', error.message);
            })
        )
      );
    })
  );
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
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      Promise.race([
        fetch(event.request),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
      ]).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
        }
        return res;
      }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    const net = fetch(event.request).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(event.request, res.clone());
      return res;
    });
    if (cached) { event.waitUntil(net.catch(() => { })); return cached; }
    try { return await net; }
    catch { return new Response('', { status: 408, statusText: 'Network error' }); }
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
