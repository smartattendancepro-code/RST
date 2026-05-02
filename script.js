import { MASTER_HALLS, MASTER_SUBJECTS } from './config.js';
import {
    getFirestore, collection, doc, addDoc, setDoc, getDoc,
    getDocs, updateDoc, onSnapshot, query, where, limit,
    writeBatch, serverTimestamp, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getAuth, onAuthStateChanged,
    signInWithEmailAndPassword, signOut, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { i18n, t, changeLanguage } from './i18n.js';
import { AuditManager } from './AuditManager.js';
import { initPushNotifications, refreshPushSubscription, unsubscribePush, SAP_PUSH_VERSION } from './PushManager.js';
import { AnnouncementManager } from './AnnouncementManager.js';


console.info(`🔔 ${SAP_PUSH_VERSION.platform} | Push Manager v${SAP_PUSH_VERSION.version}`);



const CFG = Object.freeze({
    device: {
        cacheKey: 'nursing_secure_device_v5',
        verifiedCacheKey: 'nursing_user_verified_v2',
        verifiedTTL: 7 * 86_400_000,
    },
    gps: {
        targetLat: 30.385873919506743,
        targetLng: 30.488794680472196,
        allowedKm: 2.5,
    },
    network: {
        pingUrl: 'https://cp.cloudflare.com/generate_204',
        pingIntervalMs: 60_000,
        pingTimeoutMs: 3_000,
    },
    api: {
        base: 'https://nursing-backend-rej8.vercel.app',
    },
    firebase: {
        excludedUID: 'R78Lu7IZBpYK0WngcaSL6t1Our62',
    },
    ui: {
        idleTimeoutSec: 20,
        statsCacheTTL: 900_000,
    },
    avatars: Object.freeze({
        Male: ['fa-user-tie', 'fa-user-graduate', 'fa-user-doctor', 'fa-user-astronaut',
            'fa-user-ninja', 'fa-user-secret', 'fa-user-crown', 'fa-person-biking',
            'fa-person-skating', 'fa-person-snowboarding', 'fa-person-swimming',
            'fa-robot', 'fa-ghost', 'fa-dragon', 'fa-gamepad', 'fa-headset',
            'fa-guitar', 'fa-rocket', 'fa-bolt', 'fa-fire'],
        Female: ['fa-user-nurse', 'fa-user-graduate', 'fa-user-doctor', 'fa-person-dress',
            'fa-person-praying', 'fa-person-hiking', 'fa-person-skiing', 'fa-cat',
            'fa-dove', 'fa-gem', 'fa-wand-magic-sparkles', 'fa-camera-retro',
            'fa-palette', 'fa-mug-hot', 'fa-leaf', 'fa-heart', 'fa-star', 'fa-crown'],
    }),
    avatarColors: Object.freeze([
        '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
        '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e',
    ]),
    colleges: Object.freeze({
        nameMap: {
            N: 'Nursing', P: 'Physical Therapy', C: 'Pharmacy',
            D: 'Dentistry', T: 'Computer Science', B: 'Business Admin', H: 'Health Sciences'
        },
        codeMap: { NURS: 'N', PT: 'P', PHARM: 'C', DENT: 'D', CS: 'T', BA: 'B', HS: 'H' },
    }),
});

const PersistentStore = (() => {
    const DB_NAME = 'nursing_app_db';
    const DB_VERSION = 1;
    const STORE_NAME = 'session_store';
    let _db = null;

    function _open() {
        if (_db) return Promise.resolve(_db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };
            req.onsuccess = e => { _db = e.target.result; resolve(_db); };
            req.onerror = () => reject(req.error);
        });
    }

    async function set(key, value) {
        try {
            const db = await _open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put({ key, value, ts: Date.now() });
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) { console.warn('PersistentStore.set error:', e); return false; }
    }

    async function get(key) {
        try {
            const db = await _open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const req = tx.objectStore(STORE_NAME).get(key);
                req.onsuccess = () => resolve(req.result?.value ?? null);
                req.onerror = () => reject(req.error);
            });
        } catch (e) { console.warn('PersistentStore.get error:', e); return null; }
    }

    async function remove(key) {
        try {
            const db = await _open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).delete(key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) { console.warn('PersistentStore.remove error:', e); return false; }
    }

    async function syncToLocal(key) {
        const val = await get(key);
        if (val !== null) {
            try { localStorage.setItem(key, val); } catch { /* quota */ }
        }
        return val;
    }

    async function setWithSync(key, value) {
        await set(key, value);
        try { localStorage.setItem(key, value); } catch { /* quota */ }
        try { sessionStorage.setItem(key, value); } catch { /* quota */ }
    }

    async function getWithFallback(key) {
        let val = await get(key);
        if (val !== null) return val;
        // ثم localStorage
        val = localStorage.getItem(key);
        if (val !== null) { await set(key, val); return val; }
        // أخيراً sessionStorage
        val = sessionStorage.getItem(key);
        if (val !== null) { await set(key, val); return val; }
        return null;
    }

    async function removeWithSync(key) {
        await remove(key);
        try { localStorage.removeItem(key); } catch { /* ignore */ }
        try { sessionStorage.removeItem(key); } catch { /* ignore */ }
    }

    return { set, get, remove, setWithSync, getWithFallback, removeWithSync, syncToLocal };
})();


const SessionGuard = (() => {
    let _resolved = false;
    let _authReadyCallbacks = [];

    function lockScreen() {
        const style = document.getElementById('_session_guard_style') || document.createElement('style');
        style.id = '_session_guard_style';
        style.textContent = `
            #studentAuthDrawer { display: none !important; opacity: 0 !important; pointer-events: none !important; }
        `;
        document.head.appendChild(style);
    }

    function unlock() {
        const style = document.getElementById('_session_guard_style');
        if (style) style.remove();
    }

    function onAuthReady(cb) {
        if (_resolved) { cb(); return; }
        _authReadyCallbacks.push(cb);
    }

    function markResolved() {
        if (_resolved) return;
        _resolved = true;
        unlock();
        _authReadyCallbacks.forEach(cb => { try { cb(); } catch (e) { console.warn(e); } });
        _authReadyCallbacks = [];
    }

    async function quickCheck() {
        lockScreen();
        const uid = await PersistentStore.getWithFallback('LOGGED_IN_UID');
        const sessionId = await PersistentStore.getWithFallback('CURRENT_SESSION_ID');
        const cached = await PersistentStore.getWithFallback('nursing_user_verified_v2');

        if (uid && sessionId && cached) {
            try {
                const data = JSON.parse(cached);
                if (data?.uid === uid && (Date.now() - data.ts) < CFG.device.verifiedTTL) {
                    try { localStorage.setItem('LOGGED_IN_UID', uid); } catch { }
                    try { localStorage.setItem('CURRENT_SESSION_ID', sessionId); } catch { }
                    return { uid, sessionId, valid: true };
                }
            } catch { }
        }
        return { valid: false };
    }

    return { lockScreen, unlock, onAuthReady, markResolved, quickCheck };
})();

SessionGuard.lockScreen();


const Utils = (() => {

    async function hashString(str) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 32);
    }

    function debounce(fn, ms = 300) {
        let timer;
        return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    }

    function haversineKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function smartNormalize(text = '') {
        return text.toString().toLowerCase()
            .replace(/\b(dr|prof|eng|mr|mrs|ms|د|دكتور|مهندس)\b\.?/g, ' ')
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
            .replace(/\s+/g, ' ').trim();
    }

    function safeJsonParse(str, fallback = null) {
        try { return JSON.parse(str); } catch { return fallback; }
    }

    const $ = id => document.getElementById(id);

    const _t = (key, def) => (typeof t === 'function' ? t(key, def) : def);

    const lang = () => localStorage.getItem('sys_lang') || 'ar';

    return { hashString, debounce, haversineKm, smartNormalize, safeJsonParse, $, _t, lang };
})();


const UI = (() => {

    function showToast(message, duration = 3000, bgColor = '#334155') {
        const toast = Utils.$('toastNotification');
        if (!toast) return;
        toast.style.backgroundColor = bgColor;
        toast.innerText = message;
        toast.style.display = 'block';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.style.display = 'none'; }, duration);
    }

    function switchScreen(screenId) {
        const current = document.querySelector('.section.active');
        if (current?.id === screenId) return;
        window.scrollTo({ top: 0, behavior: 'auto' });
        document.querySelectorAll('.section').forEach(sec => {
            sec.style.cssText = '';
            sec.style.setProperty('display', 'none', 'important');
            sec.classList.remove('active');
        });
        const target = Utils.$(screenId);
        if (!target) return;
        target.style.cssText = '';
        target.style.setProperty('display', 'flex', 'important');
        target.style.flexDirection = 'column';
        setTimeout(() => target.classList.add('active'), 10);

        const infoBtn = Utils.$('infoBtn');
        if (infoBtn) infoBtn.style.display = screenId === 'screenWelcome' ? 'flex' : 'none';
    }

    function updateHeaderState(screenId) {
        const wrapper = Utils.$('heroIconWrapper');
        const icon = Utils.$('statusIcon');
        if (!wrapper || !icon) return;
        wrapper.classList.remove('show-icon');
        if (screenId === 'screenWelcome') return;
        wrapper.classList.add('show-icon');
        const states = {
            screenLoading: ['fa-solid fa-satellite-dish hero-icon fa-spin', 'var(--primary)'],
            screenDataEntry: ['fa-solid fa-user-pen hero-icon', 'var(--primary)'],
            screenSuccess: ['fa-solid fa-check hero-icon', '#10b981'],
            screenError: ['fa-solid fa-triangle-exclamation hero-icon', '#ef4444'],
        };
        const [cls, color] = states[screenId] || ['', ''];
        if (cls) { icon.className = cls; icon.style.color = color; icon.style.animation = screenId === 'screenLoading' ? '' : 'none'; }
    }

    function openAuthDrawer() {
        if (window._authStateLoading) return;
        const drawer = Utils.$('studentAuthDrawer');
        if (!drawer) return;
        drawer.style.display = 'flex';
        requestAnimationFrame(() => {
            drawer.classList.add('active');
            const content = drawer.querySelector('.auth-drawer-content');
            if (content) { content.style.transform = 'translateY(0)'; content.style.opacity = '1'; }
        });
    }

    function closeAuthDrawer() {
        const drawer = Utils.$('studentAuthDrawer');
        if (!drawer) return;
        drawer.classList.remove('active');
        setTimeout(() => { drawer.style.display = 'none'; document.body.style.overflow = 'auto'; }, 200);
    }

    function toggleAuthMode(mode) {
        const loginSec = Utils.$('loginSection');
        const signupSec = Utils.$('signupSection');
        const title = Utils.$('authTitle');
        const subtitle = Utils.$('authSubtitle');
        if (mode === 'signup') {
            loginSec?.classList.remove('active');
            signupSec?.classList.add('active');
            if (title) title.innerText = 'Create Account';
            if (subtitle) subtitle.innerText = 'Join our nursing community below';
        } else {
            signupSec?.classList.remove('active');
            loginSec?.classList.add('active');
            if (title) title.innerText = 'Welcome Back';
            if (subtitle) subtitle.innerText = 'Please enter your details to continue';
        }
    }

    function togglePass(inputId, icon) {
        const input = Utils.$(inputId);
        if (!input) return;
        const showing = input.type !== 'password';
        input.type = showing ? 'password' : 'text';
        if (icon) {
            icon.classList.replace(showing ? 'fa-eye-slash' : 'fa-eye', showing ? 'fa-eye' : 'fa-eye-slash');
            icon.style.color = showing ? '#94a3b8' : '#0ea5e9';
            icon.style.filter = showing ? 'none' : 'drop-shadow(0 0 5px rgba(14,165,233,0.5))';
        }
        navigator.vibrate?.(10);
    }

    function applyLanguage(lang) {
        const dict = i18n[lang];
        if (!dict) return;
        document.documentElement.dir = dict.dir || 'rtl';
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const text = dict[key];
            if (!text) return;
            const icon = el.querySelector('i');
            el.innerHTML = icon
                ? `${icon.outerHTML} <span class="btn-text-content">${text}</span>`
                : text;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(input => {
            const key = input.getAttribute('data-i18n-placeholder');
            if (dict[key]) input.placeholder = dict[key];
        });
        localStorage.setItem('sys_lang', lang);
    }

    function setMainButton(mode) {
        const btn = Utils.$('mainActionBtn');
        if (!btn) return;
        const isAr = Utils.lang() === 'ar';
        const dict = typeof i18n !== 'undefined' ? i18n[Utils.lang()] : null;

        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
        btn.disabled = false;
        btn.classList.remove('locked');

        if (mode === 'enter') {
            btn.innerHTML = `${isAr ? 'دخول المحاضرة' : 'Enter Lecture'} <i class="fa-solid fa-door-open fa-beat-fade"></i>`;
            btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            btn.style.boxShadow = '0 8px 25px -5px rgba(16, 185, 129, 0.5)';
            btn.style.border = '1px solid #10b981';
            btn.onclick = () => {
                window.playClick?.();
                switchScreen('screenLiveSession');
                window.startLiveSnapshotListener?.();
            };
        } else {
            const regText = dict?.main_reg_btn || (isAr ? 'تسجيل الحضور' : 'Register Attendance');
            btn.innerHTML = `${regText} <i class="fa-solid fa-fingerprint"></i>`;
            btn.style.background = '';
            btn.style.boxShadow = '';
            btn.style.border = '';
            btn.onclick = () => window.forceOpenPinScreen?.() ?? window.startProcess?.(false);
        }
    }

    function openModal(id) { const m = Utils.$(id); if (m) m.style.display = 'flex'; }
    function closeModal(id) { const m = Utils.$(id); if (m) m.style.display = 'none'; }

    function renderHallOptions(filter = '') {
        const container = Utils.$('hallOptionsContainer');
        const select = Utils.$('hallSelect');
        if (!select || !container) return;

        select.innerHTML = '<option value="" disabled selected>-- اختر المدرج --</option>';
        container.innerHTML = '';

        const filtered = MASTER_HALLS.filter(h => h.includes(filter));

        if (!filtered.length) {
            container.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:12px;">لا توجد نتائج</div>';
            return;
        }

        filtered.forEach(val => {
            const opt = Object.assign(document.createElement('option'), { value: val, text: val });
            select.appendChild(opt);

            const div = Object.assign(document.createElement('div'), { className: 'custom-option' });
            div.setAttribute('data-value', val);
            div.innerHTML = `<span>${val}</span>`;
            div.addEventListener('click', e => {
                e.stopPropagation();
                container.parentElement.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                div.classList.add('selected');
                const trigger = document.querySelector('#hallSelectWrapper .trigger-text');
                if (trigger) trigger.textContent = val;
                Utils.$('hallSelectWrapper')?.classList.remove('open');
                select.value = val;
                window.playClick?.();
            });
            container.appendChild(div);
        });
    }

    function filterModalSubjects() {
        const input = Utils.$('subjectSearchInput');
        const select = Utils.$('modalSubjectSelect');
        if (!input || !select) return;
        const q = input.value;
        select.innerHTML = '';
        const labelMap = {
            first_year: 'First Year', '1': 'First Year', second_year: 'Second Year', '2': 'Second Year',
            third_year: 'Third Year', '3': 'Third Year', fourth_year: 'Fourth Year', '4': 'Fourth Year',
        };
        let hasResults = false;
        for (const [year, subjects] of Object.entries(MASTER_SUBJECTS)) {
            const matched = subjects.filter(s => s.includes(q));
            if (!matched.length) continue;
            hasResults = true;
            const group = Object.assign(document.createElement('optgroup'), { label: labelMap[year] || year });
            matched.forEach(sub => {
                group.appendChild(Object.assign(document.createElement('option'), { value: sub, text: sub }));
            });
            select.appendChild(group);
        }
        if (!hasResults) {
            select.appendChild(Object.assign(document.createElement('option'), {
                text: Utils.lang() === 'ar' ? 'لا توجد نتائج' : 'No results found',
                disabled: true,
            }));
        }
    }

    function toggleDropdown(listId) {
        const list = Utils.$(listId);
        document.querySelectorAll('.dropdown-list').forEach(el => { if (el.id !== listId) el.classList.remove('show'); });
        list?.classList.toggle('show');
    }

    function selectOption(type, value) {
        const hidden = Utils.$('reg' + type);
        if (hidden) hidden.value = value;
        Utils.$('dropdown' + type)?.classList.add('selected-active');
        Utils.$('list' + type)?.classList.remove('show');
        validateSignupForm();
    }

    function validateSignupForm() {
        const val = id => Utils.$(id)?.value?.trim() || '';
        const setStyle = (el, valid) => {
            if (!el) return;
            el.style.borderColor = valid ? '#10b981' : '#ef4444';
        };

        const email = val('regEmail');
        const emailConfirm = val('regEmailConfirm');
        const pass = val('regPass');
        const passConfirm = val('regPassConfirm');
        const level = val('regLevel');
        const gender = val('regGender');
        const name = val('regFullName');
        const groupRaw = val('regGroup').toUpperCase();

        const emailRx = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const isEmailValid = emailRx.test(email);
        const isEmailMatch = isEmailValid && email === emailConfirm;

        if (emailConfirm) {
            setStyle(Utils.$('regEmailConfirm'), isEmailMatch);
            const err = Utils.$('emailError');
            if (err) err.style.display = isEmailMatch ? 'none' : 'block';
        }

        const isPassLen = pass.length >= 6;
        const isPassMatch = isPassLen && pass === passConfirm;
        if (passConfirm) {
            setStyle(Utils.$('regPassConfirm'), isPassMatch);
            const err = Utils.$('passError');
            if (err) err.style.display = isPassMatch ? 'none' : 'block';
        }

        const groupRx = /^[1-4][GPNCDTBH]\d{1,2}$/;
        const isGroupFmt = groupRx.test(groupRaw);
        const isGroupLevel = !level || !isGroupFmt || groupRaw.startsWith(level);
        const isGroupOk = isGroupFmt && isGroupLevel;
        const groupEl = Utils.$('regGroup');
        if (groupEl && groupRaw.length > 0) {
            groupEl.style.borderColor = isGroupOk ? '#10b981' : '#ef4444';
            groupEl.style.backgroundColor = isGroupOk ? '#f0fdf4' : '#fef2f2';
            if (groupEl.value !== groupRaw) groupEl.value = groupRaw;
        } else if (groupEl) {
            groupEl.style.borderColor = groupEl.style.backgroundColor = '';
        }

        const isNameOk = name && !name.includes('⚠️') && !name.includes('❌') && !name.toLowerCase().includes('not registered');
        const allValid = isEmailValid && isEmailMatch && isPassLen && isPassMatch
            && level && gender && isNameOk && isGroupOk;

        const btn = Utils.$('btnDoSignup');
        if (btn) {
            btn.disabled = !allValid;
            btn.style.opacity = allValid ? '1' : '0.5';
            btn.style.filter = allValid ? 'grayscale(0%)' : 'grayscale(100%)';
            btn.style.cursor = allValid ? 'pointer' : 'not-allowed';
            btn.style.boxShadow = allValid ? '0 4px 12px rgba(16,185,129,0.2)' : 'none';
        }
    }

    return {
        showToast, switchScreen, updateHeaderState,
        openAuthDrawer, closeAuthDrawer, toggleAuthMode, togglePass,
        applyLanguage, setMainButton, openModal, closeModal,
        renderHallOptions, filterModalSubjects, toggleDropdown,
        selectOption, validateSignupForm,
    };
})();


const DeviceManager = (() => {
    let _cachedId = null;

    async function getUniqueDeviceId() {
        if (_cachedId) return _cachedId;

        const storedIDB = await PersistentStore.get(CFG.device.cacheKey);
        if (storedIDB) { _cachedId = storedIDB; return storedIDB; }

        const stored = localStorage.getItem(CFG.device.cacheKey);
        if (stored) {
            _cachedId = stored;
            await PersistentStore.set(CFG.device.cacheKey, stored);
            return stored;
        }

        const extras = [
            navigator.hardwareConcurrency || 0,
            navigator.deviceMemory || 0,
            screen.colorDepth,
            `${screen.width}x${screen.height}`,
            screen.pixelDepth || 0,
            navigator.platform || '',
            navigator.maxTouchPoints || 0,
            Intl.DateTimeFormat().resolvedOptions().timeZone,
            (navigator.languages || []).join(','),
        ].join('||');

        let fpId = `FALLBACK_${Date.now().toString(36)}`;
        try {
            if (window.FingerprintJS) {
                const fp = await FingerprintJS.load();
                const res = await fp.get();
                fpId = res.visitorId;
            }
        } catch (e) {
            console.warn('FingerprintJS failed:', e);
        }

        const finalId = await Utils.hashString(`${fpId}|${extras}`);
        _cachedId = finalId;
        localStorage.setItem(CFG.device.cacheKey, finalId);
        await PersistentStore.set(CFG.device.cacheKey, finalId);
        return finalId;
    }

    function saveVerifiedCache(uid) {
        const data = JSON.stringify({ uid, ts: Date.now() });
        localStorage.setItem(CFG.device.verifiedCacheKey, data);
        PersistentStore.set(CFG.device.verifiedCacheKey, data).catch(() => { });
    }

    function readVerifiedCache(uid) {
        const raw = localStorage.getItem(CFG.device.verifiedCacheKey);
        if (!raw) return false;
        const data = Utils.safeJsonParse(raw);
        return data?.uid === uid && (Date.now() - data.ts) < CFG.device.verifiedTTL;
    }

    async function readVerifiedCacheAsync(uid) {
        let raw = localStorage.getItem(CFG.device.verifiedCacheKey);
        if (!raw) {
            raw = await PersistentStore.get(CFG.device.verifiedCacheKey);
            if (raw) {
                try { localStorage.setItem(CFG.device.verifiedCacheKey, raw); } catch { /* ignore */ }
            }
        }
        if (!raw) return false;
        const data = Utils.safeJsonParse(raw);
        return data?.uid === uid && (Date.now() - data.ts) < CFG.device.verifiedTTL;
    }

    function clearVerifiedCache() {
        localStorage.removeItem(CFG.device.verifiedCacheKey);
        PersistentStore.remove(CFG.device.verifiedCacheKey).catch(() => { });
    }

    return { getUniqueDeviceId, saveVerifiedCache, readVerifiedCache, readVerifiedCacheAsync, clearVerifiedCache };
})();


const NetworkManager = (() => {
    let _pingInterval = null;
    let userIP = 'Unknown';

    async function isReallyOnline() {
        if (!navigator.onLine) return false;
        try {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), CFG.network.pingTimeoutMs);
            await fetch(`${CFG.network.pingUrl}?${Date.now()}`, { mode: 'no-cors', signal: ctrl.signal });
            return true;
        } catch { return false; }
    }
    function showLostModal() { UI.showToast('📡 لا يوجد اتصال بالإنترنت', 2000, '#334155'); }
    function hideLostModal() { /* toast بتختفي لوحدها */ }

    function fetchIP() {
        fetch('https://api.ipify.org?format=json')
            .then(r => r.json())
            .then(d => { userIP = d.ip; })
            .catch(() => { userIP = 'Hidden IP'; });
    }

    function getIP() { return userIP; }

    function initNetworkIndicator() {
        const indicator = Utils.$('superWifiIndicator');
        if (!indicator) return;
        const statusText = indicator.querySelector('.wifi-text');
        const ICON_HTML = '<i class="fa-solid fa-wifi fa-fade"></i><i class="fa-solid fa-slash wifi-slash" id="wifiSlashIcon"></i>';

        function updateUI(state) {
            indicator.classList.remove('state-loading', 'state-weak', 'wifi-status-hidden');
            const iconBox = indicator.querySelector('.wifi-icon-box');
            if (state !== 'LOADING' && !iconBox.querySelector('.fa-wifi')) iconBox.innerHTML = ICON_HTML;
            const slash = Utils.$('wifiSlashIcon');

            switch (state) {
                case 'ONLINE':
                    if (document.readyState === 'complete') indicator.classList.add('wifi-status-hidden');
                    if (slash) slash.style.display = 'none';
                    break;
                case 'OFFLINE':
                    if (statusText) statusText.innerText = 'CONNECTION LOST';
                    if (slash) slash.style.display = 'block';
                    break;
                case 'WEAK':
                    indicator.classList.add('state-weak');
                    if (statusText) statusText.innerText = 'UNSTABLE NETWORK';
                    if (slash) slash.style.display = 'none';
                    break;
                case 'LOADING':
                    indicator.classList.add('state-loading');
                    if (statusText) statusText.innerText = 'CONNECTING...';
                    iconBox.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:16px;"></i>';
                    break;
            }
        }

        async function diagnose() {
            if (document.readyState !== 'complete') updateUI('LOADING');
            if (!navigator.onLine) { updateUI('OFFLINE'); return; }
            try {
                const ctrl = new AbortController();
                setTimeout(() => ctrl.abort(), CFG.network.pingTimeoutMs);
                await fetch(`${CFG.network.pingUrl}?${Date.now()}`, { mode: 'no-cors', signal: ctrl.signal });
                const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                const weak = conn && (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.rtt > 1000);
                updateUI(weak ? 'WEAK' : 'ONLINE');
            } catch { updateUI('OFFLINE'); }
        }

        window.addEventListener('online', diagnose);
        window.addEventListener('offline', () => updateUI('OFFLINE'));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') { clearInterval(_pingInterval); _pingInterval = null; }
            else { diagnose(); _pingInterval = setInterval(diagnose, CFG.network.pingIntervalMs); }
        });

        if (document.readyState !== 'complete') updateUI('LOADING');
        window.addEventListener('load', diagnose);
        _pingInterval = setInterval(diagnose, CFG.network.pingIntervalMs);
        diagnose();
    }

    function initGlobalGuard() {
        setInterval(async () => {
            // بعد
            const onLiveScreen = document.querySelector('.section.active')?.id === 'screenLiveSession';
            if (await isReallyOnline()) hideLostModal();
            else if (!onLiveScreen) showLostModal();
            else hideLostModal();
        }, 15_000);

        if (!isMobileDevice()) {
            Utils.$('desktop-blocker').style.display = 'flex';
            document.body.style.overflow = 'hidden';
            throw new Error('Desktop access denied.');
        }
    }

    return { isReallyOnline, showLostModal, hideLostModal, fetchIP, getIP, initNetworkIndicator, initGlobalGuard };
})();


const GPSManager = (() => {
    let _watchId = null;
    let _lat = '', _lng = '';
    let _prefetched = null;
    let _prefetchTime = 0;

    function startWatcher() {
        if (!navigator.geolocation) return;
        _watchId = navigator.geolocation.watchPosition(
            pos => { _lat = pos.coords.latitude; _lng = pos.coords.longitude; },
            () => { },
            { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
        );
    }

    function stopWatcher() {
        if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
    }

    async function getGPSForJoin() {
        if (_lat && _lng) return { lat: _lat, lng: _lng, cached: true };
        return new Promise(resolve => {
            if (!navigator.geolocation) { resolve({ lat: 0, lng: 0, error: 'unavailable' }); return; }
            navigator.geolocation.getCurrentPosition(
                pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve({ lat: 0, lng: 0, error: 'denied' }),
                { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 },
            );
        });
    }

    function openMapsToCollegeLocation() {
        window._isOpeningMaps = true;
        window.open(`https://www.google.com/maps/search/?api=1&query=${CFG.gps.targetLat},${CFG.gps.targetLng}`, '_blank');
    }

    return { startWatcher, stopWatcher, getGPSForJoin, openMapsToCollegeLocation };
})();


const AuthManager = (() => {
    const db = window.db;
    const auth = window.auth;

    async function onAuthChange(user) {
        const drawerEl = Utils.$('studentAuthDrawer');
        const profileWrap = Utils.$('profileIconWrapper');
        const profileIcon = Utils.$('profileIconImg');
        const statusDot = Utils.$('userStatusDot');

        window._authStateLoading = false;

        // [MODERN & GLOBAL SESSION RECOVERY LOGIC]
        if (!user) {
            console.log('[Auth] No active Firebase user detected. Analyzing persistent storage...');

            // 1. جلب البيانات من المخزن الدائم (IndexedDB / LocalStorage) بشكل متوازي للسرعة
            const [savedUID, savedSession, verifiedRaw] = await Promise.all([
                PersistentStore.getWithFallback('LOGGED_IN_UID'),
                PersistentStore.getWithFallback('CURRENT_SESSION_ID'),
                PersistentStore.get(CFG.device.verifiedCacheKey)
            ]);

            // 2. التحقق مما إذا كان هناك "أثر" لمستخدم مسجل سابقاً
            if (savedUID && savedSession && verifiedRaw) {
                const verifiedData = Utils.safeJsonParse(verifiedRaw);
                const isTTValid = verifiedData && (Date.now() - verifiedData.ts) < CFG.device.verifiedTTL;

                // [الذكاء الصناعي للنت الضعيف]: إذا كانت البيانات موجودة وصالحة
                if (verifiedData?.uid === savedUID && isTTValid) {

                    // إذا كنا لا نزال في مرحلة التحميل الأولية (النت ضعيف)، لا تفعل شيئاً وانتظر Firebase
                    if (window._authStateLoading) {
                        console.warn('[Security] Weak network detected. Holding session integrity...');
                        // نحن لا نستدعي markResolved هنا لترك الشاشة مقفولة (Loading) بدلاً من إظهار نافذة تسجيل الدخول
                        return;
                    }

                    // إذا انتهى التحميل تماماً وفايربيز لا يزال يصر أنه لا يوجد مستخدم
                    console.log('[Auth] Persistent session found but Firebase is empty. Restoring UI state...');
                    SessionGuard.markResolved();
                    return;
                }
            }

            // 3. [حماية المستخدم]: إذا وصلنا هنا، فهذا يعني إما مستخدم جديد أو جلسة منتهية الصلاحية تماماً
            // لكن مهلاً! لا تمسح البيانات أبداً طالما أن الـ Loading لا يزال يعمل (حماية ضد الـ Network Glitch)
            if (window._authStateLoading) {
                return; // ابقَ صامتاً وانتظر الرد النهائي
            }

            // 4. [القرار النهائي]: مسح الجلسة فقط عند التأكد 100% من عدم وجود مستخدم
            console.error('[Auth] Hard logout triggered: No valid credentials or session expired.');
            await _handleSignedOut({ drawerEl, profileWrap, profileIcon, statusDot });

            // فتح التطبيق للزوار (Guest Mode)
            SessionGuard.markResolved();
            return;
        }

        const isVerifiedCached = DeviceManager.readVerifiedCache(user.uid);

        try { await user.reload(); }
        catch (e) { console.warn('user.reload() skipped — weak network:', e.code || e.message); }

        let isManuallyVerified = false;
        try {
            const snap = await getDoc(doc(db, 'user_registrations', user.uid));
            if (snap.exists()) {
                const d = snap.data();
                isManuallyVerified = d.status === 'verified' || d.manual_verification === true;
            }
        } catch (e) { console.warn('Manual verification check warning:', e); }

        if (user.emailVerified || isManuallyVerified || isVerifiedCached) {
            DeviceManager.saveVerifiedCache(user.uid);
            await _handleVerifiedUser(user, { drawerEl, profileWrap, profileIcon, statusDot });
        } else {
            _handleUnverifiedUser({ profileWrap, profileIcon, statusDot });
        }

        window.updateUIForMode?.();
        SessionGuard.markResolved();
    }

    async function _handleVerifiedUser(user, els) {
        const { drawerEl, profileWrap, profileIcon, statusDot } = els;

        if (drawerEl) {
            drawerEl.classList.remove('active');
            setTimeout(() => { drawerEl.style.display = 'none'; }, 300);
        }

        try {
            const snap = await getDoc(doc(db, 'user_registrations', user.uid));
            if (!snap.exists()) return;

            const data = snap.data();

            const level = data.registrationInfo?.level || data.level || '';
            setTimeout(() => {
                AnnouncementManager.init(db, user.uid, { level, role: 'student' });
            }, 4000);

            const name = data.registrationInfo?.fullName || data.fullName || 'Student';

            const alreadyTracked = localStorage.getItem('CURRENT_SESSION_ID')
                || await PersistentStore.get('CURRENT_SESSION_ID');
            const sessionId = user.uid;
            const sessionRef = doc(db, 'active_users', user.uid, 'sessions', sessionId);
            if (!alreadyTracked) {
                const existingSession = await getDoc(sessionRef);
                if (!existingSession.exists() || existingSession.data()?.isLoggedIn !== true) {
                    const deviceId = await DeviceManager.getUniqueDeviceId();
                    await setDoc(sessionRef, {
                        isLoggedIn: true,
                        loginAt: serverTimestamp(),
                        deviceFingerprint: deviceId,
                        studentName: data.registrationInfo?.fullName || data.fullName || '',
                        studentID: data.registrationInfo?.studentID || data.studentID || '',
                        ipAddress: NetworkManager.getIP(),
                    }, { merge: true });
                    await PersistentStore.setWithSync('CURRENT_SESSION_ID', sessionId);
                    await PersistentStore.setWithSync('LOGGED_IN_UID', user.uid);
                }
            } else {
                try { localStorage.setItem('CURRENT_SESSION_ID', sessionId); } catch { /* ignore */ }
                try { localStorage.setItem('LOGGED_IN_UID', user.uid); } catch { /* ignore */ }
            }

            window.listenToSessionState?.();

            const savedUID = localStorage.getItem('TARGET_DOCTOR_UID')
                || await PersistentStore.get('TARGET_DOCTOR_UID');
            if (savedUID) {
                sessionStorage.setItem('TARGET_DOCTOR_UID', savedUID);
                localStorage.setItem('TARGET_DOCTOR_UID', savedUID);
            }
            window.studentStatusListener?.();
            window.sessionStatusListener?.();
            window.monitorMyParticipation?.();
            setTimeout(() => initPushNotifications(user.uid), 3000);
            setTimeout(() => refreshPushSubscription(user.uid), 5000);
            window.showSmartWelcome?.(name);
            setTimeout(() => window.checkForPendingSurveys?.(), 2500);

            const avatarClass = data.avatarClass || data.registrationInfo?.avatarClass || 'fa-user-graduate';
            if (profileIcon) profileIcon.className = `fa-solid ${avatarClass}`;
            if (profileWrap) profileWrap.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            if (statusDot) {
                statusDot.style.background = '#22c55e';
                statusDot.style.boxShadow = '0 0 10px #22c55e, 0 0 20px rgba(34,197,94,0.5)';
            }

            if (data.preferredLanguage) {
                UI.applyLanguage(data.preferredLanguage);
                document.querySelectorAll('.active-lang-text-pro').forEach(s => {
                    s.innerText = data.preferredLanguage === 'ar' ? 'EN' : 'عربي';
                });
            }
        } catch (e) { console.error('Auth state error:', e); }
    }

    function _handleUnverifiedUser({ profileWrap, profileIcon, statusDot }) {
        sessionStorage.clear();
        if (profileIcon) profileIcon.className = 'fa-solid fa-envelope-circle-check';
        if (profileWrap) profileWrap.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
        if (statusDot) statusDot.style.background = '#f59e0b';
    }

    async function _handleSignedOut({ drawerEl, profileWrap, profileIcon, statusDot }) {
        const uid = auth.currentUser?.uid;
        const sessionId = localStorage.getItem('CURRENT_SESSION_ID')
            || await PersistentStore.get('CURRENT_SESSION_ID');

        if (uid && sessionId) {
            try {
                await setDoc(
                    doc(db, 'active_users', uid, 'sessions', sessionId),
                    { isLoggedIn: false, logoutAt: serverTimestamp() },
                    { merge: true }
                );
            } catch (e) { console.warn('Session clear warning:', e); }
        }

        await PersistentStore.removeWithSync('CURRENT_SESSION_ID');
        await PersistentStore.removeWithSync('LOGGED_IN_UID');

        sessionStorage.clear();
        DeviceManager.clearVerifiedCache();
        if (window.studentStatusListener) { window.studentStatusListener(); window.studentStatusListener = null; }
        if (profileIcon) profileIcon.className = 'fa-solid fa-user-astronaut';
        if (profileWrap) profileWrap.style.background = 'rgba(15, 23, 42, 0.8)';
        if (statusDot) { statusDot.style.background = '#94a3b8'; statusDot.style.boxShadow = 'none'; }
        window.updateUIForMode?.();
    }

    async function performStudentSignup() {
        const _t = Utils._t;
        const fields = {
            email: Utils.$('regEmail')?.value.trim(),
            password: Utils.$('regPass')?.value,
            fullName: Utils.$('regFullName')?.value.trim(),
            studentID: Utils.$('regStudentID')?.value.trim(),
            level: Utils.$('regLevel')?.value,
            gender: Utils.$('regGender')?.value,
            group: Utils.$('regGroup')?.value || 'عام',
        };

        if (!fields.email || !fields.password || !fields.fullName || !fields.studentID || !fields.level || !fields.gender) {
            UI.showToast(_t('msg_missing_data', '⚠️ بيانات ناقصة! يرجى ملء كل الحقول واختيار الفرقة والنوع'), 3000, '#f59e0b');
            return;
        }
        if (fields.password.length < 6) {
            UI.showToast(_t('msg_weak_pass', '⚠️ كلمة المرور ضعيفة (6 أحرف على الأقل)'), 3000, '#f59e0b');
            return;
        }

        const btn = Utils.$('btnDoSignup');
        const originalHtml = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up fa-fade"></i> ${_t('status_connecting', 'جاري الاتصال...')}`;
        }

        try {
            const deviceID = await DeviceManager.getUniqueDeviceId();
            const res = await fetch(`${CFG.api.base}/api/registerStudent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...fields, deviceFingerprint: deviceID }),
            });
            const result = await res.json();

            if (!res.ok || !result.success) throw new Error(result.error || _t('error_security_fail', 'فشل التسجيل'));

            if (btn) btn.innerHTML = `<i class="fa-regular fa-envelope fa-bounce"></i> ${_t('status_sending_email', 'إرسال رابط التفعيل...')}`;

            try {
                const cred = await signInWithEmailAndPassword(auth, fields.email, fields.password); // غيرنا fields.pass إلى fields.password
                await sendEmailVerification(cred.user);
                await signOut(auth);
            } catch (emailErr) {
                console.warn('Email send warning:', emailErr);
                UI.showToast(_t('msg_email_fail', '⚠️ تم الحساب، لكن تعذر إرسال الإيميل'), 4000, '#f59e0b');
            }

            UI.showToast(_t('msg_account_created', '✅ تم إنشاء الحساب بنجاح!'), 4000, '#10b981');
            UI.closeAuthDrawer();
            UI.toggleAuthMode('login');

            const loginEmail = Utils.$('studentLoginEmail');
            if (loginEmail) loginEmail.value = fields.email;
            if (Utils.$('regPass')) Utils.$('regPass').value = '';
            if (Utils.$('regEmail')) Utils.$('regEmail').value = '';

            _showSignupSuccessModal(fields.studentID, fields.fullName);
        } catch (error) {
            let msg = error.message;
            if (msg.includes('email-already-in-use')) msg = _t('error_email_exists', 'هذا البريد مسجل بالفعل!');
            UI.showToast(`❌ ${msg}`, 5000, '#ef4444');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
        }
    }

    function _showSignupSuccessModal(studentID, fullName) {
        const _t = Utils._t;
        const firstName = fullName.split(' ')[0];
        const modal = Utils.$('signupSuccessModal');
        const title = Utils.$('successModalTitle');
        const body = Utils.$('successModalBody');

        if (title) title.innerText = `${_t('modal_welcome_title', '🎉 Welcome')} ${firstName}!`;
        if (body) body.innerHTML = `
            <div style="background:#f8fafc;padding:15px;border-radius:12px;margin-bottom:20px;border:1px dashed #cbd5e1;text-align:center;">
                <div style="font-size:12px;font-weight:bold;color:#64748b;margin-bottom:5px;">${_t('modal_id_reserved', 'تم حجز الكود الجامعي:')}</div>
                <div style="font-size:24px;font-weight:900;color:#0ea5e9;font-family:'Outfit',sans-serif;letter-spacing:1px;">${studentID}</div>
            </div>
            <p style="font-size:14px;color:#334155;margin-bottom:8px;">📨 ${_t('modal_email_sent', 'تم إرسال رابط تفعيل إلى بريدك الإلكتروني.')}</p>
            <div style="background:#fee2e2;color:#b91c1c;padding:10px;border-radius:8px;font-weight:bold;font-size:12px;display:flex;align-items:center;gap:8px;">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>${_t('modal_verify_warning', 'يرجى تفعيل الحساب من الإيميل قبل تسجيل الدخول.')}</span>
            </div>`;
        if (modal) modal.style.display = 'flex';
    }

    async function performStudentLogin() {
        const _t = Utils._t;
        const email = Utils.$('studentLoginEmail')?.value.trim();
        const pass = Utils.$('studentLoginPass')?.value;
        const btn = document.querySelector('#loginSection .btn-modern-action')
            || document.querySelector('#loginSection .btn-main');

        const originalHtml = btn?.innerHTML || 'Sign In';
        if (btn) {
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${_t('status_verifying', 'جاري التحقق...')}`;
            btn.disabled = true;
        }

        if (!email || !pass) {
            UI.showToast(_t('msg_enter_creds', '⚠️ أدخل الإيميل والباسورد'), 3000, '#f59e0b');
            if (btn) { btn.innerHTML = originalHtml; btn.disabled = false; }
            return;
        }

        try {
            const cred = await signInWithEmailAndPassword(auth, email, pass);
            const user = cred.user;
            const snap = await getDoc(doc(db, 'user_registrations', user.uid));

            const isManuallyVerified = snap.exists() && snap.data().status === 'verified';

            if (!user.emailVerified && !isManuallyVerified) {
                await signOut(auth);
                const vModal = Utils.$('verificationModal');
                if (vModal) { vModal.style.display = 'flex'; navigator.vibrate?.([200, 100, 200]); }
                else UI.showToast(_t('msg_email_not_verified', '⛔ حساب غير مفعل! راجع الإيميل.'), 5000, '#ef4444');
                return;
            }

            const sessionsSnap = await getDocs(
                query(
                    collection(db, 'active_users', user.uid, 'sessions'),
                    where('isLoggedIn', '==', true),
                    limit(1)
                )
            );
            if (!sessionsSnap.empty) {
                await signOut(auth);
                navigator.vibrate?.([300, 100, 300, 100, 300]);

                const activeSession = sessionsSnap.docs[0].data();
                const loginTime = activeSession.loginAt?.toDate?.();
                const timeStr = loginTime
                    ? loginTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                    : '--:--';

                try {
                    const deviceId = await DeviceManager.getUniqueDeviceId();
                    await addDoc(collection(db, 'security_violations'), {
                        uid: user.uid,
                        email,
                        type: 'multi_login_attempt',
                        attemptAt: serverTimestamp(),
                        deviceFingerprint: deviceId,
                        ipAddress: NetworkManager.getIP(),
                        deviceInfo: {
                            userAgent: navigator.userAgent,
                            platform: navigator.platform || 'Unknown',
                            screenSize: `${screen.width}x${screen.height}`,
                            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        },
                    });
                } catch (e) { console.warn('Violation log failed:', e); }

                const existingModal = document.getElementById('_multiLoginModal');
                if (existingModal) existingModal.remove();

                const modal = document.createElement('div');
                modal.id = '_multiLoginModal';
                modal.style.cssText = `
        position:fixed;inset:0;z-index:999999;
        background:rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
        padding:20px;
    `;
                modal.innerHTML = `
        <div style="
            background:var(--card-bg, #1e293b);
            border:1px solid #334155;
            border-radius:20px;
            padding:28px 24px;
            max-width:340px;
            width:100%;
            text-align:center;
            box-shadow:0 20px 60px rgba(0,0,0,0.4);
            direction:rtl;
        ">
            <i class="fa-solid fa-circle-exclamation"
               style="font-size:36px;color:#ef4444;margin-bottom:16px;display:block;"></i>

            <div style="
                color:var(--text-primary,#f1f5f9);
                font-size:16px;font-weight:800;
                margin-bottom:12px;
                font-family:'Outfit',sans-serif;
            ">الحساب مسجّل مسبقاً</div>

            <div style="
                color:var(--text-secondary,#94a3b8);
                font-size:13px;line-height:2;
                margin-bottom:6px;
            ">هذا الحساب مفتوح حالياً على جهاز أو متصفح آخر</div>

            <div style="
                color:#64748b;
                font-size:12px;
                margin-bottom:24px;
                direction:ltr;
            ">This account is active on another device or browser</div>

            <button onclick="document.getElementById('_multiLoginModal').remove()" style="
                width:100%;padding:13px;border:none;
                background:linear-gradient(135deg,#3b82f6,#2563eb);
                color:#fff;font-size:14px;font-weight:700;
                border-radius:12px;cursor:pointer;
                font-family:'Outfit',sans-serif;
            ">حسناً</button>
        </div>
    `;
                document.body.appendChild(modal);

                if (btn) { btn.innerHTML = originalHtml; btn.disabled = false; }
                return;
            }
            const sessionId = user.uid;
            await PersistentStore.setWithSync('CURRENT_SESSION_ID', sessionId);
            await PersistentStore.setWithSync('LOGGED_IN_UID', user.uid);

            const deviceId = await DeviceManager.getUniqueDeviceId();
            await setDoc(doc(db, 'active_users', user.uid, 'sessions', sessionId), {
                studentName: snap.data()?.registrationInfo?.fullName || snap.data()?.fullName || '',
                studentID: snap.data()?.registrationInfo?.studentID || snap.data()?.studentID || '',
                isLoggedIn: true,
                loginAt: serverTimestamp(),
                deviceFingerprint: deviceId,
                ipAddress: NetworkManager.getIP(),
                deviceInfo: {
                    userAgent: navigator.userAgent,
                    platform: navigator.platform || 'Unknown',
                    screenSize: `${screen.width}x${screen.height}`,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    brand: navigator.userAgentData?.brands?.[0]?.brand || 'Unknown',
                }
            }, { merge: true });

            if (snap.exists()) {
                const data = snap.data();
                const info = data.registrationInfo || data;
                _cacheProfile(user.uid, info, data);
                await _syncDeviceBinding(user.uid);
            }

            AuthManager.startSessionWatcher(user.uid, sessionId);

            UI.showToast(_t('msg_login_success', '🔓 تم تسجيل الدخول.. أهلاً بك'), 3000, '#10b981');
            UI.closeAuthDrawer();

        } catch (error) {
            UI.showToast(_resolveAuthError(error.code), 5000, '#ef4444');
            window.playBeep?.();
        } finally {
            if (btn) { btn.innerHTML = originalHtml; btn.disabled = false; }
        }
    }

    function _cacheProfile(uid, info, data) {
        const cache = {
            fullName: info.fullName, email: info.email, studentID: info.studentID,
            level: info.level, gender: info.gender, group: info.group || '',
            avatarClass: data.avatarClass || info.avatarClass || 'fa-user-graduate',
            status_message: data.status_message || '', uid, type: 'student',
        };
        const cacheStr = JSON.stringify(cache);
        localStorage.setItem('cached_profile_data', cacheStr);
        PersistentStore.set('cached_profile_data', cacheStr).catch(() => { });
    }

    async function _syncDeviceBinding(uid) {
        try {
            const deviceId = await DeviceManager.getUniqueDeviceId();
            await updateDoc(doc(db, 'user_registrations', uid), {
                bound_device_id: deviceId,
                device_bind_date: serverTimestamp(),
                last_device_sync: serverTimestamp(),
            });
        } catch (e) { console.warn('Device sync warning:', e); }
    }

    function _resolveAuthError(code) {
        const _t = Utils._t;
        const map = {
            'auth/user-not-found': _t('error_user_not_found', '❌ هذا البريد الإلكتروني غير مسجل لدينا!'),
            'auth/wrong-password': _t('error_wrong_pass', '❌ كلمة المرور غير صحيحة!'),
            'auth/invalid-credential': _t('error_invalid_cred', '❌ البريد الإلكتروني أو كلمة المرور غير صحيحة.'),
            'auth/invalid-email': _t('error_invalid_email', '⚠️ صيغة البريد الإلكتروني غير سليمة!'),
            'auth/user-disabled': _t('error_user_disabled', '⛔ تم تعطيل هذا الحساب من قبل الإدارة.'),
            'auth/too-many-requests': _t('error_too_many', '⏳ محاولات كثيرة! تم إيقاف الدخول مؤقتاً.'),
            'auth/network-request-failed': _t('error_network', '📡 فشل الاتصال! تأكد من الإنترنت.'),
        };
        return map[code] || `${_t('error_unknown', '❌ خطأ غير معروف')}: ${code}`;
    }

    function startSessionWatcher(uid, sessionId) {
        window.sessionWatcherUnsubscribe?.();

        window.sessionWatcherUnsubscribe = onSnapshot(
            doc(db, 'active_users', uid, 'sessions', sessionId),
            async (snap) => {
                if (!snap.exists()) return;
                const data = snap.data();

                if (data.isLoggedIn === false || data.forceLogout === true) {
                    window.sessionWatcherUnsubscribe?.();
                    window.sessionWatcherUnsubscribe = null;

                    await signOut(auth);
                    sessionStorage.clear();
                    await PersistentStore.removeWithSync('CURRENT_SESSION_ID');
                    await PersistentStore.removeWithSync('LOGGED_IN_UID');
                    await PersistentStore.removeWithSync('TARGET_DOCTOR_UID');
                    DeviceManager.clearVerifiedCache();

                    UI.showToast('⛔تم تسجيل خروجك ', 5000, '#ef4444');
                    navigator.vibrate?.([300, 100, 300]);
                    setTimeout(() => location.reload(), 2000);
                }
            },
            err => console.warn('Session watcher error:', err)
        );
    }

    async function performStudentLogout() {
        const uid = auth.currentUser?.uid;
        const sessionId = localStorage.getItem('CURRENT_SESSION_ID')
            || await PersistentStore.get('CURRENT_SESSION_ID');

        if (uid && sessionId) {
            try {
                await setDoc(
                    doc(db, 'active_users', uid, 'sessions', sessionId),
                    { isLoggedIn: false, logoutAt: serverTimestamp() },
                    { merge: true }
                );
            } catch (e) { console.warn('Logout write failed:', e); }
        }

        try { await unsubscribePush(uid); } catch { /* non-critical */ }


        window.sessionWatcherUnsubscribe?.();
        window.sessionWatcherUnsubscribe = null;
        await PersistentStore.removeWithSync('CURRENT_SESSION_ID');
        await PersistentStore.removeWithSync('LOGGED_IN_UID');
        await PersistentStore.removeWithSync('TARGET_DOCTOR_UID');
        await signOut(auth);
    }

    return { onAuthChange, performStudentSignup, performStudentLogin, startSessionWatcher, performStudentLogout };
})();


const SessionManager = (() => {
    const db = window.db;
    const auth = window.auth;

    async function monitorMyParticipation() {
        const user = auth.currentUser;
        const mainBtn = Utils.$('mainActionBtn');
        if (!user) return;

        let targetDoctorUID = localStorage.getItem('TARGET_DOCTOR_UID')
            || await PersistentStore.get('TARGET_DOCTOR_UID');

        if (!targetDoctorUID) {
            if (mainBtn) {
                mainBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> جاري المزامنة...';
                mainBtn.style.opacity = '0.7';
                mainBtn.style.pointerEvents = 'none';
            }
            targetDoctorUID = await _recoverActiveSession(user.uid);
            if (!targetDoctorUID) { UI.setMainButton('register'); return; }
        } else {
            if (mainBtn) {
                mainBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> جاري المزامنة...';
                mainBtn.style.opacity = '0.7';
                mainBtn.style.pointerEvents = 'none';
            }
            try {
                const [sessionSnap, pSnap] = await Promise.all([
                    getDoc(doc(db, 'active_sessions', targetDoctorUID)),
                    getDoc(doc(db, 'active_sessions', targetDoctorUID, 'participants', user.uid)),
                ]);
                const isValidSession = sessionSnap.exists() && sessionSnap.data().isActive;
                const isActiveParticipant = pSnap.exists() && pSnap.data().status === 'active';
                if (!isValidSession || !isActiveParticipant) {
                    await PersistentStore.removeWithSync('TARGET_DOCTOR_UID');
                    localStorage.removeItem('TARGET_DOCTOR_UID');
                    sessionStorage.removeItem('TARGET_DOCTOR_UID');
                    targetDoctorUID = await _recoverActiveSession(user.uid);
                    if (!targetDoctorUID) { UI.setMainButton('register'); return; }
                }
            } catch (e) { console.warn('Session validation warning:', e); }
        }

        localStorage.setItem('TARGET_DOCTOR_UID', targetDoctorUID);
        sessionStorage.setItem('TARGET_DOCTOR_UID', targetDoctorUID);

        window.studentStatusListener?.();
        window.sessionStatusListener?.();

        window.sessionStatusListener = onSnapshot(
            doc(db, 'active_sessions', targetDoctorUID),
            snap => {
                if (!snap.exists() || !snap.data().isActive) {
                    PersistentStore.removeWithSync('TARGET_DOCTOR_UID');
                    UI.setMainButton('register');
                    window.studentStatusListener?.();
                    window.studentStatusListener = null;
                }
            },
        );

        let _pollInterval = null;

        async function _pollStatus() {
            try {
                const snap = await getDoc(
                    doc(db, 'active_sessions', targetDoctorUID, 'participants', user.uid)
                );
                _handleParticipantChange(snap, targetDoctorUID);
            } catch (e) { console.warn('Poll error:', e); }
        }

        _pollStatus();
        _pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible') _pollStatus();
        }, 10_000);

        window.studentStatusListener = () => {
            clearInterval(_pollInterval);
            _pollInterval = null;
        };
    }

    async function _recoverActiveSession(uid) {
        // ① الطريقة الجديدة السريعة
        try {
            const snap = await getDoc(doc(db, 'user_registrations', uid));
            const liveState = snap.data()?.liveState;

            if (liveState?.status === 'active' && liveState?.doctorUID) {
                const sessionSnap = await getDoc(
                    doc(db, 'active_sessions', liveState.doctorUID)
                );
                if (sessionSnap.exists() && sessionSnap.data().isActive) {
                    await PersistentStore.setWithSync('TARGET_DOCTOR_UID', liveState.doctorUID);
                    return liveState.doctorUID;
                }
            }
        } catch (e) {
            console.warn('Fast recovery failed, trying fallback:', e);
        }

        try {
            const q = query(
                collection(db, 'active_sessions'),
                where('isActive', '==', true),
                limit(20)
            );
            const snap = await getDocs(q);
            for (const s of snap.docs) {
                const pSnap = await getDoc(
                    doc(db, 'active_sessions', s.id, 'participants', uid)
                );
                if (pSnap.exists() && pSnap.data().status === 'active') {
                    await PersistentStore.setWithSync('TARGET_DOCTOR_UID', s.id);
                    return s.id;
                }
            }
        } catch (e) {
            console.error('Fallback recovery error:', e);
        }

        return null;
    }

    function _handleParticipantChange(snap, doctorUID) {
        if (!snap.exists()) {
            sessionStorage.removeItem('TARGET_DOCTOR_UID');
            localStorage.removeItem('TARGET_DOCTOR_UID');
            PersistentStore.removeWithSync('TARGET_DOCTOR_UID');
            UI.setMainButton('register');
            if (document.querySelector('.section.active')?.id === 'screenLiveSession') {
                UI.showToast('⚠️ تم إغلاق الجلسة أو إخراجك منها', 4000, '#f59e0b');
                window.goHome?.();
            }
            return;
        }

        const { status } = snap.data();

        if (status === 'expelled') {
            _handleExpulsion();
            return;
        }
        if (status === 'on_break') {
            _handleBreak();
            return;
        }
        if (status === 'active') {
            Utils.$('breakModal') && (Utils.$('breakModal').style.display = 'none');
            sessionStorage.setItem('TARGET_DOCTOR_UID', doctorUID);
            UI.setMainButton('enter');
        }
    }

    function _handleExpulsion() {
        const _t = Utils._t;
        window.studentStatusListener?.();
        window.studentStatusListener = null;
        sessionStorage.removeItem('TARGET_DOCTOR_UID');
        PersistentStore.removeWithSync('TARGET_DOCTOR_UID');
        UI.setMainButton('register');

        const liveScreen = Utils.$('screenLiveSession');
        if (liveScreen) { liveScreen.style.setProperty('display', 'none', 'important'); liveScreen.classList.remove('active'); }
        window.goHome?.();

        const exModal = Utils.$('expulsionModal');
        const exTitle = Utils.$('expelTitle');
        const exBody = Utils.$('expelBody');
        if (exTitle) exTitle.innerText = _t('modal_expel_title', '⛔ You have been expelled!');
        if (exBody) exBody.innerHTML = _t('modal_expel_body', 'The instructor has removed you from this session.<br>You cannot rejoin.');
        if (exModal) {
            exModal.style.setProperty('display', 'flex', 'important');
            const btn = exModal.querySelector('button') || exModal.querySelector('.btn-danger');
            if (btn) { btn.innerHTML = _t('btn_leave_hall', 'Leave Hall ➜'); btn.onclick = () => { exModal.style.display = 'none'; window.location.reload(); }; }
            navigator.vibrate?.([500, 200, 500]);
        } else {
            alert(_t('modal_expel_title', '⛔ You have been expelled!'));
            window.location.reload();
        }
    }

    function _handleBreak() {
        sessionStorage.removeItem('TARGET_DOCTOR_UID');
        UI.setMainButton('register');
        window.unsubscribeLiveSnapshot?.();
        window.unsubscribeLiveSnapshot = null;
        const live = Utils.$('screenLiveSession');
        if (live) { live.style.cssText = ''; live.style.setProperty('display', 'none', 'important'); }
        UI.switchScreen('screenWelcome');
        UI.showToast('⏸️ استراحة: يرجى تسجيل الدخول مجدداً عند الاستئناف', 4000, '#f59e0b');
    }

    async function searchForSession() {
        const codeInput = Utils.$('attendanceCode');
        const btn = Utils.$('btnSearchSession');
        const code = codeInput?.value.trim();
        if (!code) { UI.showToast('⚠️ Please enter session PIN', 3000, '#f59e0b'); return; }

        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> SEARCHING...';
        btn.style.pointerEvents = 'none';

        try {
            const q = query(collection(db, 'active_sessions'),
                where('sessionCode', '==', code),
                where('isActive', '==', true),
                where('isDoorOpen', '==', true));
            const snap = await getDocs(q);

            if (snap.empty) {
                const checkSnap = await getDocs(query(collection(db, 'active_sessions'), where('sessionCode', '==', code)));
                UI.showToast(checkSnap.empty ? '❌ Invalid Session PIN' : '🔒 Session is currently CLOSED', 4000, '#ef4444');
                return;
            }

            const sessionDoc = snap.docs[0];
            const sessionData = sessionDoc.data();
            const doctorUID = sessionDoc.id;

            if (sessionData.startTime) {
                const doorOpenMs = sessionData.startTime.toMillis();
                const codeDeadlineMs = doorOpenMs + 20_000;
                const entryStarted = window._codeEntryStarted;

                if (!entryStarted || entryStarted > codeDeadlineMs) {
                    UI.showToast('⏰ انتهى وقت إدخال الكود', 4000, '#ef4444');
                    navigator.vibrate?.([300, 100, 300]);
                    btn.innerHTML = originalHtml;
                    btn.style.pointerEvents = 'auto';
                    window._codeEntryStarted = null;
                    return;
                }
            }
            window._codeEntryStarted = null;

            sessionStorage.setItem('TEMP_DR_UID', doctorUID);
            window.stopCodeEntryIdleTimer?.();
            _populateSessionUI(sessionData);

            const noPassword = !sessionData.sessionPassword?.trim();
            _showStep(2);
            if (noPassword) {
                setTimeout(() => joinSessionAction(), 300);
            } else {
                window.renderPasswordChoices?.(sessionData);
            }

            window.startAuthScreenTimer?.(doctorUID);
        } catch (e) {
            console.error('Search error:', e);
            const isAr = Utils.lang() === 'ar';
            UI.showToast(isAr ? '📡 لا يوجد اتصال، تأكد من النت' : '📡 No connection, check your network', 4000, '#ef4444');
        } finally {
            btn.innerHTML = originalHtml;
            btn.style.pointerEvents = 'auto';
        }
    }

    function _populateSessionUI(data) {
        const docName = Utils.$('foundDocName');
        const subName = Utils.$('foundSubjectName');
        const avatar = Utils.$('foundDocAvatar');
        if (docName) { docName.innerText = `Dr. ${data.doctorName || 'Unknown'}`; docName.style.fontFamily = "'Outfit', sans-serif"; }
        if (subName) { subName.innerText = data.allowedSubject || '--'; subName.style.fontFamily = "'Outfit', sans-serif"; }
        if (avatar && data.doctorAvatar) avatar.innerHTML = `<i class="fa-solid ${data.doctorAvatar}"></i>`;
    }

    function _showStep(step) {
        Utils.$('step1_search')?.style.setProperty('display', step === 1 ? 'block' : 'none');
        const step2 = Utils.$('step2_auth');
        if (step2) {
            step2.style.display = step === 2 ? 'block' : 'none';
            if (step === 2) step2.classList.add('active');
            else step2.classList.remove('active');
        }
    }

    function resetSearchSession() {
        window._codeEntryStarted = null;
        _showStep(1);
        Utils.$('step1_search').style.cssText = 'display:block;opacity:1;visibility:visible;';
        const passInput = Utils.$('sessionPass');
        const codeInput = Utils.$('attendanceCode');
        if (passInput) passInput.value = '';
        if (codeInput) codeInput.value = '';
        Utils.$('screenError') && (Utils.$('screenError').style.display = 'none');
        window.startCodeEntryIdleTimer?.();
    }

    async function joinSessionAction() {
        const passInput = Utils.$('sessionPass')?.value.trim();
        const btn = Utils.$('btnJoinFinal');
        const doctorUID = sessionStorage.getItem('TEMP_DR_UID');
        const user = auth.currentUser;

        if (!user) { UI.showToast('❌ يجب تسجيل الدخول أولاً', 3000, '#ef4444'); return; }
        if (!doctorUID) {
            UI.showToast('⚠️ حدث خطأ في بيانات الجلسة، يرجى البحث مجدداً', 4000, '#f59e0b');
            resetSearchSession();
            return;
        }

        window.isJoiningProcessActive = true;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying & Joining...';
        btn.style.pointerEvents = 'none';

        try {
            const [sessionSnap, gpsData, deviceFingerprint, idToken, sensSnap] = await Promise.all([
                getDoc(doc(db, 'active_sessions', doctorUID)),
                GPSManager.getGPSForJoin(),
                DeviceManager.getUniqueDeviceId(),
                user.getIdToken(),
                getDoc(doc(db, 'user_registrations', user.uid, 'sensitive_info', 'main')),
            ]);

            if (!sessionSnap.exists()) throw new Error('⛔ الجلسة غير موجودة');
            const sessionData = sessionSnap.data();
            if (!sessionData.isActive || !sessionData.isDoorOpen) throw new Error('🔒 عذراً، الجلسة مغلقة حالياً.');

            const isDeviceMatch = await _verifyOrBindDevice(sensSnap, deviceFingerprint, user.uid);

            await AuditManager.sendSecretLog(db, user, sessionData, {
                deviceFingerprint, isDeviceMatch,
                userIP: NetworkManager.getIP(),
                gpsData,
            });

            const res = await fetch(`${CFG.api.base}/joinSessionSecure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({
                    studentUID: user.uid, sessionDocID: doctorUID,
                    gpsLat: gpsData.lat || 0, gpsLng: gpsData.lng || 0,
                    deviceFingerprint, isDeviceMatch, codeInput: sessionData.sessionCode,
                    patternPath: window._currentPatternPath || [], // ✅
                }),
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || 'تم رفض الدخول من قبل النظام الأمني');

            window.stopCodeEntryIdleTimer?.();
            UI.showToast(`✅ ${result.message}`, 3000, '#10b981');

            await PersistentStore.setWithSync('TARGET_DOCTOR_UID', doctorUID);
            sessionStorage.setItem('TEMP_DR_UID', '');
            sessionStorage.removeItem('TEMP_DR_UID');

            _incrementAttendanceCache(user.uid);
            _populateLiveSessionUI(sessionData);

            UI.setMainButton('enter');
            setTimeout(() => window.monitorMyParticipation?.(), 100);
            clearTimeout(window._patternTimer);
            window._patternAttempts = 0;
            UI.switchScreen('screenLiveSession');
            window.startLiveSnapshotListener?.();

        } catch (e) {
            console.error('Join session error:', e);
            window.isJoiningProcessActive = false;
            let msg = e.message;
            if (msg.includes('Failed to fetch')) msg = 'فشل الاتصال بالسيرفر! تأكد من الإنترنت.';
            UI.showToast(['❌', '⛔', '🔒'].some(p => msg.startsWith(p)) ? msg : `⚠️ ${msg}`, 4000, '#ef4444');
            if (msg.includes('غير موجودة') || msg.includes('مغلقة')) setTimeout(() => location.reload(), 1500);
            throw e; // ← ده اللي بيخلي .catch() في onEnd يشتغل
        } finally {
            if (document.querySelector('.section.active')?.id !== 'screenLiveSession') {
                btn.innerHTML = originalHtml;
                btn.style.pointerEvents = 'auto';
            }
        }
    }

    async function _verifyOrBindDevice(sensSnap, fingerprint, uid) {
        try {
            if (!sensSnap.exists()) return true;
            const data = sensSnap.data();
            let allowed = data.allowed_devices || (data.bound_device_id ? [data.bound_device_id] : []);
            if (allowed.includes(fingerprint)) return true;
            if (allowed.length < 2) {
                allowed.push(fingerprint);
                await setDoc(doc(db, 'user_registrations', uid, 'sensitive_info', 'main'),
                    { allowed_devices: allowed, second_device_added_at: serverTimestamp() }, { merge: true });
                return true;
            }
            return false;
        } catch (e) { console.error('Device security sync error:', e); return true; }
    }

    function _incrementAttendanceCache(uid) {
        try {
            const raw = localStorage.getItem('cached_profile_data');
            if (!raw) return;
            const obj = JSON.parse(raw);
            if (obj.uid === uid) {
                obj.attendanceCount = (obj.attendanceCount || 0) + 1;
                const updated = JSON.stringify(obj);
                localStorage.setItem('cached_profile_data', updated);
                PersistentStore.set('cached_profile_data', updated).catch(() => { });
            }
        } catch { }
    }

    function _populateLiveSessionUI(data) {
        const name = Utils.$('liveDocName');
        const subject = Utils.$('liveSubjectTag');
        const avatar = Utils.$('liveDocAvatar');
        if (name) name.innerText = data.doctorName || 'Professor';
        if (subject) subject.innerText = data.allowedSubject || 'Subject';
        if (avatar && data.doctorAvatar) avatar.innerHTML = `<i class="fa-solid ${data.doctorAvatar}"></i>`;
    }

    return { monitorMyParticipation, searchForSession, resetSearchSession, joinSessionAction };
})();


function startAuthScreenTimer(doctorUID) {
    const db = window.db;
    const display = Utils.$('authTimerDisplay');
    const pill = document.querySelector('.auth-timer-pill');
    const _t = Utils._t;

    window.authUnsubscribe?.();
    window.authUnsubscribe = null;
    clearInterval(window.localTicker);
    window.localTicker = null;

    const sessionRef = doc(db, 'active_sessions', doctorUID);

    window.authUnsubscribe = onSnapshot(sessionRef, snap => {
        if (!snap.exists()) { _endSession(_t, '⛔ Session ended by instructor.'); return; }
        const data = snap.data();
        if (!data.isActive || !data.isDoorOpen) {
            if (window.isJoiningProcessActive) return;
            _endSession(_t, '🔒 Registration closed by lecturer.');
            return;
        }
        if (data.duration === -1) {
            clearInterval(window.localTicker);
            _updateTimerUI(display, pill, 'OPEN', 'normal');
            return;
        }

        const serverReadMs = snap.readTime ? snap.readTime.toMillis() : Date.now();
        const offset = serverReadMs - Date.now();
        const startMs = data.startTime ? data.startTime.toMillis() : serverReadMs;
        const deadline = startMs + data.duration * 1000;

        clearInterval(window.localTicker);
        _runTick(deadline, offset, display, pill, _t);
        window.localTicker = setInterval(() => _runTick(deadline, offset, display, pill, _t), 1000);
    }, err => console.error('Timer listener error:', err));

    function _runTick(deadline, offset, display, pill, _t) {
        const remaining = Math.floor((deadline - (Date.now() + offset)) / 1000);
        if (remaining <= 0) {
            clearInterval(window.localTicker);
            if (window.isJoiningProcessActive) return;
            _updateTimerUI(display, pill, '0s', 'urgent');
            window.authUnsubscribe?.();
            window.authUnsubscribe = null;
            UI.showToast(_t('toast_session_timer_ended', '⏰ Time is up! Entrance period has ended.'), 4000, '#ef4444');
            setTimeout(() => location.reload(), 3000);
            return;
        }
        _updateTimerUI(display, pill, `${remaining}s`, remaining <= 10 ? 'urgent' : 'normal');
    }

    function _updateTimerUI(display, pill, text, mode) {
        if (display) display.innerText = text;
        if (!pill) return;
        pill.classList.remove('urgent-mode');
        pill.style.cssText = '';
        if (mode === 'urgent') { pill.classList.add('urgent-mode'); }
        else if (text === 'OPEN') {
            pill.style.background = '#ecfdf5';
            pill.style.color = '#10b981';
            pill.style.borderColor = '#a7f3d0';
        }
    }

    function _endSession(_t, msg) {
        window.authUnsubscribe?.();
        clearInterval(window.localTicker);
        UI.showToast(_t('toast_session_closed_manual', msg), 4000, '#ef4444');
        setTimeout(() => location.reload(), 2500);
    }
}


const ProfileManager = (() => {
    const db = window.db;
    const auth = window.auth;

    async function openStudentProfile(forceRefresh = false) {
        const user = auth.currentUser;
        Utils.$('infoBtn') && (Utils.$('infoBtn').style.display = 'none');
        if (!user) { UI.showToast('⚠️ يرجى تسجيل الدخول أولاً', 3000, '#f59e0b'); return; }

        const modal = Utils.$('studentProfileModal');
        if (modal) { modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10); }

        _renderFromCache(user.uid);

        const statsCacheKey = `stats_cache_${user.uid}`;
        const cachedStats = Utils.safeJsonParse(localStorage.getItem(statsCacheKey));
        if (cachedStats && !forceRefresh && (Date.now() - cachedStats.timestamp) < CFG.ui.statsCacheTTL) {
            _renderStats(cachedStats); return;
        }

        _showStatsLoading();
        try {
            const snap = await getDoc(doc(db, 'user_registrations', user.uid));
            if (!snap.exists()) return;
            const data = snap.data();
            const info = data.registrationInfo || data;
            _renderProfileInfo(user, info, data);
            const stats = await _computeStats(user.uid, info.group);
            _renderStats(stats);
            localStorage.setItem(statsCacheKey, JSON.stringify({ ...stats, timestamp: Date.now() }));
        } catch (e) {
            console.error('Profile load error:', e);
            Utils.$('profAttendanceVal').innerText = '?';
            Utils.$('profAbsenceVal').innerText = '?';
        }
    }

    function _renderFromCache(uid) {
        const raw = localStorage.getItem('cached_profile_data');
        if (!raw) return;
        const d = Utils.safeJsonParse(raw);
        if (!d || d.uid !== uid) return;
        Utils.$('profFullName').innerText = d.fullName || '--';
        Utils.$('profStudentID').innerText = d.studentID || '--';
        Utils.$('profLevel').innerText = `الفرقة ${d.level || '?'}`;
        Utils.$('profGender').innerText = d.gender || '--';
        Utils.$('profEmail').innerText = d.email || '--';
        _setCollegeRole(d.group, d.college);
        const av = Utils.$('currentAvatar');
        if (av) { av.innerHTML = `<i class="fa-solid ${d.avatarClass || 'fa-user-graduate'}"></i>`; av.style.color = 'var(--primary-dark)'; }
    }

    function _renderProfileInfo(user, info, data) {
        Utils.$('profFullName').innerText = info.fullName || '--';
        Utils.$('profStudentID').innerText = info.studentID || '--';
        Utils.$('profLevel').innerText = `الفرقة ${info.level || '?'}`;
        Utils.$('profGender').innerText = info.gender || '--';
        Utils.$('profEmail').innerText = info.email || user.email || '--';
        _setCollegeRole(info.group, data.college || info.college);
        const av = Utils.$('currentAvatar');
        if (av) { av.innerHTML = `<i class="fa-solid ${data.avatarClass || info.avatarClass || 'fa-user-graduate'}"></i>`; av.style.color = 'var(--primary-dark)'; }
    }

    function _setCollegeRole(group = '', collegeCode = '') {
        const letter = collegeCode
            ? (CFG.colleges.codeMap[collegeCode] || group[1]?.toUpperCase() || 'N')
            : (group.length >= 2 ? group[1].toUpperCase() : 'N');
        const roleEl = document.querySelector('.pro-role');
        if (roleEl) roleEl.innerHTML =
            `<span style="font-size:13px;font-weight:800;">${CFG.colleges.nameMap[letter] || 'Nursing'} Student</span><br>` +
            `<span style="font-size:13px;color:#0ea5e9;font-weight:900;background:#e0f2fe;padding:2px 10px;border-radius:20px;display:inline-block;margin-top:4px;">${group || '--'}</span>`;
    }

    async function _computeStats(uid, rawGroup) {
        const group = rawGroup?.trim() || 'General';
        const normalizeStr = s => s.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '').toLowerCase();

        const q = query(collection(db, 'course_counters'), where('targetGroups', 'array-contains', group));
        const [myStatsSnap, countersSnap] = await Promise.all([
            getDoc(doc(db, 'student_stats', uid)),
            getDocs(q),
        ]);

        let attended = {};
        let discipline = 'good';
        if (myStatsSnap.exists()) {
            const d = myStatsSnap.data();
            attended = d.attended || {};
            if (d.cumulative_unruly >= 3) discipline = 'bad';
            else if (d.cumulative_unruly > 0) discipline = 'warning';
        }

        const heldMap = {};
        countersSnap.forEach(d => {
            const s = d.data().subject.trim();
            heldMap[s] = (heldMap[s] || 0) + 1;
        });

        let totalAttendance = 0, totalAbsence = 0;
        for (const [subject, heldCount] of Object.entries(heldMap)) {
            let studentCount = 0;
            const tNorm = normalizeStr(subject);
            for (const [k, v] of Object.entries(attended)) {
                if (normalizeStr(k) === tNorm) { studentCount = v; break; }
            }
            totalAttendance += studentCount;
            totalAbsence += Math.max(0, heldCount - studentCount);
        }
        return { attendance: totalAttendance, absence: totalAbsence, discipline };
    }

    function _showStatsLoading() {
        Utils.$('profAttendanceVal').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:14px"></i>';
        Utils.$('profAbsenceVal').innerHTML = '-';
        Utils.$('profDisciplineVal').innerHTML = '-';
    }

    function _renderStats({ attendance, absence, discipline }) {
        Utils.$('profAttendanceVal').innerText = attendance;
        Utils.$('profAbsenceVal').innerText = absence;
        const el = Utils.$('profDisciplineVal');
        if (!el) return;
        const map = { bad: ['مشاغب', '#ef4444'], warning: ['تنبيه', '#f59e0b'], good: ['ملتزم', '#10b981'] };
        const [text, color] = map[discipline] || map.good;
        el.innerText = text;
        el.style.color = color;
    }

    async function openAvatarSelector() {
        const user = auth.currentUser;
        if (!user) return;
        const grid = Utils.$('avatarsGrid');
        if (!grid) return;

        let gender = 'Male';
        try {
            const snap = await getDoc(doc(db, 'user_registrations', user.uid));
            if (snap.exists()) gender = snap.data().registrationInfo?.gender || snap.data().gender || 'Male';
        } catch { }

        grid.innerHTML = '';
        const icons = CFG.avatars[gender] || CFG.avatars.Male;
        icons.forEach((iconClass, i) => {
            const color = CFG.avatarColors[i % CFG.avatarColors.length];
            const item = Object.assign(document.createElement('div'), { className: 'avatar-option-modern' });
            item.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            Object.assign(item.style, { color, borderColor: `${color}40`, backgroundColor: `${color}10` });
            item.onclick = () => saveNewAvatar(iconClass, color);
            grid.appendChild(item);
        });

        const modal = Utils.$('avatarSelectorModal');
        if (modal) { modal.style.zIndex = '2147483647'; modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10); }
    }

    async function saveNewAvatar(iconClass, color) {
        const user = auth.currentUser;
        if (!user) return;

        const el = Utils.$('currentAvatar');
        if (el) {
            el.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            if (color) { el.style.color = color; el.style.borderColor = color; el.style.backgroundColor = `${color}10`; }
        }
        Utils.$('avatarSelectorModal').style.display = 'none';

        try {
            await setDoc(doc(db, 'user_registrations', user.uid), { avatarClass: iconClass }, { merge: true });
            const raw = localStorage.getItem('cached_profile_data');
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj.uid === user.uid) {
                    obj.avatarClass = iconClass;
                    const updated = JSON.stringify(obj);
                    localStorage.setItem('cached_profile_data', updated);
                    PersistentStore.set('cached_profile_data', updated).catch(() => { });
                }
            }
            UI.showToast('✅ تم تحديث صورتك بنجاح', 2000, '#10b981');
        } catch (e) { UI.showToast('❌ فشل حفظ التغييرات', 3000, '#ef4444'); }
    }

    async function autoFetchName(studentId) {
        const nameInput = Utils.$('regFullName');
        const signupBtn = Utils.$('btnDoSignup');
        if (!nameInput) return;

        nameInput.value = '';
        nameInput.placeholder = 'جاري التحقق أمنياً...';
        const cleanId = studentId.toString().trim();
        if (!cleanId || cleanId.length < 4) { nameInput.placeholder = 'Full Name'; return; }

        try {
            const lockSnap = await getDoc(doc(db, 'taken_student_ids', cleanId));
            if (lockSnap.exists()) {
                nameInput.value = '⚠️ الكود محجوز لحساب آخر';
                nameInput.style.color = '#ef4444';
                if (signupBtn) signupBtn.disabled = true;
                return;
            }
            const stdSnap = await getDoc(doc(db, 'students', cleanId));
            if (stdSnap.exists()) {
                nameInput.value = stdSnap.data().name;
                nameInput.style.color = '#0f172a';
                nameInput.placeholder = '';
            } else {
                nameInput.value = '❌ كود غير مسجل';
                nameInput.style.color = '#b91c1c';
            }
        } catch { nameInput.value = '⚠️ اعد المحاولة'; }
        finally { UI.validateSignupForm(); }
    }

    return { openStudentProfile, openAvatarSelector, saveNewAvatar, autoFetchName };
})();


const FeedbackManager = (() => {
    const db = window.db;
    const auth = window.auth;

    async function checkForPendingSurveys() {
        const user = auth.currentUser;
        if (!user || user.uid === CFG.firebase.excludedUID) return;

        try {
            const userDoc = await getDoc(doc(db, 'user_registrations', user.uid));
            const studentCode = userDoc.data()?.registrationInfo?.studentID || userDoc.data()?.studentID;
            if (!studentCode) return;

            const q = query(collection(db, 'attendance'),
                where('id', '==', studentCode),
                where('feedback_status', '==', 'pending'),
                limit(1));
            const snap = await getDocs(q);
            if (snap.empty) return;

            const pending = snap.docs[0];
            const localKey = `fd_${pending.id}`;

            if (localStorage.getItem(localKey)) {
                try {
                    await updateDoc(doc(db, 'attendance', pending.id), {
                        feedback_status: 'dismissed',
                        dismissed_at: serverTimestamp(),
                    });
                } catch { }
                return;
            }

            _showFeedbackModal(pending.id, pending.data());
        } catch (e) { console.error('Survey check error:', e); }
    }

    function _showFeedbackModal(docId, data) {
        Utils.$('feedbackSubjectName').innerText = data.subject || 'محاضرة';
        Utils.$('feedbackDocName').innerText = data.doctorName || 'الكلية';
        Utils.$('targetAttendanceDocId').value = docId;
        selectStar(0);
        Utils.$('feedbackModal').style.display = 'flex';
        _injectSkipButton();
    }

    function _injectSkipButton() {
        const modal = Utils.$('feedbackModal');
        if (!modal || modal.querySelector('.btn-skip-feedback')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-skip-feedback';
        Object.assign(btn.style, {
            display: 'block', margin: '10px auto 0', background: 'none',
            border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer',
            padding: '6px 12px', borderRadius: '8px', transition: 'color 0.2s',
            borderBottom: '0.5px solid #cbd5e1',
        });
        btn.innerText = Utils.lang() === 'ar' ? 'لا شكراً، ربما لاحقاً' : 'No thanks, maybe later';
        btn.onmouseenter = () => { btn.style.color = 'var(--color-text-secondary)'; };
        btn.onmouseleave = () => { btn.style.color = '#94a3b8'; };
        btn.onclick = dismissFeedback;

        const submitBtn = modal.querySelector('.btn-main');
        submitBtn?.parentNode?.insertBefore(btn, submitBtn.nextSibling) ?? modal.appendChild(btn);
    }

    async function dismissFeedback() {
        const docId = Utils.$('targetAttendanceDocId')?.value;
        UI.closeModal('feedbackModal');
        if (!docId) return;

        UI.showToast('تم تخطي التقييم', 2000, '#64748b');

        try {
            const uid = auth.currentUser?.uid || 'unknown';
            const token = await Utils.hashString(`${docId}${uid}dismiss_v1`);
            localStorage.setItem(`fd_${docId}`, JSON.stringify({ ts: Date.now(), token }));
        } catch {
            localStorage.setItem(`fd_${docId}`, JSON.stringify({ ts: Date.now() }));
        }

        try {
            await updateDoc(doc(db, 'attendance', docId), {
                feedback_status: 'dismissed',
                dismissed_at: serverTimestamp(),
            });
        } catch (e) {
            console.warn('Dismiss Firestore sync failed — local cache active:', e.code || e.message);
        }

        setTimeout(() => checkForPendingSurveys(), 600);
    }

    function selectStar(val) {
        const dict = i18n[Utils.lang()] || {};
        const texts = ['', dict.rate_bad, dict.rate_poor, dict.rate_fair, dict.rate_good, dict.rate_excellent];
        document.querySelectorAll('.star-btn').forEach(star => {
            star.classList.toggle('active', parseInt(star.getAttribute('data-value')) <= val);
        });
        const textEl = Utils.$('ratingText');
        if (textEl) {
            textEl.innerText = texts[val] || '';
            textEl.style.animation = 'none';
            setTimeout(() => { textEl.style.animation = 'fadeIn 0.3s'; }, 10);
        }
        Utils.$('selectedRating').value = val;
        navigator.vibrate?.(20);
    }

    async function submitFeedback() {
        const rating = Utils.$('selectedRating')?.value;
        const docId = Utils.$('targetAttendanceDocId')?.value;
        const btn = document.querySelector('#feedbackModal .btn-main');

        if (!rating || rating === '0') { UI.showToast('⚠️ من فضلك قيم بعدد النجوم', 2000, '#f59e0b'); return; }

        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التوثيق...';
        btn.style.pointerEvents = 'none';

        try {
            const attRef = doc(db, 'attendance', docId);
            const attSnap = await getDoc(attRef);
            if (!attSnap.exists()) throw new Error('بيانات الحضور غير موجودة');
            const room = attSnap.data();

            const batch = writeBatch(db);
            batch.update(attRef, { feedback_status: 'submitted', feedback_timestamp: serverTimestamp() });
            batch.set(doc(collection(db, 'feedback_reports')), {
                rating: parseInt(rating), comment: '', timestamp: serverTimestamp(),
                doctorName: room.doctorName, doctorUID: room.doctorUID, subject: room.subject,
                hall: room.hall || 'Unknown', date: room.date, studentId: room.id, studentLevel: 'General',
            });
            await batch.commit();

            try { localStorage.removeItem(`fd_${docId}`); } catch { /* non-critical */ }

            UI.closeModal('feedbackModal');
            UI.showToast('✅ تم وصول تقييمك للإدارة بخصوصية تامة.', 3000, '#10b981');
            setTimeout(() => checkForPendingSurveys(), 1000);
        } catch (e) {
            console.error('Feedback submit error:', e);
            UI.showToast('❌ تعذر الإرسال، حاول مرة أخرى', 3000, '#ef4444');
        } finally {
            btn.innerHTML = 'إرسال التقييم <i class="fa-solid fa-paper-plane"></i>';
            btn.style.pointerEvents = 'auto';
        }
    }

    return { checkForPendingSurveys, selectStar, submitFeedback, dismissFeedback };
})();


const SmartSearch = (() => {
    const db = window.db;

    async function startSmartSearch() {
        const rawInput = Utils.$('makaniInput')?.value.trim();
        const content = Utils.$('makaniContent');
        const modal = Utils.$('makaniResultsModal');
        const btn = Utils.$('btnMakani');
        const _t = Utils._t;
        if (!rawInput) return;

        const q = Utils.smartNormalize(rawInput);
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        content.innerHTML = `<div style="padding:30px;text-align:center;">
            <i class="fa-solid fa-wand-magic-sparkles fa-bounce" style="font-size:40px;color:#0ea5e9;"></i>
            <p>${_t('processing_text', 'جاري البحث في الكلية...')}</p>
        </div>`;
        modal.style.display = 'flex';

        try {
            const results = [];
            const sessions = await getDocs(query(collection(db, 'active_sessions'), where('isActive', '==', true)));

            for (const sessionDoc of sessions.docs) {
                const data = { ...sessionDoc.data() };
                const docId = sessionDoc.id;
                const normSub = Utils.smartNormalize(data.allowedSubject || '');
                const groups = Array.isArray(data.targetGroups) ? data.targetGroups : [];
                const groupHit = groups.some(g => Utils.smartNormalize(g).includes(q));
                let matchType = null;

                if (normSub.includes(q) || groupHit) {
                    matchType = 'session';
                } else if (!isNaN(rawInput) && rawInput.length >= 3) {
                    const pSnap = await getDocs(query(
                        collection(db, 'active_sessions', docId, 'participants'),
                        where('id', '==', rawInput), where('status', '==', 'active')));
                    if (!pSnap.empty) { matchType = 'student'; data.friendName = pSnap.docs[0].data().name; }
                }

                if (!matchType) continue;

                try {
                    const cnt = await getCountFromServer(query(
                        collection(db, 'active_sessions', docId, 'participants'),
                        where('status', '==', 'active')));
                    data.liveCount = cnt.data().count;
                } catch { data.liveCount = '?'; }

                results.push({ ...data, matchType, doctorId: docId });
            }

            content.innerHTML = '';
            if (!results.length) {
                content.innerHTML = `<div class="empty-state-modern">
                    <div class="empty-icon-bg"><i class="fa-solid fa-magnifying-glass-minus" style="font-size:30px;color:#94a3b8;"></i></div>
                    <h3 style="margin-top:10px;font-size:14px;color:#64748b;">${_t('search_no_results_custom', 'لم يتم العثور على نتائج')}</h3>
                    <p style="font-size:11px;color:#cbd5e1;">"${rawInput}"</p>
                </div>`;
                return;
            }

            results.forEach(res => content.appendChild(_buildResultCard(res, _t)));
        } catch (e) {
            console.error('Smart search error:', e);
            content.innerHTML = '<div style="color:#ef4444;text-align:center;padding:20px;">حدث خطأ أثناء البحث</div>';
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
        }
    }

    function _buildResultCard(res, _t) {
        const card = document.createElement('div');
        card.className = 'makani-card no-hover';
        const docName = res.doctorName || '';
        const isEng = /^[A-Za-z]/.test(docName);
        const prefix = isEng ? 'Dr.' : 'د.';

        if (res.matchType === 'session') {
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                    <div style="flex:1;">
                        <div style="font-weight:900;font-size:16px;color:#0f172a;margin-bottom:4px;">${res.allowedSubject}</div>
                        <div style="font-size:13px;color:#64748b;direction:${isEng ? 'ltr' : 'rtl'};text-align:${isEng ? 'left' : 'right'};">${prefix} ${docName}</div>
                    </div>
                    <div style="text-align:center;background:#dcfce7;color:#166534;padding:5px 10px;border-radius:10px;font-size:12px;font-weight:bold;margin-right:5px;">
                        <span class="blink-dot" style="background:#16a34a;"></span> LIVE (${res.liveCount})
                    </div>
                </div>
                <div class="hall-badge-formal">
                    <div style="font-size:10px;color:#94a3b8;">${_t('formal_direction', 'المكان الحالي')}</div>
                    <div style="font-size:20px;font-weight:900;color:#fff;">HALL: ${res.hall}</div>
                </div>`;
        } else {
            const stdName = res.friendName || '';
            const isEngStd = /^[A-Za-z]/.test(stdName);
            card.innerHTML = `
                <div style="width:100%;direction:${isEngStd ? 'ltr' : 'rtl'};">
                    <div style="display:flex;align-items:center;gap:15px;margin-bottom:20px;">
                        <div style="background:#f0f9ff;min-width:55px;height:55px;border-radius:50%;color:#0ea5e9;display:flex;align-items:center;justify-content:center;border:2px solid #bae6fd;flex-shrink:0;">
                            <i class="fa-solid fa-user-graduate" style="font-size:24px;"></i>
                        </div>
                        <div style="flex:1;text-align:${isEngStd ? 'left' : 'right'};">
                            <div style="font-weight:900;font-size:16px;color:#0f172a;margin-bottom:5px;">${stdName}</div>
                            <div style="font-size:13px;color:#64748b;font-weight:600;">${isEngStd ? 'Attending:' : 'يحضر الآن:'} <span style="color:#0ea5e9;font-weight:800;">${res.allowedSubject}</span></div>
                        </div>
                    </div>
                    <div class="hall-badge-formal" style="background:linear-gradient(135deg,#6366f1,#4f46e5);border-radius:16px;padding:15px;text-align:center;direction:ltr;">
                        <div style="font-size:12px;color:#e0e7ff;margin-bottom:2px;font-weight:bold;opacity:0.9;">${_t('radar_current_location', 'الموقع الحالي')}</div>
                        <div style="font-size:28px;font-weight:900;color:#fff;font-family:'Outfit',sans-serif;letter-spacing:1px;">HALL: ${res.hall}</div>
                    </div>
                </div>`;
        }
        return card;
    }

    return { startSmartSearch };
})();


const IdleTimer = (() => {
    let _ticker = null;
    let _elapsed = 0;
    let _isTyping = false;

    function start() {
        stop();
        _elapsed = _isTyping = false;
        _ticker = setInterval(() => {
            if (_isTyping) return;
            if (++_elapsed >= CFG.ui.idleTimeoutSec) {
                stop();
                UI.switchScreen('screenWelcome');
                UI.showToast('⚠️ كن سريعا في المرة القادمة', 3000, '#f59e0b');
            }
        }, 1000);
    }

    function stop() {
        clearInterval(_ticker);
        _ticker = _elapsed = 0;
        _isTyping = false;
        const input = Utils.$('attendanceCode');
        if (input) input.value = '';
    }

    function onKeyDown() { _isTyping = true; _elapsed = 0; }
    function onKeyUp() { _isTyping = false; }

    return { start, stop, onKeyDown, onKeyUp };
})();


const WakeLock = (() => {
    let _lock = null;
    async function request() {
        try { if ('wakeLock' in navigator) _lock = await navigator.wakeLock.request('screen'); } catch { /* silently fail */ }
    }
    function release() { _lock?.release().then(() => { _lock = null; }); }
    return { request, release };
})();


const PWAManager = (() => {
    let _deferred = null;

    function init() {
        const box = Utils.$('installAppPrompt');
        window.addEventListener('beforeinstallprompt', e => {
            e.preventDefault();
            _deferred = e;
            if (box) box.style.display = 'flex';
        });
        window.addEventListener('appinstalled', () => {
            if (box) box.style.display = 'none';
            _deferred = null;
            UI.showToast('شكراً لتثبيت التطبيق! 🚀', 4000, '#10b981');
        });
    }

    function triggerInstall() {
        if (!_deferred) return;
        _deferred.prompt();
        _deferred.userChoice.then(r => {
            if (r.outcome === 'accepted') Utils.$('installAppPrompt').style.display = 'none';
            _deferred = null;
        });
    }

    return { init, triggerInstall };
})();


function initSecurityLayer() {
    const blocked = ['contextmenu', 'copy', 'cut', 'paste'];
    const msgs = {
        contextmenu: 'إجراء محظور لأسباب أمنية.',
        copy: 'النسخ محظور لأسباب أمنية.',
        cut: 'القص محظور لأسباب أمنية.',
        paste: 'اللصق محظور لأسباب أمنية.',
    };
    blocked.forEach(evt => {
        document.addEventListener(evt, e => { e.preventDefault(); UI.showToast(msgs[evt], 2000, '#ef4444'); });
    });

    window.history.pushState(null, null, window.location.href);
    window.onpopstate = () => {
        if (window.processIsActive) window.history.pushState(null, null, window.location.href);
    };
}


function startClock() {
    setInterval(() => {
        const now = new Date();
        const timeEl = Utils.$('currentTime');
        const dateEl = Utils.$('currentDate');
        if (timeEl) timeEl.innerText = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
        if (dateEl) dateEl.innerText = now.toLocaleDateString('en-GB');
    }, 1000);
}


Object.assign(window, {
    getUniqueDeviceId: DeviceManager.getUniqueDeviceId,

    switchScreen: UI.switchScreen,
    openAuthDrawer: UI.openAuthDrawer,
    closeAuthDrawer: UI.closeAuthDrawer,
    toggleAuthMode: UI.toggleAuthMode,
    togglePass: UI.togglePass,
    toggleDropdown: UI.toggleDropdown,
    selectOption: UI.selectOption,
    validateSignupForm: UI.validateSignupForm,
    filterModalSubjects: UI.filterModalSubjects,
    showToast: UI.showToast,
    resetMainButtonUI: () => {
        const uid = sessionStorage.getItem('TARGET_DOCTOR_UID') || localStorage.getItem('TARGET_DOCTOR_UID');
        UI.setMainButton(uid ? 'enter' : 'register');
    },

    performStudentSignup: AuthManager.performStudentSignup,
    performStudentLogin: AuthManager.performStudentLogin,
    performStudentLogout: AuthManager.performStudentLogout,


    monitorMyParticipation: SessionManager.monitorMyParticipation,
    searchForSession: SessionManager.searchForSession,
    resetSearchSession: SessionManager.resetSearchSession,
    joinSessionAction: SessionManager.joinSessionAction,
    startAuthScreenTimer,

    openStudentProfile: ProfileManager.openStudentProfile,
    openAvatarSelector: ProfileManager.openAvatarSelector,
    saveNewAvatar: ProfileManager.saveNewAvatar,
    autoFetchName: ProfileManager.autoFetchName,

    checkForPendingSurveys: FeedbackManager.checkForPendingSurveys,
    selectStar: FeedbackManager.selectStar,
    submitFeedback: FeedbackManager.submitFeedback,
    dismissFeedback: FeedbackManager.dismissFeedback,

    startSmartSearch: SmartSearch.startSmartSearch,

    startCodeEntryIdleTimer: IdleTimer.start,
    stopCodeEntryIdleTimer: IdleTimer.stop,

    triggerAppInstall: PWAManager.triggerInstall,

    getGPSForJoin: GPSManager.getGPSForJoin,
    openMapsToRefreshGPS: GPSManager.openMapsToCollegeLocation,
    getDistanceFromLatLonInKm: Utils.haversineKm,

    changeLanguage: UI.applyLanguage,
    toggleSystemLanguage: async () => {
        const auth = window.auth;
        const db = window.db;
        const current = Utils.lang();
        const next = current === 'ar' ? 'en' : 'ar';
        UI.applyLanguage(next);
        document.querySelectorAll('.active-lang-text-pro').forEach(s => { s.innerText = next === 'ar' ? 'EN' : 'عربي'; });
        const user = auth.currentUser;
        if (user) {
            try { await setDoc(doc(db, 'user_registrations', user.uid), { preferredLanguage: next }, { merge: true }); }
            catch (e) { console.warn('Language sync skipped:', e.message); }
        }
    },

    handleProfileIconClick: () => {
        const user = window.auth.currentUser;
        if (!user) UI.openAuthDrawer();
        else ProfileManager.openStudentProfile();
    },
    showSmartWelcome: name => {
        const today = new Date().toLocaleDateString('en-GB');
        if (localStorage.getItem('last_welcome_date') === today) return;
        const modal = Utils.$('dailyWelcomeModal');
        const nameSpan = Utils.$('welcomeUserName');
        if (modal && nameSpan) {
            nameSpan.innerText = name.split(' ')[0];
            modal.style.display = 'flex';
            modal.style.opacity = '1';
            localStorage.setItem('last_welcome_date', today);
        }
    },
    closeDailyWelcome: () => {
        const modal = Utils.$('dailyWelcomeModal');
        if (!modal) return;
        modal.style.transition = '0.3s ease';
        modal.style.opacity = '0';
        setTimeout(() => { modal.style.display = 'none'; }, 300);
    },
    goHome: () => {
        const live = Utils.$('screenLiveSession');
        if (live) { live.style.cssText = ''; live.style.setProperty('display', 'none', 'important'); }
        UI.switchScreen('screenWelcome');
        Utils.$('infoBtn') && (Utils.$('infoBtn').style.display = 'flex');
        document.body.classList.add('on-welcome-screen');
        document.body.classList.remove('hide-main-icons');
        document.body.style.overflow = 'auto';
    },
    showInfoModal: () => { window.playClick?.(); UI.openModal('infoModal'); },
    closeSetupModal: () => { UI.closeModal('customTimeModal'); document.body.style.overflow = 'auto'; },
    goBackToWelcome: async () => {
        await window.stopCameraSafely?.();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        GPSManager.stopWatcher?.();
        UI.switchScreen('screenWelcome');
    },
    stopCameraSafely: async () => { WakeLock.release(); return true; },
    startQrScanner: () => UI.showToast('تم إلغاء خاصية الباركود.', 3000, '#f59e0b'),
    safeClick: btn => { if (btn) { btn.style.opacity = '0.7'; btn.style.pointerEvents = 'none'; } },
    hideConnectionLostModal: NetworkManager.hideLostModal,
    expandAvatar: () => {
        const av = Utils.$('publicAvatar');
        const icon = av?.getAttribute('data-icon');
        const color = av?.getAttribute('data-color');
        if (!icon) return;
        const container = Utils.$('zoomedAvatarContainer');
        if (container) { container.innerHTML = `<i class="fa-solid ${icon}"></i>`; container.querySelector('i').style.color = color; }
        UI.openModal('imageZoomModal');
    },

    portalClicks: 0,
    portalTimer: null,
    handleAdminTripleClick: btn => {
        window.playClick?.();
        window.portalClicks++;
        clearTimeout(window.portalTimer);
        window.portalTimer = setTimeout(() => { window.portalClicks = 0; }, 2000);
        if (window.portalClicks === 3) navigator.vibrate?.([50, 50]);
    },
    handleReportClick: () => {
        window.portalClicks = 0;
        UI.showToast('🔐 القسم محمي', 3000, '#ef4444');
        navigator.vibrate?.(200);
    },

    updateUIForMode: () => {
        const auth = window.auth;
        document.body.classList.remove('is-dean', 'is-doctor', 'is-student');
        document.body.classList.add('is-student');

        ['btnToggleSession', 'btnQuickMode', 'btnToolsRequest', 'deanPrivateZone',
            'btnDataEntry', 'facultyProfileBtn', 'btnLiveFeedback'].forEach(id => {
                Utils.$(id)?.style.setProperty('display', 'none', 'important');
            });

        Utils.$('btnViewReport')?.classList.add('locked');
        Utils.$('mainActionBtn') && (Utils.$('mainActionBtn').style.display = 'flex');
        Utils.$('makaniSearchBar') && (Utils.$('makaniSearchBar').style.display = 'block');
        Utils.$('studentProfileBtn') && (Utils.$('studentProfileBtn').style.display = 'flex');

        UI.applyLanguage(Utils.lang());
    },

    startProcess: async isRetry => {
        window.playClick?.();
        const user = window.auth.currentUser;
        if (!user) { UI.openAuthDrawer(); return; }
        if (sessionStorage.getItem('TARGET_DOCTOR_UID') || localStorage.getItem('TARGET_DOCTOR_UID')) {
            UI.switchScreen('screenLiveSession');
            window.startLiveSnapshotListener?.();
            return;
        }
        UI.switchScreen('screenDataEntry');
        Utils.$('step2_auth')?.style.setProperty('display', 'none', 'important');
        const errEl = Utils.$('screenError');
        if (errEl) errEl.style.display = 'none';
        const step1 = Utils.$('step1_search');
        if (step1) step1.style.cssText = 'display:block !important;visibility:visible !important;';
        setTimeout(() => Utils.$('attendanceCode')?.focus(), 150);
        IdleTimer.start();
    },

    forceOpenPinScreen: () => {
        const user = window.auth.currentUser;
        if (!user) { UI.showToast('⚠️ عذراً، انتظر', 3000, '#f59e0b'); UI.openAuthDrawer(); return; }
        UI.switchScreen('screenDataEntry');
        Utils.$('step2_auth')?.style.setProperty('display', 'none', 'important');
        const errEl = Utils.$('screenError');
        if (errEl) errEl.style.display = 'none';
        const step1 = Utils.$('step1_search');
        if (step1) step1.style.cssText = 'display:block !important;opacity:1 !important;visibility:visible !important;width:100%;';
        setTimeout(() => Utils.$('attendanceCode')?.focus(), 150);
        IdleTimer.start();
    },

    playClick: () => { },
    subjectsData: MASTER_SUBJECTS,

    isJoiningProcessActive: false,
    isProcessingClick: false,
    studentStatusListener: null,
    sessionStatusListener: null,
    HARDWARE_ID: null,

    _authStateLoading: true,
});


async function _initPersistentSync() {
    const keysToSync = [
        'LOGGED_IN_UID',
        'CURRENT_SESSION_ID',
        'TARGET_DOCTOR_UID',
        CFG.device.cacheKey,
        CFG.device.verifiedCacheKey,
        'cached_profile_data',
    ];

    for (const key of keysToSync) {
        try {
            const idbVal = await PersistentStore.get(key);
            if (idbVal !== null && !localStorage.getItem(key)) {
                localStorage.setItem(key, idbVal);
            }
        } catch { }
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    await _initPersistentSync();

    try { await DeviceManager.getUniqueDeviceId(); } catch (e) { console.warn('Fingerprint pre-load warning:', e); }

    const quickResult = await SessionGuard.quickCheck();
    if (quickResult.valid) {
        console.log('Quick session check passed, restoring session...');
    }
});

onAuthStateChanged(window.auth, AuthManager.onAuthChange);

setTimeout(async () => {
    if (window._authStateLoading) {
        console.warn('[System] Firebase is taking too long (Slow Network). Triggering Adaptive Recovery...');

        const cachedUID = await PersistentStore.get('LOGGED_IN_UID');
        const verifiedRaw = await PersistentStore.get(CFG.device.verifiedCacheKey);
        const verifiedData = Utils.safeJsonParse(verifiedRaw);
        const isSessionValid = verifiedData && (Date.now() - verifiedData.ts) < CFG.device.verifiedTTL;

        window._authStateLoading = false;

        SessionGuard.markResolved();

        if (!cachedUID || !isSessionValid) {
            console.log('[System] No local session found after timeout. Prompting login...');

            setTimeout(() => {
                if (!window.auth.currentUser) {
                    UI.openAuthDrawer();
                }
            }, 500);
        } else {
            console.info('[System] Local session detected. Keeping UI silent for background sync.');

            window.updateUIForMode?.();
        }
    }
}, 10000);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        if (!window._isOpeningMaps && window.processIsActive) location.reload();
        WakeLock.release();
    } else {
        if (window._isOpeningMaps) window._isOpeningMaps = false;
        if (window.processIsActive) WakeLock.request();
        _initPersistentSync().catch(() => { });
    }
});

window.onload = () => {
    const pinInput = Utils.$('attendanceCode');
    if (pinInput) {
        pinInput.value = '';
        pinInput.setAttribute('autocomplete', 'off');
        pinInput.setAttribute('inputmode', 'numeric');
        pinInput.addEventListener('keydown', IdleTimer.onKeyDown);
        pinInput.addEventListener('keyup', IdleTimer.onKeyUp);
        pinInput.addEventListener('input', e => {
            IdleTimer.onKeyUp();
            if (e.target.value.length === 1 && !window._codeEntryStarted) {
                window._codeEntryStarted = Date.now();
            }
            if (e.target.value.length === 0) {
                window._codeEntryStarted = null;
            }
            if (e.target.value.trim().length === 6) SessionManager.searchForSession();
        });
    }

    Utils.$('sessionPass')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') SessionManager.joinSessionAction();
    });

    const savedUID = localStorage.getItem('TARGET_DOCTOR_UID');
    if (!savedUID) {
        PersistentStore.get('TARGET_DOCTOR_UID').then(uid => {
            if (uid) { localStorage.setItem('TARGET_DOCTOR_UID', uid); }
        }).catch(() => { });
    }

    const savedSessionId = localStorage.getItem('CURRENT_SESSION_ID');
    const savedLoggedUID = localStorage.getItem('LOGGED_IN_UID');
    if (savedSessionId && savedLoggedUID) {
        AuthManager.startSessionWatcher(savedLoggedUID, savedSessionId);
    } else {
        Promise.all([
            PersistentStore.get('CURRENT_SESSION_ID'),
            PersistentStore.get('LOGGED_IN_UID'),
        ]).then(([sid, luid]) => {
            if (sid && luid) {
                AuthManager.startSessionWatcher(luid, sid);
            }
        }).catch(() => { });
    }

    NetworkManager.initGlobalGuard();
    window.updateUIForMode();
    GPSManager.startWatcher();
    UI.renderHallOptions();
    NetworkManager.fetchIP();
    PWAManager.init();
    startClock();

    Utils.$('hallSearchInput')?.addEventListener('input', e => UI.renderHallOptions(e.target.value));

    const groupInput = Utils.$('regGroup');
    groupInput?.addEventListener('input', function () {
        this.value = this.value.toUpperCase().replace(/[^0-9GPNCDTBH]/g, '');
        UI.validateSignupForm();
    });
    Utils.$('regLevel')?.addEventListener('change', UI.validateSignupForm);

    const savedLang = Utils.lang();
    UI.applyLanguage(savedLang);
    document.querySelectorAll('.active-lang-text-pro').forEach(s => { s.innerText = savedLang === 'ar' ? 'EN' : 'عربي'; });

    window.listenToSessionState?.();
};

document.addEventListener('click', e => {
    if (!e.target.closest('.custom-dropdown'))
        document.querySelectorAll('.dropdown-list').forEach(el => el.classList.remove('show'));
});

document.addEventListener('DOMContentLoaded', () => {
    ['regEmail', 'regEmailConfirm', 'regPass', 'regPassConfirm', 'regGender', 'regLevel', 'regGroup',
        'regStudentID', 'regFullName'].forEach(id => {
            Utils.$(id)?.addEventListener('input', UI.validateSignupForm);
            Utils.$(id)?.addEventListener('change', UI.validateSignupForm);
        });

    window.addEventListener('pageshow', () => {
        const pin = Utils.$('attendanceCode');
        if (pin) pin.value = '';
    });
});
(function initPatternLock() {
    'use strict';

    const CSS = `
        /* Force LTR على الـ container بالكامل — يحمي من RTL و direction أي كان */
        #patternLockContainer,
        #patternLockContainer * {
            direction: ltr !important;
            unicode-bidi: isolate !important;
        }

        #patternLockContainer {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
        }

        /* الشبكة: حجم ثابت + grid حقيقي */
        #patternGrid {
            position: relative;
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            grid-template-rows: repeat(4, 1fr) !important;
            gap: 0 !important;
            width: 280px;
            height: 280px;
            touch-action: none;
            -ms-touch-action: none;
            cursor: crosshair;
            /* حماية من Google Translate التي تُضيف font tags */
            font-size: 0 !important;
        }

        .plk-cell {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            /* translate="no" على مستوى CSS أيضاً */
            font-size: 0 !important;
        }

        .plk-dot {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #e2e8f0;
            border: 2px solid #cbd5e1;
            pointer-events: none;
            transition: transform 0.15s ease, background 0.15s ease,
                        border-color 0.15s ease, box-shadow 0.15s ease;
            /* منع أي تدخل من الـ browser في حجم العنصر */
            flex-shrink: 0;
            flex-grow: 0;
        }

        .plk-dot.active {
            background: #3b82f6 !important;
            border-color: #2563eb !important;
            transform: scale(1.6) !important;
            box-shadow: 0 0 18px rgba(59,130,246,0.55) !important;
        }

        .plk-dot.error {
            background: #ef4444 !important;
            border-color: #b91c1c !important;
            transform: scale(1.6) !important;
            box-shadow: 0 0 18px rgba(239,68,68,0.55) !important;
        }

        /* SVG يغطي الشبكة بالكامل */
        #patternSvg {
            position: absolute !important;
            inset: 0 !important;
            top: 0 !important; left: 0 !important;
            right: 0 !important; bottom: 0 !important;
            width: 100% !important;
            height: 100% !important;
            pointer-events: none;
            z-index: 10;
            overflow: visible;
        }
    `;

    let styleEl = document.getElementById('plk-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'plk-styles';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = CSS;

    let drawing = false;
    let path = [];
    let dotPositions = [];
    let rafId = null;
    let activePointer = null;

    function calcPositions() {
        const grid = document.getElementById('patternGrid');
        if (!grid) return;

        const gridRect = grid.getBoundingClientRect();
        if (gridRect.width === 0) return;

        const dots = grid.querySelectorAll('.plk-dot');
        if (dots.length !== 16) return;

        dotPositions = [];
        dots.forEach((dot, i) => {
            const r = dot.getBoundingClientRect();
            dotPositions.push({
                idx: i,
                x: (r.left + r.right) / 2 - gridRect.left,
                y: (r.top + r.bottom) / 2 - gridRect.top
            });
        });
    }

    function buildGrid() {
        const dotsEl = document.getElementById('patternDots');
        const svg = document.getElementById('patternSvg');
        if (!dotsEl || !svg) return;

        drawing = false;
        path = [];
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

        dotsEl.innerHTML = '';
        svg.innerHTML = '';
        svg.removeAttribute('data-state');

        dotsEl.setAttribute('translate', 'no');
        dotsEl.classList.add('notranslate');

        for (let i = 0; i < 16; i++) {
            const cell = document.createElement('div');
            cell.className = 'plk-cell';
            cell.setAttribute('translate', 'no');

            const dot = document.createElement('div');
            dot.className = 'plk-dot';
            dot.dataset.idx = String(i);
            dot.setAttribute('translate', 'no');

            cell.appendChild(dot);
            dotsEl.appendChild(cell);
        }

        requestAnimationFrame(() => requestAnimationFrame(calcPositions));
    }

    function hitTest(clientX, clientY) {
        const grid = document.getElementById('patternGrid');
        if (!grid || dotPositions.length === 0) return -1;

        const gr = grid.getBoundingClientRect();
        const rx = clientX - gr.left;
        const ry = clientY - gr.top;

        let best = -1, bestDist = 32;
        for (const dp of dotPositions) {
            const d = Math.hypot(rx - dp.x, ry - dp.y);
            if (d < bestDist) { bestDist = d; best = dp.idx; }
        }
        return best;
    }

    function renderLines(liveX, liveY) {
        const svg = document.getElementById('patternSvg');
        if (!svg) return;

        const isError = svg.dataset.state === 'error';
        const stroke = isError ? '#ef4444' : '#3b82f6';

        let html = '';

        for (let k = 0; k < path.length - 1; k++) {
            const a = dotPositions[path[k]];
            const b = dotPositions[path[k + 1]];
            if (a && b) {
                html += `<line
                    x1="${a.x}" y1="${a.y}"
                    x2="${b.x}" y2="${b.y}"
                    stroke="${stroke}" stroke-width="3.5"
                    stroke-linecap="round" opacity="${isError ? 0.7 : 1}"
                />`;
            }
        }

        if (drawing && liveX !== undefined && path.length > 0) {
            const last = dotPositions[path[path.length - 1]];
            const gr = document.getElementById('patternGrid').getBoundingClientRect();
            if (last) {
                html += `<line
                    x1="${last.x}" y1="${last.y}"
                    x2="${liveX - gr.left}" y2="${liveY - gr.top}"
                    stroke="${stroke}" stroke-width="3"
                    stroke-linecap="round" opacity="0.4"
                    stroke-dasharray="6 4"
                />`;
            }
        }

        svg.innerHTML = html;
    }

    function activateDot(idx) {
        const dot = document.querySelector(`.plk-dot[data-idx="${idx}"]`);
        dot?.classList.add('active');
        if (navigator.vibrate) navigator.vibrate(12);
    }

    function showError(msg) {
        drawing = false;
        const svg = document.getElementById('patternSvg');
        const hint = document.getElementById('patternHint');

        if (svg) svg.dataset.state = 'error';
        document.querySelectorAll('.plk-dot.active').forEach(d => {
            d.classList.remove('active');
            d.classList.add('error');
        });
        renderLines();

        if (hint && msg) {
            hint.style.color = '#ef4444';
            hint.textContent = msg;
        }

        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);

        setTimeout(() => {
            buildGrid();
            if (hint) {
                hint.style.color = '';
                hint.textContent = 'Drag between dots';
            }
        }, 900);
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (activePointer !== null) return;

        calcPositions();

        const idx = hitTest(e.clientX, e.clientY);
        if (idx === -1) return;

        e.preventDefault();
        e.target.setPointerCapture?.(e.pointerId);
        activePointer = e.pointerId;

        drawing = true;
        path = [idx];
        activateDot(idx);
        renderLines(e.clientX, e.clientY);
    }

    function onPointerMove(e) {
        if (!drawing || e.pointerId !== activePointer) return;
        e.preventDefault();

        const idx = hitTest(e.clientX, e.clientY);
        if (idx !== -1 && !path.includes(idx)) {
            path.push(idx);
            activateDot(idx);
        }

        if (rafId) cancelAnimationFrame(rafId);
        const cx = e.clientX, cy = e.clientY;
        rafId = requestAnimationFrame(() => renderLines(cx, cy));
    }

    function onPointerUp(e) {
        if (!drawing || e.pointerId !== activePointer) return;
        activePointer = null;
        drawing = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        renderLines();
        finalizePattern();
    }

    function finalizePattern() {
        if (path.length < 3) {
            showError('Draw at least 3 dots');
            return;
        }

        window._currentPatternPath = [...path];

        if (typeof window.joinSessionAction !== 'function') return;

        window.joinSessionAction()
            .then(() => {
                window._patternAttempts = 0;
                window._currentPatternPath = null;
            })
            .catch(() => {
                window._currentPatternPath = null;
                window._patternAttempts = (window._patternAttempts || 0) + 1;
                if (window._patternAttempts >= 2) {
                    window._patternAttempts = 0;
                    window.resetSearchSession?.();
                    if (typeof UI !== 'undefined') UI.switchScreen('screenWelcome');
                } else {
                    showError(null);
                }
            });
    }

    function attachEvents() {
        const grid = document.getElementById('patternGrid');
        if (!grid) return;

        grid.addEventListener('pointerdown', onPointerDown, { passive: false });
        grid.addEventListener('pointermove', onPointerMove, { passive: false });
        grid.addEventListener('pointerup', onPointerUp, { passive: false });
        grid.addEventListener('pointercancel', onPointerUp, { passive: false });

        if (!('PointerEvent' in window)) {
            grid.addEventListener('mousedown', e => onPointerDown({ ...e, pointerId: 'mouse', pointerType: 'mouse' }));
            grid.addEventListener('mousemove', e => onPointerMove({ ...e, pointerId: 'mouse' }));
            grid.addEventListener('mouseup', e => onPointerUp({ ...e, pointerId: 'mouse' }));
            grid.addEventListener('touchstart', e => {
                const t = e.touches[0];
                onPointerDown({ clientX: t.clientX, clientY: t.clientY, pointerId: t.identifier, pointerType: 'touch', preventDefault: () => e.preventDefault(), target: grid });
            }, { passive: false });
            grid.addEventListener('touchmove', e => {
                const t = e.touches[0];
                e.preventDefault();
                onPointerMove({ clientX: t.clientX, clientY: t.clientY, pointerId: t.identifier });
            }, { passive: false });
            grid.addEventListener('touchend', e => {
                const t = e.changedTouches[0];
                onPointerUp({ clientX: t.clientX, clientY: t.clientY, pointerId: t.identifier });
            }, { passive: false });
        }
    }

    let resizeTimer = null;

    function onResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(calcPositions, 100);
    }

    function watchResize() {
        if ('ResizeObserver' in window) {
            const grid = document.getElementById('patternGrid');
            if (grid) {
                new ResizeObserver(onResize).observe(grid);
            }
        }
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', () => setTimeout(calcPositions, 300));
    }

    function watchMutations() {
        const grid = document.getElementById('patternGrid');
        if (!grid || !('MutationObserver' in window)) return;

        new MutationObserver(mutations => {
            let needsRecalc = false;
            for (const m of mutations) {
                if (m.type === 'childList' && m.addedNodes.length > 0) {
                    needsRecalc = true;
                }
            }
            if (needsRecalc) {
                requestAnimationFrame(() => requestAnimationFrame(calcPositions));
            }
        }).observe(grid, { childList: true, subtree: true });
    }

    window.renderPasswordChoices = function (sessionData) {
        window._patternAttempts = 0;

        const container = document.getElementById('patternLockContainer');
        if (container) container.style.display = '';

        buildGrid();

        requestAnimationFrame(() => {
            attachEvents();
            watchResize();
            watchMutations();
        });
    };

    if (document.getElementById('patternGrid')) {
        window.renderPasswordChoices();
    }

})();
initSecurityLayer();

NetworkManager.initNetworkIndicator();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=3', { scope: './' })
            .then(() => console.log('ServiceWorker registered'))
            .catch(err => console.error('ServiceWorker registration failed:', err));
    });
}
