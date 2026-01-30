!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?module.exports=t():"function"==typeof define&&define.amd?define(t):e.VendorLib=t()}(this,function(){"use strict";var e=function(e,t){return e+t},n=function(e,t){return e-t},r={version:"1.0.5-alpha",init:function(){console.log("Vendor Lib Loaded")},process:function(t){return t.split("").reverse().join("")}};function o(e){var t=0;return function(){return t+=e}}var i=o(1),u=o(2);return window.__vendor_check=!0,{add:e,sub:n,utils:r,counter:i,double:u}});

window.closeSessionImmediately = function () {

    const confirmBtn = document.getElementById('btnConfirmYes') || document.querySelector('.swal2-confirm');
    const lang = localStorage.getItem('sys_lang') || 'ar';

    const title = (lang === 'ar') ? "إنهاء الجلسة وحفظ الغياب" : "End Session";
    const msg = (lang === 'ar') ? "سيتم إغلاق البوابة وحفظ السجلات نهائياً." : "Session will be closed and records saved.";

    if (confirmBtn) confirmBtn.innerText = (lang === 'ar') ? "تأكيد وحفظ ✅" : "Confirm & Save ✅";

    showModernConfirm(title, msg, async function () {
        const user = auth.currentUser;
        if (!user) return;

        const actionBtn = document.getElementById('btnConfirmYes') || document.querySelector('.confirm-btn-yes');
        if (actionBtn) {
            actionBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> ' + ((lang === 'ar') ? "جاري المعالجة..." : "Processing...");
            actionBtn.style.pointerEvents = 'none';
            actionBtn.style.opacity = '0.7';
        }

        try {
            // 1. إيقاف المستمعين (Listeners) لتجنب التداخل
            if (window.unsubscribeLiveSnapshot) {
                console.log("🔕 Muting Live Listener...");
                window.unsubscribeLiveSnapshot();
                window.unsubscribeLiveSnapshot = null;
            }
            if (window.deanRadarUnsubscribe) {
                window.deanRadarUnsubscribe();
                window.deanRadarUnsubscribe = null;
            }

            // 2. جلب بيانات الجلسة الحالية
            const sessionRef = doc(db, "active_sessions", user.uid);
            const sessionSnap = await getDoc(sessionRef);

            if (!sessionSnap.exists()) {
                showToast("No session found", 3000, "#ef4444");
                return;
            }

            const settings = sessionSnap.data();

            // تحديد الجروبات المستهدفة (وهذا مهم جداً للنظام الجديد والقديم)
            const targetGroups = (settings.targetGroups && settings.targetGroups.length > 0)
                ? settings.targetGroups
                : ["General"];

            // 3. تجهيز التواريخ والأوقات
            const now = new Date();
            const d = String(now.getDate()).padStart(2, '0');
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const y = now.getFullYear();
            const fixedDateStr = `${d}/${m}/${y}`; // التاريخ الموحد: 29/01/2026

            const closeTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            // 4. جلب قائمة الطلاب الموجودين حالياً في الجلسة
            const partsRef = collection(db, "active_sessions", user.uid, "participants");
            const partsSnap = await getDocs(partsRef);

            let processedCount = 0;
            const currentDocName = settings.doctorName || "Doctor";

            // إعداد نظام الدفعات (Batches) لأن Firestore يقبل 500 عملية كحد أقصى في الباتش الواحد
            const BATCH_LIMIT = 450;
            let currentBatch = writeBatch(db);
            let opCounter = 0;
            const commitPromises = [];

            const pushBatch = () => {
                commitPromises.push(currentBatch.commit());
                currentBatch = writeBatch(db);
                opCounter = 0;
            };

            // ============================================================
            // 🟢 المرحلة الأولى: معالجة الطلاب (نقل الحضور وتحديث الإحصائيات الفردية)
            // ============================================================
            partsSnap.forEach(docSnap => {
                const p = docSnap.data();

                // فقط الطلاب النشطين أو اللي في استراحة يتم حسابهم حضور
                if (p.status === "active" || p.status === "on_break") {

                    const safeSubject = (settings.allowedSubject || "General").replace(/\//g, '-');
                    const recID = `${p.id}_${fixedDateStr.replace(/\//g, '-')}_${safeSubject}`;
                    const attRef = doc(db, "attendance", recID);

                    let finalGroup = (p.group && p.group !== "General") ? p.group : targetGroups[0];
                    let originalEntryTime = p.time_str || closeTimeStr;
                    let sessionsCount = p.segment_count || 1;

                    let notesText = "منضبط";
                    if (p.isUnruly) notesText = "غير منضبط - مشاغب";
                    else if (p.isUniformViolation) notesText = "مخالفة زي";

                    // أ) تسجيل وثيقة الحضور اليومية
                    currentBatch.set(attRef, {
                        id: p.id,
                        name: p.name,
                        subject: settings.allowedSubject,
                        hall: settings.hall,
                        group: finalGroup,
                        date: fixedDateStr,
                        time_str: originalEntryTime,
                        segment_count: sessionsCount,
                        notes: notesText,
                        timestamp: serverTimestamp(),
                        status: "ATTENDED",
                        doctorUID: user.uid,
                        doctorName: currentDocName,
                        feedback_status: "pending",
                        feedback_rating: 0,
                        isUnruly: p.isUnruly || false,
                        isUniformViolation: p.isUniformViolation || false
                    });
                    opCounter++;

                    // ب) تحديث السجل التراكمي للطالب (Student Stats)
                    const cleanSubKey = settings.allowedSubject.trim().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '');
                    const studentStatsRef = doc(db, "student_stats", p.uid || p.id);

                    let statsUpdate = {
                        [`attended.${cleanSubKey}`]: increment(1), // زيادة رصيد الحضور في هذه المادة
                        group: finalGroup,
                        studentID: p.id,
                        last_updated: serverTimestamp()
                    };

                    if (p.isUnruly) {
                        statsUpdate.cumulative_unruly = increment(1);
                    }
                    if (p.isUniformViolation) {
                        statsUpdate.cumulative_uniform = increment(1);
                    }

                    currentBatch.set(studentStatsRef, statsUpdate, { merge: true });
                    opCounter++;

                    processedCount++;
                }

                // ج) حذف الطالب من قائمة الجلسة النشطة (تنظيف)
                currentBatch.delete(docSnap.ref);
                opCounter++;

                if (opCounter >= BATCH_LIMIT) {
                    pushBatch();
                }
            });

            // ============================================================
            // 🟡 المرحلة الثانية: النظام القديم (Groups Stats) - تم الإبقاء عليه للأمان
            // ============================================================
            if (targetGroups.length > 0) {
                const cleanSubKey = settings.allowedSubject.trim().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '');

                targetGroups.forEach(groupName => {
                    if (!groupName) return;
                    const groupRef = doc(db, "groups_stats", groupName);

                    currentBatch.set(groupRef, {
                        [`subjects.${cleanSubKey}.total_sessions_held`]: increment(1),
                        last_updated: serverTimestamp()
                    }, { merge: true });
                    opCounter++;

                    if (opCounter >= BATCH_LIMIT) pushBatch();
                });
            }

            // ============================================================
            // 🚀 المرحلة الثالثة (الجديدة): تسجيل عداد الجلسة (Course Counters)
            // الهدف: توثيق أن هذه المادة تم تدريسها لهذه الجروبات في هذا التاريخ بدقة
            // ============================================================

            // 1. إنشاء مرجع لسجل جديد في course_counters
            const counterRef = doc(collection(db, "course_counters"));

            // 2. تنظيف اسم المادة لضمان التطابق
            const cleanSubjectName = settings.allowedSubject ? settings.allowedSubject.trim() : "General";

            // 3. حفظ بيانات الجلسة (المادة، الجروبات، التاريخ، الدكتور)
            // هذا السجل هو المرجع الأساسي لحساب الغياب لاحقاً
            currentBatch.set(counterRef, {
                subject: cleanSubjectName,
                targetGroups: targetGroups,      // المصفوفة تحتوي الجروبات المحدثة (مثل ["G12", "G13"])
                date: fixedDateStr,              // مثال: "29/01/2026"
                timestamp: serverTimestamp(),    // للترتيب الزمني
                doctorUID: user.uid,
                doctorName: currentDocName,
                academic_year: y.toString()      // السنة الحالية
            });

            opCounter++;
            if (opCounter >= BATCH_LIMIT) pushBatch();

            const cleanSubjectForID = settings.allowedSubject.trim().replace(/\s+/g, '_');

            // 2. تحويل التاريخ لصيغة آمنة (29-01-2026) لاستخدامه في الـ ID
            const safeDateID = fixedDateStr.replace(/\//g, '-');

            // 3. التكرار على الجروبات لإنشاء/تحديث ملف كل جروب
            targetGroups.forEach(grp => {

                // 🔴 السر هنا: الـ ID يعتمد على (التاريخ + المادة + الجروب)
                // لو حفظت 100 مرة في نفس اليوم، سيتم الكتابة فوق نفس الملف ولن يزيد العداد
                const uniqueCounterID = `${safeDateID}_${cleanSubjectForID}_${grp}`;

                const counterRef = doc(db, "course_counters", uniqueCounterID);

                currentBatch.set(counterRef, {
                    subject: settings.allowedSubject.trim(),
                    targetGroups: [grp], // مصفوفة لتوافق الكود
                    date: fixedDateStr,
                    timestamp: serverTimestamp(),
                    doctorUID: user.uid,
                    academic_year: y.toString()
                });

                opCounter++;
                if (opCounter >= BATCH_LIMIT) pushBatch();
            });
            // ============================================================
            // 🔴 المرحلة الرابعة: إغلاق الجلسة وتنفيذ التغييرات (الجزء القديم بتاعك)
            // ============================================================

            currentBatch.update(sessionRef, { isActive: false, isDoorOpen: false });
            opCounter++;

            if (opCounter > 0) {
                commitPromises.push(currentBatch.commit());
            }

            // انتظار انتهاء جميع عمليات الكتابة في قاعدة البيانات
            await Promise.all(commitPromises);

            showToast(`✅ تم الحفظ وتحديث السجلات (${processedCount} طالب)`, 4000, "#10b981");

            // إعادة تحميل الصفحة لبدء جلسة نظيفة
            setTimeout(() => location.reload(), 1500);

        } catch (e) {
            console.error("Save Error:", e);
            showToast("خطأ في الحفظ: " + e.message, 4000, "#ef4444");

            if (actionBtn) {
                actionBtn.innerHTML = (lang === 'ar') ? "إعادة المحاولة" : "Retry";
                actionBtn.style.pointerEvents = 'auto';
                actionBtn.style.opacity = '1';
            }
        }
    });
};
