// 1. تحديث اسم الكاش ليتماشى مع الاسم الجديد
const CACHE_NAME = 'proattend-v1'; 

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  // 2. ضروري نضيف الأيقونات الجديدة للكاش عشان تظهر والنت قاطع
  './icon-192.png', 
  './icon-512.png'
];

// ==========================================
// تثبيت الـ Service Worker
// ==========================================
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('✅ ProAttend: Caching assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// ==========================================
// تنظيف الكاش القديم (بيمسح أي كاش قديم زي 7odorak)
// ==========================================
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

// ==========================================
// التعامل مع الطلبات (Network First Strategy)
// ==========================================
self.addEventListener('fetch', (event) => {
  // تجاهل طلبات الـ POST (إرسال البيانات) وطلبات فايربيس
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.startsWith('chrome-extension')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // لو النت شغال، حدث الكاش بالنسخة الجديدة
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // لو النت قاطع، هات من الكاش
        return caches.match(event.request);
      })
  );
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
    // 3. تحديث مسار الأيقونة للأيقونة الجديدة عشان تظهر في الإشعار
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