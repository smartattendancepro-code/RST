
import { MASTER_HALLS, MASTER_SUBJECTS } from './config.js';
import { SmartHistory } from './SmartHistory.js';
import {
    doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs,
    onSnapshot, serverTimestamp, increment, writeBatch, orderBy, limit,
    arrayUnion, arrayRemove, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { i18n } from './i18n.js';
import { applyVipTheme } from './VipThemeManager.js';


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
            targetGroups: [groupInput],
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

                if (p.status === "active" || p.status === "on_break") {

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
window.closeDoorImmediately = async function () {
    const user = auth.currentUser;
    if (!user) return;

    const lang = localStorage.getItem('sys_lang') || 'en';
    const dict = (typeof i18n !== 'undefined' && i18n[lang]) ? i18n[lang] : {};
    const t = (key, defaultText) => dict[key] || defaultText;

    const btn = document.getElementById('btnCloseDoor');
    if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('closing_door_loading', 'Closing the Door...')}`;
        btn.style.pointerEvents = 'none';
    }

    try {
        const sessionRef = doc(db, "active_sessions", user.uid);

        await updateDoc(sessionRef, {
            isDoorOpen: false,
            sessionCode: "EXPIRED",
            duration: 0
        });

        document.getElementById('doorDurationModal').style.display = 'none';

        showToast(`🔒 ${t('close_door_success_toast', 'Door closed successfully')}`, 3000, "#10b981");

    } catch (e) {
        console.error("Error Closing Door:", e);
        showToast(`❌ ${t('close_door_error_toast', 'Error closing door')}`, 3000, "#ef4444");
        if (btn) {
            btn.innerHTML = `⛔ ${t('close_door_btn', 'Close the Door')}`;
            btn.style.pointerEvents = 'auto';
        }
    }
};
window.openDoorActionModal = function () {
    const isAdmin = sessionStorage.getItem("secure_admin_session_token_v99");
    if (!isAdmin) return;

    const modal = document.getElementById('doorDurationModal');
    if (!modal) return;

    const lang = localStorage.getItem('sys_lang') || 'ar';
    const dict = (typeof i18n !== 'undefined' && i18n[lang]) ? i18n[lang] : {};
    const t = (key, defaultText) => dict[key] || defaultText;

    const contentBox = modal.querySelector('.modal-box') || modal.firstElementChild;

    const modernStyles = `
        <style>
            .modern-door-container { font-family: inherit; text-align: center; }
            
            /* تنسيق شبكة الوقت الجديد (4 أعمدة) */
            .time-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
            
            .btn-time-opt {
                padding: 10px 2px; background: #fff; color: #334155; 
                border: 1px solid #cbd5e1; border-radius: 10px; font-weight: 700; cursor: pointer;
                transition: all 0.2s ease; font-size: 13px;
                box-shadow: 0 2px 0 rgba(0,0,0,0.05);
            }
            .btn-time-opt:hover { transform: translateY(-2px); border-color: #0ea5e9; color: #0ea5e9; background: #f0f9ff; }
            .btn-time-opt:active { transform: translateY(0); box-shadow: none; }

            /* زر الوقت المفتوح المميز */
            .btn-infinity {
                width: 100%; margin-top: 5px; margin-bottom: 20px;
                background: #ecfdf5; color: #059669; border: 1px dashed #6ee7b7;
                padding: 8px; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 12px;
            }
            .btn-infinity:hover { background: #d1fae5; }

            /* التحكم في العدد */
            .counter-wrapper {
                display: flex; align-items: center; justify-content: center; gap: 10px;
                background: #f8fafc; padding: 10px; border-radius: 16px; margin-bottom: 15px;
                border: 1px solid #e2e8f0;
            }
            .btn-control {
                width: 40px; height: 40px; border-radius: 10px; border: none; cursor: pointer;
                font-size: 18px; display: flex; align-items: center; justify-content: center;
                transition: 0.2s; box-shadow: 0 3px 0 rgba(0,0,0,0.05);
            }
            .btn-minus { background: #fff; color: #ef4444; border: 1px solid #fee2e2; }
            .btn-plus { background: #fff; color: #10b981; border: 1px solid #d1fae5; }
            .btn-control:active { transform: translateY(2px); box-shadow: none; }
            
            #doorMaxLimitInput {
                width: 80px; font-size: 26px; font-weight: 800; text-align: center;
                background: transparent; border: none; color: #0f172a; outline: none;
            }
            input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            
            .quick-chips { display: flex; gap: 6px; justify-content: center; margin-bottom: 25px; flex-wrap: wrap; }
            .chip {
                padding: 5px 10px; border-radius: 15px; font-size: 11px; font-weight: bold; cursor: pointer;
                transition: 0.2s; border: 1px solid transparent;
            }
            .chip-blue { background: #e0f2fe; color: #0284c7; }
            .chip-purple { background: #f3e8ff; color: #7e22ce; }
            .chip-gray { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }
            .chip:hover { filter: brightness(0.95); transform: translateY(-1px); }

            .btn-cancel-modern {
                width: 100%; padding: 12px; background: #fff; border: 1px solid #cbd5e1;
                border-radius: 12px; color: #64748b; font-weight: bold; cursor: pointer;
                transition: 0.2s;
            }
            .btn-cancel-modern:hover { background: #f1f5f9; color: #334155; }
            
            .section-label {
                display:block; text-align:${lang === 'ar' ? 'right' : 'left'}; 
                font-size:13px; font-weight:700; color:#334155; margin-bottom:8px;
            }
                .btn-close-door {
                width: 100%; 
                margin-top: 5px;
                margin-bottom: 20px;
                background: #fef2f2; 
                color: #b91c1c; 
                border: 1px dashed #fca5a5;
                padding: 10px; 
                border-radius: 10px; 
                font-weight: bold; 
                cursor: pointer; 
                font-size: 13px;
                transition: 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
            }
            .btn-close-door:hover { 
                background: #fee2e2; 
                border-color: #ef4444; 
                transform: translateY(-1px);
            }
        </style>
    `;

    const lblSec = t('time_sec', 'ث');
    const lblMin = t('time_min', 'د');
    const lblStd = t('chip_students', 'طلاب');

    contentBox.innerHTML = `
        ${modernStyles}
        <div class="modern-door-container">
            <div style="margin-bottom: 20px;">
                <div style="width: 45px; height: 45px; background: #e0f2fe; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;">
                    <i class="fa-solid fa-door-open" style="font-size: 22px; color: #0284c7;"></i>
                </div>
                <h3 style="margin: 0; color: #0f172a; font-size: 18px;">${t('door_settings_title', 'إعدادات فتح البوابة')}</h3>
            </div>

            <!-- 1. القسم الأول: العدد (تم النقل للأعلى) -->
            <label class="section-label">
                1. ${t('door_limit_label', '👥 الحد الأقصى للطلاب (اختياري):')}
            </label>
            
            <div class="counter-wrapper">
                <button class="btn-control btn-minus" onclick="adjustDoorLimit(-1)"><i class="fa-solid fa-minus"></i></button>
                <input type="number" id="doorMaxLimitInput" placeholder="∞" value="">
                <button class="btn-control btn-plus" onclick="adjustDoorLimit(1)"><i class="fa-solid fa-plus"></i></button>
            </div>

            <div class="quick-chips">
                <div class="chip chip-blue" onclick="adjustDoorLimit(5)">+5 ${lblStd}</div>
                <div class="chip chip-blue" onclick="adjustDoorLimit(10)">+10 ${lblStd}</div>
                <div class="chip chip-purple" onclick="adjustDoorLimit(50)">+50 ${lblStd}</div>
                <div class="chip chip-gray" onclick="resetDoorLimit()">${t('chip_no_limit', 'بلا حد (∞)')}</div>
            </div>

            <!-- 2. القسم الثاني: المدة (تم النقل للأسفل) -->
            <label class="section-label">
                2. ${t('door_duration_label', '⏱️ حدد مدة فتح الكود:')}
            </label>
            
            <div class="time-grid">
                <button onclick="confirmOpenDoor(10)" class="btn-time-opt">10 ${lblSec}</button>
                <button onclick="confirmOpenDoor(15)" class="btn-time-opt">15 ${lblSec}</button>
                <button onclick="confirmOpenDoor(20)" class="btn-time-opt">20 ${lblSec}</button>
                <button onclick="confirmOpenDoor(35)" class="btn-time-opt">35 ${lblSec}</button>
                
                <button onclick="confirmOpenDoor(44)" class="btn-time-opt">44 ${lblSec}</button>
                <button onclick="confirmOpenDoor(60)" class="btn-time-opt">1 ${lblMin}</button>
                <button onclick="confirmOpenDoor(120)" class="btn-time-opt">2 ${lblMin}</button>
                <button onclick="confirmOpenDoor(180)" class="btn-time-opt">3 ${lblMin}</button>
            </div>
            
            <!-- زر الوقت المفتوح -->
            <button onclick="confirmOpenDoor(-1)" class="btn-infinity">
                ${t('time_inf', '∞ وقت مفتوح (بدون عداد)')}
            </button>

             <button id="btnCloseDoor" onclick="closeDoorImmediately()" class="btn-close-door">
                ⛔ (Close The Door)
            </button>

            <!-- زر الإلغاء -->
            <button onclick="document.getElementById('doorDurationModal').style.display='none'" class="btn-cancel-modern">
                ${t('cancel_cmd', 'إلغاء الأمر')}
            </button>
        </div>
    `;

    modal.style.display = 'flex';
};

window.confirmOpenDoor = async function (seconds) {
    const user = auth.currentUser;

    const maxInput = document.getElementById('doorMaxLimitInput');
    let maxStudentsVal = 9999;

    if (maxInput && maxInput.value.trim() !== "") {
        maxStudentsVal = parseInt(maxInput.value);
    }
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        const sessionRef = doc(db, "active_sessions", user.uid);

        await updateDoc(sessionRef, {
            isDoorOpen: true,
            sessionCode: newCode,
            startTime: serverTimestamp(),
            duration: seconds,
            maxStudents: maxStudentsVal
        });

        document.getElementById('doorDurationModal').style.display = 'none';
        document.getElementById('liveSessionCodeDisplay').innerText = newCode;
        document.getElementById('doorStatusText').innerHTML = '<i class="fa-solid fa-door-open fa-fade"></i>';

        let limitMsg = (maxStudentsVal === 9999) ? "عدد مفتوح" : `حد أقصى: ${maxStudentsVal}`;
        showToast(`🔓 تم الفتح لمدة ${seconds}ث (${limitMsg})`, 4000, "#10b981");

    } catch (e) {
        console.error(e);
        showToast("خطأ في فتح البوابة", 3000, "#ef4444");
    }
};


window.startLiveSnapshotListener = function () {
    const user = auth.currentUser;
    if (!user) {
        console.log("⏳ Waiting for Auth to initialize...");
        setTimeout(window.startLiveSnapshotListener, 500);
        return;
    }

    if (window.studentCountInterval) clearInterval(window.studentCountInterval);

    const grid = document.getElementById('liveStudentsGrid');
    if (grid) grid.innerHTML = '';

    const countEl = document.getElementById('livePresentCount');
    const extraEl = document.getElementById('liveExtraCount');

    const capacityLabel = extraEl?.parentElement?.querySelector('.stat-label') || document.querySelector("label[for='liveExtraCount']");
    if (capacityLabel) capacityLabel.innerText = "CAPACITY STATUS";

    const adminToken = sessionStorage.getItem("secure_admin_session_token_v99");
    const isDean = (adminToken === "SUPER_ADMIN_ACTIVE");
    const isDoctor = (adminToken === "ADMIN_ACTIVE");

    const adminFab = document.getElementById('adminFabControls');
    if (adminFab) {
        if (isDoctor || isDean) {
            adminFab.style.setProperty('display', 'flex', 'important');
        } else {
            adminFab.style.setProperty('display', 'none', 'important');
        }
    }

    if (grid) {
        if (isDoctor || isDean) {
            grid.style.setProperty('display', 'grid', 'important');
            grid.style.setProperty('grid-template-columns', '1fr', 'important');
            grid.style.setProperty('gap', '15px', 'important');
        } else {
            grid.style.removeProperty('grid-template-columns');
            grid.style.display = 'block';
        }
    }

    let targetRoomUID;

    if (isDean) {
        targetRoomUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
    } else if (isDoctor) {
        const storedTarget = sessionStorage.getItem('TARGET_DOCTOR_UID');
        targetRoomUID = (storedTarget && storedTarget !== user.uid) ? storedTarget : user.uid;
    } else {
        targetRoomUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
    }

    applyVipTheme(targetRoomUID);


    if (!targetRoomUID) {
        return;
    }

    if (isDoctor && user.uid === targetRoomUID) document.body.classList.add('admin-mode');
    else document.body.classList.remove('admin-mode');

    let maxLimit = 9999;
    let currentCount = 0;

    const updateCapacityUI = () => {
        if (!extraEl) return;

        const limit = parseInt(maxLimit);
        const count = parseInt(currentCount);

        if (limit >= 9999 || isNaN(limit)) {
            extraEl.innerHTML = `<span style="font-size:24px;">∞</span> <span style="font-size:11px; opacity:0.8; font-weight:normal;">OPEN</span>`;
            extraEl.style.color = "#3b82f6";
        } else {
            const remaining = limit - count;
            let remainingHtml = remaining;

            if (remaining < 0) {
                extraEl.style.color = "#ef4444";
                extraEl.style.textShadow = "0 0 15px rgba(239, 68, 68, 0.2)";
                remainingHtml = `<i class="fa-solid fa-triangle-exclamation" style="font-size:12px;"></i> ${remaining}`;
            } else {
                extraEl.style.color = "#10b981";
                extraEl.style.textShadow = "none";
            }

            extraEl.innerHTML = `
                <span style="font-weight:800; font-size:20px;">${remainingHtml}</span>
                <span style="font-size:12px; color:#94a3b8; font-weight:600;"> / ${limit}</span>
            `;
        }
    };


    const sessionRef = doc(db, "active_sessions", targetRoomUID);

    const updateSessionHeaderUI = (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();

            const myToken = sessionStorage.getItem("secure_admin_session_token_v99");
            const iAmAdmin = (myToken === "ADMIN_ACTIVE" || myToken === "SUPER_ADMIN_ACTIVE");

            if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = data.doctorName || "Professor";
            if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = data.allowedSubject || "Subject";
            if (document.getElementById('liveHallTag')) document.getElementById('liveHallTag').innerHTML = `<i class="fa-solid fa-building-columns"></i> ${data.hall || "Hall"}`;
            if (document.getElementById('liveGroupTag')) document.getElementById('liveGroupTag').innerText = `GROUPS: ${(data.targetGroups || []).join(', ')}`;

            const avatarLink = document.getElementById('liveDocAvatar');
            if (avatarLink) {
                avatarLink.innerHTML = `<i class="fa-solid ${data.doctorAvatar || 'fa-user-doctor'}"></i>`;

                if (iAmAdmin) {
                    avatarLink.onclick = () => openPublicProfile(targetRoomUID, true);
                    avatarLink.style.cursor = "pointer";
                    avatarLink.style.pointerEvents = "auto";
                } else {
                    avatarLink.onclick = null;
                    avatarLink.style.cursor = "default";
                    avatarLink.style.pointerEvents = "none";
                }
            }

            const nameLink = document.getElementById('liveDocName');
            if (nameLink) {
                if (iAmAdmin) {
                    nameLink.onclick = () => openPublicProfile(targetRoomUID, true);
                    nameLink.style.cursor = "pointer";
                    nameLink.style.pointerEvents = "auto";
                } else {
                    nameLink.onclick = null;
                    nameLink.style.cursor = "default";
                    nameLink.style.pointerEvents = "none";
                }
            }

            if (document.getElementById('liveSessionCodeDisplay')) {
                document.getElementById('liveSessionCodeDisplay').innerText = (isDoctor || isDean) ? (data.sessionCode || "------") : "••••••";
            }

            const doorStatus = document.getElementById('doorStatusText');
            if (doorStatus) {
                if (data.sessionCode === "PAUSED") {
                    doorStatus.innerHTML = '<i class="fa-solid fa-mug-hot fa-bounce"></i> PAUSED';
                    doorStatus.style.color = "#f59e0b";
                } else {
                    doorStatus.innerHTML = data.isDoorOpen ? '<i class="fa-solid fa-door-open fa-fade"></i> OPEN' : '<i class="fa-solid fa-door-closed"></i> CLOSED';
                    doorStatus.style.color = data.isDoorOpen ? "#10b981" : "#ef4444";
                }
            }

            if (data.maxStudents !== undefined && data.maxStudents !== null && data.maxStudents !== "") {
                maxLimit = parseInt(data.maxStudents);
            } else {
                maxLimit = 9999;
            }

            if (!isDoctor && !isDean) {
                const centralCount = data.active_count || 0;
                currentCount = centralCount;
                if (countEl) countEl.innerText = centralCount;
            }

            updateCapacityUI();

            if (!data.isActive && !isDoctor && !isDean) {
                showToast("🏁 انتهت المحاضرة", 4000, "#10b981");
                setTimeout(() => { goHome(); location.reload(); }, 1500);
            }
        }
    };

    getDoc(sessionRef).then(updateSessionHeaderUI).catch(e => console.log("Header Prefetch:", e));

    if (window.unsubscribeHeaderSession) window.unsubscribeHeaderSession();

    window.unsubscribeHeaderSession = onSnapshot(sessionRef, updateSessionHeaderUI);


    const participantsRef = collection(db, "active_sessions", targetRoomUID, "participants");
    let q;

    if (isDoctor || isDean) {
        q = query(participantsRef, orderBy("timestamp", "desc"));
    } else {
        q = query(participantsRef, where("uid", "==", user.uid));
    }

    if (window.unsubscribeLiveSnapshot) window.unsubscribeLiveSnapshot();

    const domCache = new Map();


    window.unsubscribeLiveSnapshot = onSnapshot(q, (snapshot) => {

        const activeDocs = snapshot.docs.filter(d => d.data().status === 'active');

        if (isDoctor || isDean) {
            currentCount = activeDocs.length;
            if (countEl) countEl.innerText = currentCount;
            updateCapacityUI();

            if (window.updateCounterTimeout) clearTimeout(window.updateCounterTimeout);
            window.updateCounterTimeout = setTimeout(() => {
                updateDoc(doc(db, "active_sessions", targetRoomUID), {
                    active_count: currentCount
                }).catch(err => console.log("Counter Sync Skip", err));
            }, 2000);
        } else {

            if (window.studentCountInterval) {
                clearInterval(window.studentCountInterval);
                window.studentCountInterval = null;
            }
        }

        if (grid) {
            const currentIds = new Set();
            let sortedDocs = [];
            snapshot.forEach(doc => sortedDocs.push(doc));

            if (isDoctor || isDean) {
                sortedDocs.sort((a, b) => {
                    const sA = a.data();
                    const sB = b.data();

                    const trapA = sA.trap_report || { is_device_match: true, in_range: true };
                    const trapB = sB.trap_report || { is_device_match: true, in_range: true };

                    const isRedA = (trapA.is_device_match === false) || (trapA.is_in_range === false);
                    const isRedB = (trapB.is_device_match === false) || (trapA.is_in_range === false);

                    if (isRedA && !isRedB) return -1;
                    if (!isRedA && isRedB) return 1;

                    return 0;
                });
            }

            sortedDocs.forEach((docSnap, index) => {
                const s = docSnap.data();
                currentIds.add(docSnap.id);

                if (s.status === 'expelled') {
                    if (domCache.has(docSnap.id)) {
                        domCache.get(docSnap.id).element.remove();
                        domCache.delete(docSnap.id);
                    }
                    return;
                }

                const isOnBreak = s.status === 'on_break';
                const isLeft = s.status === 'left';
                const opacityVal = (isLeft || isOnBreak) ? '0.5' : '1';
                const borderStyle = isOnBreak ? '2px dashed #f59e0b' : '1px solid #e2e8f0';
                const rawCount = s.segment_count;
                const segCount = (rawCount && !isNaN(rawCount)) ? parseInt(rawCount) : 1;

                let countBadge = '';
                if (segCount > 1) {
                    let badgeColor = isOnBreak ? '#64748b' : '#0ea5e9';
                    countBadge = `<div style="position: absolute; top: -10px; left: -10px; background: ${badgeColor}; color: white; font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 800; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #f8fafc; z-index: 100; box-shadow: 0 4px 6px rgba(0,0,0,0.15); animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">${segCount}</div>`;
                }

                const clickAction = "";

                let finalInnerHTML = '';
                let finalClassName = '';
                let finalCSSText = '';

                if (isDoctor || isDean) {
                    const trap = s.trap_report || { is_device_match: true, in_range: true, is_gps_success: true };
                    const deviceIcon = trap.is_device_match ? `<div title="جهاز أصلي" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-mobile-screen" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="جهاز مختلف" style="background:#fee2e2; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; animation: shake 0.5s infinite;"><i class="fa-solid fa-mobile-screen-button" style="color:#dc2626; font-size:14px;"></i></div>`;
                    const rangeIcon = trap.is_in_range ? `<div title="داخل النطاق" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-location-dot" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="خارج النطاق" style="background:#fee2e2; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-location-crosshairs" style="color:#dc2626; font-size:14px;"></i></div>`;
                    const isGpsOk = (trap.gps_success !== undefined) ? trap.gps_success : trap.is_gps_success;
                    const gpsIcon = isGpsOk ? `<div title="GPS نشط" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-satellite-dish" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="فشل GPS" style="background:#f1f5f9; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-satellite-dish" style="color:#94a3b8; font-size:14px;"></i></div>`;
                    const badgesHTML = `<div style="display:flex; justify-content:center; gap:8px; margin-top:6px; border-top:1px dashed #e2e8f0; padding-top:6px; width:100%;">${deviceIcon} ${rangeIcon} ${gpsIcon}</div>`;
                    const leaveIcon = isLeft ? 'fa-arrow-rotate-left' : 'fa-person-walking-arrow-right';

                    finalClassName = `live-st-card admin-view-card`;
                    finalCSSText = `background: #ffffff; border-radius: 18px; border: ${borderStyle}; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 5px; box-shadow: 0 4px 10px rgba(206, 99, 38, 0.03); height: auto; min-height: 220px; width: 100%; position: relative; overflow: visible !important; opacity: ${opacityVal}; transition: all 0.3s ease;`;

                    finalInnerHTML = `
                            ${countBadge}
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <div ${clickAction} style="cursor:pointer; width:55px; height:55px; border-radius:50%; background:#f8fafc; display:flex; align-items:center; justify-content:center; font-size:24px; color:#0ea5e9; border:2.5px solid ${s.isUnruly ? '#ef4444' : (s.isUniformViolation ? '#f97316' : '#e2e8f0')};">
                                    <i class="fa-solid ${s.avatarClass || 'fa-user'}"></i>
                                </div>
                                <div ${clickAction} class="st-name" style="cursor:pointer; font-size:12px; font-weight:800; color:#0f172a; margin-top:5px; text-decoration:none;">${s.name}</div>
                                <div class="st-id en-font" style="font-size:10px; color:#64748b; background:#f1f5f9; padding:1px 8px; border-radius:10px;">#${s.id}</div>
                                ${badgesHTML}
                            </div>
                            <div style="display:flex; justify-content:center; gap:30px; border-top:1px solid #f1f5f9; padding-top:12px;">
                                <button onclick="toggleStudentFlag('${docSnap.id}', 'isUniformViolation', ${s.isUniformViolation})" class="mini-action-btn" style="background:${s.isUniformViolation ? '#f97316' : '#fff7ed'}; color:${s.isUniformViolation ? 'white' : '#ea580c'};"><i class="fa-solid fa-shirt"></i></button>
                                <button onclick="toggleStudentFlag('${docSnap.id}', 'isUnruly', ${s.isUnruly})" class="mini-action-btn" style="background:${s.isUnruly ? '#ef4444' : '#fef2f2'}; color:${s.isUnruly ? 'white' : '#ef4444'};"><i class="fa-solid fa-fire"></i></button>
                                <button onclick="toggleStudentStatus('${docSnap.id}', '${s.status}')" class="mini-action-btn" style="background:#f8fafc; color:#64748b;"><i class="fa-solid ${leaveIcon}"></i></button>
                                <button onclick="updateStudentStatus('${docSnap.id}', 'expelled')" class="mini-action-btn" style="background:#fee2e2; color:#b91c1c;"><i class="fa-solid fa-ban"></i></button>
                            </div>`;
                } else {
                    const isMe = (user.uid === s.uid);
                    let statusColor = isLeft ? "#94a3b8" : (s.isUnruly ? "#ef4444" : (s.isUniformViolation ? "#f97316" : "#10b981"));
                    let statusText = isLeft ? "مغادر" : (s.isUnruly ? "مشاغب" : (s.isUniformViolation ? "مخالف" : "حاضر"));
                    const meClass = isMe ? 'is-me-card' : '';

                    finalClassName = `live-st-card student-view-card ${meClass}`;
                    finalCSSText = `background:white; border-radius:15px; padding:20px; display:flex; flex-direction:column; align-items:center; opacity:${opacityVal}; transition:0.3s; width:100%; max-width: 320px; margin: 0 auto; border: ${borderStyle}; position: relative; overflow: visible !important;`;

                    finalInnerHTML = `
                        ${isMe ? '<div class="me-badge">أنت</div>' : ''}
                            ${countBadge}
                            <div ${clickAction} style="cursor:pointer; width:70px; height:70px; border-radius:50%; background:#f8fafc; border:3.5px solid ${statusColor}; display:flex; align-items:center; justify-content:center; font-size:30px; color:#0284c7; margin-bottom:10px; z-index:2;">
                                <i class="fa-solid ${s.avatarClass || 'fa-user-graduate'}"></i>
                            </div>
                            <div style="text-align:center;">
                                <div ${clickAction} class="st-name notranslate" translate="no" style="cursor:pointer; font-size:16px; font-weight:900; color:#1e293b; text-decoration:none; text-align: center; direction: auto;">
    ${s.name}
</div>
                                <div class="st-id en-font" style="font-size:12px; color:#64748b;">#${s.id}</div>
                            </div>
                            <div style="margin-top:12px; padding:4px 15px; border-radius:6px; font-size:11px; font-weight:800; border:1px solid ${statusColor}30; background:${statusColor}15; color:${statusColor};">
                                ${statusText}
                            </div>`;
                }
                const dataSignature = JSON.stringify({
                    st: s.status, ur: s.isUnruly, uv: s.isUniformViolation,
                    tr: s.trap_report, sg: segCount, nm: s.name, av: s.avatarClass
                });

                let cardElement;

                if (domCache.has(docSnap.id)) {
                    const cached = domCache.get(docSnap.id);
                    cardElement = cached.element;

                    if (cached.signature !== dataSignature) {
                        if (cardElement.innerHTML !== finalInnerHTML) cardElement.innerHTML = finalInnerHTML;
                        if (cardElement.className !== finalClassName) cardElement.className = finalClassName;
                        if (cardElement.style.cssText !== finalCSSText) cardElement.style.cssText = finalCSSText;

                        cached.signature = dataSignature;
                    }
                } else {
                    cardElement = document.createElement('div');
                    cardElement.id = `card-${docSnap.id}`;
                    cardElement.className = finalClassName;
                    cardElement.style.cssText = finalCSSText;
                    cardElement.innerHTML = finalInnerHTML;

                    domCache.set(docSnap.id, { element: cardElement, signature: dataSignature });
                }

                const currentChildAtIndex = grid.children[index];
                if (currentChildAtIndex !== cardElement) {
                    if (currentChildAtIndex) {
                        grid.insertBefore(cardElement, currentChildAtIndex);
                    } else {
                        grid.appendChild(cardElement);
                    }
                }
            });

            domCache.forEach((value, key) => {
                if (!currentIds.has(key)) {
                    value.element.remove();
                    domCache.delete(key);
                }
            });
        }
        if (!isDoctor && !isDean) {
            const existingNote = grid.querySelector('.wait-note');
            if (!existingNote && grid.children.length > 0) {
                const noteDiv = document.createElement('div');
                noteDiv.className = 'wait-note';
                noteDiv.style.cssText = `margin-top: 50px; text-align: center; color: #070707; font-size: 15px; width: 100%; font-family: 'Tajawal', sans-serif; opacity: 1;`;
                noteDiv.innerHTML = `<i class="fa-solid fa-circle-info" style="margin-left:5px;"></i> سيتم إتاحة عرض قائمة الحضور الكاملة في التحديث القادم`;
                grid.appendChild(noteDiv);
            }
        }
    });

};


window.openDeanOversight = function () {
    if (typeof playClick === 'function') playClick();

    const modal = document.getElementById('deanOversightModal');
    const container = document.getElementById('oversightContainer');
    const loader = document.getElementById('oversightLoader');
    const lecturesCountEl = document.getElementById('totalActiveLectures');
    const studentsCountEl = document.getElementById('totalStudentsNow');

    if (!modal || !container) return;

    modal.style.display = 'flex';
    loader.style.display = 'block';
    container.innerHTML = '';

    if (window.deanRadarUnsubscribe) {
        window.deanRadarUnsubscribe();
        window.deanRadarUnsubscribe = null;
    }

    const q = query(collection(db, "active_sessions"), where("isActive", "==", true));

    window.deanRadarUnsubscribe = onSnapshot(q, async (snapshot) => {
        loader.style.display = 'none';
        container.innerHTML = '';

        let grandTotalStudents = 0;
        lecturesCountEl.innerText = snapshot.size;

        if (snapshot.empty) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#94a3b8;">
                    <i class="fa-solid fa-wind" style="font-size:40px; margin-bottom:15px; opacity:0.3;"></i>
                    <p style="font-weight:700; font-size:14px;">لا توجد محاضرات جارية حالياً</p>
                </div>`;
            studentsCountEl.innerText = "0";
            return;
        }

        const enrichedSessions = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const session = docSnap.data();
            const doctorUID = docSnap.id;

            const partsRef = collection(db, "active_sessions", doctorUID, "participants");
            const partsSnap = await getDocs(partsRef);

            const activeCount = partsSnap.docs.filter(d => d.data().status === 'active').length;
            const unrulyCount = partsSnap.docs.filter(d => d.data().isUnruly === true).length;

            return { ...session, doctorUID, activeCount, unrulyCount };
        }));

        enrichedSessions.forEach(session => {
            grandTotalStudents += session.activeCount;

            const card = document.createElement('div');
            card.className = `lecture-card-premium ${session.unrulyCount > 0 ? 'has-danger' : ''}`;

            const docClick = `onclick="event.stopPropagation(); openPublicProfile('${session.doctorUID}', true)"`;

            card.innerHTML = `
                <!-- الصف العلوي: رقم القاعة والنبض الحي -->
                <div class="card-top-info">
                    <div class="hall-badge-premium">
                        <i class="fa-solid fa-building-columns"></i>
                        <span>HALL: ${session.hall}</span>
                    </div>
                    <div class="live-status-pill">
                        <span class="blink-dot"></span>
                        LIVE
                    </div>
                </div>

                <!-- محتوى المحاضرة: المادة والدكتور -->
                <div class="card-main-content">
                    <h3 class="lec-subject-title">${session.allowedSubject}</h3>
                    
                    <!-- 🔥 [تم التعديل] جعل اسم الدكتور وصورته قابلة للضغط -->
                    <div class="lec-doctor-name" ${docClick} style="cursor:pointer;" title="عرض بروفايل الدكتور">
                        <div class="doc-avatar-mini">
                            <!-- عرض أفاتار الدكتور الديناميكي -->
                            <i class="fa-solid ${session.doctorAvatar || 'fa-user-doctor'}"></i>
                        </div>
                        <span style="text-decoration: underline; text-decoration-style: dotted;">د. ${session.doctorName}</span>
                    </div>
                </div>

                <!-- الفوتر المعلوماتي: الحضور والنشاط -->
                <div class="card-data-footer">
                    <div class="data-chip">
                        <i class="fa-solid fa-users"></i>
                        <strong>${session.activeCount}</strong> حاضر
                    </div>
                    
                    <div class="status-indicator-box ${session.unrulyCount > 0 ? 'alert' : 'stable'}">
                        <i class="fa-solid ${session.unrulyCount > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
                        <span>${session.unrulyCount > 0 ? session.unrulyCount + ' مخالفات' : 'الوضع مستقر'}</span>
                    </div>
                </div>

                <!-- زر الدخول المباشر للمراقبة -->
                <button class="btn-enter-oversight-pro" 
                        onclick="enterRoomAsDean('${session.doctorUID}')">
                    دخول القاعة للمراقبة <i class="fa-solid fa-arrow-left"></i>
                </button>
            `;
            container.appendChild(card);
        });

        studentsCountEl.innerText = grandTotalStudents;

    }, (error) => {
        console.error("Dean Radar Error:", error);
        loader.style.display = 'none';
        showToast("⚠️ خطأ في الاتصال بالرادار اللحظي", 4000, "#ef4444");
    });
};


window.enterRoomAsDean = function (doctorUID) {
    if (typeof playClick === 'function') playClick();

    sessionStorage.setItem('TARGET_DOCTOR_UID', doctorUID);

    switchScreen('screenLiveSession');
    if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();

    document.getElementById('deanOversightModal').style.display = 'none';
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