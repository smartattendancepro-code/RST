
import {
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class AdvancedArchiveManager {

    constructor() {
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
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                font-family: 'Outfit', sans-serif;
                transform: scale(0.95); animation: zoomIn 0.3s forwards;
                position: relative;
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
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }

            .adv-date-row { display: flex; gap: 12px; }

            .adv-btn-primary {
                width: 100%;
                padding: 14px;
                border: none;
                border-radius: 14px;
                background: linear-gradient(135deg, #2563eb, #1d4ed8);
                color: white;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                display: flex; align-items: center; justify-content: center; gap: 10px;
                transition: transform 0.2s, box-shadow 0.2s;
                box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
            }
            .adv-btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3);
            }
            .adv-btn-primary:active { transform: translateY(0); }

            .adv-status {
                margin-top: 16px; font-size: 13px; color: #64748b;
                text-align: center; min-height: 20px; font-weight: 500;
            }

            @keyframes fadeIn { to { opacity: 1; } }
            @keyframes zoomIn { to { transform: scale(1); } }
        `;

        const styleTag = document.createElement('style');
        styleTag.id = styleId;
        styleTag.innerHTML = css;
        document.head.appendChild(styleTag);
    }

    injectModal() {
        const oldModal = document.getElementById('advancedArchiveModal');
        if (oldModal) oldModal.remove();

        const modalHTML = `
        <div id="advancedArchiveModal" class="adv-modal-overlay" style="display:none;">
            <div class="adv-modal-card">
                
                <!-- Header -->
                <div class="adv-header">
                    <div>
                        <div class="adv-title">Attendance Archive</div>
                        <div class="adv-subtitle">Generate advanced Excel reports & Analytics</div>
                    </div>
                    <button id="btnCloseArchive" class="adv-close-btn">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Step 1: Date Range -->
                <div class="adv-input-group">
                    <label class="adv-label"><i class="fa-regular fa-calendar" style="margin-right:5px; color:#64748b;"></i> Date Range</label>
                    <div class="adv-date-row">
                        <input type="date" id="advStartDate" class="adv-input" placeholder="Start Date">
                        <input type="date" id="advEndDate" class="adv-input" placeholder="End Date">
                    </div>
                </div>

                <!-- Step 2: Level & Subject -->
                <div class="adv-input-group">
                    <label class="adv-label"><i class="fa-solid fa-layer-group" style="margin-right:5px; color:#64748b;"></i> Academic Level & Subject</label>
                    <select id="advLevelSelect" class="adv-input" style="margin-bottom: 12px; cursor:pointer;">
                        <option value="" disabled selected>Select Level...</option>
                        <option value="1">Level 1 (First Year)</option>
                        <option value="2">Level 2 (Second Year)</option>
                        <option value="3">Level 3 (Third Year)</option>
                        <option value="4">Level 4 (Fourth Year)</option>
                    </select>

                    <input type="text" id="advSubjectInput" list="advSubjectList" class="adv-input" placeholder="Type Subject Name...">
                    <datalist id="advSubjectList"></datalist>
                </div>

                <!-- Action Button -->
                <button id="btnGenerateExcel" class="adv-btn-primary">
                    <i class="fa-solid fa-file-export"></i>
                    <span>Export Report</span>
                </button>

                <!-- Status Log -->
                <div id="advStatusLog" class="adv-status"></div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    setupListeners() {
        document.getElementById('btnCloseArchive').onclick = () => {
            document.getElementById('advancedArchiveModal').style.display = 'none';
        };

        document.getElementById('advLevelSelect').addEventListener('change', (e) => {
            const level = e.target.value;
            const dataList = document.getElementById('advSubjectList');
            const input = document.getElementById('advSubjectInput');

            dataList.innerHTML = '';
            input.value = '';

            let subjects = [];
            const allSubjects = window.subjectsData || {};

            if (level == "1") subjects = allSubjects["first_year"] || allSubjects["1"];
            else if (level == "2") subjects = allSubjects["second_year"] || allSubjects["2"];
            else if (level == "3") subjects = allSubjects["third_year"] || allSubjects["3"];
            else if (level == "4") subjects = allSubjects["fourth_year"] || allSubjects["4"];

            if (subjects && Array.isArray(subjects)) {
                subjects.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub;
                    dataList.appendChild(opt);
                });
            }
        });

        document.getElementById('btnGenerateExcel').addEventListener('click', () => {
            this.generateSmartReport();
        });
    }

    open() {
        document.getElementById('advancedArchiveModal').style.display = 'flex';
    }

    async generateSmartReport() {
        const db = window.db;
        if (!db) { alert("Error: Database not initialized. Please refresh."); return; }

        // قراءة المدخلات
        const startDateVal = document.getElementById('advStartDate').value;
        const endDateVal = document.getElementById('advEndDate').value;
        const level = document.getElementById('advLevelSelect').value;
        const subject = document.getElementById('advSubjectInput').value;
        const statusLog = document.getElementById('advStatusLog');
        const btn = document.getElementById('btnGenerateExcel');

        // التحقق من صحة البيانات
        if (!startDateVal || !endDateVal || !level || !subject) {
            statusLog.innerHTML = '<span style="color:#ef4444;">⚠️ Please fill in all fields.</span>';
            return;
        }

        const start = new Date(startDateVal);
        const end = new Date(endDateVal);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        if (start > end) {
            statusLog.innerHTML = '<span style="color:#ef4444;">⚠️ Start date cannot be after end date.</span>';
            return;
        }

        // تغيير حالة الزر أثناء التحميل
        const originalBtnText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Processing...</span>';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.8';

        try {
            statusLog.innerText = "Scanning active sessions...";

            // 1. جلب سجلات الحضور للمادة المختارة
            const attendanceQ = query(collection(db, "attendance"), where("subject", "==", subject));
            const attSnap = await getDocs(attendanceQ);

            if (attSnap.empty) {
                throw new Error("No records found for this subject.");
            }

            let activeDatesSet = new Set();
            let attendanceRecords = [];
            let outsiderStudents = {};

            // 2. تصفية السجلات حسب التاريخ
            attSnap.forEach(doc => {
                const record = doc.data();
                const parts = record.date.split('/');
                const recDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);

                if (recDate >= start && recDate <= end) {
                    activeDatesSet.add(record.date);
                    attendanceRecords.push(record);

                    // حفظ الطلاب من خارج الدفعة (Outsiders)
                    if (!outsiderStudents[record.id]) {
                        outsiderStudents[record.id] = {
                            id: record.id,
                            name: record.name,
                            group: record.group || "غير محدد",
                            isOutsider: true
                        };
                    }
                }
            });

            // ترتيب تواريخ المحاضرات زمنياً
            let sortedActiveDates = Array.from(activeDatesSet).sort((a, b) => {
                const da = a.split('/').reverse().join('');
                const db = b.split('/').reverse().join('');
                return da.localeCompare(db);
            });

            if (sortedActiveDates.length === 0) {
                statusLog.innerText = "No sessions found in range.";
                return;
            }

            statusLog.innerText = `Fetching students...`;

            // 3. جلب بيانات الطلاب الأساسية من قاعدة البيانات
            const studentsQ = query(collection(db, "students"), where("academic_level", "==", level));
            const studentsSnap = await getDocs(studentsQ);

            let masterStudentMap = {};

            // تعبئة الخريطة بالطلاب الأساسيين
            studentsSnap.forEach(doc => {
                const s = doc.data();
                // محاولة التقاط اسم الجروب بأكثر من صيغة محتملة
                const rawGroup = s.group || s.group_code || s.groupCode || "غير محدد";

                masterStudentMap[s.id] = {
                    id: s.id,
                    name: s.name,
                    group: rawGroup,
                    status: 'Regular',
                    logs: {},
                    doctorsSeen: new Set(), // لتخزين أسماء الدكاترة الذين حضر لهم
                    presenceCount: 0
                };
            });

            // إضافة الطلاب الخارجيين للخريطة
            for (const [id, studentData] of Object.entries(outsiderStudents)) {
                if (!masterStudentMap[id]) {
                    masterStudentMap[id] = {
                        id: studentData.id,
                        name: studentData.name,
                        group: studentData.group,
                        status: 'Carry-Over',
                        logs: {},
                        doctorsSeen: new Set(),
                        presenceCount: 0
                    };
                }
            }

            statusLog.innerText = "Mapping data...";

            // 4. دمج بيانات الحضور مع الطلاب
            attendanceRecords.forEach(record => {
                if (masterStudentMap[record.id]) {
                    masterStudentMap[record.id].logs[record.date] = true;
                    masterStudentMap[record.id].presenceCount++;

                    // تسجيل اسم الدكتور
                    if (record.doctorName) {
                        masterStudentMap[record.id].doctorsSeen.add(record.doctorName);
                    }

                    // تحديث الجروب من سجل الحضور (لأنه الأدق)
                    if (record.group && record.group !== "General" && record.group !== "UNKNOWN") {
                        masterStudentMap[record.id].group = record.group;
                    }
                }
            });

            statusLog.innerText = "Grouping by Doctor...";

            let studentsArray = Object.values(masterStudentMap);

            // 5. عملية الترتيب (Sorting)
            // الأولوية لاسم الدكتور، ثم اسم الطالب
            studentsArray.sort((a, b) => {
                // نستخدم "ZZZ" للطلاب الذين لم يحضروا أبداً ليظهروا في آخر القائمة
                const docA = Array.from(a.doctorsSeen).sort().join(", ") || "ZZZ_No_Attendance";
                const docB = Array.from(b.doctorsSeen).sort().join(", ") || "ZZZ_No_Attendance";

                // أولاً: حسب الدكتور
                if (docA !== docB) {
                    return docA.localeCompare(docB, 'ar');
                }

                // ثانياً: حسب اسم الطالب أبجدياً
                return a.name.localeCompare(b.name, 'ar');
            });

            const totalLectures = sortedActiveDates.length;
            let finalRows = [];

            // 6. بناء صفوف الإكسيل
            studentsArray.forEach(st => {
                const presenceCount = st.presenceCount;
                const absenceCount = totalLectures - presenceCount; // 🔥 حساب عدد مرات الغياب

                // تحويل قائمة الدكاترة لنص
                const doctorsList = Array.from(st.doctorsSeen).join(", ") || "--";

                // تحديد لون الصف بناءً على نسبة الحضور
                let presencePercentage = totalLectures > 0 ? (presenceCount / totalLectures) * 100 : 0;
                let rowColor = { rgb: "FFFFFF" };
                if (presencePercentage < 50) rowColor = { rgb: "FEE2E2" }; // أحمر فاتح جداً
                else if (presencePercentage < 75) rowColor = { rgb: "FEF3C7" }; // أصفر
                else rowColor = { rgb: "DCFCE7" }; // أخضر فاتح

                // تعريف الستايلات
                const cellStyle = {
                    fill: { fgColor: rowColor },
                    border: {
                        top: { style: "thin", color: { rgb: "CBD5E1" } },
                        bottom: { style: "thin", color: { rgb: "CBD5E1" } },
                        left: { style: "thin", color: { rgb: "CBD5E1" } },
                        right: { style: "thin", color: { rgb: "CBD5E1" } }
                    },
                    alignment: { horizontal: "center", vertical: "center" },
                    font: { name: "Arial", sz: 10 }
                };

                const nameStyle = { ...cellStyle, alignment: { horizontal: "right" } };

                // كائن البيانات للصف الواحد
                let rowData = {
                    "Instructor (Group By)": { v: doctorsList, s: cellStyle }, // 1. الدكتور (للترتيب)
                    "Student ID": { v: st.id, s: cellStyle },                 // 2. الكود
                    "Student Name": { v: st.name, s: nameStyle },              // 3. الاسم
                    "Group": { v: st.group, s: cellStyle },                    // 4. الجروب
                    "Attended": { v: presenceCount, s: cellStyle },            // 5. عدد الحضور
                    "Absence": { v: absenceCount, s: cellStyle },              // 6. 🔥 عدد الغياب (جديد)
                };

                // إضافة أعمدة التواريخ (حاضر / غائب)
                sortedActiveDates.forEach(dateStr => {
                    const isPresent = st.logs[dateStr];
                    const statusText = isPresent ? "حاضر" : "غائب"; // 🔥 النص المطلوب

                    const dayStyle = { ...cellStyle };
                    dayStyle.font = {
                        color: { rgb: isPresent ? "166534" : "EF4444" }, // أخضر للحاضر، أحمر للغائب
                        bold: true
                    };

                    rowData[dateStr] = { v: statusText, s: dayStyle };
                });

                finalRows.push(rowData);
            });

            // 7. إنشاء ملف الإكسيل
            const ws = XLSX.utils.json_to_sheet(finalRows);

            // ضبط عرض الأعمدة
            const wscols = [
                { wch: 25 }, // Instructor
                { wch: 15 }, // ID
                { wch: 30 }, // Name
                { wch: 10 }, // Group
                { wch: 10 }, // Attended
                { wch: 10 }, // Absence (New)
            ];
            // إضافة عرض لأعمدة التواريخ
            sortedActiveDates.forEach(() => wscols.push({ wch: 12 }));
            ws['!cols'] = wscols;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Attendance Report");

            const fileName = `DoctorGrouped_${subject}_${sortedActiveDates.length}Lectures.xlsx`;
            XLSX.writeFile(wb, fileName);

            statusLog.innerHTML = '<span style="color:#10b981;">✅ Report downloaded!</span>';
            if (window.playSuccess) window.playSuccess();

        } catch (error) {
            console.error("Archive Error:", error);
            statusLog.innerHTML = `<span style="color:#ef4444;">❌ Error: ${error.message}</span>`;
        } finally {
            btn.innerHTML = originalBtnText;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        }
    }
}

window.advancedArchiveSystem = new AdvancedArchiveManager();
console.log("Advanced Archive (English Design) Loaded 🚀");