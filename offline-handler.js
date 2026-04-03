
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
    const msg = lang === 'ar' ? "⚠️ وضع الأوفلاين نشط" : "⚠️ Offline Mode Active";
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
        try {
            studentID = JSON.parse(cachedProfile).studentID;
        } catch (e) { console.error("Profile cache error"); }
    }

    if (!studentID) {
        alert(lang === 'ar' ? "⚠️ يجب تسجيل الدخول أولاً" : "⚠️ Please Login First");
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

    if (inputView && processView) {
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
    }
};

async function syncOfflineData() {
    if (!navigator.onLine) return;

    let queue = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || "[]");
    if (queue.length === 0) return;

    try {
        const firestore = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const { doc, getDoc, getDocs, query, collection, where, setDoc, serverTimestamp } = firestore;

        const db = window.db; 
        if (!db) return;

        const remainingQueue = [];

        for (const entry of queue) {
            try {
                let studentName = "Student (" + entry.studentID + ")";
                const studentDoc = await getDoc(doc(db, "students", entry.studentID));
                if (studentDoc.exists()) {
                    studentName = studentDoc.data().name;
                }

                const sessionQuery = query(collection(db, "active_sessions"), where("sessionCode", "==", entry.sessionPin));
                const sessionSnap = await getDocs(sessionQuery);

                if (sessionSnap.empty) {
                    continue; 
                }

                const sessionDoc = sessionSnap.docs[0];
                const sessionData = sessionDoc.data();
                const subjectName = sessionData.allowedSubject || "Subject";

                const sessionStart = sessionData.startTime?.toMillis() || 0;
                const durationSeconds = (sessionData.duration && sessionData.duration !== -1) ? sessionData.duration : 3600;
                const sessionEnd = sessionStart + (durationSeconds * 1000);

                const isTimeValid = (entry.submissionTime >= sessionStart && entry.submissionTime <= sessionEnd) || sessionData.duration === -1;

                if (isTimeValid) {
                    const uniqueDocId = `${entry.studentID}_${entry.sessionPin}`;

                    await setDoc(doc(db, "offline_attendance_log", uniqueDocId), {
                        studentID: entry.studentID,
                        studentName: studentName,
                        subject: subjectName,
                        sessionPin: entry.sessionPin,
                        doctorName: sessionData.doctorName || "Unknown",
                        offlineTimestamp: new Date(entry.submissionTime),
                        syncTimestamp: serverTimestamp(),
                        deviceId: entry.deviceId,
                        method: "Smart Offline (Verified)"
                    });

                    await setDoc(doc(db, "attendance", uniqueDocId), {
                        id: entry.studentID,
                        name: studentName,
                        subject: subjectName,
                        date: new Date(entry.submissionTime).toLocaleDateString('en-GB'),
                        timestamp: serverTimestamp(),
                        method: "offline_sync",
                        doctorUID: sessionDoc.id
                    });

                    if (window.showToast) {
                        const lang = localStorage.getItem('sys_lang') || 'ar';
                        const msg = lang === 'ar' ? `✅ تم تأكيد حضورك: ${subjectName}` : `✅ Attendance Confirmed: ${subjectName}`;
                        window.showToast(msg, 5000, "#10b981");
                    }
                } else {
                    console.warn("Offline attempt invalid time range");
                }
            } catch (error) {
                console.error("Sync entry error:", error);
                remainingQueue.push(entry); 
            }
        }
        localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(remainingQueue));
    } catch (criticalError) {
        console.error("Firebase library failed to load");
    }
}
