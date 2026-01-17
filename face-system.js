// ============================================================
// 👤 FACE ID SYSTEM - FULL LOGIC
// ============================================================

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ✅ 1. تعريف الحاوية الأساسية (هذا هو السطر الذي كان ناقصاً)
window.faceSystem = window.faceSystem || {};

// متغيرات داخلية
let storedSessionData = null;
let storedUser = null;
let isModelsLoaded = false;

// ============================================================
// 2. دالة جلب البصمة (نحتاجها للمقارنة)
// ============================================================
window.faceSystem.getFace = async function (uid) {
    try {
        const db = window.db; // استخدام قاعدة البيانات الرئيسية
        const faceRef = doc(db, "face_biometrics", uid);
        const docSnap = await getDoc(faceRef);

        if (docSnap.exists()) {
            return new Float32Array(docSnap.data().descriptor);
        } else {
            return null;
        }
    } catch (e) {
        console.error("❌ Get Face Error:", e);
        return null;
    }
};

// ============================================================
// 3. الدالة الرئيسية: استقبال طلب الدخول (Multi-Room Logic)
// ============================================================
window.faceSystem.handleJoinRequest = async function (user, targetDoctorUID, passwordInput) {
    storedUser = user;
    const btn = document.querySelector('#studentPassModal .btn-main');
    const originalText = btn ? btn.innerHTML : "";

    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> فحص إعدادات القاعة...';
        btn.style.pointerEvents = 'none';
    }

    try {
        const db = window.db;
        const sessionRef = doc(db, "active_sessions", targetDoctorUID);
        const sessionSnap = await getDoc(sessionRef);

        if (!sessionSnap.exists()) throw new Error("⛔ الجلسة غير موجودة");

        const sessionData = sessionSnap.data();

        // 1. التحقق من حالة الجلسة والباسورد
        if (!sessionData.isActive || !sessionData.isDoorOpen) throw new Error("🔒 الجلسة مغلقة.");
        if (sessionData.sessionPassword && sessionData.sessionPassword !== "" && passwordInput !== sessionData.sessionPassword) {
            throw new Error("❌ كلمة المرور غير صحيحة");
        }

        storedSessionData = { uid: targetDoctorUID, info: sessionData };

        // ============================================================
        // 🚦 نقطة الفصل الذكية (Smart Multi-Room Logic)
        // ============================================================

        // الافتراضي: البصمة مطلوبة دائماً للأمان
        let isFaceIDRequired = true;

        // 🔥 التعديل هنا: فحص إعدادات "هذه الجلسة تحديداً"
        // نقرأ من المتغير sessionData الذي جلبناه بالأعلى (لا حاجة لطلب جديد للسيرفر)

        if (sessionData.isQuickMode === true) {
            // التحقق: هل الدكتور صاحب هذه الجلسة قام بتعطيل البصمة؟
            if (sessionData.quickModeFlags && sessionData.quickModeFlags.disableFace === true) {
                isFaceIDRequired = false; // نعم، تم الإعفاء لهذه الجلسة فقط
                console.log("🔓 تم تعطيل البصمة بواسطة المحاضر لهذه الجلسة.");
            }
        }

        // ============================================================
        // 🛤️ توجيه الطالب بناءً على القرار
        // ============================================================

        if (isFaceIDRequired) {
            // ✅ المسار 1: البصمة مطلوبة (فتح الكاميرا)
            console.log("📸 مطلوب بصمة وجه...");

            // إغلاق نافذة الباسورد
            const passModal = document.getElementById('studentPassModal');
            if (passModal) passModal.style.display = 'none';

            // الانتقال لشاشة الكاميرا
            window.switchScreen('screenFaceCheck');

            // تشغيل الكاميرا والذكاء الاصطناعي
            await initFaceCamera();

        } else {
            // ✅ المسار 2: دخول مباشر (تم الإعفاء)
            console.log("⚡ دخول سريع (تم تخطي البصمة).");
            await finalizeJoiningProcess();
        }

    } catch (e) {
        console.error("Join Flow Error:", e);
        window.showToast("⚠️ " + e.message, 4000, "#ef4444");
        if (btn) {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
    }
};

// ============================================================
// 4. تشغيل الكاميرا والذكاء الاصطناعي
// ============================================================
async function initFaceCamera() {
    const video = document.getElementById('video');
    const statusTxt = document.getElementById('statusTxt');

    // تحميل الموديلات
    if (!isModelsLoaded) {
        if (statusTxt) statusTxt.innerText = "جاري تحميل ملفات الذكاء الاصطناعي...";

        // تأكد من وجود فولدر models بجانب ملف index.html
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('./models')
        ]);
        isModelsLoaded = true;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        video.srcObject = stream;
        if (statusTxt) statusTxt.innerText = "جاري البحث عن وجهك...";

        startScanningLoop(video);

    } catch (err) {
        alert("❌ تعذر فتح الكاميرا: " + err);
        window.goBackToWelcome();
    }
}

async function startScanningLoop(video) {
    const statusTxt = document.getElementById('statusTxt');

    // هل الطالب مسجل بصمة أصلاً؟
    const registeredDescriptor = await window.faceSystem.getFace(storedUser.uid);

    if (!registeredDescriptor) {
        alert("⚠️ أنت لم تسجل بصمة وجهك بعد! يرجى التواصل مع الشؤون.");
        video.srcObject.getTracks().forEach(track => track.stop());
        window.goBackToWelcome();
        return;
    }

    const checkInterval = setInterval(async () => {
        if (window.getComputedStyle(document.getElementById('screenFaceCheck')).display === 'none') {
            clearInterval(checkInterval); // وقف اللوب لو خرج من الشاشة
            return;
        }

        const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (detection) {
            const distance = faceapi.euclideanDistance(registeredDescriptor, detection.descriptor);
            console.log("Distance:", distance);

            if (distance < 0.45) { // معيار التطابق
                clearInterval(checkInterval);
                if (statusTxt) {
                    statusTxt.innerText = "✅ تم التحقق بنجاح!";
                    statusTxt.style.color = "#10b981";
                }

                video.srcObject.getTracks().forEach(track => track.stop()); // قفل الكاميرا
                await finalizeJoiningProcess();
            } else {
                if (statusTxt) {
                    statusTxt.innerText = "❌ الوجه غير مطابق!";
                    statusTxt.style.color = "#ef4444";
                }
            }
        }
    }, 1000);
}

// ============================================================
// 5. إتمام الدخول (Backend)
// ============================================================
async function finalizeJoiningProcess() {
    window.showToast("جاري تسجيل الحضور...", 2000, "#3b82f6");

    try {
        const gpsData = await window.getSilentLocationData();
        const deviceID = localStorage.getItem("unique_device_id_v3");
        const idToken = await storedUser.getIdToken();

        const response = await fetch(`${window.BACKEND_URL}/joinSessionSecure`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                studentUID: storedUser.uid,
                sessionDocID: storedSessionData.uid,
                gpsLat: gpsData.lat || 0,
                gpsLng: gpsData.lng || 0,
                deviceFingerprint: deviceID
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            window.playSuccess();
            window.showToast(`✅ ${result.message}`, 3000, "#10b981");

            sessionStorage.setItem('TARGET_DOCTOR_UID', storedSessionData.uid);
            sessionStorage.removeItem('TEMP_DR_UID');

            if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = storedSessionData.info.doctorName;
            if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = storedSessionData.info.allowedSubject;

            window.switchScreen('screenLiveSession');
            if (window.startLiveSnapshotListener) window.startLiveSnapshotListener();

        } else {
            throw new Error(result.error || "رفض النظام دخولك.");
        }

    } catch (error) {
        console.error("Finalize Error:", error);
        window.showToast("❌ " + error.message, 4000, "#ef4444");
        window.goBackToWelcome();
    }
}

console.log("👤 Face System Module Loaded Fully ✅");