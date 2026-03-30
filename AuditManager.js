import {
    doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";



const _sanitize = (value, maxLen = 120) => {
    if (typeof value !== "string") return "INVALID";
    return value.replace(/[<>"'`\\\/\x00-\x1F]/g, "").trim().slice(0, maxLen) || "EMPTY";
};

const _safeNumber = (value, min = -Infinity, max = Infinity, fallback = 0) => {
    const n = Number(value);
    if (!isFinite(n) || n < min || n > max) return fallback;
    return n;
};

const _safeBool = (value, fallback = false) => {
    if (typeof value === "boolean") return value;
    return fallback;
};

const _validateAuthUser = (user) => {
    if (!user || typeof user !== "object") return false;
    if (typeof user.uid !== "string" || user.uid.trim() === "") return false;
    if (typeof user.email !== "string" || !user.email.includes("@")) return false;
    return true;
};

const _getVerifiedProfile = (authUser) => {
    try {
        const raw = localStorage.getItem('cached_profile_data');
        if (!raw) return {};
        const profile = JSON.parse(raw);

        if (profile.uid && profile.uid !== authUser.uid) {
            console.warn("🚨 [Security] Cache UID mismatch — cache ignored.");
            return {};
        }

        return profile;
    } catch {
        return {};
    }
};

const _getGPSFromManager = () => {
    try {
        if (typeof window === "undefined") return null;
        if (!window.GPSManager || typeof window.GPSManager.getForJoin !== "function") {
            console.warn("⚠️ [Audit] GPSManager غير متاح.");
            return null;
        }
        const gps = window.GPSManager.getForJoin();
        if (!gps || gps.status === "no_cache") return null;
        return gps;
    } catch {
        return null;
    }
};



export const AuditManager = {

    sendSecretLog: async function (db, user, sessionData, techData) {
        try {

       
            if (!_validateAuthUser(user)) {
                console.error("🚨 [Audit] Invalid or missing Auth user — log aborted.");
                return;
            }

            const TRUSTED_UID   = user.uid;
            const TRUSTED_EMAIL = user.email;

            const now = new Date();

            const dateKey = now.toLocaleDateString('en-GB')
                .split('/').reverse().join('-');  // YYYY-MM-DD

            const timeStr = now.toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            });

            const doctorUID   = _sanitize(sessionData?.doctorUID      || "unknown_doctor", 64);
            const doctorName  = _sanitize(sessionData?.doctorName     || "Unknown Doctor");
            const subjectName = _sanitize(sessionData?.allowedSubject || "Unknown Subject");
            const hallName    = _sanitize(sessionData?.hall           || "Unknown Hall");
            const sessionCode = _sanitize(sessionData?.sessionCode    || "----", 32);
            const isActive    = _safeBool(sessionData?.isActive, true);

      
            const cachedProfile = _getVerifiedProfile(user);

            const studentName  = _sanitize(cachedProfile.fullName  || user.displayName || "Unknown Student");
            const studentID    = _sanitize(cachedProfile.studentID || "---", 32);
            const studentGroup = _sanitize(cachedProfile.group     || cachedProfile.level || "غير محدد");

            const deviceInfo = {
                fingerprint  : _sanitize(techData?.deviceFingerprint || "no_fingerprint", 128),
                isDeviceMatch: _safeBool(techData?.isDeviceMatch, false), // الافتراضي: غير موثوق
                ipAddress    : _sanitize(techData?.userIP || "Hidden", 64),
                userAgent    : _sanitize(navigator.userAgent  || "Unknown", 200),
                platform     : _sanitize(navigator.platform   || "Unknown", 64),
                language     : _sanitize(navigator.language   || "Unknown", 16),
                screenSize   : `${_safeNumber(screen.width,200,7680,0)}x${_safeNumber(screen.height,200,4320,0)}`,
                timezone     : _sanitize(Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown", 64)
            };


            const _gps = _getGPSFromManager();

            const gpsInfo = {
                lat          : _safeNumber(_gps?.lat      ?? techData?.gpsData?.lat,      -90,  90,  0),
                lng          : _safeNumber(_gps?.lng      ?? techData?.gpsData?.lng,     -180, 180,  0),
                accuracy     : _safeNumber(_gps?.accuracy ?? techData?.gpsData?.accuracy,    0, 1e5,  0),
                in_range     : _safeBool(_gps?.inRange    ?? techData?.gpsData?.in_range,  false),
                status       : _sanitize((_gps?.status    ?? techData?.gpsData?.status ?? "no_gps"), 32),
                skipped      : _safeBool(_gps?.skipped, false),

                distance     : _sanitize(String(techData?.gpsData?.distance ?? "Unknown"), 32),
                is_suspicious: _safeBool(techData?.gpsData?.is_suspicious, false),
                cheat_reason : _sanitize(techData?.gpsData?.cheat_reason   || "", 200),

                source       : _gps ? "GPSManager" : "techData_fallback"
            };


            const isClean = deviceInfo.isDeviceMatch
                         && gpsInfo.in_range
                         && !gpsInfo.is_suspicious;

            const securityResult = {
                device_trusted : deviceInfo.isDeviceMatch,
                gps_in_range   : gpsInfo.in_range,
                gps_suspicious : gpsInfo.is_suspicious,
                gps_skipped    : gpsInfo.skipped,
                overall_status : isClean ? "CLEAN" : "FLAGGED"
            };

            const sessionInfoRef = doc(db,
                "audit_logs", dateKey,
                "sessions",   doctorUID
            );

            const studentLogRef = doc(db,
                "audit_logs", dateKey,
                "sessions",   doctorUID,
                "students",   TRUSTED_UID  
            );

            await setDoc(sessionInfoRef, {
                doctorUID   : doctorUID,
                doctorName  : doctorName,
                subject     : subjectName,
                hall        : hallName,
                date        : dateKey,
                sessionCode : sessionCode,
                isActive    : isActive,
                last_updated: serverTimestamp()
            }, { merge: true });


            await setDoc(studentLogRef, {

                studentUID  : TRUSTED_UID,
                studentEmail: TRUSTED_EMAIL,

                studentName : studentName,
                studentID   : studentID,
                group       : studentGroup,

                entry_time  : timeStr,
                entry_date  : dateKey,
                timestamp   : serverTimestamp(),

                doctorUID   : doctorUID,
                doctorName  : doctorName,
                subject     : subjectName,
                hall        : hallName,

                device          : deviceInfo,

                gps             : gpsInfo,

                security_result : securityResult

            }, { merge: true });

            console.log(
                `✅ Audit V5-Secure: [${studentName}] → [${dateKey}] → [${doctorName}] → [${subjectName}]`,
                `| GPS: ${gpsInfo.source} | Status: ${securityResult.overall_status}`
            );

        } catch (error) {
            console.error("⚠️ [Critical Audit Error]:", error);
        }
    }
};
