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
    container.innerHTML = `
        <div class="stat-mini-card">
            <div class="stat-icon s-green"><i class="fa-solid fa-calendar-check"></i></div>
            <div class="stat-num" id="st_att">-</div>
            <div class="stat-lbl">أيام الحضور</div>
        </div>
        <div class="stat-mini-card">
            <div class="stat-icon s-red"><i class="fa-solid fa-calendar-xmark"></i></div>
            <div class="stat-num" id="st_abs">-</div>
            <div class="stat-lbl">أيام الغياب</div>
        </div>
        <div class="stat-mini-card">
            <div class="stat-icon s-blue"><i class="fa-solid fa-scale-balanced"></i></div>
            <div class="stat-num" id="st_disc" style="font-size: 11px;">...</div>
            <div class="stat-lbl">الانضباط</div>
        </div>
    `;

    try {
        const statsUID = studentUID; 
        const grp = studentGroup || "General";

        const [groupStatsSnap, myStatsSnap] = await Promise.all([
            getDoc(doc(window.db, "groups_stats", grp)),
            getDoc(doc(window.db, "student_stats", statsUID))
        ]);

        let totalAbsence = 0;
        let totalAttendance = 0;
        let violationsCount = 0;

        if (groupStatsSnap.exists()) {
            const groupSubjects = groupStatsSnap.data().subjects || {};
            const myAttendedSubjects = myStatsSnap.exists() ? (myStatsSnap.data().attended || {}) : {};
            violationsCount = myStatsSnap.exists() ? (myStatsSnap.data().violations_count || 0) : 0;

            for (const [subjectKey, totalHeld] of Object.entries(groupSubjects)) {
                const myCount = myAttendedSubjects[subjectKey] || 0;
                let subjectAbsence = totalHeld - myCount;
                if (subjectAbsence < 0) subjectAbsence = 0;
                totalAbsence += subjectAbsence;
                totalAttendance += myCount;
            }
        } else {
            const attQuery = query(collection(window.db, "attendance"), where("id", "==", String(studentUID))); // قد تحتاج uid حسب الداتابيز
            const attSnap = await getDocs(attQuery);
            totalAttendance = attSnap.size;
        }

        document.getElementById('st_att').innerText = totalAttendance;
        document.getElementById('st_abs').innerText = totalAbsence;

        const discEl = document.getElementById('st_disc');
        if (violationsCount >= 3) {
            discEl.innerText = "مشاغب ⚠️"; discEl.style.color = "#ef4444";
        } else if (violationsCount > 0) {
            discEl.innerText = "تنبيه ✋"; discEl.style.color = "#f59e0b";
        } else {
            discEl.innerText = "ملتزم ✅"; discEl.style.color = "#10b981";
        }

    } catch (err) {
        console.error(err);
    }
}