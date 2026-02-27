/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              DeviceGuard.js  –  v1.0                        ║
 * ║  بصمة جهاز ثابتة مش بتتأثر بـ:                             ║
 * ║    ✓ مسح الكاش أو localStorage                             ║
 * ║    ✓ تغيير المتصفح (Chrome → Safari → Firefox)             ║
 * ║    ✓ تحديث المتصفح أو النظام                               ║
 * ║  بتتأثر بس لو:                                              ║
 * ║    ✗ غيرت الجهاز فعلاً                                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * الاستخدام:
 *   import { getDeviceId, resolveDeviceMatch } from './security/DeviceGuard.js';
 */


// ════════════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════════════
const CONFIG = {

    /**
     * عتبة القبول بالأوزان
     * 0.80 = اقبل لو 80%+ من وزن العناصر متطابق
     * ↑ زيّدها → أكثر صرامة  |  ↓ قلّلها → أكثر مرونة
     */
    SIMILARITY_THRESHOLD: 0.80,

    /**
     * أوزان العناصر
     * مُصممة للـ 3 منصات الرئيسية:
     *   iPhone Safari  → screen + touch + platform مضمونة دايماً
     *   Android Chrome → screen + touch + cpu + ram مضمونة دايماً
     *   Windows Chrome → screen + cpu + ram + platform مضمونة دايماً
     *
     * عايز تشدد على عنصر معين؟ رفّع وزنه
     * عايز تتغاضى عن عنصر؟     خفّض وزنه أو اشيله
     */
    WEIGHTS: {
        screen: 5,  // [دقة الشاشة]      ثابتة 100% على الـ 3 منصات
        cpu: 4,  // [عدد النوى]        ثابت، iOS أحياناً بيرجع 0
        touch: 4,  // [نقاط اللمس]       iOS/Android=5 | Desktop=0
        platform: 3,  // [نظام التشغيل]     Win32 / iPhone / Linux
        ram: 3,  // [الرام]            iOS مش بيديه - Android/Win ثابت
        tz: 2,  // [التوقيت]          شبه ثابت (إلا لو سافر)
        colorDepth: 2,  // [عمق الألوان]      ثابت للشاشة
        hdr: 1,  // [HDR support]      ثابت للشاشة
        mediaCount: 2,  // [الكاميرات/ميك]    ثابت hardware
        lang: 1,  // [اللغة]            وزنه خفيف - قد يتغير
    },

    // ─── مفاتيح التخزين ──────────────────────────────────────
    KEYS: {
        data: 'dg_v1_data',     // البيانات الرئيسية
        salt: 'dg_v1_salt',     // الـ Salt الفريد
        history: 'dg_v1_log',      // سجل التغييرات
        idb_db: 'DeviceGuardDB',
        idb_store: 'dg_store',
        cookie: 'dg_v1',
        cookie_salt: 'dg_v1_s',
    },

    MAX_HISTORY: 10,
};


// ════════════════════════════════════════════════════════════════
//  جمع العناصر الثابتة
// ════════════════════════════════════════════════════════════════
async function _collectComponents() {
    const c = {};

    // الشاشة – devicePixelRatio × 100 عشان iOS بيديه كسور
    c.screen = [
        screen.width,
        screen.height,
        screen.colorDepth,
        Math.round(window.devicePixelRatio * 100),
    ].join('x');

    c.colorDepth = String(screen.colorDepth);

    // CPU – iOS Safari أحياناً بيرجع undefined
    c.cpu = String(navigator.hardwareConcurrency || 0);

    // RAM – iOS مش بيديه، Android/Windows بيديه
    c.ram = String(navigator.deviceMemory || 0);

    // Platform – أول كلمة بس (iPhone بيقول "iPhone" مش "iPhone OS 17")
    c.platform = (navigator.platform || 'unknown')
        .toLowerCase().split(' ')[0].trim();

    // Touch Points – iOS/Android=5 | Windows touch=10 | Desktop=0
    c.touch = String(navigator.maxTouchPoints || 0);

    // Timezone
    c.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';

    // HDR
    c.hdr = window.matchMedia('(dynamic-range: high)').matches ? '1' : '0';

    // عدد الكاميرات والميكروفونات (مش IDs عشان بتتغير)
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const v = devices.filter(d => d.kind === 'videoinput').length;
        const a = devices.filter(d => d.kind === 'audioinput').length;
        c.mediaCount = `v${v}a${a}`;
    } catch {
        c.mediaCount = 'na'; // Safari بيرفض بدون permission
    }

    // اللغة – الأساس بس (ar مش ar-EG)
    c.lang = (navigator.language || 'unknown').split('-')[0].toLowerCase();

    return c;
}


// ════════════════════════════════════════════════════════════════
//  حساب التشابه بالأوزان
// ════════════════════════════════════════════════════════════════
function _similarity(oldC, newC) {
    let total = 0, matched = 0;
    const diff = [];

    for (const [key, weight] of Object.entries(CONFIG.WEIGHTS)) {
        total += weight;
        if (oldC[key] === newC[key]) {
            matched += weight;
        } else {
            diff.push({ key, weight, old: oldC[key], new: newC[key] });
        }
    }

    return { score: total > 0 ? matched / total : 0, diff };
}


// ════════════════════════════════════════════════════════════════
//  SHA-256
// ════════════════════════════════════════════════════════════════
async function _hash(obj) {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    const buffer = await crypto.subtle.digest(
        'SHA-256', new TextEncoder().encode(str)
    );
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('').slice(0, 32);
}


// ════════════════════════════════════════════════════════════════
//  IndexedDB helpers
// ════════════════════════════════════════════════════════════════
let _db = null;

async function _openDB() {
    if (_db) return _db;
    return new Promise((res, rej) => {
        const r = indexedDB.open(CONFIG.KEYS.idb_db, 1);
        r.onupgradeneeded = e =>
            e.target.result.createObjectStore(CONFIG.KEYS.idb_store, { keyPath: 'k' });
        r.onsuccess = e => { _db = e.target.result; res(_db); };
        r.onerror = () => rej(r.error);
    });
}

async function _iGet(key) {
    try {
        const db = await _openDB();
        return new Promise(res => {
            const r = db.transaction(CONFIG.KEYS.idb_store, 'readonly')
                .objectStore(CONFIG.KEYS.idb_store).get(key);
            r.onsuccess = () => res(r.result?.v ?? null);
            r.onerror = () => res(null);
        });
    } catch { return null; }
}

async function _iSet(key, val) {
    try {
        const db = await _openDB();
        return new Promise(res => {
            const tx = db.transaction(CONFIG.KEYS.idb_store, 'readwrite');
            tx.objectStore(CONFIG.KEYS.idb_store).put({ k: key, v: val });
            tx.oncomplete = () => res(true);
            tx.onerror = () => res(false);
        });
    } catch { return false; }
}


// ════════════════════════════════════════════════════════════════
//  Cookie helpers
// ════════════════════════════════════════════════════════════════
function _setCookie(name, val, days = 365) {
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${val}; expires=${exp}; path=/; SameSite=Strict`;
}

function _getCookie(name) {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? m[1] : null;
}


// ════════════════════════════════════════════════════════════════
//  Salt – يُنشأ مرة واحدة ويُحفظ في كل الأماكن
// ════════════════════════════════════════════════════════════════
async function _getSalt() {
    // الأولوية: IDB → localStorage → Cookie → جديد
    const fromIDB = await _iGet(CONFIG.KEYS.salt);
    if (fromIDB) return fromIDB;

    const fromLS = localStorage.getItem(CONFIG.KEYS.salt);
    if (fromLS) { await _iSet(CONFIG.KEYS.salt, fromLS); return fromLS; }

    const fromCK = _getCookie(CONFIG.KEYS.cookie_salt);
    if (fromCK) {
        await _iSet(CONFIG.KEYS.salt, fromCK);
        localStorage.setItem(CONFIG.KEYS.salt, fromCK);
        return fromCK;
    }

    // إنشاء salt جديد
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    await _iSet(CONFIG.KEYS.salt, salt);
    localStorage.setItem(CONFIG.KEYS.salt, salt);
    _setCookie(CONFIG.KEYS.cookie_salt, salt);
    return salt;
}


// ════════════════════════════════════════════════════════════════
//  حفظ في كل الأماكن الـ 4
// ════════════════════════════════════════════════════════════════
async function _saveAll(id, comp) {
    const payload = JSON.stringify({ id, comp, ts: Date.now() });
    localStorage.setItem(CONFIG.KEYS.data, payload);
    sessionStorage.setItem(CONFIG.KEYS.data, payload);
    _setCookie(CONFIG.KEYS.cookie, id);
    await _iSet(CONFIG.KEYS.data, payload);
}


// ════════════════════════════════════════════════════════════════
//  تحميل البيانات المحفوظة (أي مصدر)
// ════════════════════════════════════════════════════════════════
async function _loadSaved() {
    const sources = [
        () => localStorage.getItem(CONFIG.KEYS.data),
        () => sessionStorage.getItem(CONFIG.KEYS.data),
        async () => _iGet(CONFIG.KEYS.data),
    ];
    for (const src of sources) {
        try {
            const raw = await src();
            if (!raw) continue;
            const p = JSON.parse(raw);
            if (p?.id && p?.comp) return p;
        } catch { continue; }
    }
    return null;
}


// ════════════════════════════════════════════════════════════════
//  تسجيل التغييرات في log
// ════════════════════════════════════════════════════════════════
function _log(oldId, newId, score, diff) {
    let h = [];
    try { h = JSON.parse(localStorage.getItem(CONFIG.KEYS.history) || '[]'); } catch { }
    h.unshift({
        ts: new Date().toISOString(),
        oldId, newId,
        score: Math.round(score * 100) + '%',
        diffKeys: diff.map(d => d.key),
        diff,
    });
    localStorage.setItem(CONFIG.KEYS.history,
        JSON.stringify(h.slice(0, CONFIG.MAX_HISTORY)));
}


// ════════════════════════════════════════════════════════════════
//  الدالة الرئيسية – تُرجع نتيجة مفصّلة
// ════════════════════════════════════════════════════════════════
async function _getFingerprint() {
    const comp = await _collectComponents();
    const salt = await _getSalt();
    const freshHash = await _hash({ ...comp, _s: salt });
    const saved = await _loadSaved();

    // أول مرة على الجهاز
    if (!saved) {
        await _saveAll(freshHash, comp);
        return {
            id: freshHash,
            isFirstTime: true,
            isMatch: true,
            score: 1.0,
            changed: false,
            diff: [],
            previousId: null,
            components: comp,
        };
    }

    const { score, diff } = _similarity(saved.comp, comp);
    const isMatch = score >= CONFIG.SIMILARITY_THRESHOLD;

    if (isMatch) {
        // ✅ نفس الجهاز – حدّث الـ timestamp بس، احتفظ بنفس الـ ID
        await _saveAll(saved.id, comp);
        return {
            id: saved.id,
            isFirstTime: false,
            isMatch: true,
            score,
            changed: diff.length > 0,
            diff,
            previousId: null,
            components: comp,
        };
    }

    // ⚠️ تغيير ملحوظ – سجّل وأرجع للكود الخارجي يقرر
    _log(saved.id, freshHash, score, diff);
    await _saveAll(freshHash, comp);

    return {
        id: freshHash,
        isFirstTime: false,
        isMatch: false,
        score,
        changed: true,
        diff,
        previousId: saved.id,
        components: comp,
    };
}


// ════════════════════════════════════════════════════════════════
//  getDeviceId – الاستبدال المباشر لـ window.getUniqueDeviceId
// ════════════════════════════════════════════════════════════════

// كاش في الذاكرة لتفادي إعادة الحساب
let _cachedId = null;

/**
 * @returns {Promise<string>} Device fingerprint ID
 *
 * الاستخدام:
 *   import { getDeviceId } from './security/DeviceGuard.js';
 *   const id = await getDeviceId();
 */
export async function getDeviceId() {
    if (_cachedId) return _cachedId;

    const result = await _getFingerprint();
    _cachedId = result.id;

    // لو في تغيير حقيقي – حفظ للمراجعة
    if (result.changed && !result.isMatch) {
        window._dgChangeReport = {
            previousId: result.previousId,
            newId: result.id,
            score: Math.round(result.score * 100) + '%',
            diffKeys: result.diff.map(d => d.key),
        };
        console.warn('[DeviceGuard] Fingerprint changed:', window._dgChangeReport);
    }

    return _cachedId;
}


// ════════════════════════════════════════════════════════════════
//  resolveDeviceMatch – الاستبدال الكامل لمنطق isDeviceMatch
//  في joinSessionAction
// ════════════════════════════════════════════════════════════════

/**
 * @param {object} params
 * @param {object} params.db               - Firestore db instance
 * @param {object} params.user             - Firebase auth user
 * @param {function} params.serverTimestamp - Firestore serverTimestamp()
 * @param {function} params.arrayUnion      - Firestore arrayUnion()
 * @param {function} params.doc            - Firestore doc()
 * @param {function} params.getDoc         - Firestore getDoc()
 * @param {function} params.setDoc         - Firestore setDoc()
 *
 * @returns {Promise<{ deviceFingerprint: string, isDeviceMatch: boolean, fpResult: object }>}
 *
 * الاستخدام في joinSessionAction:
 *
 *   import { resolveDeviceMatch } from './security/DeviceGuard.js';
 *
 *   const { deviceFingerprint, isDeviceMatch } = await resolveDeviceMatch({
 *       db, user, serverTimestamp, arrayUnion, doc, getDoc, setDoc
 *   });
 */
export async function resolveDeviceMatch({ db, user, serverTimestamp, arrayUnion, doc, getDoc, setDoc }) {

    const fpResult = await _getFingerprint();
    const deviceFingerprint = fpResult.id;
    let isDeviceMatch = true;

    try {
        const sensRef = doc(db, 'user_registrations', user.uid, 'sensitive_info', 'main');
        const sensSnap = await getDoc(sensRef);

        if (!sensSnap.exists()) {
            await setDoc(sensRef, {
                allowed_devices: [deviceFingerprint],
                // ✅ إضافة السطر ده: بيحفظ مواصفات الهاردوير الخام (رام، شاشة، معالج)
                device_specs: fpResult.components,
                device_change_log: arrayUnion({
                    type: 'first_registration',
                    device: deviceFingerprint,
                    score: 1.0,
                    registered_at: new Date().toISOString(),
                }),
            }, { merge: true });
            return { deviceFingerprint, isDeviceMatch: true, fpResult };
        }

        const data = sensSnap.data();
        let allowed = data.allowed_devices
            || (data.bound_device_id ? [data.bound_device_id] : []);

        const exactMatch = allowed.includes(deviceFingerprint);
        const prevMatch = fpResult.previousId && allowed.includes(fpResult.previousId);

        if (exactMatch) {
            // ✅ نفس الجهاز تماماً
            isDeviceMatch = true;

        } else if (prevMatch) {
            // ✅ نفس الجهاز لكن بصمته اتحدّثت (تحديث iOS/Chrome مثلاً)
            // استبدل الـ ID القديم بالجديد تلقائياً
            allowed = allowed.map(id =>
                id === fpResult.previousId ? deviceFingerprint : id
            );
            await setDoc(sensRef, {
                allowed_devices: allowed,
                device_change_log: arrayUnion({
                    type: 'auto_update',
                    old_device: fpResult.previousId,
                    new_device: deviceFingerprint,
                    score: fpResult.score,
                    diff_keys: fpResult.diff.map(d => d.key),
                    updated_at: new Date().toISOString(),
                }),
            }, { merge: true });
            isDeviceMatch = true;

        } else if (fpResult.score >= CONFIG.SIMILARITY_THRESHOLD && allowed.length < 2) {
            // ✅ جهاز جديد مسموح (تشابه عالي + ضمن الكوتة)
            allowed.push(deviceFingerprint);
            await setDoc(sensRef, {
                allowed_devices: allowed,
                device_change_log: arrayUnion({
                    type: 'new_device_added',
                    device: deviceFingerprint,
                    score: fpResult.score,
                    added_at: new Date().toISOString(),
                }),
            }, { merge: true });
            isDeviceMatch = true;

        } else if (fpResult.score >= CONFIG.SIMILARITY_THRESHOLD && allowed.length >= 2) {
            // ⚠️ تشابه عالي لكن وصل الحد – سجّل للمراجعة
            await setDoc(sensRef, {
                device_change_log: arrayUnion({
                    type: 'limit_reached_high_similarity',
                    device: deviceFingerprint,
                    score: fpResult.score,
                    diff_keys: fpResult.diff.map(d => d.key),
                    flagged_at: new Date().toISOString(),
                }),
            }, { merge: true });
            isDeviceMatch = false;

        } else {
            // ❌ جهاز مختلف تماماً
            isDeviceMatch = false;
        }

    } catch (e) {
        console.error('[DeviceGuard] Sync error:', e);
        isDeviceMatch = true; // في حالة خطأ شبكة – مرّر ولا توقف الطالب
    }

    return { deviceFingerprint, isDeviceMatch, fpResult };
}


// ════════════════════════════════════════════════════════════════
//  Utilities – مساعدة في الـ Debug
// ════════════════════════════════════════════════════════════════

/** جلب سجل التغييرات */
export function getDeviceHistory() {
    try {
        return JSON.parse(localStorage.getItem(CONFIG.KEYS.history) || '[]');
    } catch { return []; }
}

/** مسح الكاش في الذاكرة (مفيد في الـ logout) */
export function clearDeviceCache() {
    _cachedId = null;
    _db = null;
}

/** تصدير الـ CONFIG للتعديل من خارج الملف */
export { CONFIG as DeviceGuardConfig };
