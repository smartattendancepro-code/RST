import {
    getDoc, doc, query, collection, where, getDocs, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;

window.profilesCache = window.profilesCache || {};


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

    const examsSection = document.getElementById('publicExamsSection');
    const examsList = document.getElementById('publicExamsList');

    if (window.profilesCache[targetUID]) {
        console.log("⚡ Instant Load from Cache");
        const cached = window.profilesCache[targetUID];

        elName.innerText = cached.name;

        elRole.innerText = cached.roleText;
        elRole.setAttribute('data-i18n', cached.roleKey);
        elRole.style.background = cached.badgeColor;
        elRole.style.color = cached.badgeTxtColor;

        elLevel.innerText = cached.level;
        elCode.innerText = cached.code;

        elAvatar.innerHTML = `<i class="fa-solid ${cached.iconClass}"></i>`;
        elAvatar.style.color = cached.iconColor;

        statsContainer.innerHTML = cached.statsHTML;
        statsContainer.style.opacity = '1';

        if (examsList) examsList.innerHTML = cached.examsHTML;
        if (examsSection) examsSection.style.display = cached.examsDisplay;

        return;
    }

    elName.innerText = "Loading...";
    elRole.innerText = "...";
    elLevel.innerText = "--";
    elCode.innerText = "--";
    elAvatar.innerHTML = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';

    if (examsSection) examsSection.style.display = 'none';
    if (examsList) examsList.innerHTML = '';

    statsContainer.style.opacity = '0';

    elRole.style.marginBottom = "10px";
    statsContainer.style.marginTop = "5px";

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
            elName.innerText = "Not Registered";
            elRole.innerText = "Unknown";
            return;
        }

        const finalName = userData.fullName || userData.name || "Unknown";
        elName.innerText = finalName;

        let iconClass = userData.avatarClass || "fa-user";
        let roleText = "Student";
        let badgeColor = "#f1f5f9";
        let badgeTxtColor = "#64748b";
        let roleKey = "student_role";
        let iconColor = "#10b981";


        if (userType === 'dean') {
            roleText = "👑 Dean";
            roleKey = "dean_role";
            badgeColor = "#f3e8ff"; badgeTxtColor = "#7e22ce";
            iconClass = userData.avatarClass || "fa-user-tie";
        } else if (userType === 'doctor') {
            roleText = "👨‍🏫 Faculty Member";
            roleKey = "doctor_role";
            badgeColor = "#e0f2fe"; badgeTxtColor = "#0284c7";
            iconClass = userData.avatarClass || "fa-user-doctor";
        } else {
            iconClass = userData.avatarClass || "fa-user-graduate";
        }

        elRole.innerText = roleText;
        elRole.setAttribute('data-i18n', roleKey);
        elRole.style.background = badgeColor;
        elRole.style.color = badgeTxtColor;

        elAvatar.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;

        if (userType === 'dean') elAvatar.style.color = "#7c3aed";
        else if (userType === 'doctor') elAvatar.style.color = "#0ea5e9";
        else elAvatar.style.color = iconClass.includes('fire') ? "#f97316" : "#10b981";

        if (userType === 'doctor' || userType === 'dean') {
            elLevel.innerText = userData.jobTitle || userData.subject || "Professor";
            elCode.innerText = "Faculty";
            statsContainer.innerHTML = `<div style="grid-column: span 3; text-align:center; padding:10px; color:#64748b; font-size:12px;">نظام إدارة المحاضرات الذكي</div>`;
        } else {
            const level = userData.level || userData.academic_level || "---";
            const group = userData.group || userData.registrationInfo?.group || "عام";

            elLevel.innerText = `الفرقة: ${level} | جروب: ${group}`;
            elCode.innerText = userData.studentID || userData.id || targetUID;

            const statsCacheKey = `st_stats_v2_${targetUID}`;
            const cachedData = localStorage.getItem(statsCacheKey);
            const CACHE_HOUR = 60 * 60 * 1000;

            if (cachedData) {
                const parsed = JSON.parse(cachedData);
                if (Date.now() - parsed.timestamp < CACHE_HOUR) {
                    console.log("♻️    ");
                    statsContainer.innerHTML = parsed.html;
                } else {
                    await calculateStudentStats(targetUID, group, statsContainer);
                }
            } else {
                await calculateStudentStats(targetUID, group, statsContainer);
            }
        }

        statsContainer.style.opacity = '1';

        window.profilesCache[targetUID] = {
            name: finalName,
            roleText: roleText,
            roleKey: roleKey,
            badgeColor: badgeColor,
            badgeTxtColor: badgeTxtColor,
            level: elLevel.innerText,
            code: elCode.innerText,
            iconClass: iconClass,
            iconColor: iconColor,
            statsHTML: statsContainer.innerHTML,
            examsHTML: examsList ? examsList.innerHTML : '',
            examsDisplay: examsSection ? examsSection.style.display : 'none'
        };

    } catch (e) {
        console.error("Profile Error:", e);
        elName.innerText = "Data Error";
    }
};


async function calculateStudentStats(studentUID, studentGroup, container) {
    container.innerHTML = `
        <div style="grid-column: span 3; text-align:center; padding:15px; color:#64748b;">
            <i class="fa-solid fa-calculator fa-fade"></i> Calculating records...
        </div>
    `;

    try {
        const myGroup = (studentGroup && studentGroup.trim() !== "") ? studentGroup.trim() : "General";

        const myStatsRef = doc(window.db, "student_stats", studentUID);
        const myStatsSnap = await getDoc(myStatsRef);

        let myAttendedSubjects = {};
        let disciplineStatus = "good";

        if (myStatsSnap.exists()) {
            const data = myStatsSnap.data();
            myAttendedSubjects = data.attended || {};

            if (data.cumulative_unruly >= 3) disciplineStatus = "bad";
            else if (data.cumulative_unruly > 0) disciplineStatus = "warning";
        }

        const countersQuery = query(
            collection(window.db, "course_counters"),
            where("targetGroups", "array-contains", myGroup)
        );

        const countersSnap = await getDocs(countersQuery);
        let totalSessionsHeldMap = {};

        countersSnap.forEach(doc => {
            const sessionData = doc.data();
            const subjectName = sessionData.subject.trim();
            if (!totalSessionsHeldMap[subjectName]) {
                totalSessionsHeldMap[subjectName] = 0;
            }
            totalSessionsHeldMap[subjectName]++;
        });

        let totalAttendanceCount = 0;
        let totalAbsenceCount = 0;

        for (const [subject, totalHeld] of Object.entries(totalSessionsHeldMap)) {
            let studentCount = 0;

            if (myAttendedSubjects[subject]) {
                studentCount = myAttendedSubjects[subject];
            } else {
                const safeKey = subject.replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '');
                if (myAttendedSubjects[safeKey]) {
                    studentCount = myAttendedSubjects[safeKey];
                }
            }

            const absenceInSubject = Math.max(0, totalHeld - studentCount);
            totalAttendanceCount += studentCount;
            totalAbsenceCount += absenceInSubject;
        }

        let discText = "Good";
        let discColor = "#10b981";
        let discIcon = "fa-check-circle";
        let discKey = "behavior_good";

        if (disciplineStatus === "bad") {
            discText = "Unruly";
            discKey = "behavior_bad";
            discColor = "#ef4444";
            discIcon = "fa-triangle-exclamation";
        } else if (disciplineStatus === "warning") {
            discText = "Warning";
            discKey = "behavior_warning";
            discColor = "#f59e0b";
            discIcon = "fa-exclamation-circle";
        }

        container.innerHTML = `
            <div class="stat-mini-card">
                <div class="stat-icon s-green"><i class="fa-solid fa-person-chalkboard"></i></div>
                <div class="stat-num" id="st_att" style="font-family: 'Outfit', sans-serif;">${totalAttendanceCount}</div>
                <div class="stat-lbl" data-i18n="stat_lectures_attended">Lectures Attended</div>
            </div>
            <div class="stat-mini-card">
                <div class="stat-icon s-red"><i class="fa-solid fa-chair"></i></div>
                <div class="stat-num" id="st_abs" style="font-family: 'Outfit', sans-serif;">${totalAbsenceCount}</div>
                <div class="stat-lbl" data-i18n="stat_lectures_missed">Lectures Missed</div>
            </div>
            <div class="stat-mini-card">
                <div class="stat-icon" style="color:${discColor}; background:${discColor}15;"><i class="fa-solid ${discIcon}"></i></div>
                <div class="stat-num" style="font-size: 13px; color:${discColor}; font-family: 'Cairo', sans-serif !important; font-weight: 800;" data-i18n="${discKey}">${discText}</div>
                <div class="stat-lbl" data-i18n="stat_behavior">Behavior</div>
            </div>
        `;

        await displayStudentExams(studentUID, document.getElementById('publicExamsList'), document.getElementById('publicExamsSection'));

        const statsToSave = {
            html: container.innerHTML,
            timestamp: Date.now()
        };
        localStorage.setItem(`st_stats_${studentUID}`, JSON.stringify(statsToSave));

    } catch (err) {
        console.error("Stats Error:", err);
        container.innerHTML = `<div style="grid-column:span 3; text-align:center; color:#ef4444; font-size:12px;">Calculation Error</div>`;
    }

}

async function displayStudentExams(studentUID, listContainer, sectionContainer) {
    if (!listContainer || !sectionContainer) return;

    listContainer.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:12px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Checking results...</div>';
    sectionContainer.style.display = 'block';

    try {
        const q = query(collection(window.db, "exam_results"), where("studentID", "==", studentUID), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listContainer.innerHTML = `
                <div style="text-align:center; padding:10px; border:1px dashed #e2e8f0; border-radius:8px; color:#94a3b8; font-size:12px;">
                    <i class="fa-solid fa-file-circle-xmark"></i> <span data-i18n="no_exams">No published results yet</span>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';

        snapshot.forEach(doc => {
            const data = doc.data();

            const percentage = (data.score / data.maxScore) * 100;
            let scoreColor = "#10b981";

            if (percentage < 50) scoreColor = "#ef4444";
            else if (percentage < 65) scoreColor = "#f59e0b";

            const item = document.createElement('div');
            item.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:10px; border-radius:10px; border:1px solid #e2e8f0;";

            item.innerHTML = `
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:700; color:#1e293b; font-size:13px; font-family: 'Cairo', sans-serif;">${data.subject || 'Unknown Subject'}</span>
                    <span style="font-size:10px; color:#64748b; background:#e0f2fe; color:#0284c7; padding:2px 6px; border-radius:4px; width:fit-content; margin-top:2px;">
                        ${data.examType || 'Exam'}
                    </span>
                </div>
                <div style="text-align:right;">
                    <div style="font-family:'Outfit', sans-serif; font-weight:800; font-size:16px; color:${scoreColor};">
                        ${data.score} <span style="font-size:10px; color:#94a3b8; font-weight:normal;">/ ${data.maxScore}</span>
                    </div>
                    <div style="font-size:9px; color:#94a3b8;" data-i18n="score_label">Score</div>
                </div>
            `;
            listContainer.appendChild(item);
        });

    } catch (e) {
        console.error("Exam Fetch Error:", e);
        listContainer.innerHTML = '';
        sectionContainer.style.display = 'none';
    }
}