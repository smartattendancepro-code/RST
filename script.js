import { MASTER_HALLS, MASTER_SUBJECTS } from './config.js';
import {
    getFirestore,
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    onSnapshot,
    query,
    where,
    limit,
    writeBatch,
    serverTimestamp,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
    getAuth, onAuthStateChanged,
    signInWithEmailAndPassword, signOut, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { i18n, t, changeLanguage, toggleSystemLanguage } from './i18n.js';
import { AuditManager } from './AuditManager.js';

window.HARDWARE_ID = null;
const DEVICE_CACHE_KEY = "nursing_secure_device_v5";


document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.getUniqueDeviceId();
    } catch (err) {
        console.warn("Fingerprint Pre-load warning:", err);
    }
});

async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

window.getUniqueDeviceId = async function () {
    if (window.HARDWARE_ID) return window.HARDWARE_ID;

    let stored = localStorage.getItem(DEVICE_CACHE_KEY);
    if (stored) { window.HARDWARE_ID = stored; return stored; }

    const extras = [
        navigator.hardwareConcurrency || 0,
        navigator.deviceMemory || 0,
        screen.colorDepth,
        screen.width + "x" + screen.height,
        screen.pixelDepth || 0,
        navigator.platform || "",
        navigator.maxTouchPoints || 0,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.languages ? navigator.languages.join(",") : "",
    ].join("||");

    let fpId = "FALLBACK_" + Date.now().toString(36);
    try {
        if (window.FingerprintJS) {
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            fpId = result.visitorId;
        }
    } catch (e) {
        console.warn("FingerprintJS failed:", e);
    }

    const combined = fpId + "|" + extras;
    const finalId = await hashString(combined);

    window.HARDWARE_ID = finalId;
    localStorage.setItem(DEVICE_CACHE_KEY, finalId);
    return finalId;
};

window.isJoiningProcessActive = false;
window.isProcessingClick = false;

const db = window.db;
const auth = window.auth;

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('sys_lang') || 'ar';
    changeLanguage(saved);
});

onAuthStateChanged(auth, async (user) => {
    const drawerEl = document.getElementById('studentAuthDrawer');
    const profileWrap = document.getElementById('profileIconWrapper');
    const profileIcon = document.getElementById('profileIconImg');
    const statusDot = document.getElementById('userStatusDot');

    if (user) {
        await user.reload();

        let isManuallyVerified = false;
        try {
            const stRef = doc(db, "user_registrations", user.uid);
            const stSnap = await getDoc(stRef);
            if (stSnap.exists()) {
                const d = stSnap.data();
                if (d.status === 'verified' || d.manual_verification === true) isManuallyVerified = true;
            }
        } catch (err) {
            console.log("Manual check warning:", err);
        }

        if (user.emailVerified || isManuallyVerified) {
            if (drawerEl) {
                drawerEl.classList.remove('active');
                setTimeout(() => drawerEl.style.display = 'none', 300);
            }

            try {
                const stuDoc = await getDoc(doc(db, "user_registrations", user.uid));

                if (stuDoc.exists()) {
                    const data = stuDoc.data();
                    const name = data.registrationInfo?.fullName || data.fullName || "Student";

                    if (typeof listenToSessionState === 'function') listenToSessionState();

                    const savedUID = localStorage.getItem('TARGET_DOCTOR_UID');
                    if (savedUID) sessionStorage.setItem('TARGET_DOCTOR_UID', savedUID);

                    if (typeof monitorMyParticipation === 'function') monitorMyParticipation();
                    if (typeof window.showSmartWelcome === 'function') window.showSmartWelcome(name);

                    if (typeof window.checkForPendingSurveys === 'function') {
                        setTimeout(window.checkForPendingSurveys, 2500);
                    }

                    const avatarClass = data.avatarClass || data.registrationInfo?.avatarClass || 'fa-user-graduate';
                    if (profileIcon) profileIcon.className = 'fa-solid ' + avatarClass;
                    if (profileWrap) profileWrap.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                    if (statusDot) {
                        statusDot.style.background = '#22c55e';
                        statusDot.style.boxShadow = '0 0 10px #22c55e, 0 0 20px rgba(34,197,94,0.5)';
                    }

                    if (data.preferredLanguage) {
                        if (typeof changeLanguage === 'function') changeLanguage(data.preferredLanguage);
                        document.querySelectorAll('.active-lang-text-pro').forEach(s => {
                            s.innerText = (data.preferredLanguage === 'ar') ? 'EN' : 'عربي';
                        });
                    }
                }
            } catch (e) {
                console.error("Auth state error:", e);
            }
        } else {
            sessionStorage.clear();
            if (profileIcon) profileIcon.className = 'fa-solid fa-envelope-circle-check';
            if (profileWrap) profileWrap.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
            if (statusDot) statusDot.style.background = '#f59e0b';
        }
    } else {
        sessionStorage.clear();
        if (window.studentStatusListener) { window.studentStatusListener(); window.studentStatusListener = null; }
        if (profileIcon) profileIcon.className = 'fa-solid fa-user-astronaut';
        if (profileWrap) profileWrap.style.background = 'rgba(15, 23, 42, 0.8)';
        if (statusDot) { statusDot.style.background = '#94a3b8'; statusDot.style.boxShadow = 'none'; }
    }

    if (typeof updateUIForMode === 'function') updateUIForMode();
});

window.studentStatusListener = null;

window.monitorMyParticipation = async function () {
    const user = auth.currentUser;
    const mainBtn = document.getElementById('mainActionBtn');
    if (!user) return;

    const setButtonToEnterMode = () => {
        if (!mainBtn) return;
        const lang = localStorage.getItem('sys_lang') || 'ar';
        const enterText = (lang === 'ar') ? "دخول المحاضرة" : "Enter Lecture";
        mainBtn.innerHTML = `${enterText} <i class="fa-solid fa-door-open fa-beat-fade"></i>`;
        mainBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        mainBtn.style.boxShadow = "0 8px 25px -5px rgba(16, 185, 129, 0.5)";
        mainBtn.style.border = "1px solid #10b981";
        mainBtn.onclick = function () {
            if (typeof window.playClick === 'function') window.playClick();
            if (typeof window.switchScreen === 'function') window.switchScreen('screenLiveSession');
            if (typeof window.startLiveSnapshotListener === 'function') window.startLiveSnapshotListener();
        };
    };

    const resetButtonToDefault = () => {
        if (!mainBtn) return;
        const lang = localStorage.getItem('sys_lang') || 'ar';
        const regText = (lang === 'ar') ? "تسجيل الحضور" : "Register Attendance";
        mainBtn.innerHTML = `${regText} <i class="fa-solid fa-fingerprint"></i>`;
        mainBtn.style.background = "";
        mainBtn.style.boxShadow = "";
        mainBtn.style.border = "";
        mainBtn.onclick = () => {
            if (typeof window.forceOpenPinScreen === 'function') window.forceOpenPinScreen();
            else if (typeof window.startProcess === 'function') window.startProcess(false);
        };
    };

    let targetDoctorUID = localStorage.getItem('TARGET_DOCTOR_UID');

    if (!targetDoctorUID) {
        try {
            if (mainBtn) {
                mainBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> جاري المزامنة...`;
                mainBtn.style.opacity = "0.7";
                mainBtn.style.pointerEvents = "none";
            }

            const activeSessionsQ = query(collection(db, "active_sessions"), where("isActive", "==", true), limit(20));
            const sessionsSnap = await getDocs(activeSessionsQ);

            for (const sessionDoc of sessionsSnap.docs) {
                const studentRef = doc(db, "active_sessions", sessionDoc.id, "participants", user.uid);
                const studentSnap = await getDoc(studentRef);
                if (studentSnap.exists() && studentSnap.data().status === 'active') {
                    targetDoctorUID = sessionDoc.id;
                    break;
                }
            }

            if (targetDoctorUID) {
                localStorage.setItem('TARGET_DOCTOR_UID', targetDoctorUID);
            } else {
                resetButtonToDefault();
            }
        } catch (e) {
            console.error("Server Recovery Error:", e);
            resetButtonToDefault();
        }
    }

    if (!targetDoctorUID) { resetButtonToDefault(); return; }

    const studentRef = doc(db, "active_sessions", targetDoctorUID, "participants", user.uid);
    if (window.studentStatusListener) window.studentStatusListener();

    const sessionRef = doc(db, "active_sessions", targetDoctorUID);
    if (window.sessionStatusListener) window.sessionStatusListener();

    window.sessionStatusListener = onSnapshot(sessionRef, (sessionSnap) => {
        if (!sessionSnap.exists() || !sessionSnap.data().isActive) {
            localStorage.removeItem('TARGET_DOCTOR_UID');
            sessionStorage.removeItem('TARGET_DOCTOR_UID');
            resetButtonToDefault();
            if (window.studentStatusListener) { window.studentStatusListener(); window.studentStatusListener = null; }
        }
    });

    window.studentStatusListener = onSnapshot(studentRef, (docSnap) => {
        if (!docSnap.exists()) {
            sessionStorage.removeItem('TARGET_DOCTOR_UID');
            resetButtonToDefault();
            const currentScreen = document.querySelector('.section.active')?.id;
            if (currentScreen === 'screenLiveSession') {
                if (typeof window.showToast === 'function') window.showToast("⚠️ تم إغلاق الجلسة أو إخراجك منها", 4000, "#f59e0b");
                if (typeof window.goHome === 'function') window.goHome();
            }
            return;
        }

        const data = docSnap.data();

        if (data.status === 'expelled') {
            const _t = (typeof t === 'function') ? t : (key, def) => def;
            if (window.studentStatusListener) { window.studentStatusListener(); window.studentStatusListener = null; }
            sessionStorage.removeItem('TARGET_DOCTOR_UID');
            localStorage.removeItem('TARGET_DOCTOR_UID');
            resetButtonToDefault();

            const liveScreen = document.getElementById('screenLiveSession');
            if (liveScreen) { liveScreen.style.setProperty('display', 'none', 'important'); liveScreen.classList.remove('active'); }
            if (typeof window.goHome === 'function') window.goHome();

            const exModal = document.getElementById('expulsionModal');
            const exTitle = document.getElementById('expelTitle');
            const exBody = document.getElementById('expelBody');
            if (exTitle) exTitle.innerText = _t('modal_expel_title', "⛔ You have been expelled!");
            if (exBody) exBody.innerHTML = _t('modal_expel_body', "The instructor has removed you from this session.<br>You cannot rejoin.");
            if (exModal) {
                exModal.style.setProperty('display', 'flex', 'important');
                const leaveBtn = exModal.querySelector('button') || exModal.querySelector('.btn-danger');
                if (leaveBtn) {
                    leaveBtn.innerHTML = _t('btn_leave_hall', "Leave Hall ➜");
                    leaveBtn.onclick = function () { exModal.style.display = 'none'; window.location.reload(); };
                }
                if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
            } else {
                alert(_t('modal_expel_title', "⛔ You have been expelled!"));
                window.location.reload();
            }
            return;
        }

        if (data.status === 'on_break') {
            sessionStorage.removeItem('TARGET_DOCTOR_UID');
            resetButtonToDefault();
            if (window.unsubscribeLiveSnapshot) { window.unsubscribeLiveSnapshot(); window.unsubscribeLiveSnapshot = null; }
            const liveScreen = document.getElementById('screenLiveSession');
            const welcomeScreen = document.getElementById('screenWelcome');
            if (liveScreen) { liveScreen.style.cssText = ""; liveScreen.style.setProperty('display', 'none', 'important'); }
            window.switchScreen('screenWelcome');
            if (typeof window.showToast === 'function') window.showToast("⏸️ استراحة: يرجى تسجيل الدخول مجدداً عند الاستئناف", 4000, "#f59e0b");
            return;
        }

        if (data.status === 'active') {
            setButtonToEnterMode();
            const breakModal = document.getElementById('breakModal');
            if (breakModal) breakModal.style.display = 'none';
            sessionStorage.setItem('TARGET_DOCTOR_UID', targetDoctorUID);
        }
    }, (error) => {
        console.log("Listener Error:", error);
        sessionStorage.removeItem('TARGET_DOCTOR_UID');
        resetButtonToDefault();
    });
};

window.performStudentSignup = async function () {
    const lang = localStorage.getItem('sys_lang') || 'ar';
    const _t = (typeof t === 'function') ? t : (key, def) => def;

    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value;
    const fullName = document.getElementById('regFullName').value.trim();
    const studentID = document.getElementById('regStudentID').value.trim();
    const level = document.getElementById('regLevel').value;
    const gender = document.getElementById('regGender').value;
    const group = document.getElementById('regGroup') ? document.getElementById('regGroup').value : "عام";

    if (!email || !pass || !fullName || !studentID) {
        if (typeof playBeep === 'function') playBeep();
        showToast(_t('msg_missing_data', "⚠️ بيانات ناقصة! يرجى ملء كل الحقول"), 3000, "#f59e0b");
        return;
    }
    if (pass.length < 6) {
        if (typeof playBeep === 'function') playBeep();
        showToast(_t('msg_weak_pass', "⚠️ كلمة المرور ضعيفة (6 أحرف على الأقل)"), 3000, "#f59e0b");
        return;
    }

    const btn = document.getElementById('btnDoSignup');
    const originalText = btn ? btn.innerText : "REGISTER";
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up fa-fade"></i> ${_t('status_connecting', 'جاري الاتصال بالسيرفر...')}`; }

    try {
        const deviceID = await window.getUniqueDeviceId();
        const response = await fetch(`https://nursing-backend-rej8.vercel.app/api/registerStudent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass, fullName, studentID, level, gender, group, deviceFingerprint: deviceID })
        });
        const result = await response.json();

        if (response.ok && result.success) {
            if (btn) btn.innerHTML = `<i class="fa-regular fa-envelope fa-bounce"></i> ${_t('status_sending_email', 'إرسال رابط التفعيل...')}`;
            try {
                const userCredential = await signInWithEmailAndPassword(window.auth, email, pass);
                await sendEmailVerification(userCredential.user);
                await signOut(window.auth);
            } catch (emailError) {
                console.error("Email Warning:", emailError);
                showToast(_t('msg_email_fail', "⚠️ تم الحساب، لكن تعذر إرسال الإيميل تلقائياً"), 4000, "#f59e0b");
            }

            if (typeof playSuccess === 'function') playSuccess();
            showToast(_t('msg_account_created', "✅ تم إنشاء الحساب بنجاح!"), 4000, "#10b981");
            if (typeof closeAuthDrawer === 'function') closeAuthDrawer();
            if (typeof toggleAuthMode === 'function') toggleAuthMode('login');

            const loginEmailInput = document.getElementById('studentLoginEmail');
            if (loginEmailInput) loginEmailInput.value = email;
            document.getElementById('regPass').value = "";
            document.getElementById('regEmail').value = "";

            const firstName = (typeof arabToEng === 'function') ? arabToEng(fullName.split(' ')[0]) : fullName.split(' ')[0];
            const modalTitle = document.getElementById('successModalTitle');
            const modalBody = document.getElementById('successModalBody');
            const successModal = document.getElementById('signupSuccessModal');

            if (modalTitle) modalTitle.innerText = `${_t('modal_welcome_title', '🎉 Welcome')} ${firstName}!`;
            if (modalBody) {
                modalBody.innerHTML = `
                    <div style="background:#f8fafc;padding:15px;border-radius:12px;margin-bottom:20px;border:1px dashed #cbd5e1;text-align:center;">
                        <div style="font-size:12px;font-weight:bold;color:#64748b;margin-bottom:5px;">${_t('modal_id_reserved', 'تم حجز الكود الجامعي:')}</div>
                        <div style="font-size:24px;font-weight:900;color:#0ea5e9;font-family:'Outfit',sans-serif;letter-spacing:1px;">${studentID}</div>
                    </div>
                    <p style="font-size:14px;color:#334155;margin-bottom:8px;">📨 ${_t('modal_email_sent', 'تم إرسال رابط تفعيل إلى بريدك الإلكتروني.')}</p>
                    <div style="background:#fee2e2;color:#b91c1c;padding:10px;border-radius:8px;font-weight:bold;font-size:12px;display:flex;align-items:center;gap:8px;">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>${_t('modal_verify_warning', 'يرجى تفعيل الحساب من الإيميل قبل تسجيل الدخول.')}</span>
                    </div>`;
            }
            if (successModal) successModal.style.display = 'flex';
        } else {
            throw new Error(result.error || _t('error_security_fail', "فشل التسجيل لأسباب أمنية"));
        }
    } catch (error) {
        console.error("Signup Error:", error);
        let errorMsg = error.message;
        if (errorMsg.includes("email-already-in-use")) errorMsg = _t('error_email_exists', "هذا البريد مسجل بالفعل!");
        showToast(`❌ ${errorMsg}`, 5000, "#ef4444");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = originalText; }
    }
};

window.performStudentLogin = async () => {
    const _t = (typeof t === 'function') ? t : (key, def) => def;
    const email = document.getElementById('studentLoginEmail').value.trim();
    const pass = document.getElementById('studentLoginPass').value;
    const btn = document.querySelector('#loginSection .btn-modern-action') || document.querySelector('#loginSection .btn-main');

    let originalText = "Sign In";
    if (btn) { originalText = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${_t('status_verifying', 'جاري التحقق...')}`; btn.disabled = true; }

    if (!email || !pass) {
        showToast(_t('msg_enter_creds', "⚠️ أدخل الإيميل والباسورد"), 3000, "#f59e0b");
        if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        const userRef = doc(db, "user_registrations", user.uid);
        const userSnap = await getDoc(userRef);

        let isManuallyVerified = false;
        if (userSnap.exists() && userSnap.data().status === 'verified') isManuallyVerified = true;

        if (!user.emailVerified && !isManuallyVerified) {
            await signOut(auth);
            const vModal = document.getElementById('verificationModal');
            if (vModal) { vModal.style.display = 'flex'; if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
            else showToast(_t('msg_email_not_verified', "⛔ حساب غير مفعل! راجع الإيميل."), 5000, "#ef4444");
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
            return;
        }

        if (userSnap.exists()) {
            const userData = userSnap.data();
            const info = userData.registrationInfo || userData;
            const profileCache = {
                fullName: info.fullName, email: info.email, studentID: info.studentID,
                level: info.level, gender: info.gender, group: info.group || "",
                avatarClass: userData.avatarClass || info.avatarClass || "fa-user-graduate",
                status_message: userData.status_message || "", uid: user.uid, type: 'student'
            };
            localStorage.setItem('cached_profile_data', JSON.stringify(profileCache));

            let currentDeviceId = "UNKNOWN_DEVICE";
            try { currentDeviceId = await getUniqueDeviceId(); } catch (e) { }
            try {
                await updateDoc(userRef, {
                    bound_device_id: currentDeviceId,
                    device_bind_date: serverTimestamp(),
                    last_device_sync: serverTimestamp()
                });
            } catch (err) { console.warn("Device sync warning:", err); }
        }

        showToast(_t('msg_login_success', "🔓 تم تسجيل الدخول.. أهلاً بك"), 3000, "#10b981");
        if (typeof closeAuthDrawer === 'function') closeAuthDrawer();

    } catch (error) {
        console.error("Login Error:", error.code);
        let msg = "";
        switch (error.code) {
            case 'auth/user-not-found': msg = _t('error_user_not_found', "❌ هذا البريد الإلكتروني غير مسجل لدينا!"); break;
            case 'auth/wrong-password': msg = _t('error_wrong_pass', "❌ كلمة المرور غير صحيحة!"); break;
            case 'auth/invalid-credential': msg = _t('error_invalid_cred', "❌ البريد الإلكتروني أو كلمة المرور غير صحيحة."); break;
            case 'auth/invalid-email': msg = _t('error_invalid_email', "⚠️ صيغة البريد الإلكتروني غير سليمة!"); break;
            case 'auth/user-disabled': msg = _t('error_user_disabled', "⛔ تم تعطيل هذا الحساب من قبل الإدارة."); break;
            case 'auth/too-many-requests': msg = _t('error_too_many', "⏳ محاولات كثيرة! تم إيقاف الدخول مؤقتاً."); break;
            case 'auth/network-request-failed': msg = _t('error_network', "📡 فشل الاتصال! تأكد من الإنترنت."); break;
            default: msg = _t('error_unknown', "❌ خطأ غير معروف") + ": " + error.code;
        }
        showToast(msg, 5000, "#ef4444");
        if (typeof playBeep === 'function') playBeep();
    } finally {
        if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
    }
};

window.joinSessionAction = async function () {
    const passInput = document.getElementById('sessionPass').value.trim();
    const btn = document.getElementById('btnJoinFinal');
    const targetDrUID = sessionStorage.getItem('TEMP_DR_UID');
    const originalText = btn.innerHTML;
    const user = auth.currentUser;

    if (!user) { showToast("❌ يجب تسجيل الدخول أولاً", 3000, "#ef4444"); return; }
    if (!targetDrUID) {
        showToast("⚠️ حدث خطأ في بيانات الجلسة، يرجى البحث مجدداً", 4000, "#f59e0b");
        if (typeof resetSearchSession === 'function') resetSearchSession();
        return;
    }

    window.isJoiningProcessActive = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying & Joining...';
    btn.style.pointerEvents = 'none';

    try {
        const sessionRef = doc(db, "active_sessions", targetDrUID);
        const sensRef = doc(db, "user_registrations", user.uid, "sensitive_info", "main");

        const [sessionSnap, gpsData, deviceFingerprint, idToken, sensSnap] = await Promise.all([
            getDoc(sessionRef),
            window.getGPSForJoin(),
            window.getUniqueDeviceId(),
            user.getIdToken(),
            getDoc(sensRef)
        ]);

        if (!sessionSnap.exists()) throw new Error("⛔ الجلسة غير موجودة");

        const sessionData = sessionSnap.data();
        if (!sessionData.isActive || !sessionData.isDoorOpen) throw new Error("🔒 عذراً، الجلسة مغلقة حالياً.");
        if (sessionData.sessionPassword && sessionData.sessionPassword !== "" && passInput !== sessionData.sessionPassword)
            throw new Error("❌ كلمة المرور غير صحيحة");

        let isDeviceMatch = true;
        try {
            if (sensSnap.exists()) {
                const sensData = sensSnap.data();
                let allowed = sensData.allowed_devices || (sensData.bound_device_id ? [sensData.bound_device_id] : []);
                if (!allowed.includes(deviceFingerprint)) {
                    if (allowed.length < 2) {
                        allowed.push(deviceFingerprint);
                        await setDoc(sensRef, { allowed_devices: allowed, second_device_added_at: serverTimestamp() }, { merge: true });
                        isDeviceMatch = true;
                    } else { isDeviceMatch = false; }
                } else { isDeviceMatch = true; }
            }
        } catch (e) { console.error("Security Sync Error:", e); isDeviceMatch = true; }

        await AuditManager.sendSecretLog(db, user, sessionData, {
            deviceFingerprint,
            isDeviceMatch,
            userIP: typeof userIP !== 'undefined' ? userIP : "Hidden",
            gpsData
        });

        const response = await fetch('https://nursing-backend-rej8.vercel.app/joinSessionSecure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({
                studentUID: user.uid, sessionDocID: targetDrUID,
                gpsLat: gpsData.lat || 0, gpsLng: gpsData.lng || 0,
                deviceFingerprint, isDeviceMatch, codeInput: sessionData.sessionCode
            })
        });
        const result = await response.json();

        if (response.ok && result.success) {
            if (typeof window.stopCodeEntryIdleTimer === 'function') window.stopCodeEntryIdleTimer();
            if (typeof playSuccess === 'function') playSuccess();
            showToast(`✅ ${result.message}`, 3000, "#10b981");

            localStorage.setItem('TARGET_DOCTOR_UID', targetDrUID);
            sessionStorage.setItem('TARGET_DOCTOR_UID', targetDrUID);
            sessionStorage.removeItem('TEMP_DR_UID');

            if (typeof window.resetMainButtonUI === 'function') window.resetMainButtonUI();
            setTimeout(() => { if (typeof window.monitorMyParticipation === 'function') window.monitorMyParticipation(); }, 100);

            try {
                let cached = localStorage.getItem('cached_profile_data');
                if (cached) {
                    let cacheObj = JSON.parse(cached);
                    if (cacheObj.uid === user.uid) { cacheObj.attendanceCount = (cacheObj.attendanceCount || 0) + 1; localStorage.setItem('cached_profile_data', JSON.stringify(cacheObj)); }
                }
            } catch (err) { console.warn("Cache update skipped."); }

            if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = sessionData.doctorName || "Professor";
            if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = sessionData.allowedSubject || "Subject";
            const liveAvatar = document.getElementById('liveDocAvatar');
            if (liveAvatar && sessionData.doctorAvatar) liveAvatar.innerHTML = `<i class="fa-solid ${sessionData.doctorAvatar}"></i>`;

            switchScreen('screenLiveSession');
            if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();
        } else {
            throw new Error(result.error || "تم رفض الدخول من قبل النظام الأمني");
        }
    } catch (e) {
        console.error("Join Session Error:", e);
        window.isJoiningProcessActive = false;
        let msg = e.message;
        if (msg.includes("Failed to fetch")) msg = "فشل الاتصال بالسيرفر! تأكد من الإنترنت.";
        showToast(msg.startsWith("❌") || msg.startsWith("⛔") || msg.startsWith("🔒") ? msg : "⚠️ " + msg, 4000, "#ef4444");
        if (msg.includes("غير موجودة") || msg.includes("مغلقة")) setTimeout(() => location.reload(), 1500);
    } finally {
        const currentScreen = document.querySelector('.section.active')?.id;
        if (currentScreen !== 'screenLiveSession') { btn.innerHTML = originalText; btn.style.pointerEvents = 'auto'; }
    }
};
window.searchForSession = async function () {
    const codeInput = document.getElementById('attendanceCode').value.trim();
    const btn = document.getElementById('btnSearchSession');

    if (!codeInput) { showToast("⚠️ Please enter session PIN", 3000, "#f59e0b"); return; }

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> SEARCHING...';
    btn.style.pointerEvents = 'none';

    try {
        const q = query(collection(db, "active_sessions"), where("sessionCode", "==", codeInput), where("isActive", "==", true), where("isDoorOpen", "==", true));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            const checkQ = query(collection(db, "active_sessions"), where("sessionCode", "==", codeInput));
            const checkSnap = await getDocs(checkQ);
            showToast(checkSnap.empty ? "❌ Invalid Session PIN" : "🔒 Session is currently CLOSED", 4000, "#ef4444");
            btn.innerHTML = originalText; btn.style.pointerEvents = 'auto';
            return;
        }

        const sessionDoc = querySnapshot.docs[0];
        const sessionData = sessionDoc.data();
        const doctorUID = sessionDoc.id;
        sessionStorage.setItem('TEMP_DR_UID', doctorUID);

        if (typeof window.stopCodeEntryIdleTimer === 'function') window.stopCodeEntryIdleTimer();

        const docNameEl = document.getElementById('foundDocName');
        const subjectNameEl = document.getElementById('foundSubjectName');
        const foundAvatar = document.getElementById('foundDocAvatar');

        if (docNameEl) { docNameEl.innerText = "Dr. " + (sessionData.doctorName || "Unknown"); docNameEl.style.fontFamily = "'Outfit', sans-serif"; }
        if (subjectNameEl) { subjectNameEl.innerText = sessionData.allowedSubject || "--"; subjectNameEl.style.fontFamily = "'Outfit', sans-serif"; }
        if (foundAvatar && sessionData.doctorAvatar) foundAvatar.innerHTML = `<i class="fa-solid ${sessionData.doctorAvatar}"></i>`;

        if (!sessionData.sessionPassword || sessionData.sessionPassword.trim() === "") {
            if (typeof startAuthScreenTimer === 'function') startAuthScreenTimer(doctorUID);
            const step1 = document.getElementById('step1_search');
            const step2 = document.getElementById('step2_auth');
            if (step1) step1.style.display = 'none';
            if (step2) { step2.style.display = 'block'; step2.classList.add('active'); }
            setTimeout(() => {
                if (typeof window.joinSessionAction === 'function') window.joinSessionAction();
            }, 300);
            return;
        }

        if (typeof startAuthScreenTimer === 'function') startAuthScreenTimer(doctorUID);
        const step1 = document.getElementById('step1_search');
        const step2 = document.getElementById('step2_auth');
        if (step1) step1.style.display = 'none';
        if (step2) {
            step2.style.display = 'block';
            step2.classList.add('active');
            setTimeout(() => { const p = document.getElementById('sessionPass'); if (p) p.focus(); }, 400);
        }

    } catch (e) {
        console.error("Critical Search Error:", e);
        showToast("⚠️ Connection Error", 3000, "#ef4444");
    } finally {
        btn.innerHTML = originalText; btn.style.pointerEvents = 'auto';
    }
};

window.startAuthScreenTimer = function (doctorUID) {
    const display = document.getElementById('authTimerDisplay');
    const pill = document.querySelector('.auth-timer-pill');
    const _t = window.t || ((key, def) => def);

    if (window.authUnsubscribe) { window.authUnsubscribe(); window.authUnsubscribe = null; }
    if (window.localTicker) { clearInterval(window.localTicker); window.localTicker = null; }
    if (window.authScreenInterval) { clearInterval(window.authScreenInterval); window.authScreenInterval = null; }

    const sessionRef = doc(db, "active_sessions", doctorUID);

    window.authUnsubscribe = onSnapshot(sessionRef, (docSnap) => {
        if (!docSnap.exists()) { handleSessionEnd(_t, '⛔ Session ended by instructor.'); return; }
        const data = docSnap.data();
        if (!data.isActive || !data.isDoorOpen) {
            if (window.isJoiningProcessActive) return;
            handleSessionEnd(_t, '🔒 Registration closed by lecturer.');
            return;
        }
        if (data.duration === -1) {
            if (window.localTicker) clearInterval(window.localTicker);
            updateTimerUI(display, pill, "OPEN", "normal");
            return;
        }
        const serverReadTime = docSnap.readTime ? docSnap.readTime.toMillis() : Date.now();
        const timeOffset = serverReadTime - Date.now();
        const startMs = data.startTime ? data.startTime.toMillis() : serverReadTime;
        const deadline = startMs + (data.duration * 1000);
        if (window.localTicker) clearInterval(window.localTicker);
        runSyncedTimer(deadline, timeOffset, display, pill, _t);
        window.localTicker = setInterval(() => runSyncedTimer(deadline, timeOffset, display, pill, _t), 1000);
    }, (error) => { console.error("Timer Listener Error:", error); });

    function runSyncedTimer(deadline, offset, display, pill, t) {
        const remaining = Math.floor((deadline - (Date.now() + offset)) / 1000);
        if (remaining <= 0) {
            if (window.localTicker) clearInterval(window.localTicker);
            if (window.isJoiningProcessActive) return;
            updateTimerUI(display, pill, "0s", "urgent");
            if (window.authUnsubscribe) { window.authUnsubscribe(); window.authUnsubscribe = null; }
            showToast(t('toast_session_timer_ended', '⏰ Time is up! Entrance period has ended.'), 4000, "#ef4444");
            setTimeout(() => location.reload(), 3000);
            return;
        }
        updateTimerUI(display, pill, remaining + "s", remaining <= 10 ? "urgent" : "normal");
    }

    function updateTimerUI(display, pill, text, mode) {
        if (display) display.innerText = text;
        if (pill) {
            pill.classList.remove('urgent-mode');
            pill.style.cssText = "";
            if (mode === "urgent") pill.classList.add('urgent-mode');
            else if (text === "OPEN") { pill.style.background = "#ecfdf5"; pill.style.color = "#10b981"; pill.style.borderColor = "#a7f3d0"; }
        }
    }

    function handleSessionEnd(t, msg) {
        if (window.authUnsubscribe) window.authUnsubscribe();
        if (window.localTicker) clearInterval(window.localTicker);
        showToast(t('toast_session_closed_manual', msg), 4000, "#ef4444");
        setTimeout(() => location.reload(), 2500);
    }
};

window.resetSearchSession = function () {
    const step1 = document.getElementById('step1_search');
    const step2 = document.getElementById('step2_auth');
    if (step2) { step2.style.display = 'none'; step2.classList.remove('active'); }
    if (step1) { step1.style.display = 'block'; step1.style.opacity = '1'; step1.style.visibility = 'visible'; }
    const passInput = document.getElementById('sessionPass');
    const codeInput = document.getElementById('attendanceCode');
    if (passInput) passInput.value = '';
    if (codeInput) codeInput.value = '';
    const errorContainer = document.getElementById('screenError');
    if (errorContainer) errorContainer.style.display = 'none';
    if (typeof window.startCodeEntryIdleTimer === 'function') window.startCodeEntryIdleTimer();
};

(function () {
    let hallsList = MASTER_HALLS;
    let subjectsData = MASTER_SUBJECTS;
    window.subjectsData = MASTER_SUBJECTS;
    localStorage.removeItem('subjectsData_v4');

    const COLLEGE_LAT = 30.385873919506743;
    const COLLEGE_LNG = 30.488794680472196;

    const CONFIG = {
        gps: { targetLat: COLLEGE_LAT, targetLong: COLLEGE_LNG, allowedDistanceKm: 2.5 },
        modelsUrl: './models'
    };

    let userIP = "Unknown";
    let geo_watch_id = null;
    let countdownInterval;
    let processIsActive = false;
    let userLat = "", userLng = "";
    let isOpeningMaps = false;

    let deferredPrompt;
    const installBox = document.getElementById('installAppPrompt');
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (installBox) installBox.style.display = 'flex'; });
    window.addEventListener('appinstalled', () => { if (installBox) installBox.style.display = 'none'; deferredPrompt = null; showToast("شكراً لتثبيت التطبيق! 🚀", 4000, "#10b981"); });
    function triggerAppInstall() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((r) => { if (r.outcome === 'accepted' && installBox) installBox.style.display = 'none'; deferredPrompt = null; });
        }
    }

    fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => userIP = d.ip).catch(() => userIP = "Hidden IP");

    function playSuccess() { document.getElementById('successSound').play().catch(() => { }); if (navigator.vibrate) navigator.vibrate([50, 50, 50]); }
    function playBeep() { document.getElementById('beepSound').play().catch(() => { }); }

    let wakeLock = null;
    async function requestWakeLock() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) { } }
    function releaseWakeLock() { if (wakeLock !== null) { wakeLock.release().then(() => { wakeLock = null; }); } }

    window.history.pushState(null, null, window.location.href);
    window.onpopstate = function () {
        if (processIsActive) { window.history.pushState(null, null, window.location.href); }
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { if (isOpeningMaps) return; if (processIsActive) location.reload(); releaseWakeLock(); }
        else { if (isOpeningMaps) isOpeningMaps = false; if (processIsActive) requestWakeLock(); }
    });

    function updateHeaderState(screenId) {
        const wrapper = document.getElementById('heroIconWrapper');
        const icon = document.getElementById('statusIcon');
        if (!wrapper || !icon) return;
        wrapper.classList.remove('show-icon');
        if (screenId !== 'screenWelcome') {
            wrapper.classList.add('show-icon');
            if (screenId === 'screenLoading') { icon.className = "fa-solid fa-satellite-dish hero-icon fa-spin"; icon.style.color = "var(--primary)"; }
            else if (screenId === 'screenDataEntry') { icon.className = "fa-solid fa-user-pen hero-icon"; icon.style.color = "var(--primary)"; icon.style.animation = "none"; }
            else if (screenId === 'screenSuccess') { icon.className = "fa-solid fa-check hero-icon"; icon.style.color = "#10b981"; icon.style.animation = "none"; }
            else if (screenId === 'screenError') { icon.className = "fa-solid fa-triangle-exclamation hero-icon"; icon.style.color = "#ef4444"; icon.style.animation = "none"; }
        }
    }

    window.switchScreen = function (screenId) {
        const currentActive = document.querySelector('.section.active');
        if (currentActive && currentActive.id === screenId) return;
        window.scrollTo({ top: 0, behavior: 'auto' });
        document.querySelectorAll('.section').forEach(sec => {
            sec.style.cssText = "";
            sec.style.setProperty('display', 'none', 'important');
            sec.classList.remove('active');
        });
        const target = document.getElementById(screenId);
        if (target) {
            target.style.cssText = "";
            target.style.setProperty('display', 'flex', 'important');
            target.style.flexDirection = 'column';
            setTimeout(() => target.classList.add('active'), 10);
        }
        const infoBtn = document.getElementById('infoBtn');
        if (infoBtn) infoBtn.style.display = (screenId === 'screenWelcome') ? 'flex' : 'none';
    };

    function openMapsToRefreshGPS() {
        isOpeningMaps = true;
        window.open(`https://www.google.com/maps/search/?api=1&query=${CONFIG.gps.targetLat},${CONFIG.gps.targetLong}`, '_blank');
    }

    window.onload = function () {
        const pinInput = document.getElementById('attendanceCode');
        if (pinInput) pinInput.value = '';

        const savedUID = localStorage.getItem('TARGET_DOCTOR_UID');
        if (savedUID) {
            sessionStorage.setItem('TARGET_DOCTOR_UID', savedUID);
            if (typeof window.resetMainButtonUI === 'function') window.resetMainButtonUI();
        }

        initGlobalGuard();
        updateUIForMode();
        startGPSWatcher();

        renderHallOptions();

        if (typeof listenToSessionState === 'function') listenToSessionState();

        const hallSearchInput = document.getElementById('hallSearchInput');
        if (hallSearchInput) hallSearchInput.addEventListener('input', (e) => renderHallOptions(e.target.value));

        setInterval(() => {
            const now = new Date();
            const timeEl = document.getElementById('currentTime');
            const dateEl = document.getElementById('currentDate');
            if (timeEl) timeEl.innerText = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
            if (dateEl) dateEl.innerText = now.toLocaleDateString('en-GB');
        }, 1000);
    };

    function renderHallOptions(filter = "") {
        const hallContainer = document.getElementById('hallOptionsContainer');
        const hallSelect = document.getElementById('hallSelect');
        if (!hallSelect || !hallContainer) return;

        hallSelect.innerHTML = '<option value="" disabled selected>-- اختر المدرج --</option>';
        hallContainer.innerHTML = '';

        const filteredHalls = hallsList.filter(h => h.includes(filter));
        filteredHalls.forEach(val => {
            let opt = document.createElement('option');
            opt.value = val; opt.text = val;
            hallSelect.appendChild(opt);

            let cOpt = document.createElement('div');
            cOpt.className = "custom-option";
            cOpt.setAttribute('data-value', val);
            cOpt.innerHTML = `<span>${val}</span>`;
            cOpt.addEventListener('click', function (e) {
                e.stopPropagation();
                hallContainer.parentElement.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                const triggerText = document.querySelector('#hallSelectWrapper .trigger-text');
                if (triggerText) triggerText.textContent = val;
                const wrapper = document.getElementById('hallSelectWrapper');
                if (wrapper) wrapper.classList.remove('open');
                hallSelect.value = val;
                if (typeof playClick === 'function') playClick();
            });
            hallContainer.appendChild(cOpt);
        });

        if (filteredHalls.length === 0) hallContainer.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:12px;">لا توجد نتائج</div>';
    }

    function startGPSWatcher() {
        if (navigator.geolocation) {
            geo_watch_id = navigator.geolocation.watchPosition(
                (pos) => { userLat = pos.coords.latitude; userLng = pos.coords.longitude; },
                () => { },
                { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
            );
        }
    }

    window.updateUIForMode = function () {
        const adminToken = sessionStorage.getItem("secure_admin_session_token_v99");
        const isStaff = !!adminToken;

        document.body.classList.remove('is-dean', 'is-doctor', 'is-student');
        document.body.classList.add('is-student');

        const sessionBtn = document.getElementById('btnToggleSession');
        const quickModeBtn = document.getElementById('btnQuickMode');
        const toolsBtn = document.getElementById('btnToolsRequest');
        const deanZone = document.getElementById('deanPrivateZone');
        const btnDataEntry = document.getElementById('btnDataEntry');
        const reportBtn = document.getElementById('btnViewReport');
        const facultyProfileBtn = document.getElementById('facultyProfileBtn');
        const studentProfileBtn = document.getElementById('studentProfileBtn');
        const mainActionBtn = document.getElementById('mainActionBtn');
        const makaniBar = document.getElementById('makaniSearchBar');
        const btnFeed = document.getElementById('btnLiveFeedback');

        [sessionBtn, quickModeBtn, toolsBtn, deanZone, btnDataEntry, facultyProfileBtn, btnFeed].forEach(el => {
            if (el) el.style.setProperty('display', 'none', 'important');
        });

        if (reportBtn) reportBtn.classList.add('locked');
        if (mainActionBtn) mainActionBtn.style.display = 'flex';
        if (makaniBar) makaniBar.style.display = 'block';
        if (studentProfileBtn) studentProfileBtn.style.display = 'flex';

        const savedLang = localStorage.getItem('sys_lang') || 'ar';
        if (typeof changeLanguage === 'function') changeLanguage(savedLang);
    };
    window.updateUIForMode = window.updateUIForMode;

    window.startProcess = async function (isRetry) {
        if (typeof playClick === 'function') playClick();
        const user = auth.currentUser;
        if (!user) { if (typeof window.openAuthDrawer === 'function') window.openAuthDrawer(); return; }

        const savedDoctorUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
        if (savedDoctorUID) {
            switchScreen('screenLiveSession');
            if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();
            return;
        }

        window.switchScreen('screenDataEntry');
        const step1 = document.getElementById('step1_search');
        const step2 = document.getElementById('step2_auth');
        const errMsg = document.getElementById('screenError');
        if (step2) step2.style.setProperty('display', 'none', 'important');
        if (errMsg) errMsg.style.display = 'none';
        if (step1) step1.style.cssText = "display: block !important; visibility: visible !important;";
        setTimeout(() => { const input = document.getElementById('attendanceCode'); if (input) input.focus(); }, 150);
        if (typeof window.startCodeEntryIdleTimer === 'function') window.startCodeEntryIdleTimer();

    };
    window.openAuthDrawer = function () {
        const drawer = document.getElementById('studentAuthDrawer');
        if (drawer) {
            drawer.style.display = 'flex';
            setTimeout(() => {
                drawer.classList.add('active');
                const content = drawer.querySelector('.auth-drawer-content');
                if (content) { content.style.transform = 'translateY(0)'; content.style.opacity = '1'; }
            }, 10);
        }
    };

    window.closeAuthDrawer = function () {
        const drawer = document.getElementById('studentAuthDrawer');
        if (drawer) {
            drawer.classList.remove('active');
            setTimeout(() => { drawer.style.display = 'none'; document.body.style.overflow = 'auto'; }, 200);
        }
    };

    window.toggleAuthMode = (mode) => {
        const loginSec = document.getElementById('loginSection');
        const signupSec = document.getElementById('signupSection');
        const title = document.getElementById('authTitle');
        const subtitle = document.getElementById('authSubtitle');
        if (mode === 'signup') {
            loginSec.classList.remove('active'); signupSec.classList.add('active');
            title.innerText = 'Create Account'; subtitle.innerText = 'Join our nursing community below';
        } else {
            signupSec.classList.remove('active'); loginSec.classList.add('active');
            title.innerText = 'Welcome Back'; subtitle.innerText = 'Please enter your details to continue';
        }
    };

    window.togglePass = (inputId, icon) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        if (icon) {
            if (isPassword) { icon.classList.replace('fa-eye', 'fa-eye-slash'); icon.style.color = "#0ea5e9"; icon.style.filter = "drop-shadow(0 0 5px rgba(14,165,233,0.5))"; }
            else { icon.classList.replace('fa-eye-slash', 'fa-eye'); icon.style.color = "#94a3b8"; icon.style.filter = "none"; }
        }
        if (navigator.vibrate) navigator.vibrate(10);
    };

    window.validateSignupForm = function () {
        const getEl = (id) => document.getElementById(id);
        const getVal = (id) => getEl(id)?.value?.trim() || "";

        const email = getVal('regEmail');
        const emailConfirm = getVal('regEmailConfirm');
        const pass = getVal('regPass');
        const passConfirm = getVal('regPassConfirm');
        const level = getVal('regLevel');
        const gender = getVal('regGender');
        const name = getVal('regFullName');
        const groupRaw = getVal('regGroup').toUpperCase();

        const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const isEmailValid = emailPattern.test(email);
        const isEmailMatch = (email === emailConfirm && isEmailValid);
        const emailConfEl = getEl('regEmailConfirm');
        const emailErr = getEl('emailError');
        if (emailConfirm !== "") {
            emailConfEl.style.borderColor = isEmailMatch ? "#10b981" : "#ef4444";
            if (emailErr) emailErr.style.display = isEmailMatch ? 'none' : 'block';
        }

        const isPassLen = pass.length >= 6;
        const isPassMatch = (pass === passConfirm && isPassLen);
        const passConfEl = getEl('regPassConfirm');
        const passErr = getEl('passError');
        if (passConfirm !== "") {
            passConfEl.style.borderColor = isPassMatch ? "#10b981" : "#ef4444";
            if (passErr) passErr.style.display = isPassMatch ? 'none' : 'block';
        }

        const groupPattern = /^[1-4][GPNCDTBH]\d{1,2}$/;
        const isGroupFormatValid = groupPattern.test(groupRaw);
        const isGroupLevelMatch = (level === "" || !isGroupFormatValid) ? true : groupRaw.startsWith(level);
        const isGroupValid = isGroupFormatValid && isGroupLevelMatch;

        const groupEl = getEl('regGroup');
        if (groupEl && groupRaw.length > 0) {
            groupEl.style.borderColor = isGroupValid ? "#10b981" : "#ef4444";
            groupEl.style.backgroundColor = isGroupValid ? "#f0fdf4" : "#fef2f2";
            if (getEl('regGroup').value !== groupRaw) getEl('regGroup').value = groupRaw;
        } else if (groupEl) { groupEl.style.borderColor = ""; groupEl.style.backgroundColor = ""; }

        const isNameValid = name !== "" && !name.toLowerCase().includes("not registered") && !name.includes("⚠️") && !name.includes("❌");
        const isEverythingValid = isEmailValid && isEmailMatch && isPassLen && isPassMatch && level !== "" && gender !== "" && isNameValid && isGroupValid;

        const btn = getEl('btnDoSignup');
        if (btn) {
            btn.disabled = !isEverythingValid;
            btn.style.opacity = isEverythingValid ? "1" : "0.5";
            btn.style.filter = isEverythingValid ? "grayscale(0%)" : "grayscale(100%)";
            btn.style.cursor = isEverythingValid ? "pointer" : "not-allowed";
            btn.style.boxShadow = isEverythingValid ? "0 4px 12px rgba(16,185,129,0.2)" : "none";
        }
    };

    document.addEventListener('input', (e) => { if (e.target.id && e.target.id.startsWith('reg')) validateSignupForm(); });

    document.addEventListener('DOMContentLoaded', () => {
        const pinInput = document.getElementById('attendanceCode');
        if (pinInput) {
            pinInput.value = '';
            pinInput.setAttribute('autocomplete', 'off');
            pinInput.setAttribute('inputmode', 'numeric');

            pinInput.addEventListener('keydown', () => { if (typeof isTyping !== 'undefined') isTyping = true; if (typeof elapsedTime !== 'undefined') elapsedTime = 0; });
            pinInput.addEventListener('keyup', () => { if (typeof isTyping !== 'undefined') isTyping = false; });
            pinInput.addEventListener('input', (e) => {
                if (typeof isTyping !== 'undefined') isTyping = false;
                if (typeof elapsedTime !== 'undefined') elapsedTime = 0;
                if (e.target.value.trim().length === 6) {
                    if (typeof window.searchForSession === 'function') window.searchForSession();
                }
            });
        }

        const passInputForEnter = document.getElementById('sessionPass');
        if (passInputForEnter) {
            passInputForEnter.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && typeof window.joinSessionAction === 'function') window.joinSessionAction();
            });
        }

        const signupFields = ['regStudentID', 'regFullName', 'regLevel', 'regGender', 'regGroup', 'regEmail', 'regEmailConfirm', 'regPass', 'regPassConfirm'];
        signupFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('input', () => { if (typeof validateSignupForm === 'function') validateSignupForm(); }); el.addEventListener('change', () => { if (typeof validateSignupForm === 'function') validateSignupForm(); }); }
        });

        const savedLang = localStorage.getItem('sys_lang') || 'ar';
        if (typeof changeLanguage === 'function') {
            changeLanguage(savedLang);
            document.querySelectorAll('.active-lang-text-pro').forEach(s => { s.innerText = (savedLang === 'ar') ? 'EN' : 'عربي'; });
        }

        const groupInput = document.getElementById('regGroup');
        const levelSelect = document.getElementById('regLevel');
        if (groupInput) {
            groupInput.addEventListener('input', function () {
                this.value = this.value.toUpperCase().replace(/[^0-9GPNCDTBH]/g, '');
                if (typeof window.validateSignupForm === 'function') window.validateSignupForm();
            });
        }
        if (levelSelect) levelSelect.addEventListener('change', () => { if (typeof window.validateSignupForm === 'function') window.validateSignupForm(); });
    });

    ['regEmail', 'regEmailConfirm', 'regPass', 'regPassConfirm', 'regGender', 'regLevel', 'regGroup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', validateSignupForm);
    });

    function showToast(message, duration = 3000, bgColor = '#334155') {
        const toast = document.getElementById('toastNotification');
        toast.style.backgroundColor = bgColor;
        toast.innerText = message;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, duration);
    }

    document.addEventListener('contextmenu', (e) => { e.preventDefault(); showToast('إجراء محظور لأسباب أمنية.', 2000, '#ef4444'); });
    document.addEventListener('copy', (e) => { e.preventDefault(); showToast('النسخ محظور لأسباب أمنية.', 2000, '#ef4444'); });
    document.addEventListener('cut', (e) => { e.preventDefault(); showToast('القص محظور لأسباب أمنية.', 2000, '#ef4444'); });
    document.addEventListener('paste', (e) => { e.preventDefault(); showToast('اللصق محظور لأسباب أمنية.', 2000, '#ef4444'); });

    function safeClick(btn) { if (btn) { btn.style.opacity = "0.7"; btn.style.pointerEvents = "none"; } }

    function showConnectionLostModal() { const m = document.getElementById('connectionLostModal'); if (m) m.style.display = 'flex'; }
    function hideConnectionLostModal() { const m = document.getElementById('connectionLostModal'); if (m) m.style.display = 'none'; }
    async function checkRealConnection() { return true; }

    function initGlobalGuard() {
        setInterval(async () => { const o = await checkRealConnection(); if (!o) showConnectionLostModal(); else hideConnectionLostModal(); }, 2000);
        if (!isMobileDevice()) { document.getElementById('desktop-blocker').style.display = 'flex'; document.body.style.overflow = 'hidden'; throw new Error("Desktop access denied."); }
    }

    window.getDistanceFromLatLonInKm = function (lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    window.toggleDropdown = function (listId) {
        const list = document.getElementById(listId);
        document.querySelectorAll('.dropdown-list').forEach(el => { if (el.id !== listId) el.classList.remove('show'); });
        list.classList.toggle('show');
    };

    document.addEventListener('click', (e) => { if (!e.target.closest('.custom-dropdown')) document.querySelectorAll('.dropdown-list').forEach(el => el.classList.remove('show')); });

    window.selectOption = function (type, value, text) {
        const hiddenInput = document.getElementById('reg' + type);
        if (hiddenInput) hiddenInput.value = value;
        const parentDiv = document.getElementById('dropdown' + type);
        if (parentDiv) parentDiv.classList.add('selected-active');
        const listUl = document.getElementById('list' + type);
        if (listUl) listUl.classList.remove('show');
        if (typeof validateSignupForm === 'function') validateSignupForm();
    };

    const AVATAR_ASSETS = {
        "Male": ['fa-user-tie', 'fa-user-graduate', 'fa-user-doctor', 'fa-user-astronaut', 'fa-user-ninja', 'fa-user-secret', 'fa-user-crown', 'fa-person-biking', 'fa-person-skating', 'fa-person-snowboarding', 'fa-person-swimming', 'fa-robot', 'fa-ghost', 'fa-dragon', 'fa-gamepad', 'fa-headset', 'fa-guitar', 'fa-rocket', 'fa-bolt', 'fa-fire'],
        "Female": ['fa-user-nurse', 'fa-user-graduate', 'fa-user-doctor', 'fa-person-dress', 'fa-person-praying', 'fa-person-hiking', 'fa-person-skiing', 'fa-cat', 'fa-dove', 'fa-gem', 'fa-wand-magic-sparkles', 'fa-camera-retro', 'fa-palette', 'fa-mug-hot', 'fa-leaf', 'fa-heart', 'fa-star', 'fa-crown']
    };
    const AVATAR_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'];

    window.openStudentProfile = async function (forceRefresh = false) {
        const user = auth.currentUser;
        const infoBtn = document.getElementById('infoBtn');
        if (infoBtn) infoBtn.style.display = 'none';

        if (!user) { showToast("⚠️ يرجى تسجيل الدخول أولاً", 3000, "#f59e0b"); return; }

        const modal = document.getElementById('studentProfileModal');
        if (modal) { modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10); }

        const cachedProfileData = localStorage.getItem('cached_profile_data');
        if (cachedProfileData) {
            try {
                const cData = JSON.parse(cachedProfileData);
                if (cData.uid === user.uid) {
                    document.getElementById('profFullName').innerText = cData.fullName || "--";
                    document.getElementById('profStudentID').innerText = cData.studentID || "--";

                    const COLLEGE_NAME_MAP = { 'N': 'Nursing', 'P': 'Physical Therapy', 'C': 'Pharmacy', 'D': 'Dentistry', 'T': 'Computer Science', 'B': 'Business Admin', 'H': 'Health Sciences' };
                    const COLLEGE_CODE_MAP = { 'NURS': 'N', 'PT': 'P', 'PHARM': 'C', 'DENT': 'D', 'CS': 'T', 'BA': 'B', 'HS': 'H' };
                    const grp = cData.group || "";
                    const letter = (cData.college ? (COLLEGE_CODE_MAP[cData.college] || grp[1]?.toUpperCase() || 'N') : (grp.length >= 2 ? grp[1].toUpperCase() : 'N'));
                    const roleEl = document.querySelector('.pro-role');
                    if (roleEl) roleEl.innerHTML = `<span style="font-size:13px;font-weight:800;">${COLLEGE_NAME_MAP[letter] || 'Nursing'} Student</span><br><span style="font-size:13px;color:#0ea5e9;font-weight:900;background:#e0f2fe;padding:2px 10px;border-radius:20px;display:inline-block;margin-top:4px;">${grp || "--"}</span>`;

                    document.getElementById('profLevel').innerText = `الفرقة ${cData.level || '?'}`;
                    document.getElementById('profGender').innerText = cData.gender || "--";
                    document.getElementById('profEmail').innerText = cData.email || user.email;

                    const cAvatarEl = document.getElementById('currentAvatar');
                    if (cAvatarEl) { cAvatarEl.innerHTML = `<i class="fa-solid ${cData.avatarClass || 'fa-user-graduate'}"></i>`; cAvatarEl.style.color = "var(--primary-dark)"; }
                }
            } catch (e) { }
        }

        const statsCacheKey = `stats_cache_${user.uid}`;
        const cachedStatsStr = localStorage.getItem(statsCacheKey);
        if (cachedStatsStr && !forceRefresh) {
            try {
                const cachedStats = JSON.parse(cachedStatsStr);
                if ((Date.now() - cachedStats.timestamp) < 900000) {
                    document.getElementById('profAttendanceVal').innerText = cachedStats.attendance;
                    document.getElementById('profAbsenceVal').innerText = cachedStats.absence;
                    const discEl = document.getElementById('profDisciplineVal');
                    if (cachedStats.discipline === "bad") { discEl.innerText = "مشاغب"; discEl.style.color = "#ef4444"; }
                    else if (cachedStats.discipline === "warning") { discEl.innerText = "تنبيه"; discEl.style.color = "#f59e0b"; }
                    else { discEl.innerText = "ملتزم"; discEl.style.color = "#10b981"; }
                    return;
                }
            } catch (e) { }
        }

        document.getElementById('profAttendanceVal').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:14px"></i>';
        document.getElementById('profAbsenceVal').innerHTML = '-';
        document.getElementById('profDisciplineVal').innerHTML = '-';

        try {
            const docSnap = await getDoc(doc(db, "user_registrations", user.uid));
            if (!docSnap.exists()) return;
            const data = docSnap.data();
            const info = data.registrationInfo || data;

            document.getElementById('profFullName').innerText = info.fullName || "--";
            document.getElementById('profStudentID').innerText = info.studentID || "--";

            const COLLEGE_NAME_MAP = { 'N': 'Nursing', 'P': 'Physical Therapy', 'C': 'Pharmacy', 'D': 'Dentistry', 'T': 'Computer Science', 'B': 'Business Admin', 'H': 'Health Sciences' };
            const COLLEGE_CODE_MAP = { 'NURS': 'N', 'PT': 'P', 'PHARM': 'C', 'DENT': 'D', 'CS': 'T', 'BA': 'B', 'HS': 'H' };
            const studentGroup = info.group || "";
            const collegeCode = data.college || info.college || "";
            const letter = collegeCode ? (COLLEGE_CODE_MAP[collegeCode] || studentGroup[1]?.toUpperCase() || 'N') : (studentGroup.length >= 2 ? studentGroup[1].toUpperCase() : 'N');
            const roleEl = document.querySelector('.pro-role');
            if (roleEl) roleEl.innerHTML = `<span style="font-size:13px;font-weight:800;">${COLLEGE_NAME_MAP[letter] || 'Nursing'} Student</span><br><span style="font-size:13px;color:#0ea5e9;font-weight:900;background:#e0f2fe;padding:2px 10px;border-radius:20px;display:inline-block;margin-top:4px;">${studentGroup || "--"}</span>`;

            document.getElementById('profLevel').innerText = `الفرقة ${info.level || '?'}`;
            document.getElementById('profGender').innerText = info.gender || "--";
            document.getElementById('profEmail').innerText = info.email || user.email || "--";

            const currentAvatarEl = document.getElementById('currentAvatar');
            if (currentAvatarEl) { currentAvatarEl.innerHTML = `<i class="fa-solid ${data.avatarClass || info.avatarClass || 'fa-user-graduate'}"></i>`; currentAvatarEl.style.color = "var(--primary-dark)"; }

            const myGroup = (info.group && info.group.trim() !== "") ? info.group.trim() : "General";
            const countersQuery = query(collection(db, "course_counters"), where("targetGroups", "array-contains", myGroup));
            const [myStatsSnap, countersSnap] = await Promise.all([getDoc(doc(db, "student_stats", user.uid)), getDocs(countersQuery)]);

            let myAttendedSubjects = {};
            let disciplineStatus = "good";
            if (myStatsSnap.exists()) {
                const sData = myStatsSnap.data();
                myAttendedSubjects = sData.attended || {};
                if (sData.cumulative_unruly >= 3) disciplineStatus = "bad";
                else if (sData.cumulative_unruly > 0) disciplineStatus = "warning";
            }

            let totalSessionsHeldMap = {};
            countersSnap.forEach(doc => {
                const subjectName = doc.data().subject.trim();
                totalSessionsHeldMap[subjectName] = (totalSessionsHeldMap[subjectName] || 0) + 1;
            });

            const normalizeStr = (str) => str.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '').toLowerCase();
            let totalAttendanceDays = 0;
            let totalAbsenceDays = 0;

            for (const [subjectHeld, totalHeldCount] of Object.entries(totalSessionsHeldMap)) {
                let studentCount = 0;
                const targetNorm = normalizeStr(subjectHeld);
                for (const [studentSubject, studentVal] of Object.entries(myAttendedSubjects)) {
                    if (normalizeStr(studentSubject) === targetNorm) { studentCount = studentVal; break; }
                }
                totalAttendanceDays += studentCount;
                totalAbsenceDays += Math.max(0, totalHeldCount - studentCount);
            }

            document.getElementById('profAttendanceVal').innerText = totalAttendanceDays;
            document.getElementById('profAbsenceVal').innerText = totalAbsenceDays;
            const discEl = document.getElementById('profDisciplineVal');
            if (disciplineStatus === "bad") { discEl.innerText = "مشاغب"; discEl.style.color = "#ef4444"; }
            else if (disciplineStatus === "warning") { discEl.innerText = "تنبيه"; discEl.style.color = "#f59e0b"; }
            else { discEl.innerText = "ملتزم"; discEl.style.color = "#10b981"; }

            localStorage.setItem(statsCacheKey, JSON.stringify({ attendance: totalAttendanceDays, absence: totalAbsenceDays, discipline: disciplineStatus, timestamp: Date.now() }));
        } catch (calcError) {
            console.error("Profile Calculation Error:", calcError);
            document.getElementById('profAttendanceVal').innerText = "?";
            document.getElementById('profAbsenceVal').innerText = "?";
        }
    };

    window.openAvatarSelector = async function () {
        const user = auth.currentUser;
        if (!user) return;
        const grid = document.getElementById('avatarsGrid');
        if (!grid) return;

        let gender = "Male";
        try {
            const docSnap = await getDoc(doc(db, "user_registrations", user.uid));
            if (docSnap.exists()) { const info = docSnap.data().registrationInfo || docSnap.data(); if (info.gender) gender = info.gender; }
        } catch (e) { }

        grid.innerHTML = '';
        const icons = AVATAR_ASSETS[gender] || AVATAR_ASSETS["Male"];
        icons.forEach((iconClass, index) => {
            const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
            const item = document.createElement('div');
            item.className = 'avatar-option-modern';
            item.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            item.style.color = color;
            item.style.borderColor = color + '40';
            item.style.backgroundColor = color + '10';
            item.onclick = () => saveNewAvatar(iconClass, color);
            grid.appendChild(item);
        });

        const modal = document.getElementById('avatarSelectorModal');
        if (modal) { modal.style.zIndex = "2147483647"; modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10); }
    };

    window.saveNewAvatar = async function (iconClass, color) {
        const user = auth.currentUser;
        if (!user) return;

        const studentAvatar = document.getElementById('currentAvatar');
        if (studentAvatar) {
            studentAvatar.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            if (color) { studentAvatar.style.color = color; studentAvatar.style.borderColor = color; studentAvatar.style.backgroundColor = color + '10'; }
        }
        document.getElementById('avatarSelectorModal').style.display = 'none';

        try {
            await setDoc(doc(db, "user_registrations", user.uid), { avatarClass: iconClass }, { merge: true });
            const cached = localStorage.getItem('cached_profile_data');
            if (cached) {
                let cacheObj = JSON.parse(cached);
                if (cacheObj.uid === user.uid) { cacheObj.avatarClass = iconClass; localStorage.setItem('cached_profile_data', JSON.stringify(cacheObj)); }
            }
            showToast("✅ تم تحديث صورتك بنجاح", 2000, "#10b981");
        } catch (e) { console.error("Save Avatar Error:", e); showToast("❌ فشل حفظ التغييرات", 3000, "#ef4444"); }
    };

    window.checkForPendingSurveys = async function () {
        const user = auth.currentUser;
        if (!user) return;

        const excludedUID = "R78Lu7IZBpYK0WngcaSL6t1Our62";
        if (user.uid === excludedUID) {
            console.log("Feedback skipped for this specific user.");
            return;
        }

        try {
            let studentCode = "";
            const userDoc = await getDoc(doc(db, "user_registrations", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                studentCode = data.registrationInfo?.studentID || data.studentID;
            }
            if (!studentCode) return;

            const q = query(collection(db, "attendance"), where("id", "==", studentCode), where("feedback_status", "==", "pending"), limit(1));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const pendingDoc = querySnapshot.docs[0];
                const data = pendingDoc.data();
                document.getElementById('feedbackSubjectName').innerText = data.subject || "محاضرة";
                document.getElementById('feedbackDocName').innerText = data.doctorName || "الكلية";
                document.getElementById('targetAttendanceDocId').value = pendingDoc.id;
                window.selectStar(0);
                document.getElementById('feedbackModal').style.display = 'flex';
            }
        } catch (e) { console.error("Survey Check Error:", e); }
    };

    window.selectStar = function (val) {
        const stars = document.querySelectorAll('.star-btn');
        const textField = document.getElementById('ratingText');
        const input = document.getElementById('selectedRating');
        input.value = val;

        const lang = localStorage.getItem('sys_lang') || 'ar';
        const dict = i18n[lang];
        const texts = ["", dict.rate_bad, dict.rate_poor, dict.rate_fair, dict.rate_good, dict.rate_excellent];

        stars.forEach(star => {
            const starVal = parseInt(star.getAttribute('data-value'));
            if (starVal <= val) star.classList.add('active');
            else star.classList.remove('active');
        });

        if (textField) { textField.innerText = texts[val]; textField.style.animation = "none"; setTimeout(() => textField.style.animation = "fadeIn 0.3s", 10); }
        if (navigator.vibrate) navigator.vibrate(20);
    };

    window.submitFeedback = async function () {
        const rating = document.getElementById('selectedRating').value;
        const docId = document.getElementById('targetAttendanceDocId').value;
        const btn = document.querySelector('#feedbackModal .btn-main');

        if (rating == "0") { showToast("⚠️ من فضلك قيم بعدد النجوم", 2000, "#f59e0b"); return; }

        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التوثيق...';
        btn.style.pointerEvents = 'none';

        try {
            const attRef = doc(db, "attendance", docId);
            const attSnap = await getDoc(attRef);
            if (!attSnap.exists()) throw new Error("بيانات الحضور غير موجودة");

            const roomData = attSnap.data();
            const batch = writeBatch(db);
            batch.update(attRef, { feedback_status: "submitted", feedback_timestamp: serverTimestamp() });
            batch.set(doc(collection(db, "feedback_reports")), {
                rating: parseInt(rating), comment: "", timestamp: serverTimestamp(),
                doctorName: roomData.doctorName, doctorUID: roomData.doctorUID, subject: roomData.subject,
                hall: roomData.hall || "Unknown", date: roomData.date, studentId: roomData.id, studentLevel: "General"
            });
            await batch.commit();
            document.getElementById('feedbackModal').style.display = 'none';
            showToast("✅ تم وصول تقييمك للإدارة بخصوصية تامة.", 3000, "#10b981");
            setTimeout(() => window.checkForPendingSurveys(), 1000);
        } catch (e) { console.error("Feedback Error:", e); showToast("❌ تعذر الإرسال، حاول مرة أخرى", 3000, "#ef4444"); }
        finally { btn.innerHTML = 'إرسال التقييم <i class="fa-solid fa-paper-plane"></i>'; btn.style.pointerEvents = 'auto'; }
    };

    window.showSmartWelcome = function (name) {
        const today = new Date().toLocaleDateString('en-GB');
        if (localStorage.getItem('last_welcome_date') !== today) {
            const modal = document.getElementById('dailyWelcomeModal');
            const nameSpan = document.getElementById('welcomeUserName');
            if (modal && nameSpan) {
                let englishName = (typeof arabToEng === 'function') ? arabToEng(name.split(' ')[0]) : name.split(' ')[0];
                nameSpan.innerText = englishName;
                modal.style.display = 'flex';
                modal.style.opacity = '1';
                localStorage.setItem('last_welcome_date', today);
            }
        }
    };

    window.closeDailyWelcome = function () {
        const modal = document.getElementById('dailyWelcomeModal');
        if (modal) { modal.style.transition = "0.3s ease"; modal.style.opacity = "0"; setTimeout(() => modal.style.display = 'none', 300); }
    };

    window.changeLanguage = function (lang) {
        const dict = i18n[lang];
        if (!dict) return;
        document.documentElement.dir = dict.dir || "rtl";
        document.documentElement.lang = lang;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const newText = dict[key];
            if (newText && newText !== "") {
                const icon = el.querySelector('i');
                if (icon) el.innerHTML = `${icon.outerHTML} <span class="btn-text-content">${newText}</span>`;
                else el.innerText = newText;
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(input => {
            const key = input.getAttribute('data-i18n-placeholder');
            if (dict[key]) input.placeholder = dict[key];
        });
        localStorage.setItem('sys_lang', lang);
    };

    window.toggleSystemLanguage = async function () {
        const user = auth.currentUser;
        const currentLang = localStorage.getItem('sys_lang') || 'ar';
        const newLang = (currentLang === 'ar') ? 'en' : 'ar';
        changeLanguage(newLang);
        document.querySelectorAll('.active-lang-text-pro').forEach(s => { s.innerText = (newLang === 'ar') ? 'EN' : 'عربي'; });
        if (user) {
            try { await setDoc(doc(db, "user_registrations", user.uid), { preferredLanguage: newLang }, { merge: true }); }
            catch (e) { console.warn("Language sync skipped:", e.message); }
        }
    };

    window.forceOpenPinScreen = function () {
        const user = auth.currentUser;
        if (!user) {
            showToast("⚠️ عذراً، يجب تسجيل الدخول أولاً", 3000, "#f59e0b");
            if (typeof window.openAuthDrawer === 'function') window.openAuthDrawer();
            return;
        }
        window.switchScreen('screenDataEntry');
        const step1 = document.getElementById('step1_search');
        const step2 = document.getElementById('step2_auth');
        const errMsg = document.getElementById('screenError');
        if (step2) step2.style.setProperty('display', 'none', 'important');
        if (errMsg) errMsg.style.display = 'none';
        if (step1) step1.style.cssText = "display: block !important; opacity: 1 !important; visibility: visible !important; width: 100%;";
        setTimeout(() => { const input = document.getElementById('attendanceCode'); if (input) input.focus(); }, 150);
        if (typeof window.startCodeEntryIdleTimer === 'function') window.startCodeEntryIdleTimer();

    };
    window.resetMainButtonUI = function () {
        const btn = document.getElementById('mainActionBtn');
        const lang = localStorage.getItem('sys_lang') || 'ar';
        const isAr = (lang === 'ar');
        if (!btn) return;

        const targetDoctorUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
        if (targetDoctorUID) {
            btn.innerHTML = `${isAr ? "دخول المحاضرة" : "Enter Lecture"} <i class="fa-solid fa-door-open fa-beat-fade"></i>`;
            btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
            btn.style.boxShadow = "0 8px 25px -5px rgba(16, 185, 129, 0.5)";
            btn.style.border = "1px solid #10b981";
            btn.onclick = function () {
                if (typeof playClick === 'function') playClick();
                switchScreen('screenLiveSession');
                if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();
            };
        } else {
            const dict = (typeof i18n !== 'undefined') ? i18n[lang] : null;
            const regText = dict ? dict.main_reg_btn : (isAr ? "تسجيل الحضور" : "Register Attendance");
            btn.innerHTML = `${regText} <i class="fa-solid fa-fingerprint"></i>`;
            btn.style.background = "";
            btn.style.boxShadow = "";
            btn.style.border = "";
            btn.onclick = function () {
                if (typeof window.forceOpenPinScreen === 'function') window.forceOpenPinScreen();
                else window.startProcess(false);
            };
        }
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = "1";
        btn.classList.remove('locked');
        btn.disabled = false;
    };

    window.goHome = function () {
        const liveScreen = document.getElementById('screenLiveSession');
        if (liveScreen) { liveScreen.style.cssText = ""; liveScreen.style.setProperty('display', 'none', 'important'); }
        window.switchScreen('screenWelcome');
        const infoBtn = document.getElementById('infoBtn');
        if (infoBtn) infoBtn.style.display = 'flex';
        document.body.classList.add('on-welcome-screen');
        document.body.classList.remove('hide-main-icons');
        document.body.style.overflow = 'auto';
    };

    window.startSmartSearch = async function () {
        const rawInput = document.getElementById('makaniInput').value.trim();
        const content = document.getElementById('makaniContent');
        const modal = document.getElementById('makaniResultsModal');
        const btn = document.getElementById('btnMakani');
        const _t = window.t || ((k, def) => def);

        const smartNormalize = (text) => {
            if (!text) return "";
            let clean = text.toString().toLowerCase();
            clean = clean.replace(/\b(dr|prof|eng|mr|mrs|ms|د|دكتور|مهندس)\b\.?/g, ' ');
            clean = clean.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ");
            return clean.replace(/\s+/g, ' ').trim();
        };

        if (!rawInput) return;

        const queryNormal = smartNormalize(rawInput);
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        content.innerHTML = `<div style="padding:30px;text-align:center;"><i class="fa-solid fa-wand-magic-sparkles fa-bounce" style="font-size:40px;color:#0ea5e9;"></i><p>${_t('processing_text', 'جاري البحث في الكلية...')}</p></div>`;
        modal.style.display = 'flex';

        try {
            let resultsFound = [];
            const sessionQ = query(collection(db, "active_sessions"), where("isActive", "==", true));
            const sessionSnap = await getDocs(sessionQ);

            for (const sessionDoc of sessionSnap.docs) {
                const data = { ...sessionDoc.data() };
                const doctorId = sessionDoc.id;
                const dbSubject = smartNormalize(data.allowedSubject || "");
                const dbGroups = Array.isArray(data.targetGroups) ? data.targetGroups : [];
                const isGroupMatch = dbGroups.some(g => smartNormalize(g).includes(queryNormal));

                let isMatch = false;
                let matchType = "session";

                if (dbSubject.includes(queryNormal) || isGroupMatch) {
                    isMatch = true;
                } else if (!isNaN(rawInput) && rawInput.length >= 3) {
                    const participantsRef = collection(db, "active_sessions", doctorId, "participants");
                    const q = query(participantsRef, where("id", "==", rawInput), where("status", "==", "active"));
                    const querySnap = await getDocs(q);
                    if (!querySnap.empty) { isMatch = true; matchType = "student"; data.friendName = querySnap.docs[0].data().name; }
                }

                if (isMatch) {
                    try {
                        const countQ = query(collection(db, "active_sessions", doctorId, "participants"), where("status", "==", "active"));
                        const countSnap = await getCountFromServer(countQ);
                        data.liveCount = countSnap.data().count;
                    } catch { data.liveCount = "?"; }
                    data.matchType = matchType;
                    data.doctorId = doctorId;
                    resultsFound.push(data);
                }
            }

            if (resultsFound.length === 0) {
                content.innerHTML = `<div class="empty-state-modern"><div class="empty-icon-bg"><i class="fa-solid fa-magnifying-glass-minus" style="font-size:30px;color:#94a3b8;"></i></div><h3 style="margin-top:10px;font-size:14px;color:#64748b;">${_t('search_no_results_custom', 'لم يتم العثور على نتائج')}</h3><p style="font-size:11px;color:#cbd5e1;">"${rawInput}"</p></div>`;
            } else {
                content.innerHTML = '';
                resultsFound.forEach(res => {
                    const card = document.createElement('div');
                    const docName = res.doctorName || "";
                    const isEngName = /^[A-Za-z]/.test(docName);
                    const prefix = isEngName ? "Dr." : "د.";
                    const dirStyle = isEngName ? "ltr" : "rtl";
                    const alignStyle = isEngName ? "left" : "right";

                    if (res.matchType === 'session') {
                        card.className = 'makani-card no-hover';
                        card.innerHTML = `
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                                <div style="flex:1;">
                                    <div style="font-weight:900;font-size:16px;color:#0f172a;margin-bottom:4px;">${res.allowedSubject}</div>
                                    <div style="font-size:13px;color:#64748b;cursor:default;direction:${dirStyle};text-align:${alignStyle};width:100%;">${prefix} ${docName}</div>
                                </div>
                                <div style="text-align:center;background:#dcfce7;color:#166534;padding:5px 10px;border-radius:10px;font-size:12px;font-weight:bold;margin-right:5px;">
                                    <span class="blink-dot" style="background:#16a34a;"></span> LIVE (${res.liveCount})
                                </div>
                            </div>
                            <div class="hall-badge-formal">
                                <div style="font-size:10px;color:#94a3b8;">${_t('formal_direction', 'المكان الحالي')}</div>
                                <div style="font-size:20px;font-weight:900;color:#fff;">HALL: ${res.hall}</div>
                            </div>`;
                    } else if (res.matchType === 'student') {
                        const stdName = res.friendName || "";
                        const isEngStd = /^[A-Za-z]/.test(stdName);
                        const dirAttr = isEngStd ? "ltr" : "rtl";
                        const alignAttr = isEngStd ? "left" : "right";
                        card.className = 'makani-card no-hover';
                        card.innerHTML = `
                            <div style="width:100%;direction:${dirAttr};">
                                <div style="display:flex;align-items:center;gap:15px;margin-bottom:20px;">
                                    <div style="background:#f0f9ff;min-width:55px;height:55px;border-radius:50%;color:#0ea5e9;display:flex;align-items:center;justify-content:center;border:2px solid #bae6fd;flex-shrink:0;">
                                        <i class="fa-solid fa-user-graduate" style="font-size:24px;"></i>
                                    </div>
                                    <div style="flex:1;text-align:${alignAttr};">
                                        <div style="font-weight:900;font-size:16px;color:#0f172a;margin-bottom:5px;">${stdName}</div>
                                        <div style="font-size:13px;color:#64748b;font-weight:600;">${isEngStd ? "Attending:" : "يحضر الآن:"} <span style="color:#0ea5e9;font-weight:800;">${res.allowedSubject}</span></div>
                                    </div>
                                </div>
                                <div class="hall-badge-formal" style="background:linear-gradient(135deg,#6366f1,#4f46e5);border-radius:16px;padding:15px;text-align:center;direction:ltr;">
                                    <div style="font-size:12px;color:#e0e7ff;margin-bottom:2px;font-weight:bold;opacity:0.9;">${_t('radar_current_location', 'الموقع الحالي')}</div>
                                    <div style="font-size:28px;font-weight:900;color:#fff;font-family:'Outfit',sans-serif;letter-spacing:1px;">HALL: ${res.hall}</div>
                                </div>
                            </div>`;
                    }
                    content.appendChild(card);
                });
            }
        } catch (e) {
            console.error("Search Error:", e);
            content.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px;">حدث خطأ أثناء البحث</div>`;
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
        }
    };

    window.handleProfileIconClick = function () {
        const user = auth.currentUser;
        const adminToken = sessionStorage.getItem("secure_admin_session_token_v99");
        if (!user) { if (typeof openAuthDrawer === 'function') openAuthDrawer(); }
        else { if (typeof openStudentProfile === 'function') openStudentProfile(); }
    };

    window.autoFetchName = async function (studentId) {
        const nameInput = document.getElementById('regFullName');
        const signupBtn = document.getElementById('btnDoSignup');
        if (!nameInput) return;

        nameInput.value = "";
        nameInput.placeholder = "جاري التحقق أمنياً...";
        const cleanId = studentId.toString().trim();
        if (!cleanId || cleanId.length < 4) { nameInput.placeholder = "Full Name"; return; }

        try {
            const lockSnap = await getDoc(doc(db, "taken_student_ids", cleanId));
            if (lockSnap.exists()) { nameInput.value = "⚠️ الكود محجوز لحساب آخر"; nameInput.style.color = "#ef4444"; if (signupBtn) signupBtn.disabled = true; return; }

            const studentSnap = await getDoc(doc(db, "students", cleanId));
            if (studentSnap.exists()) { nameInput.value = studentSnap.data().name; nameInput.style.color = "#0f172a"; nameInput.placeholder = ""; }
            else { nameInput.value = "❌ كود غير مسجل "; nameInput.style.color = "#b91c1c"; }
        } catch (error) {
            console.error("Fetch Error:", error);
            nameInput.value = "⚠️ اعد المحاولة   ";
        } finally { if (typeof validateSignupForm === 'function') validateSignupForm(); }
    };

    window.expandAvatar = function () {
        const avatarEl = document.getElementById('publicAvatar');
        const iconClass = avatarEl.getAttribute('data-icon');
        const color = avatarEl.getAttribute('data-color');
        if (!iconClass) return;
        const container = document.getElementById('zoomedAvatarContainer');
        container.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
        container.querySelector('i').style.color = color;
        document.getElementById('imageZoomModal').style.display = 'flex';
    };

    window.showInfoModal = function () {
        if (typeof playClick === 'function') playClick();
        const modal = document.getElementById('infoModal');
        if (modal) modal.style.display = 'flex';
    };

    window.closeSetupModal = function () {
        document.getElementById('customTimeModal').style.display = 'none';
        document.body.style.overflow = 'auto';
    };

    window.stopCameraSafely = async function () { if (typeof releaseWakeLock === 'function') releaseWakeLock(); return true; };
    window.startQrScanner = function () { showToast("تم إلغاء خاصية الباركود.", 3000, "#f59e0b"); };
    window.html5QrCode = null;

    async function goBackToWelcome() {
        await window.stopCameraSafely();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (geo_watch_id) navigator.geolocation.clearWatch(geo_watch_id);
        if (countdownInterval) clearInterval(countdownInterval);
        sessionStorage.removeItem("temp_student_name");
        sessionStorage.removeItem("temp_student_id");
        switchScreen('screenWelcome');
    }

    window.goBackToWelcome = goBackToWelcome;
    window.hideConnectionLostModal = hideConnectionLostModal;
    window.triggerAppInstall = triggerAppInstall;
    window.safeClick = safeClick;
    window.openMapsToRefreshGPS = openMapsToRefreshGPS;

    window.playClick = function () { };

    window.filterModalSubjects = function () {
        const input = document.getElementById('subjectSearchInput');
        const select = document.getElementById('modalSubjectSelect');
        if (!input || !select) return;
        const query = (typeof normalizeArabic === 'function') ? normalizeArabic(input.value) : input.value;
        select.innerHTML = '';
        if (typeof subjectsData === 'undefined' || !subjectsData) return;
        let hasResults = false;
        for (const [year, subjects] of Object.entries(subjectsData)) {
            const matchedSubjects = subjects.filter(sub => (typeof normalizeArabic === 'function' ? normalizeArabic(sub) : sub).includes(query));
            if (matchedSubjects.length > 0) {
                hasResults = true;
                const group = document.createElement('optgroup');
                const labelMap = { first_year: "First Year", "1": "First Year", second_year: "Second Year", "2": "Second Year", third_year: "Third Year", "3": "Third Year", fourth_year: "Fourth Year", "4": "Fourth Year" };
                group.label = labelMap[year] || year;
                matchedSubjects.forEach(sub => { const opt = document.createElement('option'); opt.value = sub; opt.text = sub; group.appendChild(opt); });
                select.appendChild(group);
            }
        }
        if (!hasResults) { const opt = document.createElement('option'); opt.text = (localStorage.getItem('sys_lang') === 'ar') ? "لا توجد نتائج" : "No results found"; opt.disabled = true; select.appendChild(opt); }
    };

    window.portalClicks = 0;
    window.portalTimer = null;

    window.handleAdminTripleClick = function (btn) {
        if (typeof playClick === 'function') playClick();
        window.portalClicks++;
        clearTimeout(window.portalTimer);
        window.portalTimer = setTimeout(() => { window.portalClicks = 0; }, 2000);
        if (window.portalClicks === 3 && navigator.vibrate) navigator.vibrate([50, 50]);
    };

    window.handleReportClick = function () {
        window.portalClicks = 0;
        showToast("🔐 القسم محمي", 3000, "#ef4444");
        if (navigator.vibrate) navigator.vibrate(200);
    };

})();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=3', { scope: './' })
            .then(() => { console.log('ServiceWorker registration successful'); })
            .catch(err => { console.error('ServiceWorker registration failed:', err); });
    });
}

window.addEventListener('pageshow', () => {
    const pinInput = document.getElementById('attendanceCode');
    if (pinInput) pinInput.value = '';
});

var idleTimer = null;
var elapsedTime = 0;
var isTyping = false;
var tickInterval = null;

window.startCodeEntryIdleTimer = function () {
    window.stopCodeEntryIdleTimer();
    elapsedTime = 0;
    isTyping = false;

    tickInterval = setInterval(() => {
        if (!isTyping) {
            elapsedTime++;
            if (elapsedTime >= 60) {
                window.stopCodeEntryIdleTimer();
                window.switchScreen('screenWelcome');
                if (typeof window.showToast === 'function') window.showToast("⚠️ كن سريعا في المرة القادمة", 3000, "#f59e0b");
            }
        }
    }, 1000);
};

window.stopCodeEntryIdleTimer = function () {
    clearInterval(tickInterval);
    tickInterval = null;
    elapsedTime = 0;
    isTyping = false;
    const input = document.getElementById('attendanceCode');
    if (input) input.value = '';
};

window.cachedGPSData = null;
window.gpsPreFetchDone = false;
window.gpsPreFetchTime = 0;

(function () {
    const indicator = document.getElementById('superWifiIndicator');
    if (!indicator) return;
    const statusText = indicator.querySelector('.wifi-text');
    let pingInterval = null;

    const PING_URL = 'https://cp.cloudflare.com/generate_204';
    const PING_INTERVAL_MS = 60000;
    const TIMEOUT_MS = 3000;
    const STATE = { ONLINE: 'ONLINE', OFFLINE: 'OFFLINE', WEAK: 'WEAK', LOADING: 'LOADING' };

    function updateUI(state) {
        indicator.classList.remove('state-loading', 'state-weak', 'wifi-status-hidden');
        const iconBox = indicator.querySelector('.wifi-icon-box');
        if (state !== STATE.LOADING && !iconBox.querySelector('.fa-wifi'))
            iconBox.innerHTML = '<i class="fa-solid fa-wifi fa-fade"></i><i class="fa-solid fa-slash wifi-slash" id="wifiSlashIcon"></i>';
        const slashIcon = document.getElementById('wifiSlashIcon');
        switch (state) {
            case STATE.ONLINE:
                if (document.readyState === 'complete') indicator.classList.add('wifi-status-hidden');
                if (slashIcon) slashIcon.style.display = 'none';
                break;
            case STATE.OFFLINE:
                statusText.innerText = "CONNECTION LOST";
                if (slashIcon) slashIcon.style.display = 'block';
                break;
            case STATE.WEAK:
                indicator.classList.add('state-weak');
                statusText.innerText = "UNSTABLE NETWORK";
                if (slashIcon) slashIcon.style.display = 'none';
                break;
            case STATE.LOADING:
                indicator.classList.add('state-loading');
                statusText.innerText = "CONNECTING...";
                iconBox.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:16px;"></i>';
                break;
        }
    }

    async function performNetworkDiagnostic() {
        if (document.readyState !== 'complete') updateUI(STATE.LOADING);
        if (!navigator.onLine) { updateUI(STATE.OFFLINE); return; }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
            await fetch(PING_URL + '?' + Date.now(), { mode: 'no-cors', signal: controller.signal });
            clearTimeout(timeoutId);
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (conn && (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.rtt > 1000)) updateUI(STATE.WEAK);
            else updateUI(STATE.ONLINE);
        } catch (error) { updateUI(STATE.OFFLINE); }
    }

    window.addEventListener('online', performNetworkDiagnostic);
    window.addEventListener('offline', () => updateUI(STATE.OFFLINE));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { clearInterval(pingInterval); pingInterval = null; }
        else { performNetworkDiagnostic(); pingInterval = setInterval(performNetworkDiagnostic, PING_INTERVAL_MS); }
    });
    if (document.readyState !== 'complete') updateUI(STATE.LOADING);
    window.addEventListener('load', () => performNetworkDiagnostic());
    pingInterval = setInterval(performNetworkDiagnostic, PING_INTERVAL_MS);
    performNetworkDiagnostic();
})();
