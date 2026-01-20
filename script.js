import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    limit,
    writeBatch,
    serverTimestamp,
    Timestamp,
    arrayUnion,
    arrayRemove,
    increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { i18n, t, changeLanguage, toggleSystemLanguage } from './i18n.js';

window.isJoiningProcessActive = false;
window.isProcessingClick = false;

const db = window.db;
const auth = window.auth;

console.log("🚀 Offline Mode: ON (Modern Cache)");

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('sys_lang') || 'ar';
    changeLanguage(saved);
});
window.subjectsData = JSON.parse(localStorage.getItem('subjectsData_v4')) || {
    "first_year": ["اساسيات تمريض 1 نظري", "اساسيات تمريض 1 عملي", "تقييم صحى نظرى", "مصطلحات طبية"],
    "second_year": ["تمريض بالغين 1 نظرى", "باثولوجى", "علم الأدوية"]
};

window.currentDoctorName = "";
window.currentDoctorSubject = "";
onAuthStateChanged(auth, async (user) => {
    const studentDrawer = document.getElementById('studentAuthDrawer');
    const facultyModal = document.getElementById('facultyGateModal');
    const profileWrapper = document.getElementById('profileIconWrapper');
    const profileIcon = document.getElementById('profileIconImg');
    const statusDot = document.getElementById('userStatusDot');

    if (user) {
        if (typeof window.initSecurityWatchdog === 'function') {
            window.initSecurityWatchdog(user.uid, db);
        } else {
            console.warn("⚠️ Security Module not loaded yet.");
        }
        await user.reload();

        if (user.emailVerified) {
            if (studentDrawer) {
                studentDrawer.classList.remove('active');
                setTimeout(() => studentDrawer.style.display = 'none', 300);
            }
            if (facultyModal) facultyModal.style.display = 'none';

            try {
                const facRef = doc(db, "faculty_members", user.uid);
                const facSnap = await getDoc(facRef);

                let finalUserData = null;

                if (facSnap.exists()) {
                    finalUserData = facSnap.data();

                    window.currentDoctorName = finalUserData.fullName;
                    window.currentDoctorSubject = finalUserData.subject;

                    if (document.getElementById('profFacName'))
                        document.getElementById('profFacName').innerText = window.currentDoctorName;

                    const roleToken = (finalUserData.role === "dean") ? "SUPER_ADMIN_ACTIVE" : "ADMIN_ACTIVE";
                    sessionStorage.setItem("secure_admin_session_token_v99", roleToken);

                    if (typeof listenToSessionState === 'function') listenToSessionState();

                    const savedAvatar = finalUserData.avatarClass || "fa-user-doctor";
                    if (profileIcon) profileIcon.className = `fa-solid ${savedAvatar}`;

                    if (profileWrapper) profileWrapper.style.background = "linear-gradient(135deg, #0f172a, #1e293b)";
                    if (statusDot) {
                        statusDot.style.background = "#0ea5e9";
                        statusDot.style.boxShadow = "0 0 10px #0ea5e9, 0 0 20px rgba(14, 165, 233, 0.5)";
                    }

                } else {
                    sessionStorage.removeItem("secure_admin_session_token_v99");

                    const studentDoc = await getDoc(doc(db, "user_registrations", user.uid));
                    if (studentDoc.exists()) {
                        finalUserData = studentDoc.data();
                        const fullName = finalUserData.registrationInfo?.fullName || finalUserData.fullName || "Student";

                        if (typeof listenToSessionState === 'function') listenToSessionState();

                        if (typeof monitorMyParticipation === 'function') monitorMyParticipation();

                        if (typeof window.showSmartWelcome === 'function') window.showSmartWelcome(fullName);

                        if (typeof window.checkForPendingSurveys === 'function') {
                            setTimeout(window.checkForPendingSurveys, 2500);
                        }

                        const savedAvatar = finalUserData.avatarClass || finalUserData.registrationInfo?.avatarClass || "fa-user-graduate";
                        if (profileIcon) profileIcon.className = `fa-solid ${savedAvatar}`;

                        if (profileWrapper) profileWrapper.style.background = "linear-gradient(135deg, #10b981, #059669)";
                        if (statusDot) {
                            statusDot.style.background = "#22c55e";
                            statusDot.style.boxShadow = "0 0 10px #22c55e, 0 0 20px rgba(34, 197, 94, 0.5)";
                        }
                    }
                }

                if (finalUserData && finalUserData.preferredLanguage) {
                    const serverLang = finalUserData.preferredLanguage;

                    if (typeof changeLanguage === 'function') changeLanguage(serverLang);

                    document.querySelectorAll('.active-lang-text-pro').forEach(span => {
                        span.innerText = (serverLang === 'ar') ? 'EN' : 'عربي';
                    });

                    console.log(`Language Synced: ${serverLang.toUpperCase()}`);
                }

            } catch (e) {
                console.error("Auth Guard Error:", e);
            }
        } else {
            sessionStorage.clear();
            if (profileIcon) profileIcon.className = "fa-solid fa-envelope-circle-check";
            if (profileWrapper) profileWrapper.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
            if (statusDot) statusDot.style.background = "#f59e0b";
        }

    } else {
        sessionStorage.clear();
        window.currentDoctorName = "";
        window.currentDoctorSubject = "";

        if (window.studentStatusListener) {
            window.studentStatusListener();
            window.studentStatusListener = null;
        }

        if (profileIcon) profileIcon.className = "fa-solid fa-user-astronaut";
        if (profileWrapper) profileWrapper.style.background = "rgba(15, 23, 42, 0.8)";
        if (statusDot) {
            statusDot.style.background = "#94a3b8";
            statusDot.style.boxShadow = "none";
        }
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
            if (typeof playClick === 'function') playClick();
            switchScreen('screenLiveSession');
            if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();
        };
    };

    const resetButtonToDefault = () => {
        if (!mainBtn) return;
        const lang = localStorage.getItem('sys_lang') || 'ar';
        mainBtn.innerHTML = (lang === 'ar') ? `تسجيل الحضور <i class="fa-solid fa-fingerprint"></i>` : `Register Attendance <i class="fa-solid fa-fingerprint"></i>`;

        mainBtn.style.background = "";
        mainBtn.style.boxShadow = "";
        mainBtn.style.border = "";

        mainBtn.onclick = () => startProcess(false);
    };

    let targetDoctorUID = sessionStorage.getItem('TARGET_DOCTOR_UID');

    if (!targetDoctorUID) {
        try {
            const activeSessionsQ = query(collection(db, "active_sessions"), where("isActive", "==", true));
            const sessionsSnap = await getDocs(activeSessionsQ);

            const checkPromises = sessionsSnap.docs.map(async (sessionDoc) => {
                const docID = sessionDoc.id;
                const studentRef = doc(db, "active_sessions", docID, "participants", user.uid);
                const studentSnap = await getDoc(studentRef);

                if (studentSnap.exists() && studentSnap.data().status === 'active') {
                    return docID;
                }
                return null;
            });

            const results = await Promise.all(checkPromises);
            const foundDoctorID = results.find(id => id !== null);

            if (foundDoctorID) {
                targetDoctorUID = foundDoctorID;
                sessionStorage.setItem('TARGET_DOCTOR_UID', targetDoctorUID);
                console.log("🔄 Session Recovered for Doctor:", targetDoctorUID);
            }

        } catch (e) {
            console.error("Auto-Recovery Error:", e);
        }
    }

    if (!targetDoctorUID) {
        resetButtonToDefault();
        return;
    }

    const studentRef = doc(db, "active_sessions", targetDoctorUID, "participants", user.uid);

    if (window.studentStatusListener) window.studentStatusListener();

    window.studentStatusListener = onSnapshot(studentRef, (docSnap) => {
        if (!docSnap.exists()) {
            console.log("🚨 Student removed or session ended.");

            sessionStorage.removeItem('TARGET_DOCTOR_UID');
            resetButtonToDefault();

            const currentScreen = document.querySelector('.section.active')?.id;
            if (currentScreen === 'screenLiveSession') {
                showToast("⚠️ تم إغلاق الجلسة أو إخراجك منها", 4000, "#f59e0b");
                if (typeof goHome === 'function') goHome();
            }
            return;
        }

        const data = docSnap.data();

        if (data.status === 'expelled') {
            console.log("🚨 Student EXPELLED.");

            sessionStorage.removeItem('TARGET_DOCTOR_UID');
            resetButtonToDefault();

            const currentScreen = document.querySelector('.section.active')?.id;
            if (currentScreen === 'screenLiveSession') {
                alert("⛔ قام المحاضر باستبعادك من الجلسة.");
                if (typeof goHome === 'function') goHome();

                setTimeout(() => location.reload(), 500);
            }
            return;
        }

        if (data.status === 'on_break') {
            console.log("☕ Break Time Triggered");

            sessionStorage.removeItem('TARGET_DOCTOR_UID');
            resetButtonToDefault();

            const currentScreen = document.querySelector('.section.active')?.id;

            if (currentScreen === 'screenLiveSession' || currentScreen === 'screenDataEntry') {

                if (typeof switchScreen === 'function') switchScreen('screenWelcome');

                const breakModal = document.getElementById('breakModal');
                if (breakModal) breakModal.style.display = 'flex';

                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            }
            return;
        }

        if (data.status === 'active') {
            setButtonToEnterMode();

            const breakModal = document.getElementById('breakModal');
            if (breakModal) breakModal.style.display = 'none';
        }

    }, (error) => {
        console.log("Monitor Error:", error);
        sessionStorage.removeItem('TARGET_DOCTOR_UID');
        resetButtonToDefault();
    });
};
window.performStudentSignup = async function () {
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value;
    const fullName = document.getElementById('regFullName').value.trim();
    const studentID = document.getElementById('regStudentID').value.trim();
    const level = document.getElementById('regLevel').value;
    const gender = document.getElementById('regGender').value;
    const group = document.getElementById('regGroup') ? document.getElementById('regGroup').value : "عام";

    if (!email || !pass || !fullName || !studentID) {
        alert("⚠️ يرجى ملء كافة البيانات المطلوبة");
        return;
    }

    const btn = document.getElementById('btnDoSignup');
    const originalText = btn ? btn.innerText : "REGISTER";

    if (btn) {
        btn.disabled = true;
        btn.innerText = "جاري الاتصال بالسيرفر...";
    }

    try {
        const deviceID = getUniqueDeviceId();

        console.log("📤 إرسال طلب التسجيل للباك إند...");

        const response = await fetch(`${BACKEND_URL}/api/registerStudent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: pass,
                fullName: fullName,
                studentID: studentID,
                level: level,
                gender: gender,
                group: group,
                deviceFingerprint: deviceID
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            if (typeof playSuccess === 'function') playSuccess();

            alert(`✅ تم إنشاء الحساب وحجز الكود بنجاح!\n\nالكود: ${studentID}\n\nتم ربط الحساب بجهازك. يرجى تفعيل بريدك الإلكتروني (إن وصلك رابط) ثم تسجيل الدخول.`);

            if (window.closeAuthDrawer) {
                closeAuthDrawer();
            }

            document.getElementById('regPass').value = "";
            document.getElementById('regEmail').value = "";

        } else {
            throw new Error(result.error || "فشل التسجيل لأسباب أمنية");
        }

    } catch (error) {
        console.error("Signup Error:", error);
        alert("❌ " + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }
};
window.toggleDropdown = (id) => {
    document.querySelectorAll('.dropdown-list').forEach(el => {
        if (el.id !== id) el.classList.remove('show');
    });
    document.getElementById(id).classList.toggle('show');
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown')) {
        document.querySelectorAll('.dropdown-list').forEach(el => el.classList.remove('show'));
    }
});

(function () {

    const STUDENT_DB_URL = "https://script.google.com/macros/s/AKfycbxi2Itb_GW4OXkP6ki5PmzN1O8GFY70XoQyYiWKUdKYHxhXL7YGMFfA2tXcXAWbC_ez/exec";

    const CONFIG = {
        gps: {
            targetLat: 30.43841622978127,
            targetLong: 30.836735200410153,
            allowedDistanceKm: 5
        },
        modelsUrl: './models'
    };

    const LOCAL_STORAGE_DB_KEY = "offline_students_db_v2";
    const DEVICE_ID_KEY = "unique_device_id_v1";
    const HIGHLIGHT_STORAGE_KEY = "student_highlights_persistent";
    const EVAL_STORAGE_KEY = "student_evaluations_v1";

    let studentsDB = {};
    let wakeLock = null;
    let cachedReportData = [];
    let isOpeningMaps = false;
    let currentEvalID = null;

    let attendanceData = {};


    const savedDB = localStorage.getItem(LOCAL_STORAGE_DB_KEY);
    if (savedDB) {
        try { studentsDB = JSON.parse(savedDB); } catch (e) { }
    }

    fetch(`${STUDENT_DB_URL}?action=getDB`).then(r => r.json()).then(d => { if (!d.error) { studentsDB = d; localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(d)); } }).catch(e => console.log("DB Fetch Error - Using Cache"));

    let defaultSubjects = {
        "first_year": ["اساسيات تمريض 1 نظري", "اساسيات تمريض 1 عملي", "تمريض بالغين 1 نظرى", "تمريض بالغين 1 عملى", "اناتومى نظرى", "اناتومى عملى", "تقييم صحى نظرى", "تقييم صحى عملى", "مصطلحات طبية", "فسيولوجى", "تكنولوجيا المعلومات"],
        "second_year": ["تمريض بالغين 1 نظرى", "تمريض بالغين 1 عملى", "تمريض حالات حرجة 1 نظرى", "تمريض حالات حرجة 1 عملى", "امراض باطنة", "باثولوجى", "علم الأدوية", "الكتابة التقنية"]
    };
    let subjectsData = JSON.parse(localStorage.getItem('subjectsData_v4')) || defaultSubjects;

    let defaultHalls = ["037", "038", "039", "019", "025", "123", "124", "127", "131", "132", "133", "134", "231", "335", "121", "118", "E334", "E335", "E336", "E337", "E344", "E345", "E346", "E347", "E240", "E241", "E242", "E245", "E231", "E230", "E243", "E233", "E222", "E234"];
    let hallsList = JSON.parse(localStorage.getItem('hallsList_v4')) || defaultHalls;

    const ADMIN_AUTH_TOKEN = "secure_admin_session_token_v99";

    const DATA_ENTRY_TIMEOUT_SEC = 20;
    const SESSION_END_TIME_KEY = "data_entry_deadline_v2";
    const TEMP_NAME_KEY = "temp_student_name";
    const TEMP_ID_KEY = "temp_student_id";
    const TEMP_CODE_KEY = "temp_session_code";

    const MAX_ATTEMPTS = 9999;
    const TODAY_DATE_KEY = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    const BAN_KEY = "daily_ban_" + TODAY_DATE_KEY;

    let userIP = "Unknown";
    let geo_watch_id = null;
    let countdownInterval;
    let html5QrCode;
    let sessionEndTime = 0;
    let processIsActive = false;

    let userLat = "", userLng = "";


    let isProcessingClick = false;

    let deferredPrompt;
    const installBox = document.getElementById('installAppPrompt');
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (installBox) installBox.style.display = 'flex'; });
    window.addEventListener('appinstalled', () => { if (installBox) installBox.style.display = 'none'; deferredPrompt = null; showToast("شكراً لتثبيت التطبيق! 🚀", 4000, "#10b981"); });
    function triggerAppInstall() { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then((choiceResult) => { if (choiceResult.outcome === 'accepted') { if (installBox) installBox.style.display = 'none'; } deferredPrompt = null; }); } }


    function safeClick(element, callback) {
        if (isProcessingClick) return;
        if (element && (element.disabled || element.classList.contains('disabled') || element.classList.contains('locked'))) return;
        isProcessingClick = true;
        if (element) { element.style.pointerEvents = 'none'; element.style.opacity = '0.7'; }
        if (typeof callback === 'function') callback();
        setTimeout(() => {
            isProcessingClick = false;
            if (element) { element.style.pointerEvents = 'auto'; element.style.opacity = '1'; }
        }, 600);
    }

    function getUniqueDeviceId() {
        let deviceId = localStorage.getItem(DEVICE_ID_KEY);
        if (!deviceId) {
            deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
            localStorage.setItem(DEVICE_ID_KEY, deviceId);
        }
        return deviceId;
    }

    function generateSessionKey() { return 'KEY-' + Math.random().toString(36).substr(2, 12).toUpperCase(); }

    function openDataEntryMenu() { document.getElementById('dataEntryModal').style.display = 'flex'; }

    function showTopToast(msg) {
        const t = document.getElementById('topToast');
        t.innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${msg}`; t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }


    function filterStudents() {
        const input = document.getElementById('studentSearchInput'); const filter = input.value.toUpperCase();
        const container = document.getElementById('studentsContainer'); const cards = container.getElementsByClassName('student-detailed-card');
        for (let i = 0; i < cards.length; i++) { const text = cards[i].textContent || cards[i].innerText; if (text.toUpperCase().indexOf(filter) > -1) cards[i].style.display = ""; else cards[i].style.display = "none"; }
    }
    function openExamModal() { playClick(); document.getElementById('examModal').style.display = 'flex'; }
    function closeExamModal() { playClick(); document.getElementById('examModal').style.display = 'none'; }
    function handleReportClick() { const btn = document.getElementById('btnViewReport'); if (btn.classList.contains('locked')) { if (navigator.vibrate) navigator.vibrate(50); } else { safeClick(btn, openReportModal); } }

    function resetApplicationState() {
        attendanceData = {};
        attendanceData.isVerified = false;

        sessionStorage.removeItem(TEMP_NAME_KEY);
        sessionStorage.removeItem(TEMP_ID_KEY);
        sessionStorage.removeItem(TEMP_CODE_KEY);
        sessionStorage.removeItem(SESSION_END_TIME_KEY);

        const elementsToClear = [
            'attendanceCode',
            'sessionPass',
            'uniID',
            'yearSelect',
            'groupSelect',
            'subjectSelect',
            'hallSelect'
        ];

        elementsToClear.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const setInnerText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        };

        setInnerText('scanNameDisplay', '--');
        setInnerText('scanIDDisplay', '--');
        setInnerText('scanDisciplineDisplay', '0');

        const btn = document.getElementById('submitBtn');
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = "0.6";
            btn.innerHTML = 'تأكيد الحضور <i class="fa-solid fa-paper-plane"></i>';
        }

    }

    fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => userIP = d.ip).catch(e => userIP = "Hidden IP");
    function playClick() { document.getElementById('clickSound').play().catch(e => { }); if (navigator.vibrate) navigator.vibrate(10); }
    function playSuccess() { document.getElementById('successSound').play().catch(e => { }); if (navigator.vibrate) navigator.vibrate([50, 50, 50]); }
    function playBeep() { document.getElementById('beepSound').play().catch(e => { }); }
    function convertArabicToEnglish(s) { return s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)); }
    async function requestWakeLock() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) { } }
    function releaseWakeLock() { if (wakeLock !== null) { wakeLock.release().then(() => { wakeLock = null; }); } }

    function getAttemptsLeft() { return 999; }
    function decrementAttempts() { return 999; }
    function updateUIForAttempts() { const container = document.getElementById('attemptsHeartsContainer'); if (container) container.innerHTML = ''; }

    window.history.pushState(null, null, window.location.href);
    window.onpopstate = function () {
        if (processIsActive && !sessionStorage.getItem(ADMIN_AUTH_TOKEN)) { checkBanStatus(); window.history.pushState(null, null, window.location.href); }
        else if (sessionStorage.getItem(ADMIN_AUTH_TOKEN)) { goBackToWelcome(); }
    };
    function handleStrictPenalty() { }
    window.addEventListener('beforeunload', () => { handleStrictPenalty(); });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { if (isOpeningMaps) return; if (processIsActive && !sessionStorage.getItem(ADMIN_AUTH_TOKEN)) location.reload(); releaseWakeLock(); }
        else { if (isOpeningMaps) isOpeningMaps = false; if (processIsActive) requestWakeLock(); }
    });
    function checkBanStatus() { return false; }

    function updateHeaderState(screenId) {
        const wrapper = document.getElementById('heroIconWrapper'); const icon = document.getElementById('statusIcon');
        wrapper.classList.remove('show-icon');
        if (screenId !== 'screenWelcome') {
            wrapper.classList.add('show-icon');
            if (screenId === 'screenLoading') { icon.className = "fa-solid fa-satellite-dish hero-icon fa-spin"; icon.style.color = "var(--primary)"; }
            else if (screenId === 'screenReadyToStart') { icon.className = "fa-solid fa-map-location-dot hero-icon"; icon.style.color = "#10b981"; icon.style.animation = "none"; }
            else if (screenId === 'screenDataEntry') { icon.className = "fa-solid fa-user-pen hero-icon"; icon.style.color = "var(--primary)"; icon.style.animation = "none"; }
            else if (screenId === 'screenScanQR') { icon.className = "fa-solid fa-qrcode hero-icon"; icon.style.color = "var(--primary)"; icon.style.animation = "none"; }
            else if (screenId === 'screenSuccess') { icon.className = "fa-solid fa-check hero-icon"; icon.style.color = "#10b981"; icon.style.animation = "none"; }
            else if (screenId === 'screenError') { icon.className = "fa-solid fa-triangle-exclamation hero-icon"; icon.style.color = "#ef4444"; icon.style.animation = "none"; }
            else if (screenId === 'screenAdminLogin') { icon.className = "fa-solid fa-lock hero-icon"; icon.style.color = "var(--primary-dark)"; icon.style.animation = "none"; }
        }
    }

    window.switchScreen = function (screenId) {
        const currentActive = document.querySelector('.section.active');
        if (currentActive && currentActive.id === screenId) return;

        window.scrollTo({ top: 0, behavior: 'auto' });

        const sections = document.querySelectorAll('.section');
        sections.forEach(sec => {
            sec.style.display = 'none';
            sec.classList.remove('active');
        });

        const target = document.getElementById(screenId);
        if (target) {
            target.style.display = 'flex';
            target.style.flexDirection = 'column';
            setTimeout(() => target.classList.add('active'), 10);
        }

        const infoBtn = document.getElementById('infoBtn');

        if (infoBtn) {
            if (screenId === 'screenWelcome') {
                infoBtn.style.display = 'flex';
            } else {
                infoBtn.style.display = 'none';
            }
        }

        const facBtn = document.getElementById('facultyProfileBtn');
    };

    function openMapsToRefreshGPS() {
        isOpeningMaps = true; const lat = CONFIG.gps.targetLat; const lng = CONFIG.gps.targetLong;
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`; window.open(mapsUrl, '_blank');
    }
    window.onload = function () {
        initGlobalGuard();
        updateUIForMode();
        setupCustomSelects();
        startGPSWatcher();

        renderHallOptions();
        if (document.getElementById('modalHallSelect') && document.getElementById('hallSelect')) {
            document.getElementById('modalHallSelect').innerHTML = document.getElementById('hallSelect').innerHTML;
        }

        if (typeof listenToSessionState === 'function') {
            listenToSessionState();
        }

        const hallSearchInput = document.getElementById('hallSearchInput');
        if (hallSearchInput) {
            hallSearchInput.addEventListener('input', function (e) {
                renderHallOptions(e.target.value);
            });
        }

        setInterval(() => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
            const dateStr = now.toLocaleDateString('en-GB');
            const timeEl = document.getElementById('currentTime');
            const dateEl = document.getElementById('currentDate');

            if (timeEl) timeEl.innerText = timeStr;
            if (dateEl) dateEl.innerText = dateStr;
        }, 1000);

        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', function (e) {
                e.preventDefault();
                submitToGoogle();
            });
        }

        const isAdmin = !!sessionStorage.getItem("secure_admin_session_token_v99");
        if (isAdmin) {
            console.log("🛠️ Admin refresh detected: Checking for active session...");

            onSnapshot(doc(db, "settings", "control_panel"), (snap) => {
                const data = snap.data();
                if (data && data.isActive) {
                    if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = data.doctorName || "Doctor";
                    if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = data.allowedSubject || "--";
                    if (document.getElementById('liveHallTag')) document.getElementById('liveHallTag').innerText = data.hall || "--";
                    if (document.getElementById('liveSessionCodeDisplay')) document.getElementById('liveSessionCodeDisplay').innerText = data.sessionCode || "0000";

                    const facAvatar = document.getElementById('facCurrentAvatar');
                    const liveAvatar = document.getElementById('liveDocAvatar');
                    if (facAvatar && liveAvatar) {
                        liveAvatar.innerHTML = facAvatar.innerHTML;
                    }

                    if (typeof startLiveSnapshotListener === 'function') {
                        startLiveSnapshotListener();
                    }
                }
            });
        }
    };

    function renderHallOptions(filter = "") {
        const hallContainer = document.getElementById('hallOptionsContainer');
        const hallSelect = document.getElementById('hallSelect');

        if (!hallSelect || !hallContainer) {
            console.log("ℹ️ Hall selection elements not found. Skipping render.");
            return;
        }

        hallSelect.innerHTML = '<option value="" disabled selected>-- اختر المدرج --</option>';
        hallContainer.innerHTML = '';

        const filteredHalls = hallsList.filter(h => h.includes(filter));

        filteredHalls.forEach(val => {
            let opt = document.createElement('option');
            opt.value = val;
            opt.text = val;
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
                if (typeof checkAllConditions === 'function') checkAllConditions();
            });
            hallContainer.appendChild(cOpt);
        });

        if (filteredHalls.length === 0) {
            hallContainer.innerHTML = '<div style="padding:10px; text-align:center; color:#94a3b8; font-size:12px;">لا توجد نتائج</div>';
        }
    }

    function startGPSWatcher() {
        if (navigator.geolocation) {
            geo_watch_id = navigator.geolocation.watchPosition(
                (position) => { userLat = position.coords.latitude; userLng = position.coords.longitude; }, (error) => { }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
            );
        }
    }
    window.updateUIForMode = function () {
        const adminToken = sessionStorage.getItem("secure_admin_session_token_v99");
        const isDean = (adminToken === "SUPER_ADMIN_ACTIVE");
        const isDoctor = (adminToken === "ADMIN_ACTIVE");
        const isStaff = isDean || isDoctor;

        document.body.classList.remove('is-dean', 'is-doctor', 'is-student');
        if (isDean) document.body.classList.add('is-dean');
        else if (isDoctor) document.body.classList.add('is-doctor');
        else document.body.classList.add('is-student');

        const sessionBtn = document.getElementById('btnToggleSession');
        const quickModeBtn = document.getElementById('btnQuickMode');
        const toolsBtn = document.getElementById('btnToolsRequest');
        const deanZone = document.getElementById('deanPrivateZone');
        const btnDataEntry = document.getElementById('btnDataEntry');
        const reportBtn = document.getElementById('btnViewReport');

        const mainActionBtn = document.getElementById('mainActionBtn');
        const makaniBar = document.getElementById('makaniSearchBar');
        const studentProfileBtn = document.getElementById('studentProfileBtn');
        const facultyProfileBtn = document.getElementById('facultyProfileBtn');

        const btnFeed = document.getElementById('btnLiveFeedback');

        if (isStaff) {
            if (btnDataEntry) btnDataEntry.style.display = 'flex';
            if (reportBtn) reportBtn.classList.remove('locked');
            if (facultyProfileBtn) facultyProfileBtn.style.display = 'flex';

            if (mainActionBtn) mainActionBtn.style.display = 'none';
            if (makaniBar) makaniBar.style.display = 'none';
            if (studentProfileBtn) studentProfileBtn.style.display = 'none';

            if (isDoctor) {
                console.log("✅ وضع الدكتور: إظهار أزرار التحكم + النجمة");

                if (sessionBtn) sessionBtn.style.setProperty('display', 'flex', 'important');
                if (quickModeBtn) quickModeBtn.style.setProperty('display', 'flex', 'important');
                if (toolsBtn) toolsBtn.style.setProperty('display', 'flex', 'important');
                if (deanZone) deanZone.style.setProperty('display', 'none', 'important');

                if (btnFeed) {
                    btnFeed.style.setProperty('display', 'flex', 'important');
                    if (typeof window.initFeedbackListener === 'function') {
                        window.initFeedbackListener();
                    }
                }

            } else {
                console.log("🛡️ وضع العميد: إخفاء أزرار التحكم");

                if (sessionBtn) sessionBtn.style.setProperty('display', 'none', 'important');
                if (quickModeBtn) quickModeBtn.style.setProperty('display', 'none', 'important');
                if (toolsBtn) toolsBtn.style.setProperty('display', 'none', 'important');

                if (deanZone) deanZone.style.setProperty('display', 'block', 'important');

                if (btnFeed) btnFeed.style.setProperty('display', 'none', 'important');
            }
        } else {
            console.log("🎓 وضع الطالب: إخفاء أدوات الإدارة");

            if (btnDataEntry) btnDataEntry.style.display = 'none';
            if (reportBtn) reportBtn.classList.add('locked');
            if (deanZone) deanZone.style.display = 'none';
            if (facultyProfileBtn) facultyProfileBtn.style.display = 'none';
            if (sessionBtn) sessionBtn.style.display = 'none';
            if (quickModeBtn) quickModeBtn.style.display = 'none';
            if (toolsBtn) toolsBtn.style.display = 'none';

            if (btnFeed) btnFeed.style.setProperty('display', 'none', 'important');

            if (mainActionBtn) mainActionBtn.style.display = 'flex';
            if (makaniBar) makaniBar.style.display = 'block';
            if (studentProfileBtn) studentProfileBtn.style.display = 'flex';
        }

        if (!isDoctor && window.feedbackUnsubscribe) {
            window.feedbackUnsubscribe();
            window.feedbackUnsubscribe = null;
        }
    };

    window.updateUIForMode = updateUIForMode;

    function detectFakeGPS(pos) { return (pos.coords.accuracy < 2 || (pos.coords.altitude === null && pos.coords.accuracy < 10)); }
    function checkLocationStrict(onSuccess) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    if (detectFakeGPS(pos)) { showError("🚫 تم اكتشاف موقع وهمي (Fake GPS). يرجى إغلاق أي برامج تلاعب بالموقع.", false); return; }
                    userLat = pos.coords.latitude; userLng = pos.coords.longitude; checkDistance(onSuccess);
                }, (err) => { document.getElementById('locationForceModal').style.display = 'flex'; }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
            );
        } else { document.getElementById('locationForceModal').style.display = 'flex'; }
    }
    function checkDistance(onSuccess) {
        let dist = getDistanceFromLatLonInKm(userLat, userLng, CONFIG.gps.targetLat, CONFIG.gps.targetLong);
        if (dist > CONFIG.gps.allowedDistanceKm) { showError("🚫 أنت خارج نطاق الكلية. يرجى التواجد في المكان الصحيح.", false); return; }
        onSuccess();
    }

    function normalizeArabic(text) {
        if (!text) return "";
        return text.toString()
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .toLowerCase();
    }

    window.filterModalSubjects = function () {
        const input = document.getElementById('subjectSearchInput');
        const select = document.getElementById('modalSubjectSelect');

        if (!input || !select) return;

        const query = normalizeArabic(input.value);
        select.innerHTML = '';

        if (typeof subjectsData === 'undefined' || !subjectsData) {
            const opt = document.createElement('option');
            opt.text = "Error: No subjects loaded";
            select.appendChild(opt);
            return;
        }

        let hasResults = false;

        for (const [year, subjects] of Object.entries(subjectsData)) {
            const matchedSubjects = subjects.filter(sub => normalizeArabic(sub).includes(query));

            if (matchedSubjects.length > 0) {
                hasResults = true;
                const group = document.createElement('optgroup');

                let label = year;
                if (year === "first_year" || year === "1") label = "First Year";
                else if (year === "second_year" || year === "2") label = "Second Year";
                else if (year === "third_year" || year === "3") label = "Third Year";
                else if (year === "fourth_year" || year === "4") label = "Fourth Year";

                group.label = label;

                matchedSubjects.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub;
                    opt.text = sub;
                    group.appendChild(opt);
                });
                select.appendChild(group);
            }
        }

        if (!hasResults) {
            const opt = document.createElement('option');
            const lang = localStorage.getItem('sys_lang') || 'ar';
            opt.text = (lang === 'ar') ? "لا توجد نتائج" : "No results found";
            opt.disabled = true;
            select.appendChild(opt);
        }
    };

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

            const fullSubjectsConfig = {
                "1": ["اساسيات تمريض 1 نظري", "اساسيات تمريض 1 عملي", "تمريض بالغين 1 نظرى", "تمريض بالغين 1 عملى", "اناتومى نظرى", "اناتومى عملى", "تقييم صحى نظرى", "تقييم صحى عملى", "مصطلحات طبية", "فسيولوجى", "تكنولوجيا المعلومات"],
                "2": ["تمريض بالغين 1 نظرى", "تمريض بالغين 1 عملى", "تمريض حالات حرجة 1 نظرى", "تمريض حالات حرجة 1 عملى", "امراض باطنة", "باثولوجى", "علم الأدوية", "الكتابة التقنية"],
                "3": []
            };

            let subjectsArray = [];
            Object.values(fullSubjectsConfig).forEach(yearList => subjectsArray.push(...yearList));

            let hallsArray = [
                "037", "038", "039", "019", "025",
                "123", "124", "127", "131", "132", "133", "134",
                "231", "335", "121", "118",
                "E334", "E335", "E336", "E337",
                "E344", "E345", "E346", "E347",
                "E240", "E241", "E242", "E245",
                "E231", "E230", "E243", "E233", "E222", "E234"
            ];

            renderCustomList('subjectList', subjectsArray, 'finalSubjectValue');
            renderCustomList('hallList', hallsArray, 'finalHallValue');
        }
    };
    window.renderCustomList = function (containerId, dataArray, hiddenInputId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (dataArray.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#94a3b8; font-size:12px;">No Data</div>';
            return;
        }

        dataArray.forEach(item => {
            const div = document.createElement('div');
            div.className = 'list-item-option';
            div.innerText = item;
            div.style.cssText = "padding: 10px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-size: 13px; font-weight:600; color:#334155; transition:0.1s;";

            div.onclick = function () {
                const siblings = container.querySelectorAll('.list-item-option');
                siblings.forEach(el => {
                    el.style.backgroundColor = "transparent";
                    el.style.color = "#334155";
                    el.style.borderLeft = "none";
                });

                this.style.backgroundColor = "#e0f2fe";
                this.style.color = "#0284c7";
                this.style.borderLeft = "4px solid #0284c7";

                document.getElementById(hiddenInputId).value = item;
            };

            container.appendChild(div);
        });
    };

    window.filterCustomList = function (containerId, query) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const items = container.getElementsByClassName('list-item-option');
        const filter = query.toUpperCase();

        for (let i = 0; i < items.length; i++) {
            const txtValue = items[i].textContent || items[i].innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                items[i].style.display = "";
            } else {
                items[i].style.display = "none";
            }
        }
    };

    window.highlightSelectedSubject = function (selectElement) {
        for (let i = 0; i < selectElement.options.length; i++) {
            selectElement.options[i].classList.remove('selected-highlight');
        }

        if (selectElement.selectedIndex >= 0) {
            selectElement.options[selectElement.selectedIndex].classList.add('selected-highlight');
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

        const subject = subjectEl.value;
        const hall = hallEl.value;
        const groupInput = groupEl ? (groupEl.value.trim().toUpperCase() || "GENERAL") : "GENERAL";
        const password = passEl ? passEl.value.trim() : "";

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
        const confirmBtn = document.getElementById('btnConfirmYes');
        const confirmIcon = document.querySelector('.confirm-icon-animate i');
        const lang = localStorage.getItem('sys_lang') || 'ar';

        if (confirmBtn) confirmBtn.innerText = (lang === 'ar') ? "تأكيد وحفظ ✅" : "Confirm & Save ✅";

        showModernConfirm(
            (lang === 'ar') ? "إنهاء الجلسة وحفظ الغياب" : "End Session",
            (lang === 'ar') ? "سيتم إغلاق البوابة وحفظ السجلات." : "Session will be closed and saved.",
            async function () {
                const user = auth.currentUser;
                try {
                    const sessionRef = doc(db, "active_sessions", user.uid);
                    const sessionSnap = await getDoc(sessionRef);

                    if (!sessionSnap.exists()) {
                        showToast("No session found", 3000, "#ef4444");
                        return;
                    }

                    const settings = sessionSnap.data();

                    const now = new Date();
                    const d = String(now.getDate()).padStart(2, '0');
                    const m = String(now.getMonth() + 1).padStart(2, '0');
                    const y = now.getFullYear();
                    const fixedDateStr = `${d}/${m}/${y}`;

                    const batch = writeBatch(db);
                    const partsRef = collection(db, "active_sessions", user.uid, "participants");
                    const partsSnap = await getDocs(partsRef);
                    let count = 0;

                    const currentDocName = settings.doctorName || "Doctor";

                    partsSnap.forEach(docSnap => {
                        const p = docSnap.data();
                        if (p.status === "active") {
                            const safeSubject = (settings.allowedSubject || "General").replace(/\//g, '-');
                            const recID = `${p.id}_${fixedDateStr.replace(/\//g, '-')}_${safeSubject}`;
                            const attRef = doc(db, "attendance", recID);

                            batch.set(attRef, {
                                id: p.id,
                                name: p.name,
                                subject: settings.allowedSubject,
                                hall: settings.hall,
                                group: p.group || "General",
                                date: fixedDateStr,
                                time_str: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                                timestamp: serverTimestamp(),
                                status: "ATTENDED",
                                doctorUID: user.uid,
                                doctorName: currentDocName,
                                feedback_status: "pending",
                                feedback_rating: 0
                            });

                            const cleanSubKey = settings.allowedSubject.trim().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '');
                            const studentStatsRef = doc(db, "student_stats", p.uid);
                            batch.set(studentStatsRef, {
                                [`attended.${cleanSubKey}`]: increment(1),
                                group: p.group || "General"
                            }, { merge: true });

                            count++;
                        }
                        batch.delete(docSnap.ref);
                    });

                    if (settings.targetGroups && settings.targetGroups.length > 0) {
                        const cleanSubKey = settings.allowedSubject.trim().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '');
                        settings.targetGroups.forEach(groupName => {
                            if (!groupName) return;
                            const groupRef = doc(db, "groups_stats", groupName);
                            batch.set(groupRef, {
                                [`subjects.${cleanSubKey}`]: increment(1),
                                last_updated: serverTimestamp()
                            }, { merge: true });
                        });
                    }

                    batch.update(sessionRef, { isActive: false, isDoorOpen: false });
                    await batch.commit();

                    showToast(`✅ تم الحفظ (${count} طالب)`, 4000, "#10b981");
                    setTimeout(() => location.reload(), 2000);

                } catch (e) {
                    console.error("Save Error:", e);
                    showToast("خطأ في الحفظ: " + e.message, 4000, "#ef4444");
                }
            }
        );
    };
    window.listenToSessionState = function () {
        const user = auth.currentUser;
        if (!user) return;

        const globalSettingsRef = doc(db, "settings", "control_panel");
        onSnapshot(globalSettingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                if (data.isQuickMode && data.quickModeFlags) {
                    sessionStorage.setItem('is_quick_mode_active', 'true');
                    sessionStorage.setItem('qm_disable_gps', data.quickModeFlags.disableGPS);
                    sessionStorage.setItem('qm_disable_qr', data.quickModeFlags.disableQR);

                    if (typeof applyQuickModeVisuals === 'function') applyQuickModeVisuals();
                    handleQuickModeUI(true);
                } else {
                    sessionStorage.setItem('is_quick_mode_active', 'false');
                    if (typeof removeQuickModeVisuals === 'function') removeQuickModeVisuals();
                    handleQuickModeUI(false);
                }
            }
        });

        const doctorSessionRef = doc(db, "active_sessions", user.uid);

        if (window.unsubscribeSessionListener) {
            window.unsubscribeSessionListener();
        }

        window.unsubscribeSessionListener = onSnapshot(doctorSessionRef, (docSnap) => {
            if (!docSnap.exists() || !docSnap.data().isActive) {
                handleSessionTimer(false, null, 0);
                updateSessionButtonUI(false);
            } else {
                const data = docSnap.data();
                handleSessionTimer(true, data.startTime, data.duration);
                updateSessionButtonUI(true);
            }
        }, (error) => {
            console.log("Session status check...");
        });
    };
    function updateSessionButtonUI(isOpen) {
        const btn = document.getElementById('btnToggleSession');
        const icon = document.getElementById('sessionIcon');
        const txt = document.getElementById('sessionText');

        if (!btn) return;

        btn.style.display = 'flex';

        if (isOpen) {
            btn.classList.add('session-open');
            btn.style.background = "#dcfce7"; // أخضر فاتح
            btn.style.color = "#166534";
            btn.style.border = "2px solid #22c55e";

            if (icon) icon.className = "fa-solid fa-tower-broadcast fa-fade";
            if (txt) txt.innerText = "جلستك نشطة (اضغط للمتابعة)";

        } else {
            btn.classList.remove('session-open');
            btn.style.background = "#f1f5f9"; // رمادي
            btn.style.color = "#334155";
            btn.style.border = "2px solid #cbd5e1";

            if (icon) icon.className = "fa-solid fa-play";
            if (txt) txt.innerText = "بدء محاضرة جديدة";
        }
    }
    window.startProcess = async function (isRetry) {
        if (typeof playClick === 'function') playClick();

        const user = auth.currentUser;

        if (!user) {
            if (typeof window.openAuthDrawer === 'function') window.openAuthDrawer();
            return;
        }

        const savedDoctorUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
        if (savedDoctorUID) {
            switchScreen('screenLiveSession');
            if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();
            return;
        }

        console.log("🚀 Starting Process: Direct Access Mode");

        const forceShowPinScreen = () => {
            document.querySelectorAll('.section').forEach(el => {
                el.style.display = 'none';
                el.classList.remove('active');
            });

            const screen = document.getElementById('screenDataEntry');
            if (screen) {
                screen.style.cssText = "display: block !important; opacity: 1 !important;";
                screen.classList.add('active');
            }

            const step1 = document.getElementById('step1_search');
            const step2 = document.getElementById('step2_auth');
            const errorMsg = document.getElementById('screenError');

            if (step2) step2.style.setProperty('display', 'none', 'important');
            if (errorMsg) errorMsg.style.display = 'none';

            if (step1) {
                step1.style.cssText = "display: block !important; visibility: visible !important;";
            }

            setTimeout(() => {
                const input = document.getElementById('attendanceCode');
                if (input) input.focus();
            }, 150);
        };

        forceShowPinScreen();
    };
    window.openAuthDrawer = () => document.getElementById('studentAuthDrawer').style.display = 'flex';
    window.toggleAuthMode = (mode) => {
        const loginSec = document.getElementById('loginSection');
        const signupSec = document.getElementById('signupSection');
        const title = document.getElementById('authTitle');
        const subtitle = document.getElementById('authSubtitle');

        if (mode === 'signup') {
            loginSec.classList.remove('active');
            signupSec.classList.add('active');
            title.innerText = 'Create Account';
            subtitle.innerText = 'Join our nursing community below';
        } else {
            signupSec.classList.remove('active');
            loginSec.classList.add('active');
            title.innerText = 'Welcome Back';
            subtitle.innerText = 'Please enter your details to continue';
        }
    };

    window.togglePass = (inputId, icon) => {
        const input = document.getElementById(inputId);
        if (!input) return;

        const isPassword = input.type === 'password';

        input.type = isPassword ? 'text' : 'password';

        if (icon) {
            if (isPassword) {
                icon.classList.replace('fa-eye', 'fa-eye-slash');
                icon.style.color = "#0ea5e9";
                icon.style.filter = "drop-shadow(0 0 5px rgba(14, 165, 233, 0.5))";
            } else {
                icon.classList.replace('fa-eye-slash', 'fa-eye');
                icon.style.color = "#94a3b8";
                icon.style.filter = "none";
            }
        }

        if (navigator.vibrate) navigator.vibrate(10);
    };

    function validateSignupForm() {
        const getV = (id) => document.getElementById(id)?.value?.trim() || "";
        const getEl = (id) => document.getElementById(id);

        const email = getV('regEmail');
        const emailConfirm = getV('regEmailConfirm');
        const pass = getV('regPass');
        const passConfirm = getV('regPassConfirm');

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValidEmailFormat = emailPattern.test(email);

        const emailMatch = (email === emailConfirm && email !== "");
        const emailConfirmField = getEl('regEmailConfirm');
        const emailErrorMsg = getEl('emailError');

        if (emailConfirm !== "") {
            emailConfirmField.classList.toggle('input-error', !emailMatch);
            emailErrorMsg.style.display = emailMatch ? 'none' : 'block';
        } else {
            emailConfirmField.classList.remove('input-error');
            emailErrorMsg.style.display = 'none';
        }

        const passMatch = (pass === passConfirm && pass !== "");
        const passReady = pass.length >= 6; // كلمة السر لا تقل عن 6 رموز
        const passConfirmField = getEl('regPassConfirm');
        const passErrorMsg = getEl('passError');

        if (passConfirm !== "") {
            passConfirmField.classList.toggle('input-error', !passMatch);
            passErrorMsg.style.display = passMatch ? 'none' : 'block';
        } else {
            passConfirmField.classList.remove('input-error');
            passErrorMsg.style.display = 'none';
        }

        const level = getV('regLevel');
        const gender = getV('regGender');
        const name = getV('regFullName');
        const group = getV('regGroup');

        const isEverythingValid =
            isValidEmailFormat &&
            emailMatch &&
            passMatch &&
            passReady &&
            group !== "" &&
            level !== "" &&
            gender !== "" &&
            name !== "" &&
            !name.toLowerCase().includes("not registered");

        const btn = getEl('btnDoSignup');
        if (btn) {
            btn.disabled = !isEverythingValid;
            if (isEverythingValid) {
                btn.style.opacity = "1";
                btn.style.filter = "grayscale(0%)";
                btn.style.cursor = "pointer";
            } else {
                btn.style.opacity = "0.5";
                btn.style.filter = "grayscale(50%)";
                btn.style.cursor = "not-allowed";
            }
        }
    }

    document.addEventListener('input', (e) => {
        if (e.target.id && e.target.id.startsWith('reg')) {
            validateSignupForm();
        }
    });

    document.addEventListener('input', (e) => {
        if (e.target.id && e.target.id.startsWith('reg')) {
            validateSignupForm();
        }
    });
    document.addEventListener('DOMContentLoaded', () => {
        const signupFields = [
            'regStudentID',
            'regFullName',
            'regLevel',
            'regGender',
            'regGroup',
            'regEmail',
            'regEmailConfirm',
            'regPass',
            'regPassConfirm'
        ];

        signupFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    if (typeof validateSignupForm === 'function') validateSignupForm();
                });

                el.addEventListener('change', () => {
                    if (typeof validateSignupForm === 'function') validateSignupForm();
                });
            }
        });

        const savedLang = localStorage.getItem('sys_lang') || 'ar';
        if (typeof changeLanguage === 'function') {
            changeLanguage(savedLang);
            document.querySelectorAll('.active-lang-text-pro').forEach(span => {
                span.innerText = (savedLang === 'ar') ? 'EN' : 'عربي';
            });
        }

        console.log("🚀 Signup Monitor & Language Lock: ACTIVE");
    });

    ['regEmail', 'regEmailConfirm', 'regPass', 'regPassConfirm', 'regGender', 'regLevel', 'regGroup'].forEach(id => {
        document.getElementById(id).addEventListener('input', validateSignupForm);
    });

    window.performStudentLogin = async () => {
        const email = document.getElementById('studentLoginEmail').value.trim();
        const pass = document.getElementById('studentLoginPass').value;
        const btn = document.querySelector('#loginSection .btn-modern-action') || document.querySelector('#loginSection .btn-main');

        let originalText = "Sign In";
        if (btn) {
            originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...';
            btn.disabled = true;
        }

        if (!email || !pass) {
            showToast("⚠️ أدخل الإيميل والباسورد", 3000, "#f59e0b");
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
            return;
        }

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            const pIcon = document.getElementById('profileIconImg');
            const pWrap = document.getElementById('profileIconWrapper');
            const pDot = document.getElementById('userStatusDot');

            if (pIcon) pIcon.className = "fa-solid fa-user-graduate fa-bounce";
            if (pWrap) pWrap.style.background = "linear-gradient(135deg, #10b981, #059669)";
            if (pDot) { pDot.style.background = "#22c55e"; pDot.style.boxShadow = "0 0 10px #22c55e"; }

            await user.reload();

            if (!user.emailVerified) {
                await signOut(auth);
                alert("⛔ عذراً، لم يتم تفعيل الحساب! راجع بريدك الإلكتروني.");
                if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
                return;
            }

            const userRef = doc(db, "user_registrations", user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                const info = userData.registrationInfo || userData;

                const profileCache = {
                    fullName: info.fullName,
                    email: info.email,
                    studentID: info.studentID,
                    level: info.level,
                    gender: info.gender,
                    avatarClass: userData.avatarClass || info.avatarClass || "fa-user-graduate",
                    status_message: userData.status_message || "", // حفظ الحالة
                    uid: user.uid,
                    type: 'student'
                };
                localStorage.setItem('cached_profile_data', JSON.stringify(profileCache));

                const currentDeviceId = getUniqueDeviceId();
                if (!userData.bound_device_id) {
                    await updateDoc(userRef, { bound_device_id: currentDeviceId, device_bind_date: serverTimestamp() });
                }
            }

            showToast("🔓 تم تسجيل الدخول.. أهلاً بك", 3000, "#10b981");
            if (typeof closeAuthDrawer === 'function') closeAuthDrawer();

        } catch (error) {
            console.error(error);
            showToast(`❌ بيانات الدخول غير صحيحة`, 3000, "#ef4444");
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
        if (!user) {
            showToast("❌ يجب تسجيل الدخول أولاً", 3000, "#ef4444");
            return;
        }

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
            const sessionSnap = await getDoc(sessionRef);

            if (!sessionSnap.exists()) {
                throw new Error("⛔ الجلسة غير موجودة");
            }

            const sessionData = sessionSnap.data();

            if (!sessionData.isActive || !sessionData.isDoorOpen) {
                throw new Error("🔒 عذراً، الجلسة مغلقة حالياً.");
            }

            if (sessionData.sessionPassword && sessionData.sessionPassword !== "" && passInput !== sessionData.sessionPassword) {
                throw new Error("❌ كلمة المرور غير صحيحة");
            }

            let isFaceDisabled = false;
            try {
                const settingsRef = doc(db, "settings", "control_panel");
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    const sData = settingsSnap.data();
                    if (sData.isQuickMode && sData.quickModeFlags && sData.quickModeFlags.disableFace) {
                        isFaceDisabled = true;
                    }
                }
            } catch (err) { console.log("Settings check skipped."); }

            if (!isFaceDisabled && window.faceSystem && window.faceSystem.handleJoinRequest) {
                console.log("📸 تحويل إلى نظام بصمة الوجه...");
                await window.faceSystem.handleJoinRequest(user, targetDrUID, passInput);
                btn.innerHTML = originalText;
                btn.style.pointerEvents = 'auto';
                return;
            }

            console.log("⚡ دخول مباشر...");

            const gpsData = await getSilentLocationData();
            const deviceFingerprint = localStorage.getItem("unique_device_id_v3");
            const idToken = await user.getIdToken();

            const response = await fetch('https://nursing-backend-eta.vercel.app/joinSessionSecure', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    studentUID: user.uid,
                    sessionDocID: targetDrUID,
                    gpsLat: gpsData.lat || 0,
                    gpsLng: gpsData.lng || 0,
                    deviceFingerprint: deviceFingerprint
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {

                if (typeof playSuccess === 'function') playSuccess();
                showToast(`✅ ${result.message}`, 3000, "#10b981");

                sessionStorage.setItem('TARGET_DOCTOR_UID', targetDrUID);
                sessionStorage.removeItem('TEMP_DR_UID');

                try {
                    let cached = localStorage.getItem('cached_profile_data');
                    if (cached) {
                        let cacheObj = JSON.parse(cached);
                        if (cacheObj.uid === user.uid) {
                            cacheObj.attendanceCount = (cacheObj.attendanceCount || 0) + 1;
                            localStorage.setItem('cached_profile_data', JSON.stringify(cacheObj));
                        }
                    }
                } catch (err) { }

                if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = sessionData.doctorName || "Professor";
                if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = sessionData.allowedSubject || "Subject";
                const liveAvatar = document.getElementById('liveDocAvatar');
                if (liveAvatar && sessionData.doctorAvatar) {
                    liveAvatar.innerHTML = `<i class="fa-solid ${sessionData.doctorAvatar}"></i>`;
                }

                try {
                    const subjectName = sessionData.allowedSubject || "General";
                    const cleanSubKey = subjectName.trim().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '');

                    const groupName = (sessionData.targetGroups && sessionData.targetGroups.length > 0) ? sessionData.targetGroups[0] : "General";

                    const studentStatsRef = doc(db, "student_stats", user.uid);
                    await setDoc(studentStatsRef, {
                        [`attended.${cleanSubKey}`]: increment(1), // زيادة رصيد المادة
                        group: groupName // تحديث الجروب
                    }, { merge: true });

                    console.log("✅ Stats Updated Locally");
                } catch (statsErr) {
                    console.error("Stats Update Error:", statsErr);
                }

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

            if (msg.includes("غير موجودة") || msg.includes("مغلقة")) {
                setTimeout(() => location.reload(), 1500);
            }

        } finally {
            const currentScreen = document.querySelector('.section.active')?.id;
            if (currentScreen !== 'screenLiveSession') {
                btn.innerHTML = originalText;
                btn.style.pointerEvents = 'auto';
            }
        }
    };

    let searchPageInterval = null;

    window.searchForSession = async function () {
        const codeInput = document.getElementById('attendanceCode').value.trim();
        const btn = document.getElementById('btnSearchSession');

        if (!codeInput) {
            showToast("⚠️ Please enter session PIN", 3000, "#f59e0b");
            return;
        }

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> SEARCHING...';
        btn.style.pointerEvents = 'none';

        try {
            const q = query(collection(db, "active_sessions"),
                where("sessionCode", "==", codeInput),
                where("isActive", "==", true),
                where("isDoorOpen", "==", true));

            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                const checkQ = query(collection(db, "active_sessions"), where("sessionCode", "==", codeInput));
                const checkSnap = await getDocs(checkQ);

                if (!checkSnap.empty) {
                    showToast("🔒 Session is currently CLOSED", 4000, "#ef4444");
                } else {
                    showToast("❌ Invalid Session PIN", 4000, "#ef4444");
                }
                btn.innerHTML = originalText;
                btn.style.pointerEvents = 'auto';
                return;
            }

            const sessionDoc = querySnapshot.docs[0];
            const sessionData = sessionDoc.data();
            const doctorUID = sessionDoc.id;

            sessionStorage.setItem('TEMP_DR_UID', doctorUID);

            const docNameEl = document.getElementById('foundDocName');
            const subjectNameEl = document.getElementById('foundSubjectName'); // ✅ تم التعريف
            const foundAvatar = document.getElementById('foundDocAvatar');

            if (docNameEl) {
                docNameEl.innerText = "Dr. " + (sessionData.doctorName || "Unknown");
                docNameEl.style.fontFamily = "'Outfit', sans-serif";
            }

            if (subjectNameEl) {
                subjectNameEl.innerText = sessionData.allowedSubject || "--";
                subjectNameEl.style.fontFamily = "'Outfit', sans-serif";
            }

            if (foundAvatar && sessionData.doctorAvatar) {
                foundAvatar.innerHTML = `<i class="fa-solid ${sessionData.doctorAvatar}"></i>`;
            }

            if (typeof startAuthScreenTimer === 'function') {
                startAuthScreenTimer(doctorUID);
            }

            const step1 = document.getElementById('step1_search');
            const step2 = document.getElementById('step2_auth');

            if (step1) step1.style.display = 'none';
            if (step2) {
                step2.style.display = 'block';
                step2.classList.add('active'); // تفعيل الأنيميشن
            }

        } catch (e) {
            console.error("Critical Search Error:", e);
            showToast("⚠️ Connection Error", 3000, "#ef4444");
        } finally {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
    };
    window.startAuthScreenTimer = function (doctorUID) {
        const display = document.getElementById('authTimerDisplay');
        const pill = document.querySelector('.auth-timer-pill');

        if (window.authScreenInterval) clearInterval(window.authScreenInterval);

        window.authScreenInterval = setInterval(async () => {
            try {
                const sessionSnap = await getDoc(doc(db, "active_sessions", doctorUID));

                if (!sessionSnap.exists()) {
                    clearInterval(window.authScreenInterval);
                    return;
                }

                const data = sessionSnap.data();

                if (!data.isActive || !data.isDoorOpen) {
                    clearInterval(window.authScreenInterval);

                    if (window.isJoiningProcessActive) return;

                    alert("🔒 عذراً، أغلق المحاضر باب التسجيل.");
                    location.reload();
                    return;
                }

                if (data.duration === -1) {
                    if (display) display.innerText = "OPEN";
                    if (pill) {
                        pill.style.background = "#ecfdf5";
                        pill.style.color = "#10b981";
                        pill.style.borderColor = "#a7f3d0";
                        pill.classList.remove('urgent-mode');
                    }
                    return;
                }

                const now = Date.now();
                const startMs = data.startTime.toMillis();
                const deadline = startMs + (data.duration * 1000);
                const remaining = Math.floor((deadline - now) / 1000);

                if (remaining <= 0) {
                    if (window.isJoiningProcessActive) {
                        console.log("⏳ الوقت انتهى لكن الطالب في مرحلة التحميل.. السماح بالدخول.");
                        return;
                    }

                    clearInterval(window.authScreenInterval);
                    alert("⏰ انتهى الوقت المخصص لدخول القاعة!");
                    location.reload();
                    return;
                }

                if (display) display.innerText = remaining + "s";

                if (remaining <= 10 && pill) {
                    pill.classList.add('urgent-mode');
                } else if (pill) {
                    pill.classList.remove('urgent-mode');
                }

            } catch (err) {
                console.error("Timer Sync Error:", err);
            }
        }, 1000);
    };
    window.resetSearchSession = function () {
        const step1 = document.getElementById('step1_search');
        const step2 = document.getElementById('step2_auth');

        if (step2) {
            step2.style.display = 'none';
            step2.classList.remove('active');
        }

        if (step1) {
            step1.style.display = 'block';
            step1.style.opacity = '1';
            step1.style.visibility = 'visible';
        }

        const passInput = document.getElementById('sessionPass');
        const codeInput = document.getElementById('attendanceCode');

        if (passInput) passInput.value = '';
        if (codeInput) codeInput.value = '';

        const errorContainer = document.getElementById('screenError');
        if (errorContainer) errorContainer.style.display = 'none';

    };

    function closeTimeoutModal() { document.getElementById('timeoutModal').style.display = 'none'; location.reload(); }

    async function handleIdSubmit() {
        playClick();

        let rawIdElement = document.getElementById('uniID');
        if (!rawIdElement) return;

        let rawId = rawIdElement.value.trim();
        const uniIdVal = convertArabicToEnglish(rawId);
        const alertBox = document.getElementById('dataEntryAlert');
        const btn = document.getElementById('nextStepBtn');

        if (alertBox) alertBox.style.display = 'none';

        if (!uniIdVal) {
            if (alertBox) {
                alertBox.innerText = "⚠️ يرجى إدخال الكود الجامعي.";
                alertBox.style.display = 'block';
            }
            return;
        }

        const originalBtnText = btn ? btn.innerHTML : "Next";
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>  SEARCHING...';
            btn.disabled = true;
        }

        try {
            const docRef = doc(db, "students", uniIdVal);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const studentData = docSnap.data();
                const studentName = studentData.name;

                attendanceData.uniID = uniIdVal;
                attendanceData.name = studentName;
                sessionStorage.setItem(TEMP_ID_KEY, uniIdVal);
                sessionStorage.setItem(TEMP_NAME_KEY, studentName);

                const nameEl = document.getElementById('scanNameDisplay');
                if (nameEl) {
                    nameEl.innerText = studentName;
                }

                const idEl = document.getElementById('scanIDDisplay');
                if (idEl) {
                    idEl.innerText = uniIdVal;
                }

                if (typeof countdownInterval !== 'undefined' && countdownInterval) clearInterval(countdownInterval);
                if (typeof stopCameraSafely === 'function') stopCameraSafely();

                switchScreen('screenScanQR');
                playSuccess();

            } else {
                console.log("No student found with ID:", uniIdVal);
                if (alertBox) {
                    alertBox.innerText = "❌ هذا الكود غير مسجل في النظام.";
                    alertBox.style.display = 'block';
                }
                if (navigator.vibrate) navigator.vibrate(300);
            }

        } catch (error) {
            console.error("Error fetching student:", error);
            if (alertBox) {
                alertBox.innerText = "⚠️ خطأ في الاتصال بالسيرفر.";
                alertBox.style.display = 'block';
            }
        } finally {
            if (btn) {
                btn.innerHTML = originalBtnText;
                btn.disabled = false;
            }
        }
    }

    function toggleBypassMode() {
        const chk = document.getElementById('bypassCheckbox'); const btnVerify = document.getElementById('btnVerify');
        if (chk.checked) { attendanceData.isVerified = true; userLat = CONFIG.gps.targetLat; userLng = CONFIG.gps.targetLong; btnVerify.style.display = 'none'; document.getElementById('bypassModal').style.display = 'flex'; setTimeout(() => { document.getElementById('bypassModal').style.display = 'none'; }, 2000); }
        else { attendanceData.isVerified = false; btnVerify.style.display = 'flex'; btnVerify.innerHTML = '<i class="fa-solid fa-fingerprint"></i> التحقق من الهوية'; btnVerify.classList.remove('disabled'); }
        checkAllConditions();
    }

    let localSessionDeadline = null;
    let sessionInterval = null;

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
                btn.classList.remove('session-open');
                btn.style.background = "#fee2e2";
                btn.style.color = "#991b1b";
                if (txt) txt.innerText = "بدء محاضرة جديدة";
                if (icon) icon.className = "fa-solid fa-play";
            }
            if (floatTimer) floatTimer.style.display = 'none';
            return;
        }

        let startMs = 0;
        if (startTime && typeof startTime.toMillis === 'function') {
            startMs = startTime.toMillis();
        } else {
            startMs = startTime || Date.now();
        }

        const updateTick = () => {
            const now = Date.now();
            const elapsedSeconds = Math.floor((now - startMs) / 1000);
            const remaining = duration - elapsedSeconds;

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
                        });
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
                    } else {
                        clearInterval(sessionInterval);
                        floatTimer.style.display = 'none';

                        const currentScreen = document.querySelector('.section.active')?.id;

                        if (currentScreen === 'screenDataEntry' && !window.isJoiningProcessActive) {
                            resetApplicationState();
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

    function addKey(num) { playClick(); const i = document.getElementById('uniID'); if (i.value.length < 10) i.value += num; }
    function backspaceKey() { playClick(); const i = document.getElementById('uniID'); i.value = i.value.slice(0, -1); }
    function clearKey() { playClick(); document.getElementById('uniID').value = ''; }
    function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) { var R = 6371; var dLat = (lat2 - lat1) * (Math.PI / 180); var dLon = (lon2 - lon1) * (Math.PI / 180); var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); }

    async function goBackToWelcome() {
        playClick();
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (typeof geo_watch_id !== 'undefined' && geo_watch_id) {
            navigator.geolocation.clearWatch(geo_watch_id);
        }
        if (typeof countdownInterval !== 'undefined' && countdownInterval) {
            clearInterval(countdownInterval);
        }

        if (typeof stopCameraSafely === 'function') {
            await stopCameraSafely();
        }

        if (typeof SESSION_END_TIME_KEY !== 'undefined') sessionStorage.removeItem(SESSION_END_TIME_KEY);
        if (typeof TEMP_NAME_KEY !== 'undefined') sessionStorage.removeItem(TEMP_NAME_KEY);
        if (typeof TEMP_ID_KEY !== 'undefined') sessionStorage.removeItem(TEMP_ID_KEY);
        if (typeof TEMP_CODE_KEY !== 'undefined') sessionStorage.removeItem(TEMP_CODE_KEY);

        processIsActive = false;
        if (typeof releaseWakeLock === 'function') releaseWakeLock();

        const uniInput = document.getElementById('uniID');
        if (uniInput) {
            uniInput.value = '';
        }

        const codeInput = document.getElementById('attendanceCode');
        if (codeInput) {
            codeInput.value = '';
        }

        const scanCard = document.getElementById('startScanCard');
        if (scanCard) {
            scanCard.style.display = 'flex';
        }

        if (typeof hideConnectionLostModal === 'function') hideConnectionLostModal();

        switchScreen('screenWelcome');
    }

    function closeSelect(overlay) { const wrapper = overlay.parentElement; wrapper.classList.remove('open'); }
    function setupCustomSelects() {
        const yearWrapper = document.getElementById('yearSelectWrapper');
        const groupWrapper = document.getElementById('groupSelectWrapper');
        const subjectWrapper = document.getElementById('subjectSelectWrapper');
        const hallWrapper = document.getElementById('hallSelectWrapper');

        const allWrappers = [yearWrapper, groupWrapper, subjectWrapper, hallWrapper].filter(w => w !== null);

        function toggleSelect(wrapper, event) {
            if (!wrapper) return;
            event.stopPropagation();

            allWrappers.forEach(w => {
                if (w !== wrapper) w.classList.remove('open');
            });

            if (!wrapper.classList.contains('open')) {
                if (!wrapper.classList.contains('disabled')) {
                    wrapper.classList.add('open');
                    if (typeof playClick === 'function') playClick();
                }
            } else {
                wrapper.classList.remove('open');
            }
        }

        allWrappers.forEach(wrapper => {
            const trigger = wrapper.querySelector('.custom-select-trigger');
            if (trigger) {
                trigger.addEventListener('click', (e) => toggleSelect(wrapper, e));
            }
        });

        if (yearWrapper) {
            const yearSelect = document.getElementById('yearSelect');
            const yearTriggerText = yearWrapper.querySelector('.trigger-text');

            yearWrapper.querySelectorAll('.custom-option').forEach(op => {
                op.addEventListener('click', function (e) {
                    e.stopPropagation();

                    yearWrapper.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                    this.classList.add('selected');

                    if (yearTriggerText) yearTriggerText.textContent = this.querySelector('span')?.textContent || this.textContent;
                    yearWrapper.classList.remove('open');

                    if (yearSelect) {
                        yearSelect.value = this.getAttribute('data-value');
                        yearSelect.dispatchEvent(new Event('change'));
                    }

                    if (typeof playClick === 'function') playClick();

                    if (typeof updateGroups === 'function') updateGroups();
                    if (typeof updateSubjects === 'function') updateSubjects();
                });
            });
        }

        document.addEventListener('click', () => {
            allWrappers.forEach(w => w.classList.remove('open'));
        });
    }

    function updateGroups() {
        const y = document.getElementById("yearSelect").value;
        const gWrapper = document.getElementById('groupSelectWrapper'); const gOptions = document.getElementById('groupOptionsContainer');
        const gTriggerText = gWrapper.querySelector('.trigger-text'); const gReal = document.getElementById("groupSelect");
        gReal.innerHTML = '<option value="" disabled selected>-- اختر المجموعة --</option>'; gOptions.innerHTML = ''; gTriggerText.textContent = '-- اختر المجموعة --';
        if (y) {
            gReal.disabled = false; gWrapper.classList.remove('disabled');
            let prefix = (y === "first_year") ? "1G" : "2G";
            for (let i = 1; i <= 20; i++) {
                let groupName = prefix + i;
                const opt = document.createElement("option"); opt.value = groupName; opt.text = groupName; gReal.appendChild(opt);
                const cOpt = document.createElement('div'); cOpt.className = 'custom-option'; cOpt.innerHTML = `<span class="english-num">${groupName}</span>`; cOpt.setAttribute('data-value', groupName);
                cOpt.addEventListener('click', function (e) {
                    e.stopPropagation(); gOptions.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                    this.classList.add('selected'); gTriggerText.textContent = groupName;
                    gWrapper.classList.remove('open'); gReal.value = this.getAttribute('data-value');
                    playClick(); checkAllConditions();
                }); gOptions.appendChild(cOpt);
            }
        } else { gReal.disabled = true; gWrapper.classList.add('disabled'); gTriggerText.textContent = '-- اختر الفرقة أولاً --'; }
    }

    function updateSubjects() {
        const y = document.getElementById("yearSelect").value;
        const sWrapper = document.getElementById('subjectSelectWrapper');
        const sOptions = document.getElementById('subjectOptionsContainer');
        const sTriggerText = sWrapper.querySelector('.trigger-text');
        const sReal = document.getElementById("subjectSelect");

        sReal.innerHTML = '<option value="" disabled selected>-- اختر المادة --</option>';
        sOptions.innerHTML = '';
        sTriggerText.textContent = '-- اختر المادة --';

        if (y && subjectsData[y]) {
            sReal.disabled = false;
            sWrapper.classList.remove('disabled');

            subjectsData[y].forEach(sub => {
                const opt = document.createElement("option");
                opt.value = sub;
                opt.text = sub;
                sReal.appendChild(opt);

                const cOpt = document.createElement('div');
                cOpt.className = 'custom-option';
                cOpt.innerHTML = `<span>${sub}</span>`;
                cOpt.setAttribute('data-value', sub);

                cOpt.addEventListener('click', function (e) {
                    e.stopPropagation();
                    sOptions.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                    this.classList.add('selected');
                    sTriggerText.textContent = this.querySelector('span').textContent;
                    sWrapper.classList.remove('open');
                    sReal.value = this.getAttribute('data-value');
                    playClick();
                    checkAllConditions();
                });
                sOptions.appendChild(cOpt);
            });
        } else {
            sReal.disabled = true;
            sWrapper.classList.add('disabled');
            sTriggerText.textContent = '-- اختر الفرقة أولاً --';
        }

        checkAllConditions();

        const autoSubject = sessionStorage.getItem('AUTO_SELECT_SUBJECT');

        if (autoSubject) {
            const opts = document.querySelectorAll('#subjectOptionsContainer .custom-option');

            opts.forEach(opt => {
                if (opt.getAttribute('data-value') === autoSubject) {
                    opt.click();
                    sessionStorage.removeItem('AUTO_SELECT_SUBJECT');
                }
            });
        }
    }

    function checkAllConditions() {
        const isQuick = sessionStorage.getItem('is_quick_mode_active') === 'true';
        const disableQR = sessionStorage.getItem('qm_disable_qr') === 'true';

        const passInput = document.getElementById('sessionPass');
        if (isQuick && disableQR && passInput && passInput.value === '') {
            passInput.value = "SKIPPED_QR";
        }

        const year = document.getElementById('yearSelect')?.value;
        const group = document.getElementById('groupSelect')?.value;
        const sub = document.getElementById('subjectSelect')?.value;
        const hall = document.getElementById('hallSelect')?.value;
        const qrPass = document.getElementById('sessionPass')?.value;

        const btn = document.getElementById('submitBtn');

        if (btn) {
            if (year && group && sub && hall && qrPass) {
                btn.disabled = false;
                btn.style.opacity = "1";
                btn.style.cursor = "pointer";
            } else {
                btn.disabled = true;
                btn.style.opacity = "0.6";
                btn.style.cursor = "not-allowed";
            }
        }
    }

    async function stopCameraSafely() { if (html5QrCode && html5QrCode.isScanning) { try { await html5QrCode.stop(); } catch (e) { } } document.getElementById('qr-reader').style.display = 'none'; releaseWakeLock(); }
    function retryCamera() { document.getElementById('cameraErrorModal').style.display = 'none'; proceedToCamera(); }
    async function startQrScanner() { playClick(); requestWakeLock(); await stopCameraSafely(); document.getElementById('startScanCard').style.display = 'none'; document.getElementById('qr-reader').style.display = 'block'; document.getElementById('qr-reader').innerHTML = '<div class="scanner-laser" style="display:block"></div>'; document.getElementById('submitBtn').disabled = true; document.getElementById('sessionPass').value = ''; html5QrCode = new Html5Qrcode("qr-reader"); try { await html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (t) => { playBeep(); html5QrCode.stop().then(() => { document.getElementById('qr-reader').style.display = 'none'; document.getElementById('scanSuccessMsg').style.display = 'flex'; document.getElementById('sessionPass').value = t; checkAllConditions(); if (navigator.vibrate) navigator.vibrate([100, 50, 100]); releaseWakeLock(); }); }); } catch (err) { await stopCameraSafely(); document.getElementById('startScanCard').style.display = 'none'; document.getElementById('retryCamBtn').style.display = 'flex'; document.getElementById('cameraErrorModal').style.display = 'flex'; } }

    async function checkAdminPassword() {
        playClick();

        const email = document.getElementById('adminEmailInput').value.trim();
        const pass = document.getElementById('adminPassword').value;
        const btn = document.querySelector('#screenAdminLogin .btn-main');
        const alertBox = document.getElementById('adminAlert');

        if (alertBox) alertBox.style.display = 'none';

        if (!email || !pass) {
            if (navigator.vibrate) navigator.vibrate(200);
            if (alertBox) {
                alertBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> يرجى كتابة البيانات`;
                alertBox.style.display = 'flex';
            }
            return;
        }

        const oldText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الدخول...';
        btn.disabled = true;

        try {
            await signInWithEmailAndPassword(auth, email, pass);

            playSuccess();
            const modal = document.getElementById('adminSuccessModal');
            modal.style.display = 'flex';

            const sessionToken = "admin_verified_SECURE_" + Date.now();
            sessionStorage.setItem(ADMIN_AUTH_TOKEN, sessionToken);

            setTimeout(() => {
                modal.style.display = 'none';
                updateUIForMode();
                switchScreen('screenWelcome');
                document.getElementById('adminPassword').value = '';
            }, 2000);

        } catch (error) {
            console.error("Login Error:", error);

            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

            let msg = "حدث خطأ غير معروف";

            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                msg = "البريد أو كلمة المرور خطأ";
            } else if (error.code === 'auth/invalid-email') {
                msg = "صيغة البريد غير صحيحة";
            } else if (error.code === 'auth/too-many-requests') {
                msg = "محاولات كثيرة.. انتظر قليلاً";
            } else if (error.code === 'auth/network-request-failed') {
                msg = "تأكد من اتصال الإنترنت";
            }

            if (alertBox) {
                alertBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${msg}`;
                alertBox.style.display = 'flex';
            }

        } finally {
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    }
    function openLogoutModal() { playClick(); document.getElementById('customLogoutModal').style.display = 'flex'; }
    function closeLogoutModal() { playClick(); document.getElementById('customLogoutModal').style.display = 'none'; }
    function showConnectionLostModal() { document.getElementById('connectionLostModal').style.display = 'flex'; }
    function hideConnectionLostModal() { document.getElementById('connectionLostModal').style.display = 'none'; }
    async function checkRealConnection() { return true; }
    function initGlobalGuard() {
        setInterval(async () => { const o = await checkRealConnection(); if (!o) showConnectionLostModal(); else hideConnectionLostModal(); }, 2000);
        if (!isMobileDevice()) { document.getElementById('desktop-blocker').style.display = 'flex'; document.body.style.overflow = 'hidden'; throw new Error("Desktop access denied."); }
    }

    let unsubscribeReport = null;
    window.openReportModal = async function () {
        if (typeof playClick === 'function') playClick();

        const modal = document.getElementById('reportModal');
        if (modal) {
            modal.style.display = 'flex';
            if (typeof showSubjectsView === 'function') showSubjectsView();
        }

        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        const dateStr = `${d}/${m}/${y}`; // النتيجة: 20/01/2026

        const dateDisplay = document.getElementById('reportDateDisplay');
        if (dateDisplay) dateDisplay.innerText = dateStr;

        const container = document.getElementById('subjectsContainer');
        if (container) {
            container.innerHTML = `<div style="text-align:center; padding:50px 20px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:30px; color:var(--primary); margin-bottom:15px;"></i><div style="font-weight:bold; color:#64748b;">جاري البحث عن سجلات ${dateStr}...</div></div>`;
        }

        if (window.unsubscribeReport) {
            window.unsubscribeReport();
            window.unsubscribeReport = null;
        }

        try {
            const activeSessionsQ = query(collection(db, "active_sessions"), where("isActive", "==", true));
            const activeSnap = await getDocs(activeSessionsQ);
            const activeSubjectsList = activeSnap.docs.map(doc => doc.data().allowedSubject ? doc.data().allowedSubject.trim() : "");

            const q = query(
                collection(db, "attendance"),
                where("date", "==", dateStr)
            );

            window.unsubscribeReport = onSnapshot(q, (querySnapshot) => {
                let allData = [];

                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    allData.push({
                        docId: doc.id,
                        uniID: data.id || "---",
                        name: data.name || "طالب غير معروف",
                        subject: (data.subject || "مادة غير محددة").trim(),
                        group: data.group || "--",
                        time: data.time_str || "--:--",
                        hall: data.hall || "غير محدد",
                        code: data.session_code || "",
                        notes: data.notes || "منضبط", // تم تعديلها لقراءة notes مباشرة
                        doctorName: data.doctorName || "غير محدد",
                        segment_count: data.segment_count || 1,
                        timestamp: data.archivedAt || data.timestamp
                    });
                });

                allData.sort((a, b) => {
                    const tA = a.timestamp ? (a.timestamp.seconds || 0) : 0;
                    const tB = b.timestamp ? (b.timestamp.seconds || 0) : 0;
                    return tB - tA;
                });

                window.cachedReportData = allData;

                if (container) {
                    if (allData.length === 0) {
                        container.innerHTML = `
                        <div class="empty-state">
                            <i class="fa-solid fa-folder-open" style="font-size:40px; color:#cbd5e1; margin-bottom:15px;"></i>
                            <br>
                            لا توجد سجلات محفوظة لهذا اليوم (${dateStr}).
                            <br>
                            <small style="color:#ef4444; margin-top:10px; display:block;">
                                تأكد أنك قمت بإنهاء الجلسة وحفظها بنجاح.
                            </small>
                        </div>`;
                    } else {
                        if (typeof renderSubjectsList === 'function') {
                            renderSubjectsList(allData, activeSubjectsList);
                        } else {
                            console.error("Function renderSubjectsList is missing!");
                        }
                    }
                }
            }, (error) => {
                console.error("Snapshot Error:", error);
                if (container) {
                    container.innerHTML = `<div style="color:#ef4444; text-align:center; padding:30px;">⚠️ حدث خطأ في جلب البيانات.<br><small>${error.message}</small></div>`;
                }
            });

        } catch (e) {
            console.error("Report Function Error:", e);
            if (container) {
                container.innerHTML = `<div style="color:#ef4444; text-align:center; padding:30px;">⚠️ خطأ غير متوقع.<br><small>${e.message}</small></div>`;
            }
        }
    };

    window.renderSubjectsList = function (data, activeSubjects = []) {
        const subjects = [...new Set(data.map(item => item.subject))];
        let html = '';

        if (subjects.length === 0) {
            document.getElementById('subjectsContainer').innerHTML = '<div class="empty-state">لا توجد مواد مسجلة اليوم.</div>';
            return;
        }

        subjects.forEach(subject => {
            const count = data.filter(i => i.subject === subject).length;

            const isSubjectActiveNow = activeSubjects.includes(subject.trim());

            let activeBadge = '';
            let cardStyle = '';
            let statusIcon = '<i class="fa-solid fa-check-circle" style="color:#10b981;"></i> مكتمل'; // الافتراضي

            if (isSubjectActiveNow) {
                activeBadge = `
            <div style="margin-top:8px; display:inline-flex; align-items:center; gap:6px; background:#fef2f2; color:#ef4444; padding:6px 12px; border-radius:8px; font-size:11px; font-weight:800; border:1px solid #fecaca; width:fit-content;">
                <span class="blink-dot" style="width:8px; height:8px; background:#ef4444; border-radius:50%; display:inline-block;"></span>
            انتظر 
            </div>`;

                cardStyle = 'border-right: 5px solid #ef4444; background: #fffbfb;';
                statusIcon = '';
            }

            html += `
        <div class="subject-big-card" onclick="openSubjectDetails('${subject}')" style="${cardStyle} position: relative; transition:0.2s;">
            <div style="flex: 1;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 900; color: #1e293b;">
                        ${subject}
                    </h3>
                    ${statusIcon ? `<div style="font-size:10px; color:#10b981; font-weight:bold;">${statusIcon}</div>` : ''}
                </div>
                
                ${activeBadge} <!-- هنا يظهر التنبيه الأحمر لو الجلسة شغالة -->

                <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
                    <span style="background: #e0f2fe; color: #0284c7; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; border:1px solid #bae6fd;">
                        <i class="fa-solid fa-users"></i> ${count} طالب (محفوظ)
                    </span>
                </div>
            </div>

            <button onclick="event.stopPropagation(); exportAttendanceSheet('${subject}')" 
                    title="تصدير شيت إكسيل"
                    class="btn-download-excel"
                    style="${isSubjectActiveNow ? 'opacity:0.5; cursor:not-allowed; background:#f1f5f9; color:#94a3b8; border-color:#e2e8f0;' : ''}">
                <i class="fa-solid fa-file-excel"></i>
            </button>
        </div>`;
        });

        document.getElementById('subjectsContainer').innerHTML = html;
    };


    window.openSubjectDetails = function (subjectName) {
        playClick();

        const cleanSubjectName = subjectName.trim();

        document.getElementById('currentSubjectTitle').innerText = cleanSubjectName;

        if (!window.cachedReportData) {
            alert("⚠️ خطأ: البيانات غير محملة. يرجى تحديث السجل.");
            return;
        }

        let students = window.cachedReportData.filter(s => s.subject === cleanSubjectName);

        console.log(`فتح المادة: ${cleanSubjectName} | عدد الطلاب: ${students.length}`); // للفحص

        if (students.length === 0) {
            document.getElementById('studentsContainer').innerHTML = `
            <div class="empty-state">
                ⚠️ لا توجد بيانات للعرض!<br>
                قد يكون هناك اختلاف في اسم المادة.
                <br><small>المطلوب: "${cleanSubjectName}"</small>
            </div>`;
        } else {
            students.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

            let html = '';
            students.forEach(item => {
                let cardClass = "";
                let notesBadge = `<span style="color:#10b981; font-size:10px; background:#ecfdf5; padding:2px 6px; border-radius:4px;">منضبط</span>`;

                if (item.notes && (item.notes.includes("غير منضبط") || item.notes.includes("زي"))) {
                    cardClass = "alert-row";
                    notesBadge = `<span style="color:#ef4444; font-weight:bold; font-size:11px; background:#fee2e2; padding:2px 6px; border-radius:4px;">⚠️ ${item.notes}</span>`;
                }

                html += `
            <div class="student-detailed-card ${cardClass}">
                <div class="st-data-col" style="width: 100%;">
                    
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="st-name" style="font-weight:800; font-size:14px; color:#1e293b;">${item.name}</div>
                        <div style="background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:5px; font-size:11px; font-weight:bold;">${item.group}</div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                        <div class="en-font" style="font-size:12px; color:#64748b;">ID: ${item.uniID}</div>
                        ${notesBadge}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px dashed #e2e8f0; padding-top:5px;">
                        <div style="font-size:11px; color:#0ea5e9; font-weight:bold;">
                            <i class="fa-solid fa-building-columns"></i> ${item.hall}
                        </div>
                        <div style="font-size:11px; color:#334155; font-weight:bold; direction:ltr;">
                            <i class="fa-regular fa-clock"></i> ${item.time}
                        </div>
                    </div>

                </div>
                
                <button class="btn-delete-item" onclick="deleteEntry('${item.uniID}', '${cleanSubjectName}', this)" style="margin-right: 10px;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>`;
            });

            document.getElementById('studentsContainer').innerHTML = html;
        }

        document.getElementById('viewSubjects').style.transform = 'translateX(100%)';
        document.getElementById('viewStudents').style.transform = 'translateX(0)';
    };

    window.showSubjectsView = function () {
        playClick();
        document.getElementById('viewSubjects').style.transform = 'translateX(0)';
        document.getElementById('viewStudents').style.transform = 'translateX(100%)';
    };
    function getHighlights() { return JSON.parse(localStorage.getItem(HIGHLIGHT_STORAGE_KEY) || "[]"); }
    function toggleHighlightStorage(id) {
        let list = getHighlights(); if (list.includes(id)) list = list.filter(x => x !== id); else list.push(id);
        localStorage.setItem(HIGHLIGHT_STORAGE_KEY, JSON.stringify(list)); return list.includes(id);
    }

    function getEvaluations() { return JSON.parse(localStorage.getItem(EVAL_STORAGE_KEY) || "{}"); }

    window.openSubjectDetails = function (subjectName) {
        playClick();

        const cleanSubjectName = normalizeArabic(subjectName.trim());
        document.getElementById('currentSubjectTitle').innerText = subjectName;

        if (!window.cachedReportData) {
            alert("⚠️ خطأ: البيانات غير محملة. يرجى تحديث السجل.");
            return;
        }

        let students = window.cachedReportData.filter(s => {
            const storedSubject = normalizeArabic((s.subject || "").trim());
            return storedSubject === cleanSubjectName;
        });

        console.log(`فتح المادة: ${cleanSubjectName} | عدد الطلاب: ${students.length}`);

        if (students.length === 0) {
            document.getElementById('studentsContainer').innerHTML = `
        <div class="empty-state">
            ⚠️ لا توجد بيانات للعرض!<br>
            قد يكون هناك اختلاف في اسم المادة.
            <br><small>المطلوب: "${subjectName}"</small>
        </div>`;
        } else {
            students.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

            let html = '';
            students.forEach(item => {
                let cardClass = "";
                let notesBadge = `<span style="color:#10b981; font-size:10px; background:#ecfdf5; padding:2px 6px; border-radius:4px;">منضبط</span>`;

                if (item.notes && (item.notes.includes("غير منضبط") || item.notes.includes("زي"))) {
                    cardClass = "alert-row";
                    notesBadge = `<span style="color:#ef4444; font-weight:bold; font-size:11px; background:#fee2e2; padding:2px 6px; border-radius:4px;">⚠️ ${item.notes}</span>`;
                }

                html += `
        <div class="student-detailed-card ${cardClass}">
            <div class="st-data-col" style="width: 100%;">
                
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="st-name" style="font-weight:800; font-size:14px; color:#1e293b;">${item.name}</div>
                    <div style="background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:5px; font-size:11px; font-weight:bold;">${item.group}</div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                    <div class="en-font" style="font-size:12px; color:#64748b;">ID: ${item.uniID}</div>
                    ${notesBadge}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px dashed #e2e8f0; padding-top:5px;">
                    <div style="font-size:11px; color:#0ea5e9; font-weight:bold;">
                        <i class="fa-solid fa-building-columns"></i> ${item.hall}
                    </div>
                    <div style="font-size:11px; color:#334155; font-weight:bold; direction:ltr;">
                        <i class="fa-regular fa-clock"></i> ${item.time}
                    </div>
                </div>

            </div>
            
            <button class="btn-delete-item" onclick="deleteEntry('${item.uniID}', '${item.subject}', this)" style="margin-right: 10px;">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>`;
            });

            document.getElementById('studentsContainer').innerHTML = html;
        }

        document.getElementById('viewSubjects').style.transform = 'translateX(100%)';
        document.getElementById('viewStudents').style.transform = 'translateX(0)';
    };

    function showSubjectsView() { playClick(); document.getElementById('viewSubjects').style.transform = 'translateX(0)'; document.getElementById('viewStudents').style.transform = 'translateX(100%)'; }
    function closeReportModal() { playClick(); document.getElementById('reportModal').style.display = 'none'; }

    let pendingAction = null;
    function showModernConfirm(title, text, actionCallback) {
        playClick(); document.getElementById('modernConfirmTitle').innerText = title; document.getElementById('modernConfirmText').innerHTML = text;
        const modal = document.getElementById('modernConfirmModal'); modal.style.display = 'flex'; pendingAction = actionCallback;
        const yesBtn = document.getElementById('btnConfirmYes'); yesBtn.onclick = function () { if (pendingAction) pendingAction(); closeModernConfirm(); }; if (navigator.vibrate) navigator.vibrate(50);
    }
    function closeModernConfirm() { playClick(); document.getElementById('modernConfirmModal').style.display = 'none'; pendingAction = null; }

    async function deleteEntry(id, subject, btn) {
        showModernConfirm("حذف نهائي", "سيتم حذف هذا السجل من قاعدة البيانات نهائياً. هل أنت متأكد؟", async function () {

            const card = btn.closest('.student-detailed-card');
            const originalIcon = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;

            try {
                const now = new Date();
                const dateStr = ('0' + now.getDate()).slice(-2) + '/' + ('0' + (now.getMonth() + 1)).slice(-2) + '/' + now.getFullYear();

                const q = query(
                    collection(db, "attendance"),
                    where("id", "==", id),
                    where("date", "==", dateStr),
                    where("subject", "==", subject)
                );

                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    showToast("لم يتم العثور على السجل في السيرفر!", 3000, "#f59e0b");
                    btn.innerHTML = originalIcon;
                    btn.disabled = false;
                    return;
                }

                const deletePromises = [];
                querySnapshot.forEach((doc) => {
                    deletePromises.push(deleteDoc(doc.ref));
                });

                await Promise.all(deletePromises);

                card.style.transition = "all 0.5s ease";
                card.style.transform = "translateX(100%)";
                card.style.opacity = '0';

                setTimeout(() => { card.remove(); }, 500);
                showToast("تم الحذف من السيرفر بنجاح.", 3000, '#ef4444');

            } catch (error) {
                console.error("Delete Error:", error);
                showToast("حدث خطأ أثناء الحذف.", 3000, "#ef4444");
                btn.innerHTML = originalIcon;
                btn.disabled = false;
            }
        });
    }

    async function highlightEntry(id, subject, btn) {
        playClick(); const card = btn.closest('.student-detailed-card');
        const isNowHighlighted = toggleHighlightStorage(id);
        if (isNowHighlighted) card.classList.add('highlighted-red'); else card.classList.remove('highlighted-red');
    }

    async function clearAllReport() {
        showModernConfirm(
            "حذف سجل اليوم بالكامل 🗑️",
            "تحذير خطير: سيتم حذف جميع بيانات الحضور المسجلة بتاريخ اليوم من السيرفر نهائياً.<br>لا يمكن التراجع عن هذا الإجراء. هل أنت متأكد؟",
            async function () {
                const container = document.getElementById('subjectsContainer');

                container.innerHTML = '<div style="text-align:center; padding:50px; color:#ef4444;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:30px;"></i><br>جاري حذف جميع البيانات من السيرفر...</div>';

                try {
                    const now = new Date();
                    const dateStr = ('0' + now.getDate()).slice(-2) + '/' + ('0' + (now.getMonth() + 1)).slice(-2) + '/' + now.getFullYear();

                    const q = query(collection(db, "attendance"), where("date", "==", dateStr));
                    const querySnapshot = await getDocs(q);

                    if (querySnapshot.empty) {
                        showToast("السجل نظيف بالفعل، لا توجد بيانات.", 3000, "#10b981");
                        container.innerHTML = '<div class="empty-state">لا توجد سجلات اليوم.</div>';
                        return;
                    }

                    const chunks = [];
                    const docs = querySnapshot.docs;
                    for (let i = 0; i < docs.length; i += 400) {
                        chunks.push(docs.slice(i, i + 400));
                    }

                    for (const chunk of chunks) {
                        const batch = writeBatch(db);
                        chunk.forEach(doc => {
                            batch.delete(doc.ref);
                        });
                        await batch.commit();
                    }

                    playSuccess();
                    showToast(`تم حذف ${querySnapshot.size} سجل بنجاح.`, 4000, "#10b981");
                    container.innerHTML = '<div class="empty-state">تم تصفية السجل نهائياً.</div>';

                } catch (error) {
                    console.error("Clear All Error:", error);
                    showToast("حدث خطأ أثناء الحذف: " + error.message, 4000, "#ef4444");
                    openReportModal();
                }
            }
        );
    }

    function isMobileDevice() { const ua = navigator.userAgent.toLowerCase(); const isTargetMobile = /android|iphone|ipod/i.test(ua); const isExcluded = /windows|macintosh|ipad|tablet|x11|kindle/i.test(ua); return (isTargetMobile && !isExcluded); }
    function showToast(message, duration = 3000, bgColor = '#334155') { const toast = document.getElementById('toastNotification'); toast.style.backgroundColor = bgColor; toast.innerText = message; toast.style.display = 'block'; setTimeout(() => { toast.style.display = 'none'; }, duration); }

    document.addEventListener('contextmenu', function (e) { e.preventDefault(); showToast('إجراء محظور لأسباب أمنية.', 2000, '#ef4444'); });
    document.addEventListener('copy', function (e) { e.preventDefault(); showToast('النسخ محظور لأسباب أمنية.', 2000, '#ef4444'); });
    document.addEventListener('cut', function (e) { e.preventDefault(); showToast('القص محظور لأسباب أمنية.', 2000, '#ef4444'); });
    document.addEventListener('paste', function (e) { e.preventDefault(); showToast('اللصق محظور لأسباب أمنية.', 2000, '#ef4444'); });


    window.triggerUploadProcess = function () {
        const level = document.getElementById('uploadLevelSelect').value;
        if (!level) {
            alert("⚠️ خطأ: يجب اختيار الفرقة الدراسية من القائمة أولاً!");
            return;
        }
        document.getElementById('excelFileInput').click();
    };

    const fileInputSmart = document.getElementById('excelFileInput');
    if (fileInputSmart) {
        fileInputSmart.addEventListener('change', async function (e) {
            const file = e.target.files[0];
            if (!file) return;

            const selectedLevel = document.getElementById('uploadLevelSelect').value;
            const statusDiv = document.getElementById('uploadStatus');

            const batchID = `BATCH_L${selectedLevel}_${Date.now()}`;

            statusDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحليل والتصنيف...';

            try {
                const rows = await readXlsxFile(file);
                const data = rows.slice(1);

                if (data.length === 0) {
                    statusDiv.innerText = "❌ الملف فارغ!";
                    return;
                }

                statusDiv.innerHTML = `<i class="fa-solid fa-server"></i> جاري رفع ${data.length} طالب للفرقة ${selectedLevel}...`;

                const batchSize = 450;
                let chunks = [];
                for (let i = 0; i < data.length; i += batchSize) chunks.push(data.slice(i, i + batchSize));

                let totalUploaded = 0;

                for (const chunk of chunks) {
                    const batch = writeBatch(db);

                    chunk.forEach(row => {
                        let studentId = row[0];
                        let studentName = row[1];

                        if (studentId && studentName) {
                            studentId = String(studentId).trim();
                            studentName = String(studentName).trim();

                            const docRef = doc(db, "students", studentId);

                            batch.set(docRef, {
                                name: studentName,
                                id: studentId,
                                academic_level: selectedLevel,
                                upload_batch_id: batchID,
                                created_at: Timestamp.now()
                            }, { merge: true });
                        }
                    });

                    await batch.commit();
                    totalUploaded += chunk.length;
                    statusDiv.innerText = `تم معالجة ${totalUploaded} طالب...`;
                }

                await addDoc(collection(db, "upload_history"), {
                    batch_id: batchID,
                    level: selectedLevel,
                    filename: file.name,
                    count: totalUploaded,
                    timestamp: Timestamp.now(),
                    admin_name: "Admin"
                });

                statusDiv.innerHTML = `<span style="color: #10b981;">✅ تم بنجاح! تم حفظ وتصنيف ${totalUploaded} طالب.</span>`;
                playSuccess();
                fileInputSmart.value = '';

            } catch (error) {
                console.error("Upload Error:", error);
                statusDiv.innerText = "❌ حدث خطأ غير متوقع.";
                alert(error.message);
            }
        });
    }

    if (!isMobileDevice()) { document.getElementById('desktop-blocker').style.display = 'flex'; document.body.style.overflow = 'hidden'; throw new Error("Desktop access denied."); }

    window.startProcess = startProcess;
    window.handleIdSubmit = handleIdSubmit;
    window.checkAdminPassword = checkAdminPassword;
    window.goBackToWelcome = goBackToWelcome;
    window.handleReportClick = handleReportClick;
    window.openExamModal = openExamModal;
    window.closeExamModal = closeExamModal;
    window.openDataEntryMenu = openDataEntryMenu;
    window.clearAllReport = clearAllReport;
    window.openReportModal = openReportModal;
    window.closeReportModal = closeReportModal;
    window.showSubjectsView = showSubjectsView;
    window.openSubjectDetails = openSubjectDetails;
    window.filterStudents = filterStudents;
    window.highlightEntry = highlightEntry;
    window.deleteEntry = deleteEntry;
    window.hideConnectionLostModal = hideConnectionLostModal;
    window.addKey = addKey;
    window.backspaceKey = backspaceKey;
    window.clearKey = clearKey;
    window.openMapsToRefreshGPS = openMapsToRefreshGPS;
    window.toggleBypassMode = toggleBypassMode;
    window.startQrScanner = startQrScanner;
    window.performLogout = performLogout;
    window.openLogoutModal = openLogoutModal;
    window.closeLogoutModal = closeLogoutModal;
    window.safeClick = safeClick;
    window.switchScreen = switchScreen;
    window.closeSelect = closeSelect;
    window.checkAllConditions = checkAllConditions;
    window.closeModernConfirm = closeModernConfirm;
    window.triggerAppInstall = triggerAppInstall;
    window.updateUIForMode = updateUIForMode;

    window.triggerAppInstall = triggerAppInstall;

    window.toggleQuickMode = async function () {
        const modal = document.getElementById('quickModeOptionsModal');
        if (!modal) return;

        modal.style.display = 'flex';

        try {
            const docSnap = await getDoc(doc(db, "settings", "control_panel"));

            if (docSnap.exists()) {
                const data = docSnap.data();
                const flags = data.quickModeFlags || {};

                document.getElementById('chkDisableGPS').checked = flags.disableGPS || false;
                document.getElementById('chkDisableQR').checked = flags.disableQR || false;

                console.log("Quick Mode State Loaded:", flags);
            }
        } catch (e) {
            console.error("Error loading quick mode state:", e);
        }
    };

    window.confirmQuickModeParams = async function () {
        const gps = document.getElementById('chkDisableGPS').checked;
        const face = document.getElementById('chkDisableFace').checked; // 🔥 إضافة خيار الوجه
        const qr = document.getElementById('chkDisableQR').checked;

        const btn = document.querySelector('#quickModeOptionsModal .btn-main');
        const originalText = btn.innerHTML;

        try {
            const user = auth.currentUser;
            if (!user) {
                showToast("⚠️ يجب تسجيل الدخول كدكتور أولاً", 3000, "#f59e0b");
                return;
            }

            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التخصيص...';
            btn.style.pointerEvents = 'none';


            const sessionRef = doc(db, "active_sessions", user.uid);

            await updateDoc(sessionRef, {
                isQuickMode: (gps || face || qr),
                quickModeFlags: {
                    disableGPS: gps,
                    disableFace: face,
                    disableQR: qr
                }
            });

            showToast("⚡ تم تحديث إعدادات جلستك بنجاح", 3000, "#10b981");
            document.getElementById('quickModeOptionsModal').style.display = 'none';

        } catch (e) {
            console.error("Save Error:", e);
            if (e.code === 'not-found' || e.message.includes('No document')) {
                showToast("❌ لا توجد جلسة نشطة لتعديلها. ابدأ محاضرة أولاً.", 4000, "#ef4444");
            } else {
                showToast("❌ حدث خطأ أثناء الحفظ", 3000, "#ef4444");
            }
        } finally {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
    };

    window.disableQuickMode = async function () {
        try {
            const docRef = doc(db, "settings", "control_panel");
            await setDoc(docRef, {
                isQuickMode: false,
                quickModeFlags: { disableGPS: false, disableQR: false }
            }, { merge: true });

            document.getElementById('chkDisableGPS').checked = false;
            document.getElementById('chkDisableFace').checked = false;
            document.getElementById('chkDisableQR').checked = false;

            document.getElementById('quickModeOptionsModal').style.display = 'none';
            showToast("🛡️ تم استعادة وضع الحماية الكامل", 3000, "#0ea5e9");
        } catch (e) { console.error(e); }
    };

    function applyQuickModeVisuals() {
        const disableQR = sessionStorage.getItem('qm_disable_qr') === 'true';

        const qrCard = document.getElementById('startScanCard');
        const qrSuccess = document.getElementById('scanSuccessMsg');

        if (disableQR) {
            if (qrCard) qrCard.classList.add('faded-disabled');

            const passInput = document.getElementById('sessionPass');
            if (passInput) passInput.value = "SKIPPED_QR";

            if (qrSuccess) {
                qrSuccess.style.display = 'flex';
                qrSuccess.innerHTML = 'تم تخطي الرمز تلقائياً';
                qrSuccess.style.background = '#ffedd5';
                qrSuccess.style.color = '#ea580c';
            }
        }

        if (typeof checkAllConditions === 'function') checkAllConditions();
    }

    function removeQuickModeVisuals() {
        const btnVerify = document.getElementById('btnVerify');
        const qrCard = document.getElementById('startScanCard');
        const qrSuccess = document.getElementById('scanSuccessMsg');

        if (btnVerify) {
            btnVerify.classList.remove('faded-disabled');
            btnVerify.innerHTML = '<i class="fa-solid fa-fingerprint"></i> التحقق من الهوية';
            if (!sessionStorage.getItem("secure_admin_session_token_v99")) {
                attendanceData.isVerified = false;
            }
        }

        if (qrCard) qrCard.classList.remove('faded-disabled');
        if (qrSuccess) qrSuccess.style.display = 'none';
        document.getElementById('sessionPass').value = '';
    }

    function handleQuickModeUI(isQuick) {
        const btn = document.getElementById('btnQuickMode');
        const txt = document.getElementById('quickModeText');

        if (!btn || !txt) return;

        const isAdmin = sessionStorage.getItem("secure_admin_session_token_v99");

        if (isAdmin) {
            btn.style.display = 'flex';
            if (isQuick) {
                btn.style.background = "#ffedd5";
                btn.style.borderColor = "#ea580c";
                btn.style.color = "#c2410c";
                txt.innerText = "الوضع السريع مفعل ⚡";
            } else {
                btn.style.background = "#fff7ed";
                btn.style.borderColor = "#fdba74";
                btn.style.color = "#ea580c";
                txt.innerText = "إعدادات التسجيل السريع";
            }
        } else {
            btn.style.display = 'none';
        }
    }

    window.submitToGoogle = async function (passwordOverride = null) {
        const btn = document.getElementById('submitBtn');

        if (!passwordOverride && (btn.disabled || btn.style.opacity === "0.7")) return;

        const targetDoctorUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
        if (!targetDoctorUID) {
            showToast("⚠️ خطأ في معرف الجلسة", 4000, "#ef4444");
            return;
        }

        const originalText = btn.innerHTML;
        if (!passwordOverride) {
            btn.innerHTML = '<i class="fa-solid fa-server fa-spin"></i> جاري الاتصال بالمصيدة...';
            safeClick(btn);
        }

        try {
            const user = auth.currentUser;
            if (!user) throw new Error("يجب تسجيل الدخول أولاً");


            const sessionRef = doc(db, "active_sessions", targetDoctorUID);
            const sessionSnap = await getDoc(sessionRef);

            if (!sessionSnap.exists() || !sessionSnap.data().isActive) {
                showToast("⛔ عذراً، المحاضرة انتهت وأغلقت.", 5000, "#ef4444");
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }

            const settings = sessionSnap.data();

            if (settings.duration !== -1 && settings.startTime) {
                const now = Date.now();
                const startMs = settings.startTime.toMillis();
                if (now > (startMs + (settings.duration * 1000))) {
                    showToast("🔒 لقد تأخرت! تم إغلاق باب التسجيل.", 5000, "#ef4444");
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    setTimeout(() => { if (typeof forceReturnHome === 'function') forceReturnHome(); else location.reload(); }, 2000);
                    return;
                }
            }

            if (settings.sessionPassword && settings.sessionPassword !== "" && passwordOverride !== settings.sessionPassword) {
                if (!passwordOverride) {
                    document.getElementById('studentPassModal').style.display = 'flex';
                } else {
                    showToast("❌ كلمة المرور غير صحيحة", 3000, "#ef4444");
                }
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }

            const currentDeviceId = getUniqueDeviceId();
            const gpsData = await getSilentLocationData();
            const idToken = await user.getIdToken();

            console.log("📤 إرسال البيانات للتحليل الأمني...");

            const response = await fetch(`${BACKEND_URL}/joinSessionSecure`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    studentUID: user.uid,
                    sessionDocID: targetDoctorUID,
                    gpsLat: gpsData.lat || 0,
                    gpsLng: gpsData.lng || 0,
                    deviceFingerprint: currentDeviceId,
                    codeInput: settings.sessionCode
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {

                document.getElementById('studentPassModal').style.display = 'none';
                if (typeof playSuccess === 'function') playSuccess();

                showToast(`✅ ${result.message}`, 3000, "#10b981");

                try {
                    const cached = localStorage.getItem('cached_profile_data');
                    if (cached) {
                        let cacheObj = JSON.parse(cached);
                        if (cacheObj.uid === user.uid) {
                            cacheObj.attendanceCount = (cacheObj.attendanceCount || 0) + 1;
                            localStorage.setItem('cached_profile_data', JSON.stringify(cacheObj));
                        }
                    }
                } catch (err) {
                    console.warn("UI Cache update warning:", err);
                }

                document.querySelector('.bottom-action-area').style.display = 'none';
                const homeBtn = document.querySelector('.home-floating-btn');
                if (homeBtn) homeBtn.style.display = 'flex';

                if (document.getElementById('liveDocName')) {
                    document.getElementById('liveDocName').innerText = settings.doctorName;
                }

                switchScreen('screenLiveSession');

                if (typeof startLiveSnapshotListener === 'function') {
                    startLiveSnapshotListener();
                }

            } else {
                throw new Error(result.error || "تم رفض التسجيل من قبل النظام الأمني");
            }

        } catch (e) {
            console.error("Submission Error:", e);

            let msg = e.message;
            if (msg.includes("Failed to fetch")) msg = "فشل الاتصال بالسيرفر! تأكد أن الإنترنت يعمل.";

            showToast("⛔ " + msg, 5000, "#ef4444");

            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    window.verifyAndSubmit = function () {
        const passInput = document.getElementById('studentEnteredPass');
        const pass = passInput.value.trim();
        const targetDrUID = sessionStorage.getItem('TEMP_DR_UID');

        if (!pass) {
            showToast("⚠️ الرجاء كتابة الرمز", 2000, "#f59e0b");
            return;
        }

        if (!auth.currentUser) {
            showToast("⚠️ يجب تسجيل الدخول أولاً", 3000, "#f59e0b");
            return;
        }

        if (!targetDrUID) {
            showToast("⚠️ خطأ في بيانات الجلسة، يرجى إعادة البحث", 3000, "#ef4444");
            return;
        }

        if (window.faceSystem && window.faceSystem.handleJoinRequest) {

            window.faceSystem.handleJoinRequest(auth.currentUser, targetDrUID, pass);

        } else {
            console.error("❌ Fatal Error: face-system.js is missing or not loaded.");
            showToast("❌ خطأ تقني: نظام التحقق غير جاهز. تأكد من الإنترنت وأعد التحميل.", 5000, "#ef4444");
        }
    };

    window.closeStudentPassModal = function () {
        document.getElementById('studentPassModal').style.display = 'none';
        document.getElementById('studentEnteredPass').value = '';
    };

    window.openAuthDrawer = function () {
        const drawer = document.getElementById('studentAuthDrawer');
        if (drawer) {
            drawer.style.display = 'flex';
            setTimeout(() => {
                drawer.classList.add('active');
                const content = drawer.querySelector('.auth-drawer-content');
                if (content) {
                    content.style.transform = 'translateY(0)';
                    content.style.opacity = '1';
                }
            }, 10);
        }
    };

    function validateSignupForm() {
        const getEl = (id) => document.getElementById(id);

        const fields = {
            email: getEl('regEmail'),
            emailConfirm: getEl('regEmailConfirm'),
            pass: getEl('regPass'),
            passConfirm: getEl('regPassConfirm'),
            gender: getEl('regGender'),
            level: getEl('regLevel'),
            group: getEl('regGroup'),
            name: getEl('regFullName'),
            btn: getEl('btnDoSignup')
        };

        if (!fields.btn) return;

        const val = {
            email: fields.email.value.trim(),
            emailConfirm: fields.emailConfirm.value.trim(),
            pass: fields.pass.value,
            passConfirm: fields.passConfirm.value,
            gender: fields.gender.value,
            level: fields.level.value,
            group: fields.group.value.trim(),
            name: fields.name.value
        };

        const isEmailsMatch = val.email === val.emailConfirm && val.email !== "";
        const isPassMatch = val.pass === val.passConfirm && val.pass.length >= 6;
        const isLevelSelected = val.level !== "";
        const isGenderSelected = val.gender !== "";
        const isGroupValid = val.group !== "" && val.group.toUpperCase().startsWith('G');
        const isNameFetched = val.name !== "" && !val.name.includes("غير مسجل");

        const isFormReady = isEmailsMatch && isPassMatch && isLevelSelected && isGenderSelected && isGroupValid && isNameFetched;

        if (isFormReady) {
            fields.btn.disabled = false;
            fields.btn.style.opacity = "1";
            fields.btn.style.cursor = "pointer";
        } else {
            fields.btn.disabled = true;
            fields.btn.style.opacity = "0.5";
            fields.btn.style.cursor = "not-allowed";
        }
    }

    window.validateSignupForm = validateSignupForm;

    window.toggleDropdown = function (listId) {
        const list = document.getElementById(listId);
        document.querySelectorAll('.dropdown-list').forEach(el => {
            if (el.id !== listId) el.classList.remove('show');
        });
        list.classList.toggle('show');
    };

    window.selectOption = function (type, value, text) {
        const hiddenInput = document.getElementById('reg' + type);
        if (hiddenInput) {
            hiddenInput.value = value;
        }

        const parentDiv = document.getElementById('dropdown' + type);
        if (parentDiv) {
            parentDiv.classList.add('selected-active');
        }

        const listUl = document.getElementById('list' + type);
        if (listUl) {
            listUl.classList.remove('show');
        }

        if (typeof validateSignupForm === 'function') {
            validateSignupForm();
        }
    };
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.custom-dropdown')) {
            document.querySelectorAll('.dropdown-list').forEach(el => el.classList.remove('show'));
        }
    });

    const AVATAR_ASSETS = {
        "Male": [
            'fa-user-tie', 'fa-user-graduate', 'fa-user-doctor', 'fa-user-astronaut',
            'fa-user-ninja', 'fa-user-secret', 'fa-user-crown',
            'fa-person-biking', 'fa-person-skating', 'fa-person-snowboarding', 'fa-person-swimming',
            'fa-robot', 'fa-ghost', 'fa-dragon', 'fa-gamepad', 'fa-headset',
            'fa-guitar', 'fa-rocket', 'fa-bolt', 'fa-fire'
        ],
        "Female": [
            'fa-user-nurse', 'fa-user-graduate', 'fa-user-doctor',
            'fa-person-dress', 'fa-person-praying', 'fa-person-hiking', 'fa-person-skiing',
            'fa-cat', 'fa-dove', 'fa-gem', 'fa-wand-magic-sparkles',
            'fa-camera-retro', 'fa-palette', 'fa-mug-hot', 'fa-leaf',
            'fa-heart', 'fa-star', 'fa-crown'
        ]
    };

    const AVATAR_COLORS = [
        '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
        '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'
    ];


    window.smartFetch = async function (collectionName, docId, renderCallback) {
        const cacheKey = `sys_cache_${collectionName}_${docId}`;

        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            try {
                renderCallback(JSON.parse(cachedData), true);
            } catch (e) { console.log("Cache Parse Error"); }
        }

        try {
            const docRef = doc(db, collectionName, docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                let freshData = docSnap.data();

                if (collectionName === "user_registrations") {
                    const user = auth.currentUser;
                    if (user && user.uid === docId) {
                        try {
                            const sensitiveRef = doc(db, "user_registrations", docId, "sensitive_info", "main");
                            const sensitiveSnap = await getDoc(sensitiveRef);

                            if (sensitiveSnap.exists()) {
                                freshData = { ...freshData, ...sensitiveSnap.data() };
                            }
                        } catch (err) {
                            console.log("Skipping sensitive info (Permission or Network issue)");
                        }
                    }
                }

                localStorage.setItem(cacheKey, JSON.stringify(freshData));

                if (cachedData !== JSON.stringify(freshData)) {
                    renderCallback(freshData, false);
                }
            }
        } catch (e) {
            console.log("Offline mode active / Network Error.");
        }
    };

    window.openStudentProfile = async function () {
        const user = auth.currentUser;

        const infoBtn = document.getElementById('infoBtn');
        if (infoBtn) infoBtn.style.display = 'none';

        if (!user) {
            showToast("⚠️ يرجى تسجيل الدخول أولاً", 3000, "#f59e0b");
            return;
        }

        const modal = document.getElementById('studentProfileModal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
        }

        const statusInput = document.getElementById('studentStatusInput');
        if (statusInput) statusInput.value = "";

        const renderData = (data, isCached) => {
            const info = data.registrationInfo || data;

            document.getElementById('profFullName').innerText = info.fullName || "--";
            document.getElementById('profStudentID').innerText = info.studentID || "--";
            document.getElementById('profLevel').innerText = `الفرقة ${info.level || '?'}`;
            document.getElementById('profGender').innerText = info.gender || "--";
            document.getElementById('profEmail').innerText = info.email || "--";
            document.getElementById('profUID').innerText = data.uid || user.uid;

            if (statusInput && data.status_message) {
                statusInput.value = data.status_message;
            }

            const currentAvatarEl = document.getElementById('currentAvatar');
            if (currentAvatarEl) {
                const iconClass = data.avatarClass || info.avatarClass || "fa-user-graduate";
                currentAvatarEl.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
                currentAvatarEl.style.color = "var(--primary-dark)";
            }
        };

        smartFetch("user_registrations", user.uid, renderData);
    };
    window.openAvatarSelector = async function () {
        const user = auth.currentUser;
        if (!user) return;

        const grid = document.getElementById('avatarsGrid');
        if (!grid) {
            console.error("Error: Element 'avatarsGrid' not found!");
            return;
        }

        let gender = "Male";
        try {
            const docSnap = await getDoc(doc(db, "user_registrations", user.uid));
            if (docSnap.exists()) {
                const info = docSnap.data().registrationInfo || docSnap.data();
                if (info.gender) gender = info.gender;
            }
        } catch (e) { console.log("Gender default: Male"); }

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
        if (modal) {
            modal.style.zIndex = "2147483647";
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
        }
    };

    window.saveNewAvatar = async function (iconClass, color) {
        const user = auth.currentUser;
        if (!user) return;

        const studentAvatar = document.getElementById('currentAvatar');
        const facultyAvatar = document.getElementById('facCurrentAvatar');

        [studentAvatar, facultyAvatar].forEach(el => {
            if (el) {
                el.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
                if (color) {
                    el.style.color = color;
                    el.style.borderColor = color;
                    el.style.backgroundColor = color + '10';
                }
            }
        });

        document.getElementById('avatarSelectorModal').style.display = 'none';

        try {
            let collectionName = "user_registrations";

            const facRef = doc(db, "faculty_members", user.uid);
            const facSnap = await getDoc(facRef);

            if (facSnap.exists()) {
                collectionName = "faculty_members";
            }

            await setDoc(doc(db, collectionName, user.uid), {
                avatarClass: iconClass
            }, { merge: true });

            const cached = localStorage.getItem('cached_profile_data');
            if (cached) {
                let cacheObj = JSON.parse(cached);
                if (cacheObj.uid === user.uid) {
                    cacheObj.avatarClass = iconClass; // تحديث الصورة في الكاش
                    localStorage.setItem('cached_profile_data', JSON.stringify(cacheObj));
                }
            }

            showToast("✅ تم تحديث صورتك بنجاح", 2000, "#10b981");

        } catch (e) {
            console.error("Save Avatar Error:", e);
            showToast("❌ فشل حفظ التغييرات", 3000, "#ef4444");
        }
    };

    window.goToAdminLoginScreen = function () {
        document.getElementById('adminGateModal').style.display = 'none';
        switchScreen('screenAdminLogin');
    };

    window.openDoctorSignup = function () {
        document.getElementById('adminGateModal').style.display = 'none';
        document.getElementById('doctorSignupModal').style.display = 'flex';
    };
    window.switchFacultyTab = function (tab) {
        const loginSec = document.getElementById('facultyLoginSection');
        const signupSec = document.getElementById('facultySignupSection');
        const tLogin = document.getElementById('tabLogin');
        const tSignup = document.getElementById('tabSignup');

        if (tab === 'signup') {
            loginSec.style.display = 'none';
            signupSec.style.display = 'block';
            tSignup.classList.add('active');
            tLogin.classList.remove('active');
        } else {
            signupSec.style.display = 'none';
            loginSec.style.display = 'block';
            tLogin.classList.add('active');
            tSignup.classList.remove('active');
        }
    };


    window.performFacultySignup = async function () {
        const name = document.getElementById('facName').value.trim();
        const gender = document.getElementById('facGender').value;
        const role = document.getElementById('facRole').value;
        const subject = document.getElementById('facSubject').value.trim();
        const email = document.getElementById('facEmail').value.trim();
        const emailConfirm = document.getElementById('facEmailConfirm').value.trim();
        const pass = document.getElementById('facPass').value;
        const passConfirm = document.getElementById('facPassConfirm').value;
        const masterKeyInput = document.getElementById('facMasterKey').value.trim();

        if (!name || !gender || !subject || !email || !pass || !masterKeyInput) {
            showToast("⚠️ Please fill all fields", 3000, "#f59e0b");
            return;
        }
        if (email !== emailConfirm) { showToast("❌ Emails do not match", 3000, "#ef4444"); return; }
        if (pass !== passConfirm) { showToast("❌ Passwords do not match", 3000, "#ef4444"); return; }

        try {
            const keysDoc = await getDoc(doc(db, "system_keys", "registration_keys"));

            if (!keysDoc.exists()) {
                showToast("🚫 System error: Keys not found", 4000, "#ef4444");
                return;
            }

            const serverKeys = keysDoc.data();
            let isKeyValid = false;

            if (role === "doctor" && masterKeyInput === serverKeys.doctor_key) {
                isKeyValid = true;
            } else if (role === "dean" && masterKeyInput === serverKeys.dean_key) {
                isKeyValid = true;
            }

            if (!isKeyValid) {
                showToast("🚫 Invalid Authorization Code!", 4000, "#ef4444");
                return;
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            await sendEmailVerification(user);

            await setDoc(doc(db, "faculty_members", user.uid), {
                fullName: name,
                gender: gender,
                role: role,
                subject: subject,
                email: email,
                isVerified: false,
                registeredAt: serverTimestamp()
            });

            const roleText = (role === "dean") ? "Dean" : "Faculty Member";

            alert(`✅ Registered as ${roleText}!\n\n📧 A verification link has been sent to your email. Please verify your account before logging in.`);

            if (typeof switchFacultyTab === 'function') switchFacultyTab('login');

        } catch (error) {
            console.error("Signup Error:", error);
            let msg = "Error during registration";
            if (error.code === 'auth/email-already-in-use') msg = "This email is already registered";
            showToast("❌ " + msg, 3000, "#ef4444");
        }
    };

    window.performFacultyLogin = async function () {
        const email = document.getElementById('facLoginEmail').value.trim();
        const pass = document.getElementById('facLoginPass').value;

        const btn = document.querySelector('#facultyLoginSection .glass-btn-submit');
        const facultyModal = document.getElementById('facultyGateModal');

        if (!email || !pass) {
            showToast("⚠️ Please enter email and password", 3000, "#f59e0b");
            return;
        }

        let originalText = "SIGN IN";
        if (btn) {
            originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...';
            btn.disabled = true;
        }

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            const pIcon = document.getElementById('profileIconImg');
            const pWrap = document.getElementById('profileIconWrapper');
            const pDot = document.getElementById('userStatusDot');

            if (pIcon) pIcon.className = "fa-solid fa-user-doctor fa-bounce";
            if (pWrap) pWrap.style.background = "linear-gradient(135deg, #0f172a, #1e293b)";
            if (pDot) {
                pDot.style.background = "#0ea5e9";
                pDot.style.boxShadow = "0 0 10px #0ea5e9";
            }

            await user.reload();

            if (!user.emailVerified) {
                showToast("!Please verify your email first 📧", 5000, "#f59e0b");
                await signOut(auth);
                if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
                return;
            }

            const facRef = doc(db, "faculty_members", user.uid);
            const facSnap = await getDoc(facRef);

            if (facSnap.exists()) {
                const userData = facSnap.data();

                const profileCache = {
                    fullName: userData.fullName,
                    email: userData.email,
                    role: userData.role,
                    subject: userData.subject,
                    avatarClass: userData.avatarClass || "fa-user-doctor",
                    uid: user.uid,
                    type: 'faculty'
                };
                localStorage.setItem('cached_profile_data', JSON.stringify(profileCache));

                if (userData.role === "dean") {
                    sessionStorage.setItem("secure_admin_session_token_v99", "SUPER_ADMIN_ACTIVE");
                    showToast("👑 Welcome, Dean " + userData.fullName, 4000, "#7c3aed");
                } else {
                    sessionStorage.setItem("secure_admin_session_token_v99", "ADMIN_ACTIVE");
                    showToast("👨‍🏫 Welcome, Dr. " + userData.fullName, 3000, "#10b981");
                }

                if (facultyModal) facultyModal.style.display = 'none';
                if (typeof updateUIForMode === 'function') updateUIForMode();

            } else {
                showToast("🚫 Access Denied: This portal is for Faculty only", 5000, "#ef4444");
                await signOut(auth);
                sessionStorage.removeItem("secure_admin_session_token_v99");
                if (typeof updateUIForMode === 'function') updateUIForMode();
            }

        } catch (error) {
            console.error("Login Error:", error);
            let errorMsg = "❌ Invalid email or password";
            if (error.code === 'auth/user-not-found') errorMsg = "❌ Account not found";
            if (error.code === 'auth/wrong-password') errorMsg = "❌ Incorrect password";
            showToast(errorMsg, 3000, "#ef4444");
        } finally {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    };
    window.togglePasswordVisibility = function (inputId = 'adminPassword', iconElement = null) {
        const passInput = document.getElementById(inputId);

        const icon = iconElement || document.getElementById('eyeIcon');

        if (!passInput || !icon) return;

        if (passInput.type === 'password') {
            passInput.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
            icon.style.color = '#0ea5e9'; // أزرق عند الإظهار
        } else {
            passInput.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
            icon.style.color = '#94a3b8'; // رمادي عند الإخفاء
        }
    };

    window.openFacultyProfile = async function () {
        const user = auth.currentUser;
        if (!user) {
            showToast("⚠️ Please login first", 3000, "#f59e0b");
            return;
        }

        const modal = document.getElementById('facultyProfileModal');
        modal.style.display = 'flex';

        const cachedData = localStorage.getItem('cached_profile_data');
        let dataLoaded = false;

        const statusInput = modal.querySelector('#facultyStatusInput');
        if (statusInput) statusInput.value = "";

        if (cachedData) {
            try {
                const data = JSON.parse(cachedData);
                if (data.uid === user.uid && data.type === 'faculty') {
                    document.getElementById('profFacName').innerText = data.fullName;
                    document.getElementById('profFacRole').innerText = (data.role === "dean") ? "👑 Vice Dean / Dean" : "👨‍🏫 Doctor / Professor";
                    document.getElementById('profFacSubject').innerText = data.subject;
                    document.getElementById('profFacEmail').innerText = data.email;
                    document.getElementById('profFacUID').innerText = data.uid;

                    const avatarEl = document.getElementById('facCurrentAvatar');
                    avatarEl.innerHTML = `<i class="fa-solid ${data.avatarClass}"></i>`;
                    avatarEl.style.color = "#0ea5e9";

                    if (statusInput) statusInput.value = data.status_message || "";

                    dataLoaded = true;
                }
            } catch (e) { console.log("Cache error"); }
        }

        if (!dataLoaded) {
            document.getElementById('profFacName').innerText = "Loading...";
        }

        try {
            const docRef = doc(db, "faculty_members", user.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();

                document.getElementById('profFacName').innerText = data.fullName || "Faculty Member";
                document.getElementById('profFacRole').innerText = (data.role === "dean") ? "👑 Vice Dean / Dean" : "👨‍🏫 Doctor / Professor";
                document.getElementById('profFacSubject').innerText = data.subject || "Not Assigned";

                if (statusInput) statusInput.value = data.status_message || "";

                const avatarEl = document.getElementById('facCurrentAvatar');
                if (data.avatarClass) {
                    avatarEl.innerHTML = `<i class="fa-solid ${data.avatarClass}"></i>`;
                    avatarEl.style.color = "#0ea5e9";
                }

                const newCache = {
                    fullName: data.fullName,
                    email: user.email,
                    role: data.role,
                    subject: data.subject,
                    avatarClass: data.avatarClass || "fa-user-doctor",
                    uid: user.uid,
                    type: 'faculty',
                    status_message: data.status_message || ""
                };
                localStorage.setItem('cached_profile_data', JSON.stringify(newCache));
            }
        } catch (e) {
            console.error("Sync Error:", e);
        }
    };
    function generateSessionCode() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    window.updateStudentStatus = async function (docId, newStatus) {
        const user = auth.currentUser;
        if (!user) return;
        if (newStatus === 'expelled' && !confirm("⚠️ هل أنت متأكد من طرد هذا الطالب؟")) return;

        const studentRef = doc(db, "active_sessions", user.uid, "participants", docId);

        try {
            await updateDoc(studentRef, { status: newStatus });
        } catch (e) {
            console.error("Error updating status:", e);
        }
    };

    window.toggleStudentFlag = async function (docId, field, currentValue) {
        const user = auth.currentUser;
        if (!user) return;

        // 🔥 التعديل: المسار الجديد
        const studentRef = doc(db, "active_sessions", user.uid, "participants", docId);

        try {
            await updateDoc(studentRef, { [field]: !currentValue });
        } catch (e) {
            console.error("Error toggling flag:", e);
        }
    };
    let unsubscribeLiveSnapshot = null;

    window.startLiveSnapshotListener = function () {
        const user = auth.currentUser;
        if (!user) {
            console.log("⏳ Waiting for Auth to initialize...");
            setTimeout(window.startLiveSnapshotListener, 500);
            return;
        }

        const grid = document.getElementById('liveStudentsGrid');

        const countEl = document.getElementById('livePresentCount');
        const extraEl = document.getElementById('liveExtraCount');

        const capacityLabel = extraEl?.parentElement?.querySelector('.stat-label') || document.querySelector("label[for='liveExtraCount']");
        if (capacityLabel) capacityLabel.innerText = "CAPACITY STATUS";

        const adminToken = sessionStorage.getItem("secure_admin_session_token_v99");
        const isDean = (adminToken === "SUPER_ADMIN_ACTIVE");
        const isDoctor = (adminToken === "ADMIN_ACTIVE");
        if (grid) {
            if (isDoctor || isDean) {
                grid.style.setProperty('display', 'grid', 'important');
                grid.style.setProperty('grid-template-columns', '1fr 1fr', 'important');
                grid.style.setProperty('gap', '10px', 'important');
            } else {
                grid.style.removeProperty('grid-template-columns');
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
        onSnapshot(sessionRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = data.doctorName || "Professor";
                if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = data.allowedSubject || "Subject";
                if (document.getElementById('liveHallTag')) document.getElementById('liveHallTag').innerHTML = `<i class="fa-solid fa-building-columns"></i> ${data.hall || "Hall"}`;
                if (document.getElementById('liveGroupTag')) document.getElementById('liveGroupTag').innerText = `GROUPS: ${(data.targetGroups || []).join(', ')}`;

                const avatarLink = document.getElementById('liveDocAvatar');
                if (avatarLink) {
                    avatarLink.innerHTML = `<i class="fa-solid ${data.doctorAvatar || 'fa-user-doctor'}"></i>`;
                    avatarLink.onclick = () => openPublicProfile(targetRoomUID, true);
                    avatarLink.style.cursor = "pointer";
                }
                const nameLink = document.getElementById('liveDocName');
                if (nameLink) {
                    nameLink.onclick = () => openPublicProfile(targetRoomUID, true);
                    nameLink.style.cursor = "pointer";
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
                updateCapacityUI();

                if (!data.isActive && !isDoctor && !isDean) {
                    showToast("🏁 انتهت المحاضرة", 4000, "#10b981");
                    setTimeout(() => { goHome(); location.reload(); }, 1500);
                }
            }
        });

        const participantsRef = collection(db, "active_sessions", targetRoomUID, "participants");
        const q = query(participantsRef, orderBy("timestamp", "desc"));

        if (window.unsubscribeLiveSnapshot) window.unsubscribeLiveSnapshot();

        window.unsubscribeLiveSnapshot = onSnapshot(q, (snapshot) => {
            const activeDocs = snapshot.docs.filter(d => d.data().status === 'active');

            currentCount = activeDocs.length;
            if (countEl) countEl.innerText = currentCount;

            updateCapacityUI();

            if (grid) {
                grid.innerHTML = '';
                snapshot.forEach(docSnap => {
                    const s = docSnap.data();
                    if (s.status === 'expelled') return;

                    const card = document.createElement('div');

                    const isOnBreak = s.status === 'on_break';
                    const isLeft = s.status === 'left';

                    const opacityVal = (isLeft || isOnBreak) ? '0.5' : '1';

                    const borderStyle = isOnBreak ? '2px dashed #f59e0b' : '1px solid #e2e8f0';

                    const rawCount = s.segment_count;
                    const segCount = (rawCount && !isNaN(rawCount)) ? parseInt(rawCount) : 1;

                    let countBadge = '';

                    if (segCount > 1) {
                        let badgeColor = isOnBreak ? '#64748b' : '#0ea5e9';

                        countBadge = `
                        <div style="
                            position: absolute; 
                            top: -10px; 
                            left: -10px; 
                            background: ${badgeColor}; 
                            color: white; 
                            font-family: 'Outfit', sans-serif;
                            font-size: 11px; 
                            font-weight: 800; 
                            width: 26px; 
                            height: 26px; 
                            border-radius: 50%; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            border: 3px solid #f8fafc; 
                            z-index: 100; 
                            box-shadow: 0 4px 6px rgba(0,0,0,0.15);
                            animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                        ">
                            ${segCount}
                        </div>`;
                    }

                    const clickAction = `onclick="event.stopPropagation(); openPublicProfile('${s.uid || s.id}', false)"`;

                    if (isDoctor || isDean) {
                        const trap = s.trap_report || { device_match: true, in_range: true, gps_success: true };

                        const deviceIcon = trap.device_match ? `<div title="جهاز أصلي" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-mobile-screen" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="جهاز مختلف" style="background:#fee2e2; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; animation: shake 0.5s infinite;"><i class="fa-solid fa-mobile-screen-button" style="color:#dc2626; font-size:14px;"></i></div>`;
                        const rangeIcon = trap.in_range ? `<div title="داخل النطاق" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-location-dot" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="خارج النطاق" style="background:#fee2e2; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-location-crosshairs" style="color:#dc2626; font-size:14px;"></i></div>`;
                        const gpsIcon = trap.gps_success ? `<div title="GPS نشط" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-satellite-dish" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="فشل GPS" style="background:#f1f5f9; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-satellite-dish" style="color:#94a3b8; font-size:14px;"></i></div>`;

                        const badgesHTML = `<div style="display:flex; justify-content:center; gap:8px; margin-top:6px; border-top:1px dashed #e2e8f0; padding-top:6px; width:100%;">${deviceIcon} ${rangeIcon} ${gpsIcon}</div>`;
                        const leaveIcon = isLeft ? 'fa-arrow-rotate-left' : 'fa-person-walking-arrow-right';

                        card.className = `live-st-card admin-view-card`;

                        card.style.cssText = `
                            background: #ffffff; 
                            border-radius: 18px; 
                            border: ${borderStyle}; 
                            padding: 16px; 
                            display: flex; 
                            flex-direction: column; 
                            justify-content: space-between; 
                            gap: 5px; 
                            box-shadow: 0 4px 10px rgba(206, 99, 38, 0.03); 
                            height: auto; 
                            min-height: 220px; 
                            
                            width: 100%;  /* ✅✅✅ لازم تكون 100% مش 150% */
                            
                            position: relative;
                            overflow: visible !important; 
                            opacity: ${opacityVal}; 
                            transition: all 0.3s ease;
                        `;

                        card.innerHTML = `
                            ${countBadge}
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <div ${clickAction} style="cursor:pointer; width:55px; height:55px; border-radius:50%; background:#f8fafc; display:flex; align-items:center; justify-content:center; font-size:24px; color:#0ea5e9; border:2.5px solid ${s.isUnruly ? '#ef4444' : (s.isUniformViolation ? '#f97316' : '#e2e8f0')};">
                                    <i class="fa-solid ${s.avatarClass || 'fa-user'}"></i>
                                </div>
                                <div ${clickAction} class="st-name" style="cursor:pointer; font-size:12px; font-weight:800; color:#0f172a; margin-top:5px; text-decoration:none;">${s.name}</div>
                                <div class="st-id en-font" style="font-size:10px; color:#64748b; background:#f1f5f9; padding:1px 8px; border-radius:10px;">#${s.id}</div>
                                ${badgesHTML}
                            </div>
                            <div style="display:flex; justify-content:center; gap:5px; border-top:1px solid #f1f5f9; padding-top:8px;">
                                <button onclick="toggleStudentFlag('${docSnap.id}', 'isUniformViolation', ${s.isUniformViolation})" class="mini-action-btn" style="background:${s.isUniformViolation ? '#f97316' : '#fff7ed'}; color:${s.isUniformViolation ? 'white' : '#ea580c'};"><i class="fa-solid fa-shirt"></i></button>
                                <button onclick="toggleStudentFlag('${docSnap.id}', 'isUnruly', ${s.isUnruly})" class="mini-action-btn" style="background:${s.isUnruly ? '#ef4444' : '#fef2f2'}; color:${s.isUnruly ? 'white' : '#ef4444'};"><i class="fa-solid fa-fire"></i></button>
                                <button onclick="toggleStudentStatus('${docSnap.id}', '${s.status}')" class="mini-action-btn" style="background:#f8fafc; color:#64748b;"><i class="fa-solid ${leaveIcon}"></i></button>
                                <button onclick="updateStudentStatus('${docSnap.id}', 'expelled')" class="mini-action-btn" style="background:#fee2e2; color:#b91c1c;"><i class="fa-solid fa-ban"></i></button>
                            </div>`;
                    } else {
                        const isMe = (user.uid === s.uid);
                        if (isMe) card.classList.add('is-me-card');
                        card.className = 'live-st-card student-view-card';
                        let statusColor = isLeft ? "#94a3b8" : (s.isUnruly ? "#ef4444" : (s.isUniformViolation ? "#f97316" : "#10b981"));
                        let statusText = isLeft ? "مغادر" : (s.isUnruly ? "مشاغب" : (s.isUniformViolation ? "مخالف" : "حاضر"));

                        card.style.cssText = `
                            background:white; 
                            border-radius:15px; 
                            padding:10px; 
                            display:flex; 
                            flex-direction:column; 
                            align-items:center; 
                            opacity:${opacityVal}; 
                            transition:0.3s; 
                            width:100%; 
                            border: ${borderStyle}; 
                            position: relative;
                            overflow: visible !important; 
                        `;

                        card.innerHTML = `
                        ${isMe ? '<div class="me-badge">أنت</div>' : ''}
                            ${countBadge}
                            <div ${clickAction} style="cursor:pointer; width:55px; height:55px; border-radius:50%; background:#f8fafc; border:3.5px solid ${statusColor}; display:flex; align-items:center; justify-content:center; font-size:24px; color:#0284c7; margin-bottom:5px; z-index:2;">
                                <i class="fa-solid ${s.avatarClass || 'fa-user-graduate'}"></i>
                            </div>
                            <div style="text-align:center;">
                                <div ${clickAction} class="st-name" style="cursor:pointer; font-size:13px; font-weight:900; color:#1e293b; text-decoration:none;">${s.name.split(' ')[0]} ${s.name.split(' ')[1] || ''}</div>
                                <div class="st-id en-font" style="font-size:10px; color:#64748b;">#${s.id}</div>
                                
                            </div>
                            </div>
                            <div style="margin-top:8px; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:800; border:1px solid ${statusColor}30; background:${statusColor}15; color:${statusColor};">
                                ${statusText}
                            </div>`;
                    }
                    grid.appendChild(card);
                });
            }
        });
    };
    window.toggleStudentStatus = async function (docId, currentStatus) {
        const user = auth.currentUser;
        if (!user) return;

        const newStatus = currentStatus === 'left' ? 'active' : 'left';
        const studentRef = doc(db, "active_sessions", user.uid, "participants", docId);

        try {
            await updateDoc(studentRef, { status: newStatus });
            if (navigator.vibrate) navigator.vibrate(15);
        } catch (e) { console.error("Error toggling status:", e); }
    };
    window.kickStudent = async function (docId, studentName) {
        if (confirm(`Expel ${studentName} from this session?`)) {
            await updateDoc(doc(db, "live_session_participants", docId), {
                status: "expelled"
            });
            showToast(`🚫 ${studentName} has been expelled.`, 3000, "#ef4444");
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
    window.updateUIForMode = function () {
        // 1. تحديد الصلاحيات
        const adminToken = sessionStorage.getItem("secure_admin_session_token_v99");
        const isDean = (adminToken === "SUPER_ADMIN_ACTIVE");
        const isDoctor = (adminToken === "ADMIN_ACTIVE");
        const isStaff = isDean || isDoctor;

        // 2. تحديث كلاسات الـ Body
        document.body.classList.remove('is-dean', 'is-doctor', 'is-student');

        if (isDean) {
            document.body.classList.add('is-dean');
            console.log("🛡️ Current Identity: DEAN (Oversight Mode)");
        } else if (isDoctor) {
            document.body.classList.add('is-doctor');
            console.log("👨‍🏫 Current Identity: DOCTOR (Control Mode)");
        } else {
            document.body.classList.add('is-student');
            console.log("🎓 Current Identity: STUDENT/GUEST");
        }

        // 3. تعريف جميع العناصر (القديمة والجديدة)
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

        // 🔥 [جديد] تعريف زر النجمة
        const btnFeed = document.getElementById('btnLiveFeedback');

        // 4. منطق الموظفين (دكاترة وعميد)
        if (isStaff) {
            // إظهار العناصر المشتركة للموظفين
            if (facultyProfileBtn) facultyProfileBtn.style.display = 'flex';
            if (btnDataEntry) btnDataEntry.style.display = 'flex';
            if (reportBtn) reportBtn.classList.remove('locked');

            // إخفاء عناصر الطلاب
            if (studentProfileBtn) studentProfileBtn.style.display = 'none';
            if (mainActionBtn) mainActionBtn.style.display = 'none';
            if (makaniBar) makaniBar.style.display = 'none';

            // --- تفريع: هل هو دكتور أم عميد؟ ---
            if (isDoctor) {
                console.log("✅ وضع الدكتور: إظهار أزرار التحكم");

                // إظهار أزرار الدكتور الخاصة
                if (sessionBtn) sessionBtn.style.setProperty('display', 'flex', 'important');
                if (quickModeBtn) quickModeBtn.style.setProperty('display', 'flex', 'important');
                if (toolsBtn) toolsBtn.style.setProperty('display', 'flex', 'important');

                // إخفاء منطقة العميد
                if (deanZone) deanZone.style.setProperty('display', 'none', 'important');

                // 🔥 [جديد] إظهار زر النجمة وتشغيل الرادار للدكتور
                if (btnFeed) {
                    btnFeed.style.setProperty('display', 'flex', 'important');

                    // تشغيل دالة الاستماع للتقييمات (لو موجودة)
                    if (typeof window.initFeedbackListener === 'function') {
                        window.initFeedbackListener();
                    }
                }

            } else {
                // هذا يعني أنه عميد (Dean)
                console.log("🛡️ وضع العميد: إخفاء أزرار التحكم");

                // إخفاء أزرار الدكتور
                if (sessionBtn) sessionBtn.style.setProperty('display', 'none', 'important');
                if (quickModeBtn) quickModeBtn.style.setProperty('display', 'none', 'important');
                if (toolsBtn) toolsBtn.style.setProperty('display', 'none', 'important');

                // إظهار منطقة العميد
                if (deanZone) deanZone.style.setProperty('display', 'block', 'important');

                // 🔥 [جديد] إخفاء زر النجمة عن العميد
                if (btnFeed) btnFeed.style.setProperty('display', 'none', 'important');
            }
        }
        // 5. منطق الطلاب (Student)
        else {
            console.log("🎓 وضع الطالب: إخفاء أدوات الإدارة");

            const adminElements = [
                sessionBtn, quickModeBtn, toolsBtn, deanZone,
                btnDataEntry, facultyProfileBtn,
            ];

            // إخفاء كل عناصر الإدارة
            adminElements.forEach(el => {
                if (el) el.style.setProperty('display', 'none', 'important');
            });

            // 🔥 [جديد] إخفاء زر النجمة عن الطالب
            if (btnFeed) btnFeed.style.setProperty('display', 'none', 'important');

            // تنظيف: إيقاف استهلاك النت للتقييمات عند الطالب
            if (window.feedbackUnsubscribe) {
                window.feedbackUnsubscribe();
                window.feedbackUnsubscribe = null;
            }

            // إظهار عناصر الطالب
            if (mainActionBtn) mainActionBtn.style.display = 'flex';
            if (makaniBar) makaniBar.style.display = 'block';
            if (studentProfileBtn) studentProfileBtn.style.display = 'flex';
            if (reportBtn) reportBtn.classList.add('locked');
        }

        // 6. تحديث اللغة (كما في الكود القديم)
        const savedLang = localStorage.getItem('sys_lang') || 'ar';
        if (typeof changeLanguage === 'function') {
            changeLanguage(savedLang);
        }
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

    window.openDeanReports = function () {
        playClick();
        document.getElementById('deanReportsModal').style.display = 'flex';
        const now = new Date();
        document.getElementById('reportEndDate').valueAsDate = now;
        document.getElementById('reportStartDate').valueAsDate = new Date(now.getFullYear(), now.getMonth(), 1);
    };

    let chartsInstances = {};

    window.generateDeanAnalytics = async function () {
        const startVal = document.getElementById('reportStartDate').value;
        const endVal = document.getElementById('reportEndDate').value;
        const btn = document.querySelector('.btn-dash-run');

        if (!startVal || !endVal) return showToast("⚠️ حدد الفترة الزمنية", 2000, "#f59e0b");

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري المعالجة...';
        btn.disabled = true;

        try {
            const startDate = new Date(startVal);
            const endDate = new Date(endVal);
            endDate.setHours(23, 59, 59, 999);

            const [attSnap, feedbackSnap, toolsSnap] = await Promise.all([
                getDocs(query(collection(db, "attendance"))),
                getDocs(query(collection(db, "feedback_reports"))),
                getDocs(query(collection(db, "tool_requests")))
            ]);

            let totalAttendance = 0;
            let subjectsCount = {}; // { "Anatomy": 50, "Micro": 30 }
            let daysCount = { "Saturday": 0, "Sunday": 0, "Monday": 0, "Tuesday": 0, "Wednesday": 0, "Thursday": 0, "Friday": 0 };
            const arDays = { "Saturday": "السبت", "Sunday": "الأحد", "Monday": "الاثنين", "Tuesday": "الثلاثاء", "Wednesday": "الأربعاء", "Thursday": "الخميس", "Friday": "الجمعة" };

            attSnap.forEach(doc => {
                const d = doc.data();
                const parts = d.date.split('/');
                const recDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);

                if (recDate >= startDate && recDate <= endDate) {
                    totalAttendance++;

                    const sub = d.subject || "غير محدد";
                    subjectsCount[sub] = (subjectsCount[sub] || 0) + 1;

                    const dayName = recDate.toLocaleDateString('en-US', { weekday: 'long' });
                    if (daysCount[dayName] !== undefined) daysCount[dayName]++;
                }
            });

            let doctorRatings = {}; // { "Dr. Ahmed": {sum: 15, count: 3} }

            feedbackSnap.forEach(doc => {
                const d = doc.data();
                const recDate = d.timestamp ? d.timestamp.toDate() : new Date();

                if (recDate >= startDate && recDate <= endDate) {
                    const drName = d.doctorName || "Unknown";
                    if (!doctorRatings[drName]) doctorRatings[drName] = { sum: 0, count: 0 };

                    doctorRatings[drName].sum += (d.rating || 0);
                    doctorRatings[drName].count++;
                }
            });

            let finalRatings = {};
            let totalAvg = 0;
            let drCount = 0;
            for (let dr in doctorRatings) {
                finalRatings[dr] = (doctorRatings[dr].sum / doctorRatings[dr].count).toFixed(1);
                totalAvg += parseFloat(finalRatings[dr]);
                drCount++;
            }
            const globalAvg = drCount > 0 ? (totalAvg / drCount).toFixed(1) : "0.0";

            let toolsCount = {};
            let totalTools = 0;

            toolsSnap.forEach(doc => {
                const d = doc.data();
                const recDate = d.timestamp ? d.timestamp.toDate() : new Date();

                if (recDate >= startDate && recDate <= endDate) {
                    const toolName = d.tool_name || "أداة";
                    const qty = parseInt(d.quantity || 1);

                    toolsCount[toolName] = (toolsCount[toolName] || 0) + qty;
                    totalTools += qty;
                }
            });

            document.getElementById('totalAttVal').innerText = totalAttendance;
            document.getElementById('avgRatingVal').innerText = globalAvg + " / 5";
            document.getElementById('totalToolsVal').innerText = totalTools;
            document.getElementById('reportGenDate').innerText = new Date().toLocaleString('ar-EG');

            renderChart('subjectsChart', 'bar', 'حضور الطلاب للمواد', subjectsCount, '#0ea5e9');

            let arDaysData = {};
            for (let enDay in daysCount) arDaysData[arDays[enDay]] = daysCount[enDay];
            renderChart('daysChart', 'line', 'نشاط الحضور اليومي', arDaysData, '#8b5cf6');

            renderChart('ratingsChart', 'bar', 'تقييم الدكاترة (متوسط)', finalRatings, '#f59e0b');
            renderChart('toolsChart', 'doughnut', 'استهلاك الأدوات', toolsCount, ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6366f1']);

        } catch (e) {
            console.error("Analytics Error:", e);
            alert("حدث خطأ أثناء معالجة البيانات");
        } finally {
            btn.innerHTML = 'تحليل <i class="fa-solid fa-bolt"></i>';
            btn.disabled = false;
        }
    };

    function renderChart(canvasId, type, label, dataObj, color) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        const labels = Object.keys(dataObj);
        const dataValues = Object.values(dataObj);

        if (chartsInstances[canvasId]) {
            chartsInstances[canvasId].destroy();
        }

        let bgColors = color;
        if (Array.isArray(color)) {
            bgColors = color;
        } else {
            bgColors = labels.map(() => color);
        }

        chartsInstances[canvasId] = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: dataValues,
                    backgroundColor: bgColors,
                    borderColor: Array.isArray(color) ? '#fff' : color,
                    borderWidth: 1,
                    borderRadius: 5,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: type === 'doughnut' },
                },
                scales: type !== 'doughnut' ? {
                    y: { beginAtZero: true }
                } : {}
            }
        });
    }

    window.exportDashboard = async function (type) {
        const element = document.getElementById('dashboardContent');
        const btn = document.querySelector('.dash-actions');

        btn.style.display = 'none';

        try {
            const canvas = await html2canvas(element, { scale: 2 });

            if (type === 'image') {
                const link = document.createElement('a');
                link.download = 'تقرير_الكلية_الشامل.png';
                link.href = canvas.toDataURL();
                link.click();
            }
            else if (type === 'pdf') {
                const imgData = canvas.toDataURL('image/png');
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');
                const imgProps = pdf.getImageProperties(imgData);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                pdf.save('تقرير_الكلية_الشامل.pdf');
            }
            showToast("✅ تم التصدير بنجاح", 3000, "#10b981");
        } catch (e) {
            console.error(e);
            alert("خطأ في التصدير");
        } finally {
            btn.style.display = 'flex';
        }
    };

    function renderMiniList(containerId, dataArray, unit) {
        const cont = document.getElementById(containerId);
        cont.innerHTML = '';
        if (dataArray.length === 0) {
            cont.innerHTML = '<div style="padding:5px; color:#94a3b8;">لا توجد بيانات</div>';
            return;
        }
        dataArray.forEach(([key, val], index) => {
            cont.innerHTML += `
        <div class="mini-list-item">
            <span>${index + 1}. ${key}</span>
            <span style="font-weight:bold; color:#10b981;">${val} ${unit}</span>
        </div>`;
        });
    }
    window.openToolsRequestModal = function () {
        playClick();
        const modal = document.getElementById('toolsRequestModal');
        const locSelect = document.getElementById('reqLocationSelect');

        locSelect.innerHTML = '<option value="" disabled selected>-- اختر المكان --</option>';

        let savedHalls = [];
        try {
            const stored = localStorage.getItem('hallsList_v4');
            if (stored) savedHalls = JSON.parse(stored);
            else savedHalls = ["037", "038", "039", "019", "025", "123", "124", "127", "131", "132", "133", "134", "231", "335", "121", "118", "E334", "E335", "E336", "E337", "E344", "E345", "E346", "E347", "E240", "E241", "E242", "E245", "E231", "E230", "E243", "E233", "E222", "E234"];
        } catch (e) {
            console.log("Error loading halls", e);
        }

        savedHalls.forEach(hall => {
            const opt = document.createElement('option');
            opt.value = hall;
            opt.text = hall;
            locSelect.appendChild(opt);
        });

        const currentHallText = document.getElementById('liveHallTag')?.innerText; // مثلاً "Hall: 037"
        if (currentHallText) {
            const cleanHall = currentHallText.replace(/Hall:|قاعة:|[^a-zA-Z0-9]/g, '').trim();

            for (let i = 0; i < locSelect.options.length; i++) {
                if (locSelect.options[i].value === cleanHall) {
                    locSelect.selectedIndex = i;
                    break;
                }
            }
        }

        modal.style.display = 'flex';
    };
    window.changeQty = function (amount) {
        const input = document.getElementById('reqToolQty');
        let currentVal = parseInt(input.value) || 0;

        let newVal = currentVal + amount;

        if (newVal < 1) newVal = 1;

        input.value = newVal;

        if (navigator.vibrate) navigator.vibrate(10);
    };

    window.toggleTimeInput = function (val) {
        const picker = document.getElementById('reqTimePicker');
        if (val === 'later') picker.style.display = 'block';
        else picker.style.display = 'none';
    };

    window.submitLogisticsRequest = async function () {
        const tool = document.getElementById('reqToolName').value.trim();
        const qty = document.getElementById('reqToolQty').value;
        const isUrgent = document.getElementById('urg_high').checked;
        const timingType = document.getElementById('reqTimingSelect').value;
        const specificTime = document.getElementById('reqSpecificTime').value;
        const location = document.getElementById('reqLocationSelect').value;

        const btn = document.querySelector('#toolsRequestModal .btn-main');

        if (!tool || !location) {
            showToast("⚠️ يرجى تحديد الأداة والمكان", 3000, "#f59e0b");
            return;
        }
        if (timingType === 'later' && !specificTime) {
            showToast("⚠️ يرجى تحديد الوقت المطلوب", 3000, "#f59e0b");
            return;
        }

        const user = auth.currentUser;
        const docName = document.getElementById('profFacName')?.innerText || "Doctor";

        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الإرسال...';
        btn.disabled = true;

        try {
            await addDoc(collection(db, "tool_requests"), {
                requester_uid: user.uid,
                requester_name: docName,
                tool_name: tool,
                quantity: qty,
                is_urgent: isUrgent,
                timing: timingType === 'now' ? "الآن (فوري)" : `لاحقاً الساعة ${specificTime}`,
                location_hall: location,
                status: "pending",
                timestamp: serverTimestamp()
            });

            playSuccess();
            showToast("✅ تم إرسال الطلب للإدارة الهندسية", 4000, "#15803d");
            document.getElementById('toolsRequestModal').style.display = 'none';

            document.getElementById('reqToolName').value = '';

        } catch (e) {
            console.error(e);
            showToast("❌ خطأ في الإرسال", 3000, "#ef4444");
        } finally {
            btn.innerHTML = 'إرسال الطلب <i class="fa-solid fa-paper-plane"></i>';
            btn.disabled = false;
        }
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
                if (icon) {
                    el.innerHTML = `${icon.outerHTML} <span class="btn-text-content">${newText}</span>`;
                } else {
                    el.innerText = newText;
                }
            } else {
                console.warn(`Translation key missing: "${key}" in language: "${lang}"`);
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(input => {
            const key = input.getAttribute('data-i18n-placeholder');
            const newPlaceholder = dict[key];
            if (newPlaceholder) {
                input.placeholder = newPlaceholder;
            }
        });

        localStorage.setItem('sys_lang', lang);
    };
    window.toggleSystemLanguage = async function () {
        const user = auth.currentUser;
        const currentLang = localStorage.getItem('sys_lang') || 'ar';
        const newLang = (currentLang === 'ar') ? 'en' : 'ar';

        changeLanguage(newLang);

        document.querySelectorAll('.active-lang-text-pro').forEach(span => {
            span.innerText = (newLang === 'ar') ? 'EN' : 'عربي';
        });

        if (user) {
            try {
                const isAdmin = !!sessionStorage.getItem("secure_admin_session_token_v99");
                const collectionName = isAdmin ? "faculty_members" : "user_registrations";

                await setDoc(doc(db, collectionName, user.uid), {
                    preferredLanguage: newLang
                }, { merge: true });

                console.log("Language saved to Server ✅");
            } catch (e) {
                console.warn("Language sync skipped (minor):", e.message);
            }
        }
    };

    window.forceOpenPinScreen = function () {
 
        const user = (typeof auth !== 'undefined') ? auth.currentUser : (window.auth ? window.auth.currentUser : null);

        if (!user) {
            console.log("⛔ Access Denied: Blocked attempt to access PIN screen without login.");

            if (typeof showToast === 'function') {
                showToast("⚠️ عذراً، يجب تسجيل الدخول أولاً", 3000, "#f59e0b");
            } else {
                alert("⚠️ يجب تسجيل الدخول أولاً");
            }

            if (typeof window.openAuthDrawer === 'function') {
                window.openAuthDrawer();
            }

            return;
        }
        console.log("🚀 Forcing PIN Screen (User Authenticated)...");

        document.querySelectorAll('.section').forEach(sec => {
            sec.style.display = 'none';
            sec.classList.remove('active');
        });

        const parentScreen = document.getElementById('screenDataEntry');
        if (parentScreen) {
            parentScreen.style.cssText = "display: block !important; opacity: 1 !important;";
            parentScreen.classList.add('active');
        }

        const step1 = document.getElementById('step1_search');
        const step2 = document.getElementById('step2_auth');
        const errorMsg = document.getElementById('screenError');

        if (step2) step2.style.setProperty('display', 'none', 'important');

        if (errorMsg) errorMsg.style.display = 'none';

        if (step1) {
            step1.style.cssText = "display: block !important; opacity: 1 !important; visibility: visible !important; width: 100%;";
        }

        setTimeout(() => {
            const input = document.getElementById('attendanceCode');
            if (input) input.focus();
        }, 150);
    };

    window.resetMainButtonUI = function () {
        const btn = document.getElementById('mainActionBtn');

        const lang = localStorage.getItem('sys_lang') || 'ar';

        const dict = (typeof i18n !== 'undefined') ? i18n[lang] : null;

        if (btn) {
            if (dict) {
                btn.innerHTML = `${dict.main_reg_btn} <i class="fa-solid fa-fingerprint"></i>`;
            }

            btn.onclick = function () {

                if (typeof window.forceOpenPinScreen === 'function') {

                    window.forceOpenPinScreen();
                } else {
                    window.startProcess(false);
                }
            };

            btn.style.pointerEvents = 'auto';
            btn.style.opacity = "1";
            btn.classList.remove('locked');
        }
    };

    window.selectStar = function (val) {
        const stars = document.querySelectorAll('.star-btn');
        const textField = document.getElementById('ratingText');
        const input = document.getElementById('selectedRating');

        input.value = val;

        // جلب النصوص من القاموس بناءً على اللغة الحالية
        const lang = localStorage.getItem('sys_lang') || 'ar';
        const dict = i18n[lang];

        const texts = [
            "",
            dict.rate_bad,
            dict.rate_poor,
            dict.rate_fair,
            dict.rate_good,
            dict.rate_excellent
        ];

        stars.forEach(star => {
            const starVal = parseInt(star.getAttribute('data-value'));
            if (starVal <= val) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });

        if (textField) {
            textField.innerText = texts[val];
            textField.style.animation = "none";
            setTimeout(() => textField.style.animation = "fadeIn 0.3s", 10);
        }

        if (navigator.vibrate) navigator.vibrate(20);
    };

    window.submitFeedback = async function () {
        const rating = document.getElementById('selectedRating').value;
        const docId = document.getElementById('targetAttendanceDocId').value; // ده مفتاح سجل الحضور
        const btn = document.querySelector('#feedbackModal .btn-main');

        if (rating == "0") {
            showToast("⚠️ من فضلك قيم بعدد النجوم", 2000, "#f59e0b");
            return;
        }

        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التوثيق...';
        btn.style.pointerEvents = 'none';

        try {
            const attRef = doc(db, "attendance", docId);
            const attSnap = await getDoc(attRef);

            if (!attSnap.exists()) { throw new Error("بيانات الحضور غير موجودة"); }

            const roomData = attSnap.data();

            const batch = writeBatch(db);

            batch.update(attRef, {
                feedback_status: "submitted",
                feedback_timestamp: serverTimestamp()
            });

            const reportRef = doc(collection(db, "feedback_reports"));

            batch.set(reportRef, {
                rating: parseInt(rating),
                comment: "", // ممكن تزود خانة ملاحظات لو حابب مستقبلاً
                timestamp: serverTimestamp(), // وقت التقييم الفعلي

                doctorName: roomData.doctorName,  // اسم الدكتور (للعرض)
                doctorUID: roomData.doctorUID,    // كود الدكتور (للفرز الدقيق) 🔥
                subject: roomData.subject,        // المادة

                hall: roomData.hall || "Unknown", // القاعة (ممكن التقييم السيء بسبب التكييف مثلاً)
                date: roomData.date,              // تاريخ المحاضرة

                studentId: roomData.id,
                studentLevel: "General" // ممكن تجيبها لو مخزنة
            });

            await batch.commit();

            document.getElementById('feedbackModal').style.display = 'none';
            showToast("✅ تم وصول تقييمك للإدارة بخصوصية تامة.", 3000, "#10b981");

            setTimeout(() => window.checkForPendingSurveys(), 1000);

        } catch (e) {
            console.error("Feedback Error:", e);
            showToast("❌ تعذر الإرسال، حاول مرة أخرى", 3000, "#ef4444");
        } finally {
            btn.innerHTML = 'إرسال التقييم <i class="fa-solid fa-paper-plane"></i>';
            btn.style.pointerEvents = 'auto';
        }
    };

    window.checkForPendingSurveys = async function () {
        const user = auth.currentUser;
        const isAdmin = sessionStorage.getItem("secure_admin_session_token_v99");
        if (!user || isAdmin) return;

        try {
            let studentCode = "";
            const userDoc = await getDoc(doc(db, "user_registrations", user.uid));

            if (userDoc.exists()) {
                const data = userDoc.data();
                studentCode = data.registrationInfo?.studentID || data.studentID;
            }

            if (!studentCode) return;

            const q = query(
                collection(db, "attendance"),
                where("id", "==", studentCode),
                where("feedback_status", "==", "pending"),
                limit(1)
            );

            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const pendingDoc = querySnapshot.docs[0];
                const data = pendingDoc.data();

                document.getElementById('feedbackSubjectName').innerText = data.subject || "محاضرة";
                document.getElementById('feedbackDocName').innerText = data.doctorName || "الكلية";
                document.getElementById('targetAttendanceDocId').value = pendingDoc.id;

                window.selectStar(0);

                document.getElementById('feedbackModal').style.display = 'flex';
                console.log("🔔 Found pending survey for:", data.subject);
            }

        } catch (e) {
            console.error("Survey Check Logic Error:", e);
        }
    };

    window.getSilentLocationData = async function () {
        const TARGET_LAT = 30.43841622978127; // إحداثيات الكلية
        const TARGET_LNG = 30.836735200410153;
        const ALLOWED_DIST_KM = 5.0; // النطاق المسموح (بالكيلومتر)

        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ status: "failed_no_support", in_range: false, lat: 0, lng: 0 });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const dist = getDistanceFromLatLonInKm(lat, lng, TARGET_LAT, TARGET_LNG);

                    resolve({
                        status: "success",
                        in_range: (dist <= ALLOWED_DIST_KM), // true لو جوه الكلية
                        lat: lat,
                        lng: lng,
                        distance: dist.toFixed(3)
                    });
                },
                (err) => {
                    resolve({ status: "failed_error", in_range: false, lat: 0, lng: 0, error: err.code });
                },
                { enableHighAccuracy: true, timeout: 3000, maximumAge: 10000 }
            );
        });
    };

    window.saveMyStatus = async function () {
        const user = auth.currentUser;
        if (!user) return showToast("⚠️ يرجى تسجيل الدخول", 3000, "#f59e0b");

        const isAdmin = sessionStorage.getItem("secure_admin_session_token_v99");

        const inputId = isAdmin ? 'facultyStatusInput' : 'studentStatusInput';
        const collectionName = isAdmin ? "faculty_members" : "user_registrations";

        const inputEl = document.getElementById(inputId);
        if (!inputEl) return;

        const statusText = inputEl.value.trim();

        if (statusText.length > 50) {
            return showToast("⚠️ الحالة يجب أن تكون أقل من 50 حرف", 3000, "#f59e0b");
        }
        const activeModal = document.querySelector('.modal-overlay[style*="display: flex"]') || document.body;
        const btn = activeModal.querySelector('.btn-save-status');
        let originalIcon = '<i class="fa-solid fa-check"></i>';

        if (btn) {
            originalIcon = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;
        }

        try {
            await updateDoc(doc(db, collectionName, user.uid), {
                status_message: statusText
            });

            const cached = localStorage.getItem('cached_profile_data');
            if (cached) {
                let obj = JSON.parse(cached);
                if (obj.uid === user.uid) {
                    obj.status_message = statusText;
                    localStorage.setItem('cached_profile_data', JSON.stringify(obj));
                }
            }

            showToast("✅ تم تحديث الحالة", 2000, "#10b981");

        } catch (e) {
            console.error("Save Status Error:", e);
            showToast("خطأ في الاتصال", 3000, "#ef4444");
        } finally {
            if (btn) {
                btn.innerHTML = originalIcon;
                btn.disabled = false;
            }
        }
    };
    window.expandAvatar = function () {
        const avatarEl = document.getElementById('publicAvatar');
        const iconClass = avatarEl.getAttribute('data-icon');
        const color = avatarEl.getAttribute('data-color');

        if (!iconClass) return;

        const zoomModal = document.getElementById('imageZoomModal');
        const container = document.getElementById('zoomedAvatarContainer');

        container.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
        container.querySelector('i').style.color = color;

        zoomModal.style.display = 'flex';
    };

    window.deleteMyStatus = async function () {
        if (!confirm("هل تريد حذف الحالة؟")) return;

        const user = auth.currentUser;
        if (!user) return;

        const sInput = document.getElementById('studentStatusInput');
        const fInput = document.getElementById('facultyStatusInput');
        if (sInput) sInput.value = "";
        if (fInput) fInput.value = "";

        try {
            const isAdmin = sessionStorage.getItem("secure_admin_session_token_v99");
            const collectionName = isAdmin ? "faculty_members" : "user_registrations";

            await updateDoc(doc(db, collectionName, user.uid), {
                status_message: ""
            });

            showToast("🗑️ تم حذف الحالة", 2000, "#ef4444");

            const cached = localStorage.getItem('cached_profile_data');
            if (cached) {
                let obj = JSON.parse(cached);
                obj.status_message = "";
                localStorage.setItem('cached_profile_data', JSON.stringify(obj));
            }

        } catch (e) { console.error(e); }
    };

    window.triggerSessionEndOptions = function () {
        if (typeof playClick === 'function') playClick();
        const modal = document.getElementById('sessionActionModal');
        if (modal) modal.style.display = 'flex';
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

    window.triggerSessionEndOptions = triggerSessionEndOptions;
    window.performSessionPause = performSessionPause;

    window.closeSetupModal = function () {
        document.getElementById('customTimeModal').style.display = 'none';

        document.body.style.overflow = 'auto';
    };

    let feedbackUnsubscribe = null;

    window.initFeedbackListener = function () {
        const user = auth.currentUser;
        if (!user) return;

        const now = new Date();
        const todayStr = ('0' + now.getDate()).slice(-2) + '/' + ('0' + (now.getMonth() + 1)).slice(-2) + '/' + now.getFullYear();

        const q = query(
            collection(db, "feedback_reports"),
            where("doctorUID", "==", user.uid),
            where("date", "==", todayStr)
        );

        if (feedbackUnsubscribe) feedbackUnsubscribe();

        feedbackUnsubscribe = onSnapshot(q, (snapshot) => {
            let counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            let total = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                const r = data.rating || 0;
                if (counts[r] !== undefined) counts[r]++;
                total++;
            });

            const btn = document.getElementById('btnLiveFeedback');
            const badge = document.getElementById('badgeFeedbackCount');

            if (btn) {
                if (total > 0) {
                    btn.classList.add('star-glowing');
                    if (badge) {
                        badge.innerText = total;
                        badge.style.display = 'flex';
                    }
                } else {
                    btn.classList.remove('star-glowing');
                    if (badge) badge.style.display = 'none';
                }
            }

            window.todayFeedbackStats = { counts, total, date: todayStr };

            if (document.getElementById('liveFeedbackModal').style.display === 'flex') {
                renderFeedbackStats();
            }
        });
    };

    window.openFeedbackStats = function () {
        if (typeof playClick === 'function') playClick();
        const modal = document.getElementById('liveFeedbackModal');
        if (modal) {
            modal.style.display = 'flex';
            renderFeedbackStats();
        }
    };

    window.renderFeedbackStats = function () {
        const stats = window.todayFeedbackStats || { counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, total: 0, date: '--' };

        const dateEl = document.getElementById('feedbackDateStr');
        const totalEl = document.getElementById('totalFeedbackVal');
        const container = document.getElementById('starsStatsContainer');

        if (dateEl) dateEl.innerText = stats.date;
        if (totalEl) totalEl.innerText = stats.total;

        if (container) {
            container.innerHTML = '';
            for (let i = 5; i >= 1; i--) {
                const count = stats.counts[i];
                const percent = stats.total > 0 ? (count / stats.total) * 100 : 0;

                container.innerHTML += `
                <div class="star-row-modern">
                    <div class="star-label-num">
                        ${i} <i class="fa-solid fa-star" style="color:#f59e0b; font-size:10px;"></i>
                    </div>
                    <div class="progress-track">
                        <div class="progress-bar-fill" style="width: ${percent}%;"></div>
                    </div>
                    
                    <!-- عرض الرقم + النسبة المئوية -->
                    <div class="count-val en-font" style="width:auto; min-width:50px; text-align:right;">
                        ${count} <span style="font-size:10px; color:#9ca3af; font-weight:normal;">(${Math.round(percent)}%)</span>
                    </div>
                </div>
            `;
            }
        }
    };



})();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=3', { scope: './' })
            .then(registration => { console.log('ServiceWorker registration successful'); })
            .catch(err => { console.error('ServiceWorker registration failed: ', err); });
    });
}
window.exportSubjectToExcel = function (subjectName) {
    if (!window.cachedReportData || window.cachedReportData.length === 0) {
        alert("لا توجد بيانات متاحة حالياً للتصدير.");
        return;
    }

    const filteredStudents = window.cachedReportData.filter(s => s.subject === subjectName);

    if (filteredStudents.length === 0) {
        alert(`لا يوجد حضور مسجل في مادة: ${subjectName}`);
        return;
    }

    const dataForExcel = filteredStudents.map((student, index) => ({
        "م": index + 1,
        "اسم الطالب": student.name,
        "الكود الجامعي": student.uniID,
        "المجموعة": student.group,
        "وقت التسجيل": student.time,
        "القاعة": student.hall || "غير محدد",
        "كود الجلسة": student.code || "N/A"
    }));

    try {
        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "الحضور");

        worksheet['!dir'] = 'rtl';

        const fileName = `حضور_${subjectName}_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    } catch (error) {
        console.error("Excel Export Error:", error);
        alert("حدث خطأ أثناء إنشاء ملف الإكسل. تأكد من إضافة مكتبة XLSX في ملف HTML.");
    }
};

window.exportSubjectToExcel = exportSubjectToExcel;
function playClick() {
    if (navigator.vibrate) navigator.vibrate(10);
}

window.openUploadHistory = async function () {
    playClick();

    const manageModal = document.getElementById('manageStudentsModal');
    if (manageModal) manageModal.style.display = 'none';

    document.getElementById('manageUploadsModal').style.display = 'flex';

    const container = document.getElementById('uploadsHistoryContainer');
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;"><i class="fa-solid fa-circle-notch fa-spin"></i> جاري جلب السجل...</div>';

    try {
        const q = query(collection(db, "upload_history"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<div class="empty-state">لا توجد عمليات رفع مسجلة.</div>';
            return;
        }

        let html = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const dateObj = data.timestamp ? data.timestamp.toDate() : new Date();
            const dateStr = dateObj.toLocaleDateString('en-GB') + ' ' + dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            let badgeColor = "#0f172a";
            if (data.level == "1") badgeColor = "#0ea5e9";
            else if (data.level == "2") badgeColor = "#8b5cf6";

            html += `
            <div class="list-item-manage" style="flex-direction:column; align-items:flex-start; gap:8px; background:#fff; border:1px solid #e2e8f0; padding:15px; border-radius:12px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <div style="font-weight:bold; color:#1e293b; font-size:14px;">${data.filename || 'ملف بدون اسم'}</div>
                    <div style="background:${badgeColor}; color:white; padding:2px 8px; border-radius:6px; font-size:10px;">الفرقة ${data.level}</div>
                </div>
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <div style="font-size:11px; color:#64748b;">${dateStr} • <span style="color:#10b981; font-weight:bold;">${data.count} طالب</span></div>
                    <button onclick="deleteBatch('${data.batch_id}', '${doc.id}')" style="background:#fee2e2; color:#ef4444; border:none; padding:5px 10px; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer;">
                        <i class="fa-solid fa-trash-can"></i> حذف
                    </button>
                </div>
            </div>`;
        });

        container.innerHTML = html;

    } catch (error) {
        console.error(error);
        container.innerHTML = '<div style="color:red; text-align:center;">حدث خطأ في جلب البيانات</div>';
    }
};
window.deleteBatch = function (batchId, historyDocId) {
    if (!batchId) return;

    showModernConfirm(
        "حذف الشيت نهائياً 🗑️",
        "تحذير: سيتم حذف جميع الطلاب المسجلين في هذا الشيت.<br>هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟",
        async function () {
            const container = document.getElementById('uploadsHistoryContainer');

            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:200px; animation: fadeIn 0.5s;">
                    <div style="position:relative; width:60px; height:60px; margin-bottom:20px;">
                        <div style="position:absolute; width:100%; height:100%; border:4px solid #f1f5f9; border-radius:50%;"></div>
                        <div style="position:absolute; width:100%; height:100%; border:4px solid #ef4444; border-top-color:transparent; border-radius:50%; animation: spin 1s linear infinite;"></div>
                        <i class="fa-solid fa-trash-can" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:#ef4444; font-size:20px;"></i>
                    </div>
                    <div style="font-weight:800; color:#1e293b; font-size:16px; margin-bottom:5px;">جاري حذف البيانات...</div>
                </div>
            `;

            try {
                const q = query(collection(db, "students"), where("upload_batch_id", "==", batchId));
                const snapshot = await getDocs(q);

                if (snapshot.docs.length > 0) {
                    const chunks = [];
                    const docs = snapshot.docs;
                    for (let i = 0; i < docs.length; i += 400) chunks.push(docs.slice(i, i + 400));

                    for (const chunk of chunks) {
                        const batch = writeBatch(db);
                        chunk.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                    }
                }

                await deleteDoc(doc(db, "upload_history", historyDocId));

                try { playSuccess(); } catch (e) { } // تشغيل الصوت بأمان
                showToast(`تم الحذف بنجاح.`, 3000, "#10b981");

            } catch (error) {
                console.error("Delete Error:", error);
                showToast("حدث خطأ بسيط، لكن قد يكون الحذف تم.", 3000, "#f59e0b");
            } finally {

                openUploadHistory();
            }
        }
    );
};
window.openManageStudentsModal = function () {
    playClick(); // تشغيل الصوت

    const menuModal = document.getElementById('dataEntryModal');
    if (menuModal) menuModal.style.display = 'none';

    const targetModal = document.getElementById('manageStudentsModal');
    if (targetModal) targetModal.style.display = 'flex';
};

window.openArchiveModal = function () {
    playClick();

    document.getElementById('dataEntryModal').style.display = 'none';

    document.getElementById('attendanceRecordsModal').style.display = 'flex';
};

window.closeManageStudentsModal = function () {
    playClick();
    document.getElementById('manageStudentsModal').style.display = 'none';
};

window.triggerUploadProcess = function () {
    const level = document.getElementById('uploadLevelSelect').value;

    if (!level) {
        if (navigator.vibrate) navigator.vibrate(200);
        showToast("⚠️ يرجى اختيار الفرقة الدراسية أولاً!", 3000, "#ef4444");

        const selectBox = document.getElementById('uploadLevelSelect');
        selectBox.focus();
        selectBox.style.borderColor = "#ef4444";
        setTimeout(() => selectBox.style.borderColor = "#e2e8f0", 2000);
        return;
    }
    document.getElementById('excelFileInput').click();
};

window.showModernConfirm = function (title, text, actionCallback) {
    playClick(); // تشغيل صوت النقر

    const titleEl = document.getElementById('modernConfirmTitle');
    const textEl = document.getElementById('modernConfirmText');

    if (titleEl) titleEl.innerText = title;
    if (textEl) textEl.innerHTML = text;

    window.pendingAction = actionCallback;

    const modal = document.getElementById('modernConfirmModal');
    if (modal) modal.style.display = 'flex';
};

window.closeModernConfirm = function () {
    playClick();
    const modal = document.getElementById('modernConfirmModal');
    if (modal) modal.style.display = 'none';
    window.pendingAction = null; // إلغاء الأمر المعلق
};

const confirmBtn = document.getElementById('btnConfirmYes');
if (confirmBtn) {
    confirmBtn.onclick = function () {
        if (window.pendingAction) window.pendingAction(); // تنفيذ الأمر
        closeModernConfirm(); // إغلاق النافذة
    };
}

window.exportAttendanceSheet = async function (subjectName) {
    if (typeof playClick === 'function') playClick();

    let subjectsConfig = JSON.parse(localStorage.getItem('subjectsData_v4')) || {
        "first_year": ["اساسيات تمريض 1 نظري", "اساسيات تمريض 1 عملي", "تقييم صحى نظرى", "مصطلحات طبية"],
        "second_year": ["تمريض بالغين 1 نظرى", "باثولوجى", "علم الأدوية"]
    };

    let TARGET_LEVEL = "1";
    if (subjectsConfig["first_year"]?.includes(subjectName)) TARGET_LEVEL = "1";
    else if (subjectsConfig["second_year"]?.includes(subjectName)) TARGET_LEVEL = "2";
    else if (subjectsConfig["third_year"]?.includes(subjectName)) TARGET_LEVEL = "3";
    else if (subjectsConfig["fourth_year"]?.includes(subjectName)) TARGET_LEVEL = "4";

    showToast(`⏳ جاري استخراج شيت (حضور + انضباط + تفاصيل) للفرقة ${TARGET_LEVEL}...`, 15000, "#3b82f6");

    try {

        const attendees = window.cachedReportData.filter(s => s.subject === subjectName);
        const attendeesMap = {};

        attendees.forEach(a => {
            let cleanNotes = "منضبط";
            if (a.notes && a.notes !== "منضبط") cleanNotes = a.notes;

            let sessionCounter = a.segment_count || 1;
            let docName = a.doctorName || "غير محدد";

            attendeesMap[a.uniID] = {
                ...a,
                finalStatus: cleanNotes,
                finalDoc: docName,
                finalCount: sessionCounter
            };
        });

        const q = query(collection(db, "students"), where("academic_level", "==", TARGET_LEVEL));
        const querySnapshot = await getDocs(q);

        let finalReport = [];

        querySnapshot.forEach((doc) => {
            const s = doc.data();
            const attendanceRecord = attendeesMap[s.id];

            if (attendanceRecord) {
                let rowStyle = "background-color: #ecfdf5; color: #065f46;"; // أخضر
                let statusText = "✅ حاضر";
                let notesText = "منضبط";

                if (attendanceRecord.finalStatus.includes("غير منضبط")) {
                    rowStyle = "background-color: #fee2e2; color: #b91c1c; font-weight:bold;"; // أحمر
                    statusText = "⚠️ حاضر (سلوك)";
                    notesText = "غير منضبط";
                } else if (attendanceRecord.finalStatus.includes("زي")) {
                    rowStyle = "background-color: #ffedd5; color: #c2410c; font-weight:bold;"; // برتقالي
                    statusText = "👕 حاضر (زي)";
                    notesText = "مخالفة زي";
                }

                finalReport.push({
                    name: s.name,
                    id: s.id,
                    level: s.academic_level,
                    status: statusText,
                    notes: notesText,
                    time: attendanceRecord.time,
                    group: attendanceRecord.group,
                    doctor: attendanceRecord.finalDoc,   // ✅ اسم الدكتور
                    sessions: attendanceRecord.finalCount, // ✅ عدد الجلسات
                    rowColor: `style='${rowStyle}'`,
                    isPresent: true
                });

                delete attendeesMap[s.id];

            } else {
                finalReport.push({
                    name: s.name,
                    id: s.id,
                    level: s.academic_level,
                    status: "❌ غائب",
                    notes: "-",
                    time: "--:--",
                    group: "--",
                    doctor: "-",
                    sessions: "-",
                    rowColor: "style='color: #64748b;'",
                    isPresent: false
                });
            }
        });

        for (let intruderID in attendeesMap) {
            const intruder = attendeesMap[intruderID];
            finalReport.push({
                name: intruder.name,
                id: intruder.uniID,
                level: "تخلفات",
                status: "✅ حاضر (تخلفات)",
                notes: intruder.finalStatus,
                time: intruder.time,
                group: intruder.group,
                doctor: intruder.finalDoc,     // ✅ اسم الدكتور
                sessions: intruder.finalCount, // ✅ عدد الجلسات
                rowColor: "style='background-color: #fef08a; color: #854d0e; font-weight:bold;'", // أصفر
                isPresent: true
            });
        }

        finalReport.sort((a, b) => {
            if (a.isPresent && !b.isPresent) return -1;
            if (!a.isPresent && b.isPresent) return 1;

            return a.id.toString().localeCompare(b.id.toString(), undefined, { numeric: true, sensitivity: 'base' });
        });

        const now = new Date();
        const dayName = now.toLocaleDateString('ar-EG', { weekday: 'long' });
        const dateOnly = now.toLocaleDateString('en-GB');
        const dateStrForFile = dateOnly.replace(/\//g, '-');
        const fileName = `تقرير_${subjectName}_${dateStrForFile}.xls`;

        let tableContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8">
                <style>
                    table { border-collapse: collapse; width: 100%; direction: rtl; font-family: 'Arial', sans-serif; }
                    th { background-color: #1e293b; color: white; border: 1px solid #000; padding: 10px; text-align: center; font-size: 14px; }
                    td { border: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle; font-size: 12px; }
                    .header-info { font-size: 16px; color: #334155; font-weight: normal; margin-top: 5px; }
                </style>
            </head>
            <body>
            
            <div style="text-align:center; padding:15px; margin-bottom:10px;">
                <h2 style="margin:0; color:#0f172a;">كشف تفصيلي لمادة: ${subjectName} (الفرقة ${TARGET_LEVEL})</h2>
                <div class="header-info">
                    اليوم: <b>${dayName}</b> &nbsp;|&nbsp; التاريخ: <b>${dateOnly}</b>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>م</th>
                        <th>اسم الطالب</th>
                        <th>الكود الجامعي</th>
                        <th>حالة الحضور</th>
                        <th>ملاحظات السلوك</th>
                        <th>وقت التسجيل</th>
                        <th>المجموعة</th>
                        
                        <!-- 🔥 الأعمدة الجديدة 🔥 -->
                        <th style="background-color: #0f766e;">عدد الجلسات</th>
                        <th style="background-color: #0369a1;">اسم الدكتور</th>
                    </tr>
                </thead>
                <tbody>
        `;

        finalReport.forEach((row, index) => {
            tableContent += `
                <tr ${row.rowColor}>
                    <td>${index + 1}</td>
                    <td>${row.name}</td>
                    <td style='mso-number-format:"\\@"'>${row.id}</td>
                    <td>${row.status}</td>
                    <td>${row.notes}</td>
                    <td>${row.time}</td>
                    <td>${row.group}</td>
                    
                    <!-- بيانات الأعمدة الجديدة -->
                    <td style="font-weight:bold;">${row.sessions}</td>
                    <td>${row.doctor}</td>
                </tr>
            `;
        });

        tableContent += `</tbody></table></body></html>`;

        if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {

            console.log("📲 Native Mode Detected: Starting Share Process...");

            const { Filesystem, Directory, Encoding } = Capacitor.Plugins.Filesystem;
            const { Share } = Capacitor.Plugins.Share;

            try {
                const base64Data = btoa(unescape(encodeURIComponent(tableContent)));

                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Cache
                });

                console.log("✅ File saved at:", result.uri);

                await Share.share({
                    title: 'تصدير كشف الحضور',
                    text: `إليك كشف حضور مادة ${subjectName}`,
                    url: result.uri,
                    dialogTitle: 'حفظ أو إرسال الملف'
                });

                showToast("✅ تم تجهيز الملف للمشاركة", 3000, "#10b981");

            } catch (nativeError) {
                console.error("Native Export Error:", nativeError);
                downloadWebFile();
            }

        } else {
            downloadWebFile();
        }

        function downloadWebFile() {
            const blob = new Blob([tableContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        if (typeof playSuccess === 'function') playSuccess();
        if (document.getElementById('toastNotification')) document.getElementById('toastNotification').style.display = 'none';

    } catch (error) {
        console.error(error);
        alert("حدث خطأ: " + error.message);
    }
};

if (typeof showToast === 'undefined') {
    window.showToast = function (message, duration = 3000, bgColor = '#334155') {
        const toast = document.getElementById('toastNotification');
        if (toast) {
            toast.style.backgroundColor = bgColor;
            toast.innerText = message;
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, duration);
        } else {
            console.log("تنبيه: " + message);
        }
    };
}

window.playSuccess = function () {
    console.log("تمت العملية بنجاح ✅");
};

window.playClick = function () {
};

window.playBeep = function () {
};

const ARCHIVE_SUBJECTS = {
    "1": ["اساسيات تمريض 1 نظري", "اساسيات تمريض 1 عملي", "تمريض بالغين 1 نظرى", "تمريض بالغين 1 عملى", "اناتومى نظرى", "اناتومى عملى", "تقييم صحى نظرى", "تقييم صحى عملى", "مصطلحات طبية", "فسيولوجى", "تكنولوجيا المعلومات"],
    "2": ["تمريض بالغين 1 نظرى", "تمريض بالغين 1 عملى", "تمريض حالات حرجة 1 نظرى", "تمريض حالات حرجة 1 عملى", "امراض باطنة", "باثولوجى", "علم الأدوية", "الكتابة التقنية"],
    "3": [],
    "4": []
};

window.updateArchiveSubjects = function () {
    const level = document.getElementById('archiveLevelSelect').value;
    const dataList = document.getElementById('subjectsList'); // القائمة الخفية
    const inputField = document.getElementById('archiveSubjectInput'); // مربع الكتابة

    dataList.innerHTML = '';
    inputField.value = '';

    if (!level || !ARCHIVE_SUBJECTS[level]) return;

    ARCHIVE_SUBJECTS[level].forEach(sub => {
        const option = document.createElement('option');
        option.value = sub; // القيمة اللي هتتكتب
        dataList.appendChild(option);
    });
};

window.toggleDateLabel = function () {
    const isWeekly = document.getElementById('repWeekly').checked;
    const label = document.getElementById('dateInputLabel');
    if (isWeekly) {
        label.innerText = "بداية الأسبوع (من يوم):";
    } else {
        label.innerText = "تاريخ المحاضرة:";
    }
    if (typeof playClick === 'function') playClick();
};

window.downloadHistoricalSheet = async function () {
    playClick();

    const level = document.getElementById('archiveLevelSelect').value;
    const subjectName = document.getElementById('archiveSubjectInput').value.trim();
    const rawDate = document.getElementById('historyDateInput').value;
    const isWeekly = document.getElementById('repWeekly').checked; // هل اختار أسبوع؟

    if (!level) { showToast("⚠️ اختر الفرقة", 3000, "#f59e0b"); return; }
    if (!subjectName) { showToast("⚠️ اكتب اسم المادة", 3000, "#f59e0b"); return; }
    if (!rawDate) { showToast("⚠️ اختر التاريخ", 3000, "#f59e0b"); return; }

    const btn = document.querySelector('#attendanceRecordsModal .btn-main');
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التجميع...';
    btn.disabled = true;

    try {
        let datesToSearch = [];

        if (isWeekly) {
            const startDate = new Date(rawDate);
            for (let i = 0; i < 7; i++) {
                const nextDay = new Date(startDate);
                nextDay.setDate(startDate.getDate() + i);

                const dayStr = ('0' + nextDay.getDate()).slice(-2);
                const monthStr = ('0' + (nextDay.getMonth() + 1)).slice(-2);
                const yearStr = nextDay.getFullYear();
                datesToSearch.push(`${dayStr}/${monthStr}/${yearStr}`);
            }
        } else {
            datesToSearch.push(rawDate.split("-").reverse().join("/"));
        }

        console.log("Searching dates:", datesToSearch);

        const attQuery = query(
            collection(db, "attendance"),
            where("subject", "==", subjectName),
            where("date", "in", datesToSearch)
        );

        const attSnap = await getDocs(attQuery);

        if (attSnap.empty) {
            showToast(`❌ لا توجد بيانات لهذه الفترة`, 4000, "#ef4444");
            btn.innerHTML = oldText;
            btn.disabled = false;
            return;
        }

        const recordsMap = {};
        attSnap.forEach(d => {
            const data = d.data();
            const uniqueKey = `${data.id}_${data.date}`;
            recordsMap[uniqueKey] = data;
        });

        const stQuery = query(collection(db, "students"), where("academic_level", "==", level));
        const stSnap = await getDocs(stQuery);

        let csvContent = "\uFEFFالاسم,الكود,التاريخ,الحالة,وقت الدخول\n";

        datesToSearch.forEach(searchDate => {

            stSnap.forEach(doc => {
                const s = doc.data();
                const key = `${s.id}_${searchDate}`;

                if (recordsMap[key]) {
                    const r = recordsMap[key];
                    csvContent += `${s.name},"${s.id}",${searchDate},✅ حاضر,${r.time_str || '-'}\n`;
                } else {
                    csvContent += `${s.name},"${s.id}",${searchDate},❌ غائب,-\n`;
                }
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);

        let fileName = isWeekly
            ? `Report_Week_${rawDate}_${subjectName}.csv`
            : `Report_Day_${rawDate}_${subjectName}.csv`;

        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        playSuccess();
        document.getElementById('attendanceRecordsModal').style.display = 'none';

    } catch (e) {
        console.error("Archive Error:", e);
        showToast("حدث خطأ تقني: " + e.message, 4000, "#ef4444");
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
};

const SEARCH_DB = {
    "1": ["اساسيات تمريض 1 نظري", "اساسيات تمريض 1 عملي", "تمريض بالغين 1 نظرى", "تمريض بالغين 1 عملى", "اناتومى نظرى", "اناتومى عملى", "تقييم صحى نظرى", "تقييم صحى عملى", "مصطلحات طبية", "فسيولوجى", "تكنولوجيا المعلومات"],
    "2": ["تمريض بالغين 1 نظرى", "تمريض بالغين 1 عملى", "تمريض حالات حرجة 1 نظرى", "تمريض حالات حرجة 1 عملى", "امراض باطنة", "باثولوجى", "علم الأدوية", "الكتابة التقنية"],
    "3": [],
    "4": []
};

function normalizeText(text) {
    if (!text) return "";
    return text.toString()
        .replace(/[أإآ]/g, 'ا')  // الألفات
        .replace(/ة/g, 'ه')      // التاء المربوطة
        .replace(/ى/g, 'ي');     // الياء
}

window.smartSubjectSearch = function () {
    const input = document.getElementById('archiveSubjectInput');
    const box = document.getElementById('suggestionBox');
    const level = document.getElementById('archiveLevelSelect').value;

    if (!level) {
        if (box) box.style.display = 'none';
        return;
    }

    const query = normalizeText(input.value);
    const list = SEARCH_DB[level] || [];

    box.innerHTML = '';
    let hasResults = false;

    list.forEach(subject => {
        if (normalizeText(subject).includes(query)) {
            hasResults = true;
            const item = document.createElement('div');
            item.innerText = subject;
            item.style.cssText = "padding:10px; cursor:pointer; border-bottom:1px solid #f1f5f9; color:#334155; transition:0.2s;";

            item.onmouseover = function () { this.style.backgroundColor = "#f0f9ff"; };
            item.onmouseout = function () { this.style.backgroundColor = "white"; };

            item.onclick = function () {
                input.value = subject;
                box.style.display = 'none';
            };

            box.appendChild(item);
        }
    });

    if (hasResults && query.length > 0) {
        box.style.display = 'block';
    } else {
        box.style.display = 'none';
    }
};

window.clearSearchBox = function () {
    document.getElementById('archiveSubjectInput').value = '';
    document.getElementById('suggestionBox').style.display = 'none';
};

document.addEventListener('click', function (e) {
    const box = document.getElementById('suggestionBox');
    const input = document.getElementById('archiveSubjectInput');
    if (e.target !== box && e.target !== input) {
        if (box) box.style.display = 'none';
    }
});

window.downloadHistoricalSheet = async function () {
    playClick();
    const level = document.getElementById('archiveLevelSelect').value;
    const subjectName = document.getElementById('archiveSubjectInput').value;
    const rawDate = document.getElementById('historyDateInput').value;

    if (!level || !subjectName || !rawDate) {
        showToast("⚠️ البيانات ناقصة", 3000, "#f59e0b"); return;
    }

    const formattedDate = rawDate.split("-").reverse().join("/");
    const btn = document.querySelector('#attendanceRecordsModal .btn-main');
    const oldText = btn.innerHTML;
    btn.innerHTML = 'Wait...';

    try {
        const attQuery = query(collection(db, "attendance"), where("date", "==", formattedDate), where("subject", "==", subjectName));
        const attSnap = await getDocs(attQuery);

        if (attSnap.empty) {
            showToast("❌ لا توجد بيانات", 3000, "#ef4444");
            btn.innerHTML = oldText; return;
        }

        const attendeesMap = {};
        attSnap.forEach(d => attendeesMap[d.data().id] = d.data());

        const stQuery = query(collection(db, "students"), where("academic_level", "==", level));
        const stSnap = await getDocs(stQuery);

        let report = [];
        stSnap.forEach(doc => {
            const s = doc.data();
            if (attendeesMap[s.id]) {
                report.push({ name: s.name, id: s.id, st: "✅ حاضر", bg: "" });
                delete attendeesMap[s.id];
            } else {
                report.push({ name: s.name, id: s.id, st: "❌ غائب", bg: "style='background:#fef2f2; color:red'" });
            }
        });

        for (let id in attendeesMap) report.push({ name: attendeesMap[id].name, id: id, st: "✅ حاضر (تخلفات)", bg: "style='background:#fef08a'" });

        let csv = `\uFEFFالاسم,الكود,الحالة\n`;
        report.forEach(r => csv += `${r.name},"${r.id}",${r.st}\n`);

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Archive_${subjectName}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        playSuccess();
        document.getElementById('attendanceRecordsModal').style.display = 'none';

    } catch (e) { console.error(e); } finally { btn.innerHTML = oldText; }
};

window.openAdminLogin = function () {
    if (sessionStorage.getItem("is_logged_in_securely")) {
        document.getElementById('dataEntryModal').style.display = 'flex';
    } else {
        document.getElementById('secureLoginModal').style.display = 'flex';
    }
};

window.performSecureLogin = async function () {
    const email = document.getElementById('adminEmail').value;
    const pass = document.getElementById('adminPass').value;
    const btn = document.querySelector('#secureLoginModal .btn-main');

    if (!email || !pass) {
        showToast("⚠️ اكتب البيانات الأول", 3000, "#f59e0b");
        return;
    }

    const oldText = btn.innerHTML;
    btn.innerHTML = 'جاري التحقق...';

    try {
        await signInWithEmailAndPassword(auth, email, pass);

        showToast("🔓 تم تسجيل الدخول بنجاح", 3000, "#10b981");
        document.getElementById('secureLoginModal').style.display = 'none';

        sessionStorage.setItem("is_logged_in_securely", "true");

        document.getElementById('dataEntryModal').style.display = 'flex';

    } catch (error) {
        console.error(error);
        showToast("❌ بيانات الدخول غير صحيحة!", 3000, "#ef4444");
    } finally {
        btn.innerHTML = oldText;
    }
};
window.togglePasswordVisibility = togglePasswordVisibility;


window.playClick = function () {
    console.log("Audio skipped to prevent crash.");
};

window.playSuccess = function () {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
};

window.playBeep = function () {
};

function normalizeArabic(text) {
    if (!text) return "";
    return text.toString()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .toLowerCase();
}

window.filterModalSubjects = function () {
    const input = document.getElementById('subjectSearchInput');
    const select = document.getElementById('modalSubjectSelect');
    const query = normalizeArabic(input.value);

    select.innerHTML = '';

    if (typeof subjectsData !== 'undefined') {
        for (const [year, subjects] of Object.entries(subjectsData)) {
            const matchedSubjects = subjects.filter(sub => normalizeArabic(sub).includes(query));

            if (matchedSubjects.length > 0) {
                const group = document.createElement('optgroup');
                group.label = (year === "first_year") ? "الفرقة الأولى" : "الفرقة الثانية";
                matchedSubjects.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub;
                    opt.text = sub;
                    group.appendChild(opt);
                });
                select.appendChild(group);
            }
        }
    }

    if (select.options.length === 0) {
        const opt = document.createElement('option');
        opt.text = "لا توجد نتائج مطابقة";
        opt.disabled = true;
        select.appendChild(opt);
    }
};
window.showInfoModal = function () {
    if (typeof playClick === 'function') playClick();

    const modal = document.getElementById('infoModal');
    if (modal) {
        modal.style.display = 'flex';
    }
};


window.portalClicks = 0;
window.portalTimer = null;

window.handleAdminTripleClick = function (btn) {
    if (typeof playClick === 'function') playClick();

    window.portalClicks++;
    console.log("تجهيز القفل:", window.portalClicks);

    clearTimeout(window.portalTimer);
    window.portalTimer = setTimeout(() => {
        window.portalClicks = 0;
        console.log("انتهى الوقت، تم تصفير العداد");
    }, 2000);

    if (window.portalClicks === 3) {
        if (navigator.vibrate) navigator.vibrate([50, 50]);

    }
};

window.handleReportClick = function () {
    if (window.portalClicks === 3) {
        const facultyModal = document.getElementById('facultyGateModal');

        if (facultyModal) {
            if (typeof playSuccess === 'function') playSuccess();

            facultyModal.style.display = 'flex';

            window.portalClicks = 0;
            clearTimeout(window.portalTimer);
            return;
        }
    }

    window.portalClicks = 0;

    const isAdmin = sessionStorage.getItem("secure_admin_session_token_v99");

    if (isAdmin) {
        if (typeof openReportModal === 'function') openReportModal();
    } else {
        showToast("🔐 القسم محمي (يجب تسجيل دخول المشرف)", 3000, "#ef4444");
        if (navigator.vibrate) navigator.vibrate(200);
    }
};
window.goHome = function () {
    const liveScreen = document.getElementById('screenLiveSession');
    if (liveScreen) liveScreen.style.display = 'none';

    const welcomeScreen = document.getElementById('screenWelcome');
    if (welcomeScreen) {
        welcomeScreen.style.display = 'block';
        welcomeScreen.classList.add('active');
    }

    const infoBtn = document.getElementById('infoBtn');
    if (infoBtn) {
        infoBtn.style.display = 'flex';
    }

    document.body.classList.add('on-welcome-screen');
    document.body.classList.remove('hide-main-icons');


    document.body.style.overflow = 'auto';

    if (typeof window.updateSessionButtonUI === 'function' && window.lastSessionState !== undefined) {
        window.updateSessionButtonUI(window.lastSessionState);
    }
};
window.tempManualStudentData = null;

window.searchManualStudent = async function () {
    const codeInput = document.getElementById("manualStudentCodeInput");
    const codeString = codeInput ? codeInput.value.trim() : "";
    const codeNumber = Number(codeString);

    if (!codeString) {
        alert("⚠️ يرجى كتابة كود الطالب!");
        return;
    }

    const btn = document.querySelector('#manualInputStep .btn-main');
    const oldText = btn ? btn.innerHTML : "بحث";

    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري البحث...';
        btn.disabled = true;
    }

    try {
        const checks = [
            getDoc(doc(db, "students", codeString)),
            getDocs(query(collection(db, "students"), where("studentCode", "==", codeNumber))),
            getDocs(query(collection(db, "users"), where("studentCode", "==", codeString)))
        ];

        const uidCheck = getDoc(doc(db, "taken_student_ids", codeString));

        const [results, uidResult] = await Promise.all([Promise.all(checks), uidCheck]);

        let sData = null;
        if (results[0].exists()) {
            sData = results[0].data();
        } else {
            for (let i = 1; i < results.length; i++) {
                if (!results[i].empty) {
                    sData = results[i].docs[0].data();
                    break;
                }
            }
        }

        if (!sData) {
            alert("❌ هذا الكود غير مسجل في قاعدة البيانات!");
            if (btn) { btn.innerHTML = oldText; btn.disabled = false; }
            return;
        }

        let targetUID = codeString;
        if (uidResult.exists()) {
            targetUID = uidResult.data().saved_uid || codeString;
        }

        const studentName = sData.name || sData.fullName || "Student";

        window.tempManualStudentData = {
            uid: String(targetUID),
            code: String(codeString),
            name: String(studentName)
        };

        const nameEl = document.getElementById('previewStudentName');
        const idEl = document.getElementById('previewStudentID');

        if (nameEl) nameEl.innerText = studentName;
        if (idEl) idEl.innerText = "#" + codeString;

        const step1 = document.getElementById('manualInputStep');
        const step2 = document.getElementById('manualConfirmStep');
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';

    } catch (error) {
        console.error(error);
        alert("حدث خطأ أثناء البحث: " + error.message);
    } finally {
        if (btn) { btn.innerHTML = oldText; btn.disabled = false; }
    }
};
window.resetManualModal = function () {
    const modal = document.getElementById('manualAddModal');
    if (modal) modal.style.display = 'none';

    setTimeout(() => {
        const step1 = document.getElementById('manualInputStep');
        const step2 = document.getElementById('manualConfirmStep');
        const input = document.getElementById("manualStudentCodeInput");

        if (step1) step1.style.display = 'block';
        if (step2) step2.style.display = 'none';
        if (input) input.value = "";

        window.tempManualStudentData = null;

        const confirmBtn = document.querySelector('#manualConfirmStep .btn-main');
        if (confirmBtn) {
            confirmBtn.innerHTML = 'تأكيد الإضافة <i class="fa-solid fa-check"></i>';
            confirmBtn.style.pointerEvents = 'auto';
        }
    }, 300);
};

window.addEventListener('load', () => {
    const manualBtn = document.getElementById("btnConfirmManualAdd");
    if (manualBtn) {
        const newBtn = manualBtn.cloneNode(true);
        manualBtn.parentNode.replaceChild(newBtn, manualBtn);

        newBtn.addEventListener("click", window.searchManualStudent);
        console.log("✅ زر الإضافة اليدوية تم تحديثه ليعمل بنظام المعاينة.");
    }
});

window.confirmManualAdd = async function () {
    if (!window.tempManualStudentData) return;

    const student = window.tempManualStudentData;
    const btn = document.querySelector('#manualConfirmStep .btn-confirm-green');
    const user = auth.currentUser;

    if (!user) {
        showToast("⚠️ يجب تسجيل الدخول أولاً", 3000, "#f59e0b");
        return;
    }

    const originalText = btn ? btn.innerHTML : "تأكيد";
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإضافة...';
        btn.style.pointerEvents = 'none';
    }

    try {
        const studentObj = {
            id: student.code,
            uid: student.uid,
            name: student.name,

            status: "active",
            timestamp: serverTimestamp(),
            method: "Manual_By_Prof",

            isUnruly: false,
            isUniformViolation: false,
            avatarClass: "fa-user",
            segment_count: 1,

            subject: window.currentDoctorSubject || "Manual Add",
            hall: "Manual",
            time_str: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };

        const participantRef = doc(db, "active_sessions", user.uid, "participants", student.uid);

        await setDoc(participantRef, studentObj);

        if (typeof playSuccess === 'function') playSuccess();

        showToast(`✅ تم إضافة الطالب: ${student.name}`, 4000, "#10b981");

        resetManualModal();

    } catch (error) {
        console.error("Manual Add Error:", error);
        showToast("❌ حدث خطأ أثناء الحفظ", 3000, "#ef4444");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
    }
};

window.resetManualModal = function () {
    document.getElementById('manualAddModal').style.display = 'none';

    setTimeout(() => {
        document.getElementById('manualInputStep').style.display = 'block';
        document.getElementById('manualConfirmStep').style.display = 'none';
        document.getElementById("manualStudentCodeInput").value = "";
        window.tempManualStudentData = null;

        const confirmBtn = document.querySelector('#manualConfirmStep .btn-main');
        if (confirmBtn) {
            confirmBtn.innerHTML = 'تأكيد الإضافة <i class="fa-solid fa-check"></i>';
            confirmBtn.style.pointerEvents = 'auto';
        }
    }, 300);
};

window.addEventListener('load', () => {
    const manualBtn = document.getElementById("btnConfirmManualAdd");

    if (manualBtn) {
        console.log("✅ تم العثور على زر الإضافة وربطه بنجاح.");

        const newBtn = manualBtn.cloneNode(true);
        manualBtn.parentNode.replaceChild(newBtn, manualBtn);

        newBtn.addEventListener("click", window.handleManualAdd);

    } else {
        console.error("❌ زر الإضافة غير موجود في HTML! تأكد من الـ ID: btnConfirmManualAdd");
    }
});
window.filterLiveStudents = function () {
    const input = document.getElementById('liveSearchInput');
    const filter = input.value.toUpperCase().trim();

    const grid = document.getElementById('liveStudentsGrid');
    const cards = grid.getElementsByClassName('live-st-card');

    for (let i = 0; i < cards.length; i++) {
        const nameEl = cards[i].querySelector('.st-name');
        const idEl = cards[i].querySelector('.st-id');

        if (nameEl && idEl) {
            const nameTxt = nameEl.textContent || nameEl.innerText;
            const idTxt = idEl.textContent || idEl.innerText;

            if (nameTxt.toUpperCase().indexOf(filter) > -1 || idTxt.indexOf(filter) > -1) {
                cards[i].style.display = "";
            } else {
                cards[i].style.display = "none";
            }
        }
    }
};
window.autoFetchName = async function (studentId) {
    const nameInput = document.getElementById('regFullName');
    const signupBtn = document.getElementById('btnDoSignup');

    if (!nameInput) return;

    nameInput.value = "";
    nameInput.placeholder = "جاري التحقق أمنياً...";

    const cleanId = studentId.toString().trim();

    if (!cleanId || cleanId.length < 4) {
        nameInput.placeholder = "Full Name";
        return;
    }

    try {
        const lockRef = doc(db, "taken_student_ids", cleanId);
        const lockSnap = await getDoc(lockRef);

        if (lockSnap.exists()) {
            nameInput.value = "⚠️ الكود محجوز لحساب آخر";
            nameInput.style.color = "#ef4444";
            if (signupBtn) signupBtn.disabled = true;
            return;
        }

        const studentRef = doc(db, "students", cleanId);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
            nameInput.value = studentSnap.data().name;
            nameInput.style.color = "#0f172a";
            nameInput.placeholder = "";
        } else {
            nameInput.value = "❌ كود غير مسجل بالكلية";
            nameInput.style.color = "#b91c1c";
        }

    } catch (error) {
        console.error("Fetch Error:", error);
        nameInput.value = "⚠️ خطأ في الاتصال بالسيرفر";
    } finally {
        if (typeof validateSignupForm === 'function') validateSignupForm();
    }
};

window.handleProfileIconClick = function () {
    const user = auth.currentUser;
    const adminToken = sessionStorage.getItem("secure_admin_session_token_v99");

    if (!user) {
        if (typeof openAuthDrawer === 'function') openAuthDrawer();
    } else {
        if (adminToken) {
            if (typeof openFacultyProfile === 'function') openFacultyProfile();
        } else {
            if (typeof openStudentProfile === 'function') openStudentProfile();
        }
    }
};
window.closeAuthDrawer = function () {
    const drawer = document.getElementById('studentAuthDrawer');
    if (drawer) {
        drawer.classList.remove('active');

        setTimeout(() => {
            drawer.style.display = 'none';
            document.body.style.overflow = 'auto';
        }, 200);
    }
};
window.showSmartWelcome = function (name) {
    const today = new Date().toLocaleDateString('en-GB');
    if (localStorage.getItem('last_welcome_date') !== today) {
        const modal = document.getElementById('dailyWelcomeModal');
        const nameSpan = document.getElementById('welcomeUserName');
        if (modal && nameSpan) {
            nameSpan.innerText = name.split(' ')[0];
            modal.style.display = 'flex';
            modal.style.opacity = '1';
            localStorage.setItem('last_welcome_date', today);
        }
    }
};

window.closeDailyWelcome = function () {
    const modal = document.getElementById('dailyWelcomeModal');
    if (modal) {
        modal.style.transition = "0.3s ease";
        modal.style.opacity = "0";
        setTimeout(() => modal.style.display = 'none', 300);
    }
};
window.startSmartSearch = async function () {
    const rawInput = document.getElementById('makaniInput').value.trim();
    const content = document.getElementById('makaniContent');
    const modal = document.getElementById('makaniResultsModal');
    const btn = document.getElementById('btnMakani');

    if (!rawInput) return;

    const queryNormal = smartNormalize(rawInput);
    const queryPhonetic = transliterateArabicToEnglish(rawInput);

    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    content.innerHTML = '<div style="padding:30px; text-align:center;"><i class="fa-solid fa-wand-magic-sparkles fa-bounce" style="font-size:40px; color:#0ea5e9;"></i><p>جاري البحث الخارق...</p></div>';
    modal.style.display = 'flex';

    try {
        const q = query(collection(db, "active_sessions"), where("isActive", "==", true));
        const querySnapshot = await getDocs(q);
        let resultsFound = [];

        for (const sessionDoc of querySnapshot.docs) {
            const data = { ...sessionDoc.data() };
            const doctorId = sessionDoc.id;

            const dbDocName = data.doctorName.toLowerCase();
            const dbDocNamePhonetic = transliterateArabicToEnglish(data.doctorName);
            const dbSubject = smartNormalize(data.allowedSubject);

            let isMatch = false;

            if (dbDocName.includes(queryNormal) || dbDocName.includes(queryPhonetic)) {
                isMatch = true;
            }
            else if (transliterateArabicToEnglish(dbDocName).includes(queryPhonetic)) {
                isMatch = true;
            }
            else if (dbSubject.includes(queryNormal) || (data.targetGroups || []).some(g => smartNormalize(g).includes(queryNormal))) {
                isMatch = true;
            }

            else if (!isNaN(rawInput) && rawInput.length >= 4) {
                const studentSnap = await getDoc(doc(db, "active_sessions", doctorId, "participants", rawInput));

                if (studentSnap.exists()) {
                    isMatch = true;
                    const sData = studentSnap.data();

                    data.friendName = sData.name;
                    data.friendID = sData.uid || sData.id;
                    data.isFriendMatch = true;
                }
            }

            if (isMatch) resultsFound.push(data);
        }

        if (resultsFound.length === 0) {
            content.innerHTML = `<div class="empty-state">عذراً، لم نجد نتائج لـ "${rawInput}"</div>`;
        } else {
            content.innerHTML = '';
            resultsFound.forEach(res => {
                const card = document.createElement('div');
                card.className = 'makani-card';

                let clickAction = "";
                let iconType = "";

                if (res.isFriendMatch) {
                    clickAction = `openPublicProfile('${res.friendID || rawInput}', false)`;
                    iconType = '<i class="fa-solid fa-user-graduate" style="color:#10b981; font-size: 20px;"></i>';
                } else {
                    clickAction = `openPublicProfile('${res.doctorUID}', true)`;
                    iconType = '<i class="fa-solid fa-user-doctor" style="color:#0ea5e9; font-size: 20px;"></i>';
                }

                card.setAttribute('onclick', clickAction);
                card.style.cursor = "pointer";

                let title = res.isFriendMatch ? `📍 زميلك: ${res.friendName}` : res.allowedSubject;
                let subText = res.isFriendMatch ? `متواجد الآن في محاضرة د. ${res.doctorName}` : `بواسطة: د. ${res.doctorName}`;

                card.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="font-weight:900; font-size:15px; color:#0f172a;">${title}</div>
                            ${iconType}
                        </div>
                        <div style="font-size:12px; color:#64748b; margin-top:5px; font-weight:600;">
                            ${subText}
                        </div>
                        <div class="hall-badge-big" style="margin-top:8px;">
                            <i class="fa-solid fa-building-columns"></i> قاعة: ${res.hall}
                        </div>
                    `;
                content.appendChild(card);
            });
        }
    } catch (e) {
        console.error(e);
        content.innerHTML = '<div style="color:red; text-align:center;">حدث خطأ في البحث</div>';
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
    }
};
window.openGroupManager = function () {
    const isAdmin = sessionStorage.getItem("secure_admin_session_token_v99");
    if (!isAdmin) return;
    document.getElementById('manageGroupsModal').style.display = 'flex';
};

window.addNewGroupToSession = async function () {
    const input = document.getElementById('newGroupInput');
    const groupName = input.value.trim().toUpperCase();
    if (!groupName) return;

    const user = auth.currentUser;
    const sessionRef = doc(db, "active_sessions", user.uid);

    try {
        await updateDoc(sessionRef, {
            targetGroups: arrayUnion(groupName)
        });
        input.value = "";
        if (navigator.vibrate) navigator.vibrate(10);
    } catch (e) { console.error(e); }
};

window.removeGroupFromSession = async function (groupName) {
    const user = auth.currentUser;
    const sessionRef = doc(db, "active_sessions", user.uid);
    try {
        await updateDoc(sessionRef, {
            targetGroups: arrayRemove(groupName)
        });
    } catch (e) { console.error(e); }
};
function smartNormalize(text) {
    if (!text) return "";
    return text.toString()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/ت/g, 'ت')
        .trim()
        .toLowerCase();
}
function transliterateArabicToEnglish(text) {
    if (!text) return "";
    const charMap = {
        'أ': 'a', 'إ': 'i', 'آ': 'a', 'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
        'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z',
        'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
        'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
        'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h', 'ئ': 'e', 'ؤ': 'o', 'لا': 'la'
    };

    let cleanText = text.replace(/دكتور|دكتورة|د\.|أ\.|أستاذ|أستاذه/g, "").trim();

    return cleanText.split('').map(char => charMap[char] || char).join('')
        .replace(/oo|ou|u/g, 'o')
        .replace(/ee|ei|i/g, 'e')
        .replace(/aa|a/g, 'a')
        .toLowerCase();
}

window.adjustDoorLimit = function (amount) {
    const input = document.getElementById('doorMaxLimitInput');
    if (!input) return;

    let currentVal = parseInt(input.value);

    if (isNaN(currentVal)) currentVal = 0;

    let newVal = currentVal + amount;

    if (newVal < 1) {
        input.value = "";
    } else {
        input.value = newVal;
    }

    if (navigator.vibrate) navigator.vibrate(15);
};

window.resetDoorLimit = function () {
    const input = document.getElementById('doorMaxLimitInput');
    if (!input) return;

    input.value = "";

    if (navigator.vibrate) navigator.vibrate(50);
};



window.startQrScanner = function () {
    console.log("QR System is disabled.");
    const btn = document.getElementById('submitBtn');
    if (btn) btn.disabled = false;
};


window.stopCameraSafely = async function () {
    console.log("🛑 Camera stop requested (Safely ignored).");

    if (typeof html5QrCode !== 'undefined' && html5QrCode) {
        try {
            if (html5QrCode.isScanning) {
                await html5QrCode.stop();
            }
            html5QrCode.clear();
        } catch (e) {
        }
    }

    if (typeof releaseWakeLock === 'function') {
        releaseWakeLock();
    }

    return true;
};

window.startQrScanner = function () {
    console.log("🚫 QR Scanner is disabled via System Override.");
    showToast("تم إلغاء خاصية الباركود.", 3000, "#f59e0b");
};

const originalGoBack = window.goBackToWelcome;
window.goBackToWelcome = async function () {
    await window.stopCameraSafely();

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (typeof geo_watch_id !== 'undefined' && geo_watch_id) navigator.geolocation.clearWatch(geo_watch_id);
    if (typeof countdownInterval !== 'undefined') clearInterval(countdownInterval);

    sessionStorage.removeItem("temp_student_name");
    sessionStorage.removeItem("temp_student_id");

    switchScreen('screenWelcome');
};

window.handleIdSubmit = async function () {
    console.log("ID Submitted. QR step skipped.");
    showToast("تم إلغاء نظام الباركود. يرجى استخدام كود الجلسة.", 3000, "#0ea5e9");

    switchScreen('screenDataEntry');
};

window.html5QrCode = null;