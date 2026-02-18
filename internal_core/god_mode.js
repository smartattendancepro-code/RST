
const db = window.db;
const auth = window.auth;
const serverTimestamp = window.serverTimestamp;

const DEV_UID = "1chPRuUF6eS6lR2P3CXip7Ikvgu2";


auth.onAuthStateChanged((user) => {
    if (user && user.uid === DEV_UID) {
        console.log("%c ⚡ ACCESS GRANTED: Developer Mode Active.", "color: #38bdf8; font-weight: bold; font-size: 14px;");
        document.getElementById('auth-check').style.display = 'none';
        document.getElementById('dev-ui').style.display = 'block';

        initDashboard();
        activateAntiHackTraps();
    } else {
        if (user) reportSuspiciousActivity("God Mode Access Attempt", user.email);
        alert("🚨 تـنبيه أمني: محاولة دخول غير مصرح بها! تم تسجيل بيانات جهازك.");
        window.location.href = "../index.html";
    }
});


function initDashboard() {
    loadStats();
    loadUsersRealtime();
    loadSecurityLogs();
    syncRegistrationConfig();
}


async function loadStats() {
    try {
        const { getDocs, collection } = firebase_firestore; 
        const snapshot = await firebase_firestore.getDocs(firebase_firestore.collection(db, "user_registrations"));
        document.getElementById('total-users').innerText = snapshot.size;
    } catch (error) {
        console.error("Stats Sync Error:", error);
    }
}


async function syncRegistrationConfig() {
    const { doc, onSnapshot } = firebase_firestore;
    const configRef = firebase_firestore.doc(db, "system_settings", "config");

    firebase_firestore.onSnapshot(configRef, (docSnap) => {
        if (docSnap.exists()) {
            const isEnabled = docSnap.data().registration_enabled;
            const btn = document.getElementById('reg-status-btn');
            btn.innerText = isEnabled ? "التسجيل: متاح حالياً ✅" : "التسجيل: مغلق الآن ❌";
            btn.style.background = isEnabled ? "#22c55e" : "#ef4444";
            btn.dataset.status = isEnabled;
        }
    });
}

window.toggleSystemRegistration = async function () {
    const btn = document.getElementById('reg-status-btn');
    const currentStatus = btn.dataset.status === "true";
    const newStatus = !currentStatus;

    if (confirm(`⚠️ هل تريد ${newStatus ? 'فـتح' : 'إغـلاق'} إمكانية تسجيل الحسابات الجديدة للطلاب؟`)) {
        try {
            const configRef = firebase_firestore.doc(db, "system_settings", "config");
            await firebase_firestore.setDoc(configRef, {
                registration_enabled: newStatus,
                last_updated: firebase_firestore.serverTimestamp(),
                updated_by: DEV_UID
            }, { merge: true });
        } catch (error) {
            alert("❌ خطأ في تحديث الإعدادات: " + error.message);
        }
    }
};

function loadUsersRealtime() {
    const usersRef = firebase_firestore.collection(db, "user_registrations");

    firebase_firestore.onSnapshot(usersRef, (snapshot) => {
        const list = document.getElementById('users-list');
        list.innerHTML = "";

        snapshot.forEach((userDoc) => {
            const data = userDoc.data();
            const info = data.registrationInfo || data;
            const isBanned = data.status === "banned" || data.isBanned === true;
            const isVerified = data.status === "verified" || data.manual_verification === true;

            const row = `
                <tr style="${isBanned ? 'opacity: 0.6; background: #2d1616;' : ''}">
                    <td>
                        <div style="font-weight:900; color:${isBanned ? '#ef4444' : '#fff'};">${info.fullName || 'No Name'}</div>
                        <div style="font-size:10px; color:#94a3b8;">ID: ${info.studentID || '---'}</div>
                    </td>
                    <td style="font-family: monospace; font-size:11px;">${data.email}</td>
                    <td>
                        <span class="status-badge" style="background:${isBanned ? '#ef4444' : (isVerified ? '#22c55e' : '#f59e0b')}">
                            ${isBanned ? 'محظور' : (isVerified ? 'نشط' : 'قيد التفعيل')}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex; gap:8px;">
                            <button class="btn" style="background:${isBanned ? '#334155' : '#ef4444'}; font-size:11px;" 
                                onclick="control_ToggleBan('${userDoc.id}', ${isBanned})">
                                ${isBanned ? 'إلغاء حظر' : 'حظر نهائي'}
                            </button>
                            ${!isVerified ? `
                                <button class="btn btn-activate" style="font-size:11px;" onclick="control_ManualActivate('${userDoc.id}')">
                                    تفعيل يدوي
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
            list.innerHTML += row;
        });
    });
}

window.control_ToggleBan = async function (uid, currentStatus) {
    const action = currentStatus ? "إلغاء حظر" : "حظر";
    if (confirm(`❗ هل أنت متأكد من ${action} هذا الطالب؟`)) {
        const ref = firebase_firestore.doc(db, "user_registrations", uid);
        await firebase_firestore.updateDoc(ref, {
            status: currentStatus ? "verified" : "banned",
            isBanned: !currentStatus,
            bannedAt: !currentStatus ? firebase_firestore.serverTimestamp() : null
        });
    }
};

window.control_ManualActivate = async function (uid) {
    if (confirm("تفعيل الحساب يدوياً دون الحاجة لتأكيد الإيميل؟")) {
        const ref = firebase_firestore.doc(db, "user_registrations", uid);
        await firebase_firestore.updateDoc(ref, {
            status: "verified",
            manual_verification: true,
            emailVerified: true 
        });
        alert("✅ تم تفعيل الطالب.");
    }
};

function loadSecurityLogs() {
    const logsRef = firebase_firestore.collection(db, "security_logs");
    const q = firebase_firestore.query(logsRef, firebase_firestore.orderBy("timestamp", "desc"), firebase_firestore.limit(20));

    firebase_firestore.onSnapshot(q, (snapshot) => {
        const logsTable = document.getElementById('security-logs');
        document.getElementById('suspicious-count').innerText = snapshot.size;
        logsTable.innerHTML = "";

        snapshot.forEach((logDoc) => {
            const log = logDoc.data();
            const time = log.timestamp ? log.timestamp.toDate().toLocaleTimeString() : 'الآن';

            logsTable.innerHTML += `
                <tr class="bad-activity" style="border-right: 4px solid #ef4444;">
                    <td style="font-family:monospace; color:#ef4444;">${time}</td>
                    <td style="font-weight:bold;">${log.student_email}</td>
                    <td><span style="color:#fbbf24;">⚠️ ${log.activity}</span></td>
                    <td style="font-size:9px; color:#64748b;">${log.device_info ? log.device_info.substring(0, 50) + '...' : '---'}</td>
                </tr>
            `;
        });
    });
}

function activateAntiHackTraps() {
    window.addEventListener('resize', () => {
        if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) {
            reportSuspiciousActivity("DevTools Opened (F12/Inspect)", auth.currentUser.email);
        }
    });

    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        console.warn("🛡️ Security: Right-click is disabled in God Mode.");
    });
}

async function reportSuspiciousActivity(type, email = "Unknown") {
    try {
        const logsRef = firebase_firestore.collection(db, "security_logs");
        await firebase_firestore.addDoc(logsRef, {
            student_email: email,
            activity: type,
            timestamp: firebase_firestore.serverTimestamp(),
            device_info: navigator.userAgent
        });
    } catch (e) {
        console.error("Fail to log security breach:", e);
    }
}