/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         SessionManager.student.js  —  v3.0 CLEAN               ║
 * ║──────────────────────────────────────────────────────────────────║
 * ║  مستخرج من الملف الأصلي — للطالب فقط                            ║
 * ║  ✅ لا يحتوي على أي منطق إداري أو صلاحيات دكتور/عميد            ║
 * ║                                                                  ║
 * ║  الوظائف المضمّنة:                                               ║
 * ║   syncServerTime()            مزامنة وقت الخادم                 ║
 * ║   listenToSessionState()      الاستماع لحالة الجلسة              ║
 * ║   handleSessionTimer()        العداد التنازلي                    ║
 * ║   startLiveSnapshotListener() شاشة الحضور اللحظي                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ── Imports — فقط ما يحتاجه الطالب ──────────────────────────────────
import {
    doc,
    collection,
    query,
    where,
    getDoc,
    onSnapshot,
    updateDoc,
    orderBy,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { applyVipTheme } from './VipThemeManager.js';

// ── المراجع العامة ────────────────────────────────────────────────────
const db   = window.db;
const auth = window.auth;

/** مؤقت العداد التنازلي */
let sessionInterval = null;

/** flag لمنع تكرار toast انتهاء الجلسة */
let _sessionEndedNotified = false;


// ════════════════════════════════════════════════════════════════════
//  syncServerTime
//  ────────────────────────────────────────────────────────────────
//  تزامن وقت الجهاز مع وقت الخادم لضمان دقة العداد
// ════════════════════════════════════════════════════════════════════
window.globalTimeOffset = 0;

async function syncServerTime() {
    try {
        const response = await fetch(window.location.href, {
            method: 'HEAD',
            cache: 'no-store'
        });

        const serverDateStr = response.headers.get('Date');
        if (!serverDateStr) return;

        const serverTime = new Date(serverDateStr).getTime();
        window.globalTimeOffset = serverTime - Date.now();

        console.log("⏱️ Time Sync Offset:", window.globalTimeOffset, "ms");
    } catch (e) {
        console.warn("⚠️ Time Sync Failed, using local time.", e);
    }
}

syncServerTime();


// ════════════════════════════════════════════════════════════════════
//  listenToSessionState
//  ────────────────────────────────────────────────────────────────
//  يستمع لـ:
//    • الإعدادات العامة (Quick Mode)
//    • حالة جلسة الدكتور المستهدف (مفتوحة / مغلقة)
//  ويُحدّث واجهة الطالب فور أي تغيير
// ════════════════════════════════════════════════════════════════════
window.listenToSessionState = function () {
    const user = auth.currentUser;

    if (!user) {
        console.warn("[Student] ⚠️ Auth غير جاهز — إعادة المحاولة بعد ثانية");
        setTimeout(window.listenToSessionState, 1000);
        return;
    }

    // ── أ) الاستماع على إعدادات Quick Mode ──────────────────────────
    const globalSettingsRef = doc(db, "settings", "control_panel");

    onSnapshot(globalSettingsRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        if (data.isQuickMode && data.quickModeFlags) {
            sessionStorage.setItem('is_quick_mode_active', 'true');
            sessionStorage.setItem('qm_disable_gps', data.quickModeFlags.disableGPS);
            sessionStorage.setItem('qm_disable_qr',  data.quickModeFlags.disableQR);
            window.applyQuickModeVisuals?.();
            window.handleQuickModeUI?.(true);
        } else {
            sessionStorage.setItem('is_quick_mode_active', 'false');
            window.removeQuickModeVisuals?.();
            window.handleQuickModeUI?.(false);
        }
    }, (err) => {
        console.warn("[Student] تحذير إعدادات عامة:", err.message);
    });

    // ── ب) الاستماع على جلسة الدكتور ────────────────────────────────
    const targetUID  = sessionStorage.getItem('TARGET_DOCTOR_UID');
    const sessionRef = doc(db, "active_sessions", targetUID || user.uid);

    window.unsubscribeSessionListener?.();

    window.unsubscribeSessionListener = onSnapshot(
        sessionRef,
        (docSnap) => {
            if (!docSnap.exists()) {
                window.handleSessionTimer(false, null, 0);
                return;
            }

            const data     = docSnap.data();
            const isActive = data.isActive === true;

            if (isActive) {
                // ── تحديث بيانات الهيدر ──────────────────────────────
                _setText('liveDocName',    data.doctorName    || "Professor");
                _setText('liveSubjectTag', data.allowedSubject || "");
                _setText('liveSessionCodeDisplay', "••••••"); // الكود مخفي دائماً

                const hallEl = document.getElementById('liveHallTag');
                if (hallEl) {
                    hallEl.innerHTML = `<i class="fa-solid fa-building-columns"></i> ${data.hall || ""}`;
                }

                const groupEl = document.getElementById('liveGroupTag');
                if (groupEl) {
                    groupEl.innerText = `GROUPS: ${(data.targetGroups || []).join(', ')}`;
                }

                const avatarEl = document.getElementById('liveDocAvatar');
                if (avatarEl && data.doctorAvatar) {
                    avatarEl.innerHTML           = `<i class="fa-solid ${data.doctorAvatar}"></i>`;
                    avatarEl.onclick             = null;
                    avatarEl.style.cursor        = "default";
                    avatarEl.style.pointerEvents = "none";
                }

                window.handleSessionTimer(true, data.startTime, data.duration);

            } else {
                window.handleSessionTimer(false, null, 0);
            }
        },
        (err) => {
            console.error("[Student] خطأ في مستمع الجلسة:", err.message);

            if (err.code === 'permission-denied') {
                console.info("[Student] 🔄 إعادة الاتصال بعد ثانيتين...");
                setTimeout(() => {
                    if (auth.currentUser) window.listenToSessionState();
                }, 2000);
            }
        }
    );
};


// ════════════════════════════════════════════════════════════════════
//  handleSessionTimer
//  ────────────────────────────────────────────────────────────────
//  يتحكم في العداد التنازلي الطافي للطالب فقط:
//    duration === -1  → وقت مفتوح (يعرض "OPEN")
//    duration > 0    → عداد تنازلي → إغلاق الشاشة عند الانتهاء
//    isActive=false  → يُخفي العداد
// ════════════════════════════════════════════════════════════════════
window.handleSessionTimer = function (isActive, startTime, duration) {
    const floatTimer = document.getElementById('studentFloatingTimer');
    const floatText  = document.getElementById('floatingTimeText');

    // إيقاف العداد السابق دائماً
    if (sessionInterval) {
        clearInterval(sessionInterval);
        sessionInterval = null;
    }

    if (!isActive) {
        if (floatTimer) floatTimer.style.display = 'none';
        return;
    }

    // ── تحديد وقت البداية مع مزامنة الخادم ─────────────────────────
    let startMs;

    if (startTime && typeof startTime.toMillis === 'function') {
        startMs = startTime.toMillis();
    } else if (typeof startTime === 'number') {
        startMs = startTime;
    } else {
        startMs = Date.now() + (window.globalTimeOffset || 0);
    }

    // ── دالة التحديث (كل ثانية) ─────────────────────────────────────
    const updateTick = () => {
        const serverNow  = Date.now() + (window.globalTimeOffset || 0);
        const elapsed    = Math.floor((serverNow - startMs) / 1000);
        let remaining    = duration - elapsed;
        if (remaining > duration) remaining = duration;

        // وقت مفتوح (∞)
        if (duration === -1) {
            if (floatTimer) floatTimer.style.display = 'flex';
            if (floatText)  floatText.innerText = "OPEN";
            return;
        }

        // وقت متبقٍ
        if (remaining > 0) {
            if (floatTimer) {
                floatTimer.style.display = 'flex';
                floatTimer.classList.toggle('urgent', remaining <= 10);
            }
            if (floatText) floatText.innerText = remaining + "s";
            return;
        }

        // ── انتهى الوقت ──────────────────────────────────────────────
        clearInterval(sessionInterval);
        sessionInterval = null;

        if (floatTimer) floatTimer.style.display = 'none';

        const activeScreen = document.querySelector('.section.active')?.id;

        if (activeScreen === 'screenDataEntry' && !window.isJoiningProcessActive) {
            window.resetApplicationState?.();
            switchScreen('screenWelcome');

            const modal = document.getElementById('systemTimeoutModal');
            if (modal) modal.style.display = 'flex';
        }
    };

    updateTick();
    sessionInterval = setInterval(updateTick, 1000);
};


// ════════════════════════════════════════════════════════════════════
//  startLiveSnapshotListener
//  ────────────────────────────────────────────────────────────────
//  يستمع للمشاركين ويعرض:
//    • كارت الطالب نفسه فقط (query by uid)
//    • عداد PRESENT من active_count في مستند الجلسة
//    • يُوجّه الطالب للخارج عند انتهاء الجلسة أو طرده
// ════════════════════════════════════════════════════════════════════
window.startLiveSnapshotListener = function () {
    const user = auth.currentUser;

    if (!user) {
        console.warn("[Student] ⏳ انتظار Auth...");
        setTimeout(window.startLiveSnapshotListener, 500);
        return;
    }

    // تجهيز الـ Grid
    const grid = document.getElementById('liveStudentsGrid');
    if (grid) {
        grid.style.removeProperty('grid-template-columns');
        grid.style.display = 'block';
        grid.innerHTML     = '';
    }

    const countEl = document.getElementById('livePresentCount');
    const extraEl = document.getElementById('liveExtraCount');

    const targetRoomUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
    if (!targetRoomUID) {
        console.error("[Student] ❌ TARGET_DOCTOR_UID غير موجود.");
        return;
    }

    // تطبيق ثيم غرفة الدكتور
    applyVipTheme(targetRoomUID);

    // ── أ) مستمع بيانات الجلسة (الهيدر + PRESENT count) ─────────────
    const sessionRef = doc(db, "active_sessions", targetRoomUID);

    // prefetch فوري لتجنب الـ flicker
    getDoc(sessionRef)
        .then((snap) => _updateStudentHeader(snap, countEl, extraEl))
        .catch((e)   => console.warn("[Student] Header Prefetch:", e));

    window.unsubscribeHeaderSession?.();
    window.unsubscribeHeaderSession = onSnapshot(
        sessionRef,
        (snap) => _updateStudentHeader(snap, countEl, extraEl),
        (err)  => console.warn("[Student] خطأ هيدر الجلسة:", err.message)
    );

    // ── ب) مستمع كارت الطالب نفسه فقط ──────────────────────────────
    const participantsRef = collection(
        db, "active_sessions", targetRoomUID, "participants"
    );
    const myQuery = query(participantsRef, where("uid", "==", user.uid));

    window.unsubscribeLiveSnapshot?.();
    window.unsubscribeLiveSnapshot = onSnapshot(
        myQuery,
        (snapshot) => _renderMyCard(snapshot, grid, user),
        (err)       => console.error("[Student] خطأ في مستمع الكارت:", err.message)
    );
};


// ═══════════════════════════════════════════════════════════════════
//  الدوال المساعدة الداخلية
// ═══════════════════════════════════════════════════════════════════

/**
 * تحديث هيدر الجلسة + عدادات PRESENT/EXTRA + التحقق من انتهاء الجلسة
 */
function _updateStudentHeader(docSnap, countEl, extraEl) {
    if (!docSnap.exists()) return;

    const data = docSnap.data();

    // ── بيانات الهيدر ─────────────────────────────────────────────────
    _setText('liveDocName',            data.doctorName    || "Professor");
    _setText('liveSubjectTag',         data.allowedSubject || "Subject");
    _setText('liveSessionCodeDisplay', "••••••"); // الكود مخفي دائماً

    const hallEl = document.getElementById('liveHallTag');
    if (hallEl) {
        hallEl.innerHTML =
            `<i class="fa-solid fa-building-columns"></i> ${data.hall || "Hall"}`;
    }

    const groupEl = document.getElementById('liveGroupTag');
    if (groupEl) {
        groupEl.innerText = `GROUPS: ${(data.targetGroups || []).join(', ')}`;
    }

    // الأفاتار والاسم — قراءة فقط
    ['liveDocAvatar', 'liveDocName'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'liveDocAvatar' && data.doctorAvatar) {
            el.innerHTML = `<i class="fa-solid ${data.doctorAvatar}"></i>`;
        }
        el.onclick             = null;
        el.style.cursor        = "default";
        el.style.pointerEvents = "none";
    });

    // ── ✅ عداد PRESENT — من active_count ─────────────────────────────
    if (countEl) countEl.innerText = data.active_count ?? 0;

    // ── عداد EXTRA — يعرض المتبقي أو ∞ ──────────────────────────────
    if (extraEl) {
        const max = parseInt(data.maxStudents);
        if (!max || max >= 9999 || isNaN(max)) {
            extraEl.innerHTML   = `<span style="font-size:24px;">∞</span> <span style="font-size:11px;opacity:0.8;font-weight:normal;">OPEN</span>`;
            extraEl.style.color = "#3b82f6";
        } else {
            const remaining = max - (data.active_count ?? 0);
            if (remaining < 0) {
                extraEl.style.color      = "#ef4444";
                extraEl.style.textShadow = "0 0 15px rgba(239,68,68,0.2)";
                extraEl.innerHTML        = `
                    <span style="font-weight:800;font-size:20px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:12px;"></i> ${remaining}
                    </span>
                    <span style="font-size:12px;color:#94a3b8;font-weight:600;"> / ${max}</span>`;
            } else {
                extraEl.style.color      = "#10b981";
                extraEl.style.textShadow = "none";
                extraEl.innerHTML        = `
                    <span style="font-weight:800;font-size:20px;">${remaining}</span>
                    <span style="font-size:12px;color:#94a3b8;font-weight:600;"> / ${max}</span>`;
            }
        }
    }

    // ── انتهاء الجلسة → توجيه الطالب (مرة واحدة فقط) ─────────────────
    if (!data.isActive && !_sessionEndedNotified) {
        _sessionEndedNotified = true;
        window.showToast?.("🏁 انتهت المحاضرة", 4000, "#10b981");
        setTimeout(() => { window.goHome?.(); location.reload(); }, 1500);
    }
}

/**
 * رسم كارت الطالب نفسه في الـ Grid
 */
function _renderMyCard(snapshot, grid, user) {
    if (!grid) return;

    grid.innerHTML        = '';
    _sessionEndedNotified = false;

    snapshot.forEach((docSnap) => {
        const s = docSnap.data();

        // مطرود → خروج فوري
        if (s.status === 'expelled') {
            window.showToast?.("⛔ تم إزالتك من القاعة", 4000, "#ef4444");
            setTimeout(() => { window.goHome?.(); location.reload(); }, 2000);
            return;
        }

        grid.appendChild(_buildCard(s, user));
    });

    // ملاحظة الانتظار
    if (grid.children.length > 0 && !grid.querySelector('.wait-note')) {
        const note       = document.createElement('div');
        note.className   = 'wait-note';
        note.style.cssText = `
            margin-top:50px; text-align:center; color:#64748b;
            font-size:14px; width:100%;
            font-family:'Tajawal', sans-serif; line-height:1.6;
        `;
        note.innerHTML = `
            <i class="fa-solid fa-circle-info" style="margin-left:6px;color:#0ea5e9;"></i>
            سيتم إتاحة عرض قائمة الحضور الكاملة في التحديث القادم
        `;
        grid.appendChild(note);
    }
}

/**
 * بناء كارت الطالب
 */
function _buildCard(s, user) {
    const isMe    = (user.uid === s.uid);
    const isLeft  = (s.status === 'left');
    const isBreak = (s.status === 'on_break');

    const opacity = (isLeft || isBreak) ? '0.5' : '1';
    const border  = isBreak ? '2px dashed #f59e0b' : '1px solid #e2e8f0';

    // لون وتسمية الحالة
    let statusColor, statusText;
    if      (isLeft)               { statusColor = "#94a3b8"; statusText = "مغادر";    }
    else if (s.isUnruly)           { statusColor = "#ef4444"; statusText = "مشاغب";    }
    else if (s.isUniformViolation) { statusColor = "#f97316"; statusText = "مخالف زي"; }
    else if (isBreak)              { statusColor = "#f59e0b"; statusText = "استراحة";  }
    else                           { statusColor = "#10b981"; statusText = "حاضر";     }

    // شارة عدد الجولات
    const segCount   = parseInt(s.segment_count) || 1;
    const roundBadge = segCount > 1
        ? `<div style="
               position:absolute; top:-10px; left:-10px;
               background:${isBreak ? '#64748b' : '#0ea5e9'};
               color:#fff; font-family:'Outfit',sans-serif;
               font-size:11px; font-weight:800;
               width:26px; height:26px; border-radius:50%;
               display:flex; align-items:center; justify-content:center;
               border:3px solid #f8fafc; z-index:100;
               box-shadow:0 4px 6px rgba(0,0,0,.15);
               animation:popIn .3s cubic-bezier(.175,.885,.32,1.275);
           ">${segCount}</div>`
        : '';

    const card       = document.createElement('div');
    card.className   = `live-st-card student-view-card${isMe ? ' is-me-card' : ''}`;
    card.style.cssText = `
        background: white; border-radius: 15px; padding: 20px;
        display: flex; flex-direction: column; align-items: center;
        opacity: ${opacity}; transition: 0.3s;
        width: 100%; max-width: 320px; margin: 0 auto;
        border: ${border}; position: relative; overflow: visible !important;
    `;

    card.innerHTML = `
        ${isMe ? '<div class="me-badge">أنت</div>' : ''}
        ${roundBadge}

        <div style="
            width:70px; height:70px; border-radius:50%;
            background:#f8fafc; border:3.5px solid ${statusColor};
            display:flex; align-items:center; justify-content:center;
            font-size:30px; color:#0284c7; margin-bottom:10px; z-index:2;
        ">
            <i class="fa-solid ${s.avatarClass || 'fa-user-graduate'}"></i>
        </div>

        <div style="text-align:center;">
            <div class="st-name notranslate" translate="no"
                 style="font-size:16px; font-weight:900; color:#1e293b;
                        text-decoration:none; text-align:center; direction:auto;">
                ${_sanitize(s.name)}
            </div>
            <div class="st-id en-font" style="font-size:12px; color:#64748b;">
                #${_sanitize(s.id)}
            </div>
        </div>

        <div style="
            margin-top:12px; padding:4px 15px; border-radius:20px;
            font-size:11px; font-weight:800; letter-spacing:.5px;
            border:1px solid ${statusColor}30;
            background:${statusColor}15; color:${statusColor};
        ">
            ${statusText}
        </div>
    `;

    return card;
}

/**
 * تعيين نص عنصر بـ ID
 */
function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

/**
 * تنظيف النصوص من XSS — يمنع HTML مضمّن من Firestore
 */
function _sanitize(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
