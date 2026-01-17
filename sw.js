const CACHE_NAME = '7odorak-safe-v2'; // قمت بتحديث الإصدار لـ v2 لإجبار التحديث
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
  // تأكد أن ملف icon.png موجود بجانب هذه الملفات
];

// ==========================================
// 1. تثبيت الـ Service Worker (للكاشينج)
// ==========================================
self.addEventListener('install', (event) => {
  self.skipWaiting(); // تفعيل التحديث فوراً
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('✅ Service Worker: Caching essential assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// ==========================================
// 2. تنظيف الكاش القديم عند التحديث
// ==========================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim()) // السيطرة على الصفحات المفتوحة فوراً
  );
});

// ==========================================
// 3. التعامل مع الطلبات (الجزء الجراحي المعدل) 💉
// ==========================================
self.addEventListener('fetch', (event) => {

  // 🛡️ [فلتر الأمان]: تجاهل أي طلب ليس GET (مثل POST للدخول أو إرسال البيانات)
  // هذا السطر هو الذي يحل مشكلة (Request method 'POST' is unsupported)
  if (event.request.method !== 'GET') {
    return;
  }

  // تجاهل طلبات Firebase و Chrome Extensions لتجنب التعارض
  if (event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.startsWith('chrome-extension')) {
    return;
  }

  // استراتيجية: الشبكة أولاً، ثم الكاش (Network First, falling back to cache)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // إذا نجح الإنترنت وجاءت استجابة سليمة، قم بتحديث الكاش
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // إذا انقطع الإنترنت، ابحث في الكاش
        return caches.match(event.request);
      })
  );
});

// ==========================================
// 4. استقبال الإشعارات في الخلفية
// ==========================================
self.addEventListener('push', (event) => {
  let data = {};

  // محاولة قراءة البيانات بأمان
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'إشعار جديد', body: event.data.text() };
    }
  }

  const title = data.notification?.title || data.title || 'نظام كشف الحضور';
  const options = {
    body: data.notification?.body || data.body || 'لديك تنبيه جديد',
    icon: './icon.png', // تأكد من وجود الصورة
    badge: './icon.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.data?.url || './index.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ==========================================
// 5. التعامل مع الضغط على الإشعار
// ==========================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // لو الموقع مفتوح، ركز عليه
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // لو مش مفتوح، افتحه
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || './');
      }
    })
  );
});