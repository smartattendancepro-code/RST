/**
 * Academic Record System - Professional Version
 * Optimized for: Performance, Low Firebase Costs, and Scalability.
 */

import {
    collection, query, where, getDocs, doc, getDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;
const auth = window.auth;

const CONFIG = {
    ATTENDANCE_COLLECTIONS: ["attendance_NURS", "attendance_PT", "attendance"],
    CACHE_KEY_PREFIX: 'academic_cache_',
    CACHE_EXPIRY: 30 * 60 * 1000, 
    FETCH_LIMIT: 30 
};

let state = {
    attendance: [],
    absence: [],
    currentTab: 'attendance',
    showAll: false
};


const getUniqueKey = (item) => 
    `${item.id}_${item.subject}_${item.date}_${item.doctorName}`.toLowerCase().replace(/\s+/g, '');


async function fetchStudentRecords(studentID, status) {
    const results = [];
    const seenKeys = new Set();

    const fetchPromises = CONFIG.ATTENDANCE_COLLECTIONS.map(async (colName) => {
        try {
            const q = query(
                collection(db, colName),
                where("id", "==", String(studentID)),
                where("status", "==", status),
                orderBy("date", "desc"), 
                limit(CONFIG.FETCH_LIMIT)
            );

            const snap = await getDocs(q);
            snap.forEach(d => {
                const data = d.data();
                const key = getUniqueKey(data);
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    results.push(data);
                }
            });
        } catch (e) {
            if (e.message.includes("index")) {
                console.error(`🔴 تحتاج لإنشاء Index لمجموعة [${colName}]. اضغط على الرابط في رسالة الخطأ الأصلية.`);
            }
            console.warn(`⚠️ فشل الجلب من [${colName}]:`, e.message);
        }
    });

    await Promise.all(fetchPromises);
    return results.sort((a, b) => parseDate(b.date) - parseDate(a.date));
}

function parseDate(dateStr) {
    if (!dateStr) return new Date(0);
    const [d, m, y] = dateStr.split('/').map(Number);
    return new Date(y, m - 1, d);
}


const CacheManager = {
    save: (type, data) => {
        const payload = { data, expiry: Date.now() + CONFIG.CACHE_EXPIRY };
        localStorage.setItem(CONFIG.CACHE_KEY_PREFIX + type, JSON.stringify(payload));
    },
    get: (type) => {
        const raw = localStorage.getItem(CONFIG.CACHE_KEY_PREFIX + type);
        if (!raw) return null;
        const { data, expiry } = JSON.parse(raw);
        if (Date.now() > expiry) return null;
        return data;
    }
};


function renderContent(data, type) {
    const container = document.getElementById('academicRecordContent');
    const lang = localStorage.getItem('sys_lang') || 'ar';

    if (!data?.length) {
        const msg = lang === 'ar' ? 'لا توجد بيانات مسجلة حالياً' : 'No records found';
        container.innerHTML = `<div class="empty-state" style="text-align:center; padding:40px; color:#94a3b8;">
            <i class="fa-solid fa-folder-open" style="font-size:40px;"></i><p>${msg}</p></div>`;
        return;
    }

    const groups = data.reduce((acc, item) => {
        (acc[item.date] = acc[item.date] || []).push(item);
        return acc;
    }, {});

    const sortedDates = Object.keys(groups).sort((a, b) => parseDate(b) - parseDate(a));
    const visibleDates = state.showAll ? sortedDates : sortedDates.slice(0, 1);

    const configUI = {
        attendance: { color: '#10b981', icon: 'fa-circle-check', bg: '#dcfce7' },
        absence: { color: '#ef4444', icon: 'fa-circle-xmark', bg: '#fee2e2' }
    }[type];

    let html = '';
    visibleDates.forEach(date => {
        html += `<div class="date-group" style="margin-bottom:20px;">
            <div class="date-badge" style="background:#f1f5f9; padding:5px 15px; border-radius:20px; font-size:12px; display:inline-block; font-weight:bold; margin-bottom:10px;">
                <i class="fa-regular fa-calendar-days"></i> ${date}
            </div>`;
        
        groups[date].forEach(item => {
            html += `
                <div class="record-card" style="background:white; border:1px solid #e2e8f0; border-right:5px solid ${configUI.color}; border-radius:12px; padding:15px; margin-bottom:10px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:800; color:#1e293b;">${item.subject || 'N/A'}</span>
                        <span style="background:${configUI.bg}; color:${configUI.color}; padding:3px 10px; border-radius:8px; font-size:10px; font-weight:900;">
                            <i class="fa-solid ${configUI.icon}"></i>
                        </span>
                    </div>
                    <div style="margin-top:8px; font-size:12px; color:#64748b; display:flex; justify-content:space-between;">
                        <span><i class="fa-solid fa-user-doctor"></i> ${item.doctorName || '--'}</span>
                        <span style="font-family:monospace;">${item.time || ''}</span>
                    </div>
                </div>`;
        });
        html += `</div>`;
    });

    if (!state.showAll && sortedDates.length > 1) {
        html += `<div style="text-align:center;"><button onclick="expandAcademicRecords()" style="background:#3b82f6; color:white; border:none; padding:10px 25px; border-radius:25px; font-weight:bold; cursor:pointer;">
            ${lang === 'ar' ? 'عرض السجل الكامل' : 'Show Full History'}</button></div>`;
    }

    container.innerHTML = html;
}


window.expandAcademicRecords = () => {
    state.showAll = true;
    renderContent(state[state.currentTab], state.currentTab);
};

window.switchAcademicTab = (tab) => {
    state.currentTab = tab;
    state.showAll = false;
    
    const isAr = (localStorage.getItem('sys_lang') || 'ar') === 'ar';
    const activeColor = tab === 'attendance' ? '#10b981' : '#ef4444';
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.style.borderBottom = 'none';
        btn.style.color = '#94a3b8';
    });

    const activeBtn = document.getElementById(tab === 'attendance' ? 'tabAttendance' : 'tabAbsence');
    if (activeBtn) {
        activeBtn.style.color = activeColor;
        activeBtn.style.borderBottom = `3px solid ${activeColor}`;
    }

    renderContent(state[tab], tab);
};

window.openAcademicRecord = async function () {
    const user = auth.currentUser;
    if (!user) return;

    document.getElementById('academicRecordModal').style.display = 'flex';
    document.getElementById('academicRecordContent').innerHTML = '<div style="text-align:center; padding:50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:30px; color:#3b82f6;"></i></div>';

    try {
        const userSnap = await getDoc(doc(db, "user_registrations", user.uid));
        const studentID = userSnap.data()?.registrationInfo?.studentID || userSnap.data()?.studentID;

        if (!studentID) throw new Error("Student ID missing");

        let att = CacheManager.get('attendance');
        let abs = CacheManager.get('absence');

        if (!att || !abs) {
            [att, abs] = await Promise.all([
                fetchStudentRecords(studentID, "ATTENDED"),
                fetchStudentRecords(studentID, "ABSENT")
            ]);
            CacheManager.save('attendance', att);
            CacheManager.save('absence', abs);
        }

        state.attendance = att;
        state.absence = abs;

        document.getElementById('attendanceTabCount').innerText = att.length;
        document.getElementById('absenceTabCount').innerText = abs.length;

        switchAcademicTab('attendance');

    } catch (e) {
        console.error(e);
        document.getElementById('academicRecordContent').innerHTML = `<div style="color:#ef4444; text-align:center; padding:30px;">${e.message}</div>`;
    }
};
