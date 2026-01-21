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

    document.getElementById('publicName').innerText = "جاري التحميل...";
    document.getElementById('statAttendance').innerText = "-";
    document.getElementById('statAbsence').innerText = "-";
    document.getElementById('statDiscipline').innerText = "...";

    try {
        let studentData = null;
        let docRef = (targetUID.length > 15)
            ? doc(window.db, "user_registrations", targetUID)
            : doc(window.db, "students", targetUID);

        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const raw = docSnap.data();
            studentData = {
                ...(raw.registrationInfo || {}),
                ...raw
            };
        } else {
            if (targetUID.length <= 15) {
                const q = query(collection(window.db, "user_registrations"), where("registrationInfo.studentID", "==", targetUID));
                const qSnap = await getDocs(q);
                if (!qSnap.empty) {
                    const raw = qSnap.docs[0].data();
                    studentData = { ...(raw.registrationInfo || {}), ...raw };
                    docRef = qSnap.docs[0].ref;
                }
            }
        }

        if (!studentData) {
            document.getElementById('publicName').innerText = "بيانات غير متوفرة";
            return;
        }

        document.getElementById('publicName').innerText = studentData.fullName || studentData.name || "Unknown";
        document.getElementById('publicRoleBadge').innerText = "Student";
        document.getElementById('publicRoleBadge').style.cssText = "";

        const displayLevel = studentData.level || studentData.academic_level || "عام";
        document.getElementById('publicLevel').innerText = displayLevel;

        const uniID = studentData.studentID || studentData.id || targetUID;
        document.getElementById('publicCode').innerText = uniID;

        const avatarEl = document.getElementById('publicAvatar');
        const iconClass = studentData.avatarClass || "fa-user-graduate";
        avatarEl.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
        avatarEl.style.color = iconClass.includes('fire') ? "#f97316" : "#10b981";



        const statsUID = docRef.id; 

        const studentGroup = studentData.group || "General";

        const [groupStatsSnap, myStatsSnap] = await Promise.all([
            getDoc(doc(window.db, "groups_stats", studentGroup)),
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
                if (subjectAbsence < 0) subjectAbsence = 0; // أمان

                totalAbsence += subjectAbsence;
                totalAttendance += myCount;
            }
        } else {
            const attQuery = query(collection(window.db, "attendance"), where("id", "==", String(uniID)));
            const attSnap = await getDocs(attQuery);
            let tempUniqueDays = new Set();
            attSnap.forEach(s => {
                if (s.data().status !== 'absent') tempUniqueDays.add(s.data().date);
            });
            totalAttendance = tempUniqueDays.size;
        }

        document.getElementById('statAttendance').innerText = totalAttendance;
        document.getElementById('statAbsence').innerText = totalAbsence;

        const disciplineEl = document.getElementById('statDiscipline');

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