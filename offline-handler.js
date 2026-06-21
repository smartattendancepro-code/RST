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
            offlineVerifyToken: entry.offlineVerifyToken || null,
            patternInput: entry.patternInput || null,
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
    if (!entry._sig) return true;

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
        offlineAlert(t("⚠️ سجّلت هذه الجلسة بالفعل", "⚠️ Already registered this session"), 'warning');
        return;
    }

    if (queue.length >= OA.MAX_QUEUE_SIZE) {
        offlineAlert(t(
            "⚠️ قائمة الانتظار ممتلئة، يرجى الاتصال بالإنترنت أولاً",
            "⚠️ Queue full, please sync first"
        ), 'warning');
        return;
    }

    const patternToggle = document.getElementById('btnOfflinePattern');
    const isPatternOn = patternToggle?.dataset.on === 'true';

    if (isPatternOn) {
        window._pendingOfflineStudent = studentData;
        window._pendingOfflinePin = sessionPin;
        window._offlinePatternAttempts = 0;
        openOfflinePatternModal();
    } else {
        _setView('process');
        _runCountdown(OA.COUNTDOWN_SEC, () => _saveEntry(studentData, sessionPin));
    }
};

async function _saveEntry(studentData, sessionPin) {
    const submissionTime = Date.now();
    const offlineEntry = {
        studentID: studentData.id,
        studentName: studentData.name,
        avatarClass: studentData.avatar,
        sessionPin: sessionPin,
        submissionTime: submissionTime,
        patternInput: window.getOfflinePattern?.() || null,
        offlineVerifyToken: window._offlineVerifyToken || null,
        deviceId: window.HARDWARE_ID || "DEVICE_OFFLINE",
        appVersion: window.APP_VERSION || "3.0",
        group: studentData.group || "GENERAL", // ✅ ضيف السطر ده
    };

    window._offlineVerifyToken = null;

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

        const { doc, getDoc, writeBatch, serverTimestamp, Timestamp } = _firestoreCache;
        const db = window.db;
        if (!db) { log('error', 'window.db not available'); return; }

        const remainingQueue = [];
        let successCount = 0;
        let failCount = 0;
        const uid = user.uid;

        const results = await Promise.allSettled(
            queue.map(async (entry) => {
                const isValid = await _verifyEntry(entry, uid);

                if (!isValid) {
                    log('warn', 'Tampered entry detected, quarantining:', entry.sessionPin);
                    toast(
                        t('⚠️ تم اكتشاف تلاعب في بيانات محفوظة', '⚠️ Tampered entry detected'),
                        5000, "#ef4444"
                    );
                    quarantineEntry(entry);
                    return { status: 'quarantine' };
                }

                const result = await _syncEntry(entry, { doc, getDoc, writeBatch, serverTimestamp, Timestamp, db, user });
                return { status: result, entry };
            })
        );

        for (let i = 0; i < results.length; i++) {
            const r = results[i];

            if (r.status === 'rejected') {
                failCount++;
                continue;
            }

            const val = r.value;
            if (!val || val.status === 'quarantine') {
                failCount++;
            } else if (val.status === true) {
                successCount++;
            } else if (val.status === 'retry') {
                remainingQueue.push(val.entry);
                failCount++;
            } else {
                failCount++;
            }
        }

        await queueSave(remainingQueue);
        log('info', `Sync complete. Remaining: ${remainingQueue.length}`);

        // الجديد
        let quarantineCount = 0;
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r.status === 'rejected') { failCount++; continue; }
            const val = r.value;
            if (!val || val.status === 'quarantine') { quarantineCount++; }
        }

        if (successCount > 0 && remainingQueue.length === 0 && quarantineCount === 0) {
            toast(
                t(`✅ تم تأكيد ${successCount} تسجيل بنجاح`, `✅ ${successCount} registration(s) confirmed`),
                5000, "#10b981"
            );
        } else if (successCount > 0 && remainingQueue.length > 0 && quarantineCount === 0) {
            toast(
                t(
                    `✅ نجح ${successCount} | ⏳ ${remainingQueue.length} سيُعاد المحاولة تلقائياً`,
                    `✅ ${successCount} confirmed | ⏳ ${remainingQueue.length} will retry`
                ),
                6000, "#f59e0b"
            );
        } else if (successCount > 0 && quarantineCount > 0) {
            toast(
                t(
                    `✅ نجح ${successCount} | ❌ رُفض ${quarantineCount} نهائياً (نمط خاطئ أو بيانات تالفة)`,
                    `✅ ${successCount} confirmed | ❌ ${quarantineCount} permanently rejected`
                ),
                8000, "#ef4444"
            );
        } else if (remainingQueue.length > 0 && successCount === 0 && quarantineCount === 0) {
            toast(
                t(
                    `⚠️ فشلت مزامنة ${remainingQueue.length} تسجيل — سيتم إعادة المحاولة`,
                    `⚠️ ${remainingQueue.length} pending — will retry automatically`
                ),
                6000, "#f59e0b"
            );
        } else if (quarantineCount > 0 && successCount === 0) {
            toast(
                t(
                    `❌ تم رفض ${quarantineCount} تسجيل نهائياً — تواصل مع الدكتور`,
                    `❌ ${quarantineCount} registration(s) permanently rejected — contact your doctor`
                ),
                8000, "#ef4444"
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

function _verifyPattern(entryPatternRaw, sessionPasswordRaw) {
    if (!sessionPasswordRaw) return true;

    if (!entryPatternRaw) return false;

    try {
        const doctorPwd = JSON.parse(sessionPasswordRaw);
        const studentPwd = JSON.parse(entryPatternRaw);

        if (doctorPwd.type !== 'pattern' || studentPwd.type !== 'pattern') return false;

        const doctorPath = doctorPwd.path;
        const studentPath = studentPwd.path;

        if (!Array.isArray(doctorPath) || !Array.isArray(studentPath)) return false;
        if (doctorPath.length !== studentPath.length) return false;

        if (doctorPwd.mapping) {
            const mappedStudentPath = studentPath.map(idx => doctorPwd.mapping[idx]);
            return JSON.stringify(mappedStudentPath) === JSON.stringify(doctorPath);
        }

        return JSON.stringify(studentPath) === JSON.stringify(doctorPath);

    } catch (e) {
        log('warn', '_verifyPattern parse error:', e.message);
        return false;
    }
}

async function _syncEntry(entry, { doc, getDoc, writeBatch, serverTimestamp, Timestamp, db, user }) {

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
            const sessionPassword = codeData.sessionPassword || null;

            // ✅ متغير نتيجة التحقق من الباترن
            let patternAlreadyVerified = false;

            if (sessionPassword) {
                if (!entry.offlineVerifyToken) {
                    log('warn', `Missing pattern token | PIN: ${entry.sessionPin}`);
                    quarantineEntry({ ...entry, quarantineReason: 'missing-pattern-token' });
                    return false;
                }

                if (!entry.patternInput) {
                    log('warn', `Missing pattern data | PIN: ${entry.sessionPin}`);
                    quarantineEntry({ ...entry, quarantineReason: 'missing-pattern-data' });
                    return false;
                }
                try {
                    const tokenRef = doc(db, "pattern_tokens", `${user.uid}_${entry.sessionPin}`);
                    const tokenSnap = await getDoc(tokenRef);

                    if (tokenSnap.exists()) {
                        const tokenData = tokenSnap.data();
                        const notExpired = _toMs(tokenData.expiresAt) > entry.submissionTime;

                        if (tokenData.token === entry.offlineVerifyToken && notExpired) {
                            patternAlreadyVerified = true;
                            log('info', `✅ Pattern pre-verified via Firestore token | PIN: ${entry.sessionPin}`);
                        }
                    }
                } catch (e) {
                    log('warn', `pattern_tokens read failed, falling back to API: ${e.message}`);
                }

                // 🐌 المسار الاحتياطي: API
                if (!patternAlreadyVerified) {
                    try {
                        const currentUser = window.auth?.currentUser;
                        if (!currentUser) return 'retry';

                        const idToken = await currentUser.getIdToken(true);
                        const savedPath = JSON.parse(entry.patternInput);

                        if (!savedPath?.path || !Array.isArray(savedPath.path)) {
                            offlineAlert(
                                t('❌ بيانات النمط تالفة — تم رفض التسجيل', '❌ Corrupted pattern data — registration rejected'),
                                'error'
                            );
                            quarantineEntry({ ...entry, quarantineReason: 'invalid-pattern-format' });
                            return false;
                        }

                        const verifyRes = await fetch(
                            'https://nursing-backend-rej8.vercel.app/api/verifyOfflinePattern',
                            {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${idToken}`
                                },
                                body: JSON.stringify({
                                    sessionPin: entry.sessionPin,
                                    patternPath: savedPath.path
                                }),
                                signal: AbortSignal.timeout(8000)
                            }
                        );

                        // 401 = التوكن منتهي → نحاول تاني
                        if (verifyRes.status === 401) {
                            log('warn', `Token expired during pattern verify (PIN: ${entry.sessionPin}) — retrying`);
                            return 'retry';
                        }

                        // 429 = تجاوز المحاولات → نحاول بعدين
                        if (verifyRes.status === 429) {
                            log('warn', `Rate limited on pattern verify (PIN: ${entry.sessionPin}) — retrying later`);
                            offlineAlert(
                                t('⛔ تجاوزت عدد المحاولات — سيتم إعادة المحاولة تلقائياً', '⛔ Too many attempts — will retry automatically'),
                                'warning'
                            );
                            return 'retry';
                        }

                        // 403 = الباترن غلط فعلاً → نرفض نهائياً
                        if (verifyRes.status === 403) {
                            const errData = await verifyRes.json().catch(() => ({}));
                            log('warn', `Wrong pattern on sync | PIN: ${entry.sessionPin} | ${errData.error || ''}`);
                            offlineAlert(
                                t(
                                    `❌ النمط غير صحيح — تم رفض تسجيل الحضور (${entry.sessionPin})`,
                                    `❌ Wrong pattern — attendance rejected (${entry.sessionPin})`
                                ),
                                'error'
                            );
                            quarantineEntry({ ...entry, quarantineReason: 'pattern-wrong-on-sync' });
                            return false;
                        }

                        // أي خطأ تاني غير متوقع
                        if (!verifyRes.ok) {
                            const errData = await verifyRes.json().catch(() => ({}));
                            log('warn', `Pattern verify failed (${verifyRes.status}) | PIN: ${entry.sessionPin} | ${errData.error || ''}`);
                            offlineAlert(
                                t(
                                    `⚠️ خطأ في التحقق من النمط (${verifyRes.status}) — حاول مجدداً`,
                                    `⚠️ Pattern verify error (${verifyRes.status}) — please retry`
                                ),
                                'warning'
                            );
                            return 'retry';
                        }

                        // ✅ نجح التحقق عبر API
                        patternAlreadyVerified = true;
                        log('info', `✅ Pattern verified on sync via API | PIN: ${entry.sessionPin}`);
                        toast(
                            t(`✅ تم التحقق من النمط بنجاح`, `✅ Pattern verified successfully`),
                            3000, "#10b981"
                        );

                    } catch (e) {
                        log('warn', `Pattern re-verify network error | PIN: ${entry.sessionPin} | ${e.message}`);
                        offlineAlert(
                            t('⚠️ تعذّر الاتصال للتحقق من النمط — سيتم إعادة المحاولة', '⚠️ Network error during pattern verify — will retry'),
                            'warning'
                        );
                        return 'retry';
                    }
                }

                // 🛡️ حاجز أمان نهائي: لو لسه مش verified بعد كل المسارات → وقف
                if (!patternAlreadyVerified) {
                    log('warn', `Pattern block exited without verification | PIN: ${entry.sessionPin}`);
                    quarantineEntry({ ...entry, quarantineReason: 'pattern-unverified' });
                    return false;
                }
            }

            const openedAtMs = _toMs(codeData.openedAt);
            const OFFLINE_WINDOW_MS = 25_000;
            const offlineDeadline = openedAtMs + OFFLINE_WINDOW_MS;
            const LOOSE_DRIFT = 4000;
            const submitted = entry.submissionTime;

            if (submitted < (openedAtMs - LOOSE_DRIFT) ||
                submitted > (offlineDeadline + LOOSE_DRIFT)) {
                log('warn', 'Offline window exceeded — must register in first 25s');
                offlineAlert(t("❌ فشل: لازم تسجل في أول 25 ثانية", "❌ Failed: Must register within first 25 seconds"));
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

            if (sessionData.sessionCode && sessionData.sessionCode !== entry.sessionPin) {
                sessionData.isActive = false;
            }

            if (sessionData.isActive === false) {
                log('info', 'Session closed — verifying via secure backend.');

                try {
                    const currentUser = window.auth?.currentUser;
                    if (!currentUser) return 'retry';
                    const idToken = await currentUser.getIdToken(true);

                    const syncRes = await fetch(
                        'https://nursing-backend-rej8.vercel.app/api/syncPostSessionAttendance',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${idToken}`
                            },
                            body: JSON.stringify({
                                sessionPin: entry.sessionPin,
                                submissionTime: entry.submissionTime
                            }),
                            signal: AbortSignal.timeout(8000)
                        }
                    );

                    if (syncRes.status >= 500) return 'retry';

                    if (syncRes.status === 401 || syncRes.status === 403) {
                        log('warn', `Auth rejected post-session sync (status ${syncRes.status}) — retrying`);
                        return 'retry';
                    }

                    if (!syncRes.ok) {
                        const errData = await syncRes.json().catch(() => ({}));
                        log('warn', `Post-session sync rejected: ${errData.error || syncRes.status}`);
                        offlineAlert(t(
                            `❌ فشل تسجيل الحضور: ${errData.error || 'خطأ غير معروف'}`,
                            `❌ Attendance failed: ${errData.error || 'Unknown error'}`
                        ), 'error');
                        quarantineEntry({ ...entry, quarantineReason: errData.error || 'post-session-rejected' });
                        return false;
                    }

                    offlineAlert(t(`✅ تم تسجيل حضورك (الجلسة كانت مغلقة)`, `✅ Attendance recorded (session was closed)`), 'success');
                    beep();
                    log('info', `✅ Post-session offline sync complete via backend: ${entry.sessionPin}`);

                    window.dispatchEvent(new CustomEvent('attendanceSynced', {
                        detail: { studentID: entry.studentID, sessionPin: entry.sessionPin, postSession: true }
                    }));

                    return true;

                } catch (netErr) {
                    log('warn', `Post-session sync network error: ${netErr.message}`);
                    return 'retry';
                }
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
                group: entry.group || codeData.targetGroups?.[0] || "GENERAL",
                date: fixedDateStr,
                time_str: subDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                timestamp: Timestamp.fromMillis(entry.submissionTime),
                status: "ATTENDED",
                doctorUID: doctorUID,
                doctorName: codeData.doctorName,
                notes: "منضبط (مزامنة ذكية v3.2)",
                isOfflineSync: true
            };

            batch.set(doc(db, `attendance_${college}`, recID), payload);
            batch.set(doc(db, 'attendance', recID), payload);

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

            beep();
            toast(
                t(`✅ تم تأكيد حضورك بنجاح`, `✅ Attendance confirmed`),
                4000, "#10b981"
            );

            if (typeof window.switchScreen === 'function')
                window.switchScreen('screenLiveSession');
            if (typeof window.startLiveSnapshotListener === 'function')
                window.startLiveSnapshotListener();

            window.dispatchEvent(new CustomEvent('attendanceSynced', {
                detail: { studentID: entry.studentID, sessionPin: entry.sessionPin, postSession: false }
            }));

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
                group: p.group || "GENERAL",
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
                        group: p.group || "GENERAL",
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
                group: profile.group || "GENERAL",
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
(function initOfflinePattern() {
    'use strict';

    const CSS = `
        #offlinePatternModal,
        #offlinePatternModal * {
            direction: ltr !important;
            unicode-bidi: isolate !important;
        }

        #offlinePatternGrid {
            position: relative;
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            grid-template-rows: repeat(4, 1fr) !important;
            gap: 0 !important;
            width: 260px;
            height: 260px;
            touch-action: none;
            -ms-touch-action: none;
            cursor: crosshair;
            font-size: 0 !important;
        }

        .oplk-cell {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 0 !important;
        }

        .oplk-dot {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #bae6fd;
            border: 2px solid #7dd3fc;
            pointer-events: none;
            transition: transform 0.15s ease, background 0.15s ease,
                        border-color 0.15s ease, box-shadow 0.15s ease;
            flex-shrink: 0;
            flex-grow: 0;
        }

        .oplk-dot.active {
            background: #6366f1 !important;
            border-color: #4f46e5 !important;
            transform: scale(1.6) !important;
            box-shadow: 0 0 12px rgba(99,102,241,0.6) !important;
        }

        .oplk-dot.error {
            background: #ef4444 !important;
            border-color: #b91c1c !important;
            transform: scale(1.6) !important;
            box-shadow: 0 0 12px rgba(239,68,68,0.5) !important;
        }

        #offlinePatternSvg {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            pointer-events: none;
            z-index: 10;
            overflow: visible;
        }
    `;

    let styleEl = document.getElementById('oplk-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'oplk-styles';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = CSS;

    let _drawing = false;
    let _path = [];
    let _dotPositions = [];
    let _rafId = null;
    let _activePointer = null;
    let _timerTick = null;
    let _savedPattern = null;
    let _resizeTimer = null;
    let _attempts = 0;

    const _lang = () => localStorage.getItem('sys_lang') || 'ar';
    const _t = (ar, en) => _lang() === 'ar' ? ar : en;

    function calcPositions() {
        const grid = document.getElementById('offlinePatternGrid');
        if (!grid) return;

        const gr = grid.getBoundingClientRect();
        if (gr.width === 0 || gr.height === 0) {
            requestAnimationFrame(calcPositions);
            return;
        }

        const dots = grid.querySelectorAll('.oplk-dot');
        if (dots.length !== 16) return;

        _dotPositions = [];
        dots.forEach((dot, i) => {
            const r = dot.getBoundingClientRect();
            _dotPositions.push({
                idx: i,
                x: (r.left + r.right) / 2 - gr.left,
                y: (r.top + r.bottom) / 2 - gr.top,
            });
        });
    }

    function buildGrid() {
        const grid = document.getElementById('offlinePatternGrid');
        const svg = document.getElementById('offlinePatternSvg');
        if (!grid || !svg) return;

        _drawing = false;
        _path = [];
        _dotPositions = [];
        if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }

        grid.innerHTML = '';
        svg.innerHTML = '';
        svg.removeAttribute('data-state');

        grid.setAttribute('translate', 'no');
        grid.classList.add('notranslate');

        for (let i = 0; i < 16; i++) {
            const cell = document.createElement('div');
            cell.className = 'oplk-cell';
            cell.setAttribute('translate', 'no');

            const dot = document.createElement('div');
            dot.className = 'oplk-dot';
            dot.dataset.idx = String(i);
            dot.setAttribute('translate', 'no');

            cell.appendChild(dot);
            grid.appendChild(cell);
        }

        requestAnimationFrame(() => requestAnimationFrame(calcPositions));
    }

    function hitTest(clientX, clientY) {
        const grid = document.getElementById('offlinePatternGrid');
        if (!grid || _dotPositions.length === 0) return -1;

        const gr = grid.getBoundingClientRect();
        const dynamicRadius = Math.min(gr.width, gr.height) / 8;
        const rx = clientX - gr.left;
        const ry = clientY - gr.top;

        let best = -1, bestDist = dynamicRadius;
        for (const dp of _dotPositions) {
            const d = Math.hypot(rx - dp.x, ry - dp.y);
            if (d < bestDist) { bestDist = d; best = dp.idx; }
        }
        return best;
    }

    function renderLines(liveX, liveY) {
        const svg = document.getElementById('offlinePatternSvg');
        if (!svg) return;

        const isError = svg.dataset.state === 'error';
        const stroke = isError ? '#ef4444' : '#6366f1';
        let html = '';

        for (let k = 0; k < _path.length - 1; k++) {
            const a = _dotPositions[_path[k]];
            const b = _dotPositions[_path[k + 1]];
            if (a && b) {
                html += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
                    stroke="${stroke}" stroke-width="3.5"
                    stroke-linecap="round" opacity="${isError ? 0.7 : 1}"/>`;
            }
        }

        if (_drawing && liveX !== undefined && _path.length > 0) {
            const last = _dotPositions[_path[_path.length - 1]];
            const gr = document.getElementById('offlinePatternGrid')?.getBoundingClientRect();
            if (last && gr) {
                html += `<line x1="${last.x}" y1="${last.y}"
                    x2="${liveX - gr.left}" y2="${liveY - gr.top}"
                    stroke="${stroke}" stroke-width="3"
                    stroke-linecap="round" opacity="0.4"
                    stroke-dasharray="6 4"/>`;
            }
        }

        svg.innerHTML = html;
    }

    function activateDot(idx) {
        const dot = document.querySelector(`.oplk-dot[data-idx="${idx}"]`);
        dot?.classList.add('active');
        navigator.vibrate?.(12);
    }

    function showError(msg) {
        _drawing = false;
        const svg = document.getElementById('offlinePatternSvg');
        const hint = document.getElementById('offlinePatternHint');

        if (svg) svg.dataset.state = 'error';
        document.querySelectorAll('.oplk-dot.active').forEach(d => {
            d.classList.remove('active');
            d.classList.add('error');
        });
        renderLines();

        if (hint && msg) { hint.style.color = '#ef4444'; hint.innerText = msg; }
        navigator.vibrate?.([60, 40, 60]);

        _attempts++;

        if (_attempts >= 2) {
            clearInterval(_timerTick);
            setTimeout(() => {
                const modal = document.getElementById('offlinePatternModal');
                if (modal) modal.style.display = 'none';

                window._pendingOfflineStudent = null;
                window._pendingOfflinePin = null;
                _attempts = 0;
                _savedPattern = null;

                const btn = document.getElementById('btnOfflinePattern');
                const thumb = document.getElementById('offlinePatternThumb');
                const icon = document.getElementById('offlinePatternBtnIcon');
                if (btn) { btn.style.background = '#cbd5e1'; btn.style.borderColor = '#94a3b8'; btn.dataset.on = 'false'; }
                if (thumb) thumb.style.left = '1px';
                if (icon) { icon.className = 'fa-solid fa-lock'; icon.style.color = '#94a3b8'; }

                if (typeof offlineAlert === 'function') {
                    offlineAlert(_t(
                        '❌ تجاوزت عدد المحاولات المسموحة — أعد المحاولة من البداية',
                        '❌ Pattern attempts exceeded — please try again'
                    ), 'error');
                }
            }, 900);
            return;
        }

        setTimeout(() => {
            buildGrid();
            if (hint) {
                hint.style.color = '#f59e0b';
                hint.innerText = _t(
                    '⚠️ محاولة أخيرة — ارسم النمط بعناية',
                    '⚠️ Last attempt — draw carefully'
                );
            }
        }, 900);
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (_activePointer !== null) return;

        calcPositions();
        const idx = hitTest(e.clientX, e.clientY);
        if (idx === -1) return;

        e.preventDefault();
        e.target?.setPointerCapture?.(e.pointerId);
        _activePointer = e.pointerId;
        _drawing = true;
        _path = [idx];
        activateDot(idx);
        renderLines(e.clientX, e.clientY);
    }

    function onPointerMove(e) {
        if (!_drawing || e.pointerId !== _activePointer) return;
        e.preventDefault();

        const idx = hitTest(e.clientX, e.clientY);
        if (idx !== -1 && !_path.includes(idx)) {
            _path.push(idx);
            activateDot(idx);
        }

        if (_rafId) cancelAnimationFrame(_rafId);
        const cx = e.clientX, cy = e.clientY;
        _rafId = requestAnimationFrame(() => renderLines(cx, cy));
    }

    function onPointerUp(e) {
        if (!_drawing || e.pointerId !== _activePointer) return;
        _activePointer = null;
        _drawing = false;
        if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
        renderLines();
        finalizePattern();
    }

    function attachEvents() {
        const grid = document.getElementById('offlinePatternGrid');
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
                onPointerDown({
                    clientX: t.clientX, clientY: t.clientY,
                    pointerId: t.identifier, pointerType: 'touch',
                    button: 0,
                    preventDefault: () => e.preventDefault(),
                    target: grid
                });
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

    function watchResize() {
        const grid = document.getElementById('offlinePatternGrid');
        if (!grid) return;

        if ('ResizeObserver' in window) {
            new ResizeObserver(() => {
                clearTimeout(_resizeTimer);
                _resizeTimer = setTimeout(calcPositions, 100);
            }).observe(grid);
        }

        window.addEventListener('resize', () => {
            clearTimeout(_resizeTimer);
            _resizeTimer = setTimeout(calcPositions, 100);
        });

        window.addEventListener('orientationchange', () => {
            setTimeout(calcPositions, 300);
        });
    }

    function watchMutations() {
        const grid = document.getElementById('offlinePatternGrid');
        if (!grid || !('MutationObserver' in window)) return;

        new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.type === 'childList' && m.addedNodes.length > 0) {
                    requestAnimationFrame(() => requestAnimationFrame(calcPositions));
                    break;
                }
            }
        }).observe(grid, { childList: true, subtree: true });
    }

    function startTimer() {
        let remaining = 20;
        const timerEl = document.getElementById('offlinePatternTimer');
        clearInterval(_timerTick);
        _timerTick = setInterval(() => {
            remaining--;
            if (timerEl) timerEl.innerText = remaining;
            if (remaining <= 5 && timerEl) timerEl.style.color = '#ef4444';
            if (remaining <= 0) {
                clearInterval(_timerTick);
                const modal = document.getElementById('offlinePatternModal');
                if (modal) modal.style.display = 'none';
                if (typeof offlineAlert === 'function') {
                    offlineAlert(_t('⏰ انتهى وقت رسم النمط', '⏰ Pattern time expired'), 'warning');
                }
            }
        }, 1000);
    }

    async function finalizePattern() {
        if (_path.length < 3) {
            showError(_t('ارسم على الأقل 3 نقاط', 'Draw at least 3 dots'));
            return;
        }

        const pin = window._pendingOfflinePin;
        const student = window._pendingOfflineStudent;
        if (!pin || !student) return;

        if (!navigator.onLine) {
            _savedPattern = JSON.stringify({ type: 'pattern', path: _path });
            window._offlineVerifyToken = `OFFLINE_VERIFIED_${Date.now()}`;
            clearInterval(_timerTick);
            _continueAfterPattern(student, pin);
            return;
        }

        try {
            const user = window.auth?.currentUser;
            if (!user) { showError(_t('يجب تسجيل الدخول', 'Please login first')); return; }

            const idToken = await user.getIdToken(true);

            const verifyRes = await fetch(
                'https://nursing-backend-rej8.vercel.app/api/verifyOfflinePattern',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        sessionPin: pin,
                        patternPath: [..._path]
                    })
                }
            );

            const verifyData = await verifyRes.json();

            if (!verifyRes.ok) {
                showError(verifyData.error || _t('❌ النمط غير صحيح', '❌ Wrong pattern'));
                if (verifyData.attemptsLeft === 0) {
                    setTimeout(() => {
                        document.getElementById('offlinePatternModal').style.display = 'none';
                    }, 900);
                }
                return;
            }
            window._offlineVerifyToken = verifyData.verifyToken;
            _savedPattern = 'VERIFIED';
            clearInterval(_timerTick);
            _continueAfterPattern(student, pin);

        } catch (e) {
            _savedPattern = JSON.stringify({ type: 'pattern', path: _path });
            window._offlineVerifyToken = `OFFLINE_VERIFIED_${Date.now()}`;
            clearInterval(_timerTick);
            _continueAfterPattern(student, pin);
        }
    }

    function _continueAfterPattern(student, pin) {
        const btn = document.getElementById('btnOfflinePattern');
        const thumb = document.getElementById('offlinePatternThumb');
        const icon = document.getElementById('offlinePatternBtnIcon');
        if (btn) { btn.style.background = '#10b981'; btn.style.borderColor = '#059669'; btn.dataset.on = 'true'; }
        if (thumb) thumb.style.left = '24px';
        if (icon) { icon.className = 'fa-solid fa-lock-open'; icon.style.color = '#10b981'; }

        const modal = document.getElementById('offlinePatternModal');
        if (modal) modal.style.display = 'none';

        window._pendingOfflineStudent = null;
        window._pendingOfflinePin = null;
        _attempts = 0;

        if (typeof _setView === 'function') _setView('process');
        if (typeof _runCountdown === 'function') {
            _runCountdown(OA.COUNTDOWN_SEC, () => {
                if (typeof _saveEntry === 'function') _saveEntry(student, pin);
            });
        }
    }

    window.openOfflinePatternModal = function () {
        _savedPattern = null;
        _attempts = 0;
        const modal = document.getElementById('offlinePatternModal');
        if (!modal) return;
        modal.style.display = 'flex';

        setTimeout(() => {
            buildGrid();
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    attachEvents();
                    watchResize();
                    watchMutations();
                    startTimer();
                });
            });
        }, 50);
    };

    window.resetOfflinePattern = function () {
        buildGrid();
        requestAnimationFrame(() => requestAnimationFrame(attachEvents));
    };

    window.skipOfflinePattern = function () {
        clearInterval(_timerTick);
        _savedPattern = null;
        _attempts = 0;
        window._pendingOfflineStudent = null;
        window._pendingOfflinePin = null;

        const btn = document.getElementById('btnOfflinePattern');
        const thumb = document.getElementById('offlinePatternThumb');
        const icon = document.getElementById('offlinePatternBtnIcon');
        if (btn) { btn.style.background = '#cbd5e1'; btn.style.borderColor = '#94a3b8'; btn.dataset.on = 'false'; }
        if (thumb) thumb.style.left = '1px';
        if (icon) { icon.className = 'fa-solid fa-lock'; icon.style.color = '#94a3b8'; }

        const modal = document.getElementById('offlinePatternModal');
        if (modal) modal.style.display = 'none';
    };

    window.getOfflinePattern = function () {
        return _savedPattern;
    };

    window.toggleOfflinePattern = function () {
        const btn = document.getElementById('btnOfflinePattern');
        const thumb = document.getElementById('offlinePatternThumb');
        const icon = document.getElementById('offlinePatternBtnIcon');
        if (!btn) return;

        const isOn = btn.dataset.on === 'true';
        if (!isOn) {
            btn.style.background = '#6366f1';
            btn.style.borderColor = '#4f46e5';
            thumb.style.left = '24px';
            icon.className = 'fa-solid fa-lock-open';
            icon.style.color = '#6366f1';
            btn.dataset.on = 'true';
        } else {
            btn.style.background = '#cbd5e1';
            btn.style.borderColor = '#94a3b8';
            thumb.style.left = '1px';
            icon.className = 'fa-solid fa-lock';
            icon.style.color = '#94a3b8';
            btn.dataset.on = 'false';
            _savedPattern = null;
        }
    };

})();
