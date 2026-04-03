
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
    console.log("🌐 الإنترنت عاد.. جاري إخفاء زر الأوفلاين وبدء المزامنة");
    syncOfflineData();
});

window.addEventListener('offline', () => {
    controlOfflineButtonVisibility();
    if (window.showToast) window.showToast("⚠️ انقطع الاتصال.. تم تفعيل وضع التسجيل الأوفلاين", 4000, "#475569");
});

document.addEventListener('DOMContentLoaded', () => {
    controlOfflineButtonVisibility();
    setTimeout(syncOfflineData, 5000);
});


window.openOfflineRegistrationModal = function () {
    const modal = document.getElementById('offlineRegModal');
    const idInput = document.getElementById('offStudentID');

    // محاولة تعبئة الـ ID من الكاش الشخصي
    const cachedProfile = localStorage.getItem('cached_profile_data');
    if (cachedProfile) {
        try {
            const data = JSON.parse(cachedProfile);
            if (data.studentID) idInput.value = data.studentID;
        } catch (e) { }
    }
    if (modal) modal.style.display = 'flex';
};

window.processOfflineQueue = async function () {
    const studentID = document.getElementById('offStudentID').value.trim();
    const sessionPin = document.getElementById('offSessionPin').value.trim();

    if (!studentID || !sessionPin || sessionPin.length < 4) {
        alert("⚠️ يرجى إدخال بيانات صحيحة (الكود والـ PIN)");
        return;
    }

    let queue = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || "[]");
    const isAlreadyInQueue = queue.some(item => item.studentID === studentID && item.sessionPin === sessionPin);

    if (isAlreadyInQueue) {
        alert("⏳ أنت مسجل بالفعل في قائمة الانتظار لهذه الجلسة");
        document.getElementById('offlineRegModal').style.display = 'none';
        return;
    }

    const offlineEntry = {
        studentID: studentID,
        sessionPin: sessionPin,
        submissionTime: Date.now(), 
        deviceId: window.HARDWARE_ID || window.getUniqueDeviceId?.() || "UNKNOWN_DEVICE",
    };

    queue.push(offlineEntry);
    localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(queue));

    const msg = "✅ تم الحفظ بنجاح!\nسيتم التحقق من وقت الكود وإرساله فور عودة الإنترنت.";
    if (window.showToast) window.showToast(msg, 5000, "#1e293b");
    else alert(msg);

    document.getElementById('offlineRegModal').style.display = 'none';
    document.getElementById('offSessionPin').value = '';

    if (navigator.onLine) syncOfflineData();
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

        console.log(`📡 جاري مزامنة ${queue.length} سجلات حضور...`);
        const remainingQueue = [];

        for (const entry of queue) {
            try {
                let studentName = "طالب أوفلاين (" + entry.studentID + ")";
                const studentDoc = await getDoc(doc(db, "students", entry.studentID));
                if (studentDoc.exists()) {
                    studentName = studentDoc.data().name;
                }

                const sessionQuery = query(collection(db, "active_sessions"), where("sessionCode", "==", entry.sessionPin));
                const sessionSnap = await getDocs(sessionQuery);

                if (sessionSnap.empty) {
                    console.warn(`PIN ${entry.sessionPin} غير صالح.`);
                    continue; 
                }

                const sessionDoc = sessionSnap.docs[0];
                const sessionData = sessionDoc.data();
                const subjectName = sessionData.allowedSubject || "مادة غير محددة";

                const sessionStart = sessionData.startTime.toMillis();
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

                    if (window.showToast) window.showToast(`✅ تم تأكيد حضورك: ${subjectName}`, 5000, "#10b981");
                    if (window.playSuccess) window.playSuccess();
                } else {
                    if (window.showToast) window.showToast(`❌ كود ${subjectName} انتهى وقته قبل تسجيلك`, 5000, "#ef4444");
                }

            } catch (error) {
                console.error("فشل مزامنة سجل:", error);
                remainingQueue.push(entry); 
            }
        }

        localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(remainingQueue));

    } catch (criticalError) {
        console.error("خطأ في مكتبات المزامنة:", criticalError);
    }
}
