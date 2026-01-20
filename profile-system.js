import {
    getDoc, doc, query, collection, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;

window.openPublicProfile = async function (targetUID, ignoredFlag = false) {
    if (typeof playClick === 'function') playClick();

    const modal = document.getElementById('publicProfileModal');
    if (!modal) return;

    modal.style.display = 'flex';
    document.body.appendChild(modal);

    // 1. تصفير الواجهة
    document.getElementById('publicName').innerText = "جاري التحميل...";
    document.getElementById('statAttendance').innerText = "-";
    document.getElementById('statAbsence').innerText = "-";
    document.getElementById('statDiscipline').innerText = "...";

    try {
        // 2. جلب بيانات الطالب الأساسية
        let studentData = null;
        let docRef = (targetUID.length > 15)
            ? doc(window.db, "user_registrations", targetUID)
            : doc(window.db, "students", targetUID);

        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const raw = docSnap.data();
            // دمج البيانات لضمان وجود كل الحقول (القديمة والجديدة)
            studentData = {
                ...(raw.registrationInfo || {}),
                ...raw
            };
        } else {
            // محاولة البحث العكسي باستخدام الكود الجامعي
            if (targetUID.length <= 15) {
                const q = query(collection(window.db, "user_registrations"), where("registrationInfo.studentID", "==", targetUID));
                const qSnap = await getDocs(q);
                if (!qSnap.empty) {
                    const raw = qSnap.docs[0].data();
                    studentData = { ...(raw.registrationInfo || {}), ...raw };
                    // تحديث المرجع لاستخدامه لاحقاً (مثلاً في UID)
                    docRef = qSnap.docs[0].ref;
                }
            }
        }

        if (!studentData) {
            document.getElementById('publicName').innerText = "بيانات غير متوفرة";
            return;
        }

        // --- عرض البيانات الأساسية ---
        document.getElementById('publicName').innerText = studentData.fullName || studentData.name || "Unknown";
        document.getElementById('publicRoleBadge').innerText = "Student";
        document.getElementById('publicRoleBadge').style.cssText = "";

        const displayLevel = studentData.level || studentData.academic_level || "عام";
        document.getElementById('publicLevel').innerText = displayLevel;

        // ضمان قراءة الكود الجامعي الصحيح
        const uniID = studentData.studentID || studentData.id || targetUID;
        document.getElementById('publicCode').innerText = uniID;

        const statusMsg = studentData.status_message || studentData.statusMessage || "لا توجد حالة.";
        document.getElementById('publicStatusText').innerText = statusMsg;

        // ضبط الصورة (الأفاتار)
        const avatarEl = document.getElementById('publicAvatar');
        const iconClass = studentData.avatarClass || "fa-user-graduate";
        avatarEl.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
        // تلوين الأيقونة حسب نوعها
        avatarEl.style.color = iconClass.includes('fire') ? "#f97316" : "#10b981";


        // 3. 🔥 حساب الإحصائيات (المنطق الجديد: Subject-Wise Logic) 🔥
        // يعتمد على مقارنة (إجمالي محاضرات الجروب للمادة) بـ (رصيد الطالب في المادة)

        // أ. تحديد المعرف الصحيح لملف الإحصائيات (نستخدم UID لو متاح، أو الكود الجامعي)
        const statsUID = docRef.id; // نستخدم ID الوثيقة التي وجدناها

        // ب. تحديد مجموعة الطالب (Group)
        const studentGroup = studentData.group || "General";

        // ج. جلب الملفين (إحصائيات الجروب + إحصائيات الطالب)
        const [groupStatsSnap, myStatsSnap] = await Promise.all([
            getDoc(doc(window.db, "groups_stats", studentGroup)),
            getDoc(doc(window.db, "student_stats", statsUID))
        ]);

        let totalAbsence = 0;
        let totalAttendance = 0;
        let violationsCount = 0;

        if (groupStatsSnap.exists()) {
            const groupSubjects = groupStatsSnap.data().subjects || {};

            // لو الطالب عنده ملف إحصائيات، هات بياناته، لو لأ نعتبره صفر
            const myAttendedSubjects = myStatsSnap.exists() ? (myStatsSnap.data().attended || {}) : {};
            violationsCount = myStatsSnap.exists() ? (myStatsSnap.data().violations_count || 0) : 0;

            // د. الدوران على كل المواد وحساب الفرق
            for (const [subjectKey, totalHeld] of Object.entries(groupSubjects)) {
                // كم مرة حضر الطالب هذه المادة؟
                const myCount = myAttendedSubjects[subjectKey] || 0;

                // الغياب = إجمالي المحاضرات - حضور الطالب
                let subjectAbsence = totalHeld - myCount;
                if (subjectAbsence < 0) subjectAbsence = 0; // أمان

                totalAbsence += subjectAbsence;
                totalAttendance += myCount;
            }
        } else {
            // حالة نادرة: الجروب ليس له إحصائيات بعد (أو النظام لسه جديد)
            // نلجأ للطريقة القديمة (عد السجلات في Attendance Collection) كحل مؤقت
            const attQuery = query(collection(window.db, "attendance"), where("id", "==", String(uniID)));
            const attSnap = await getDocs(attQuery);
            let tempUniqueDays = new Set();
            attSnap.forEach(s => {
                if (s.data().status !== 'absent') tempUniqueDays.add(s.data().date);
            });
            totalAttendance = tempUniqueDays.size;
            // الغياب سيظل 0 لأنه لا يوجد مرجع للمقارنة
        }

        // 4. عرض النتائج النهائية في الكارت
        document.getElementById('statAttendance').innerText = totalAttendance;
        document.getElementById('statAbsence').innerText = totalAbsence;

        const disciplineEl = document.getElementById('statDiscipline');

        // منطق الانضباط بناءً على عدد المخالفات المسجلة
        if (violationsCount >= 3) {
            disciplineEl.innerText = "مشاغب ⚠️";
            disciplineEl.style.color = "#ef4444";
        } else if (violationsCount > 0) {
            disciplineEl.innerText = "تنبيه ✋";
            disciplineEl.style.color = "#f59e0b";
        } else {
            disciplineEl.innerText = "ملتزم ✅";
            disciplineEl.style.color = "#10b981";
        }

    } catch (e) {
        console.error("Profile Logic Error:", e);
        document.getElementById('publicName').innerText = "حدث خطأ";
    }
};