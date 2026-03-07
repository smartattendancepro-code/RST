import {
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class AdvancedArchiveManager {

    constructor() {
        this.isOpen = false;
        this.selectedGroups = new Set();
        this.injectStyles();
        this.injectModal();
        this.setupListeners();
    }

    injectStyles() {
        const styleId = 'archive-modern-css';
        if (document.getElementById(styleId)) return;

        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&display=swap');

            .adv-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(15, 23, 42, 0.6);
                backdrop-filter: blur(8px);
                z-index: 99999;
                display: flex; align-items: center; justify-content: center;
                opacity: 0; animation: fadeIn 0.3s forwards;
            }

            .adv-modal-card {
                background: #ffffff;
                width: 95%; max-width: 480px;
                border-radius: 24px;
                padding: 32px;
                box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
                font-family: 'Outfit', sans-serif;
                transform: scale(0.95); animation: zoomIn 0.3s forwards;
                position: relative;
                max-height: 90vh; overflow-y: auto;
            }

            .adv-header {
                display: flex; justify-content: space-between; align-items: flex-start;
                margin-bottom: 24px;
            }
            .adv-title { font-size: 22px; font-weight: 700; color: #1e293b; letter-spacing: -0.5px; }
            .adv-subtitle { font-size: 13px; color: #64748b; margin-top: 4px; font-weight: 400; }

            .adv-close-btn {
                background: #f1f5f9; border: none; width: 32px; height: 32px;
                border-radius: 50%; color: #64748b; cursor: pointer;
                transition: all 0.2s; display: flex; align-items: center; justify-content: center;
            }
            .adv-close-btn:hover { background: #e2e8f0; color: #0f172a; transform: rotate(90deg); }

            .adv-label {
                font-size: 13px; font-weight: 600; color: #334155;
                margin-bottom: 8px; display: block;
            }

            .adv-input-group { margin-bottom: 20px; }

            .adv-input {
                width: 100%;
                padding: 12px 16px;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                background: #f8fafc;
                color: #0f172a;
                font-size: 14px;
                font-family: 'Outfit', sans-serif;
                transition: all 0.2s ease;
                box-sizing: border-box;
            }
            .adv-input:focus {
                outline: none;
                background: #ffffff;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
            }

            .adv-date-row { display: flex; gap: 12px; }

            /* GROUP CHIPS */
            .adv-group-container {
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                background: #f8fafc;
                padding: 10px 12px;
                display: flex; flex-wrap: wrap; gap: 8px;
                min-height: 46px; align-items: center;
                cursor: pointer;
                transition: border-color 0.2s;
            }
            .adv-group-container:hover { border-color: #3b82f6; }
            .adv-group-container.required-error { border-color: #ef4444 !important; box-shadow: 0 0 0 3px rgba(239,68,68,0.1); }
            .adv-group-placeholder { color: #94a3b8; font-size: 13px; }

            .adv-chip {
                background: #dbeafe; color: #1d4ed8;
                border-radius: 20px; padding: 3px 10px;
                font-size: 12px; font-weight: 700;
                display: flex; align-items: center; gap: 5px;
            }
            .adv-chip-x {
                cursor: pointer; font-weight: 900;
                color: #1d4ed8; opacity: 0.6; font-size: 14px;
                line-height: 1;
            }
            .adv-chip-x:hover { opacity: 1; }

            .adv-group-dropdown {
                display: none;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                background: #fff;
                max-height: 180px;
                overflow-y: auto;
                margin-top: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            }
            .adv-group-dropdown.open { display: block; }

            .adv-group-option {
                padding: 10px 14px;
                font-size: 13px; font-weight: 600;
                color: #334155; cursor: pointer;
                border-bottom: 1px solid #f1f5f9;
                display: flex; align-items: center; gap: 8px;
                transition: background 0.15s;
            }
            .adv-group-option:last-child { border-bottom: none; }
            .adv-group-option:hover { background: #f0f9ff; color: #1d4ed8; }
            .adv-group-option.selected { background: #eff6ff; color: #1d4ed8; }

            .adv-chk {
                width: 16px; height: 16px; flex-shrink: 0;
                border: 2px solid #cbd5e1; border-radius: 4px;
                display: flex; align-items: center; justify-content: center;
                font-size: 10px;
            }
            .adv-group-option.selected .adv-chk {
                background: #2563eb; border-color: #2563eb; color: #fff;
            }

            .adv-hint {
                font-size: 11px; color: #94a3b8;
                margin-top: 5px; font-style: italic;
            }
            .adv-hint.required { color: #ef4444; font-style: normal; font-weight: 600; }

            /* OTHER GROUPS TOGGLE */
            .adv-toggle-row {
                display: flex; align-items: center; gap: 10px;
                margin-top: 14px; padding: 10px 14px;
                background: #fffbeb; border: 1px solid #fde68a;
                border-radius: 10px; cursor: pointer;
            }
            .adv-toggle-row input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: #f59e0b; }
            .adv-toggle-label { font-size: 12px; font-weight: 600; color: #92400e; flex: 1; }
            .adv-toggle-label i { margin-left: 5px; color: #f59e0b; }

            .adv-btn-primary {
                width: 100%; padding: 14px; border: none; border-radius: 14px;
                background: linear-gradient(135deg, #2563eb, #1d4ed8);
                color: white; font-size: 15px; font-weight: 600; cursor: pointer;
                display: flex; align-items: center; justify-content: center; gap: 10px;
                transition: transform 0.2s, box-shadow 0.2s;
                box-shadow: 0 4px 6px -1px rgba(37,99,235,0.2);
            }
            .adv-btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 15px -3px rgba(37,99,235,0.3);
            }
            .adv-btn-primary:active { transform: translateY(0); }

            .adv-status {
                margin-top: 16px; font-size: 13px; color: #64748b;
                text-align: center; min-height: 20px; font-weight: 500;
            }

            @keyframes fadeIn { to { opacity: 1; } }
            @keyframes zoomIn { to { transform: scale(1); } }
        `;

        const tag = document.createElement('style');
        tag.id = styleId;
        tag.textContent = css;
        document.head.appendChild(tag);
    }

    injectModal() {
        document.getElementById('advancedArchiveModal')?.remove();

        const html = `
        <div id="advancedArchiveModal" class="adv-modal-overlay" style="display:none;">
          <div class="adv-modal-card">

            <div class="adv-header">
              <div>
                <div class="adv-title">Attendance Archive</div>
                <div class="adv-subtitle">Generate advanced Excel reports & Analytics</div>
              </div>
              <button id="btnCloseArchive" class="adv-close-btn">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <!-- Date Range -->
            <div class="adv-input-group">
              <label class="adv-label">
                <i class="fa-regular fa-calendar" style="margin-right:5px;color:#64748b;"></i> Date Range
              </label>
              <div class="adv-date-row">
                <input type="date" id="advStartDate" class="adv-input">
                <input type="date" id="advEndDate" class="adv-input">
              </div>
            </div>

            <!-- Level & Subject -->
            <div class="adv-input-group">
              <label class="adv-label">
                <i class="fa-solid fa-layer-group" style="margin-right:5px;color:#64748b;"></i> Academic Level & Subject
              </label>
              <select id="advLevelSelect" class="adv-input" style="margin-bottom:12px;cursor:pointer;">
                <option value="" disabled selected>Select Level...</option>
                <option value="1">Level 1 (First Year)</option>
                <option value="2">Level 2 (Second Year)</option>
                <option value="3">Level 3 (Third Year)</option>
                <option value="4">Level 4 (Fourth Year)</option>
              </select>
              <input type="text" id="advSubjectInput" list="advSubjectList"
                     class="adv-input" placeholder="Type Subject Name...">
              <datalist id="advSubjectList"></datalist>
            </div>

            <!-- Group Filter (REQUIRED) -->
            <div class="adv-input-group" id="advGroupSection" style="display:none;">
              <label class="adv-label">
                <i class="fa-solid fa-users" style="margin-right:5px;color:#64748b;"></i> Filter by Group
                <span style="color:#ef4444; font-size:12px; margin-right:4px;">* مطلوب</span>
              </label>
              <div class="adv-group-container" id="advGroupChipsContainer">
                <span class="adv-group-placeholder" id="advGroupPlaceholder">اختر جروب أو أكثر...</span>
              </div>
              <div class="adv-group-dropdown" id="advGroupDropdown"></div>
              <div class="adv-hint required" id="advGroupHint" style="display:none;">
                <i class="fa-solid fa-circle-exclamation" style="margin-left:4px;"></i>
                يجب اختيار جروب واحد على الأقل
              </div>

              <!-- Toggle: include other groups -->
              <label class="adv-toggle-row" for="advIncludeOthers">
                <input type="checkbox" id="advIncludeOthers" checked>
                <span class="adv-toggle-label">
                  <i class="fa-solid fa-users-between-lines"></i>
                  تضمين الطلاب من جروبات أخرى حضروا نفس المادة مع نفس الدكتور
                </span>
              </label>
            </div>

            <button id="btnGenerateExcel" class="adv-btn-primary">
              <i class="fa-solid fa-file-export"></i>
              <span>Export Report</span>
            </button>

            <div id="advStatusLog" class="adv-status"></div>
          </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    setupListeners() {
        document.getElementById('btnCloseArchive').onclick = () => {
            document.getElementById('advancedArchiveModal').style.display = 'none';
            this.isOpen = false;
        };

        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        document.getElementById('advEndDate').value = today.toISOString().split('T')[0];
        document.getElementById('advStartDate').value = firstOfMonth.toISOString().split('T')[0];

        document.getElementById('advLevelSelect').addEventListener('change', (e) => {
            const level = e.target.value;
            const dl = document.getElementById('advSubjectList');
            dl.innerHTML = '';
            document.getElementById('advSubjectInput').value = '';
            this._clearGroups();
            document.getElementById('advGroupSection').style.display = 'none';

            const map = { '1': 'first_year', '2': 'second_year', '3': 'third_year', '4': 'fourth_year' };
            const subs = (window.subjectsData || {})[map[level]] || (window.subjectsData || {})[level] || [];
            subs.forEach(s => { const o = document.createElement('option'); o.value = s; dl.appendChild(o); });
        });

        const subjectInput = document.getElementById('advSubjectInput');
        const showGroups = () => {
            const level = document.getElementById('advLevelSelect').value;
            const subject = subjectInput.value.trim();
            if (level && subject) {
                this._buildGroupDropdown(level);
                document.getElementById('advGroupSection').style.display = 'block';
            }
        };
        subjectInput.addEventListener('change', showGroups);
        subjectInput.addEventListener('input', showGroups);

        document.getElementById('advGroupChipsContainer').addEventListener('click', () => {
            document.getElementById('advGroupDropdown').classList.toggle('open');
            // إخفاء رسالة الخطأ لما يفتح الـ dropdown
            document.getElementById('advGroupChipsContainer').classList.remove('required-error');
            document.getElementById('advGroupHint').style.display = 'none';
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#advGroupSection')) {
                document.getElementById('advGroupDropdown')?.classList.remove('open');
            }
        });

        document.getElementById('btnGenerateExcel').addEventListener('click', () => {
            this.generateSmartReport();
        });
    }

    _buildGroupDropdown(level) {
        const dropdown = document.getElementById('advGroupDropdown');
        dropdown.innerHTML = '';

        const specialGroups = [`${level}G1 GP`, `${level}G1`];
        const regularGroups = [];
        for (let i = 2; i <= 19; i++) regularGroups.push(`${level}G${i}`);
        const twentyGroups = [`${level}G20`, `${level}G30`, `${level}G40`];
        const allGroups = [...specialGroups, ...regularGroups, ...twentyGroups];

        allGroups.forEach(g => {
            const div = document.createElement('div');
            div.className = 'adv-group-option';
            div.dataset.group = g;
            div.innerHTML = `<div class="adv-chk"></div> ${g}`;
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

        // لو فيه جروب متاختار، شيل رسالة الخطأ
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
                chip.innerHTML = `${g} <span class="adv-chip-x">×</span>`;
                chip.querySelector('.adv-chip-x').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectedGroups.delete(g);
                    const opt = document.querySelector(`#advGroupDropdown [data-group="${g}"]`);
                    if (opt) { opt.classList.remove('selected'); opt.querySelector('.adv-chk').textContent = ''; }
                    this._renderChips();
                });
                container.appendChild(chip);
            });
        }
    }

    _clearGroups() {
        this.selectedGroups = new Set();
        const c = document.getElementById('advGroupChipsContainer');
        if (c) {
            c.querySelectorAll('.adv-chip').forEach(x => x.remove());
            c.classList.remove('required-error');
        }
        const ph = document.getElementById('advGroupPlaceholder');
        if (ph) ph.style.display = 'inline';
        const dd = document.getElementById('advGroupDropdown');
        if (dd) { dd.innerHTML = ''; dd.classList.remove('open'); }
        const hint = document.getElementById('advGroupHint');
        if (hint) hint.style.display = 'none';
    }

    open() {
        if (this.isOpen) {
            document.getElementById('advancedArchiveModal').style.display = 'flex';
            return;
        }
        this.isOpen = true;
        document.getElementById('advancedArchiveModal').style.display = 'flex';
    }

    async generateSmartReport() {
        const db = window.db;
        if (!db) { alert("Error: Database not initialized."); return; }

        const startDateVal = document.getElementById('advStartDate').value;
        const endDateVal   = document.getElementById('advEndDate').value;
        const level        = document.getElementById('advLevelSelect').value;
        const subject      = document.getElementById('advSubjectInput').value.trim();
        const statusLog    = document.getElementById('advStatusLog');
        const btn          = document.getElementById('btnGenerateExcel');
        const includeOthers = document.getElementById('advIncludeOthers').checked;

        // ── validation ──
        if (!startDateVal || !endDateVal || !level || !subject) {
            statusLog.innerHTML = '<span style="color:#ef4444;">⚠️ Please fill in all fields.</span>';
            return;
        }

        // إجبار اختيار جروب
        if (this.selectedGroups.size === 0) {
            document.getElementById('advGroupChipsContainer').classList.add('required-error');
            document.getElementById('advGroupHint').style.display = 'block';
            document.getElementById('advGroupChipsContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });
            statusLog.innerHTML = '<span style="color:#ef4444;">⚠️ يجب اختيار جروب واحد على الأقل.</span>';
            return;
        }

        const start = new Date(startDateVal); start.setHours(0, 0, 0, 0);
        const end   = new Date(endDateVal);   end.setHours(23, 59, 59, 999);

        if (start > end) {
            statusLog.innerHTML = '<span style="color:#ef4444;">⚠️ Start date cannot be after end date.</span>';
            return;
        }

        const filterGroups = new Set(this.selectedGroups);

        const origBtn = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Processing...</span>';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.8';

        try {
            statusLog.innerText = "Fetching attendance records...";

            // ── 1. حضور الجروبات المختارة ──
            const attSnap = await getDocs(
                query(collection(db, "attendance"),
                    where("subject", "==", subject))
            );

            let activeDatesSet = new Set();
            // doctorsPerDate: { date → Set of doctorNames } لاستخدامها في جلب الجروبات الأخرى
            let doctorsPerDate = {};
            let attendanceRecords = [];

            attSnap.forEach(doc => {
                const r = doc.data();
                const parts = r.date.split('/');
                const recDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                if (recDate < start || recDate > end) return;

                const rg = (r.group || '').toUpperCase().trim();
                if (!filterGroups.has(rg)) return;

                activeDatesSet.add(r.date);
                attendanceRecords.push(r);

                // تجميع الدكاترة لكل تاريخ
                if (!doctorsPerDate[r.date]) doctorsPerDate[r.date] = new Set();
                if (r.doctorName) doctorsPerDate[r.date].add(r.doctorName);
            });

            const sortedDates = Array.from(activeDatesSet).sort((a, b) =>
                a.split('/').reverse().join('').localeCompare(b.split('/').reverse().join(''))
            );

            if (sortedDates.length === 0) {
                statusLog.innerText = "No sessions found for selected range / group.";
                return;
            }

            // ── 2. جلب طلاب الجروبات المختارة ──
            statusLog.innerText = "Fetching students...";

            const stSnap = await getDocs(
                query(collection(db, "students"), where("academic_level", "==", level))
            );

            // masterMap: طلاب الجروبات المختارة
            let masterMap = {};
            stSnap.forEach(doc => {
                const s = doc.data();
                const rg = (s.group || s.group_code || s.groupCode || '--').toUpperCase().trim();
                if (!filterGroups.has(rg)) return;
                masterMap[s.id] = {
                    id: s.id, name: s.name, group: rg,
                    type: 'Regular',
                    logs: {}, doctorsSeen: new Set(), presenceCount: 0
                };
            });

            // fallback: user_registrations
            if (Object.keys(masterMap).length === 0) {
                const urSnap = await getDocs(
                    query(collection(db, "user_registrations"),
                        where("registrationInfo.group", "in", Array.from(filterGroups)))
                );
                urSnap.forEach(doc => {
                    const info = doc.data().registrationInfo || doc.data();
                    if (!info.studentID) return;
                    const rg = (info.group || '--').toUpperCase().trim();
                    masterMap[String(info.studentID).trim()] = {
                        id: String(info.studentID).trim(),
                        name: info.fullName || 'Unknown',
                        group: rg,
                        type: 'Regular',
                        logs: {}, doctorsSeen: new Set(), presenceCount: 0
                    };
                });
            }

            // ── 3. تسجيل حضور طلاب الجروبات المختارة ──
            statusLog.innerText = "Mapping attendance data...";

            attendanceRecords.forEach(r => {
                if (!masterMap[r.id]) {
                    // طالب حضر بس مش في قائمة الجروب → يدوي
                    masterMap[r.id] = {
                        id: r.id, name: r.name || r.id, group: (r.group || '--').toUpperCase().trim(),
                        type: 'Manual',
                        logs: {}, doctorsSeen: new Set(), presenceCount: 0
                    };
                }
                masterMap[r.id].logs[r.date] = { time: r.time_str || '--', hall: r.hall || '--', doctor: r.doctorName || '--' };
                masterMap[r.id].presenceCount++;
                if (r.doctorName) masterMap[r.id].doctorsSeen.add(r.doctorName);
                if (r.group && r.group !== 'General' && r.group !== 'UNKNOWN') {
                    masterMap[r.id].group = r.group.toUpperCase().trim();
                }
            });

            // ── 4. جلب طلاب الجروبات الأخرى (نفس المادة + نفس الدكتور + نفس اليوم) ──
            let otherGroupMap = {};

            if (includeOthers && sortedDates.length > 0) {
                statusLog.innerText = "Fetching students from other groups...";

                // نجيب كل حضور نفس المادة واليوم بدون تقييد الجروب
                const otherSnap = await getDocs(
                    query(collection(db, "attendance"),
                        where("subject", "==", subject))
                );

                otherSnap.forEach(doc => {
                    const r = doc.data();
                    const sid = String(r.id || '').trim();
                    if (!sid) return;

                    // بس في نفس نطاق التواريخ
                    const parts = r.date.split('/');
                    const recDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    if (recDate < start || recDate > end) return;

                    // تجاهل لو من الجروبات المختارة أصلاً
                    const rg = (r.group || '').toUpperCase().trim();
                    if (filterGroups.has(rg)) return;

                    // تجاهل لو موجود بالفعل في masterMap
                    if (masterMap[sid]) return;

                    // تحقق إن الدكتور في نفس اليوم هو نفسه دكتور الجروب الأصلي
                    const dateDoctors = doctorsPerDate[r.date];
                    if (!dateDoctors) return; // اليوم ده مفيش محاضرة للجروب الأصلي أصلاً
                    if (r.doctorName && !dateDoctors.has(r.doctorName)) return; // دكتور مختلف

                    if (!otherGroupMap[sid]) {
                        otherGroupMap[sid] = {
                            id: sid, name: r.name || sid, group: rg || '—',
                            type: 'OtherGroup',
                            logs: {}, doctorsSeen: new Set(), presenceCount: 0
                        };
                    }
                    otherGroupMap[sid].logs[r.date] = { time: r.time_str || '--', hall: r.hall || '--', doctor: r.doctorName || '--' };
                    otherGroupMap[sid].presenceCount++;
                    if (r.doctorName) otherGroupMap[sid].doctorsSeen.add(r.doctorName);
                });
            }

            // ── 5. دمج الكل وترتيب ──
            statusLog.innerText = "Building Excel...";

            const allStudents = [
                // أولاً: طلاب الجروبات المختارة (Regular ثم Manual)
                ...Object.values(masterMap).filter(s => s.type === 'Regular'),
                ...Object.values(masterMap).filter(s => s.type === 'Manual'),
                // أخيراً: طلاب الجروبات الأخرى
                ...Object.values(otherGroupMap)
            ].sort((a, b) => {
                // ترتيب داخل كل نوع حسب الرقم
                if (a.type !== b.type) {
                    const order = { Regular: 0, Manual: 1, OtherGroup: 2 };
                    return order[a.type] - order[b.type];
                }
                const nA = parseInt(a.id), nB = parseInt(b.id);
                if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
                return String(a.id).localeCompare(String(b.id));
            });

            const total = sortedDates.length;
            const rows = [];

            // ألوان حسب النوع والحضور
            const typeColors = {
                Regular:    null,     // هيتحدد حسب نسبة الحضور
                Manual:     'EDE9FE', // بنفسجي فاتح
                OtherGroup: 'FEFCE8'  // أصفر فاتح
            };

            allStudents.forEach((st, idx) => {
                const present = st.presenceCount;
                const absent  = total - present;
                const pct     = total > 0 ? (present / total) * 100 : 0;
                const doctors = Array.from(st.doctorsSeen).join(', ') || '--';

                // لون الصف
                let rowRgb;
                if (st.type === 'Manual') {
                    rowRgb = 'EDE9FE';
                } else if (st.type === 'OtherGroup') {
                    rowRgb = 'FEFCE8';
                } else {
                    rowRgb = pct < 50 ? 'FEE2E2' : pct < 75 ? 'FEF3C7' : 'DCFCE7';
                }

                const base = {
                    fill: { fgColor: { rgb: rowRgb } },
                    border: {
                        top:    { style: 'thin', color: { rgb: 'CBD5E1' } },
                        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
                        left:   { style: 'thin', color: { rgb: 'CBD5E1' } },
                        right:  { style: 'thin', color: { rgb: 'CBD5E1' } }
                    },
                    alignment: { horizontal: 'center', vertical: 'center' },
                    font: { name: 'Arial', sz: 10 }
                };
                const nameStyle = { ...base, alignment: { horizontal: 'right', vertical: 'center' } };

                // label النوع
                const typeLabel = st.type === 'Manual' ? '🟣 يدوي' : st.type === 'OtherGroup' ? '🟡 جروب آخر' : '🟢 أصلي';

                const row = {
                    '#':             { v: idx + 1, s: base },
                    'Student ID':    { v: st.id,   s: base },
                    'Student Name':  { v: st.name, s: nameStyle },
                    'Group':         { v: st.group, s: base },
                    'Type':          { v: typeLabel, s: base },
                    'Attended':      { v: present,  s: base },
                    'Absence':       { v: absent,   s: base },
                    'Instructor':    { v: doctors,  s: base },
                };

                sortedDates.forEach(d => {
                    const log  = st.logs[d];
                    const here = !!log;
                    row[d] = {
                        v: here ? 'حاضر' : 'غائب',
                        s: {
                            ...base,
                            fill: { fgColor: { rgb: here ? 'DCFCE7' : 'FEE2E2' } },
                            font: { color: { rgb: here ? '166534' : 'EF4444' }, bold: true }
                        }
                    };
                });

                rows.push(row);
            });

            const ws = XLSX.utils.json_to_sheet(rows);
            const cols = [
                { wch: 5 }, { wch: 15 }, { wch: 30 }, { wch: 12 },
                { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 25 }
            ];
            sortedDates.forEach(() => cols.push({ wch: 12 }));
            ws['!cols'] = cols;
            ws['!views'] = [{ RTL: true }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');

            const safeSubj  = subject.replace(/[/\\?*\[\]]/g, '_').substring(0, 25);
            const grpSuffix = `_${Array.from(filterGroups).sort().join('-')}`;
            XLSX.writeFile(wb, `Archive_${safeSubj}${grpSuffix}_${startDateVal}_to_${endDateVal}.xlsx`);

            const regularCount    = Object.values(masterMap).filter(s => s.type === 'Regular').length;
            const manualCount     = Object.values(masterMap).filter(s => s.type === 'Manual').length;
            const otherCount      = Object.values(otherGroupMap).length;

            statusLog.innerHTML = `
                <span style="color:#10b981;">✅ Done!</span>
                ${regularCount} أصلي · ${manualCount} يدوي · ${otherCount} جروب آخر
                · ${sortedDates.length} محاضرة
            `;
            if (window.playSuccess) window.playSuccess();

        } catch (err) {
            console.error('Archive Error:', err);
            statusLog.innerHTML = `<span style="color:#ef4444;">❌ Error: ${err.message}</span>`;
        } finally {
            btn.innerHTML = origBtn;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        }
    }
}

if (!window.advancedArchiveSystem) {
    window.advancedArchiveSystem = new AdvancedArchiveManager();
}
console.log('Advanced Archive v4 Loaded 🚀');
