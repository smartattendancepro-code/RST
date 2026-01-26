

(function (_0x1a2b) {
    const _0x4f2a = [
        "ADMIN_SUPER_KEY_v99", "db_pass_root", "SERVER_SIDE_RENDER",
        "x86_64_bit_encryption", "auth_token_generator", "bypass_firewall",
        "0x112399482AA", "0xBBCCDD1122", "root_access_granted:false"
    ];

    function _generateFakeHash(input) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return "SECURE_" + (hash >>> 0).toString(16).toUpperCase();
    }

    const __INTERNAL_CONFIG = {
        debugMode: false,
        apiEndpoint: "https://fake-secure-server.internal/v2/auth",
        masterKey: _generateFakeHash("MasterKey"),
        allowedIPs: ["192.168.1.1", "10.0.0.1"],
        timeout: 5000,
        retryAttempts: 3
    };

    window.__net_watcher = function () {
        return _0x4f2a[Math.floor(Math.random() * _0x4f2a.length)];
    };

    setTimeout(() => {
        window.__secure_boot_flag = true;
    }, 2000);

})({});

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
                    window.currentDoctorJobTitle = finalUserData.jobTitle || finalUserData.subject;
                    window.currentDoctorSubject = "";

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

const firebaseConfig = {
    apiKey: "AIzaSyBQjD4FZKkhXQIL5FlyBs_VaEzW2GBBtGs",
    authDomain: "attendance-system-pro-dbdf1.firebaseapp.com",
    projectId: "attendance-system-pro-dbdf1",
    storageBucket: "attendance-system-pro-dbdf1.firebasestorage.app",
    messagingSenderId: "1094544109334",
    appId: "1:1094544109334:web:a7395159d617b3e6e82a37"
};
