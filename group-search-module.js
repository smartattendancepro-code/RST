

(function () {

    const MODULE_ID = 'groupSearchModule';

    const injectCSS = () => {
        if (document.getElementById('groupSearchCSS')) return;
        const style = document.createElement('style');
        style.id = 'groupSearchCSS';
        style.textContent = `

/* ── Wrapper Bar ── */
#groupSearchBar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
    border: 1.5px solid #bae6fd;
    border-radius: 16px;
    padding: 12px 16px;
    margin: 0 0 14px 0;
    box-shadow: 0 2px 10px rgba(14,165,233,0.08);
    transition: box-shadow 0.2s;
}
#groupSearchBar:focus-within {
    box-shadow: 0 0 0 3px rgba(14,165,233,0.18);
    border-color: #0ea5e9;
}

/* ── Icon ── */
#groupSearchBar .gsb-icon {
    color: #0ea5e9;
    font-size: 18px;
    flex-shrink: 0;
}

/* ── Input ── */
#groupCodeInput {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
    font-family: 'Outfit', 'Cairo', sans-serif;
    outline: none;
    text-transform: uppercase;
    letter-spacing: 1px;
    direction: ltr;
}
#groupCodeInput::placeholder {
    color: #94a3b8;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
}

/* ── Search Button ── */
#btnGroupSearch {
    background: linear-gradient(135deg, #0ea5e9, #0284c7);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 3px 10px rgba(14,165,233,0.3);
    white-space: nowrap;
}
#btnGroupSearch:active {
    transform: scale(0.96);
    box-shadow: 0 1px 5px rgba(14,165,233,0.2);
}
#btnGroupSearch:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

/* ── Date Picker ── */
#groupSearchDate {
    border: 1.5px solid #bae6fd;
    border-radius: 10px;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 600;
    color: #334155;
    background: #fff;
    cursor: pointer;
    font-family: inherit;
    outline: none;
    flex-shrink: 0;
}
#groupSearchDate:focus {
    border-color: #0ea5e9;
}

/* ── Results Container ── */
#groupSearchResults {
    display: none;
    flex-direction: column;
    gap: 0;
    background: #fff;
    border: 1.5px solid #e2e8f0;
    border-radius: 16px;
    overflow: hidden;
    margin-bottom: 14px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    animation: gsFadeIn 0.25s ease;
}
@keyframes gsFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ── Results Header ── */
.gs-results-header {
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #fff;
    padding: 14px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.gs-results-header .gs-group-name {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 1px;
    font-family: 'Outfit', sans-serif;
    color: #38bdf8;
}
.gs-results-header .gs-stats-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
}
.gs-stat-pill {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 5px;
}
.gs-stat-present { background: #dcfce7; color: #166534; }
.gs-stat-absent  { background: #fee2e2; color: #991b1b; }
.gs-stat-total   { background: #e0f2fe; color: #0369a1; }

/* ── Subject Sub-Header ── */
.gs-subject-header {
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    padding: 10px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}
.gs-subject-name {
    font-size: 13px;
    font-weight: 800;
    color: #334155;
    flex: 1;
}
.gs-doctor-name {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    background: #f1f5f9;
    padding: 3px 8px;
    border-radius: 8px;
}

/* ── Student Row ── */
.gs-student-row {
    display: flex;
    align-items: center;
    padding: 11px 18px;
    border-bottom: 1px solid #f1f5f9;
    gap: 12px;
    transition: background 0.1s;
}
.gs-student-row:last-child {
    border-bottom: none;
}
.gs-student-row:hover {
    background: #f8fafc;
}
.gs-student-row.absent {
    background: #fff8f8;
}
.gs-student-row.absent:hover {
    background: #fef2f2;
}

/* ── Status Badge ── */
.gs-status-badge {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 900;
}
.gs-status-badge.present {
    background: #dcfce7;
    color: #16a34a;
}
.gs-status-badge.absent {
    background: #fee2e2;
    color: #dc2626;
}

/* ── Student Info ── */
.gs-student-info {
    flex: 1;
    min-width: 0;
}
.gs-student-name {
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.gs-student-id {
    font-size: 11px;
    color: #64748b;
    font-family: 'Courier New', monospace;
    margin-top: 1px;
}

/* ── Attendance Details ── */
.gs-att-details {
    text-align: right;
    flex-shrink: 0;
}
.gs-att-time {
    font-size: 11px;
    font-weight: 700;
    color: #0ea5e9;
    direction: ltr;
}
.gs-att-hall {
    font-size: 10px;
    color: #94a3b8;
    margin-top: 1px;
}
.gs-absent-label {
    font-size: 11px;
    font-weight: 700;
    color: #ef4444;
}

/* ── Download Bar ── */
.gs-download-bar {
    background: #f8fafc;
    border-top: 1.5px solid #e2e8f0;
    padding: 12px 18px;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
}
.gs-download-bar .gs-dl-info {
    flex: 1;
    font-size: 11px;
    color: #64748b;
    font-weight: 600;
}
.gs-btn-download {
    border: none;
    border-radius: 10px;
    padding: 9px 16px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: transform 0.15s;
}
.gs-btn-download:active { transform: scale(0.96); }
.gs-btn-excel {
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: #fff;
    box-shadow: 0 3px 10px rgba(34,197,94,0.3);
}
.gs-btn-csv {
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #e2e8f0;
}

/* ── Empty / Error States ── */
.gs-state-box {
    padding: 30px 20px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 600;
}
.gs-state-box i {
    font-size: 30px;
    margin-bottom: 10px;
    display: block;
}
.gs-state-box.error { color: #ef4444; }
.gs-state-box.error i { color: #ef4444; }

/* ── Progress Skeleton ── */
.gs-skeleton-row {
    height: 50px;
    background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
    background-size: 200% 100%;
    animation: gsShimmer 1.2s infinite;
    margin: 6px 18px;
    border-radius: 8px;
}
@keyframes gsShimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

/* ── Percentage Bar ── */
.gs-percent-bar-wrap {
    height: 4px;
    background: #e2e8f0;
    border-radius: 2px;
    overflow: hidden;
    margin-top: 6px;
    width: 120px;
}
.gs-percent-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.6s ease;
}

        `;
        document.head.appendChild(style);
    };

    const fmtDate = (isoStr) => {
        const [y, m, d] = isoStr.split('-');
        return `${d}/${m}/${y}`;
    };

    const todayStr = () => {
        const n = new Date();
        return `${String(n.getDate()).padStart(2, '0')}/${String(n.getMonth() + 1).padStart(2, '0')}/${n.getFullYear()}`;
    };

    const todayISO = () => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    };

    const norm = (s) => (s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();

    const buildHTML = () => `
        <div id="${MODULE_ID}" style="padding: 0 4px;">
            <div id="groupSearchBar" style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-users-rectangle gsb-icon"></i>
                    <input
                        id="groupCodeInput"
                        type="text"
                        placeholder="Search for a group "
                        maxlength="6"
                        autocomplete="off"
                        spellcheck="false"
                    />
                    <button id="btnGroupSearch">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        بحث
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:8px; background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; padding:8px 12px;">
                    <i class="fa-regular fa-calendar-days" style="color:#64748b; font-size:14px;"></i>
                    <span style="font-size:12px; font-weight:700; color:#64748b;">تاريخ الحضور:</span>
                    <input id="groupSearchDate" type="date" style="flex:1; border:none; background:transparent; font-size:13px; font-weight:700; color:#0f172a; outline:none; cursor:pointer; font-family:'Courier New',monospace;" />
                </div>
            </div>
            <div id="groupSearchResults"></div>
        </div>
    `;

    const showSkeleton = (container) => {
        container.style.display = 'flex';
        container.innerHTML = `
            <div style="padding: 16px 0 8px;">
                ${Array(5).fill('<div class="gs-skeleton-row"></div>').join('')}
            </div>`;
    };

    const renderResults = (groupCode, targetDate, masterList, attendanceMap, subjectDoctorMap) => {
        const container = document.getElementById('groupSearchResults');
        if (!container) return;

        const presentCount = masterList.filter(s => attendanceMap.has(s.id)).length;
        const absentCount = masterList.length - presentCount;
        const pct = masterList.length ? Math.round((presentCount / masterList.length) * 100) : 0;
        const barColor = pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

        const subjects = [...new Set([...attendanceMap.values()].map(r => r.subject))];
        const subjectLabel = subjects.length > 0 ? subjects.join(' / ') : '—';
        const doctorLabel = [...new Set([...attendanceMap.values()].map(r => r.doctorName))].join(' / ') || '—';

        let rowsHTML = '';
        masterList.forEach((student, idx) => {
            const rec = attendanceMap.get(student.id);
            const isPresent = !!rec;

            rowsHTML += `
                <div class="gs-student-row ${isPresent ? '' : 'absent'}">
                    <div class="gs-status-badge ${isPresent ? 'present' : 'absent'}">
                        <i class="fa-solid fa-${isPresent ? 'check' : 'xmark'}"></i>
                    </div>
                    <div class="gs-student-info">
                        <div class="gs-student-name">${student.name}</div>
                        <div class="gs-student-id">${student.id}</div>
                    </div>
                    <div class="gs-att-details">
                        ${isPresent
                    ? `<div class="gs-att-time"><i class="fa-regular fa-clock" style="font-size:9px;"></i> ${rec.time_str || '--:--'}</div>
                               <div class="gs-att-hall"><i class="fa-solid fa-building-columns" style="font-size:9px;"></i> ${rec.hall || '--'}</div>`
                    : `<div class="gs-absent-label">غائب</div>`
                }
                    </div>
                </div>`;
        });

        const extraAttendees = [...attendanceMap.entries()].filter(
            ([id]) => !masterList.find(s => s.id === id)
        );
        extraAttendees.forEach(([id, rec]) => {
            rowsHTML += `
                <div class="gs-student-row" style="background:#fffbeb; border-left: 3px solid #f59e0b;">
                    <div class="gs-status-badge present" style="background:#fef9c3; color:#ca8a04;">
                        <i class="fa-solid fa-star" style="font-size:9px;"></i>
                    </div>
                    <div class="gs-student-info">
                        <div class="gs-student-name">${rec.name || id}</div>
                        <div class="gs-student-id">${id} <span style="color:#f59e0b; font-size:9px; font-weight:700;">(خارج النطاق)</span></div>
                    </div>
                    <div class="gs-att-details">
                        <div class="gs-att-time"><i class="fa-regular fa-clock" style="font-size:9px;"></i> ${rec.time_str || '--:--'}</div>
                        <div class="gs-att-hall"><i class="fa-solid fa-building-columns" style="font-size:9px;"></i> ${rec.hall || '--'}</div>
                    </div>
                </div>`;
        });

        container.style.display = 'flex';
        container.innerHTML = `
            <!-- Header -->
            <div class="gs-results-header">
                <div>
                    <div class="gs-group-name"><i class="fa-solid fa-users" style="font-size:14px; margin-left:6px;"></i>${groupCode.toUpperCase()}</div>
                    <div style="font-size:11px; color:#94a3b8; margin-top:3px; direction:ltr;">${targetDate}</div>
                </div>
                <div class="gs-stats-row">
                    <div class="gs-stat-pill gs-stat-present"><i class="fa-solid fa-circle-check"></i> ${presentCount} حاضر</div>
                    <div class="gs-stat-pill gs-stat-absent"><i class="fa-solid fa-circle-xmark"></i> ${absentCount} غائب</div>
                    <div class="gs-stat-pill gs-stat-total"><i class="fa-solid fa-users"></i> ${masterList.length + extraAttendees.length}</div>
                </div>
            </div>

            <!-- Subject & Doctor -->
            <div class="gs-subject-header">
                <div class="gs-subject-name"><i class="fa-solid fa-book-open" style="color:#0ea5e9; margin-left:6px;"></i>${subjectLabel}</div>
                <div class="gs-doctor-name"><i class="fa-solid fa-chalkboard-user" style="margin-left:4px;"></i>${doctorLabel}</div>
            </div>

            <!-- Percentage Bar -->
            <div style="padding: 10px 18px 4px; display:flex; align-items:center; gap:12px;">
                <div style="font-size:11px; font-weight:700; color:#64748b;">نسبة الحضور</div>
                <div class="gs-percent-bar-wrap" style="flex:1; width:auto;">
                    <div class="gs-percent-bar-fill" style="width:${pct}%; background:${barColor};"></div>
                </div>
                <div style="font-size:13px; font-weight:900; color:${barColor};">${pct}%</div>
            </div>

            <!-- Rows -->
            ${rowsHTML || '<div class="gs-state-box"><i class="fa-solid fa-folder-open"></i>لا توجد بيانات طلاب مسجلين لهذا الجروب</div>'}

            <!-- Download Bar -->
            <div class="gs-download-bar">
                <div class="gs-dl-info">
                    <i class="fa-solid fa-circle-info" style="color:#0ea5e9; margin-left:4px;"></i>
                    ${masterList.length} طالب مسجل · ${presentCount} حاضر · ${absentCount} غائب
                </div>
                <button class="gs-btn-download gs-btn-csv" onclick="window.gsExportCSV('${groupCode}','${targetDate}')">
                    <i class="fa-solid fa-file-csv"></i> CSV
                </button>
                <button class="gs-btn-download gs-btn-excel" onclick="window.gsExportExcel('${groupCode}','${targetDate}')">
                    <i class="fa-solid fa-file-excel"></i> تحميل Excel
                </button>
            </div>
        `;

        setTimeout(() => {
            const bar = container.querySelector('.gs-percent-bar-fill');
            if (bar) bar.style.width = pct + '%';
        }, 50);
    };

    const performSearch = async () => {
        const input = document.getElementById('groupCodeInput');
        const dateInput = document.getElementById('groupSearchDate');
        const btn = document.getElementById('btnGroupSearch');
        const container = document.getElementById('groupSearchResults');

        const groupCode = (input?.value || '').trim().toUpperCase();
        const targetDate = dateInput?.value ? fmtDate(dateInput.value) : todayStr();

        const groupPattern = /^\dG\d{1,2}$/;
        if (!groupCode) {
            if (typeof showToast === 'function') showToast('⚠️ أدخل كود الجروب أولاً', 2500, '#f59e0b');
            input?.focus();
            return;
        }
        if (!groupPattern.test(groupCode)) {
            if (typeof showToast === 'function') showToast('⚠️ صيغة غير صحيحة. مثال صحيح: 1G2', 3000, '#ef4444');
            input?.focus();
            return;
        }

        const origText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        btn.disabled = true;
        showSkeleton(container);

        window._gsLastData = { groupCode, targetDate, masterList: [], attendanceMap: new Map() };

        try {
            const db = window.db;
            if (!db) throw new Error('قاعدة البيانات غير متاحة');

            const { collection, query, where, getDocs, doc, getDoc } = await import(
                'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
            );

            const usersSnap = await getDocs(
                query(collection(db, 'user_registrations'),
                    where('registrationInfo.group', '==', groupCode))
            );

            const masterList = [];
            usersSnap.forEach(d => {
                const info = d.data().registrationInfo || d.data();
                if (info.studentID) {
                    masterList.push({
                        id: String(info.studentID).trim(),
                        name: info.fullName || 'غير معروف',
                        uid: d.id
                    });
                }
            });

            if (masterList.length === 0) {
                const studentsSnap = await getDocs(
                    query(collection(db, 'students'),
                        where('group_code', '==', groupCode))
                );
                studentsSnap.forEach(d => {
                    const data = d.data();
                    masterList.push({
                        id: String(data.id || d.id).trim(),
                        name: data.name || 'غير معروف',
                        uid: d.id
                    });
                });
            }

            // ترتيب أبجدي
            masterList.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

            // ── 2. جلب سجلات الحضور للتاريخ المحدد ──
            const attSnap = await getDocs(
                query(collection(db, 'attendance'),
                    where('date', '==', targetDate),
                    where('group', '==', groupCode))
            );

            const attendanceMap = new Map();
            const subjectDoctorMap = new Map();

            attSnap.forEach(d => {
                const data = d.data();
                const sid = String(data.id || '').trim();
                if (sid) {
                    attendanceMap.set(sid, {
                        name: data.name || '',
                        subject: data.subject || '—',
                        doctorName: data.doctorName || '—',
                        time_str: data.time_str || '--:--',
                        hall: data.hall || '—',
                        group: data.group || groupCode
                    });
                    subjectDoctorMap.set(data.subject || '—', data.doctorName || '—');
                }
            });

            // Fallback: لو الـ group field مش متسجل في attendance، ابحث بـ IDs
            if (attendanceMap.size === 0 && masterList.length > 0) {
                const ids = masterList.map(s => s.id);
                // Firebase بتسمح بـ 10 per `in` query
                const chunks = [];
                for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

                for (const chunk of chunks) {
                    const chunkSnap = await getDocs(
                        query(collection(db, 'attendance'),
                            where('date', '==', targetDate),
                            where('id', 'in', chunk))
                    );
                    chunkSnap.forEach(d => {
                        const data = d.data();
                        const sid = String(data.id || '').trim();
                        if (sid) {
                            attendanceMap.set(sid, {
                                name: data.name || '',
                                subject: data.subject || '—',
                                doctorName: data.doctorName || '—',
                                time_str: data.time_str || '--:--',
                                hall: data.hall || '—',
                                group: data.group || groupCode
                            });
                            subjectDoctorMap.set(data.subject || '—', data.doctorName || '—');
                        }
                    });
                }
            }

            window._gsLastData = { groupCode, targetDate, masterList, attendanceMap, subjectDoctorMap };

            if (masterList.length === 0 && attendanceMap.size === 0) {
                container.style.display = 'flex';
                container.innerHTML = `
                    <div class="gs-state-box">
                        <i class="fa-solid fa-folder-open"></i>
                        لم يُعثر على بيانات للجروب <strong>${groupCode}</strong>
                        <br><small style="color:#cbd5e1; font-size:11px;">تأكد من كود الجروب أو وجود طلاب مسجلين</small>
                    </div>`;
            } else {
                renderResults(groupCode, targetDate, masterList, attendanceMap, subjectDoctorMap);
            }

        } catch (err) {
            console.error('Group Search Error:', err);
            container.style.display = 'flex';
            container.innerHTML = `
                <div class="gs-state-box error">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    حدث خطأ أثناء البحث
                    <br><small style="font-size:10px;">${err.message}</small>
                </div>`;
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    };

    const buildExportRows = (groupCode, targetDate) => {
        const data = window._gsLastData;
        if (!data) return [];

        const { masterList, attendanceMap } = data;
        const rows = [];

        masterList.forEach((student, idx) => {
            const rec = attendanceMap.get(student.id);
            rows.push({
                'م': idx + 1,
                'اسم الطالب': student.name,
                'الرقم الجامعي': student.id,
                'المجموعة': groupCode,
                'التاريخ': targetDate,
                'الحالة': rec ? '✅ حاضر' : '❌ غائب',
                'وقت الحضور': rec ? (rec.time_str || '--') : '--',
                'القاعة': rec ? (rec.hall || '--') : '--',
                'المادة': rec ? (rec.subject || '--') : '--',
                'المحاضر': rec ? (rec.doctorName || '--') : '--',
                'ملاحظات': rec ? 'منضبط' : 'لم يحضر'
            });
        });

        [...attendanceMap.entries()].forEach(([id, rec]) => {
            if (!masterList.find(s => s.id === id)) {
                rows.push({
                    'م': rows.length + 1,
                    'اسم الطالب': rec.name || id,
                    'الرقم الجامعي': id,
                    'المجموعة': groupCode + ' (إضافي)',
                    'التاريخ': targetDate,
                    'الحالة': '✅ حاضر إضافي',
                    'وقت الحضور': rec.time_str || '--',
                    'القاعة': rec.hall || '--',
                    'المادة': rec.subject || '--',
                    'المحاضر': rec.doctorName || '--',
                    'ملاحظات': 'حضر من جروب آخر'
                });
            }
        });

        return rows;
    };

    window.gsExportExcel = (groupCode, targetDate) => {
        if (!window._gsLastData) return;
        if (typeof XLSX === 'undefined') {
            if (typeof showToast === 'function') showToast('⚠️ مكتبة Excel غير محملة', 3000, '#ef4444');
            return;
        }

        const rows = buildExportRows(groupCode, targetDate);
        if (!rows.length) {
            if (typeof showToast === 'function') showToast('⚠️ لا توجد بيانات للتصدير', 2500, '#f59e0b');
            return;
        }

        const ws = XLSX.utils.json_to_sheet(rows);

        ws['!cols'] = [
            { wch: 5 }, { wch: 32 }, { wch: 15 }, { wch: 10 }, { wch: 12 },
            { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 25 }, { wch: 15 }
        ];

        const range = XLSX.utils.decode_range(ws['!ref']);
        const hStyle = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: '0F172A' }, patternType: 'solid' },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
        };

        for (let C = range.s.c; C <= range.e.c; C++) {
            const hCell = XLSX.utils.encode_cell({ r: 0, c: C });
            if (ws[hCell]) ws[hCell].s = hStyle;
        }

        for (let R = 1; R <= range.e.r; R++) {
            const statusCell = XLSX.utils.encode_cell({ r: R, c: 5 }); // عمود الحالة
            const statusVal = ws[statusCell] ? ws[statusCell].v : '';
            const isAbsent = statusVal.includes('غائب');
            const isExtra = statusVal.includes('إضافي');

            const rowStyle = {
                fill: {
                    patternType: 'solid',
                    fgColor: { rgb: isAbsent ? 'FEE2E2' : isExtra ? 'FEFCE8' : 'F0FDF4' }
                },
                alignment: { horizontal: 'center' }
            };

            for (let C = range.s.c; C <= range.e.c; C++) {
                const ref = XLSX.utils.encode_cell({ r: R, c: C });
                if (ws[ref]) ws[ref].s = { ...rowStyle };
            }
        }

        ws['!views'] = [{ RTL: true }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'كشف الحضور');

        const safeName = groupCode.replace(/[^a-zA-Z0-9]/g, '_');
        const safeDate = (targetDate || '').replace(/\//g, '-');
        XLSX.writeFile(wb, `حضور_${safeName}_${safeDate}.xlsx`);

        if (typeof showToast === 'function') showToast('✅ تم تحميل ملف Excel بنجاح', 3000, '#10b981');
        if (navigator.vibrate) navigator.vibrate(50);
    };

    window.gsExportCSV = (groupCode, targetDate) => {
        if (!window._gsLastData) return;

        const rows = buildExportRows(groupCode, targetDate);
        if (!rows.length) {
            if (typeof showToast === 'function') showToast('⚠️ لا توجد بيانات', 2500, '#f59e0b');
            return;
        }

        const headers = Object.keys(rows[0]);
        let csv = '\uFEFF' + headers.join(',') + '\n';
        rows.forEach(row => {
            csv += headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `حضور_${groupCode}_${(targetDate || '').replace(/\//g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (typeof showToast === 'function') showToast('✅ تم تحميل CSV', 2500, '#10b981');
    };

    window.initGroupSearchModule = () => {
        injectCSS();

        const target = document.getElementById('viewSubjects');
        if (!target) {
            console.warn('GroupSearchModule: #viewSubjects not found');
            return;
        }

        const existing = document.getElementById(MODULE_ID);
        if (!existing) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = buildHTML();
            target.insertBefore(wrapper.firstElementChild, target.firstChild);
        }

        const dateInput = document.getElementById('groupSearchDate');
        if (dateInput) dateInput.value = todayISO();

        const codeInput = document.getElementById('groupCodeInput');
        if (codeInput) {
            codeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') performSearch();
            });
            codeInput.addEventListener('input', () => {
                codeInput.value = codeInput.value.replace(/[^0-9Gg]/g, '').toUpperCase();
            });
        }

        const btn = document.getElementById('btnGroupSearch');
        if (btn) btn.addEventListener('click', performSearch);

        console.log('✅ GroupSearchModule mounted');
    };

    const _originalOpenReportModal = window.openReportModal;
    if (typeof _originalOpenReportModal === 'function') {
        window.openReportModal = async function (...args) {
            await _originalOpenReportModal.apply(this, args);
            setTimeout(() => window.initGroupSearchModule(), 300);
        };
        console.log('✅ GroupSearchModule hooked into openReportModal');
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            const orig = window.openReportModal;
            if (typeof orig === 'function') {
                window.openReportModal = async function (...args) {
                    await orig.apply(this, args);
                    setTimeout(() => window.initGroupSearchModule(), 300);
                };
            }
        });
    }

})();
