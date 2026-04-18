
import {
    doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const SAP_PUSH_CONFIG = Object.freeze({
    vapidKey: 'BIPEO4hlmAZBVXnus7wcSqyRMgR0foYP7eZjPJDRvjRF2ygOa09R8pxyuxnKGdSI2xPgYbTAMTUgtg_79xD2pXA',
    cacheKey: 'sap_push_registered_v1',
    cacheTTL: 7 * 24 * 60 * 60 * 1000,
});

function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}


function _isValidSubscription(sub) {
    try {
        if (!sub || typeof sub !== 'object') return false;
        if (!sub.endpoint || typeof sub.endpoint !== 'string') return false;
        if (!sub.endpoint.startsWith('https://')) return false;
        if (!sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
        return true;
    } catch {
        return false;
    }
}

function _isCacheValid(uid) {
    try {
        const raw = localStorage.getItem(SAP_PUSH_CONFIG.cacheKey);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (data.uid !== uid) return false;
        if (Date.now() - data.ts > SAP_PUSH_CONFIG.cacheTTL) return false;
        return true;
    } catch {
        return false;
    }
}

function _saveCache(uid) {
    try {
        localStorage.setItem(SAP_PUSH_CONFIG.cacheKey, JSON.stringify({
            uid,
            ts: Date.now()
        }));
    } catch {  }
}

async function _isSubscriptionSaved(uid) {
    try {
        const db = window.db;
        const snap = await getDoc(doc(db, 'user_registrations', uid));
        if (!snap.exists()) return false;
        const sub = snap.data().pushSubscription;
        return !!sub;
    } catch {
        return false;
    }
}

async function initPushNotifications(uid) {

    if (!uid) return;
    if (!('Notification' in window)) return;
    if (!('serviceWorker' in navigator)) return;
    if (!('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;

    try {
        if (_isCacheValid(uid)) {
            console.log('📌 SAP Push: Cache valid, skipping re-registration');
            return;
        }

        const alreadySaved = await _isSubscriptionSaved(uid);
        if (alreadySaved) {
            _saveCache(uid);
            console.log('📌 SAP Push: Already registered in Firestore');
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('SAP Push: Permission denied by user');
            return;
        }

        const reg = await navigator.serviceWorker.ready;
        if (!reg.pushManager) return;

        const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: _urlBase64ToUint8Array(SAP_PUSH_CONFIG.vapidKey)
        });

        const subObj = subscription.toJSON();
        if (!_isValidSubscription(subObj)) {
            console.error('SAP Push: Invalid subscription object');
            return;
        }

        const db = window.db;
        await setDoc(doc(db, 'user_registrations', uid), {
            pushSubscription: JSON.stringify(subObj),
            pushRegisteredAt: new Date().toISOString(),
            pushDevice: navigator.userAgent.slice(0, 100),
        }, { merge: true });

        _saveCache(uid);

        console.log('✅ SAP Push: Notification system activated successfully');

    } catch (e) {
        console.warn('SAP Push warning (non-critical):', e.message);
    }
}

async function refreshPushSubscription(uid) {
    try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();

        if (existing) {
            const db = window.db;
            const snap = await getDoc(doc(db, 'user_registrations', uid));
            if (snap.exists()) {
                const saved = snap.data().pushSubscription;
                if (saved) {
                    const savedObj = JSON.parse(saved);
                    if (savedObj.endpoint === existing.endpoint) {
                        return;
                    }
                }
            }

            await existing.unsubscribe();
            localStorage.removeItem(SAP_PUSH_CONFIG.cacheKey);
            await initPushNotifications(uid);
        }
    } catch (e) {
        console.warn('SAP Push refresh warning:', e.message);
    }
}

export { initPushNotifications, refreshPushSubscription };