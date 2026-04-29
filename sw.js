const CACHE_NAME = 'proattend-v8.7';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-badge.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
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
  const isDynamicData =
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('firebase') ||
    event.request.url.includes('google-analytics') ||
    event.request.url.includes('identitytoolkit') ||
    event.request.url.startsWith('chrome-extension');
  if (isDynamicData) return;
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          console.log('[SW] Network failed, serving from cache');
        });
      return cachedResponse || networkFetch;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { notification: { title: 'SAP', body: event.data.text() } };
    }
  }
  const notification = data.notification || {};
  const title = notification.title || 'SAP — Smart Attendance Platform';
  const options = {
    body: notification.body || '',
    icon: './icon-192.png',
    badge: './icon-badge.png',
    vibrate: notification.vibrate || [200, 100, 200],
    tag: notification.tag || 'sap-notification',
    renotify: true,
    dir: notification.dir || 'rtl',
    lang: notification.lang || 'ar',
    requireInteraction: true,
    data: { url: notification.data?.url || './' },
    actions: [
      {
        action: 'open',
        title: notification.lang === 'en' ? 'Open App' : 'فتح التطبيق'
      },
      {
        action: 'close',
        title: notification.lang === 'en' ? 'Dismiss' : 'إغلاق'
      }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url && 'focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
