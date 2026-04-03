
const OFFLINE_STORAGE_KEY = "nursing_offline_queue_v1";


function controlOfflineButtonVisibility() {
    const offlineWrapper = document.getElementById('offlineActionsWrapper');
    if (!offlineWrapper) return;

    if (navigator.onLine) {
        offlineWrapper.style.setProperty('display', 'none', 'important');
    } else {
        offlineWrapper.style.setProperty('display', 'block', 'important');
    }
}

window.addEventListener('online', () => {
    controlOfflineButtonVisibility();
    syncOfflineData();
});

window.addEventListener('offline', () => {
    controlOfflineButtonVisibility();
    const lang = localStorage.getItem('sys_lang') || 'ar';
    if (window.showToast) {
        const msg = lang === 'ar' ? "⚠️ انقطع الاتصال.. وضع الأوفلاين متاح" : "⚠️ Disconnected.. Offline Mode Active";
        window.showToast(msg, 4000, "#475569");
    }
});

document.addEventListener('DOMContentLoaded', () => {
    controlOfflineButtonVisibility();
    setTimeout(syncOfflineData, 5000);
});


window.openOfflineRegistrationModal = function () {
    const modal = document.getElementById('offlineRegModal');
    const pinInput = document.getElementById('offSessionPin');
    if (pinInput) pinInput.value = '';

    const inputView = document.getElementById('offlineInputView');
    const processView = document.getElementById('offlineProcessView');
    const cancelBtn = document.getElementById('btnCancelOffline');

    if (inputView) inputView.style.display = 'block';
    if (processView) processView.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'block';

    if (modal) modal.style.display = 'flex';
};

window.processOfflineQueue = async function () {
    const pinElement = document.getElementById('offSessionPin');
    if (!pinElement) return;

    const sessionPin = pinElement.value.trim();
    const lang = localStorage.getItem('sys_lang') || 'ar';

    let studentData = { id: "", name: "", avatar: "fa-user-graduate" };
    const cachedProfile = localStorage.getItem('cached_profile_data');
    if (cachedProfile) {
        try {
            const p = JSON.parse(cachedProfile);
            studentData.id = p.studentID;
            studentData.name = p.fullName;
            studentData.avatar = p.avatarClass || "fa-user-graduate";
        } catch (e) { console.error("Profile cache reading error"); }
    }

    if (!studentData.id) {
        alert(lang === 'ar' ? "⚠️ يجب تسجيل الدخول أولاً أثناء وجود إنترنت" : "⚠️ Please Login First while online");
        return;
    }

    if (sessionPin.length !== 6) {
        alert(lang === 'ar' ? "⚠️ الكود يجب أن يكون 6 أرقام" : "⚠️ PIN must be 6 digits");
        return;
    }

    const inputView = document.getElementById('offlineInputView');
    const processView = document.getElementById('offlineProcessView');
    const cancelBtn = document.getElementById('btnCancelOffline');
    const timerText = document.getElementById('offTimer');

    inputView.style.display = 'none';
    processView.style.display = 'block';
    if (cancelBtn) cancelBtn.style.display = 'none';

    let timeLeft = 3;
    timerText.innerText = timeLeft;

    const countdown = setInterval(() => {
        timeLeft--;
        timerText.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(countdown);
            
            const offlineEntry = {
                studentID: studentData.id,
                studentName: studentData.name,
                avatarClass: studentData.avatar,
                sessionPin: sessionPin,
                submissionTime: Date.now(), 
                deviceId: window.HARDWARE_ID || "DEVICE_OFFLINE"
            };

            let queue = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || "[]");
            if (!queue.some(item => item.sessionPin === sessionPin)) {
                queue.push(offlineEntry);
                localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(queue));
            }

            if (window.showToast) {
                const msg = lang === 'ar' ? "✅ تم الحفظ أوفلاين.. سيتم التأكيد فور عودة النت" : "✅ Saved Offline.. Syncing on reconnect";
                window.showToast(msg, 5000, "#1e293b");
            }
            if (window.playSuccess) window.playSuccess();

            document.getElementById('offlineRegModal').style.display = 'none';
            if (navigator.onLine) syncOfflineData();
        }
    }, 1000);
};

async function syncOfflineData() {
    if (!navigator.onLine) return;

    let queue = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || "[]");
    if (queue.length === 0) return;

    const user = window.auth?.currentUser;
    if (!user) return;

    try {
        const firestore = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const { doc, getDoc, setDoc, serverTimestamp } = firestore;

        const db = window.db; 
        if (!db) return;

        const remainingQueue = [];

        for (const entry of queue) {
            try {
                const codeLogRef = doc(db, "issued_codes_logs", entry.sessionPin);
                const codeLogSnap = await getDoc(codeLogRef);

                if (!codeLogSnap.exists()) {
                    console.warn(`PIN ${entry.sessionPin} is invalid.`);
                    continue; 
                }

                const codeData = codeLogSnap.data();
                
                const isTimeValid = (entry.submissionTime >= codeData.openedAt && 
                                    (codeData.expiresAt === -1 || entry.submissionTime <= codeData.expiresAt));

                if (isTimeValid) {
                    const uniqueDocId = `${entry.studentID}_${entry.sessionPin}`;

                    await setDoc(doc(db, "offline_attendance_log", uniqueDocId), {
                        ...entry,
                        subject: codeData.subject,
                        doctorName: codeData.doctorName,
                        syncTimestamp: serverTimestamp(),
                        method: "Verified Smart Offline"
                    });

                    await setDoc(doc(db, "attendance", uniqueDocId), {
                        id: entry.studentID,
                        name: entry.studentName,
                        subject: codeData.subject,
                        date: new Date(entry.submissionTime).toLocaleDateString('en-GB'),
                        timestamp: serverTimestamp(),
                        method: "offline_sync",
                        doctorUID: codeData.doctorId
                    });

                    await setDoc(doc(db, "active_sessions", codeData.doctorId, "participants", entry.studentID), {
                        id: entry.studentID,
                        name: entry.studentName,
                        avatarClass: entry.avatarClass,
                        uid: user.uid,
                        status: "active",
                        timestamp: serverTimestamp(),
                        isOfflineSync: true
                    });

                    localStorage.setItem('TARGET_DOCTOR_UID', codeData.doctorId);
                    sessionStorage.setItem('TARGET_DOCTOR_UID', codeData.doctorId);

                    if (window.showToast) {
                        const lang = localStorage.getItem('sys_lang') || 'ar';
                        window.showToast(lang === 'ar' ? `✅ تم تأكيد حضورك في ${codeData.subject}` : `✅ Confirmed: ${codeData.subject}`, 5000, "#10b981");
                    }
                    if (window.playSuccess) window.playSuccess();

                    if (typeof window.switchScreen === 'function') window.switchScreen('screenLiveSession');
                    if (typeof window.startLiveSnapshotListener === 'function') window.startLiveSnapshotListener();

                } else {
                    const lang = localStorage.getItem('sys_lang') || 'ar';
                    if (window.showToast) {
                        window.showToast(lang === 'ar' ? `❌ كود ${codeData.subject} انتهت صلاحيته` : `❌ Code for ${codeData.subject} Expired`, 5000, "#ef4444");
                    }
                }

            } catch (error) {
                console.error("Entry sync error:", error);
                remainingQueue.push(entry); 
            }
        }
        localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(remainingQueue));
    } catch (criticalError) {
        console.error("Critical Sync Library error:", criticalError);
    }
}
