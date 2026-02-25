/**
 * 🚨 نظام الرادار الأمني للمحاضر - V4.5 (النسخة النهائية الشاملة)
 * يراقب الانتحال، تكرار الـ IP، والأجهزة غير المصرح بها
 */

let activeIPsMap = {}; // خريطة تتبع عناوين الـ IP في القاعة

export const SecurityAlert = {
    // 1️⃣ المستشعر: يراقب لقطة البيانات (Snapshot) لحظة بلحظة
    monitor: function (snapshot) {
        // إعادة بناء خريطة الـ IP لكل الموجودين حالياً لضمان دقة كشف "التكرار"
        activeIPsMap = {};
        snapshot.docs.forEach(doc => {
            const s = doc.data();
            const ip = s.trap_report?.ip_address;
            if (ip && s.status === 'active') {
                if (!activeIPsMap[ip]) activeIPsMap[ip] = [];
                activeIPsMap[ip].push(s.name);
            }
        });

        // فحص التغييرات (الطلاب الجدد أو تحديثات البيانات الأمنية)
        snapshot.docChanges().forEach((change) => {
            // ✅ تم التعديل ليشمل added و modified (لضمان رصد التلاعب فور تحديث الباك إند)
            if (change.type === "added" || change.type === "modified") {
                const data = change.doc.data();

                // تجاهل الحالات التي لا تتطلب تنبيهاً
                if (data.status !== 'active') return;

                const studentIP = data.trap_report?.ip_address;
                const isSharedIP = studentIP && activeIPsMap[studentIP] && activeIPsMap[studentIP].length > 1;

                // 🚨 الاحتمال الأول: انتحال شخصية (جهاز مسجل باسم طالب آخر)
                if (data.isIdentityTheft === true) {
                    this.triggerStrongAlert({
                        type: 'THEFT',
                        student: data.name,
                        owner: data.originalOwner || "طالب آخر",
                        ip: studentIP,
                        shared: isSharedIP
                    });
                }
                // ⚠️ الاحتمال الثاني: جهاز غريب (بصمة لا تخص الطالب)
                else if (data.trap_report?.is_device_match === false) {
                    this.triggerStrongAlert({
                        type: 'THIRD_DEVICE',
                        student: data.name
                    });
                }
            }
        });
    },

    // 2️⃣ المحرك البصري: تفجير النافذة التحذيرية والاهتزاز
    triggerStrongAlert: function (config) {
        // منع تكرار نفس التنبيه لنفس الطالب إذا كانت النافذة مفتوحة بالفعل
        const alertId = 'security-alert-' + config.student.replace(/\s/g, '');
        if (document.getElementById(alertId)) return;

        let content = '';
        if (config.type === 'THEFT') {
            content = `
                <div style="color:#ef4444; font-size:16px; margin-bottom:12px; font-weight:900; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-user-ninja"></i> كشف انتحال شخصية
                </div>
                <div style="background:#fef2f2; border:1px solid #fee2e2; padding:12px; border-radius:12px; margin-bottom:15px;">
                    <p style="margin:0 0 5px; font-size:14px; color:#1e293b;">الطالب: <b>${config.student}</b></p>
                    <p style="margin:0; font-size:14px; color:#1e293b;">استخدم جهاز: <b style="color:#2563eb;">${config.owner}</b></p>
                </div>
                ${config.shared ? `
                <div style="background:#fff7ed; color:#c2410c; padding:8px 12px; border-radius:10px; font-size:12px; font-weight:800; display:flex; align-items:center; gap:6px; border:1px solid #ffedd5;">
                    <i class="fa-solid fa-network-wired"></i> تحذير: IP مشترك (تسجيل جماعي)
                </div>` : ''}
            `;
        } else {
            content = `
                <div style="color:#f59e0b; font-size:16px; margin-bottom:12px; font-weight:900; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-mobile-screen-button"></i> جهاز غير مسجل
                </div>
                <div style="background:#fffbeb; border:1px solid #fef3c7; padding:12px; border-radius:12px; margin-bottom:15px;">
                    <p style="margin:0; font-size:14px; color:#1e293b;">الطالب: <b>${config.student}</b></p>
                    <p style="margin:8px 0 0; font-size:12px; color:#64748b; line-height:1.4;">دخل من جهاز "ثالث" غريب عن البصمات المعتمدة في حسابه.</p>
                </div>
            `;
        }

        const alertHtml = `
            <div id="${alertId}" style="position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:2147483647; width:92%; max-width:340px; background:white; border-radius:24px; box-shadow:0 20px 60px rgba(0,0,0,0.4); border-left:10px solid ${config.type === 'THEFT' ? '#ef4444' : '#f59e0b'}; padding:25px; animation: slideInAlert 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <div style="display:flex; flex-direction:column;">
                    ${content}
                    <button onclick="this.closest('.security-alert-box-parent').remove()" style="margin-top:20px; background:#0f172a; color:white; border:none; padding:15px; border-radius:14px; font-weight:900; cursor:pointer; font-size:14px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); active { transform: scale(0.95) }">
                        إغلاق وفحص الطالب
                    </button>
                </div>
            </div>
            <style>
                @keyframes slideInAlert { from { top: -150px; opacity: 0; } to { top: 20px; opacity: 1; } }
            </style>
        `;

        // إضافة حاوية لتسهيل المسح عند الإغلاق
        const wrapper = document.createElement('div');
        wrapper.className = 'security-alert-box-parent';
        wrapper.innerHTML = alertHtml;
        document.body.appendChild(wrapper);

        // 📳 الاهتزاز الاستخباراتي
        if (navigator.vibrate) {
            // نمط اهتزاز عنيف في حالة الانتحال، ونبضات سريعة في حالة الجهاز الغريب
            if (config.type === 'THEFT') navigator.vibrate([500, 200, 500, 200, 500]);
            else navigator.vibrate([200, 100, 200, 100, 200]);
        }

        // 🔊 صوت تنبيه (إذا كانت الدالة موجودة)
        if (typeof window.playBeep === 'function') window.playBeep();

        console.log(`🛡️ [Security] Alert triggered for ${config.student} - Type: ${config.type}`);
    }
};