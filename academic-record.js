import {
    collection, query, where, getDocs, doc, getDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


const CONFIG = {
    CACHE_KEY: 'academic_master_cache',
    RECORDS_LIMIT: 50,
    SEMESTER_START_DATE: "01/02/2026"
};

const COLLEGE_MAP = {
    'G': 'NURS', 'N': 'NURS',
    'P': 'PT', 'C': 'PHARM',
    'D': 'DENT', 'T': 'CS',
    'B': 'BA', 'H': 'HS',
    'E': 'ENG', 'A': 'ART', 'M': 'MED',
    'V': 'VET', 'I': 'MEDIA', 'L': 'ALSUN'
};

function getCollectionByGroup(group) {
    const letter = (group || '').replace(/[^a-zA-Z]/g, '')[0] || '';
    const college = COLLEGE_MAP[letter];
    return college ? `attendance_${college}` : 'attendance_NURS';
}

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
        absence: { color: '#ef4444', bg: '#fee2e2', icon: 'fa-xmark' }
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
<div style="font-weight:bold; color:#1e293b; font-size:13px;">
    ${item.subject || '---'}
    ${item.isOfflineSync
                    ? `<span style="font-size:10px; background:#fef3c7; color:#d97706; 
           padding:2px 7px; border-radius:8px; margin-right:6px; font-weight:700;">
           📴 أوفلاين</span>`
                    : ''}
</div>                        <div style="font-size:11px; color:#94a3b8; margin-top:2px;"><i class="fa-solid fa-user-tie"></i> ${item.doctorName || '---'}</div>
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
    document.getElementById('tabAbsence').className = tab === 'absence' ? 'tab-active-abs' : 'tab-inactive';

    renderList();
};

async function getStudentData(studentID, group) {

    const cached = localStorage.getItem(CONFIG.CACHE_KEY);
    if (cached) {
        const { data, cacheDate, sid } = JSON.parse(cached);
        if (sid === studentID && cacheDate === new Date().toDateString()) {
            console.log("تم تحميل البيانات من الكاش");
            return data;
        }
    }

    console.log("جلب بيانات جديدة من Firebase...");
    const finalData = { attended: [], absent: [] };
    const seen = new Set();
    const targetCol = getCollectionByGroup(group);
    const collectionsToQuery = [targetCol, 'attendance'];
    const statuses = ["ATTENDED", "ABSENT"];
    for (const colName of collectionsToQuery) {
        for (const status of statuses) {
            const q = query(
                collection(window.db, colName),
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
    }

    finalData.attended.sort((a, b) => parseDate(b.date) - parseDate(a.date));
    finalData.absent.sort((a, b) => parseDate(b.date) - parseDate(a.date));

    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
        data: finalData,
        cacheDate: new Date().toDateString(),
        sid: studentID
    }));

    return finalData;
}
window.openAcademicRecord = async function (forceRefresh = false) {
    const user = window.auth.currentUser;
    if (!user) return;

    const lastCall = window._lastAcademicCall || 0;
    const now = Date.now();
    if (!forceRefresh && now - lastCall < 30000) {
        document.getElementById('academicRecordModal').style.display = 'flex';
        if (state.rawAttendance.length || state.rawAbsence.length) {
            renderAnalytics();
            switchAcademicTab(state.currentTab);
            return;
        }
    }
    window._lastAcademicCall = now;
    document.getElementById('academicRecordModal').style.display = 'flex';
    document.getElementById('academicRecordContent').innerHTML = `<div style="text-align:center; padding:50px;"><i class="fa-solid fa-circle-notch fa-spin" style="color:#3b82f6; font-size:30px;"></i></div>`;
    document.getElementById('academicStatsContainer').innerHTML = '';

    if (forceRefresh === true) {
        localStorage.removeItem(CONFIG.CACHE_KEY);
    }

    try {
        let studentID = sessionStorage.getItem('cached_student_id');
        let group = sessionStorage.getItem('cached_student_group');
        if (!studentID || !group) {
            const userSnap = await getDoc(doc(window.db, "user_registrations", user.uid));
            const userData = userSnap.data();
            studentID = userData?.registrationInfo?.studentID || userData?.studentID;
            group = userData?.registrationInfo?.group || userData?.group || '';
            if (studentID) sessionStorage.setItem('cached_student_id', String(studentID));
            if (group) sessionStorage.setItem('cached_student_group', group);
        }

        if (!studentID) throw new Error("ID Not Found");

        const data = await getStudentData(studentID, group);

        state.rawAttendance = data.attended;
        state.rawAbsence = data.absent;

        document.getElementById('attendanceTabCount').innerText = data.attended.length;
        document.getElementById('absenceTabCount').innerText = data.absent.length;

        renderAnalytics();
        switchAcademicTab('attendance');

    } catch (e) {
        console.error(e);
        document.getElementById('academicRecordContent').innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">Error Loading Records</div>`;
    }
};
window.refreshAcademicData = function () {
    const lastRefresh = localStorage.getItem('last_refresh_time');
    const now = Date.now();

    if (lastRefresh && now - parseInt(lastRefresh) < 30000) {
        const remaining = Math.ceil((30000 - (now - parseInt(lastRefresh))) / 1000);
        _showRefreshThrottleModal(remaining);
        return;
    }

    localStorage.setItem('last_refresh_time', now);
    window._lastAcademicCall = 0;

    const refreshBtn = document.getElementById('refreshBtnIcon');
    if (refreshBtn) {
        refreshBtn.classList.add('fa-spin');
        refreshBtn.style.color = '#1a7abf';
    }

    window.openAcademicRecord(true).then(() => {
        if (refreshBtn) {
            refreshBtn.classList.remove('fa-spin');
            refreshBtn.style.color = '';
        }
    });
};

function _showRefreshThrottleModal(seconds) {
    const old = document.getElementById('refreshThrottleModal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'refreshThrottleModal';
    modal.style.cssText = `
        position:fixed; inset:0; z-index:99999;
        background:rgba(0,0,0,0.35);
        display:flex; align-items:center; justify-content:center;
    `;

    modal.innerHTML = `
        <div style="
            background:#e8f4fd; border-radius:24px;
            padding:28px 24px 24px; width:280px;
            text-align:center; border:1px solid #cce4f7;
        ">
            <div style="
                width:56px; height:56px; background:#bfdffc;
                border-radius:50%; display:flex;
                align-items:center; justify-content:center;
                margin:0 auto 14px;
            ">
                <i class="fa-solid fa-clock" style="font-size:24px; color:#1a7abf;"></i>
            </div>
            <div style="font-size:11px; font-weight:600; color:#1a7abf; letter-spacing:1px; margin-bottom:6px;">
                انتظر قليلاً
            </div>
            <div id="throttleCountdown" style="font-size:28px; font-weight:700; color:#0d4f80; margin-bottom:4px;">
                ${seconds}
            </div>
            <div style="font-size:12px; color:#5a9ec9; margin-bottom:16px;">
                ثانية قبل التحديث مجدداً
            </div>
            <div style="background:#d0ecfb; border-radius:999px; height:6px; overflow:hidden; margin-bottom:20px;">
                <div id="throttleBar" style="
                    height:100%; background:#1a7abf;
                    border-radius:999px;
                    width:${Math.round((seconds / 30) * 100)}%;
                    transition:width 1s linear;
                "></div>
            </div>
            <button onclick="document.getElementById('refreshThrottleModal').remove()" style="
                width:100%; background:#1a7abf; color:white;
                border:none; border-radius:14px; padding:12px;
                font-size:14px; font-weight:600; cursor:pointer;
            ">حسناً</button>
        </div>`;

    document.body.appendChild(modal);

    let remaining = seconds;
    const cdEl = document.getElementById('throttleCountdown');
    const barEl = document.getElementById('throttleBar');

    const iv = setInterval(() => {
        remaining--;
        if (cdEl) cdEl.textContent = remaining;
        if (barEl) barEl.style.width = Math.round((remaining / 30) * 100) + '%';
        if (remaining <= 0) {
            clearInterval(iv);
            const m = document.getElementById('refreshThrottleModal');
            if (m) m.remove();
        }
    }, 1000);
}
