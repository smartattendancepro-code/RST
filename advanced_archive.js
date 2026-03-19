
import {
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const BATCH_SIZE   = 10;  
const MAX_PARALLEL = 6;    


const chunkArray = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

const parallelBatch = async (fns, limit = MAX_PARALLEL) => {
    const results = [];
    for (let i = 0; i < fns.length; i += limit) {
        const batch = fns.slice(i, i + limit).map(fn => fn());
        results.push(...await Promise.all(batch));
    }
    return results;
};

const sortByID = (arr) =>
    [...arr].sort((a, b) => {
        const na = Number(a.id), nb = Number(b.id);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a.id).localeCompare(String(b.id));
    });

const ddmmyyyyToDate = (str) => {
    if (!str) return null;
    const [d, m, y] = str.split('/');
    return new Date(+y, +m - 1, +d, 0, 0, 0, 0);
};

const isoToDate = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split('-');
    return new Date(+y, +m - 1, +d, 0, 0, 0, 0);
};

const compareDates = (a, b) =>
    a.split('/').reverse().join('').localeCompare(b.split('/').reverse().join(''));


const makeStyle = (bgRgb, textRgb = '0F172A', bold = false, halign = 'center') => ({
    fill:      { patternType: 'solid', fgColor: { rgb: bgRgb } },
    font:      { name: 'Calibri', sz: 10, bold, color: { rgb: textRgb } },
    border: {
        top:    { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left:   { style: 'thin', color: { rgb: 'CBD5E1' } },
        right:  { style: 'thin', color: { rgb: 'CBD5E1' } }
    },
    alignment: { horizontal: halign, vertical: 'center', wrapText: false }
});

const STYLES = {
    header:      makeStyle('0F172A', 'FFFFFF', true, 'center'),
    subHeader:   makeStyle('1E293B', 'CBD5E1', true, 'center'),
    dateHeader:  makeStyle('0369A1', 'FFFFFF', true, 'center'),
    regular:     (pct) => makeStyle(pct >= 75 ? 'DCFCE7' : pct >= 50 ? 'FEF3C7' : 'FEE2E2'),
    regularName: (pct) => makeStyle(pct >= 75 ? 'DCFCE7' : pct >= 50 ? 'FEF3C7' : 'FEE2E2', '0F172A', false, 'right'),
    manual:      makeStyle('EDE9FE'),
    manualName:  makeStyle('EDE9FE', '0F172A', false, 'right'),
    other:       makeStyle('FEFCE8'),
    otherName:   makeStyle('FEFCE8', '0F172A', false, 'right'),
    present:     makeStyle('DCFCE7', '166534', true),
    absent:      makeStyle('FEE2E2', 'EF4444', true),
    summaryPresent: makeStyle('DCFCE7', '166534', true),
    summaryAbsent:  makeStyle('FEE2E2', 'B91C1C', true),
    summaryPct:  (pct) => makeStyle(pct >= 75 ? 'DCFCE7' : pct >= 50 ? 'FEF3C7' : 'FEE2E2', '0F172A', true),
};


export class AdvancedArchiveManager {

    constructor() {
        this.isOpen        = false;
        this.isProcessing  = false;   // Race-condition guard
        this.selectedGroups = new Set();
        this._injectStyles();
        this._injectModal();
        this._setupListeners();
    }

   
    _injectStyles() {
        if (document.getElementById('archive-modern-css')) return;
        const css = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&display=swap');

        .adv-modal-overlay {
            position:fixed; top:0; left:0; width:100%; height:100%;
            background:rgba(15,23,42,0.65); backdrop-filter:blur(8px);
            z-index:99999; display:flex; align-items:center; justify-content:center;
            opacity:0; animation:advFadeIn .3s forwards;
        }
        .adv-modal-card {
            background:#ffffff; width:95%; max-width:500px;
            border-radius:24px; padding:32px;
            box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);
            font-family:'Outfit',sans-serif;
            transform:scale(.95); animation:advZoomIn .3s forwards;
            position:relative; max-height:92vh; overflow-y:auto;
        }
        .adv-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; }
        .adv-title  { font-size:22px; font-weight:700; color:#1e293b; letter-spacing:-.5px; }
        .adv-subtitle { font-size:13px; color:#64748b; margin-top:4px; }
        .adv-close-btn {
            background:#f1f5f9; border:none; width:32px; height:32px;
            border-radius:50%; color:#64748b; cursor:pointer;
            transition:all .2s; display:flex; align-items:center; justify-content:center;
            flex-shrink:0;
        }
        .adv-close-btn:hover { background:#e2e8f0; color:#0f172a; transform:rotate(90deg); }
        .adv-label {
            font-size:13px; font-weight:600; color:#334155;
            margin-bottom:8px; display:flex; align-items:center; gap:5px;
        }
        .adv-input-group { margin-bottom:20px; }
        .adv-input {
            width:100%; padding:11px 14px; border:1.5px solid #e2e8f0;
            border-radius:12px; background:#f8fafc; color:#0f172a;
            font-size:14px; font-family:'Outfit',sans-serif;
            transition:all .2s; box-sizing:border-box; outline:none;
        }
        .adv-input:focus { background:#fff; border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.1); }
        .adv-date-row { display:flex; gap:12px; }
        .adv-date-row .adv-input { flex:1; cursor:pointer; }

        /* GROUP CHIPS */
        .adv-group-container {
            border:1.5px solid #e2e8f0; border-radius:12px;
            background:#f8fafc; padding:10px 12px;
            display:flex; flex-wrap:wrap; gap:8px;
            min-height:46px; align-items:center; cursor:pointer;
            transition:border-color .2s;
        }
        .adv-group-container:hover { border-color:#3b82f6; }
        .adv-group-container.required-error { border-color:#ef4444!important; box-shadow:0 0 0 3px rgba(239,68,68,.1); }
        .adv-group-placeholder { color:#94a3b8; font-size:13px; pointer-events:none; }
        .adv-chip {
            background:#dbeafe; color:#1d4ed8; border-radius:20px;
            padding:3px 10px; font-size:12px; font-weight:700;
            display:flex; align-items:center; gap:5px; user-select:none;
        }
        .adv-chip-x { cursor:pointer; font-weight:900; color:#1d4ed8; opacity:.6; font-size:14px; line-height:1; }
        .adv-chip-x:hover { opacity:1; }
        .adv-group-dropdown {
            display:none; border:1.5px solid #e2e8f0; border-radius:12px;
            background:#fff; max-height:180px; overflow-y:auto;
            margin-top:6px; box-shadow:0 4px 12px rgba(0,0,0,.08);
        }
        .adv-group-dropdown.open { display:block; }
        .adv-group-option {
            padding:10px 14px; font-size:13px; font-weight:600;
            color:#334155; cursor:pointer; border-bottom:1px solid #f1f5f9;
            display:flex; align-items:center; gap:8px; transition:background .15s;
        }
        .adv-group-option:last-child { border-bottom:none; }
        .adv-group-option:hover { background:#f0f9ff; color:#1d4ed8; }
        .adv-group-option.selected { background:#eff6ff; color:#1d4ed8; }
        .adv-chk {
            width:16px; height:16px; flex-shrink:0; border:2px solid #cbd5e1;
            border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:10px;
        }
        .adv-group-option.selected .adv-chk { background:#2563eb; border-color:#2563eb; color:#fff; }

        .adv-hint { font-size:11px; color:#94a3b8; margin-top:5px; font-style:italic; }
        .adv-hint.required { color:#ef4444; font-style:normal; font-weight:600; }

        /* TOGGLE */
        .adv-toggle-row {
            display:flex; align-items:center; gap:10px; margin-top:14px;
            padding:10px 14px; background:#fffbeb; border:1px solid #fde68a;
            border-radius:10px; cursor:pointer; user-select:none;
        }
        .adv-toggle-row input[type="checkbox"] { width:16px; height:16px; cursor:pointer; accent-color:#f59e0b; }
        .adv-toggle-label { font-size:12px; font-weight:600; color:#92400e; flex:1; }

        /* PROGRESS BAR */
        .adv-progress-wrap {
            display:none; height:6px; background:#e2e8f0;
            border-radius:3px; overflow:hidden; margin-top:12px;
        }
        .adv-progress-wrap.active { display:block; }
        .adv-progress-bar {
            height:100%; background:linear-gradient(90deg,#2563eb,#3b82f6);
            border-radius:3px; transition:width .3s ease; width:0%;
        }

        /* BUTTON */
        .adv-btn-primary {
            width:100%; padding:14px; border:none; border-radius:14px;
            background:linear-gradient(135deg,#2563eb,#1d4ed8);
            color:#fff; font-size:15px; font-weight:600; cursor:pointer;
            display:flex; align-items:center; justify-content:center; gap:10px;
            transition:transform .2s, box-shadow .2s;
            box-shadow:0 4px 6px -1px rgba(37,99,235,.2);
            font-family:'Outfit',sans-serif;
        }
        .adv-btn-primary:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 10px 15px -3px rgba(37,99,235,.3); }
        .adv-btn-primary:active:not(:disabled) { transform:translateY(0); }
        .adv-btn-primary:disabled { opacity:.65; cursor:not-allowed; }

        .adv-status {
            margin-top:14px; font-size:13px; color:#64748b;
            text-align:center; min-height:20px; font-weight:500;
        }

        /* STATS PILLS */
        .adv-stats-row { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:10px; }
        .adv-stat-pill {
            padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700;
            display:flex; align-items:center; gap:4px;
        }
        .adv-pill-green  { background:#dcfce7; color:#166534; }
        .adv-pill-purple { background:#ede9fe; color:#7c3aed; }
        .adv-pill-yellow { background:#fef9c3; color:#ca8a04; }
        .adv-pill-blue   { background:#dbeafe; color:#1d4ed8; }

        @keyframes advFadeIn { to { opacity:1; } }
        @keyframes advZoomIn { to { transform:scale(1); } }
        `;
        const tag = document.createElement('style');
        tag.id = 'archive-modern-css';
        tag.textContent = css;
        document.head.appendChild(tag);
    }

 
    _injectModal() {
        document.getElementById('advancedArchiveModal')?.remove();
        document.body.insertAdjacentHTML('beforeend', `
        <div id="advancedArchiveModal" class="adv-modal-overlay" style="display:none;">
          <div class="adv-modal-card">

            <div class="adv-header">
              <div>
                <div class="adv-title">📊 Attendance Archive</div>
                <div class="adv-subtitle">Export advanced Excel reports</div>
              </div>
              <button id="btnCloseArchive" class="adv-close-btn" aria-label="Close">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <!-- Date Range -->
            <div class="adv-input-group">
              <label class="adv-label">
                <i class="fa-regular fa-calendar" style="color:#64748b;"></i> Date Range
              </label>
              <div class="adv-date-row">
                <input type="date" id="advStartDate" class="adv-input" aria-label="Start date">
                <input type="date" id="advEndDate"   class="adv-input" aria-label="End date">
              </div>
            </div>

            <!-- Level -->
            <div class="adv-input-group">
              <label class="adv-label">
                <i class="fa-solid fa-layer-group" style="color:#64748b;"></i> Level & Subject
              </label>
              <select id="advLevelSelect" class="adv-input" style="margin-bottom:12px;cursor:pointer;">
                <option value="" disabled selected>Select Level...</option>
                <option value="1">Level 1 — First Year</option>
                <option value="2">Level 2 — Second Year</option>
                <option value="3">Level 3 — Third Year</option>
                <option value="4">Level 4 — Fourth Year</option>
              </select>
              <input type="text" id="advSubjectInput" list="advSubjectList"
                     class="adv-input" placeholder="Type subject name..."
                     autocomplete="off">
              <datalist id="advSubjectList"></datalist>
            </div>

            <!-- Group Filter -->
            <div class="adv-input-group" id="advGroupSection" style="display:none;">
              <label class="adv-label">
                <i class="fa-solid fa-users" style="color:#64748b;"></i>
                Filter by Group
                <span style="color:#ef4444;font-size:11px;font-weight:700;">* required</span>
              </label>
              <div class="adv-group-container" id="advGroupChipsContainer" role="button" tabindex="0" aria-expanded="false">
                <span class="adv-group-placeholder" id="advGroupPlaceholder">Choose one or more groups…</span>
              </div>
              <div class="adv-group-dropdown" id="advGroupDropdown" role="listbox"></div>
              <div class="adv-hint required" id="advGroupHint" style="display:none;">
                <i class="fa-solid fa-circle-exclamation"></i> Select at least one group
              </div>

              <label class="adv-toggle-row" for="advIncludeOthers">
                <input type="checkbox" id="advIncludeOthers" checked>
                <span class="adv-toggle-label">
                  <i class="fa-solid fa-users-between-lines" style="color:#f59e0b;margin-left:4px;"></i>
                  Include students from other groups (same subject + doctor + day)
                </span>
              </label>
            </div>

            <button id="btnGenerateExcel" class="adv-btn-primary">
              <i class="fa-solid fa-file-excel"></i>
              <span>Export Excel Report</span>
            </button>

            <div class="adv-progress-wrap" id="advProgressWrap">
              <div class="adv-progress-bar" id="advProgressBar"></div>
            </div>

            <div id="advStatusLog" class="adv-status"></div>
          </div>
        </div>`);
    }


    _setupListeners() {
        document.getElementById('btnCloseArchive').onclick = () => this.close();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.close();
        });

        document.getElementById('advancedArchiveModal').addEventListener('click', (e) => {
            if (e.target.id === 'advancedArchiveModal') this.close();
        });

        const today     = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        document.getElementById('advEndDate').value   = today.toISOString().split('T')[0];
        document.getElementById('advStartDate').value = firstOfMonth.toISOString().split('T')[0];

        document.getElementById('advLevelSelect').addEventListener('change', (e) => {
            const level = e.target.value;
            const dl = document.getElementById('advSubjectList');
            dl.innerHTML = '';
            document.getElementById('advSubjectInput').value = '';
            this._clearGroups();
            document.getElementById('advGroupSection').style.display = 'none';

            const map = { '1':'first_year','2':'second_year','3':'third_year','4':'fourth_year' };
            const subs = (window.subjectsData || {})[map[level]]
                      || (window.subjectsData || {})[level]
                      || [];
            subs.forEach(s => {
                const o = document.createElement('option');
                o.value = s;
                dl.appendChild(o);
            });
        });

        const subjectInput = document.getElementById('advSubjectInput');
        const showGroups = () => {
            const level   = document.getElementById('advLevelSelect').value;
            const subject = subjectInput.value.trim();
            const section = document.getElementById('advGroupSection');
            if (level && subject) {
                this._buildGroupDropdown(level);
                section.style.display = 'block';
            } else {
                section.style.display = 'none';
            }
        };
        subjectInput.addEventListener('change', showGroups);
        subjectInput.addEventListener('input',  showGroups);

        const chipsContainer = document.getElementById('advGroupChipsContainer');
        chipsContainer.addEventListener('click', () => this._toggleDropdown());
        chipsContainer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._toggleDropdown(); }
        });

       
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#advGroupSection')) {
                document.getElementById('advGroupDropdown')?.classList.remove('open');
                document.getElementById('advGroupChipsContainer')?.setAttribute('aria-expanded','false');
            }
        });

        document.getElementById('btnGenerateExcel').addEventListener('click', () => {
            this._generateReport();
        });
    }

    _toggleDropdown() {
        const dd = document.getElementById('advGroupDropdown');
        const cc = document.getElementById('advGroupChipsContainer');
        const isOpen = dd.classList.toggle('open');
        cc.setAttribute('aria-expanded', String(isOpen));
        cc.classList.remove('required-error');
        document.getElementById('advGroupHint').style.display = 'none';
    }

    _buildGroupDropdown(level) {
        const dropdown = document.getElementById('advGroupDropdown');
        dropdown.innerHTML = '';

        const groups = [
            `${level}G1 GP`,
            `${level}G1`,
            ...Array.from({ length: 18 }, (_, i) => `${level}G${i + 2}`),
            `${level}G20`, `${level}G30`, `${level}G40`
        ];

        groups.forEach(g => {
            const div = document.createElement('div');
            div.className = 'adv-group-option';
            div.dataset.group = g;
            div.setAttribute('role', 'option');
            div.innerHTML = `<div class="adv-chk"></div><span>${g}</span>`;
            if (this.selectedGroups.has(g)) {
                div.classList.add('selected');
                div.querySelector('.adv-chk').textContent = '✓';
            }
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleGroup(g, div);
            });
            dropdown.appendChild(div);
        });
    }

    _toggleGroup(g, el) {
        if (this.selectedGroups.has(g)) {
            this.selectedGroups.delete(g);
            el.classList.remove('selected');
            el.querySelector('.adv-chk').textContent = '';
        } else {
            this.selectedGroups.add(g);
            el.classList.add('selected');
            el.querySelector('.adv-chk').textContent = '✓';
        }
        this._renderChips();
        if (this.selectedGroups.size > 0) {
            document.getElementById('advGroupChipsContainer').classList.remove('required-error');
            document.getElementById('advGroupHint').style.display = 'none';
        }
    }

    _renderChips() {
        const container = document.getElementById('advGroupChipsContainer');
        container.querySelectorAll('.adv-chip').forEach(c => c.remove());
        const ph = document.getElementById('advGroupPlaceholder');

        if (this.selectedGroups.size === 0) {
            ph.style.display = 'inline';
        } else {
            ph.style.display = 'none';
            this.selectedGroups.forEach(g => {
                const chip = document.createElement('span');
                chip.className = 'adv-chip';
                chip.innerHTML = `${g} <span class="adv-chip-x" aria-label="Remove ${g}">×</span>`;
                chip.querySelector('.adv-chip-x').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectedGroups.delete(g);
                    const opt = document.querySelector(`#advGroupDropdown [data-group="${g}"]`);
                    if (opt) {
                        opt.classList.remove('selected');
                        opt.querySelector('.adv-chk').textContent = '';
                    }
                    this._renderChips();
                });
                container.appendChild(chip);
            });
        }
    }

    _clearGroups() {
        this.selectedGroups.clear();
        const c  = document.getElementById('advGroupChipsContainer');
        const ph = document.getElementById('advGroupPlaceholder');
        const dd = document.getElementById('advGroupDropdown');
        const h  = document.getElementById('advGroupHint');
        if (c)  { c.querySelectorAll('.adv-chip').forEach(x => x.remove()); c.classList.remove('required-error'); }
        if (ph) ph.style.display = 'inline';
        if (dd) { dd.innerHTML = ''; dd.classList.remove('open'); }
        if (h)  h.style.display = 'none';
    }


    open() {
        this.isOpen = true;
        document.getElementById('advancedArchiveModal').style.display = 'flex';
    }

    close() {
        if (this.isProcessing) return; 
        this.isOpen = false;
        document.getElementById('advancedArchiveModal').style.display = 'none';
    }

    _setProgress(pct, msg = '') {
        const bar  = document.getElementById('advProgressBar');
        const wrap = document.getElementById('advProgressWrap');
        const log  = document.getElementById('advStatusLog');
        if (bar)  bar.style.width  = pct + '%';
        if (wrap) wrap.classList.toggle('active', pct > 0 && pct < 100);
        if (log && msg) log.innerHTML = msg;
    }

    _setStatus(html) {
        const el = document.getElementById('advStatusLog');
        if (el) el.innerHTML = html;
    }

    _validate(startVal, endVal, level, subject) {
        if (!startVal || !endVal) {
            this._setStatus('<span style="color:#ef4444;">⚠️ Please select a date range.</span>');
            return false;
        }
        if (!level) {
            this._setStatus('<span style="color:#ef4444;">⚠️ Please select an academic level.</span>');
            return false;
        }
        if (!subject) {
            this._setStatus('<span style="color:#ef4444;">⚠️ Please enter a subject name.</span>');
            document.getElementById('advSubjectInput').focus();
            return false;
        }
        const start = isoToDate(startVal), end = isoToDate(endVal);
        if (start > end) {
            this._setStatus('<span style="color:#ef4444;">⚠️ Start date cannot be after end date.</span>');
            return false;
        }
        const diffDays = (end - start) / 86400000;
        if (diffDays > 365) {
            this._setStatus('<span style="color:#ef4444;">⚠️ Date range cannot exceed 1 year.</span>');
            return false;
        }
        if (this.selectedGroups.size === 0) {
            document.getElementById('advGroupChipsContainer').classList.add('required-error');
            document.getElementById('advGroupHint').style.display = 'block';
            document.getElementById('advGroupChipsContainer').scrollIntoView({ behavior:'smooth', block:'center' });
            this._setStatus('<span style="color:#ef4444;">⚠️ Please select at least one group.</span>');
            return false;
        }
        return true;
    }

    async _generateReport() {
        if (this.isProcessing) return;

        const startVal     = document.getElementById('advStartDate').value;
        const endVal       = document.getElementById('advEndDate').value;
        const level        = document.getElementById('advLevelSelect').value;
        const subject      = document.getElementById('advSubjectInput').value.trim();
        const includeOthers = document.getElementById('advIncludeOthers').checked;

        if (!this._validate(startVal, endVal, level, subject)) return;

        const db = window.db;
        if (!db) {
            this._setStatus('<span style="color:#ef4444;">❌ Database not available.</span>');
            return;
        }
        if (typeof XLSX === 'undefined') {
            this._setStatus('<span style="color:#ef4444;">❌ XLSX library not loaded.</span>');
            return;
        }

        this.isProcessing = true;
        const btn     = document.getElementById('btnGenerateExcel');
        const origBtn = btn.innerHTML;
        btn.disabled  = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Processing…</span>';
        this._setStatus('');
        this._setProgress(5, 'Fetching attendance records…');

        try {
            const start       = isoToDate(startVal);
            const end         = isoToDate(endVal); end.setHours(23,59,59,999);
            const filterGroups = new Set([...this.selectedGroups].map(g => g.toUpperCase().trim()));
            const filterArr    = Array.from(filterGroups);

           
            this._setProgress(10, 'Fetching attendance for selected groups…');

            const attByGroupSnaps = await parallelBatch(
                chunkArray(filterArr, BATCH_SIZE).map(chunk => () =>
                    getDocs(query(
                        collection(db, 'attendance'),
                        where('subject', '==', subject),
                        where('group',   'in',  chunk)
                    ))
                )
            );

            const activeDatesSet  = new Set();
            const doctorsPerDate  = {};
            const attendanceRecords = [];

            attByGroupSnaps.forEach(snap => {
                snap.forEach(doc => {
                    const r = doc.data();
                    if (!r.date) return;

                    const recDate = ddmmyyyyToDate(r.date);
                    if (!recDate || recDate < start || recDate > end) return;

                    const rg = (r.group || '').toUpperCase().trim();
                    if (!filterGroups.has(rg)) return; // safety

                    activeDatesSet.add(r.date);
                    attendanceRecords.push(r);

                    if (!doctorsPerDate[r.date]) doctorsPerDate[r.date] = new Set();
                    if (r.doctorName) doctorsPerDate[r.date].add(r.doctorName.trim());
                });
            });

            const sortedDates = Array.from(activeDatesSet).sort(compareDates);

            if (sortedDates.length === 0) {
                this._setProgress(0);
                this._setStatus('<span style="color:#f59e0b;">⚠️ No sessions found for the selected range and groups.</span>');
                return;
            }

            this._setProgress(30, 'Fetching student roster…');

            const groupChunks   = chunkArray(filterArr, BATCH_SIZE);
            const levelKey      = String(level);
            const levelMap      = { '1':'first_year','2':'second_year','3':'third_year','4':'fourth_year' };
            const levelAlt      = levelMap[levelKey] || levelKey;

            const [studSnaps, urSnaps] = await Promise.all([
                parallelBatch(groupChunks.map(chunk => () =>
                    getDocs(query(
                        collection(db, 'students'),
                        where('academic_level', '==', levelKey),
                        where('group_code',     'in',  chunk)
                    )).catch(() =>
                        getDocs(query(
                            collection(db, 'students'),
                            where('academic_level', '==', levelAlt),
                            where('group_code',     'in',  chunk)
                        ))
                    )
                )),
                parallelBatch(groupChunks.map(chunk => () =>
                    getDocs(query(
                        collection(db, 'user_registrations'),
                        where('registrationInfo.group', 'in', chunk)
                    ))
                ))
            ]);

            const masterMap = {};

            studSnaps.forEach(snap => {
                snap.forEach(doc => {
                    const s  = doc.data();
                    const id = String(s.id || s.studentID || doc.id).trim();
                    if (!id || id === 'undefined') return;
                    const rg = (s.group || s.group_code || s.groupCode || '').toUpperCase().trim();
                    if (!masterMap[id]) {
                        masterMap[id] = {
                            id, name: (s.name || s.fullName || 'Unknown').trim(),
                            group: rg, type: 'Regular',
                            logs: {}, doctorsSeen: new Set(), presenceCount: 0
                        };
                    }
                });
            });

            urSnaps.forEach(snap => {
                snap.forEach(doc => {
                    const info = doc.data().registrationInfo || doc.data();
                    if (!info?.studentID) return;
                    const id = String(info.studentID).trim();
                    if (!id || masterMap[id]) return; // already in masterMap
                    const rg = (info.group || '').toUpperCase().trim();
                    if (!filterGroups.has(rg)) return;
                    masterMap[id] = {
                        id, name: (info.fullName || 'Unknown').trim(),
                        group: rg, type: 'Regular',
                        logs: {}, doctorsSeen: new Set(), presenceCount: 0
                    };
                });
            });

            this._setProgress(55, 'Mapping attendance data…');

            const masterIDs = new Set(Object.keys(masterMap));

            attendanceRecords.forEach(r => {
                const sid = String(r.id || '').trim();
                if (!sid) return;

                if (!masterIDs.has(sid)) {
                    if (!masterMap[sid]) {
                        masterMap[sid] = {
                            id: sid,
                            name:  (r.name || sid).trim(),
                            group: (r.group || '--').toUpperCase().trim(),
                            type:  'Manual',
                            logs:  {}, doctorsSeen: new Set(), presenceCount: 0
                        };
                    }
                }

                const st = masterMap[sid];
                if (!st.logs[r.date]) {
                    st.logs[r.date] = {
                        time:   r.time_str || '--',
                        hall:   r.hall     || '--',
                        doctor: r.doctorName || '--'
                    };
                    st.presenceCount++;
                }
                if (r.doctorName) st.doctorsSeen.add(r.doctorName.trim());

                if (r.group && r.group !== 'General' && r.group !== 'UNKNOWN') {
                    st.group = r.group.toUpperCase().trim();
                }
            });

         
            const otherGroupMap = {};

            if (includeOthers) {
                this._setProgress(70, 'Fetching students from other groups…');

                const dateBatches = chunkArray(sortedDates, BATCH_SIZE);
                const otherSnaps  = await parallelBatch(
                    dateBatches.map(dates => () =>
                        getDocs(query(
                            collection(db, 'attendance'),
                            where('subject', '==', subject),
                            where('date',    'in',  dates)
                        ))
                    )
                );

                otherSnaps.forEach(snap => {
                    snap.forEach(doc => {
                        const r   = doc.data();
                        const sid = String(r.id || '').trim();
                        if (!sid) return;

                        if (masterMap[sid]) return;
                        if (otherGroupMap[sid]?.logs?.[r.date]) return; 

                        const recDate = ddmmyyyyToDate(r.date);
                        if (!recDate || recDate < start || recDate > end) return;

                        const rg = (r.group || '').toUpperCase().trim();
                        if (filterGroups.has(rg)) return;

                        const dateDoctors = doctorsPerDate[r.date];
                        if (!dateDoctors || dateDoctors.size === 0) return;
                        if (r.doctorName && !dateDoctors.has(r.doctorName.trim())) return;

                        if (!otherGroupMap[sid]) {
                            otherGroupMap[sid] = {
                                id: sid, name: (r.name || sid).trim(),
                                group: rg || '—', type: 'OtherGroup',
                                logs: {}, doctorsSeen: new Set(), presenceCount: 0
                            };
                        }
                        const st = otherGroupMap[sid];
                        if (!st.logs[r.date]) {
                            st.logs[r.date] = {
                                time:   r.time_str || '--',
                                hall:   r.hall     || '--',
                                doctor: r.doctorName || '--'
                            };
                            st.presenceCount++;
                        }
                        if (r.doctorName) st.doctorsSeen.add(r.doctorName.trim());
                    });
                });
            }

            this._setProgress(85, 'Building Excel…');

            const regularStudents = sortByID(Object.values(masterMap).filter(s => s.type === 'Regular'));
            const manualStudents  = sortByID(Object.values(masterMap).filter(s => s.type === 'Manual'));
            const otherStudents   = sortByID(Object.values(otherGroupMap));

            const allStudents = [...regularStudents, ...manualStudents, ...otherStudents];
            const total       = sortedDates.length;

            const wb = XLSX.utils.book_new();
            const wsData = []; 

            const fixedHeaders = ['#','Student ID','Student Name','Group','Type','Attended','Absent','% Present','Instructors'];
            wsData.push([...fixedHeaders, ...sortedDates]);

            allStudents.forEach((st, idx) => {
                const present = st.presenceCount;
                const absent  = total - present;
                const pct     = total > 0 ? Math.round((present / total) * 100) : 0;
                const doctors = Array.from(st.doctorsSeen).join(' / ') || '--';

                const row = [
                    idx + 1,
                    st.id,
                    st.name,
                    st.group,
                    st.type === 'Manual'     ? '🟣 Manual'
                  : st.type === 'OtherGroup' ? '🟡 Other Group'
                  :                            '🟢 Regular',
                    present,
                    absent,
                    pct + '%',
                    doctors
                ];

                sortedDates.forEach(d => {
                    row.push(st.logs[d] ? 'P' : 'A');
                });

                wsData.push(row);
            });

            const summaryRow = ['', '', 'TOTAL', '', '',
                allStudents.reduce((s, st) => s + st.presenceCount, 0),
                '',
                '',
                ''
            ];
            sortedDates.forEach(d => {
                const dayCount = allStudents.filter(st => st.logs[d]).length;
                summaryRow.push(dayCount);
            });
            wsData.push(summaryRow);

            const ws = XLSX.utils.aoa_to_sheet(wsData);

            const R = wsData.length;
            const C = fixedHeaders.length + sortedDates.length;

            for (let r = 0; r < R; r++) {
                for (let c = 0; c < C; c++) {
                    const addr = XLSX.utils.encode_cell({ r, c });
                    if (!ws[addr]) ws[addr] = { v: '' };

                    if (r === 0) {
                        ws[addr].s = c >= fixedHeaders.length ? STYLES.dateHeader : STYLES.header;
                    } else if (r === R - 1) {
                        const v = ws[addr].v;
                        if (c === 5) ws[addr].s = STYLES.summaryPresent;
                        else if (typeof v === 'number') ws[addr].s = STYLES.summaryPct(v > 0 ? 100 : 0);
                        else ws[addr].s = STYLES.header;
                    } else {
                        const st  = allStudents[r - 1];
                        const pct = total > 0 ? (st.presenceCount / total) * 100 : 0;

                        if (c >= fixedHeaders.length) {
                            const isPresent = ws[addr].v === 'P';
                            ws[addr].s = isPresent ? STYLES.present : STYLES.absent;
                        } else if (c === 2) {
                            ws[addr].s = st.type === 'Manual'     ? STYLES.manualName
                                       : st.type === 'OtherGroup' ? STYLES.otherName
                                       : STYLES.regularName(pct);
                        } else {
                            ws[addr].s = st.type === 'Manual'     ? STYLES.manual
                                       : st.type === 'OtherGroup' ? STYLES.other
                                       : STYLES.regular(pct);
                        }
                    }
                }
            }

            ws['!cols'] = [
                { wch: 5  },  
                { wch: 14 },  
                { wch: 32 },  
                { wch: 12 },  
                { wch: 14 },  
                { wch: 10 },  
                { wch: 8  },  
                { wch: 10 },  
                { wch: 24 },  
                ...sortedDates.map(() => ({ wch: 11 }))
            ];

            ws['!rows'] = [{ hpt: 20 }]; 

            ws['!freeze'] = { xSplit: 3, ySplit: 1 };

            ws['!views'] = [{ RTL: true }];

            XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');

            const summaryWsData = [
                ['Subject', subject],
                ['Level',   level],
                ['Groups',  filterArr.join(', ')],
                ['From',    startVal],
                ['To',      endVal],
                ['Sessions', sortedDates.length],
                ['Regular Students',    regularStudents.length],
                ['Manual Students',     manualStudents.length],
                ['Other-Group Students',otherStudents.length],
                ['Total Students',      allStudents.length],
            ];
            const summaryWs = XLSX.utils.aoa_to_sheet(summaryWsData);
            summaryWs['!cols'] = [{ wch: 24 }, { wch: 30 }];
            XLSX.utils.book_append_sheet(wb, summaryWs, 'Report Info');

            this._setProgress(95, 'Saving file…');

            const safeSubj  = subject.replace(/[/\\?*\[\]:]/g, '_').substring(0, 25);
            const grpSuffix = filterArr.sort().join('-').substring(0, 30);
            const fileName  = `Archive_${safeSubj}_${grpSuffix}_${startVal}_${endVal}.xlsx`;
            XLSX.writeFile(wb, fileName);

            this._setProgress(100);
            setTimeout(() => this._setProgress(0), 800);

            const statsHTML = `
                <span style="color:#10b981;font-weight:700;">✅ Done — ${fileName}</span>
                <div class="adv-stats-row">
                    <span class="adv-stat-pill adv-pill-green">🟢 ${regularStudents.length} Regular</span>
                    <span class="adv-stat-pill adv-pill-purple">🟣 ${manualStudents.length} Manual</span>
                    <span class="adv-stat-pill adv-pill-yellow">🟡 ${otherStudents.length} Other</span>
                    <span class="adv-stat-pill adv-pill-blue">📅 ${sortedDates.length} Sessions</span>
                </div>`;
            this._setStatus(statsHTML);

            if (typeof window.playSuccess === 'function') window.playSuccess();
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

        } catch (err) {
            console.error('[AdvancedArchiveManager] Export error:', err);
            this._setProgress(0);
            this._setStatus(`<span style="color:#ef4444;">❌ Error: ${err.message}</span>`);
        } finally {
            this.isProcessing = false;
            btn.disabled  = false;
            btn.innerHTML = origBtn;
        }
    }
}

if (!window.advancedArchiveSystem) {
    window.advancedArchiveSystem = new AdvancedArchiveManager();
}
console.log('✅ Advanced Archive Manager v2.0 loaded');
