/**
 * ============================================================
 *  GROUP ATTENDANCE SEARCH MODULE v2
 *  بحث بالجروب → زرار تحميل مباشر (بدون عرض الأسماء)
 * ============================================================
 */

(function () {

    const MODULE_ID = 'groupSearchModule';

    // ─── CSS ──────────────────────────────────────────────────
    const injectCSS = () => {
        if (document.getElementById('groupSearchCSS')) return;
        const style = document.createElement('style');
        style.id = 'groupSearchCSS';
        style.textContent = `

#groupSearchModule { padding: 0 4px 10px; }

/* ── Search Bar ── */
#groupSearchBar {
    display: flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
    border: 1.5px solid #bae6fd;
    border-radius: 16px;
    padding: 11px 14px;
    margin-bottom: 10px;
    box-shadow: 0 2px 10px rgba(14,165,233,0.08);
    transition: box-shadow 0.2s;
}
#groupSearchBar:focus-within {
    box-shadow: 0 0 0 3px rgba(14,165,233,0.15);
    border-color: #0ea5e9;
}
#groupSearchBar .gsb-icon {
    color: #0ea5e9;
    font-size: 17px;
    flex-shrink: 0;
}
#groupCodeInput {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 15px;
    font-weight: 800;
    color: #0f172a;
    font-family: 'Outfit', 'Cairo', sans-serif;
    outline: none;
    text-transform: uppercase;
    letter-spacing: 2px;
    direction: ltr;
    min-width: 0;
}
#groupCodeInput::placeholder {
    color: #94a3b8;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
}
#groupSearchDate {
    border: 1.5px solid #bae6fd;
    border-radius: 10px;
    padding: 6px 9px;
    font-size: 12px;
    font-weight: 600;
    color: #334155;
    background: #fff;
    font-family: inherit;
    outline: none;
    flex-shrink: 0;
    max-width: 130px;
}
#groupSearchDate:focus { border-color: #0ea5e9; }
#btnGroupSearch {
    background: linear-gradient(135deg, #0ea5e9, #0284c7);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 3px 10px rgba(14,165,233,0.3);
    transition: transform 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
}
#btnGroupSearch:active { transform: scale(0.96); }
#btnGroupSearch:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

/* ── Result Card ── */
#gsResultCard {
    display: none;
    flex-direction: column;
    border-radius: 16px;
    overflow: hidden;
    border: 1.5px solid #e2e8f0;
    box-shadow: 0 4px 20px rgba(0,0,0,0.07);
    animation: gsFadeUp 0.25s ease;
    margin-bottom: 4px;
}
@keyframes gsFadeUp {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0); }
}

/* header */
.gsr-header {
    background: linear-gradient(135deg, #0f172a, #1e293b);
    padding: 14px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
}
.gsr-group-name {
    font-size: 22px;
    font-weight: 900;
    color: #38bdf8;
    font-family: 'Outfit', monospace;
    letter-spacing: 2px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.gsr-date {
    font-size: 11px;
    color: #64748b;
    margin-top: 3px;
    font-family: 'Courier New', monospace;
    direction: ltr;
}
.gsr-pills {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.gsr-pill {
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 5px;
}
.gsr-pill-present { background:#dcfce7; color:#166534; }
.gsr-pill-absent  { background:#fee2e2; color:#991b1b; }
.gsr-pill-total   { background:#e0f2fe; color:#0369a1; }

/* subject row */
.gsr-subject-row {
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    padding: 11px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.gsr-subject {
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
}
.gsr-doctor {
    font-size: 11px;
    color: #64748b;
    background: #e2e8f0;
    padding: 3px 10px;
    border-radius: 8px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
}

/* percent bar */
.gsr-pct-row {
    padding: 12px 18px 10px;
    background: #fff;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #f1f5f9;
}
.gsr-pct-label {
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
    white-space: nowrap;
}
.gsr-bar-wrap {
    flex: 1;
    height: 8px;
    background: #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
}
.gsr-bar-fill {
    height: 100%;
    border-radius: 10px;
    width: 0;
    transition: width 0.7s cubic-bezier(.4,0,.2,1);
}
.gsr-pct-num {
    font-size: 15px;
    font-weight: 900;
    min-width: 40px;
    text-align: right;
}

/* download area */
.gsr-download-area {
    background: #fff;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.gsr-dl-info {
    flex: 1;
    font-size: 11px;
    color: #64748b;
    font-weight: 600;
    line-height: 1.7;
    min-width: 120px;
}
.gsr-dl-info strong {
    color: #0f172a;
    font-size: 12px;
}
.gsr-btn-dl {
    border: none;
    border-radius: 12px;
    padding: 11px 20px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: transform 0.15s, box-shadow 0.15s;
    flex-shrink: 0;
}
.gsr-btn-dl:active { transform: scale(0.96); }
.gsr-btn-excel {
    background: linear-gradient(135deg, #22c55e, #15803d);
    color: #fff;
    box-shadow: 0 4px 14px rgba(34,197,94,0.35);
}
.gsr-btn-csv {
    background: #f1f5f9;
    color: #475569;
    border: 1.5px solid #e2e8f0;
}

/* empty / error */
.gsr-state {
    padding: 28px 20px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 600;
    background: #fff;
}
.gsr-state i { font-size: 28px; margin-bottom: 10px; display: block; opacity: 0.5; }
.gsr-state.error { color: #ef4444; }
.gsr-state.error i { opacity: 1; }

        `;
        document.head.appendChild(style);
    };

    // ─── Helpers ──────────────────────────────────────────────
    const fmtDate = (iso) => {
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    };
    const todayISO = () => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
    };
    const todayStr = () => fmtDate(todayISO());

    // ─── HTML ─────────────────────────────────────────────────
    const buildHTML = () => `
        <div id="${MODULE_ID}">
            <div id="groupSearchBar">
                <i class="fa-solid fa-users-rectangle gsb-icon"></i>
                <input
                    id="groupCodeInput"
                    type="text"
                    placeholder="مثال: 1G2"
                    maxlength="6"
                    autocomplete="off"
                    spellcheck="false"
                />
                <input id="groupSearchDate" type="date" />
                <button id="btnGroupSearch">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    بحث
                </button>
            </div>
            <div id="gsResultCard"></div>
        </div>
    `;

    // ─── Render Result Card ───────────────────────────────────
    const renderCard = ({ groupCode, targetDate, masterList, attendanceMap }) => {
        const card = document.getElementById('gsResultCard');
        if (!card) return;

        const presentCount = masterList.filter(s => attendanceMap.has(s.id)).length;
        const extraCount   = [...attendanceMap.keys()].filter(id => !masterList.find(s => s.id === id)).length;
        const totalPresent = presentCount + extraCount;
        const absentCount  = masterList.length - presentCount;
        const pct = masterList.length ? Math.round((presentCount / masterList.length) * 100) : 0;
        const barColor = pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

        const subjects   = [...new Set([...attendanceMap.values()].map(r => r.subject).filter(Boolean))];
        const doctors    = [...new Set([...attendanceMap.values()].map(r => r.doctorName).filter(Boolean))];
        const subjectTxt = subjects.join(' • ') || '—';
        const doctorTxt  = doctors.join(' / ')  || '—';

        card.style.display = 'flex';
        card.innerHTML = `
            <div class="gsr-header">
                <div>
                    <div class="gsr-group-name">
                        <i class="fa-solid fa-users" style="font-size:16px;"></i>
                        ${groupCode}
                    </div>
                    <div class="gsr-date">${targetDate}</div>
                </div>
                <div class="gsr-pills">
                    <div class="gsr-pill gsr-pill-present">
                        <i class="fa-solid fa-circle-check"></i> ${totalPresent} حاضر
                    </div>
                    <div class="gsr-pill gsr-pill-absent">
                        <i class="fa-solid fa-circle-xmark"></i> ${absentCount} غائب
                    </div>
                    <div class="gsr-pill gsr-pill-total">
                        <i class="fa-solid fa-users"></i> ${masterList.length}
                    </div>
                </div>
            </div>

            <div class="gsr-subject-row">
                <div class="gsr-subject">
                    <i class="fa-solid fa-book-open" style="color:#0ea5e9; flex-shrink:0;"></i>
                    ${subjectTxt}
                </div>
                <div class="gsr-doctor">
                    <i class="fa-solid fa-chalkboard-user"></i>
                    ${doctorTxt}
                </div>
            </div>

            <div class="gsr-pct-row">
                <div class="gsr-pct-label">نسبة الحضور</div>
                <div class="gsr-bar-wrap">
                    <div class="gsr-bar-fill" id="gsBarFill" style="background:${barColor};"></div>
                </div>
                <div class="gsr-pct-num" style="color:${barColor};">${pct}%</div>
            </div>

            <div class="gsr-download-area">
                <div class="gsr-dl-info">
                    <strong>${masterList.length} طالب مسجل</strong><br>
                    ${totalPresent} حاضر &nbsp;·&nbsp; ${absentCount} غائب
                    ${extraCount ? `&nbsp;·&nbsp; <span style="color:#f59e0b; font-weight:800;">${extraCount} إضافي</span>` : ''}
                </div>
                <button class="gsr-btn-dl gsr-btn-csv" onclick="window.gsExportCSV()">
                    <i class="fa-solid fa-file-csv"></i> CSV
                </button>
                <button class="gsr-btn-dl gsr-btn-excel" onclick="window.gsExportExcel()">
                    <i class="fa-solid fa-file-excel"></i> تحميل Excel
                </button>
            </div>
        `;

        requestAnimationFrame(() => {
            setTimeout(() => {
                const bar = document.getElementById('gsBarFill');
                if (bar) bar.style.width = pct + '%';
            }, 80);
        });
    };

    // ─── Core Search ──────────────────────────────────────────
    const performSearch = async () => {
        const codeInput = document.getElementById('groupCodeInput');
        const dateInput = document.getElementById('groupSearchDate');
        const btn       = document.getElementById('btnGroupSearch');
        const card      = document.getElementById('gsResultCard');

        const groupCode  = (codeInput?.value || '').trim().toUpperCase();
        const targetDate = dateInput?.value ? fmtDate(dateInput.value) : todayStr();

        if (!groupCode) {
            if (typeof showToast === 'function') showToast('⚠️ أدخل كود الجروب', 2500, '#f59e0b');
            codeInput?.focus();
            return;
        }
        if (!/^\dG\d{1,2}$/.test(groupCode)) {
            if (typeof showToast === 'function') showToast('⚠️ صيغة غير صحيحة — مثال: 1G2', 3000, '#ef4444');
            codeInput?.focus();
            return;
        }

        const origText = btn.innerHTML;
        btn.innerHTML  = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري البحث...';
        btn.disabled   = true;
        card.style.display = 'flex';
        card.innerHTML = `
            <div class="gsr-state">
                <i class="fa-solid fa-circle-notch fa-spin" style="opacity:1; color:#0ea5e9;"></i>
                جاري جلب بيانات الجروب <strong>${groupCode}</strong>...
            </div>`;

        window._gsLastData = null;

        try {
            const db = window.db;
            if (!db) throw new Error('قاعدة البيانات غير متاحة');

            const { collection, query, where, getDocs } = await import(
                'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
            );

            // ── 1. Master list ──
            let masterList = [];

            const regSnap = await getDocs(
                query(collection(db, 'user_registrations'),
                      where('registrationInfo.group', '==', groupCode))
            );
            regSnap.forEach(d => {
                const info = d.data().registrationInfo || d.data();
                if (info.studentID) masterList.push({
                    id:   String(info.studentID).trim(),
                    name: info.fullName || 'غير معروف'
                });
            });

            if (!masterList.length) {
                const stSnap = await getDocs(
                    query(collection(db, 'students'),
                          where('group_code', '==', groupCode))
                );
                stSnap.forEach(d => {
                    const data = d.data();
                    masterList.push({
                        id:   String(data.id || d.id).trim(),
                        name: data.name || 'غير معروف'
                    });
                });
            }

            masterList.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

            // ── 2. Attendance ──
            const attendanceMap = new Map();

            const attSnap = await getDocs(
                query(collection(db, 'attendance'),
                      where('date',  '==', targetDate),
                      where('group', '==', groupCode))
            );
            attSnap.forEach(d => {
                const data = d.data();
                const sid  = String(data.id || '').trim();
                if (sid) attendanceMap.set(sid, {
                    name:       data.name       || '',
                    subject:    data.subject     || '—',
                    doctorName: data.doctorName  || '—',
                    time_str:   data.time_str    || '--:--',
                    hall:       data.hall        || '—'
                });
            });

            // fallback بالـ IDs
            if (!attendanceMap.size && masterList.length) {
                const ids = masterList.map(s => s.id);
                for (let i = 0; i < ids.length; i += 10) {
                    const chunk = ids.slice(i, i + 10);
                    const snap = await getDocs(
                        query(collection(db, 'attendance'),
                              where('date', '==', targetDate),
                              where('id',   'in',  chunk))
                    );
                    snap.forEach(d => {
                        const data = d.data();
                        const sid  = String(data.id || '').trim();
                        if (sid) attendanceMap.set(sid, {
                            name:       data.name       || '',
                            subject:    data.subject     || '—',
                            doctorName: data.doctorName  || '—',
                            time_str:   data.time_str    || '--:--',
                            hall:       data.hall        || '—'
                        });
                    });
                }
            }

            // ── 3. Check ──
            if (!masterList.length && !attendanceMap.size) {
                card.style.display = 'flex';
                card.innerHTML = `
                    <div class="gsr-state">
                        <i class="fa-solid fa-folder-open"></i>
                        لم يُعثر على بيانات للجروب <strong>${groupCode}</strong>
                        <br><small style="color:#cbd5e1; font-size:11px; margin-top:6px; display:block;">
                            تأكد من كود الجروب أو التاريخ
                        </small>
                    </div>`;
                return;
            }

            window._gsLastData = { groupCode, targetDate, masterList, attendanceMap };
            renderCard({ groupCode, targetDate, masterList, attendanceMap });

        } catch (err) {
            console.error('GroupSearch Error:', err);
            card.style.display = 'flex';
            card.innerHTML = `
                <div class="gsr-state error">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    حدث خطأ أثناء البحث
                    <br><small style="font-size:10px; margin-top:4px; display:block; opacity:0.7;">${err.message}</small>
                </div>`;
        } finally {
            btn.innerHTML = origText;
            btn.disabled  = false;
        }
    };

    // ─── Export ───────────────────────────────────────────────
    const buildRows = () => {
        const d = window._gsLastData;
        if (!d) return [];
        const { groupCode, targetDate, masterList, attendanceMap } = d;
        const rows = [];

        masterList.forEach((s, i) => {
            const rec = attendanceMap.get(s.id);
            rows.push({
                'م':             i + 1,
                'اسم الطالب':   s.name,
                'الرقم الجامعي': s.id,
                'المجموعة':      groupCode,
                'التاريخ':       targetDate,
                'الحالة':        rec ? '✅ حاضر' : '❌ غائب',
                'وقت الحضور':   rec?.time_str || '—',
                'القاعة':        rec?.hall     || '—',
                'المادة':        rec?.subject  || '—',
                'المحاضر':       rec?.doctorName || '—',
                'ملاحظات':       rec ? 'منضبط' : 'غائب'
            });
        });

        [...attendanceMap.entries()].forEach(([id, rec]) => {
            if (!masterList.find(s => s.id === id)) {
                rows.push({
                    'م':             rows.length + 1,
                    'اسم الطالب':   rec.name || id,
                    'الرقم الجامعي': id,
                    'المجموعة':      groupCode + ' (إضافي)',
                    'التاريخ':       targetDate,
                    'الحالة':        '⚡ حاضر إضافي',
                    'وقت الحضور':   rec.time_str || '—',
                    'القاعة':        rec.hall     || '—',
                    'المادة':        rec.subject  || '—',
                    'المحاضر':       rec.doctorName || '—',
                    'ملاحظات':       'من جروب آخر'
                });
            }
        });
        return rows;
    };

    window.gsExportExcel = () => {
        if (!window._gsLastData) return;
        if (typeof XLSX === 'undefined') {
            if (typeof showToast === 'function') showToast('⚠️ مكتبة Excel غير محملة', 3000, '#ef4444');
            return;
        }
        const { groupCode, targetDate } = window._gsLastData;
        const rows = buildRows();
        if (!rows.length) { if (typeof showToast === 'function') showToast('لا توجد بيانات', 2500, '#f59e0b'); return; }

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{wch:5},{wch:32},{wch:15},{wch:10},{wch:12},{wch:14},{wch:12},{wch:10},{wch:30},{wch:25},{wch:12}];
        ws['!views'] = [{ RTL: true }];

        const range = XLSX.utils.decode_range(ws['!ref']);
        const hdr = {
            font:      { bold:true, color:{rgb:'FFFFFF'}, sz:11 },
            fill:      { fgColor:{rgb:'0F172A'}, patternType:'solid' },
            alignment: { horizontal:'center', vertical:'center' }
        };
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cell = XLSX.utils.encode_cell({r:0, c:C});
            if (ws[cell]) ws[cell].s = hdr;
        }
        for (let R = 1; R <= range.e.r; R++) {
            const sv  = ws[XLSX.utils.encode_cell({r:R, c:5})]?.v || '';
            const bg  = sv.includes('غائب') ? 'FEE2E2' : sv.includes('إضافي') ? 'FEF9C3' : 'F0FDF4';
            const tc  = sv.includes('غائب') ? '991B1B' : sv.includes('إضافي') ? '92400E' : '166534';
            for (let C = range.s.c; C <= range.e.c; C++) {
                const ref = XLSX.utils.encode_cell({r:R, c:C});
                if (ws[ref]) ws[ref].s = {
                    fill:      { fgColor:{rgb:bg}, patternType:'solid' },
                    font:      { color:{rgb: C===5 ? tc : '0F172A'} },
                    alignment: { horizontal:'center' }
                };
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'كشف الحضور');
        XLSX.writeFile(wb, `حضور_${groupCode}_${(targetDate||'').replace(/\//g,'-')}.xlsx`);

        if (typeof showToast === 'function') showToast('✅ تم تحميل Excel بنجاح', 3000, '#10b981');
        if (navigator.vibrate) navigator.vibrate(50);
    };

    window.gsExportCSV = () => {
        if (!window._gsLastData) return;
        const { groupCode, targetDate } = window._gsLastData;
        const rows = buildRows();
        if (!rows.length) return;

        const headers = Object.keys(rows[0]);
        let csv = '\uFEFF' + headers.join(',') + '\n';
        rows.forEach(r => {
            csv += headers.map(h => `"${(r[h]||'').toString().replace(/"/g,'""')}"`).join(',') + '\n';
        });

        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
        a.download = `حضور_${groupCode}_${(targetDate||'').replace(/\//g,'-')}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);

        if (typeof showToast === 'function') showToast('✅ تم تحميل CSV', 2500, '#10b981');
    };

    // ─── Mount ────────────────────────────────────────────────
    window.initGroupSearchModule = () => {
        injectCSS();

        const target = document.getElementById('viewSubjects');
        if (!target) return;

        if (!document.getElementById(MODULE_ID)) {
            const wrap = document.createElement('div');
            wrap.innerHTML = buildHTML();
            target.insertBefore(wrap.firstElementChild, target.firstChild);
        }

        const di = document.getElementById('groupSearchDate');
        if (di) di.value = todayISO();

        const ci = document.getElementById('groupCodeInput');
        if (ci) {
            ci.addEventListener('keydown', e => { if (e.key === 'Enter') performSearch(); });
            ci.addEventListener('input',   () => { ci.value = ci.value.replace(/[^0-9Gg]/g,'').toUpperCase(); });
        }

        const sb = document.getElementById('btnGroupSearch');
        if (sb) sb.addEventListener('click', performSearch);
    };

    // ─── Auto-hook ────────────────────────────────────────────
    const hookOpenReport = () => {
        const orig = window.openReportModal;
        if (typeof orig === 'function' && !orig._gsHooked) {
            window.openReportModal = async function (...args) {
                await orig.apply(this, args);
                setTimeout(() => window.initGroupSearchModule(), 300);
            };
            window.openReportModal._gsHooked = true;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hookOpenReport);
    } else {
        hookOpenReport();
        setTimeout(hookOpenReport, 500);
    }

})();
