'use strict';

const OA = {
    STORAGE_KEY: "nursing_offline_queue_v3",
    QUARANTINE_KEY: "nursing_offline_quarantine_v3",
    RATE_KEY: "nursing_pin_rate_v1",
    FIRESTORE_CDN: "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
    PIN_LENGTH: 6,
    COUNTDOWN_SEC: 3,
    SYNC_BOOT_DELAY: 5000,
    MAX_RETRIES: 3,
    RETRY_BASE_MS: 1500,
    MAX_QUEUE_SIZE: 200,
    MAX_PIN_ATTEMPTS: 5,
    LOCKOUT_MS: 5 * 60 * 1000,
    CRYPTO_ALGO: "AES-GCM",
    KEY_LENGTH: 256,
};

let _firestoreCache = null;
let _syncPromise = null;
let _countdownTimer = null;

const lang = () => localStorage.getItem('sys_lang') || 'ar';
const t = (ar, en) => lang() === 'ar' ? ar : en;

function toast(msg, ms = 4000, color = "#1e293b") {
    if (window.showToast) window.showToast(msg, ms, color);
}

function beep() {
    if (window.playSuccess) window.playSuccess();
}

function log(level, ...args) {
    const prefix = `[NursingOffline][${new Date().toISOString()}]`;
    const method = (console[level] && typeof console[level] === 'function') ? level : 'error';
    console[method](prefix, ...args);
}

const _keyCache = new Map();

async function _getAesKey(uid) {
    if (_keyCache.has(uid)) return _keyCache.get(uid);

    if (_keyCache.size >= 10) {
        const oldest = _keyCache.keys().next().value;
        _keyCache.delete(oldest);
    }

    const rawMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(uid),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    const salt = new TextEncoder().encode('NursingApp_Salt_2024');

    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
        rawMaterial,
        { name: OA.CRYPTO_ALGO, length: OA.KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );

    _keyCache.set(uid, key);
    return key;
}

async function _getHmacKey(uid) {
    const cacheKey = `hmac_${uid}`;
    if (_keyCache.has(cacheKey)) return _keyCache.get(cacheKey);

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(`hmac_${uid}_NursingApp`),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );

    _keyCache.set(cacheKey, key);
    return key;
}

async function _encryptQueue(arr, uid) {
    try {
        const key = await _getAesKey(uid);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plain = new TextEncoder().encode(JSON.stringify(arr));

        const cipher = await crypto.subtle.encrypt(
            { name: OA.CRYPTO_ALGO, iv },
            key,
            plain
        );

        const combined = new Uint8Array(iv.byteLength + cipher.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(cipher), iv.byteLength);

        return btoa(String.fromCharCode(...combined));
    } catch (e) {
        log('error', 'Encrypt failed, falling back to plain JSON:', e.message);
        return btoa(unescape(encodeURIComponent(JSON.stringify(arr))));
    }
}

async function _decryptQueue(raw, uid) {
    try {
        const combined = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const cipherBuf = combined.slice(12);
        const key = await _getAesKey(uid);
        const plain = await crypto.subtle.decrypt(
            { name: OA.CRYPTO_ALGO, iv },
            key,
            cipherBuf
        );
        const parsed = JSON.parse(new TextDecoder().decode(plain));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        try {
            const fallbackUid = window.HARDWARE_ID || 'ANONYMOUS_DEVICE';
            if (fallbackUid === uid) throw new Error('same uid');

            const combined = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
            const iv = combined.slice(0, 12);
            const cipherBuf = combined.slice(12);
            const key = await _getAesKey(fallbackUid);
            const plain = await crypto.subtle.decrypt(
                { name: OA.CRYPTO_ALGO, iv },
                key,
                cipherBuf
            );
            const parsed = JSON.parse(new TextDecoder().decode(plain));
            log('warn', 'Queue decrypted with ANONYMOUS_DEVICE fallback');
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            // legacy fallback
            try {
                const legacyDecoded = decodeURIComponent(escape(atob(raw)));
                const parsed = JSON.parse(legacyDecoded);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
    }
}

async function _signEntry(entry, uid) {
    try {
        const key = await _getHmacKey(uid);
        const payload = JSON.stringify({
            studentID: entry.studentID,
            sessionPin: entry.sessionPin,
            submissionTime: entry.submissionTime,
        });

        const sig = await crypto.subtle.sign(
            'HMAC',
            key,
            new TextEncoder().encode(payload)
        );

        return btoa(String.fromCharCode(...new Uint8Array(sig)));
    } catch {
        return null;
    }
}

async function _verifyEntry(entry, uid) {
    if (!entry._sig) return true;  // entry قديمة بدون signature → قبول

    const expected = await _signEntry({ ...entry, _sig: undefined }, uid);
    return expected === entry._sig;
}


function _getUidForCrypto() {
    const currentUser = window.auth?.currentUser;
    if (currentUser?.uid) return currentUser.uid;

    return window.HARDWARE_ID || 'ANONYMOUS_DEVICE';
}

async function queueLoad() {
    try {
        const raw = localStorage.getItem(OA.STORAGE_KEY);
        if (!raw) return [];
        const uid = _getUidForCrypto();
        return await _decryptQueue(raw, uid);
    } catch {
        return [];
    }
}

async function queueSave(arr) {
    try {
        const safe = arr.slice(-OA.MAX_QUEUE_SIZE);
        const uid = _getUidForCrypto();
        const encrypted = await _encryptQueue(safe, uid);
        localStorage.setItem(OA.STORAGE_KEY, encrypted);
        _updateBadge(safe.length);
    } catch (e) {
        log('error', 'queueSave failed:', e.message);
    }
}

function quarantineEntry(entry) {
    try {
        const q = JSON.parse(localStorage.getItem(OA.QUARANTINE_KEY) || '[]');
        q.push({ ...entry, _sig: undefined, quarantinedAt: Date.now() });
        localStorage.setItem(OA.QUARANTINE_KEY, JSON.stringify(q));
        log('warn', 'Entry quarantined:', entry.sessionPin);
    } catch { }
}

function entryKey(studentID, sessionPin) {
    return `${studentID}_${sessionPin}`;
}


function _checkRateLimit() {
    try {
        const raw = JSON.parse(localStorage.getItem(OA.RATE_KEY) || '{}');
        const now = Date.now();

        if (raw.lockedUntil && now < raw.lockedUntil) {
            const mins = Math.ceil((raw.lockedUntil - now) / 60_000);
            offlineAlert(t(`⛔ تم تجاوز عدد المحاولات المسموح به.\nحاول مجدداً بعد ${mins} دقيقة.`, `⛔ Too many attempts. Try again in ${mins} minute(s).`), 'warning');

            return false;
        }

        if (raw.lockedUntil && now >= raw.lockedUntil) {
            localStorage.removeItem(OA.RATE_KEY);
            return true;
        }

        const count = (raw.count || 0) + 1;

        if (count >= OA.MAX_PIN_ATTEMPTS) {
            localStorage.setItem(OA.RATE_KEY, JSON.stringify({
                count,
                lockedUntil: now + OA.LOCKOUT_MS,
            }));
            offlineAlert(t(`⛔ تم تجاوز ${OA.MAX_PIN_ATTEMPTS} محاولات. محظور لمدة 5 دقايق.`, `⛔ ${OA.MAX_PIN_ATTEMPTS} failed attempts. Locked for 5 minutes.`), 'warning');

            return false;
        }

        localStorage.setItem(OA.RATE_KEY, JSON.stringify({ count }));
        return true;

    } catch {
        return true;
    }
}

function _resetRateLimit() {
    localStorage.removeItem(OA.RATE_KEY);
}


function _updateBadge(count) {
    let badge = document.getElementById('offlinePendingBadge');
    if (!badge) {
        const btn = document.querySelector('[onclick*="openOfflineRegistrationModal"]');
        if (btn) {
            badge = document.createElement('span');
            badge.id = 'offlinePendingBadge';
            badge.style.cssText = `
                display:inline-flex;align-items:center;justify-content:center;
                background:#ef4444;color:#fff;border-radius:9999px;
                font-size:11px;font-weight:700;min-width:18px;height:18px;
                padding:0 4px;margin-inline-start:6px;
                transition:opacity .3s;
            `;
            btn.appendChild(badge);
        }
    }
    if (badge) {
        badge.textContent = count;
        badge.style.opacity = count > 0 ? '1' : '0';
    }
}


function controlOfflineButtonVisibility() {
    const wrapper = document.getElementById('offlineActionsWrapper');
    if (!wrapper) return;
    wrapper.style.setProperty('display', navigator.onLine ? 'none' : 'block', 'important');
}

window.addEventListener('online', () => {
    controlOfflineButtonVisibility();
    syncOfflineData();
});

window.addEventListener('offline', () => {
    controlOfflineButtonVisibility();
    toast(t("⚠️ انقطع الاتصال.. وضع الأوفلاين متاح", "⚠️ Disconnected.. Offline Mode Active"), 4000, "#475569");
});

document.addEventListener('DOMContentLoaded', async () => {
    controlOfflineButtonVisibility();
    const q = await queueLoad();
    _updateBadge(q.length);
    setTimeout(syncOfflineData, OA.SYNC_BOOT_DELAY);
});


window.openOfflineRegistrationModal = function () {
    const modal = document.getElementById('offlineRegModal');
    const pinInput = document.getElementById('offSessionPin');
    if (!modal) return;

    if (pinInput) pinInput.value = '';
    _setView('input');
    modal.style.display = 'flex';

    setTimeout(() => pinInput?.focus(), 150);
};

window.processOfflineQueue = async function () {
    const pinEl = document.getElementById('offSessionPin');
    if (!pinEl) return;

    const sessionPin = pinEl.value.trim();

    const studentData = await _getStudentFromCache();

    if (!studentData) {
        offlineAlert(t("⚠️ يجب تسجيل الدخول أولاً", "⚠️ Please Login First"), 'warning');

        return;
    }

    if (!/^\d{6}$/.test(sessionPin)) {
        offlineAlert(t("⚠️ الكود يجب أن يكون 6 أرقام", "⚠️ PIN must be 6 digits"), 'warning');

        return;
    }

    if (!_checkRateLimit()) return;

    const queue = await queueLoad();
    const key = entryKey(studentData.id, sessionPin);

    if (queue.some(item => entryKey(item.studentID, item.sessionPin) === key)) {
        offlineAlert(t("⚠️ سجّلت هذه الجلسة بالفعل", "⚠️ Already registered"), 'warning');

        return;
    }

    if (queue.length >= OA.MAX_QUEUE_SIZE) {
        offlineAlert(t("⚠️ قائمة الانتظار ممتلئة، يرجى الاتصال بالإنترنت أولاً", "⚠️ Queue full, please sync first"), 'warning');

        return;
    }

    _setView('process');
    _runCountdown(OA.COUNTDOWN_SEC, () => _saveEntry(studentData, sessionPin));
};


async function _saveEntry(studentData, sessionPin) {
    const submissionTime = Date.now();

    const offlineEntry = {
        studentID: studentData.id,
        studentName: studentData.name,
        avatarClass: studentData.avatar,
        sessionPin: sessionPin,
        submissionTime: submissionTime,
        deviceId: window.HARDWARE_ID || "DEVICE_OFFLINE",
        appVersion: window.APP_VERSION || "3.0",
    };

    offlineEntry._sig = await _signEntry(offlineEntry, studentData.uid || _getUidForCrypto());

    const queue = await queueLoad();
    queue.push(offlineEntry);
    await queueSave(queue);

    _resetRateLimit();

    toast(
        t("✅ تم الحفظ أوفلاين.. سيتم التأكيد فور عودة النت",
            "✅ Saved Offline.. Will sync on reconnect"),
        5000, "#1e293b"
    );
    beep();

    const modal = document.getElementById('offlineRegModal');
    if (modal) modal.style.display = 'none';

    if (navigator.onLine) syncOfflineData();
}


async function syncOfflineData() {
    if (_syncPromise) {
        log('info', 'Sync already running, awaiting...');
        return _syncPromise;
    }

    if (!navigator.onLine) return;

    const queue = await queueLoad();
    if (queue.length === 0) return;

    const user = window.auth?.currentUser;
    if (!user) {
        log('info', 'Sync skipped: no authenticated user');
        return;
    }

    _syncPromise = _doSync(queue, user).finally(() => {
        _syncPromise = null;
    });

    return _syncPromise;
}

async function _doSync(queue, user) {
    log('info', `Sync started: ${queue.length} entries`);

    try {
        if (!_firestoreCache) {
            _firestoreCache = await import(OA.FIRESTORE_CDN);
            log('info', 'Firestore module loaded & cached');
        }

        const { doc, getDoc, writeBatch, serverTimestamp } = _firestoreCache;
        const db = window.db;
        if (!db) { log('error', 'window.db not available'); return; }

        const remainingQueue = [];
        let successCount = 0;
        let failCount = 0;

        for (const entry of queue) {
            const uid = user.uid;
            const isValid = await _verifyEntry(entry, uid);

            if (!isValid) {
                log('warn', 'Tampered entry detected, quarantining:', entry.sessionPin);
                toast(
                    t('⚠️ تم اكتشاف تلاعب في بيانات محفوظة', '⚠️ Tampered entry detected'),
                    5000, "#ef4444"
                );
                quarantineEntry(entry);
                failCount++;
                continue;
            }

            const result = await _syncEntry(entry, { doc, getDoc, writeBatch, serverTimestamp, db, user });

            if (result === 'retry') {
                remainingQueue.push(entry);
                failCount++;
            } else if (result === true) {
                successCount++;
            } else {
                failCount++;
            }
        }

        await queueSave(remainingQueue);
        log('info', `Sync complete. Remaining: ${remainingQueue.length}`);

        if (remainingQueue.length > 0 && successCount === 0) {
            toast(
                t(
                    `⚠️ فشلت مزامنة ${remainingQueue.length} تسجيل — سيتم إعادة المحاولة تلقائياً`,
                    `⚠️ ${remainingQueue.length} registration(s) pending — will retry automatically`
                ),
                6000, "#f59e0b"
            );
        } else if (remainingQueue.length > 0 && successCount > 0) {
            toast(
                t(
                    `✅ تم تأكيد ${successCount} تسجيل | ⏳ ${remainingQueue.length} لسه في الانتظار`,
                    `✅ ${successCount} confirmed | ⏳ ${remainingQueue.length} still pending`
                ),
                6000, "#f59e0b"
            );
        }

    } catch (criticalError) {
        log('error', 'Critical sync failure:', criticalError);
        toast(
            t(
                '❌ خطأ غير متوقع أثناء المزامنة — تواصل مع الدعم',
                '❌ Unexpected sync error — contact support'
            ),
            8000, "#ef4444"
        );
    }
}


async function _syncEntry(entry, { doc, getDoc, writeBatch, serverTimestamp, db, user }) {

    for (let attempt = 1; attempt <= OA.MAX_RETRIES; attempt++) {
        try {
            const codeRef = doc(db, "issued_codes_logs", entry.sessionPin);
            let codeSnap;

            try {
                codeSnap = await getDoc(codeRef);
            } catch (networkErr) {
                log('warn', `Network glitch fetching PIN (Attempt ${attempt})`);
                return 'retry';
            }

            if (!codeSnap.exists()) {
                log('warn', `PIN ${entry.sessionPin} is invalid.`);
                offlineAlert(t(`❌ كود غير صحيح (${entry.sessionPin})`, `❌ Invalid PIN`));


                quarantineEntry(entry);
                return false;
            }

            const codeData = codeSnap.data();
            const doctorUID = codeData.doctorId;
            const college = codeData.college || "NURS";
            const rawSubject = codeData.subject;


            const openedAtMs = _toMs(codeData.openedAt);
            const OFFLINE_WINDOW_MS = 15_000;
            const offlineDeadline = openedAtMs + OFFLINE_WINDOW_MS;
            const LOOSE_DRIFT = 4000;

            const submitted = entry.submissionTime;


            if (submitted < (openedAtMs - LOOSE_DRIFT) ||
                submitted > (offlineDeadline + LOOSE_DRIFT)) {
                log('warn', 'Offline window exceeded — must register in first 15s');
            
                offlineAlert(t("❌ فشل: لازم تسجل في أول 15 ثانية", "❌ Failed: Must register within first 15 seconds"));
                return false;
            }

            const sessionRef = doc(db, "active_sessions", doctorUID);
            let sessionSnap;

            try {
                sessionSnap = await getDoc(sessionRef);
            } catch (e) {
                log('warn', 'Failed to verify session status due to network.');
                return 'retry';
            }

            if (!sessionSnap.exists()) {
                log('info', 'Session doc invisible, retrying...');
                return 'retry';
            }

            const sessionData = sessionSnap.data();

            if (sessionData.isActive === false) {
                log('info', 'Session closed — saving offline attendance as post-session record.');

                const subDate = new Date(entry.submissionTime);
                const d = String(subDate.getDate()).padStart(2, '0');
                const m = String(subDate.getMonth() + 1).padStart(2, '0');
                const y = subDate.getFullYear();
                const dateKey = `${d}-${m}-${y}`;
                const fixedDateStr = `${d}/${m}/${y}`;
                const cleanSubKey = rawSubject.trim()
                    .replace(/\s+/g, '_')
                    .replace(/[^\w\u0600-\u06FF]/g, '');
                const recID = `${entry.studentID}_${dateKey}_${cleanSubKey}`;

                const postPayload = {
                    id: entry.studentID,
                    sessionPin: entry.sessionPin, // 👈 أضف هذا السطر هنا (مهم جداً للـ Rules)
                    name: entry.studentName,
                    subject: rawSubject,
                    college: college,
                    hall: codeData.hall || "Hall",
                    group: "GENERAL",
                    date: fixedDateStr,
                    time_str: subDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                    timestamp: serverTimestamp(),
                    status: "ATTENDED",
                    doctorUID: doctorUID,
                    doctorName: codeData.doctorName,
                    notes: "منضبط (أوفلاين - بعد إغلاق الجلسة)",
                    isOfflineSync: true,
                    isPostSession: true,
                };

                const postBatch = writeBatch(db);
                postBatch.set(doc(db, `attendance_${college}`, recID), postPayload);
                postBatch.set(doc(db, "attendance", recID), postPayload);
                postBatch.set(doc(db, "offline_attendance_log", recID), {
                    ...entry,
                    syncTimestamp: serverTimestamp(),
                    syncStatus: "SUCCESS_POST_SESSION_v3.2",
                    attempts: attempt,
                });
                await postBatch.commit();

                toast(
                    t(`✅ تم تسجيل حضورك (الجلسة كانت مغلقة)`,
                        `✅ Attendance recorded (session was closed)`),
                    5000, "#10b981"
                );
                beep();
                log('info', `✅ Post-session offline sync complete: ${recID}`);
                return true;   // ✅ يُحذف من الـ queue
            }

            const subDate = new Date(entry.submissionTime);
            const d = String(subDate.getDate()).padStart(2, '0');
            const m = String(subDate.getMonth() + 1).padStart(2, '0');
            const y = subDate.getFullYear();

            const dateKey = `${d}-${m}-${y}`;
            const fixedDateStr = `${d}/${m}/${y}`;
            const cleanSubKey = rawSubject.trim().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '');
            const recID = `${entry.studentID}_${dateKey}_${cleanSubKey}`;

            const batch = writeBatch(db);

            const payload = {
                id: entry.studentID,
                sessionPin: entry.sessionPin,
                name: entry.studentName,
                subject: rawSubject,
                college: college,
                hall: codeData.hall || "Hall",
                group: "GENERAL",
                date: fixedDateStr,
                time_str: subDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                timestamp: serverTimestamp(),
                status: "ATTENDED",
                doctorUID: doctorUID,
                doctorName: codeData.doctorName,
                notes: "منضبط (مزامنة ذكية v3.2)",
                isOfflineSync: true
            };

            batch.set(doc(db, `attendance_${college}`, recID), payload);
            batch.set(doc(db, "attendance", recID), payload);

            batch.set(doc(db, "active_sessions", doctorUID, "participants", user.uid), {
                id: entry.studentID,
                uid: user.uid,
                name: entry.studentName,
                avatarClass: entry.avatarClass,
                status: "active",
                timestamp: serverTimestamp(),
                isOfflineSync: true,
                submissionTime: entry.submissionTime
            });

            batch.set(doc(db, "offline_attendance_log", recID), {
                ...entry,
                syncTimestamp: serverTimestamp(),
                syncStatus: "SUCCESS_RESILIENT_v3.2",
                attempts: attempt
            });

            await batch.commit();

            localStorage.setItem('TARGET_DOCTOR_UID', doctorUID);
            sessionStorage.setItem('TARGET_DOCTOR_UID', doctorUID);

            toast(t(`✅ تم تأكيد حضورك بنجاح`, `✅ Attendance confirmed`), 5000, "#10b981");
            beep();

            if (typeof window.switchScreen === 'function')
                window.switchScreen('screenLiveSession');
            if (typeof window.startLiveSnapshotListener === 'function')
                window.startLiveSnapshotListener();

            log('info', `✅ Resilient Atomic Sync Complete: ${recID}`);
            return true;

        } catch (err) {
            log('error', `Sync fatal error on attempt ${attempt}:`, err.message);

            if (err.code === 'permission-denied') {
                log('critical', 'Firebase Rules blocking write. Quarantining entry.');
                toast(
                    t('❌ خطأ في الصلاحيات - تواصل مع الدعم الفني',
                        '❌ Permission error - contact support'),
                    8000, "#ef4444"
                );
                quarantineEntry({ ...entry, quarantineReason: 'permission-denied' });
                return false;
            }

            if (attempt < OA.MAX_RETRIES) {
                await _sleep(OA.RETRY_BASE_MS * Math.pow(2, attempt - 1));
            } else {
                return 'retry';
            }
        }
    }
    return 'retry';
}

function _toMs(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (val.seconds !== undefined) return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6);
    return Number(val);
}

function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function _getStudentFromCache() {
    try {
        const currentUser = window.auth?.currentUser;

        const raw = localStorage.getItem('cached_profile_data');
        if (raw) {
            const p = JSON.parse(raw);
            if (currentUser && p.uid !== currentUser.uid) return null;
            if (p.studentID) return {
                id: String(p.studentID).trim(),
                name: p.fullName || 'Student',
                avatar: p.avatarClass || 'fa-user-graduate',
                uid: p.uid,
            };
        }

        if (window.PersistentStore) {
            const idbRaw = await window.PersistentStore.get('cached_profile_data');
            if (idbRaw) {
                const p = JSON.parse(idbRaw);
                if (p.studentID) {
                    try { localStorage.setItem('cached_profile_data', idbRaw); } catch { }
                    return {
                        id: String(p.studentID).trim(),
                        name: p.fullName || 'Student',
                        avatar: p.avatarClass || 'fa-user-graduate',
                        uid: p.uid,
                    };
                }
            }
        }

        if (currentUser && navigator.onLine) {
            const { getDoc, doc } = await import(OA.FIRESTORE_CDN);
            const snap = await getDoc(doc(window.db, 'user_registrations', currentUser.uid));
            if (!snap.exists()) return null;

            const data = snap.data();
            const info = data.registrationInfo || data;
            const profile = {
                uid: currentUser.uid,
                studentID: info.studentID,
                fullName: info.fullName || 'Student',
                avatarClass: data.avatarClass || 'fa-user-graduate',
            };

            const profileStr = JSON.stringify(profile);
            try { localStorage.setItem('cached_profile_data', profileStr); } catch { }
            window.PersistentStore?.set('cached_profile_data', profileStr);

            return {
                id: String(profile.studentID).trim(),
                name: profile.fullName,
                avatar: profile.avatarClass,
                uid: profile.uid,
            };
        }

        return null;

    } catch (e) {
        log('error', 'Failed to get student data:', e.message);
        return null;
    }
}

function _setView(view) {
    const inputView = document.getElementById('offlineInputView');
    const processView = document.getElementById('offlineProcessView');
    const cancelBtn = document.getElementById('btnCancelOffline');

    if (view === 'input') {
        if (inputView) inputView.style.display = 'block';
        if (processView) processView.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'block';
    } else {
        if (inputView) inputView.style.display = 'none';
        if (processView) processView.style.display = 'block';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }
}

function _runCountdown(seconds, onDone) {
    if (_countdownTimer) clearTimeout(_countdownTimer);

    const timerEl = document.getElementById('offTimer');
    let remaining = seconds;

    function tick() {
        if (timerEl) timerEl.innerText = remaining;
        if (remaining <= 0) { onDone(); return; }
        remaining--;
        _countdownTimer = setTimeout(tick, 1000);
    }

    tick();
}


window.cancelOfflineRegistration = function () {
    if (_countdownTimer) { clearTimeout(_countdownTimer); _countdownTimer = null; }
    const modal = document.getElementById('offlineRegModal');
    if (modal) modal.style.display = 'none';
};

window.forceSyncOfflineData = async function () {
    if (_syncPromise) {
        log('info', 'Waiting for ongoing sync before forcing...');
        await _syncPromise;
    }
    return syncOfflineData();
};

window.inspectOfflineQueue = async function () {
    if (window.APP_ENV === 'production') {
        const user = window.auth?.currentUser;
        if (!user) { console.warn('[NursingOffline] Not authenticated.'); return; }

        try {
            const token = await user.getIdTokenResult();
            if (!token.claims?.admin) {
                console.warn('[NursingOffline] Admin access required.');
                return;
            }
        } catch {
            console.warn('[NursingOffline] Could not verify admin claim.');
            return;
        }
    }

    const queue = await queueLoad();
    const quarantine = JSON.parse(localStorage.getItem(OA.QUARANTINE_KEY) || '[]');
    const rateInfo = JSON.parse(localStorage.getItem(OA.RATE_KEY) || '{}');

    console.table(queue.map(e => ({ ...e, _sig: e._sig ? `${e._sig.slice(0, 12)}…` : 'none' })));
    console.info(`Pending: ${queue.length} | Quarantined: ${quarantine.length}`);
    console.info('Rate limit:', rateInfo);

    return { queue, quarantine, rateInfo };
};


(async function _migrateFromV2() {
    const OLD_KEY = "nursing_offline_queue_v2";
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return;

    const existing = await queueLoad();
    if (existing.length > 0) {
        localStorage.removeItem(OLD_KEY);
        return;
    }

    try {
        const decoded = decodeURIComponent(escape(atob(raw)));
        const oldQueue = JSON.parse(decoded);

        if (Array.isArray(oldQueue) && oldQueue.length > 0) {
            log('info', `Migrating ${oldQueue.length} entries from v2 to v3...`);
            await queueSave(oldQueue);
            log('info', 'Migration complete.');
        }
    } catch {
        log('warn', 'Failed to migrate v2 queue. Starting fresh.');
    }

    localStorage.removeItem(OLD_KEY);
})();
function offlineAlert(msg, type = 'error') {
    const modal = document.getElementById('offlineAlertModal');
    const msgEl = document.getElementById('offlineAlertMsg');
    const icon = document.getElementById('offlineAlertIcon');
    const wrap = document.getElementById('offlineAlertIconWrap');

    if (!modal) { alert(msg); return; }

    msgEl.innerText = msg;

    const styles = {
        error: ['fa-circle-exclamation', '#ef4444', 'rgba(239,68,68,0.15)', 'rgba(239,68,68,0.3)'],
        success: ['fa-circle-check', '#10b981', 'rgba(16,185,129,0.15)', 'rgba(16,185,129,0.3)'],
        warning: ['fa-triangle-exclamation', '#f59e0b', 'rgba(245,158,11,0.15)', 'rgba(245,158,11,0.3)'],
    };

    const [ic, color, bg, border] = styles[type] || styles.error;
    icon.className = `fa-solid ${ic}`;
    icon.style.color = color;
    wrap.style.background = bg;
    wrap.style.borderColor = border;

    modal.style.display = 'flex';
}
