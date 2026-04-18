
const SW_CONFIG = Object.freeze({
  cacheName: 'proattend-v4.0',
  assetsToCache: [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './badge-icon.png', 
  ],

  vapidKey: 'BIPEO4hlmAZBVXnus7wcSqyRMgR0foYP7eZjPJDRvjRF2ygOa09R8pxyuxnKGdSI2xPgYbTAMTUgtg_79xD2pXA',
  cacheKey: 'sap_push_v2',
  cacheTTL: 7 * 24 * 60 * 60 * 1000,

  maxRetries: 3,
  retryDelay: 1000,

  offlineFallback: './index.html',
});


self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(SW_CONFIG.cacheName).then((cache) => {
      console.log('[SW] ✅ Caching assets...');
      return cache.addAll(SW_CONFIG.assetsToCache);
    }).catch((err) => {
      console.error('[SW] ❌ Cache install failed:', err);
    })
  );
});


self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== SW_CONFIG.cacheName)
          .map((key) => {
            console.log('[SW] 🗑️ Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim()) 
  );
});


self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const isDynamic = [
    'firestore.googleapis.com',
    'firebase',
    'google-analytics',
    'chrome-extension',
    'identitytoolkit',
  ].some((pattern) => event.request.url.includes(pattern));

  if (isDynamic) return;

  event.respondWith(
    caches.open(SW_CONFIG.cacheName).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse?.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(async () => {
          console.warn('[SW] ⚠️ Network failed. Serving fallback.');
          const fallback = await cache.match(SW_CONFIG.offlineFallback);
          return fallback || new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
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
      data = { title: 'إشعار جديد', body: event.data.text() };
    }
  }

  const title = data.notification?.title || data.title || 'ProAttend';
  const options = {
    body: data.notification?.body || data.body || 'لديك تنبيه جديد من النظام',
    icon: './icon-192.png',
    badge: './badge-icon.png',
    vibrate: [100, 50, 100],
    tag: data.tag || 'proattend-default',     
    renotify: data.renotify ?? false,
    requireInteraction: data.requireInteraction ?? false,
    data: {
      url: data.data?.url || './index.html',
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});



self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // ✅ إذا الصفحة مفتوحة بالفعل → ركّز عليها
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});


self.addEventListener('message', (event) => {
  if (!event.data?.type) return;

  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      caches.delete(SW_CONFIG.cacheName).then(() => {
        event.ports?.[0]?.postMessage({ success: true });
      });
      break;

    default:
      console.warn('[SW] Unknown message type:', event.data.type);
  }
});



function _urlBase64ToUint8Array(base64String) {
  try {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
  } catch {
    throw new Error('SAP: Invalid VAPID key format');
  }
}

function _isValidSubscription(sub) {
  try {
    if (!sub || typeof sub !== 'object') return false;
    if (!sub.endpoint?.startsWith('https://')) return false;
    if (!sub.keys?.p256dh || !sub.keys?.auth) return false;
    return true;
  } catch {
    return false;
  }
}

function _detectPlatform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'MacOS';
  return 'Unknown';
}

function _isBrowserSupported() {
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function _isOnline() {
  return navigator.onLine;
}

function _getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}


const _PushCache = {
  get(uid) {
    try {
      const raw = localStorage.getItem(SW_CONFIG.cacheKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.uid !== uid) return null;
      if (Date.now() - data.ts > SW_CONFIG.cacheTTL) return null;
      return data;
    } catch {
      return null;
    }
  },

  set(uid, extra = {}) {
    try {
      localStorage.setItem(SW_CONFIG.cacheKey, JSON.stringify({
        uid, ts: Date.now(), ...extra,
      }));
    } catch {  }
  },

  clear() {
    try {
      localStorage.removeItem(SW_CONFIG.cacheKey);
    } catch {  }
  },
};


async function _withRetry(fn, label = 'op', retries = SW_CONFIG.maxRetries) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries) throw e;
      console.warn(`[SAP] Retry ${i}/${retries} for "${label}":`, e.message);
      await new Promise((r) => setTimeout(r, SW_CONFIG.retryDelay * i));
    }
  }
}

async function _getDb() {
  // ✅ آمن: لا يعتمد على window.db كـ global مباشر
  if (typeof window !== 'undefined' && window.db) return window.db;
  throw new Error('SAP: Firestore db not initialized');
}

async function _getSavedSubscription(uid) {
  try {
    const { doc, getDoc } = await import(
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
    );
    const db = await _getDb();
    const snap = await _withRetry(
      () => getDoc(doc(db, 'user_registrations', uid)),
      'getSavedSub'
    );
    if (!snap.exists()) return null;
    const raw = snap.data().pushSubscription;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function _saveSubscription(uid, subObj) {
  const { doc, setDoc } = await import(
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
  );
  const db = await _getDb();
  await _withRetry(
    () => setDoc(doc(db, 'user_registrations', uid), {
      pushSubscription: JSON.stringify(subObj),
      pushRegisteredAt: new Date().toISOString(),
      pushDevice: navigator.userAgent.slice(0, 150),
      pushPlatform: _detectPlatform(),
    }, { merge: true }),
    'saveSubscription'
  );
}


async function _subscribe(uid) {
  const reg = await navigator.serviceWorker.ready;
  if (!reg.pushManager) return;

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: _urlBase64ToUint8Array(SW_CONFIG.vapidKey),
  });

  const subObj = subscription.toJSON();
  if (!_isValidSubscription(subObj)) return;

  await _saveSubscription(uid, subObj);
  _PushCache.set(uid, { endpoint: subObj.endpoint });
}

async function _renewSubscription(uid) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();
    _PushCache.clear();
    await _subscribe(uid);
  } catch (e) {
    console.warn('[SAP] Push renewal warning:', e.message);
  }
}


/**
 * @param {string} uid - معرّف المستخدم من Firebase Auth
 */
async function initPushNotifications(uid) {
  if (!uid) return;
  if (!_isBrowserSupported()) return;

  if (!_isOnline()) {
    window.addEventListener('online', () => initPushNotifications(uid), { once: true });
    return;
  }

  const permission = _getPermissionStatus();
  if (permission === 'denied') return;

  try {
    if (_PushCache.get(uid)) return;

    const savedSub = await _getSavedSubscription(uid);
    if (savedSub && _isValidSubscription(savedSub)) {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing?.endpoint === savedSub.endpoint) {
        _PushCache.set(uid, { endpoint: savedSub.endpoint });
        return;
      }
      await _renewSubscription(uid);
      return;
    }

    if (permission !== 'granted') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return;
    }

    await _subscribe(uid);

  } catch (e) {
    console.warn('[SAP] Push init (non-critical):', e.message);
  }
}

/**
 * تحديث اشتراك Push إذا تغيّر
 * @param {string} uid
 */
async function refreshPushSubscription(uid) {
  if (!uid || !_isBrowserSupported() || !_isOnline()) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();

    if (!existing) {
      _PushCache.clear();
      await initPushNotifications(uid);
      return;
    }

    const savedSub = await _getSavedSubscription(uid);
    if (!savedSub || existing.endpoint !== savedSub.endpoint) {
      await _renewSubscription(uid);
    }
  } catch (e) {
    console.warn('[SAP] Push refresh warning:', e.message);
  }
}

/**
 * إلغاء اشتراك Push وحذف البيانات من Firestore
 * @param {string} uid
 */
async function unsubscribePush(uid) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();
    _PushCache.clear();

    if (uid) {
      const { doc, setDoc } = await import(
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
      );
      const db = await _getDb();
      await setDoc(doc(db, 'user_registrations', uid), {
        pushSubscription: null,
        pushUnsubscribedAt: new Date().toISOString(),
      }, { merge: true });
    }
  } catch (e) {
    console.warn('[SAP] Push unsubscribe warning:', e.message);
  }
}
