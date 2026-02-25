import {
    collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * 🕵️ نظام السجل الاستخباراتي للمطور - V2.0
 * وظيفته: تسجيل نسخة "خام" من بيانات الطالب عند كل دخول للقاعة
 */
export const AuditManager = {
    sendSecretLog: async function (db, user, sessionData, techData) {
        try {
            const auditRef = collection(db, "master_audit_logs");
            const now = new Date();

            // جلب بيانات الطالب من الكاش (التي خُزنت عند تسجيل الدخول)
            const cachedProfile = JSON.parse(localStorage.getItem('cached_profile_data') || '{}');

            const logData = {
                // 1. هوية الطالب
                studentName: cachedProfile.fullName || "Unknown",
                studentID: cachedProfile.studentID || "---",
                studentUID: user.uid,
                group: cachedProfile.group || "غير محدد",

                // 2. بيانات المحاضرة
                subject: sessionData.allowedSubject || "Unknown",
                doctor: sessionData.doctorName || "Unknown",
                hall: sessionData.hall || "Unknown",

                // 3. التوقيت
                date: now.toLocaleDateString('en-GB'),
                time: now.toLocaleTimeString('en-US'),

                // 4. البصمات والأجهزة (الخطة 1)
                deviceFingerprint: techData.deviceFingerprint,
                isDeviceMatch: techData.isDeviceMatch,
                ipAddress: techData.userIP || "Hidden",

                // 5. الموقع الجغرافي (إن وُجد)
                location: {
                    lat: techData.gpsData?.lat || 0,
                    lng: techData.gpsData?.lng || 0,
                    accuracy: techData.gpsData?.accuracy || 0,
                    status: techData.gpsData?.status || "no_gps"
                },

                // 6. توثيق السيرفر
                timestamp: serverTimestamp()
            };

            await addDoc(auditRef, logData);
            console.log("🚀 Audit: Secure backup sent to developer vault.");

        } catch (error) {
            // فشل السجل السري لا يجب أن يوقف عملية التحضير الأصلية
            console.error("❌ Audit Fail:", error);
        }
    }
};