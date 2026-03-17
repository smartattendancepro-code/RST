import {
    collection, query, where, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;
const auth = window.auth;

let cachedAttendance = [];
let cachedAbsence = [];

// كل الـ collections الممكنة
const ATTENDANCE_COLLECTIONS = [
    "attendance_NURS",
    "attendance_PT",
    "attendance"
];

// ========================================================
// جيب بيانات الطالب من كل الـ collections
// ========================================================
async function fetchAllAttendance(studentID, status) {
    const results = [];

    await Promise.all(
        ATTENDANCE_COLLECTIONS.map(async (col) => {
            try {
                const snap = await getDocs(query(
                    collection(db, col),
                    where("id", "==", String(studentID)),
                    where("status", "==", status)
                ));
                snap.docs.forEach(d => results.push(d.data()));
            } catch (e) {
                console.warn(`Skipped collection [${col}]:`, e.message);
            }
        })
    );

    return results;
}

// ========================================================
// فتح نافذة السجل الأكاديمي
// ========================================================
window.openAcademicRecord = async function () {
    const user = auth.currentUser;
    if (!user) return;

    const modal = document.getElementById('academicRecordModal');
    if (modal) modal.style.display = 'flex';

    document.getElementById('academicRecordContent').innerHTML = `
        <div style="text-align: center; padding: 30px; color: #94a3b8;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 30px;"></i>
            <p data-i18n="academic_loading">Loading...</p>
        </div>`;

    document.getElementById('attendanceTabCount').innerText = '0';
    document.getElementById('absenceTabCount').innerText = '0';

    try {
        // جيب بيانات الطالب
        const userSnap = await getDoc(doc(db, "user_registrations", user.uid));
        if (!userSnap.exists()) {
            showError("User data not found.");
            return;
        }

        const userData = userSnap.data();
        const regInfo = userData.registrationInfo || {};
        const studentID = regInfo.studentID || userData.studentID;

        if (!studentID) {
            showError("Student ID not found.");
            return;
        }

        // جيب الحضور والغياب من كل الـ collections بالتوازي
        const [attendanceData, absenceData] = await Promise.all([
            fetchAllAttendance(studentID, "ATTENDED"),
            fetchAllAttendance(studentID, "ABSENT")
        ]);

        cachedAttendance = attendanceData;
        cachedAbsence = absenceData;

        document.getElementById('attendanceTabCount').innerText = cachedAttendance.length;
        document.getElementById('absenceTabCount').innerText = cachedAbsence.length;

        switchAcademicTab('attendance');

    } catch (e) {
        console.error("Academic Record Error:", e);
        showError("Error loading data. Please try again.");
    }
};

// ========================================================
// عرض رسالة خطأ
// ========================================================
function showError(msg) {
    document.getElementById('academicRecordContent').innerHTML = `
        <div style="text-align: center; padding: 30px; color: #ef4444;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 30px; margin-bottom: 10px;"></i>
            <p style="font-weight: bold;">${msg}</p>
        </div>`;
}

// ========================================================
// التبديل بين تابات الحضور والغياب
// ========================================================
window.switchAcademicTab = function (tab) {
    const tabAttendance = document.getElementById('tabAttendance');
    const tabAbsence = document.getElementById('tabAbsence');
    const lang = localStorage.getItem('sys_lang') || 'en';

    if (tab === 'attendance') {
        tabAttendance.style.color = '#10b981';
        tabAttendance.style.borderBottom = '3px solid #10b981';
        tabAttendance.style.background = 'white';
        tabAbsence.style.color = '#94a3b8';
        tabAbsence.style.borderBottom = 'none';
        tabAbsence.style.background = '#f8fafc';
        renderList(cachedAttendance, 'attendance', lang);
    } else {
        tabAbsence.style.color = '#ef4444';
        tabAbsence.style.borderBottom = '3px solid #ef4444';
        tabAbsence.style.background = 'white';
        tabAttendance.style.color = '#94a3b8';
        tabAttendance.style.borderBottom = 'none';
        tabAttendance.style.background = '#f8fafc';
        renderList(cachedAbsence, 'absence', lang);
    }
};

// ========================================================
// عرض القائمة
// ========================================================
function renderList(data, type, lang) {
    const content = document.getElementById('academicRecordContent');

    if (!data || data.length === 0) {
        const emptyMsg = type === 'attendance'
            ? (lang === 'ar' ? 'لا توجد محاضرات حضور مسجلة' : 'No attendance records found')
            : (lang === 'ar' ? 'لا توجد غيابات مسجلة' : 'No absence records found');

        content.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #94a3b8;">
                <i class="fa-solid fa-folder-open" style="font-size: 40px; margin-bottom: 10px;"></i>
                <p style="font-weight: bold;">${emptyMsg}</p>
            </div>`;
        return;
    }

    // ترتيب بالتاريخ الأحدث أولاً — يدعم DD/MM/YYYY
    const sorted = [...data].sort((a, b) => {
        const toKey = d => d?.date ? d.date.split('/').reverse().join('') : '';
        return toKey(b).localeCompare(toKey(a));
    });

    const color = type === 'attendance' ? '#10b981' : '#ef4444';
    const icon = type === 'attendance' ? 'fa-circle-check' : 'fa-circle-xmark';
    const bg = type === 'attendance' ? '#dcfce7' : '#fee2e2';

    content.innerHTML = sorted.map(item => `
        <div style="
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 14px;
            margin-bottom: 10px;
            border-right: 4px solid ${color};
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-weight: 800; font-size: 14px; color: #0f172a;">
                    ${item.subject || '--'}
                </div>
                <div style="background: ${bg}; color: ${color}; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 800;">
                    <i class="fa-solid ${icon}"></i>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 12px; color: #64748b;">
                    <i class="fa-solid fa-user-doctor" style="margin-left: 4px;"></i>
                    ${item.doctorName || '--'}
                </div>
                <div style="font-size: 12px; color: #64748b; font-family: 'Outfit', sans-serif;">
                    <i class="fa-regular fa-calendar" style="margin-left: 4px;"></i>
                    ${item.date || '--'}
                </div>
            </div>
        </div>
    `).join('');
}