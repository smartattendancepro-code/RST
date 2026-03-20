import {
    collection, query, where, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// تأكد أن هذه القيم معرفة مسبقاً في ملف الإعدادات الخاص بك
const db = window.db;
const auth = window.auth;

let cachedAttendance = [];
let cachedAbsence = [];
let currentTab = 'attendance';     
let showAll = false;                

const ATTENDANCE_COLLECTIONS = [
    "attendance_NURS",
    "attendance_PT",
    "attendance"
];

const CACHE_EXPIRY = 30 * 60 * 1000; // 30 دقيقةدقيقة


function getUniqueKey(item) {
    return `${item.id}_${item.subject}_${item.date}_${item.doctorName}`.toLowerCase().replace(/\s+/g, '');
}


async function fetchAllAttendance(studentID, status) {
    const results = [];
    const seenKeys = new Set();

    await Promise.all(
        ATTENDANCE_COLLECTIONS.map(async (col) => {
            try {
                const snap = await getDocs(query(
                    collection(db, col),
                    where("id", "==", String(studentID)),
                    where("status", "==", status)
                ));
                snap.docs.forEach(d => {
                    const data = d.data();
                    const key = getUniqueKey(data);

                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        results.push(data);
                    } else {
                        console.warn(`⚠️ Duplicate skipped [${col}]:`, data.subject, data.date);
                    }
                });
            } catch (e) {
                console.warn(`Skipped collection [${col}]:`, e.message);
            }
        })
    );

    return results;
}

function parseDate(dateStr) {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('/');
    if (parts.length !== 3) return new Date(0);
    // parts: [dd, mm, yyyy]
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
}

function sortByDateDesc(data) {
    return [...data].sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        return dateB - dateA;
    });
}

function groupByDate(data) {
    const groups = new Map(); // key: date string, value: array of records
    data.forEach(record => {
        const date = record.date;
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date).push(record);
    });
    // تحويل الخريطة إلى مصفوفة مرتبة حسب التاريخ تنازلياً
    return Array.from(groups.entries())
        .sort((a, b) => parseDate(b[0]) - parseDate(a[0]))
        .map(([date, records]) => ({ date, records }));
}


function setCachedAttendance(data) {
    const cache = {
        data: data,
        expiry: Date.now() + CACHE_EXPIRY
    };
    localStorage.setItem('academic_attendance_cache', JSON.stringify(cache));
}

function setCachedAbsence(data) {
    const cache = {
        data: data,
        expiry: Date.now() + CACHE_EXPIRY
    };
    localStorage.setItem('academic_absence_cache', JSON.stringify(cache));
}

function getCachedAttendance() {
    const raw = localStorage.getItem('academic_attendance_cache');
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (cache.expiry < Date.now()) {
        localStorage.removeItem('academic_attendance_cache');
        return null;
    }
    return cache.data;
}

function getCachedAbsence() {
    const raw = localStorage.getItem('academic_absence_cache');
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (cache.expiry < Date.now()) {
        localStorage.removeItem('academic_absence_cache');
        return null;
    }
    return cache.data;
}

function renderListWithMore(data, type, lang) {
    const content = document.getElementById('academicRecordContent');
    if (!data || data.length === 0) {
        const emptyMsg = type === 'attendance'
            ? (lang === 'ar' ? 'لا توجد محاضرات حضور مسجلة' : 'No attendance records found')
            : (lang === 'ar' ? 'لا توجد غيابات مسجلة'       : 'No absence records found');
        content.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #94a3b8;">
                <i class="fa-solid fa-folder-open" style="font-size: 40px; margin-bottom: 10px;"></i>
                <p style="font-weight: bold;">${emptyMsg}</p>
            </div>`;
        return;
    }

    // ترتيب البيانات من الأحدث إلى الأقدم
    const sorted = sortByDateDesc(data);
    // تجميع حسب اليوم
    const grouped = groupByDate(sorted);

    // تحديد عدد الأيام التي نعرضها
    let daysToShow = showAll ? grouped.length : 1;
    if (daysToShow < 1) daysToShow = 1;
    const visibleGroups = grouped.slice(0, daysToShow);

    const color = type === 'attendance' ? '#10b981' : '#ef4444';
    const icon  = type === 'attendance' ? 'fa-circle-check' : 'fa-circle-xmark';
    const bg    = type === 'attendance' ? '#dcfce7' : '#fee2e2';

    let html = '';
    visibleGroups.forEach(group => {
        html += `
            <div style="margin-bottom: 20px;">
                <div style="
                    font-size: 13px;
                    font-weight: bold;
                    color: #334155;
                    background: #f1f5f9;
                    padding: 6px 12px;
                    border-radius: 20px;
                    display: inline-block;
                    margin-bottom: 10px;
                ">
                    <i class="fa-regular fa-calendar"></i> ${group.date}
                </div>
        `;
        group.records.forEach(item => {
            html += `
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
            `;
        });
        html += `</div>`;
    });

    // زر عرض المزيد إذا كان هناك أيام إضافية
    if (!showAll && grouped.length > 1) {
        html += `
            <div style="text-align: center; margin-top: 10px;">
                <button id="showMoreBtn" style="
                    background: #3b82f6;
                    border: none;
                    color: white;
                    padding: 8px 20px;
                    border-radius: 30px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 13px;
                ">
                    <i class="fa-solid fa-arrow-down"></i> 
                    ${lang === 'ar' ? 'عرض المزيد' : 'Show More'}
                </button>
            </div>
        `;
    }

    content.innerHTML = html;

    // إضافة حدث للزر بعد إضافته
    const showMoreBtn = document.getElementById('showMoreBtn');
    if (showMoreBtn) {
        showMoreBtn.addEventListener('click', () => {
            showAll = true;
            renderListWithMore(data, type, lang);
        });
    }
}

// ========================================================
// التبديل بين تابات الحضور والغياب
// ========================================================
window.switchAcademicTab = function (tab) {
    currentTab = tab;
    showAll = false; // إعادة تعيين عرض الكل عند تبديل التاب

    const tabAttendance = document.getElementById('tabAttendance');
    const tabAbsence    = document.getElementById('tabAbsence');
    const lang          = localStorage.getItem('sys_lang') || 'en';

    if (tab === 'attendance') {
        tabAttendance.style.color        = '#10b981';
        tabAttendance.style.borderBottom = '3px solid #10b981';
        tabAttendance.style.background   = 'white';
        tabAbsence.style.color           = '#94a3b8';
        tabAbsence.style.borderBottom    = 'none';
        tabAbsence.style.background      = '#f8fafc';
        renderListWithMore(cachedAttendance, 'attendance', lang);
    } else {
        tabAbsence.style.color           = '#ef4444';
        tabAbsence.style.borderBottom    = '3px solid #ef4444';
        tabAbsence.style.background      = 'white';
        tabAttendance.style.color        = '#94a3b8';
        tabAttendance.style.borderBottom = 'none';
        tabAttendance.style.background   = '#f8fafc';
        renderListWithMore(cachedAbsence, 'absence', lang);
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
        const userSnap = await getDoc(doc(db, "user_registrations", user.uid));
        if (!userSnap.exists()) {
            showError("User data not found.");
            return;
        }

        const userData = userSnap.data();
        const regInfo  = userData.registrationInfo || {};
        const studentID = regInfo.studentID || userData.studentID;

        if (!studentID) {
            showError("Student ID not found.");
            return;
        }

        // التحقق من وجود بيانات مخزنة وصالحة
        let attendanceData = getCachedAttendance();
        let absenceData = getCachedAbsence();

        if (!attendanceData || !absenceData) {
            // جلب البيانات الجديدة من Firestore
            const [attendance, absence] = await Promise.all([
                fetchAllAttendance(studentID, "ATTENDED"),
                fetchAllAttendance(studentID, "ABSENT")
            ]);

            attendanceData = attendance;
            absenceData = absence;

            // تخزينها في الكاش
            setCachedAttendance(attendanceData);
            setCachedAbsence(absenceData);
        }

        cachedAttendance = attendanceData;
        cachedAbsence    = absenceData;

        document.getElementById('attendanceTabCount').innerText = cachedAttendance.length;
        document.getElementById('absenceTabCount').innerText    = cachedAbsence.length;

        // عرض التاب الحالي (افتراضي attendance)
        currentTab = 'attendance';
        showAll = false;
        switchAcademicTab('attendance');

    } catch (e) {
        console.error("Academic Record Error:", e);
        showError("Error loading data. Please try again.");
    }
};
