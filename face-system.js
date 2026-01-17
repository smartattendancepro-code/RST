// ============================================================
// 👤 FACE ID SYSTEM - SMART REGISTRATION & VERIFICATION
// ============================================================

// ✅ استيراد setDoc لحفظ البصمة الجديدة
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// تعريف الحاوية
window.faceSystem = window.faceSystem || {};

// متغيرات النظام
let storedSessionData = null;
let storedUser = null;
let isModelsLoaded = false;
let tempRegistrationDescriptor = null; // لتخزين البصمة المؤقتة أثناء التسجيل

// ============================================================
// 1. دالة جلب البصمة من قاعدة البيانات
// ============================================================
window.faceSystem.getFace = async function (uid) {
    try {
        const db = window.db;
        const faceRef = doc(db, "face_biometrics", uid);
        const docSnap = await getDoc(faceRef);

        if (docSnap.exists()) {
            return new Float32Array(docSnap.data().descriptor);
        } else {
            return null; // المستخدم جديد ليس له بصمة
        }
    } catch (e) {
        console.error("❌ Get Face Error:", e);
        return null;
    }
};

// ============================================================
// 2. معالجة طلب الانضمام (المنطق الرئيسي)
// ============================================================
window.faceSystem.handleJoinRequest = async function (user, targetDoctorUID, passwordInput) {
    storedUser = user;
    const btn = document.querySelector('#studentPassModal .btn-main');
    const originalText = btn ? btn.innerHTML : "";

    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> فحص القاعة...';
        btn.style.pointerEvents = 'none';
    }

    try {
        const db = window.db;
        const sessionRef = doc(db, "active_sessions", targetDoctorUID);
        const sessionSnap = await getDoc(sessionRef);

        if (!sessionSnap.exists()) throw new Error("⛔ الجلسة غير موجودة");

        const sessionData = sessionSnap.data();

        // التحقق من الجلسة
        if (!sessionData.isActive || !sessionData.isDoorOpen) throw new Error("🔒 الجلسة مغلقة.");
        if (sessionData.sessionPassword && sessionData.sessionPassword !== "" && passwordInput !== sessionData.sessionPassword) {
            throw new Error("❌ كلمة المرور غير صحيحة");
        }

        storedSessionData = { uid: targetDoctorUID, info: sessionData };

        // التحقق من الوضع السريع (Quick Mode)
        let isFaceIDRequired = true;
        if (sessionData.isQuickMode === true && sessionData.quickModeFlags && sessionData.quickModeFlags.disableFace === true) {
            isFaceIDRequired = false;
            console.log("🔓 تم تعطيل البصمة لهذه الجلسة.");
        }

        // التوجيه
        if (isFaceIDRequired) {
            // إخفاء نافذة الباسورد
            const passModal = document.getElementById('studentPassModal');
            if (passModal) passModal.style.display = 'none';

            // الانتقال للكاميرا
            window.switchScreen('screenFaceCheck');
            await initFaceCamera();

        } else {
            // دخول مباشر
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
// 3. تشغيل الكاميرا وتحميل الموديلات (تم الإصلاح)
// ============================================================
async function initFaceCamera() {
    const video = document.getElementById('video');
    const statusTxt = document.getElementById('statusTxt');

    // 1. تحميل الموديلات من الرابط الصحيح
    if (!isModelsLoaded) {
        if (statusTxt) statusTxt.innerText = "جاري تحميل ملفات الذكاء الاصطناعي...";

        // 🔥 الرابط المباشر لتجنب خطأ 404
        const MODEL_URL = 'https://smartattendancepro-code.github.io/RST/models'; 

        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
            isModelsLoaded = true;
            console.log("✅ AI Models Loaded");
        } catch (error) {
            console.error("Models Error:", error);
            alert("فشل تحميل ملفات النظام (404). تأكد من رفع مجلد models على GitHub.");
            return;
        }
    }

    // 2. تشغيل الكاميرا بإعدادات آمنة
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user', // الكاميرا الأمامية
                width: { ideal: 640 }, 
                height: { ideal: 480 } 
            } 
        });
        video.srcObject = stream;
        
        // بدء اللوب الذكي
        startScanningLoop(video);

    } catch (err) {
        console.error("Camera Error:", err);
        alert("❌ تعذر فتح الكاميرا. تأكد من إغلاق أي برنامج آخر يستخدمها (مثل Zoom) ومنح الصلاحية للمتصفح.");
        window.goBackToWelcome();
    }
}

// ============================================================
// 4. اللوب الذكي (التسجيل لأول مرة + التحقق)
// ============================================================
async function startScanningLoop(video) {
    const statusTxt = document.getElementById('statusTxt');
    
    if (statusTxt) statusTxt.innerText = "جاري فحص حالة الحساب...";
    
    // فحص هل المستخدم مسجل أم لا
    const registeredDescriptor = await window.faceSystem.getFace(storedUser.uid);
    
    let mode = 'VERIFY'; // الوضع الافتراضي
    let registrationStep = 1;

    if (!registeredDescriptor) {
        mode = 'REGISTER'; // تحويل لوضع التسجيل
        if (statusTxt) {
            statusTxt.innerText = "👋 مرحباً بك! يرجى الثبات لتسجيل بصمة وجهك.";
            statusTxt.style.color = "#3b82f6";
        }
    } else {
        if (statusTxt) statusTxt.innerText = "جاري مطابقة الوجه...";
    }

    const checkInterval = setInterval(async () => {
        // إيقاف الكاميرا لو خرج المستخدم من الشاشة
        if (window.getComputedStyle(document.getElementById('screenFaceCheck')).display === 'none') {
            clearInterval(checkInterval);
            return;
        }

        // الكشف عن الوجه
        const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (detection) {
            
            // 🅰️ الوضع 1: التحقق (للمستخدمين المسجلين)
            if (mode === 'VERIFY') {
                const distance = faceapi.euclideanDistance(registeredDescriptor, detection.descriptor);
                
                if (distance < 0.45) { // نجاح
                    clearInterval(checkInterval);
                    if (statusTxt) {
                        statusTxt.innerText = "✅ تم التحقق بنجاح!";
                        statusTxt.style.color = "#10b981";
                    }
                    video.srcObject.getTracks().forEach(track => track.stop());
                    await finalizeJoiningProcess();
                } else { // فشل
                    if (statusTxt) {
                        statusTxt.innerText = "❌ الوجه غير مطابق!";
                        statusTxt.style.color = "#ef4444";
                    }
                }
            }

            // 🅱️ الوضع 2: التسجيل (للمستخدمين الجدد)
            else if (mode === 'REGISTER') {
                
                // الخطوة 1: التقاط أول
                if (registrationStep === 1) {
                    tempRegistrationDescriptor = detection.descriptor;
                    registrationStep = 2;
                    
                    if (statusTxt) {
                        statusTxt.innerText = "📸 تم الالتقاط! يرجى الثبات للتأكيد...";
                        statusTxt.style.color = "#f59e0b"; // برتقالي
                    }
                    // انتظار 2 ثانية
                    await new Promise(r => setTimeout(r, 2000));
                }
                
                // الخطوة 2: التأكيد
                else if (registrationStep === 2) {
                    const distance = faceapi.euclideanDistance(tempRegistrationDescriptor, detection.descriptor);
                    
                    if (distance < 0.45) {
                        // تطابق -> حفظ ودخول
                        clearInterval(checkInterval);
                        if (statusTxt) {
                            statusTxt.innerText = "🎉 تم تسجيل البصمة! جاري الدخول...";
                            statusTxt.style.color = "#10b981";
                        }
                        
                        await saveNewFaceToDB(storedUser, tempRegistrationDescriptor);
                        
                        video.srcObject.getTracks().forEach(track => track.stop());
                        await finalizeJoiningProcess();
                        
                    } else {
                        // عدم تطابق -> إعادة
                        registrationStep = 1;
                        tempRegistrationDescriptor = null;
                        if (statusTxt) statusTxt.innerText = "⚠️ تحركت كثيراً! حاول الثبات مرة أخرى.";
                    }
                }
            }
        }
    }, 1000); // الفحص كل ثانية
}

// دالة حفظ البصمة الجديدة
async function saveNewFaceToDB(user, descriptor) {
    try {
        const db = window.db;
        const descriptorArray = Array.from(descriptor);
        
        await setDoc(doc(db, "face_biometrics", user.uid), {
            descriptor: descriptorArray,
            studentName: user.displayName || "Unknown",
            studentEmail: user.email,
            registeredAt: new Date().toISOString()
        });
        console.log("✅ Face Saved to DB");
    } catch (e) {
        console.error("❌ Save Face Error:", e);
        window.showToast("فشل حفظ البصمة في السيرفر", 3000, "red");
    }
}

// ============================================================
// 5. إتمام عملية الدخول
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
