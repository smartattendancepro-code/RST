
import {
    doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const SAP_PUSH_CONFIG = Object.freeze({
    vapidKey: 'BIPEO4hlmAZBVXnus7wcSqyRMgR0foYP7eZjPJDRvjRF2ygOa09R8pxyuxnKGdSI2xPgYbTAMTUgtg_79xD2pXA',
    cacheKey: 'sap_push_v2',
    cacheTTL: 7 * 24 * 60 * 60 * 1000,
    maxRetries: 3,
    retryDelay: 1000,
});

const SAP_PUSH_VERSION = Object.freeze({
    version: '2.0.0',
    buildDate: '2026-04-18',
    platform: 'SAP — Smart Attendance Platform',
});

function _urlBase64ToUint8Array(base64String) {
    try {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const rawData = atob(base64);
        return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
    } catch (e) {
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

const _Cache = {
    get(uid) {
        try {
            const raw = localStorage.getItem(SAP_PUSH_CONFIG.cacheKey);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (data.uid !== uid) return null;
            if (Date.now() - data.ts > SAP_PUSH_CONFIG.cacheTTL) return null;
            return data;
        } catch { return null; }
    },

    set(uid, extra = {}) {
        try {
            localStorage.setItem(SAP_PUSH_CONFIG.cacheKey, JSON.stringify({
                uid, ts: Date.now(), ...extra
            }));
        } catch {  }
    },

    clear() {
        try {
            localStorage.removeItem(SAP_PUSH_CONFIG.cacheKey);
        } catch {  }
    }
};

async function _withRetry(fn, retries = SAP_PUSH_CONFIG.maxRetries) {
    for (let i = 1; i <= retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, SAP_PUSH_CONFIG.retryDelay * i));
        }
    }
}

function _isBrowserSupported() {
    return (
        'Notification' in window &&
        'serviceWorker' in navigator &&
        'PushManager' in window
    );
}

function _detectPlatform() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac/.test(ua)) return 'MacOS';
    return 'Unknown';
}

async function _getSavedSubscription(uid) {
    try {
        const db = window.db;
        const snap = await _withRetry(
            () => getDoc(doc(db, 'user_registrations', uid))
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
    const db = window.db;
    await _withRetry(() =>
        setDoc(doc(db, 'user_registrations', uid), {
            pushSubscription: JSON.stringify(subObj),
            pushRegisteredAt: new Date().toISOString(),
            pushDevice: navigator.userAgent.slice(0, 150),
            pushPlatform: _detectPlatform(),
            pushVersion: SAP_PUSH_VERSION.version,
        }, { merge: true })
    );
}

async function _subscribe(uid) {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) return;

    const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(SAP_PUSH_CONFIG.vapidKey)
    });

    const subObj = subscription.toJSON();
    if (!_isValidSubscription(subObj)) return;

    await _saveSubscription(uid, subObj);
    _Cache.set(uid, { endpoint: subObj.endpoint });

    console.info(`✅ SAP Push v${SAP_PUSH_VERSION.version}: Activated on ${_detectPlatform()}`);
}


async function _renewSubscription(uid) {
    try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
        _Cache.clear();
        await _subscribe(uid);
    } catch (e) {
        console.warn('SAP Push renewal warning:', e.message);
    }
}

async function initPushNotifications(uid) {
    if (!uid) return;
    if (!_isBrowserSupported()) return;

    if (!navigator.onLine) {
        window.addEventListener('online', () => initPushNotifications(uid), { once: true });
        return;
    }

    if (Notification.permission === 'denied') return;

    try {
        if (_Cache.get(uid)) return;

        const savedSub = await _getSavedSubscription(uid);
        if (savedSub && _isValidSubscription(savedSub)) {
            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            if (existing && existing.endpoint === savedSub.endpoint) {
                _Cache.set(uid, { endpoint: savedSub.endpoint });
                return;
            }
            await _renewSubscription(uid);
            return;
        }

        if (Notification.permission !== 'granted') {
            const result = await Notification.requestPermission();
            if (result !== 'granted') return;
        }

        await _subscribe(uid);

    } catch (e) {
        console.warn('SAP Push (non-critical):', e.message);
    }
}

async function refreshPushSubscription(uid) {
    if (!uid || !_isBrowserSupported() || !navigator.onLine) return;

    try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();

        if (!existing) {
            _Cache.clear();
            await initPushNotifications(uid);
            return;
        }

        const savedSub = await _getSavedSubscription(uid);
        if (!savedSub || existing.endpoint !== savedSub.endpoint) {
            await _renewSubscription(uid);
        }

    } catch (e) {
        console.warn('SAP Push refresh warning:', e.message);
    }
}

async function unsubscribePush(uid) {
    try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();

        _Cache.clear();

        if (uid) {
            const db = window.db;
            await setDoc(doc(db, 'user_registrations', uid), {
                pushSubscription: null,
                pushUnsubscribedAt: new Date().toISOString(),
            }, { merge: true });
        }
    } catch (e) {
        console.warn('SAP Push unsubscribe warning:', e.message);
    }
}

export { initPushNotifications, refreshPushSubscription, unsubscribePush, SAP_PUSH_VERSION };
