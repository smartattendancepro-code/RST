// ============================================================
//  نظام كشف الاشتباه في التسجيل بالنيابة
//  يضاف في: script.js أو admin-session.js
// ============================================================

// ── 1. عند تسجيل حضور طالب، احفظ بصمته وIP في Firebase ──────
// في الدالة اللي بتسجل الحضور (مثلاً confirmAttendance أو submitAttendance)
// أضف الكود ده قبل أو بعد ما تكتب بيانات الحضور:

async function saveStudentFingerprint(sessionId, studentData) {
    const studentIp = await getStudentIP();           // دالة موجودة بالفعل
    const deviceId = localStorage.getItem('nursing_secure_device_v4') || window.HARDWARE_ID || "UNKNOWN";
    // الـ fingerprint الموجود بالفعل

    const fingerprintRef = doc(db, `active_sessions/${sessionId}/fingerprints/${studentData.code}`);

    await setDoc(fingerprintRef, {
        ip: studentIp,
        deviceId: deviceId,
        name: studentData.name,
        timestamp: Date.now()
    });

    // ── بعد ما تحفظ، افحص هل في اشتباه ──
    await checkForFraud(sessionId, studentData, studentIp, deviceId);
}


async function checkForFraud(sessionId, newStudent, newIp, newDeviceId) {

    // ✅ المسار الصح هو participants مش fingerprints
    const participantsRef = collection(db, `active_sessions/${sessionId}/participants`);
    const allSnap = await getDocs(participantsRef);

    if (allSnap.empty) return;

    for (const docSnap of allSnap.docs) {
        const data = docSnap.data();

        // تجاهل نفس الطالب
        if (data.uid === newStudent.uid) continue;

        // ✅ البيانات جوه trap_report
        const trapReport = data.trap_report;
        if (!trapReport) continue;

        const existingIp = trapReport.ip_address;
        const existingDeviceId = trapReport.device_id_used;

        const sameIP = existingIp === newIp;
        const sameDevice = existingDeviceId === newDeviceId;

        if (sameIP && sameDevice) {
            await setDoc(
                doc(db, `active_sessions/${sessionId}/fraud_alerts/${newStudent.code}`),
                {
                    suspectName: newStudent.name,   // ← المسجَّل بجهاز غيره
                    suspectCode: newStudent.code,
                    originalName: data.name,         // ← صاحب الجهاز
                    originalCode: data.uid,
                    sharedIp: newIp,
                    sharedDevice: newDeviceId,
                    reason: 'same_device_different_student',
                    sessionId: sessionId,
                    timestamp: Date.now(),
                    seen: false
                }
            );
            break;
        }
    }
}


// ── 3. واجهة التنبيه للدكتور ─────────────────────────────────
window.showFraudAlert = function (data) {
    // أزل أي تنبيه قديم
    const old = document.getElementById('fraudAlertToast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'fraudAlertToast';
    toast.innerHTML = `
        <style>
            #fraudAlertToast {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(-120px);
                z-index: 2147483647;
                width: 90%;
                max-width: 360px;
                background: #ffffff;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(239, 68, 68, 0.25), 0 0 0 1px rgba(239,68,68,0.15);
                overflow: hidden;
                animation: fraudSlideIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
                font-family: 'Cairo', sans-serif;
            }

            @keyframes fraudSlideIn {
                to { transform: translateX(-50%) translateY(0); }
            }

            @keyframes fraudSlideOut {
                to { transform: translateX(-50%) translateY(-150px); opacity: 0; }
            }

            .fraud-header {
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                padding: 14px 18px;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .fraud-pulse-icon {
                width: 38px;
                height: 38px;
                background: rgba(255,255,255,0.2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                color: white;
                flex-shrink: 0;
                animation: fraudPulse 1.5s infinite;
            }

            @keyframes fraudPulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.4); }
                50% { box-shadow: 0 0 0 8px rgba(255,255,255,0); }
            }

            .fraud-header-text h4 {
                margin: 0;
                color: white;
                font-size: 13px;
                font-weight: 900;
                letter-spacing: 0.5px;
            }

            .fraud-header-text p {
                margin: 2px 0 0 0;
                color: rgba(255,255,255,0.75);
                font-size: 11px;
            }

            .fraud-body {
                padding: 16px 18px;
            }

            .fraud-student-row {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                border-radius: 14px;
                background: #fef2f2;
                border: 1px solid #fecaca;
                margin-bottom: 10px;
            }

            .fraud-avatar {
                width: 42px;
                height: 42px;
                border-radius: 12px;
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                color: white;
                flex-shrink: 0;
            }

            .fraud-student-info {
                flex: 1;
            }

            .fraud-student-info .s-name {
                font-size: 14px;
                font-weight: 900;
                color: #1e293b;
                display: block;
            }

            .fraud-student-info .s-code {
                font-size: 11px;
                color: #64748b;
                font-family: 'Outfit', monospace;
            }

            .fraud-reason-tag {
                background: #fee2e2;
                color: #b91c1c;
                font-size: 10px;
                font-weight: 800;
                padding: 3px 8px;
                border-radius: 6px;
                border: 1px solid #fca5a5;
                white-space: nowrap;
            }

            .fraud-ip-row {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 11px;
                color: #64748b;
                padding: 8px 12px;
                background: #f8fafc;
                border-radius: 10px;
                border: 1px dashed #e2e8f0;
                margin-bottom: 14px;
                font-family: monospace;
                direction: ltr;
            }

            .fraud-ip-row i {
                color: #ef4444;
            }

            .fraud-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }

            .btn-fraud-dismiss {
                padding: 11px;
                border-radius: 12px;
                border: 1px solid #e2e8f0;
                background: #f8fafc;
                color: #64748b;
                font-weight: 700;
                font-size: 12px;
                cursor: pointer;
                font-family: 'Cairo', sans-serif;
                transition: 0.2s;
            }

            .btn-fraud-dismiss:active { transform: scale(0.96); }

            .btn-fraud-remove {
                padding: 11px;
                border-radius: 12px;
                border: none;
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                color: white;
                font-weight: 800;
                font-size: 12px;
                cursor: pointer;
                font-family: 'Cairo', sans-serif;
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
                transition: 0.2s;
            }

            .btn-fraud-remove:active { transform: scale(0.96); }

            .fraud-close-x {
                position: absolute;
                top: 12px;
                left: 12px;  /* لأن الكارت LTR */
                background: rgba(255,255,255,0.2);
                border: none;
                width: 26px;
                height: 26px;
                border-radius: 50%;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
            }
        </style>

        <div class="fraud-header">
            <div class="fraud-pulse-icon">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div class="fraud-header-text">
                <h4>⚠️ اشتباه في التسجيل </h4>
                <p>تم رصد تطابق في الشبكة مع بصمة مختلفة</p>
            </div>
            <button class="fraud-close-x" onclick="dismissFraudAlert()">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div class="fraud-body">
            <div class="fraud-student-row">
                <div class="fraud-avatar">
                    <i class="fa-solid fa-user-secret"></i>
                </div>
                <div class="fraud-student-info">
                    <span class="s-name">${data.suspectName}</span>
                    <span class="s-code">كود: ${data.suspectCode}</span>
                </div>
                <span class="fraud-reason-tag">جهاز مختلف</span>
            </div>

            <div class="fraud-ip-row">
                <i class="fa-solid fa-network-wired"></i>
                <span>نفس الشبكة مع: <b style="color:#ef4444">${data.originalName}</b></span>
            </div>

            <div class="fraud-actions">
                <button class="btn-fraud-dismiss" onclick="dismissFraudAlert()">
                    <i class="fa-solid fa-check"></i> تجاهل
                </button>
                <button class="btn-fraud-remove"
                    onclick="removeStudentFromSession('${data.suspectCode}', '${data.sessionId}'); dismissFraudAlert()">
                    <i class="fa-solid fa-user-slash"></i> إزالة الطالب
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(toast);

    // صوت تنبيه (اختياري)
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    } catch (e) { }

    // اختفاء تلقائي بعد 15 ثانية
    setTimeout(dismissFraudAlert, 15000);
}

function dismissFraudAlert() {
    const toast = document.getElementById('fraudAlertToast');
    if (!toast) return;
    toast.style.animation = 'fraudSlideOut 0.4s ease forwards';
    setTimeout(() => toast.remove(), 400);
}


// ── 4. دالة الإزالة (اربطها بدالة الإزالة الموجودة عندك) ────
function removeStudentFromSession(studentCode, sessionId) {
    // غيّر المسار ده حسب مسار Firebase بتاعك
    firebase.database()
        .ref(`sessions/${sessionId}/attendance/${studentCode}`)
        .remove()
        .then(() => {
            showToast(`تم إزالة الطالب ${studentCode} من الجلسة`);
        });
}