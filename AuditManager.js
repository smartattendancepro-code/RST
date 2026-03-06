import {
    doc, setDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


export const AuditManager = {

    sendSecretLog: async function (db, user, sessionData, techData) {
        try {
            const now = new Date();

            // ============================
            // 1️⃣  تحديد التواريخ والمعرفات
            // ============================
            const dateKey = now.toLocaleDateString('en-GB')
                .split('/')
                .reverse()
                .join('-');   // YYYY-MM-DD

            const timeStr = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });

            const doctorUID = sessionData.doctorUID || Object.keys(sessionData)[0] || "unknown_doctor";
            const doctorName = sessionData.doctorName || "Unknown Doctor";
            const subjectName = sessionData.allowedSubject || "Unknown Subject";
            const hallName = sessionData.hall || "Unknown Hall";

            // ============================
            // 2️⃣  بيانات الطالب من الكاش
            // ============================
            let cachedProfile = {};
            try {
                cachedProfile = JSON.parse(localStorage.getItem('cached_profile_data') || '{}');
            } catch (e) { /* ignore */ }

            const studentName = cachedProfile.fullName || user.displayName || "Unknown Student";
            const studentID = cachedProfile.studentID || "---";
            const studentGroup = cachedProfile.group || cachedProfile.level || "غير محدد";

            // ============================
            // 3️⃣  بيانات الأمان والبصمة
            // ============================
            const deviceInfo = {
                fingerprint: techData.deviceFingerprint || "no_fingerprint",
                isDeviceMatch: techData.isDeviceMatch ?? true,
                ipAddress: techData.userIP || "Hidden",
                userAgent: navigator.userAgent || "Unknown",
                platform: navigator.platform || "Unknown",
                language: navigator.language || "Unknown",
                screenSize: `${screen.width}x${screen.height}`,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown"
            };

            const gpsInfo = {
                lat: techData.gpsData?.lat || 0,
                lng: techData.gpsData?.lng || 0,
                accuracy: techData.gpsData?.accuracy || 0,
                distance: techData.gpsData?.distance || "Unknown",
                in_range: techData.gpsData?.in_range ?? false,
                status: techData.gpsData?.status || "no_gps",
                is_suspicious: techData.gpsData?.is_suspicious || false,
                cheat_reason: techData.gpsData?.cheat_reason || ""
            };

            // ============================
            // 4️⃣  المسارات في Firestore
            // ============================
            //  audit_logs → {date} → sessions → {doctorUID} → students → {studentUID}

            const sessionInfoRef = doc(
                db,
                "audit_logs", dateKey,
                "sessions", doctorUID
            );

            const studentLogRef = doc(
                db,
                "audit_logs", dateKey,
                "sessions", doctorUID,
                "students", user.uid
            );

            // ============================
            // 5️⃣  كتابة بيانات الجلسة (مرة واحدة، merge)
            // ============================
            await setDoc(sessionInfoRef, {
                doctorUID: doctorUID,
                doctorName: doctorName,
                subject: subjectName,
                hall: hallName,
                date: dateKey,
                sessionCode: sessionData.sessionCode || "----",
                isActive: sessionData.isActive ?? true,
                last_updated: serverTimestamp()
            }, { merge: true });

            // ============================
            // 6️⃣  كتابة سجل الطالب الكامل
            // ============================
            await setDoc(studentLogRef, {

                // --- هوية الطالب ---
                studentUID: user.uid,
                studentName: studentName,
                studentID: studentID,
                studentEmail: user.email || "---",
                group: studentGroup,

                // --- بيانات الدخول ---
                entry_time: timeStr,
                entry_date: dateKey,
                timestamp: serverTimestamp(),

                // --- بيانات الجلسة ---
                doctorUID: doctorUID,
                doctorName: doctorName,
                subject: subjectName,
                hall: hallName,

                // --- البصمة والأمان ---
                device: deviceInfo,

                // --- الموقع الجغرافي ---
                gps: gpsInfo,

                // --- نتيجة الفحص الأمني ---
                security_result: {
                    device_trusted: techData.isDeviceMatch ?? true,
                    gps_in_range: gpsInfo.in_range,
                    gps_suspicious: gpsInfo.is_suspicious,
                    overall_status: (techData.isDeviceMatch && gpsInfo.in_range && !gpsInfo.is_suspicious)
                        ? "CLEAN" : "FLAGGED"
                }

            }, { merge: true });  // merge عشان لو دخل أكتر من مرة يتحدث مش يتكرر

            console.log(`✅ Audit V4: Logged [${studentName}] → [${dateKey}] → [${doctorName}] → [${subjectName}]`);

        } catch (error) {
            // فشل الأرشفة لا يعطل دخول الطالب
            console.error("⚠️ [Critical Audit Error]:", error);
        }
    }
};
