import {
    getDoc, doc, query, collection, where, getDocs, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;

window.openPublicProfile = async function (targetUID, ignoredFlag = false) {
    if (typeof playClick === 'function') playClick();

    const modal = document.getElementById('publicProfileModal');
    if (!modal) return;

    modal.style.display = 'flex';
    document.body.appendChild(modal);

    const elName = document.getElementById('publicName');
    const elRole = document.getElementById('publicRoleBadge');
    const elLevel = document.getElementById('publicLevel');
    const elCode = document.getElementById('publicCode');
    const elAvatar = document.getElementById('publicAvatar');
    const statsContainer = document.querySelector('.stats-tri-grid');

    elName.innerText = "جاري التحميل...";
    elRole.innerText = "...";
    elLevel.innerText = "--";
    elCode.innerText = "--";
    elAvatar.innerHTML = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';

    statsContainer.style.opacity = '0';

    try {
        let userData = null;
        let userType = "student";

        const facRef = doc(window.db, "faculty_members", targetUID);
        const facSnap = await getDoc(facRef);

        if (facSnap.exists()) {
            const raw = facSnap.data();
            userData = raw;
            userType = (raw.role === 'dean') ? "dean" : "doctor";
        } else {
            let docRef = (targetUID.length > 15)
                ? doc(window.db, "user_registrations", targetUID)
                : doc(window.db, "students", targetUID);

            let docSnap = await getDoc(docRef);

            if (!docSnap.exists() && targetUID.length <= 15) {
                const q = query(collection(window.db, "user_registrations"), where("registrationInfo.studentID", "==", targetUID));
                const qSnap = await getDocs(q);
                if (!qSnap.empty) docSnap = qSnap.docs[0];
            }

            if (docSnap.exists()) {
                const raw = docSnap.data();
                userData = { ...(raw.registrationInfo || {}), ...raw };
                userType = "student";
            }
        }

        if (!userData) {
            elName.innerText = "غير مسجل";
            elRole.innerText = "Unknown";
            return;
        }

        elName.innerText = userData.fullName || userData.name || "Unknown";

        let iconClass = userData.avatarClass || "fa-user";
        let roleText = "طالب";
        let badgeColor = "#f1f5f9";
        let badgeTxtColor = "#64748b";

        if (userType === 'dean') {
            roleText = "👑 عميد الكلية";
            badgeColor = "#f3e8ff"; badgeTxtColor = "#7e22ce";
            iconClass = userData.avatarClass || "fa-user-tie";
        } else if (userType === 'doctor') {
            roleText = "👨‍🏫 عضو هيئة تدريس";
            badgeColor = "#e0f2fe"; badgeTxtColor = "#0284c7";
            iconClass = userData.avatarClass || "fa-user-doctor";
        } else {
            iconClass = userData.avatarClass || "fa-user-graduate";
        }

        elRole.innerText = roleText;
        elRole.style.background = badgeColor;
        elRole.style.color = badgeTxtColor;

        elAvatar.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;

        if (userType === 'dean') elAvatar.style.color = "#7c3aed";
        else if (userType === 'doctor') elAvatar.style.color = "#0ea5e9";
        else elAvatar.style.color = iconClass.includes('fire') ? "#f97316" : "#10b981";

        if (userType === 'doctor' || userType === 'dean') {
            elLevel.innerText = userData.jobTitle || userData.subject || "دكتور جامعي";
            elCode.innerText = "Faculty Member";

            await analyzeDoctorStats(targetUID, statsContainer);

        } else {
            elLevel.innerText = userData.level || userData.academic_level || "عام";
            elCode.innerText = userData.studentID || userData.id || targetUID;

            await calculateStudentStats(targetUID, userData.group, statsContainer);
        }

        statsContainer.style.opacity = '1';

    } catch (e) {
        console.error("Profile Error:", e);
        elName.innerText = "حدث خطأ في البيانات";
    }
};

async function analyzeDoctorStats(doctorUID, container) {
    container.innerHTML = `
        <div style="grid-column: span 3; text-align:center; padding:10px; color:#64748b;">
            <i class="fa-solid fa-calculator fa-fade"></i> جاري تحليل سجل التقييمات...
        </div>
    `;

    try {
        const q = query(collection(window.db, "feedback_reports"), where("doctorUID", "==", doctorUID));
        const snapshot = await getDocs(q);

        let totalRating = 0;
        let count = 0;
        let studentsMap = {};

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="stat-mini-card" style="grid-column: span 3; opacity:0.7;">
                    <div class="stat-icon s-gray"><i class="fa-solid fa-inbox"></i></div>
                    <div class="stat-num" style="font-size:14px;">لا توجد تقييمات</div>
                    <div class="stat-lbl">لم يتم التقييم بعد</div>
                </div>
            `;
            return;
        }

        snapshot.forEach(doc => {
            const d = doc.data();
            const r = d.rating || 0;
            totalRating += r;
            count++;

            const sKey = d.studentId ? `${d.studentId}|${d.studentName || 'Unknown'}` : 'Anonymous';
            if (sKey !== 'Anonymous') {
                studentsMap[sKey] = (studentsMap[sKey] || 0) + 1;
            }
        });

        const average = (totalRating / count).toFixed(1);

        let verdict = "";
        let colorClass = "";
        let iconHtml = "";

        if (average >= 4.5) {
            verdict = "أداء أكاديمي متميز ⭐";
            colorClass = "s-green";
            iconHtml = '<i class="fa-solid fa-medal"></i>';
        } else if (average >= 3.5) {
            verdict = "أداء جيد جداً ✨";
            colorClass = "s-blue";
            iconHtml = '<i class="fa-solid fa-thumbs-up"></i>';
        } else {
            verdict = "قيد المراجعة والتطوير 📈";
            colorClass = "s-orange";
            iconHtml = '<i class="fa-solid fa-clipboard-check"></i>';
        }

        let topFanName = "--";
        let topFanCount = 0;

        for (const [key, val] of Object.entries(studentsMap)) {
            if (val > topFanCount) {
                topFanCount = val;
                topFanName = key.split('|')[1];
            }
        }

        if (topFanName !== "--") {
            topFanName = topFanName.split(' ').slice(0, 2).join(' ');
        }

        container.innerHTML = `
            <div class="stat-mini-card">
                <div class="stat-icon ${colorClass}">${iconHtml}</div>
                <div class="stat-num">${average} <span style="font-size:10px; color:#94a3b8;">/5</span></div>
                <div class="stat-lbl">${verdict}</div>
            </div>

            <div class="stat-mini-card">
                <div class="stat-icon s-purple"><i class="fa-solid fa-users-viewfinder"></i></div>
                <div class="stat-num">${count}</div>
                <div class="stat-lbl">إجمالي المقيمين</div>
            </div>

            <div class="stat-mini-card">
                <div class="stat-icon" style="background:#fef9c3; color:#ca8a04;"><i class="fa-solid fa-trophy"></i></div>
                <div class="stat-num" style="font-size:12px; line-height:1.4;">${topFanName}</div>
                <div class="stat-lbl">أكثر طالب تفاعلاً (${topFanCount})</div>
            </div>
        `;

    } catch (err) {
        console.error("Doctor Stats Error:", err);
        container.innerHTML = "خطأ في التحليل";
    }
}

async function calculateStudentStats(studentUID, studentGroup, container) {
    // 1. عرض حالة التحميل
    container.innerHTML = `
        <div style="grid-column: span 3; text-align:center; padding:15px; color:#64748b;">
            <i class="fa-solid fa-calculator fa-fade"></i> جاري جرد سجلات الحضور والغياب...
        </div>
    `;

    try {
        // تحديد جروب الطالب (إذا لم يكن له جروب نعتبره General)
        const myGroup = (studentGroup && studentGroup.trim() !== "") ? studentGroup.trim() : "General";

        // ========================================================
        // الخطوة 1: كم مرة "حضر" الطالب فعلياً؟ (من سجله الشخصي)
        // ========================================================
        const myStatsRef = doc(window.db, "student_stats", studentUID);
        const myStatsSnap = await getDoc(myStatsRef);

        let myAttendedSubjects = {}; // هيكل: { "Science": 3, "Anatomy": 5 }
        let disciplineStatus = "good"; // good, warning, bad

        if (myStatsSnap.exists()) {
            const data = myStatsSnap.data();
            myAttendedSubjects = data.attended || {};

            // تحديد حالة الانضباط
            if (data.cumulative_unruly >= 3) disciplineStatus = "bad";
            else if (data.cumulative_unruly > 0) disciplineStatus = "warning";
        }

        // ========================================================
        // الخطوة 2: كم جلسة "عُقدت" لجروب هذا الطالب؟ (من course_counters)
        // ========================================================

        // نبحث عن كل الجلسات التي كان "targetGroups" يحتوي فيها على جروب الطالب
        const countersQuery = query(
            collection(window.db, "course_counters"),
            where("targetGroups", "array-contains", myGroup)
        );

        const countersSnap = await getDocs(countersQuery);

        let totalSessionsHeldMap = {}; // هيكل: { "Science": 5, "Anatomy": 10 }

        countersSnap.forEach(doc => {
            const sessionData = doc.data();
            const subjectName = sessionData.subject.trim();

            if (!totalSessionsHeldMap[subjectName]) {
                totalSessionsHeldMap[subjectName] = 0;
            }
            totalSessionsHeldMap[subjectName]++;
        });

        // ========================================================
        // الخطوة 3: المقارنة الجراحية (الفرص - الحضور = الغياب)
        // ========================================================

        let totalAttendanceDays = 0;
        let totalAbsenceDays = 0;

        // نمر على كل مادة تم تدريسها لهذا الجروب
        for (const [subject, totalHeld] of Object.entries(totalSessionsHeldMap)) {

            // نحاول إيجاد رصيد حضور الطالب لهذه المادة
            // ملاحظة: أحياناً المفاتيح في Firebase تُحفظ بـ _ بدلاً من المسافات، لذا نقوم بتوحيد الصيغة

            let studentCount = 0;

            // 1. محاولة البحث بالاسم المباشر
            if (myAttendedSubjects[subject]) {
                studentCount = myAttendedSubjects[subject];
            }
            // 2. محاولة البحث بالاسم "الآمن" (بدون مسافات)
            else {
                const safeKey = subject.replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '');
                if (myAttendedSubjects[safeKey]) {
                    studentCount = myAttendedSubjects[safeKey];
                }
            }

            // الحساب النهائي لهذه المادة
            const absenceInSubject = Math.max(0, totalHeld - studentCount);

            totalAttendanceDays += studentCount;
            totalAbsenceDays += absenceInSubject;
        }

        // ========================================================
        // الخطوة 4: العرض النهائي
        // ========================================================

        // تحديد نص وأيقونة الانضباط
        let discText = "ملتزم ✅";
        let discColor = "#10b981"; // أخضر

        if (disciplineStatus === "bad") {
            discText = "مشاغب ⚠️";
            discColor = "#ef4444"; // أحمر
        } else if (disciplineStatus === "warning") {
            discText = "تنبيه ✋";
            discColor = "#f59e0b"; // برتقالي
        }

        container.innerHTML = `
            <div class="stat-mini-card">
                <div class="stat-icon s-green"><i class="fa-solid fa-calendar-check"></i></div>
                <div class="stat-num" id="st_att">${totalAttendanceDays}</div>
                <div class="stat-lbl">أيام حضور</div>
            </div>
            <div class="stat-mini-card">
                <div class="stat-icon s-red"><i class="fa-solid fa-calendar-xmark"></i></div>
                <div class="stat-num" id="st_abs">${totalAbsenceDays}</div>
                <div class="stat-lbl">أيام غياب</div>
            </div>
            <div class="stat-mini-card">
                <div class="stat-icon s-blue"><i class="fa-solid fa-scale-balanced"></i></div>
                <div class="stat-num" style="font-size: 11px; color:${discColor};">${discText}</div>
                <div class="stat-lbl">السلوك</div>
            </div>
        `;

    } catch (err) {
        console.error("Stats Error:", err);
        container.innerHTML = `<div style="grid-column:span 3; text-align:center; color:#ef4444; font-size:12px;">حدث خطأ في الحساب</div>`;
    }
}