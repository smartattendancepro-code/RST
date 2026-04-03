
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
    const msg = lang === 'ar' ? "⚠️ انقطع الاتصال.. تم تفعيل وضع الأوفلاين" : "⚠️ Disconnected.. Offline Mode Active";
    if (window.showToast) window.showToast(msg, 4000, "#475569");
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

    let studentID = "";
    const cachedProfile = localStorage.getItem('cached_profile_data');
    if (cachedProfile) {
        try { studentID = JSON.parse(cachedProfile).studentID; } catch (e) { }
    }

    if (!studentID) {
        alert(lang === 'ar' ? "⚠️ يجب تسجيل الدخول أولاً أثناء وجود إنترنت" : "⚠️ Please Login First while online");
        return;
    }

    if (sessionPin.length !== 6) {
        alert(lang === 'ar' ? "⚠️ كود الجلسة يجب أن يكون 6 أرقام" : "⚠️ PIN must be 6 digits");
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
                studentID: studentID,
                sessionPin: sessionPin,
                submissionTime: Date.now(), 
                deviceId: window.HARDWARE_ID || window.getUniqueDeviceId?.() || "UNKNOWN"
            };

            let queue = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || "[]");
            if (!queue.some(item => item.sessionPin === sessionPin && item.studentID === studentID)) {
                queue.push(offlineEntry);
                localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(queue));
            }

            if (window.showToast) {
                const successMsg = lang === 'ar' ? "✅ تم الحفظ أوفلاين بنجاح" : "✅ Saved Offline Successfully";
                window.showToast(successMsg, 5000, "#10b981");
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
        const { doc, getDoc, getDocs, query, collection, where, setDoc, serverTimestamp } = firestore;

        const db = window.db; 
        if (!db) return;

        const remainingQueue = [];

        for (const entry of queue) {
            try {                let studentName = "Student (" + entry.studentID + ")";
                const studentDoc = await getDoc(doc(db, "students", entry.studentID));
                if (studentDoc.exists()) studentName = studentDoc.data().name;

                const codeLogRef = doc(db, "issued_codes_logs", entry.sessionPin);
                const codeLogSnap = await getDoc(codeLogRef);

                if (!codeLogSnap.exists()) {
                    console.warn(`PIN ${entry.sessionPin} is not a valid system code.`);
                    continue; 
                }

                const codeData = codeLogSnap.data();
                
                const isTimeValid = (entry.submissionTime >= codeData.openedAt && 
                                    (codeData.expiresAt === -1 || entry.submissionTime <= codeData.expiresAt));

                if (isTimeValid) {
                    const uniqueDocId = `${entry.studentID}_${entry.sessionPin}`;

                    await setDoc(doc(db, "offline_attendance_log", uniqueDocId), {
                        studentID: entry.studentID,
                        studentName: studentName,
                        subject: codeData.subject,
                        sessionPin: entry.sessionPin,
                        doctorName: codeData.doctorName,
                        offlineTimestamp: new Date(entry.submissionTime),
                        syncTimestamp: serverTimestamp(),
                        deviceId: entry.deviceId,
                        method: "Smart Offline History-Verified"
                    });

                    await setDoc(doc(db, "attendance", uniqueDocId), {
                        id: entry.studentID,
                        name: studentName,
                        subject: codeData.subject,
                        date: new Date(entry.submissionTime).toLocaleDateString('en-GB'),
                        timestamp: serverTimestamp(),
                        method: "offline_sync",
                        doctorUID: codeData.doctorId
                    });

                    await setDoc(doc(db, "active_sessions", codeData.doctorId, "participants", entry.studentID), {
                        id: entry.studentID,
                        name: studentName,
                        uid: user.uid,
                        status: "active",
                        timestamp: serverTimestamp(),
                        isOfflineSync: true,
                        submissionTime: entry.submissionTime
                    });

                    if (window.showToast) {
                        const lang = localStorage.getItem('sys_lang') || 'ar';
                        window.showToast(lang === 'ar' ? `✅ تم تأكيد حضورك: ${codeData.subject}` : `✅ Confirmed: ${codeData.subject}`, 5000, "#10b981");
                    }
                } else {
                    console.warn(`Code ${entry.sessionPin} expired before submission.`);
                    const lang = localStorage.getItem('sys_lang') || 'ar';
                    if (window.showToast) window.showToast(lang === 'ar' ? `❌ انتهى وقت الكود (${entry.sessionPin})` : `❌ Code Expired (${entry.sessionPin})`, 5000, "#ef4444");
                }

            } catch (error) {
                console.error("Entry sync error:", error);
                remainingQueue.push(entry); 
            }
        }
        localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(remainingQueue));
    } catch (criticalError) {
        console.error("Firebase Sync Library error:", criticalError);
    }
}
