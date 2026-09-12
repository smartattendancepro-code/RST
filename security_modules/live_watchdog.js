import {
    collection,
    query,
    where,
    onSnapshot,
    getDocs,
    orderBy
} from "firebase/firestore";

(async function () {
    const db = window.db;

    // 1. انتظار تحميل صلاحيات الدكتور
    function waitForDoctorAuth() {
        return new Promise(resolve => {
            const check = setInterval(() => {
                if (window.auth && window.auth.currentUser) {
                    const isAdmin = sessionStorage.getItem("secure_admin_session_token_v99");
                    if (isAdmin === "ADMIN_ACTIVE" || isAdmin === "SUPER_ADMIN_ACTIVE") {
                        clearInterval(check);
                        resolve(window.auth.currentUser.uid);
                    }
                }
            }, 1000);
        });
    }

    const doctorUID = await waitForDoctorAuth();
    console.log("🕵️ Smart Investigator Active");

    // --- تصميم كارت التحقيق (Security Report Card) ---
    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@600;800&display=swap');
        
        .sec-alert-overlay {
            position: fixed; bottom: 20px; right: 20px; z-index: 2147483660;
            display: flex; flex-direction: column; gap: 12px; pointer-events: none;
            font-family: 'Cairo', sans-serif;
        }
        
        .investigation-card {
            background: #1a0505;
            border-right: 5px solid #ef4444;
            width: 340px; border-radius: 8px; overflow: hidden;
            box-shadow: -8px 8px 25px rgba(0,0,0,0.6);
            pointer-events: auto; direction: rtl; color: #fff;
            animation: slideInLeft 0.4s ease-out;
        }

        .inv-header {
            background: #450a0a; padding: 10px 15px;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid #7f1d1d;
        }
        .inv-title { font-weight: 800; font-size: 14px; color: #fecaca; display: flex; align-items: center; gap: 6px; }
        .inv-close { background: none; border: none; color: #fca5a5; cursor: pointer; font-size: 16px; }

        .inv-body { padding: 15px; }

        /* القسم 1: الجهاز */
        .inv-section { margin-bottom: 12px; border-bottom: 1px dashed #7f1d1d; padding-bottom: 10px; }
        .inv-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        
        .inv-label { font-size: 11px; color: #9ca3af; margin-bottom: 4px; display: block; }
        .inv-value { font-size: 13px; font-weight: 700; color: #fff; }
        .inv-warning { color: #ef4444; font-weight: 800; display: flex; align-items: center; gap: 5px; }
        .inv-owner-box { 
            background: #7f1d1d; color: #fee2e2; padding: 6px; border-radius: 4px; 
            margin-top: 6px; font-size: 11px; display: flex; gap: 5px; align-items: center;
        }

        /* القسم 2: الشبكة */
        .inv-ip-box { display: flex; justify-content: space-between; align-items: center; }
        .ip-badge { background: #374151; padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #d1d5db; }
        .ip-clash { background: #f59e0b; color: #000; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 10px; }

        /* القسم 3: الموقع */
        .inv-loc-row { display: flex; gap: 10px; align-items: center; }
        .loc-icon { font-size: 14px; }
        .loc-ok { color: #10b981; }
        .loc-bad { color: #ef4444; }

        @keyframes slideInLeft { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.className = 'sec-alert-overlay';
    document.body.appendChild(container);

    let processedIDs = new Set();

    // ذاكرة مؤقتة للـ IPs في الجلسة الحالية لحساب التكرار
    let sessionIPs = {};

    // مراقبة الجلسة
    const q = query(
        collection(db, "active_sessions", doctorUID, "participants"),
        orderBy("timestamp", "desc")
    );

    onSnapshot(q, async (snapshot) => {
        // 1. تحديث خريطة الـ IP للجلسة الحالية
        sessionIPs = {};
        snapshot.docs.forEach(doc => {
            const d = doc.data();
            const trap = d.trap_report || {};
            const ip = trap.user_ip || trap.ip || "unknown"; // تأكد من اسم الحقل في script.js
            if (ip !== "unknown") {
                if (!sessionIPs[ip]) sessionIPs[ip] = 0;
                sessionIPs[ip]++;
            }
        });

        // 2. فحص التغييرات الجديدة
        for (const change of snapshot.docChanges()) {
            if (change.type === "added" || change.type === "modified") {
                const data = change.doc.data();

                // العمل فقط إذا كان الطالب "حاضر"
                if (data.status !== 'active') continue;

                const trap = data.trap_report || {};

                // الشرط الحاكم: جهاز غير مطابق (Is Device Match = False)
                // لاحظ: إذا كان الجهاز مطابقاً (أحد أجهزته المسجلة)، لن نكمل الكود
                if (trap.is_device_match !== false) continue;

                // التحقق من الوقت (آخر 10 ثواني)
                const recTime = data.timestamp ? data.timestamp.toMillis() : 0;
                if (Date.now() - recTime > 10000) continue;

                // منع التكرار
                if (processedIDs.has(change.doc.id)) continue;
                processedIDs.add(change.doc.id);

                // --- بدأ التحقيق ---

                // أ) البحث عن صاحب الجهاز الأصلي (Reverse Lookup)
                const fingerprint = trap.device_id || trap.deviceFingerprint;
                let realOwnerName = "مجهول / جهاز جديد";

                if (fingerprint) {
                    // نبحث في user_registrations عن هذا الجهاز
                    // ملاحظة: هذا يتطلب Index في Firebase في بعض الحالات، أو سيعمل تلقائياً
                    try {
                        const ownersQ = query(
                            collection(db, "user_registrations"),
                            where("bound_device_id", "==", fingerprint)
                        );
                        const ownerSnap = await getDocs(ownersQ);

                        if (!ownerSnap.empty) {
                            const ownerData = ownerSnap.docs[0].data();
                            // نتأكد أنه ليس نفس الطالب (حالة نادرة)
                            if (ownerSnap.docs[0].id !== data.uid) {
                                realOwnerName = ownerData.fullName || ownerData.registrationInfo?.fullName || "طالب آخر";
                            } else {
                                realOwnerName = "نفس الطالب (خطأ في المطابقة)";
                            }
                        } else {
                            // بحث في المصفوفة (أصعب قليلاً في NoSQL لكن سنجرب البحث المباشر أولاً)
                            realOwnerName = "غير مسجل لأحد";
                        }
                    } catch (e) {
                        console.log("Owner lookup skipped", e);
                    }
                }

                // ب) معلومات الـ IP
                const ip = trap.user_ip || trap.ip || "Unknown";
                const ipCount = sessionIPs[ip] || 1;
                const ipClashText = (ipCount > 1)
                    ? `مشترك مع ${ipCount - 1} طلاب آخرين`
                    : "IP فريد (لا يوجد اشتراك)";

                // ج) معلومات الموقع
                const dist = trap.distance ? Number(trap.distance).toFixed(1) + " كم" : "غير معروف";
                const inRange = trap.in_range === true;

                // إظهار التقرير
                showInvestigationReport({
                    studentName: data.name,
                    studentID: data.id,
                    realOwner: realOwnerName,
                    ip: ip,
                    ipClash: ipClashText,
                    isIpClash: (ipCount > 1),
                    distance: dist,
                    inRange: inRange
                });
            }
        }
    });

    function showInvestigationReport(info) {
        // اهتزاز قوي للتنبيه
        if (navigator.vibrate) navigator.vibrate([500, 200, 500]);

        // صوت "خطأ"
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.volume = 0.6;
        audio.play().catch(e => { });

        const card = document.createElement('div');
        card.className = 'investigation-card';

        card.innerHTML = `
            <div class="inv-header">
                <div class="inv-title">
                    <i class="fa-solid fa-user-secret"></i> تقرير اشتباه أمني
                </div>
                <button class="inv-close" onclick="this.parentElement.parentElement.remove()">✕</button>
            </div>
            
            <div class="inv-body">
                <!-- 1. الجهاز والطالب -->
                <div class="inv-section">
                    <div class="inv-label">الطالب الحالي:</div>
                    <div class="inv-value">${info.studentName} <span style="font-size:10px; opacity:0.7;">(#${info.studentID})</span></div>
                    
                    <div class="inv-warning" style="margin-top:8px;">
                        <i class="fa-solid fa-mobile-screen-button"></i> جهاز غير مطابق!
                    </div>
                    
                    ${info.realOwner !== "غير مسجل لأحد" ? `
                    <div class="inv-owner-box">
                        <i class="fa-solid fa-fingerprint"></i>
                        <div>
                            <span>هذا الجهاز مسجل باسم:</span><br>
                            <strong style="color:#fff; font-size:12px;">${info.realOwner}</strong>
                        </div>
                    </div>` : ''}
                </div>

                <!-- 2. الشبكة (تظهر فقط لوجود اشتباه) -->
                <div class="inv-section">
                    <div class="inv-label">فحص الشبكة (IP):</div>
                    <div class="inv-ip-box">
                        <span class="ip-badge">${info.ip}</span>
                        ${info.isIpClash ? `<span class="ip-clash">${info.ipClash}</span>` : '<span style="font-size:10px; color:#10b981;">شبكة سليمة</span>'}
                    </div>
                </div>

                <!-- 3. الموقع -->
                <div class="inv-section">
                    <div class="inv-label">الموقع الجغرافي:</div>
                    <div class="inv-loc-row">
                        <i class="fa-solid fa-location-dot loc-icon ${info.inRange ? 'loc-ok' : 'loc-bad'}"></i>
                        <span class="inv-value">${info.distance}</span>
                        <span style="font-size:10px; color:${info.inRange ? '#10b981' : '#ef4444'}">
                            (${info.inRange ? 'داخل النطاق' : 'خارج الكلية'})
                        </span>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(card);

        // إخفاء تلقائي بعد 15 ثانية
        setTimeout(() => {
            if (card.parentNode) {
                card.style.opacity = '0';
                card.style.transform = 'translateX(100%)';
                card.style.transition = 'all 0.5s';
                setTimeout(() => card.remove(), 500);
            }
        }, 15000);
    }

})();