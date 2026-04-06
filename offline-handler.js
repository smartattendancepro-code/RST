
'use strict';

const OA = {
    STORAGE_KEY: "nursing_offline_queue_v2",
    QUARANTINE_KEY: "nursing_offline_quarantine_v2",
    FIRESTORE_CDN: "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
    PIN_LENGTH: 6,
    COUNTDOWN_SEC: 3,
    SYNC_BOOT_DELAY: 5000,   
    MAX_RETRIES: 3,
    RETRY_BASE_MS: 1500,  
    MAX_QUEUE_SIZE: 200,    
};

let _firestoreCache = null;  
let _syncMutex = false;  
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
    console[level](prefix, ...args);
}

function queueLoad() {
    try {
        const raw = localStorage.getItem(OA.STORAGE_KEY);
        if (!raw) return [];
        const decrypted = decodeURIComponent(escape(atob(raw)));
        const parsed = JSON.parse(decrypted);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function queueSave(arr) {
    const safe = arr.slice(-OA.MAX_QUEUE_SIZE);
    const encrypted = btoa(unescape(encodeURIComponent(JSON.stringify(safe))));
    localStorage.setItem(OA.STORAGE_KEY, encrypted);
    _updateBadge(safe.length);
}

function quarantineEntry(entry) {
    try {
        const q = JSON.parse(localStorage.getItem(OA.QUARANTINE_KEY) || "[]");
        q.push({ ...entry, quarantinedAt: Date.now() });
        localStorage.setItem(OA.QUARANTINE_KEY, JSON.stringify(q));
        log('warn', 'Entry quarantined:', entry.sessionPin);
    } catch {  }
}

function entryKey(studentID, sessionPin) {
    return `${studentID}_${sessionPin}`;
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

document.addEventListener('DOMContentLoaded', () => {
    controlOfflineButtonVisibility();
    _updateBadge(queueLoad().length);
    setTimeout(syncOfflineData, OA.SYNC_BOOT_DELAY);
});

window.openOfflineRegistrationModal = function () {
    const modal = document.getElementById('offlineRegModal');
    const pinInput = document.getElementById('offSessionPin');
    if (!modal) return;

    // Reset state
    if (pinInput) pinInput.value = '';
    _setView('input');
    modal.style.display = 'flex';
    setTimeout(() => pinInput?.focus(), 100);
};

window.processOfflineQueue = async function () {
    const pinEl = document.getElementById('offSessionPin');
    if (!pinEl) return;

    const sessionPin = pinEl.value.trim();

    const studentData = _getStudentFromCache();
    if (!studentData) {
        alert(t("⚠️ يجب تسجيل الدخول أولاً أثناء وجود إنترنت", "⚠️ Please Login First while online"));
        return;
    }

    if (!/^\d{6}$/.test(sessionPin)) {
        alert(t("⚠️ الكود يجب أن يكون 6 أرقام فقط", "⚠️ PIN must be exactly 6 digits"));
        return;
    }

    const queue = queueLoad();
    const key = entryKey(studentData.id, sessionPin);
    if (queue.some(item => entryKey(item.studentID, item.sessionPin) === key)) {
        alert(t("⚠️ لقد سجّلت هذه الجلسة بالفعل", "⚠️ You already registered this session offline"));
        return;
    }

    if (queue.length >= OA.MAX_QUEUE_SIZE) {
        alert(t("⚠️ قائمة الانتظار ممتلئة، يرجى الاتصال بالإنترنت أولاً", "⚠️ Queue full, please sync first"));
        return;
    }

    _setView('process');
    _runCountdown(OA.COUNTDOWN_SEC, () => {
        _saveEntry(studentData, sessionPin);
    });
};

function _saveEntry(studentData, sessionPin) {
    const offlineEntry = {
        studentID: studentData.id,
        studentName: studentData.name,
        avatarClass: studentData.avatar,
        sessionPin: sessionPin,
        submissionTime: Date.now(),      
        deviceId: window.HARDWARE_ID || "DEVICE_OFFLINE",
        appVersion: window.APP_VERSION || "2.0",
    };

    const queue = queueLoad();
    queue.push(offlineEntry);
    queueSave(queue);

    toast(
        t("✅ تم الحفظ أوفلاين.. سيتم التأكيد فور عودة النت",
            "✅ Saved Offline.. Will sync on reconnect"),
        5000, "#1e293b"
    );
    beep();

    document.getElementById('offlineRegModal').style.display = 'none';

    if (navigator.onLine) syncOfflineData();
}

async function syncOfflineData() {

    if (_syncMutex) {
        log('info', 'Sync already running, skipping');
        return;
    }

    if (!navigator.onLine) return;

    const queue = queueLoad();
    if (queue.length === 0) return;

    const user = window.auth?.currentUser;
    if (!user) {
        log('info', 'Sync skipped: no authenticated user');
        return;
    }

    _syncMutex = true;
    log('info', `Sync started: ${queue.length} entries`);

    try {
        if (!_firestoreCache) {
            _firestoreCache = await import(OA.FIRESTORE_CDN);
            log('info', 'Firestore module loaded & cached');
        }
        const { doc, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp, increment } = _firestoreCache;

        const db = window.db;
        if (!db) { log('error', 'window.db not available'); return; }

        const remainingQueue = [];

        for (const entry of queue) {
            const success = await _syncEntry(entry, { doc, getDoc, writeBatch, serverTimestamp, db, user });
            if (success === 'retry') {
                remainingQueue.push(entry); 
            }
           
        }

        queueSave(remainingQueue);
        log('info', `Sync complete. Remaining: ${remainingQueue.length}`);

    } catch (criticalError) {
        log('error', 'Critical sync failure:', criticalError);
    } finally {
        _syncMutex = false;
    }
}

async function _syncEntry(entry, { doc, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp, db, user, increment }) {

    for (let attempt = 1; attempt <= OA.MAX_RETRIES; attempt++) {
        try {
            const codeRef = doc(db, "issued_codes_logs", entry.sessionPin);
            const codeSnap = await getDoc(codeRef);

            if (!codeSnap.exists()) {
                log('warn', `PIN ${entry.sessionPin} is globally invalid.`);
                toast(t(`❌ كود غير صحيح (${entry.sessionPin})`, `❌ Invalid PIN`), 5000, "#ef4444");
                quarantineEntry(entry);
                return false; 
            }

            const codeData = codeSnap.data();
            const doctorUID = codeData.doctorId;
            const college = codeData.college || "NURS";
            const rawSubject = codeData.subject;

            const openedAtMs  = _toMs(codeData.openedAt);
            const expiresAtMs = codeData.expiresAt === -1 ? Infinity : _toMs(codeData.expiresAt);
            const submitted   = entry.submissionTime; // وقت ضغط الطالب للزر (أوفلاين)

            const DRIFT_MS    = 5000; 

            if (submitted < (openedAtMs - DRIFT_MS) || submitted > (expiresAtMs + DRIFT_MS)) {
                log('warn', `Strict Reject: PIN recorded out of time window.`);
                toast(
                    t(`❌ فشل: انتهت صلاحية الكود (سجلت خارج الوقت المسموح)`,
                      `❌ Failed: Code expired (Outside allowed time)`),
                    6000, "#ef4444"
                );
                return false; 
            }

            const sessionRef = doc(db, "active_sessions", doctorUID);
            const sessionSnap = await getDoc(sessionRef);

            if (!sessionSnap.exists() || sessionSnap.data().isActive === false) {
                log('info', `Sync Rejected: Instructor already ended session.`);
                toast(
                    t(`❌ فشل التسجيل: المحاضر قد أنهى الجلسة وحفظ الكشوف بالفعل`,
                      `❌ Registration Failed: Instructor has already closed this session`),
                    7000, "#ef4444"
                );
                return false; 
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
                notes: "منضبط (مزامنة أوفلاين)",
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
                syncStatus: "SUCCESS_STRICT"
            });

            await batch.commit();

            localStorage.setItem('TARGET_DOCTOR_UID', doctorUID);
            sessionStorage.setItem('TARGET_DOCTOR_UID', doctorUID);

            toast(t(`✅ تم تأكيد حضورك بنجاح`, `✅ Attendance confirmed`), 5000, "#10b981");
            beep();

            if (typeof window.switchScreen === 'function') window.switchScreen('screenLiveSession');
            if (typeof window.startLiveSnapshotListener === 'function') window.startLiveSnapshotListener();

            log('info', `✅ Strict Atomic Sync Complete: ${recID}`);
            return true; 

        } catch (err) {
            log('warn', `Attempt ${attempt} failed:`, err.message);
            if (attempt < OA.MAX_RETRIES) await _sleep(OA.RETRY_BASE_MS * Math.pow(2, attempt - 1));
            else return 'retry'; 
        }
    }
    return 'retry';
}

function _toMs(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (val.seconds !== undefined) return val.seconds * 1000 + Math.floor(val.nanoseconds / 1e6);
    return Number(val);
}

function _formatDate(ms) {
    return new Date(ms).toLocaleDateString('en-GB'); 
}

function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function _getStudentFromCache() {
    try {
        const raw = localStorage.getItem('cached_profile_data');
        if (!raw) {
            log('info', 'No profile data found in storage.');
            return null;
        }

        const p = JSON.parse(raw);
        
        const currentUser = window.auth?.currentUser;


        if (navigator.onLine && currentUser) {
            if (p.uid !== currentUser.uid) {
                log('warn', 'Security alert: Logged-in user UID does not match cache. Sync blocked.');
                return null;
            }
        }

        if (!p.studentID) {
            log('warn', 'Cache corrupted: studentID missing.');
            return null;
        }

        return {
            id:     String(p.studentID).trim(),
            name:   p.fullName || "Student",
            avatar: p.avatarClass || "fa-user-graduate",
            uid:    p.uid 
        };

    } catch (e) { 
        log('error', 'Failed to parse student cache:', e.message);
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

        if (remaining <= 0) {
            onDone();
            return;
        }

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


window.forceSyncOfflineData = function () {
    _syncMutex = false; 
    return syncOfflineData();
};

window.inspectOfflineQueue = function () {
    const queue = queueLoad();
    const quarantine = JSON.parse(localStorage.getItem(OA.QUARANTINE_KEY) || "[]");
    console.table(queue);
    console.info(`Pending: ${queue.length} | Quarantined: ${quarantine.length}`);
    return { queue, quarantine };
};
