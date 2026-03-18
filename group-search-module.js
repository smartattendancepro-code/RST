/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          GROUP SEARCH MODULE  ·  v2.1  ·  BUG-FIXED         ║
 * ║  ✅ Sorted by ID (asc)  ✅ Parallel Firestore queries        ║
 * ║  ✅ Smart caching (30s) ✅ Robust error handling             ║
 * ║  ✅ Accurate classification (manual / other-group)           ║
 * ║  ✅ Input sanitisation  ✅ Rate-limiting guard               ║
 * ║  🔒 Bug1: Fallback filter  🔒 Bug2: doctorName guard        ║
 * ║  🔒 Bug3: cross-group dedup 🔒 Bug4: forced refresh btn     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
(function () {
    'use strict';

    /* ═══════════════════════════════════════════════
       CONSTANTS & UTILITIES
    ═══════════════════════════════════════════════ */
    const MODULE_ID     = 'groupSearchModule';
    const CACHE_TTL_MS  = 30_000; // 30s — shorter to reduce stale attendance risk (Bug 4)
    const MAX_REQUESTS  = 10;     // max parallel Firestore requests
    const BATCH_SIZE    = 10;     // Firestore `in` operator limit

    /** Simple in-memory query cache  { cacheKey → { ts, data } } */
    const _queryCache = new Map();

    const cache = {
        get(key) {
            const entry = _queryCache.get(key);
            if (!entry) return null;
            if (Date.now() - entry.ts > CACHE_TTL_MS) { _queryCache.delete(key); return null; }
            return entry.data;
        },
        set(key, data)      { _queryCache.set(key, { ts: Date.now(), data }); },
        invalidate(key)     { _queryCache.delete(key); },            // Bug-4 fix: force-refresh
        invalidateAll()     { _queryCache.clear(); },
        clear()             { _queryCache.clear(); }
    };

    /** Format ISO date → DD/MM/YYYY */
    const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

    /** Today as DD/MM/YYYY */
    const todayStr = () => {
        const n = new Date();
        return `${String(n.getDate()).padStart(2,'0')}/${String(n.getMonth()+1).padStart(2,'0')}/${n.getFullYear()}`;
    };

    /** Today as YYYY-MM-DD */
    const todayISO = () => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
    };

    /** Sanitise & normalise Arabic text for comparison */
    const norm = (s) =>
        (s || '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .trim()
            .toLowerCase();

    /** Split an array into chunks of `size` */
    const chunkArray = (arr, size) => {
        const out = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    };

    /** Validate group code format: 1G2, 2G15, 3G100 etc. */
    const isValidGroupCode = (code) => /^\dG\d{1,3}$/.test(code);

    /** Throttle / last-search guard */
    let _lastSearchTs = 0;
    const THROTTLE_MS = 800;

    /* ═══════════════════════════════════════════════
       CSS INJECTION
    ═══════════════════════════════════════════════ */
    const injectCSS = () => {
        if (document.getElementById('groupSearchCSS')) return;
        const style = document.createElement('style');
        style.id = 'groupSearchCSS';
        style.textContent = `
/* ── Wrapper Bar ── */
#groupSearchBar {
    display:flex; flex-direction:column; gap:8px;
    background:linear-gradient(135deg,#f0f9ff,#e0f2fe);
    border:1.5px solid #bae6fd; border-radius:16px;
    padding:12px 16px; margin:0 0 14px;
    box-shadow:0 2px 10px rgba(14,165,233,.08);
    transition:box-shadow .2s;
}
#groupSearchBar:focus-within { box-shadow:0 0 0 3px rgba(14,165,233,.18); border-color:#0ea5e9; }

.gsb-icon { color:#0ea5e9; font-size:18px; flex-shrink:0; }

#groupCodeInput {
    flex:1; border:none; background:transparent;
    font-size:15px; font-weight:700; color:#0f172a;
    font-family:'Outfit','Cairo',sans-serif; outline:none;
    text-transform:uppercase; letter-spacing:1px; direction:ltr;
}
#groupCodeInput::placeholder { color:#94a3b8; font-weight:500; text-transform:none; letter-spacing:0; }

#btnGroupSearch {
    background:linear-gradient(135deg,#0ea5e9,#0284c7);
    color:#fff; border:none; border-radius:10px;
    padding:8px 16px; font-size:12px; font-weight:800; cursor:pointer;
    font-family:inherit; display:flex; align-items:center; gap:6px;
    transition:transform .15s,box-shadow .15s;
    box-shadow:0 3px 10px rgba(14,165,233,.3); white-space:nowrap;
}
#btnGroupSearch:active { transform:scale(.96); box-shadow:0 1px 5px rgba(14,165,233,.2); }
#btnGroupSearch:disabled { opacity:.6; cursor:not-allowed; transform:none; }

#groupSearchDate {
    border:none; background:transparent; font-size:13px; font-weight:700;
    color:#0f172a; cursor:pointer; font-family:'Courier New',monospace;
    outline:none; flex:1;
}

/* ── Results Container ── */
#groupSearchResults {
    display:none; flex-direction:column; gap:0;
    background:#fff; border:1.5px solid #e2e8f0; border-radius:16px;
    overflow:hidden; margin-bottom:14px;
    box-shadow:0 4px 20px rgba(0,0,0,.06);
    animation:gsFadeIn .25s ease;
}
@keyframes gsFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

/* ── Header ── */
.gs-results-header {
    background:linear-gradient(135deg,#0f172a,#1e293b); color:#fff;
    padding:14px 18px; display:flex; justify-content:space-between;
    align-items:center; gap:10px; flex-wrap:wrap;
}
.gs-results-header .gs-group-name {
    font-size:18px; font-weight:900; letter-spacing:1px;
    font-family:'Outfit',sans-serif; color:#38bdf8;
}
.gs-results-header .gs-stats-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }

/* ── Stat Pills ── */
.gs-stat-pill {
    padding:4px 12px; border-radius:20px; font-size:11px; font-weight:800;
    display:flex; align-items:center; gap:5px;
}
.gs-stat-present { background:#dcfce7; color:#166534; }
.gs-stat-absent  { background:#fee2e2; color:#991b1b; }
.gs-stat-total   { background:#e0f2fe; color:#0369a1; }

/* ── Subject Selector ── */
.gs-subjects-list {
    padding:12px; display:flex; flex-direction:column; gap:8px;
    background:#f8fafc; border-bottom:1px solid #e2e8f0;
}
.gs-subjects-list-title {
    font-size:11px; font-weight:800; color:#64748b;
    text-transform:uppercase; letter-spacing:.5px;
    padding:0 4px 4px; display:flex; align-items:center; gap:6px;
}
.gs-subject-tab {
    display:flex; align-items:center; justify-content:space-between;
    background:#fff; border:1.5px solid #e2e8f0; border-radius:12px;
    padding:10px 14px; cursor:pointer; transition:all .15s; gap:10px;
}
.gs-subject-tab:hover { border-color:#0ea5e9; background:#f0f9ff; transform:translateX(-2px); }
.gs-subject-tab.active { border-color:#0ea5e9; background:linear-gradient(135deg,#f0f9ff,#e0f2fe); box-shadow:0 2px 8px rgba(14,165,233,.15); }
.gs-subject-tab-name { font-size:13px; font-weight:800; color:#0f172a; flex:1; }
.gs-subject-tab-meta { display:flex; align-items:center; gap:6px; }
.gs-subject-tab-count { background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:800; }
.gs-subject-tab-doctor { background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; }
.gs-subject-tab-arrow { color:#94a3b8; font-size:11px; transition:transform .2s; }
.gs-subject-tab.active .gs-subject-tab-arrow { transform:rotate(90deg); color:#0ea5e9; }

/* ── Subject Sub-Header ── */
.gs-subject-header {
    background:#f8fafc; border-bottom:1px solid #e2e8f0;
    padding:10px 18px; display:flex; justify-content:space-between; align-items:center; gap:8px;
}
.gs-subject-name { font-size:13px; font-weight:800; color:#334155; flex:1; }
.gs-doctor-name {
    font-size:11px; font-weight:600; color:#64748b;
    background:#f1f5f9; padding:3px 8px; border-radius:8px;
}

/* ── Back Button ── */
.gs-back-btn {
    display:flex; align-items:center; gap:6px;
    background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px;
    padding:5px 10px; font-size:11px; font-weight:700; color:#334155;
    cursor:pointer; transition:all .15s; margin:10px 18px 0; width:fit-content;
}
.gs-back-btn:hover { background:#e2e8f0; }

/* ── Section Divider ── */
.gs-section-divider {
    display:flex; align-items:center; gap:8px; padding:8px 18px;
    background:#f8fafc; border-top:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0;
}
.gs-section-divider-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; white-space:nowrap; }
.gs-section-divider-line  { flex:1; height:1px; background:#e2e8f0; }

/* ── Student Row ── */
.gs-student-row {
    display:flex; align-items:center; padding:11px 18px;
    border-bottom:1px solid #f1f5f9; gap:12px; transition:background .1s;
}
.gs-student-row:last-child { border-bottom:none; }
.gs-student-row:hover { background:#f8fafc; }
.gs-student-row.absent { background:#fff8f8; }
.gs-student-row.absent:hover { background:#fef2f2; }

/* ── Status Badge ── */
.gs-status-badge {
    flex-shrink:0; width:28px; height:28px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:11px; font-weight:900;
}
.gs-status-badge.present { background:#dcfce7; color:#16a34a; }
.gs-status-badge.absent  { background:#fee2e2; color:#dc2626; }

/* ── Student Info ── */
.gs-student-info { flex:1; min-width:0; }
.gs-student-name { font-size:13px; font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gs-student-id   { font-size:11px; color:#64748b; font-family:'Courier New',monospace; margin-top:1px; }

/* ── Attendance Details ── */
.gs-att-details { text-align:right; flex-shrink:0; }
.gs-att-time  { font-size:11px; font-weight:700; color:#0ea5e9; direction:ltr; }
.gs-att-hall  { font-size:10px; color:#94a3b8; margin-top:1px; }
.gs-absent-label { font-size:11px; font-weight:700; color:#ef4444; }

/* ── Sort Badge ── */
.gs-sort-badge {
    font-size:10px; font-weight:700; color:#64748b;
    background:#f1f5f9; padding:2px 8px; border-radius:8px;
    display:inline-flex; align-items:center; gap:4px; margin:4px 18px 0; width:fit-content;
}

/* ── Download Bar ── */
.gs-download-bar {
    background:#f8fafc; border-top:1.5px solid #e2e8f0;
    padding:12px 18px; display:flex; gap:10px;
    align-items:center; justify-content:flex-end; flex-wrap:wrap;
}
.gs-download-bar .gs-dl-info { flex:1; font-size:11px; color:#64748b; font-weight:600; }
.gs-btn-download {
    border:none; border-radius:10px; padding:9px 16px;
    font-size:12px; font-weight:800; cursor:pointer; font-family:inherit;
    display:flex; align-items:center; gap:6px; transition:transform .15s;
}
.gs-btn-download:active { transform:scale(.96); }
.gs-btn-excel { background:linear-gradient(135deg,#22c55e,#16a34a); color:#fff; box-shadow:0 3px 10px rgba(34,197,94,.3); }
.gs-btn-csv   { background:#f1f5f9; color:#334155; border:1px solid #e2e8f0; }

/* ── Empty / Error States ── */
.gs-state-box { padding:30px 20px; text-align:center; color:#94a3b8; font-size:13px; font-weight:600; }
.gs-state-box i { font-size:30px; margin-bottom:10px; display:block; }
.gs-state-box.error { color:#ef4444; }
.gs-state-box.error i { color:#ef4444; }

/* ── Progress Skeleton ── */
.gs-skeleton-row {
    height:50px; background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);
    background-size:200% 100%; animation:gsShimmer 1.2s infinite;
    margin:6px 18px; border-radius:8px;
}
@keyframes gsShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

/* ── Percentage Bar ── */
.gs-percent-bar-wrap { height:4px; background:#e2e8f0; border-radius:2px; overflow:hidden; margin-top:6px; width:120px; }
.gs-percent-bar-fill { height:100%; border-radius:2px; transition:width .6s ease; }

/* ── Subject Detail View ── */
.gs-detail-view { animation:gsSlideIn .2s ease; }
@keyframes gsSlideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }

/* ── Loading overlay (progress bar) ── */
#gsLoadingBar {
    position:fixed; top:0; left:0; height:3px; width:0;
    background:linear-gradient(90deg,#0ea5e9,#38bdf8);
    z-index:9999; transition:width .3s ease; border-radius:0 2px 2px 0;
    box-shadow:0 0 8px rgba(14,165,233,.6);
}
        `;
        document.head.appendChild(style);
    };

    /* ═══════════════════════════════════════════════
       LOADING BAR (top progress indicator)
    ═══════════════════════════════════════════════ */
    const loadingBar = {
        el: null,
        _timer: null,
        init() {
            if (!document.getElementById('gsLoadingBar')) {
                const bar = document.createElement('div');
                bar.id = 'gsLoadingBar';
                document.body.appendChild(bar);
            }
            this.el = document.getElementById('gsLoadingBar');
        },
        start() {
            this.init();
            this.el.style.width = '0%';
            clearInterval(this._timer);
            let w = 0;
            this._timer = setInterval(() => {
                w = Math.min(w + Math.random() * 12, 85);
                this.el.style.width = w + '%';
            }, 200);
        },
        finish() {
            clearInterval(this._timer);
            if (this.el) {
                this.el.style.width = '100%';
                setTimeout(() => { if (this.el) this.el.style.width = '0%'; }, 400);
            }
        }
    };

    /* ═══════════════════════════════════════════════
       HTML TEMPLATE
    ═══════════════════════════════════════════════ */
    const buildHTML = () => `
        <div id="${MODULE_ID}" style="padding:0 4px;">
            <div id="groupSearchBar">
                <div style="display:flex;align-items:center;gap:8px;">
                    <i class="fa-solid fa-users-rectangle gsb-icon"></i>
                    <input id="groupCodeInput" type="text"
                        placeholder="ابحث عن جروب — مثال: 1G2"
                        maxlength="6" autocomplete="off" spellcheck="false" inputmode="text"/>
                    <button id="btnGroupSearch">
                        <i class="fa-solid fa-magnifying-glass"></i> بحث
                    </button>
                    <button id="btnGroupRefresh" title="تحديث فوري (تجاوز الكاش)" style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:12px;color:#64748b;transition:all .15s;flex-shrink:0;">
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>
                </div>
                <div style="display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:8px 12px;">
                    <i class="fa-regular fa-calendar-days" style="color:#64748b;font-size:14px;"></i>
                    <span style="font-size:12px;font-weight:700;color:#64748b;">تاريخ الحضور:</span>
                    <input id="groupSearchDate" type="date"/>
                </div>
            </div>
            <div id="groupSearchResults"></div>
        </div>`;

    /* ═══════════════════════════════════════════════
       SKELETON LOADER
    ═══════════════════════════════════════════════ */
    const showSkeleton = (container) => {
        container.style.display = 'flex';
        container.innerHTML = `<div style="padding:16px 0 8px;">${Array(6).fill('<div class="gs-skeleton-row"></div>').join('')}</div>`;
    };

    /* ═══════════════════════════════════════════════
       SORT HELPERS
    ═══════════════════════════════════════════════ */
    /** Sort students ascending by numeric student ID; fall back to lexicographic */
    const sortByID = (students) =>
        [...students].sort((a, b) => {
            const na = Number(a.id), nb = Number(b.id);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return String(a.id).localeCompare(String(b.id));
        });

    /** Sort a Map's entries by numeric/lex key (ID) */
    const sortedMapEntries = (map) =>
        [...map.entries()].sort(([a], [b]) => {
            const na = Number(a), nb = Number(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return String(a).localeCompare(String(b));
        });

    /* ═══════════════════════════════════════════════
       RENDER — SUBJECT SELECTOR (multi-subject)
    ═══════════════════════════════════════════════ */
    const renderSubjectSelector = (groupCode, targetDate, masterList, subjectsMap) => {
        const container = document.getElementById('groupSearchResults');
        if (!container) return;

        const subjects = Object.keys(subjectsMap);
        const totalPresent = subjects.reduce((s, k) => s + subjectsMap[k].attendanceMap.size, 0);

        const subjectTabsHTML = subjects.map(subj => {
            const info = subjectsMap[subj];
            return `
                <div class="gs-subject-tab" onclick="window._gsOpenSubject('${subj.replace(/'/g,"\\'")}')">
                    <div class="gs-subject-tab-name">${subj}</div>
                    <div class="gs-subject-tab-meta">
                        <div class="gs-subject-tab-count"><i class="fa-solid fa-circle-check" style="font-size:8px;"></i> ${info.attendanceMap.size} حاضر</div>
                        <div class="gs-subject-tab-doctor"><i class="fa-solid fa-chalkboard-user" style="font-size:8px;"></i> ${info.doctorName || '—'}</div>
                    </div>
                    <i class="fa-solid fa-chevron-left gs-subject-tab-arrow"></i>
                </div>`;
        }).join('');

        container.style.display = 'flex';
        container.innerHTML = `
            <div class="gs-results-header">
                <div>
                    <div class="gs-group-name"><i class="fa-solid fa-users" style="font-size:14px;margin-left:6px;"></i>${groupCode.toUpperCase()}</div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:3px;direction:ltr;">${targetDate}</div>
                </div>
                <div class="gs-stats-row">
                    <div class="gs-stat-pill gs-stat-present"><i class="fa-solid fa-circle-check"></i> ${totalPresent} حضور</div>
                    <div class="gs-stat-pill gs-stat-total"><i class="fa-solid fa-book-open"></i> ${subjects.length} مادة</div>
                </div>
            </div>
            <div class="gs-subjects-list">
                <div class="gs-subjects-list-title">
                    <i class="fa-solid fa-layer-group" style="color:#0ea5e9;"></i>
                    اختر المادة لعرض تفاصيل الحضور
                </div>
                ${subjectTabsHTML}
            </div>`;
    };

    /* ═══════════════════════════════════════════════
       RENDER — SINGLE SUBJECT DETAIL VIEW
       masterList    : all students in original group (sorted by ID)
       attendanceMap : present students from original group
       manualAttMap  : manually-added students (not in any group list)
       otherGroupAttMap : students who belong to a different group
    ═══════════════════════════════════════════════ */
    const renderSingleSubject = (
        groupCode, targetDate, masterList,
        attendanceMap, subjectName, doctorName,
        multiSubject = false,
        manualAttMap  = new Map(),
        otherGroupAttMap = new Map()
    ) => {
        const container = document.getElementById('groupSearchResults');
        if (!container) return;

        // ── Sorted lists ──────────────────────────────────────────────
        const sortedMaster   = sortByID(masterList);
        const sortedManual   = sortedMapEntries(manualAttMap);
        const sortedOther    = sortedMapEntries(otherGroupAttMap);

        const presentCount = sortedMaster.filter(s => attendanceMap.has(s.id)).length;
        const absentCount  = sortedMaster.length - presentCount;
        const pct       = sortedMaster.length ? Math.round(presentCount / sortedMaster.length * 100) : 0;
        const barColor  = pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
        const barId     = `gsBarFill_${Date.now()}`;

        // ── Section 1: original group students (sorted by ID asc) ─────
        const rowsOriginal = sortedMaster.map((student, idx) => {
            const rec = attendanceMap.get(student.id);
            return `
                <div class="gs-student-row ${rec ? '' : 'absent'}">
                    <div style="font-size:10px;color:#94a3b8;font-weight:700;min-width:22px;text-align:center;">${String(idx+1).padStart(2,'0')}</div>
                    <div class="gs-status-badge ${rec ? 'present' : 'absent'}">
                        <i class="fa-solid fa-${rec ? 'check' : 'xmark'}"></i>
                    </div>
                    <div class="gs-student-info">
                        <div class="gs-student-name">${student.name}</div>
                        <div class="gs-student-id">${student.id}</div>
                    </div>
                    <div class="gs-att-details">
                        ${rec
                            ? `<div class="gs-att-time"><i class="fa-regular fa-clock" style="font-size:9px;"></i> ${rec.time_str||'--:--'}</div>
                               <div class="gs-att-hall"><i class="fa-solid fa-building-columns" style="font-size:9px;"></i> ${rec.hall||'—'}</div>`
                            : `<div class="gs-absent-label">غائب</div>`
                        }
                    </div>
                </div>`;
        }).join('');

        // ── Section 2: manually-added students (sorted by ID asc) ─────
        let rowsManual = '';
        if (sortedManual.length > 0) {
            rowsManual = `
                <div class="gs-section-divider">
                    <div class="gs-section-divider-line"></div>
                    <div class="gs-section-divider-label" style="color:#8b5cf6;">
                        <i class="fa-solid fa-user-plus" style="margin-left:4px;"></i>
                        طلاب أضيفوا يدوياً (${sortedManual.length})
                    </div>
                    <div class="gs-section-divider-line"></div>
                </div>` +
                sortedManual.map(([id, rec], idx) => `
                    <div class="gs-student-row" style="background:#faf5ff;border-left:3px solid #8b5cf6;">
                        <div style="font-size:10px;color:#8b5cf6;font-weight:700;min-width:22px;text-align:center;">${String(idx+1).padStart(2,'0')}</div>
                        <div class="gs-status-badge present" style="background:#ede9fe;color:#7c3aed;">
                            <i class="fa-solid fa-user-plus" style="font-size:9px;"></i>
                        </div>
                        <div class="gs-student-info">
                            <div class="gs-student-name">${rec.name||id}</div>
                            <div class="gs-student-id">${id} <span style="color:#8b5cf6;font-size:9px;font-weight:700;">(يدوي)</span></div>
                        </div>
                        <div class="gs-att-details">
                            <div class="gs-att-time"><i class="fa-regular fa-clock" style="font-size:9px;"></i> ${rec.time_str||'--:--'}</div>
                            <div class="gs-att-hall"><i class="fa-solid fa-building-columns" style="font-size:9px;"></i> ${rec.hall||'—'}</div>
                        </div>
                    </div>`).join('');
        }

        // ── Section 3: students from other groups (sorted by ID asc) ──
        let rowsOther = '';
        if (sortedOther.length > 0) {
            rowsOther = `
                <div class="gs-section-divider">
                    <div class="gs-section-divider-line"></div>
                    <div class="gs-section-divider-label" style="color:#f59e0b;">
                        <i class="fa-solid fa-users-between-lines" style="margin-left:4px;"></i>
                        طلاب من جروبات أخرى (${sortedOther.length})
                    </div>
                    <div class="gs-section-divider-line"></div>
                </div>` +
                sortedOther.map(([id, rec], idx) => `
                    <div class="gs-student-row" style="background:#fffbeb;border-left:3px solid #f59e0b;">
                        <div style="font-size:10px;color:#f59e0b;font-weight:700;min-width:22px;text-align:center;">${String(idx+1).padStart(2,'0')}</div>
                        <div class="gs-status-badge present" style="background:#fef9c3;color:#ca8a04;">
                            <i class="fa-solid fa-star" style="font-size:9px;"></i>
                        </div>
                        <div class="gs-student-info">
                            <div class="gs-student-name">${rec.name||id}</div>
                            <div class="gs-student-id">${id} <span style="color:#f59e0b;font-size:9px;font-weight:700;">(${rec.group||'جروب آخر'})</span></div>
                        </div>
                        <div class="gs-att-details">
                            <div class="gs-att-time"><i class="fa-regular fa-clock" style="font-size:9px;"></i> ${rec.time_str||'--:--'}</div>
                            <div class="gs-att-hall"><i class="fa-solid fa-building-columns" style="font-size:9px;"></i> ${rec.hall||'—'}</div>
                        </div>
                    </div>`).join('');
        }

        const backBtnHTML = multiSubject ? `
            <button class="gs-back-btn" onclick="window._gsBackToSubjects()">
                <i class="fa-solid fa-chevron-right"></i> العودة للمواد
            </button>` : '';

        const detailViewHTML = `
            <div class="gs-detail-view">
                ${backBtnHTML}
                <div class="gs-subject-header" style="margin-top:${multiSubject ? '8px' : '0'};">
                    <div class="gs-subject-name"><i class="fa-solid fa-book-open" style="color:#0ea5e9;margin-left:6px;"></i>${subjectName}</div>
                    <div class="gs-doctor-name"><i class="fa-solid fa-chalkboard-user" style="margin-left:4px;"></i>${doctorName||'—'}</div>
                </div>

                <!-- نسبة الحضور -->
                <div style="padding:10px 18px 4px;display:flex;align-items:center;gap:12px;">
                    <div style="font-size:11px;font-weight:700;color:#64748b;">نسبة حضور الجروب</div>
                    <div class="gs-percent-bar-wrap" style="flex:1;width:auto;">
                        <div class="gs-percent-bar-fill" id="${barId}" style="width:0%;background:${barColor};"></div>
                    </div>
                    <div style="font-size:13px;font-weight:900;color:${barColor};">${pct}%</div>
                </div>

                <!-- إحصائيات مصغرة -->
                <div style="padding:4px 18px 4px;display:flex;gap:8px;flex-wrap:wrap;">
                    <div class="gs-stat-pill gs-stat-present"><i class="fa-solid fa-circle-check"></i> ${presentCount} حاضر</div>
                    <div class="gs-stat-pill gs-stat-absent"><i class="fa-solid fa-circle-xmark"></i> ${absentCount} غائب</div>
                    <div class="gs-stat-pill gs-stat-total"><i class="fa-solid fa-users"></i> ${sortedMaster.length} أصلي</div>
                    ${sortedManual.length ? `<div class="gs-stat-pill" style="background:#ede9fe;color:#7c3aed;"><i class="fa-solid fa-user-plus"></i> ${sortedManual.length} يدوي</div>` : ''}
                    ${sortedOther.length  ? `<div class="gs-stat-pill" style="background:#fef9c3;color:#ca8a04;"><i class="fa-solid fa-star"></i> ${sortedOther.length} جروب آخر</div>` : ''}
                </div>

                <!-- شارة الترتيب -->
                <div class="gs-sort-badge">
                    <i class="fa-solid fa-arrow-up-1-9" style="color:#0ea5e9;font-size:9px;"></i>
                    مرتب تصاعدياً حسب الرقم الجامعي
                </div>

                <!-- صفوف الطلاب -->
                ${rowsOriginal || '<div class="gs-state-box"><i class="fa-solid fa-folder-open"></i>لا توجد بيانات طلاب</div>'}
                ${rowsManual}
                ${rowsOther}

                <!-- شريط التحميل -->
                <div class="gs-download-bar">
                    <div class="gs-dl-info">
                        <i class="fa-solid fa-circle-info" style="color:#0ea5e9;margin-left:4px;"></i>
                        ${sortedMaster.length} أصلي · ${presentCount} حاضر · ${absentCount} غائب · ${sortedManual.length} يدوي · ${sortedOther.length} جروب آخر
                    </div>
                    <button class="gs-btn-download gs-btn-csv"
                        onclick="window.gsExportCSV('${groupCode}','${targetDate}','${subjectName.replace(/'/g,"\\'")}')">
                        <i class="fa-solid fa-file-csv"></i> CSV
                    </button>
                    <button class="gs-btn-download gs-btn-excel"
                        onclick="window.gsExportExcel('${groupCode}','${targetDate}','${subjectName.replace(/'/g,"\\'")}')">
                        <i class="fa-solid fa-file-excel"></i> تحميل Excel
                    </button>
                </div>
            </div>`;

        if (multiSubject) {
            const existingHeader = container.querySelector('.gs-results-header');
            container.innerHTML = (existingHeader ? existingHeader.outerHTML : '') + detailViewHTML;
        } else {
            container.style.display = 'flex';
            container.innerHTML = `
                <div class="gs-results-header">
                    <div>
                        <div class="gs-group-name"><i class="fa-solid fa-users" style="font-size:14px;margin-left:6px;"></i>${groupCode.toUpperCase()}</div>
                        <div style="font-size:11px;color:#94a3b8;margin-top:3px;direction:ltr;">${targetDate}</div>
                    </div>
                    <div class="gs-stats-row">
                        <div class="gs-stat-pill gs-stat-present"><i class="fa-solid fa-circle-check"></i> ${presentCount} حاضر</div>
                        <div class="gs-stat-pill gs-stat-absent"><i class="fa-solid fa-circle-xmark"></i> ${absentCount} غائب</div>
                        <div class="gs-stat-pill gs-stat-total"><i class="fa-solid fa-users"></i> ${sortedMaster.length + sortedManual.length + sortedOther.length} إجمالي</div>
                    </div>
                </div>
                ${detailViewHTML}`;
        }

        // تحريك bar بعد رسم الـ DOM
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const bar = document.getElementById(barId);
                if (bar) bar.style.width = pct + '%';
            });
        });
    };

    /* ═══════════════════════════════════════════════
       FIRESTORE HELPERS
    ═══════════════════════════════════════════════ */
    /**
     * Run multiple Firestore query promises in controlled parallel batches.
     * @param {Function[]} fns  - array of () => Promise<QuerySnapshot>
     * @param {number}     limit
     */
    const parallelBatch = async (fns, limit = MAX_REQUESTS) => {
        const results = [];
        for (let i = 0; i < fns.length; i += limit) {
            const batch = fns.slice(i, i + limit).map(fn => fn());
            results.push(...await Promise.all(batch));
        }
        return results;
    };

    /* ═══════════════════════════════════════════════
       MAIN SEARCH
    ═══════════════════════════════════════════════ */
    const performSearch = async (forceRefresh = false) => {
        // ── Throttle guard ────────────────────────────────────────────
        const now = Date.now();
        if (now - _lastSearchTs < THROTTLE_MS) return;
        _lastSearchTs = now;

        const input     = document.getElementById('groupCodeInput');
        const dateInput = document.getElementById('groupSearchDate');
        const btn       = document.getElementById('btnGroupSearch');
        const container = document.getElementById('groupSearchResults');

        const rawCode   = (input?.value || '').trim().toUpperCase();
        const targetDate = dateInput?.value ? fmtDate(dateInput.value) : todayStr();

        // ── Input validation ──────────────────────────────────────────
        if (!rawCode) {
            if (typeof showToast === 'function') showToast('⚠️ أدخل كود الجروب أولاً', 2500, '#f59e0b');
            input?.focus(); return;
        }
        if (!isValidGroupCode(rawCode)) {
            if (typeof showToast === 'function') showToast('⚠️ صيغة غير صحيحة — مثال: 1G2 أو 2G15', 3000, '#ef4444');
            input?.focus(); return;
        }

        const groupCode       = rawCode;
        const resolvedCodes   = window.resolveGroups ? window.resolveGroups(groupCode) : [groupCode];

        // ── Cache check ───────────────────────────────────────────────
        const cacheKey = `${resolvedCodes.sort().join('|')}::${targetDate}`;
        if (forceRefresh) cache.invalidate(cacheKey); // Bug-4 fix
        const cached   = cache.get(cacheKey);
        if (cached) {
            window._gsLastData = cached;
            _renderFromData(cached);
            return;
        }

        // ── UI: loading state ─────────────────────────────────────────
        const origText  = btn.innerHTML;
        btn.innerHTML   = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        btn.disabled    = true;
        showSkeleton(container);
        loadingBar.start();

        window._gsLastData = { groupCode, targetDate, masterList: [], subjectsMap: {} };

        try {
            const db = window.db;
            if (!db) throw new Error('قاعدة البيانات غير متاحة');

            const { collection, query, where, getDocs } =
                await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

            /* ── STEP 1: Fetch master student list ─────────────────── */
            let masterList = [];

            // Primary: user_registrations
            const [regSnap] = await parallelBatch([
                () => getDocs(query(
                    collection(db, 'user_registrations'),
                    where('registrationInfo.group', 'in', resolvedCodes)
                ))
            ]);

            regSnap.forEach(d => {
                const info = d.data().registrationInfo || d.data();
                if (info?.studentID) {
                    masterList.push({
                        id:   String(info.studentID).trim(),
                        name: (info.fullName || 'غير معروف').trim(),
                        uid:  d.id
                    });
                }
            });

            // Fallback: students collection
            if (masterList.length === 0) {
                const [studSnap] = await parallelBatch([
                    () => getDocs(query(
                        collection(db, 'students'),
                        where('group_code', 'in', resolvedCodes)
                    ))
                ]);
                studSnap.forEach(d => {
                    const data = d.data();
                    masterList.push({
                        id:   String(data.id || d.id).trim(),
                        name: (data.name || 'غير معروف').trim(),
                        uid:  d.id
                    });
                });
            }

            // Sort master list by ID ascending
            masterList = sortByID(masterList);

            // Remove duplicates (same id may appear in multiple docs)
            const seenIDs = new Set();
            masterList = masterList.filter(s => {
                if (seenIDs.has(s.id)) return false;
                seenIDs.add(s.id); return true;
            });

            const masterIDs = new Set(masterList.map(s => s.id));

            /* ── STEP 2: Fetch attendance for these groups ─────────── */
            // Fire both queries in parallel
            const [attByGroup] = await parallelBatch([
                () => getDocs(query(
                    collection(db, 'attendance'),
                    where('date', '==', targetDate),
                    where('group', 'in', resolvedCodes)
                ))
            ]);

            /** subjectsMap structure:
             *  {
             *    subjectName: {
             *      attendanceMap:   Map<id, rec>   — original group present students
             *      manualAttMap:    Map<id, rec>   — truly manual (no group field)
             *      otherGroupAttMap:Map<id, rec>   — students from known other groups
             *      doctorName: string
             *    }
             *  }
             */
            const subjectsMap = {};

            const ensureSubject = (subj, doctor) => {
                if (!subjectsMap[subj]) {
                    subjectsMap[subj] = {
                        attendanceMap:    new Map(),
                        manualAttMap:     new Map(),
                        otherGroupAttMap: new Map(),
                        doctorName:       doctor || '—'
                    };
                }
            };

            const classifyRecord = (data) => {
                const sid   = String(data.id || '').trim();
                const subj  = (data.subject || '—').trim();
                const doc   = data.doctorName || '—';
                if (!sid) return;

                ensureSubject(subj, doc);
                const info = subjectsMap[subj];

                const rec = {
                    name:       (data.name || '').trim(),
                    subject:    subj,
                    doctorName: doc,
                    time_str:   data.time_str || '--:--',
                    hall:       data.hall || '—',
                    group:      data.group || null
                };

                if (masterIDs.has(sid)) {
                    // From original group
                    if (!info.attendanceMap.has(sid)) info.attendanceMap.set(sid, rec);
                } else if (data.group && !resolvedCodes.includes(data.group)) {
                    // Known different group
                    if (!info.otherGroupAttMap.has(sid)) info.otherGroupAttMap.set(sid, rec);
                } else {
                    // No group field or same code but not in masterList → manual
                    if (!info.manualAttMap.has(sid)) info.manualAttMap.set(sid, rec);
                }
            };

            attByGroup.forEach(d => classifyRecord(d.data()));

            /* ── STEP 3: Fallback by student IDs (for old records without `group` field) ── */
            // Bug-1 fix: after getting docs by ID, we still call classifyRecord which checks
            // masterIDs — so a student from another group with the same ID won't be in masterIDs
            // and will go to manualAttMap rather than attendanceMap.
            // Additional safety: after classifying, remove any manualAttMap entry whose ID
            // belongs to masterIDs (should never happen, but guards against Firestore anomalies).
            if (Object.keys(subjectsMap).length === 0 && masterList.length > 0) {
                const idChunks  = chunkArray(masterList.map(s => s.id), BATCH_SIZE);
                const snapshots = await parallelBatch(
                    idChunks.map(chunk => () => getDocs(query(
                        collection(db, 'attendance'),
                        where('date', '==', targetDate),
                        where('id', 'in', chunk)
                    )))
                );
                snapshots.forEach(snap => snap.forEach(d => classifyRecord(d.data())));

                // Bug-1 safety pass: any record that ended up in manualAttMap but IS in masterIDs
                // must be moved to attendanceMap (edge case: doc has no `group` field but ID matches)
                Object.values(subjectsMap).forEach(info => {
                    info.manualAttMap.forEach((rec, sid) => {
                        if (masterIDs.has(sid)) {
                            if (!info.attendanceMap.has(sid)) info.attendanceMap.set(sid, rec);
                            info.manualAttMap.delete(sid);
                        }
                    });
                });
            }

            /* ── STEP 4: Fetch students from other groups (same subject+doctor+date) ─── */
            const subjectNames = Object.keys(subjectsMap);

            if (subjectNames.length > 0) {
                const otherQueries = subjectNames.map(subj => {
                    const info = subjectsMap[subj];
                    return () => getDocs(query(
                        collection(db, 'attendance'),
                        where('date', '==', targetDate),
                        where('subject', '==', subj),
                        where('doctorName', '==', info.doctorName)
                    )).catch(() =>
                        // Fallback without doctorName filter if composite index missing
                        getDocs(query(
                            collection(db, 'attendance'),
                            where('date', '==', targetDate),
                            where('subject', '==', subj)
                        ))
                    );
                });

                const otherSnaps = await parallelBatch(otherQueries);

                otherSnaps.forEach((snap, i) => {
                    const subj     = subjectNames[i];
                    const info     = subjectsMap[subj];
                    const expected = info.doctorName; // Bug-2 fix: remember which doctor we want

                    snap.forEach(d => {
                        const data = d.data();
                        const sid  = String(data.id || '').trim();
                        if (!sid) return;

                        // Bug-2 fix: if query fell back (no doctorName filter), enforce it here
                        if (expected && expected !== '—' &&
                            data.doctorName && data.doctorName !== expected) return;

                        // Skip already-classified students
                        if (masterIDs.has(sid))               return;
                        if (info.attendanceMap.has(sid))      return;
                        if (info.manualAttMap.has(sid))       return;
                        if (info.otherGroupAttMap.has(sid))   return;

                        const rec = {
                            name:       (data.name || '').trim(),
                            subject:    subj,
                            doctorName: data.doctorName || info.doctorName,
                            time_str:   data.time_str || '--:--',
                            hall:       data.hall || '—',
                            group:      data.group || null
                        };

                        if (data.group && !resolvedCodes.includes(data.group)) {
                            info.otherGroupAttMap.set(sid, rec);
                        } else if (!data.group) {
                            info.manualAttMap.set(sid, rec);
                        }
                        // Else: same group but not in masterList → skip (already handled above)
                    });
                });
            }

            /* ── STEP 5: Cross-map deduplication (Bug-3 fix) ──────── */
            // A student from a resolved group who appears in otherGroupAttMap or manualAttMap
            // (due to a Firestore doc having a different group field or resolveGroups overlap)
            // must be moved to attendanceMap and removed from the other maps.
            Object.values(subjectsMap).forEach(info => {
                info.otherGroupAttMap.forEach((rec, sid) => {
                    if (masterIDs.has(sid)) {
                        if (!info.attendanceMap.has(sid)) info.attendanceMap.set(sid, rec);
                        info.otherGroupAttMap.delete(sid);
                    }
                });
                info.manualAttMap.forEach((rec, sid) => {
                    if (masterIDs.has(sid)) {
                        if (!info.attendanceMap.has(sid)) info.attendanceMap.set(sid, rec);
                        info.manualAttMap.delete(sid);
                    }
                    // Also: a student can't be in both manualAttMap and otherGroupAttMap
                    if (info.otherGroupAttMap.has(sid)) info.manualAttMap.delete(sid);
                });
            });

            /* ── STEP 6: Cache & render ────────────────────────────── */
            const resultData = { groupCode, targetDate, masterList, subjectsMap };
            cache.set(cacheKey, resultData);
            window._gsLastData = resultData;

            _renderFromData(resultData);

        } catch (err) {
            console.error('[GroupSearchModule] Error:', err);
            container.style.display = 'flex';
            container.innerHTML = `
                <div class="gs-state-box error">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    حدث خطأ أثناء البحث
                    <br><small style="font-size:10px; opacity:.7;">${err.message}</small>
                </div>`;
        } finally {
            btn.innerHTML = origText;
            btn.disabled  = false;
            loadingBar.finish();
        }
    };

    /* ═══════════════════════════════════════════════
       RENDER DISPATCHER (uses cached/stored data)
    ═══════════════════════════════════════════════ */
    const _renderFromData = ({ groupCode, targetDate, masterList, subjectsMap }) => {
        const container    = document.getElementById('groupSearchResults');
        if (!container) return;

        const subjectNames = Object.keys(subjectsMap);

        if (masterList.length === 0 && subjectNames.length === 0) {
            container.style.display = 'flex';
            container.innerHTML = `
                <div class="gs-state-box">
                    <i class="fa-solid fa-folder-open"></i>
                    لم يُعثر على بيانات للجروب <strong>${groupCode}</strong>
                    <br><small style="color:#cbd5e1;font-size:11px;">تأكد من كود الجروب أو وجود طلاب مسجلين</small>
                </div>`;
            return;
        }

        if (subjectNames.length === 0 && masterList.length > 0) {
            container.style.display = 'flex';
            container.innerHTML = `
                <div class="gs-results-header">
                    <div>
                        <div class="gs-group-name"><i class="fa-solid fa-users" style="font-size:14px;margin-left:6px;"></i>${groupCode.toUpperCase()}</div>
                        <div style="font-size:11px;color:#94a3b8;margin-top:3px;direction:ltr;">${targetDate}</div>
                    </div>
                    <div class="gs-stats-row">
                        <div class="gs-stat-pill gs-stat-total"><i class="fa-solid fa-users"></i> ${masterList.length} طالب</div>
                    </div>
                </div>
                <div class="gs-state-box">
                    <i class="fa-solid fa-calendar-xmark"></i>
                    لا يوجد حضور مسجل لهذا اليوم
                    <br><small style="color:#cbd5e1;font-size:11px;">الجروب مسجل بـ ${masterList.length} طالب</small>
                </div>`;
            return;
        }

        if (subjectNames.length === 1) {
            const subj = subjectNames[0];
            const info = subjectsMap[subj];
            renderSingleSubject(
                groupCode, targetDate, masterList,
                info.attendanceMap, subj, info.doctorName,
                false, info.manualAttMap, info.otherGroupAttMap
            );
        } else {
            renderSubjectSelector(groupCode, targetDate, masterList, subjectsMap);
        }
    };

    /* ═══════════════════════════════════════════════
       GLOBAL CALLBACKS (open subject / back)
    ═══════════════════════════════════════════════ */
    window._gsOpenSubject = (subjectName) => {
        const data = window._gsLastData;
        if (!data) return;
        const { groupCode, targetDate, masterList, subjectsMap } = data;
        const info = subjectsMap[subjectName];
        if (!info) return;
        renderSingleSubject(
            groupCode, targetDate, masterList,
            info.attendanceMap, subjectName, info.doctorName,
            true, info.manualAttMap, info.otherGroupAttMap
        );
        window._gsLastData._activeSubject = subjectName;
    };

    window._gsBackToSubjects = () => {
        const data = window._gsLastData;
        if (!data) return;
        const { groupCode, targetDate, masterList, subjectsMap } = data;
        renderSubjectSelector(groupCode, targetDate, masterList, subjectsMap);
        window._gsLastData._activeSubject = null;
    };

    /* ═══════════════════════════════════════════════
       EXPORT HELPERS
    ═══════════════════════════════════════════════ */
    const buildExportRows = (groupCode, targetDate, subjectFilter) => {
        const data = window._gsLastData;
        if (!data) return [];

        const { masterList, subjectsMap } = data;
        const subj = subjectFilter || Object.keys(subjectsMap)[0];
        const info = subjectsMap?.[subj];
        if (!info) return [];

        const { attendanceMap, manualAttMap, otherGroupAttMap } = info;
        const rows = [];

        // Section 1 — original group (sorted by ID)
        sortByID(masterList).forEach((student, idx) => {
            const rec = attendanceMap.get(student.id);
            rows.push({
                'م':             idx + 1,
                'اسم الطالب':    student.name,
                'الرقم الجامعي': student.id,
                'المجموعة':      groupCode,
                'التاريخ':       targetDate,
                'المادة':        subj,
                'الحالة':        rec ? '✅ حاضر' : '❌ غائب',
                'وقت الحضور':    rec ? (rec.time_str || '--') : '--',
                'القاعة':        rec ? (rec.hall || '--') : '--',
                'المحاضر':       rec ? (rec.doctorName || '--') : '--',
                'ملاحظات':       rec ? 'منضبط' : 'لم يحضر'
            });
        });

        // Section 2 — manual (sorted by ID)
        sortedMapEntries(manualAttMap).forEach(([id, rec], idx) => {
            rows.push({
                'م':             rows.length + 1,
                'اسم الطالب':    rec.name || id,
                'الرقم الجامعي': id,
                'المجموعة':      groupCode + ' (يدوي)',
                'التاريخ':       targetDate,
                'المادة':        subj,
                'الحالة':        '✅ حاضر يدوي',
                'وقت الحضور':    rec.time_str || '--',
                'القاعة':        rec.hall || '--',
                'المحاضر':       rec.doctorName || '--',
                'ملاحظات':       'أضيف يدوياً'
            });
        });

        // Section 3 — other groups (sorted by ID)
        sortedMapEntries(otherGroupAttMap).forEach(([id, rec], idx) => {
            rows.push({
                'م':             rows.length + 1,
                'اسم الطالب':    rec.name || id,
                'الرقم الجامعي': id,
                'المجموعة':      rec.group || 'جروب آخر',
                'التاريخ':       targetDate,
                'المادة':        subj,
                'الحالة':        '✅ حاضر من جروب آخر',
                'وقت الحضور':    rec.time_str || '--',
                'القاعة':        rec.hall || '--',
                'المحاضر':       rec.doctorName || '--',
                'ملاحظات':       `حضر من ${rec.group || 'جروب آخر'}`
            });
        });

        return rows;
    };

    /* ── Excel Export ── */
    window.gsExportExcel = (groupCode, targetDate, subjectName) => {
        if (!window._gsLastData) return;
        if (typeof XLSX === 'undefined') {
            if (typeof showToast === 'function') showToast('⚠️ مكتبة Excel غير محملة', 3000, '#ef4444');
            return;
        }
        const subj = subjectName || window._gsLastData._activeSubject;
        const rows = buildExportRows(groupCode, targetDate, subj);
        if (!rows.length) {
            if (typeof showToast === 'function') showToast('⚠️ لا توجد بيانات للتصدير', 2500, '#f59e0b');
            return;
        }

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
            {wch:5},{wch:32},{wch:15},{wch:12},{wch:12},
            {wch:30},{wch:16},{wch:12},{wch:10},{wch:25},{wch:15}
        ];

        // Style header
        const range  = XLSX.utils.decode_range(ws['!ref']);
        const hStyle = {
            font:      { bold:true, color:{ rgb:'FFFFFF' }, sz:11 },
            fill:      { fgColor:{ rgb:'0F172A' }, patternType:'solid' },
            alignment: { horizontal:'center', vertical:'center', wrapText:true }
        };
        for (let C = range.s.c; C <= range.e.c; C++) {
            const ref = XLSX.utils.encode_cell({ r:0, c:C });
            if (ws[ref]) ws[ref].s = hStyle;
        }

        // Style data rows
        for (let R = 1; R <= range.e.r; R++) {
            const statusCell = XLSX.utils.encode_cell({ r:R, c:6 });
            const val        = ws[statusCell]?.v || '';
            const bg = val.includes('غائب') ? 'FEE2E2'
                     : val.includes('يدوي')  ? 'EDE9FE'
                     : val.includes('آخر')   ? 'FEFCE8'
                     : 'F0FDF4';
            for (let C = range.s.c; C <= range.e.c; C++) {
                const ref = XLSX.utils.encode_cell({ r:R, c:C });
                if (ws[ref]) ws[ref].s = { fill:{ patternType:'solid', fgColor:{ rgb:bg } }, alignment:{ horizontal:'center' } };
            }
        }

        ws['!views'] = [{ RTL:true }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'كشف الحضور');

        const safeName = groupCode.replace(/[^a-zA-Z0-9]/g, '_');
        const safeDate = (targetDate || '').replace(/\//g, '-');
        const safeSubj = (subj || '').replace(/\s+/g, '_').substring(0, 20);
        XLSX.writeFile(wb, `حضور_${safeName}_${safeSubj}_${safeDate}.xlsx`);

        if (typeof showToast === 'function') showToast('✅ تم تحميل ملف Excel بنجاح', 3000, '#10b981');
        if (navigator.vibrate) navigator.vibrate(50);
    };

    /* ── CSV Export ── */
    window.gsExportCSV = (groupCode, targetDate, subjectName) => {
        if (!window._gsLastData) return;
        const subj = subjectName || window._gsLastData._activeSubject;
        const rows = buildExportRows(groupCode, targetDate, subj);
        if (!rows.length) {
            if (typeof showToast === 'function') showToast('⚠️ لا توجد بيانات', 2500, '#f59e0b');
            return;
        }

        const headers = Object.keys(rows[0]);
        let csv = '\uFEFF' + headers.join(',') + '\n';
        rows.forEach(row => {
            csv += headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g,'""')}"`).join(',') + '\n';
        });

        const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        const safeSubj = (subj || '').replace(/\s+/g,'_').substring(0,20);
        a.download = `حضور_${groupCode}_${safeSubj}_${(targetDate||'').replace(/\//g,'-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        if (typeof showToast === 'function') showToast('✅ تم تحميل CSV', 2500, '#10b981');
    };

    /* ═══════════════════════════════════════════════
       INIT
    ═══════════════════════════════════════════════ */
    window.initGroupSearchModule = () => {
        injectCSS();

        const target = document.getElementById('viewSubjects');
        if (!target) { console.warn('[GroupSearchModule] #viewSubjects not found'); return; }

        if (!document.getElementById(MODULE_ID)) {
            const wrapper   = document.createElement('div');
            wrapper.innerHTML = buildHTML();
            target.insertBefore(wrapper.firstElementChild, target.firstChild);
        }

        const dateInput = document.getElementById('groupSearchDate');
        if (dateInput) dateInput.value = todayISO();

        const codeInput = document.getElementById('groupCodeInput');
        if (codeInput) {
            // Allow only digits and G/g
            codeInput.addEventListener('input', () => {
                const cleaned = codeInput.value.replace(/[^0-9Gg]/g, '').toUpperCase();
                if (codeInput.value !== cleaned) codeInput.value = cleaned;
            });
            codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(); });
        }

        const btn = document.getElementById('btnGroupSearch');
        if (btn) btn.addEventListener('click', () => performSearch(false));

        // Bug-4 fix: refresh button bypasses cache
        const refreshBtn = document.getElementById('btnGroupRefresh');
        if (refreshBtn) refreshBtn.addEventListener('click', () => performSearch(true));

        console.log('✅ [GroupSearchModule v2.1] mounted — Bug-1/2/3/4 fixed');
    };

    /* ── Hook into openReportModal ── */
    const _hookModal = () => {
        const orig = window.openReportModal;
        if (typeof orig === 'function' && !orig._gsHooked) {
            window.openReportModal = async function (...args) {
                await orig.apply(this, args);
                setTimeout(() => window.initGroupSearchModule(), 300);
            };
            window.openReportModal._gsHooked = true;
            console.log('✅ [GroupSearchModule v2] hooked into openReportModal');
        }
    };

    if (typeof window.openReportModal === 'function') {
        _hookModal();
    } else {
        document.addEventListener('DOMContentLoaded', _hookModal);
    }

})();
