import {
    collection, query, where, getDocs, doc, getDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const CONFIG = {
    COLLECTIONS: ["attendance_NURS", "attendance_PT", "attendance"],
    CACHE_KEY: 'academic_master_cache',
    RECORDS_LIMIT: 200,                // ✅ رُفع من 40 → 200
    SEMESTER_START_DATE: "01/02/2026"
};

let state = {
    rawAttendance: [],
    rawAbsence: [],
    currentTab: 'attendance',
    displayCount: 2,
    lang: localStorage.getItem('sys_lang') || 'ar'
};

const parseDate = (str) => {
    if (!str) return new Date(0);
    const [d, m, y] = str.split('/').map(Number);
    return new Date(y, m - 1, d);
};

const getUniqueKey = (item) =>
    `${item.id}_${item.subject}_${item.date}`.toLowerCase().replace(/\s+/g, '');

async function getStudentData(studentID) {
    const cached = localStorage.getItem(CONFIG.CACHE_KEY);
    if (cached) {
        const { data, cacheDate, sid } = JSON.parse(cached);
        if (sid === studentID && cacheDate === new Date().toDateString()) return data;
    }

    const finalData = { attended: [], absent: [] };
    const seen = new Set();

    const fetchTask = CONFIG.COLLECTIONS.map(async (col) => {
        const statuses = ["ATTENDED", "ABSENT"];
        for (const status of statuses) {
            const q = query(
                collection(window.db, col),
                where("id", "==", String(studentID)),
                where("status", "==", status),
                orderBy("date", "desc"),
                limit(CONFIG.RECORDS_LIMIT)
            );

            const snap = await getDocs(q);
            snap.forEach(d => {
                const item = d.data();
                const key = getUniqueKey(item);
                if (!seen.has(key)) {
                    seen.add(key);
                    status === "ATTENDED"
                        ? finalData.attended.push(item)
                        : finalData.absent.push(item);
                }
            });
        }
    });

    await Promise.all(fetchTask);

    finalData.attended.sort((a, b) => parseDate(b.date) - parseDate(a.date));
    finalData.absent.sort((a, b) => parseDate(b.date) - parseDate(a.date));

    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
        data: finalData,
        cacheDate: new Date().toDateString(),
        sid: studentID
    }));

    return finalData;
}

function renderAnalytics() {
    const container = document.getElementById('academicStatsContainer');
    if (!container) return;

    const startDate = parseDate(CONFIG.SEMESTER_START_DATE);
    const stats = {};

    const allRecords = [...state.rawAttendance, ...state.rawAbsence];

    allRecords.forEach(item => {
        if (parseDate(item.date) >= startDate) {
            const sub = item.subject || 'General';
            if (!stats[sub]) stats[sub] = { attended: 0, absent: 0 };
            item.status === "ATTENDED" ? stats[sub].attended++ : stats[sub].absent++;
        }
    });

    let html = `<div style="display:flex; overflow-x:auto; gap:12px; padding:10px 5px; scrollbar-width:none;">`;

    Object.keys(stats).forEach(sub => {
        const total = stats[sub].attended + stats[sub].absent;
        const ratio = ((stats[sub].absent / total) * 100).toFixed(0);
        const color = ratio > 20 ? '#ef4444' : (ratio > 10 ? '#f59e0b' : '#10b981');

        html += `
            <div style="flex:0 0 130px; background:white; border:1px solid #e2e8f0; border-radius:15px; padding:12px; box-shadow:0 2px 5px rgba(0,0,0,0.03);">
                <div style="font-size:10px; font-weight:bold; color:#64748b; text-transform:uppercase; margin-bottom:4px;">${sub}</div>
                <div style="font-size:22px; font-weight:900; color:${color};">${ratio}%</div>
                <div style="font-size:10px; color:#94a3b8; margin-top:2px;">
                    ${state.lang === 'ar' ? 'غياب' : 'Abs'}: <b>${stats[sub].absent}</b> / ${total}
                </div>
                <div style="height:4px; background:#f1f5f9; border-radius:10px; margin-top:8px; overflow:hidden;">
                    <div style="width:${ratio}%; height:100%; background:${color};"></div>
                </div>
            </div>`;
    });

    html += `</div>`;
    container.innerHTML = html || `<p style="text-align:center; font-size:12px; color:#94a3b8;">No data for current semester</p>`;
}

function renderList() {
    const container = document.getElementById('academicRecordContent');
    const data = state.currentTab === 'attendance' ? state.rawAttendance : state.rawAbsence;

    if (data.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#cbd5e1;"><i class="fa-solid fa-ghost" style="font-size:30px;"></i><p>No Records</p></div>`;
        return;
    }

    const groups = data.reduce((acc, item) => {
        (acc[item.date] = acc[item.date] || []).push(item);
        return acc;
    }, {});

    const sortedDates = Object.keys(groups).sort((a, b) => parseDate(b) - parseDate(a));
    const visibleDates = sortedDates.slice(0, state.displayCount);

    const ui = {
        attendance: { color: '#10b981', bg: '#dcfce7', icon: 'fa-check-double' },
        absence:    { color: '#ef4444', bg: '#fee2e2', icon: 'fa-xmark' }
    }[state.currentTab];

    let html = '';
    visibleDates.forEach(date => {
        html += `<div style="margin-bottom:15px;">
            <div style="font-size:11px; font-weight:bold; color:#64748b; margin-bottom:8px; padding-left:5px;">
                <i class="fa-regular fa-calendar"></i> ${date}
            </div>`;

        groups[date].forEach(item => {
            html += `
                <div style="background:white; border:1px solid #f1f5f9; border-left:4px solid ${ui.color}; border-radius:12px; padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:bold; color:#1e293b; font-size:13px;">${item.subject || '---'}</div>
                        <div style="font-size:11px; color:#94a3b8; margin-top:2px;"><i class="fa-solid fa-user-tie"></i> ${item.doctorName || '---'}</div>
                    </div>
                    <div style="background:${ui.bg}; color:${ui.color}; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px;">
                        <i class="fa-solid ${ui.icon}"></i>
                    </div>
                </div>`;
        });
        html += `</div>`;
    });

    if (state.displayCount < sortedDates.length) {
        html += `<button onclick="window.academicLoadMore()" style="width:100%; background:none; border:2px dashed #e2e8f0; color:#94a3b8; padding:10px; border-radius:12px; font-weight:bold; cursor:pointer; font-size:12px;">
            + ${state.lang === 'ar' ? 'عرض المزيد' : 'Load More'}</button>`;
    }

    container.innerHTML = html;
}

window.academicLoadMore = () => {
    state.displayCount += 3;
    renderList();
};

window.switchAcademicTab = (tab) => {
    state.currentTab = tab;
    state.displayCount = 2;

    document.getElementById('tabAttendance').className = tab === 'attendance' ? 'tab-active-att' : 'tab-inactive';
    document.getElementById('tabAbsence').className    = tab === 'absence'    ? 'tab-active-abs' : 'tab-inactive';

    renderList();
};

window.openAcademicRecord = async function () {
    const user = window.auth.currentUser;
    if (!user) return;  

    document.getElementById('academicRecordModal').style.display = 'flex';
    document.getElementById('academicRecordContent').innerHTML = `<div style="text-align:center; padding:50px;"><i class="fa-solid fa-circle-notch fa-spin" style="color:#3b82f6; font-size:30px;"></i></div>`;
    document.getElementById('academicStatsContainer').innerHTML = '';

    try {
        const userSnap = await getDoc(doc(window.db, "user_registrations", user.uid));
        const studentID = userSnap.data()?.registrationInfo?.studentID || userSnap.data()?.studentID;

        if (!studentID) throw new Error("ID Not Found");

        const data = await getStudentData(studentID);

        state.rawAttendance = data.attended;
        state.rawAbsence    = data.absent;

        document.getElementById('attendanceTabCount').innerText = data.attended.length;
        document.getElementById('absenceTabCount').innerText    = data.absent.length;

        renderAnalytics();
        switchAcademicTab('attendance');

    } catch (e) {
        console.error(e);
        document.getElementById('academicRecordContent').innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">Error Loading Records</div>`;
    }
};
