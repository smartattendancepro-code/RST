import { MASTER_HALLS, MASTER_SUBJECTS } from '../config.js';
import { SmartHistory } from '../SmartHistory.js';
import {
    doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs,
    onSnapshot, serverTimestamp, increment, writeBatch, orderBy, limit,
    arrayUnion, arrayRemove, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { i18n } from '../i18n.js';
import { applyVipTheme } from '../VipThemeManager.js';


const db = window.db;
const auth = window.auth;

window.globalTimeOffset = 0;


async function syncServerTime() {
    try {
        const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });

        const serverDateStr = response.headers.get('Date');
        if (!serverDateStr) return;

        const serverTime = new Date(serverDateStr).getTime();
        const localTime = Date.now();

        window.globalTimeOffset = serverTime - localTime;

        console.log("⏱️ Time Sync Offset:", window.globalTimeOffset, "ms");
    } catch (e) {
        console.warn("⚠️ Time Sync Failed, falling back to local time.", e);
    }
}

syncServerTime();

window.verifyAdminRole = async function () {
    const user = auth.currentUser;
    if (!user) return false;

    try {
        const docRef = doc(db, "faculty_members", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.role === 'dean' || data.role === 'doctor') {
                console.log("✅ Identity Verified: " + data.role);
                return true;
            }
        }
    } catch (e) {
        console.error("Role Verification Failed:", e);
    }
    return false;
};

let sessionInterval = null;
let unsubscribeLiveSnapshot = null;
let deanRadarUnsubscribe = null;
let unsubscribeHeaderSession = null;

window.toggleSessionState = function () {
    if (!sessionStorage.getItem("secure_admin_session_token_v99")) return;

    const btn = document.getElementById('btnToggleSession');

    if (btn && btn.classList.contains('session-open')) {
        switchScreen('screenLiveSession');
        if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();
        return;
    }

    const modal = document.getElementById('customTimeModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        let subjectsArray = [];
        if (typeof MASTER_SUBJECTS !== 'undefined') {
            Object.values(MASTER_SUBJECTS).forEach(yearList => subjectsArray.push(...yearList));
        }

        let hallsArray = (typeof MASTER_HALLS !== 'undefined') ? MASTER_HALLS : [];

        const user = auth.currentUser;
        if (user) {
            const historySubs = SmartHistory.get(`history_subjects_${user.uid}`);
            if (historySubs.length > 0) {
                const markedSubs = historySubs.map(s => `🕒 ${s}`);
                subjectsArray = [...markedSubs, ...subjectsArray];
            }

            const historyHalls = SmartHistory.get(`history_halls_${user.uid}`);
            if (historyHalls.length > 0) {
                const markedHalls = historyHalls.map(h => `🕒 ${h}`);
                hallsArray = [...markedHalls, ...hallsArray];
            }
        }
        renderCustomList('subjectList', subjectsArray, 'finalSubjectValue');
        renderCustomList('hallList', hallsArray, 'finalHallValue');
    }
};


window.confirmSessionStart = async function () {
    const subjectEl = document.getElementById('finalSubjectValue');
    const hallEl = document.getElementById('finalHallValue');
    const groupEl = document.getElementById('modalGroupInput');
    const passEl = document.getElementById('modalSessionPassInput');

    if (!subjectEl || !hallEl) {
        console.error("Critical Error: Setup input elements missing!");
        showToast("⚠️ خطأ في النظام: يرجى تحديث الصفحة", 3000, "#ef4444");
        return;
    }

    const subject = subjectEl.value.replace("🕒 ", "").trim();
    const hall = hallEl.value.replace("🕒 ", "").trim();
    let rawGroup = groupEl ? groupEl.value.replace(/\s+/g, '').toUpperCase() : "";
    let groupInput = "GENERAL";
    let resolvedGroups = ["GENERAL"];

    if (rawGroup !== "") {
        const groupPattern = /^\d+G\d+$/;

        if (!groupPattern.test(rawGroup)) {
            showToast("⚠️ Invalid Group Format! Must be like: 1G1", 4000, "#ef4444");

            if (groupEl) {
                groupEl.style.borderColor = "#ef4444";
                groupEl.focus();
                setTimeout(() => groupEl.style.borderColor = "", 2000);
            }
            return;
        }
        groupInput = rawGroup;
        resolvedGroups = window.resolveGroups ? window.resolveGroups(rawGroup) : [rawGroup];
    } const password = passEl ? passEl.value.trim() : "";

    const user = auth.currentUser;

    const lang = localStorage.getItem('sys_lang') || 'ar';
    const dict = (typeof i18n !== 'undefined' && i18n[lang]) ? i18n[lang] : {};

    if (!user) return;

    if (!subject || subject === "") {
        showToast(dict.validation_error_subject || "⚠️ Please select a subject", 3000, "#f59e0b");
        return;
    }
    if (!hall || hall === "") {
        showToast(dict.validation_error_hall || "⚠️ Please select a hall", 3000, "#f59e0b");
        return;
    }

    const doctorName = window.currentDoctorName || document.getElementById('profFacName')?.innerText || "Doctor";
    const facAvatarEl = document.getElementById('facCurrentAvatar');
    const avatarIconClass = facAvatarEl && facAvatarEl.querySelector('i') ? facAvatarEl.querySelector('i').className : "fa-solid fa-user-doctor";

    if (typeof SmartHistory !== 'undefined') {
        SmartHistory.push(`history_subjects_${user.uid}`, subject);
        SmartHistory.push(`history_halls_${user.uid}`, hall);
    }

    const btn = document.querySelector('#customTimeModal .btn-start-action') || document.querySelector('#customTimeModal .btn-main');
    const originalText = btn ? btn.innerHTML : "Start";

    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ...';
        btn.style.pointerEvents = 'none';
    }

    try {
        const sessionRef = doc(db, "active_sessions", user.uid);

        await setDoc(sessionRef, {
            isActive: true,
            isDoorOpen: false,
            sessionCode: "------",
            allowedSubject: subject,
            hall: hall,
            targetGroups: resolvedGroups,
            sessionPassword: password,
            maxStudents: 9999,
            doctorName: doctorName,
            doctorAvatar: avatarIconClass,
            doctorUID: user.uid,
            startTime: null,
            duration: 0
        }, { merge: true });

        if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = doctorName;
        if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = subject;
        if (document.getElementById('liveHallTag')) document.getElementById('liveHallTag').innerHTML = `<i class="fa-solid fa-building-columns"></i> ${hall}`;
        if (document.getElementById('liveGroupTag')) document.getElementById('liveGroupTag').innerText = `GROUP: ${groupInput}`;

        if (typeof closeSetupModal === 'function') {
            closeSetupModal();
        } else {
            document.getElementById('customTimeModal').style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        switchScreen('screenLiveSession');

        if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();

        showToast("✅ " + (lang === 'ar' ? "تم التجهيز بنجاح" : "Session Ready"), 3000, "#10b981");

    } catch (e) {
        console.error("Setup Error:", e);
        showToast("❌ Error: " + e.message, 3000, "#ef4444");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
    }
};

window.closeSessionImmediately = function () {

    const confirmBtn = document.getElementById('btnConfirmYes') || document.querySelector('.swal2-confirm');

    if (confirmBtn) {
        confirmBtn.style.pointerEvents = 'auto';
        confirmBtn.style.opacity = '1';
        confirmBtn.disabled = false;
    }

    const lang = localStorage.getItem('sys_lang') || 'ar';

    const title = (lang === 'ar') ? "إنهاء الجلسة وحفظ الغياب" : "End Session";
    const msg = (lang === 'ar') ? "سيتم إغلاق البوابة وحفظ السجلات نهائياً." : "Session will be closed and records saved.";

    if (confirmBtn) confirmBtn.innerText = (lang === 'ar') ? "تأكيد وحفظ ✅" : "Confirm & Save ✅";

    showModernConfirm(title, msg, async function () {
        const user = auth.currentUser;
        if (!user) return;

        const actionBtn = document.getElementById('btnConfirmYes') || document.querySelector('.confirm-btn-yes');
        if (actionBtn) {
            actionBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> ' + ((lang === 'ar') ? "جاري المعالجة..." : "Processing...");
            actionBtn.style.pointerEvents = 'none';
            actionBtn.style.opacity = '0.7';
        }

        try {
            if (window.unsubscribeLiveSnapshot) {
                window.unsubscribeLiveSnapshot();
                window.unsubscribeLiveSnapshot = null;
            }
            if (window.deanRadarUnsubscribe) {
                window.deanRadarUnsubscribe();
                window.deanRadarUnsubscribe = null;
            }

            const sessionRef = doc(db, "active_sessions", user.uid);
            const sessionSnap = await getDoc(sessionRef);

            if (!sessionSnap.exists()) {
                showToast("No session found", 3000, "#ef4444");
                return;
            }

            const settings = sessionSnap.data();
            const targetGroups = (settings.targetGroups && settings.targetGroups.length > 0)
                ? settings.targetGroups
                : ["General"];

            const now = new Date();
            const d = String(now.getDate()).padStart(2, '0');
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const y = now.getFullYear();
            const fixedDateStr = `${d}/${m}/${y}`;
            const closeTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            const partsRef = collection(db, "active_sessions", user.uid, "participants");
            const partsSnap = await getDocs(partsRef);

            let processedCount = 0;
            const currentDocName = settings.doctorName || "Doctor";

            const BATCH_LIMIT = 450;
            let currentBatch = writeBatch(db);
            let opCounter = 0;
            const commitPromises = [];

            const pushBatch = () => {
                commitPromises.push(currentBatch.commit());
                currentBatch = writeBatch(db);
                opCounter = 0;
            };

            const rawSubject = settings.allowedSubject || "General";
            const cleanSubKey = rawSubject.trim().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '');

            partsSnap.forEach(docSnap => {
                const p = docSnap.data();

                if (p.status === "active" || p.status === "on_break" || p.status === "expelled") {


                    const recID = `${p.id}_${fixedDateStr.replace(/\//g, '-')}_${cleanSubKey}`;
                    const attRef = doc(db, "attendance", recID);

                    let finalGroup = (p.group && p.group !== "General") ? p.group : targetGroups[0];
                    let notesText = "منضبط";
                    if (p.isUnruly) notesText = "غير منضبط - مشاغب";
                    else if (p.isUniformViolation) notesText = "مخالفة زي";

                    currentBatch.set(attRef, {
                        id: p.id,
                        name: p.name,
                        subject: rawSubject,
                        hall: settings.hall,
                        group: finalGroup,
                        date: fixedDateStr,
                        time_str: p.time_str || closeTimeStr,
                        segment_count: p.segment_count || 1,
                        notes: notesText,
                        timestamp: serverTimestamp(),
                        status: "ATTENDED",
                        doctorUID: user.uid,
                        doctorName: currentDocName,
                        feedback_status: "pending",
                        feedback_rating: 0,
                        isUnruly: p.isUnruly || false,
                        isUniformViolation: p.isUniformViolation || false
                    });
                    opCounter++;

                    const studentStatsRef = doc(db, "student_stats", p.uid || p.id);

                    let statsUpdate = {
                        group: finalGroup,
                        studentID: p.id,
                        last_updated: serverTimestamp(),
                        attended: {
                            [cleanSubKey]: increment(1)
                        }
                    };

                    if (p.isUnruly) statsUpdate.cumulative_unruly = increment(1);
                    if (p.isUniformViolation) statsUpdate.cumulative_uniform = increment(1);

                    currentBatch.set(studentStatsRef, statsUpdate, { merge: true });
                    opCounter++;
                    processedCount++;
                }

                currentBatch.delete(docSnap.ref);
                opCounter++;
                if (opCounter >= BATCH_LIMIT) pushBatch();
            });

            if (targetGroups.length > 0) {
                targetGroups.forEach(groupName => {
                    if (!groupName) return;
                    const groupRef = doc(db, "groups_stats", groupName);
                    currentBatch.set(groupRef, {
                        [`subjects.${cleanSubKey}.total_sessions_held`]: increment(1),
                        last_updated: serverTimestamp()
                    }, { merge: true });
                    opCounter++;
                    if (opCounter >= BATCH_LIMIT) pushBatch();
                });
            }


            const safeDateID = fixedDateStr.replace(/\//g, '-');

            targetGroups.forEach(grp => {
                const uniqueCounterID = `${safeDateID}_${cleanSubKey}_${grp}`;

                const counterRef = doc(db, "course_counters", uniqueCounterID);

                currentBatch.set(counterRef, {
                    subject: rawSubject,
                    targetGroups: [grp],
                    date: fixedDateStr,
                    timestamp: serverTimestamp(),
                    doctorUID: user.uid,
                    academic_year: y.toString()
                });

                opCounter++;
                if (opCounter >= BATCH_LIMIT) pushBatch();
            });

            currentBatch.update(sessionRef, { isActive: false, isDoorOpen: false });
            opCounter++;

            if (opCounter > 0) commitPromises.push(currentBatch.commit());

            await Promise.all(commitPromises);

            showToast(`✅ تم الحفظ وتحديث السجلات (${processedCount} طالب)`, 4000, "#10b981");

            setTimeout(() => location.reload(), 1500);

        } catch (e) {
            console.error("Save Error:", e);
            showToast("خطأ في الحفظ: " + e.message, 4000, "#ef4444");
            if (actionBtn) {
                actionBtn.innerHTML = (lang === 'ar') ? "إعادة المحاولة" : "Retry";
                actionBtn.style.pointerEvents = 'auto';
                actionBtn.style.opacity = '1';
            }
        } finally {
            if (actionBtn) {
                actionBtn.style.pointerEvents = 'auto';
                actionBtn.style.opacity = '1';
                actionBtn.disabled = false;
            }
        }
    });
};

window.performSessionPause = async function () {
    const user = auth.currentUser;
    if (!user) return;

    const btn = document.querySelector('#sessionActionModal .btn-main');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التجميد...';

    try {
        await updateDoc(doc(db, "active_sessions", user.uid), {
            isDoorOpen: false,
            sessionCode: "PAUSED"
        });

        const partsRef = collection(db, "active_sessions", user.uid, "participants");
        const q = query(partsRef, where("status", "==", "active"));
        const snapshot = await getDocs(q);

        const batch = writeBatch(db);

        snapshot.forEach(docSnap => {
            const currentData = docSnap.data();

            let currentCount = currentData.segment_count;
            if (!currentCount || isNaN(currentCount)) {
                currentCount = 1;
            }

            const newCount = currentCount + 1;

            batch.update(docSnap.ref, {
                status: "on_break",
                needs_reconfirmation: true,
                segment_count: newCount
            });
        });

        await batch.commit();

        showToast("☕ تم تفعيل وضع الاستراحة (الجولة التالية)", 3000, "#f59e0b");
        document.getElementById('sessionActionModal').style.display = 'none';

    } catch (e) {
        console.error(e);
        showToast(" ", 3000, "#ef4444");
    } finally {
        if (btn) btn.innerHTML = '(Break)';
    }
};

window.triggerSessionEndOptions = function () {
    if (typeof playClick === 'function') playClick();
    const modal = document.getElementById('sessionActionModal');
    if (modal) modal.style.display = 'flex';
};


window.listenToSessionState = function () {
    const user = auth.currentUser;

    if (!user) {
        console.log("⚠️ No user found, skipping session listener.");
        return;
    }

    const globalSettingsRef = doc(db, "settings", "control_panel");
    onSnapshot(globalSettingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();

            if (data.isQuickMode && data.quickModeFlags) {
                sessionStorage.setItem('is_quick_mode_active', 'true');
                sessionStorage.setItem('qm_disable_gps', data.quickModeFlags.disableGPS);
                sessionStorage.setItem('qm_disable_qr', data.quickModeFlags.disableQR);

                if (typeof window.applyQuickModeVisuals === 'function') {
                    window.applyQuickModeVisuals();
                }
                if (typeof window.handleQuickModeUI === 'function') {
                    window.handleQuickModeUI(true);
                }

            } else {
                sessionStorage.setItem('is_quick_mode_active', 'false');

                if (typeof window.removeQuickModeVisuals === 'function') {
                    window.removeQuickModeVisuals();
                }
                if (typeof window.handleQuickModeUI === 'function') {
                    window.handleQuickModeUI(false);
                }
            }
        }
    }, (error) => {
        console.warn("Global Settings Listener Warning:", error.message);
    });
    const doctorSessionRef = doc(db, "active_sessions", user.uid);

    if (window.unsubscribeSessionListener) {
        window.unsubscribeSessionListener();
        window.unsubscribeSessionListener = null;
    }

    window.unsubscribeSessionListener = onSnapshot(doctorSessionRef,
        (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const isActive = data.isActive === true;

                if (isActive) {
                    if (typeof updateSessionButtonUI === 'function') updateSessionButtonUI(true);
                    if (typeof handleSessionTimer === 'function') handleSessionTimer(true, data.startTime, data.duration);

                    if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = data.doctorName || "Professor";
                    if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = data.allowedSubject || "";
                    if (document.getElementById('liveHallTag')) document.getElementById('liveHallTag').innerHTML = `<i class="fa-solid fa-building-columns"></i> ${data.hall || ""}`;
                    if (document.getElementById('liveGroupTag')) document.getElementById('liveGroupTag').innerText = `GROUPS: ${(data.targetGroups || []).join(', ')}`;
                    if (document.getElementById('liveSessionCodeDisplay')) document.getElementById('liveSessionCodeDisplay').innerText = data.sessionCode || "------";

                    const avatarLink = document.getElementById('liveDocAvatar');
                    if (avatarLink && data.doctorAvatar) {
                        avatarLink.innerHTML = `<i class="fa-solid ${data.doctorAvatar}"></i>`;
                    }

                } else {
                    if (typeof updateSessionButtonUI === 'function') updateSessionButtonUI(false);
                    if (typeof handleSessionTimer === 'function') handleSessionTimer(false, null, 0);
                }
            } else {
                if (typeof updateSessionButtonUI === 'function') updateSessionButtonUI(false);
                if (typeof handleSessionTimer === 'function') handleSessionTimer(false, null, 0);
            }
        },
        (error) => {
            console.error("Session Listener Error:", error);

            if (error.code === 'permission-denied') {
                console.log("🔄 Permission sync issue. Retrying in 2s...");
                setTimeout(() => {
                    if (auth.currentUser) window.listenToSessionState();
                }, 2000);
            }
        }
    );
};


function updateSessionButtonUI(isOpen) {
    const btn = document.getElementById('btnToggleSession');
    const icon = document.getElementById('sessionIcon');
    const txt = document.getElementById('sessionText');

    const lang = localStorage.getItem('sys_lang') || 'en';

    if (!btn) return;

    btn.style.display = 'flex';

    if (isOpen) {
        btn.classList.add('session-open');
        btn.style.background = "#dcfce7";
        btn.style.color = "#166534";
        btn.style.border = "2px solid #22c55e";

        if (icon) icon.className = "fa-solid fa-tower-broadcast fa-fade";

        if (txt) {
            txt.setAttribute('data-i18n', 'session_active_btn');
            txt.innerText = (lang === 'ar') ? "جلستك نشطة" : "Session Active";
        }

    } else {
        btn.classList.remove('session-open');
        btn.style.background = "#f1f5f9";
        btn.style.color = "#334155";
        btn.style.border = "2px solid #cbd5e1";

        if (icon) icon.className = "fa-solid fa-play";

        if (txt) {
            txt.setAttribute('data-i18n', 'start_new_session_btn');
            txt.innerText = (lang === 'ar') ? "بدء محاضرة جديدة" : "Start New Session";
        }
    }

    window.lastSessionState = isOpen;
}


window.handleSessionTimer = function (isActive, startTime, duration) {
    const btn = document.getElementById('btnToggleSession');
    const icon = document.getElementById('sessionIcon');
    const txt = document.getElementById('sessionText');
    const floatTimer = document.getElementById('studentFloatingTimer');
    const floatText = document.getElementById('floatingTimeText');
    const doorStatus = document.getElementById('doorStatusText');

    const isAdmin = !!sessionStorage.getItem("secure_admin_session_token_v99");

    if (sessionInterval) clearInterval(sessionInterval);

    if (!isActive) {
        if (isAdmin && btn) {
            const lang = localStorage.getItem('sys_lang') || 'en';

            btn.classList.remove('session-open');
            btn.style.background = "#f1f5f9";
            btn.style.color = "#334155";
            btn.style.border = "2px solid #cbd5e1";

            if (txt) {
                txt.setAttribute('data-i18n', 'start_new_session_btn');
                txt.innerText = (lang === 'ar') ? "بدء محاضرة جديدة" : "Start New Session";
            }

            if (icon) icon.className = "fa-solid fa-play";
        }
        if (floatTimer) floatTimer.style.display = 'none';
        return;
    }

    let startMs = 0;
    if (startTime && typeof startTime.toMillis === 'function') {
        startMs = startTime.toMillis();
    } else {
        startMs = startTime || (Date.now() + (window.globalTimeOffset || 0));
    }

    const updateTick = () => {
        const currentServerTime = Date.now() + (window.globalTimeOffset || 0);

        const elapsedSeconds = Math.floor((currentServerTime - startMs) / 1000);

        let remaining = duration - elapsedSeconds;
        if (remaining > duration) remaining = duration;


        if (isAdmin) {
            if (doorStatus) {
                if (duration == -1) {
                    doorStatus.innerHTML = '<i class="fa-solid fa-door-open"></i> OPEN (∞)';
                    doorStatus.style.color = "#10b981";
                } else if (remaining > 0) {
                    doorStatus.innerHTML = `<i class="fa-solid fa-hourglass-half fa-spin"></i> ${remaining}s`;
                    doorStatus.style.color = "#f59e0b";
                } else {
                    clearInterval(sessionInterval);
                    const user = auth.currentUser;

                    updateDoc(doc(db, "active_sessions", user.uid), {
                        isDoorOpen: false,
                        sessionCode: "EXPIRED"
                    }).then(() => {
                        doorStatus.innerHTML = '<i class="fa-solid fa-door-closed"></i> CLOSED';
                        doorStatus.style.color = "#ef4444";
                        showToast("⏰ انتهى وقت الدخول وقُفل الباب", 4000, "#ef4444");
                    }).catch(err => console.error("Error closing door:", err));
                }
            }
        }

        else {
            if (floatTimer) {
                if (duration == -1) {
                    floatTimer.style.display = 'flex';
                    if (floatText) floatText.innerText = "OPEN";
                } else if (remaining > 0) {
                    floatTimer.style.display = 'flex';
                    if (floatText) floatText.innerText = remaining + "s";

                    if (remaining <= 10) floatTimer.classList.add('urgent');
                    else floatTimer.classList.remove('urgent');

                } else {
                    clearInterval(sessionInterval);
                    floatTimer.style.display = 'none';

                    const currentScreen = document.querySelector('.section.active')?.id;

                    if (currentScreen === 'screenDataEntry' && !window.isJoiningProcessActive) {

                        if (typeof window.resetApplicationState === 'function') {
                            window.resetApplicationState();
                        }

                        switchScreen('screenWelcome');
                        const modal = document.getElementById('systemTimeoutModal');
                        if (modal) modal.style.display = 'flex';
                    }
                }
            }
        }
    };

    updateTick();
    sessionInterval = setInterval(updateTick, 1000);
};

document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'modalGroupInput') {
        let val = e.target.value;

        val = val.toUpperCase();

        val = val.replace(/\s/g, '');

        if (e.target.value !== val) {
            e.target.value = val;
        }
    }
});