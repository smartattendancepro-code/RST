import {
    getDocs, query, collection, where, doc, getDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;
const auth = window.auth;

let chartsInstances = {};

window.generateDeanAnalytics = async function () {
    const startVal = document.getElementById('reportStartDate').value;
    const endVal = document.getElementById('reportEndDate').value;
    const btn = document.querySelector('.btn-dash-run');

    if (!startVal || !endVal) return showToast("⚠️ حدد الفترة الزمنية", 2000, "#f59e0b");

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري المعالجة...';
    btn.disabled = true;

    try {
        const startDate = new Date(startVal);
        const endDate = new Date(endVal);
        endDate.setHours(23, 59, 59, 999);

        const [attSnap, feedbackSnap, toolsSnap] = await Promise.all([
            getDocs(query(collection(db, "attendance"))),
            getDocs(query(collection(db, "feedback_reports"))),
            getDocs(query(collection(db, "tool_requests")))
        ]);

        let totalAttendance = 0;
        let subjectsCount = {}; 
        let daysCount = { "Saturday": 0, "Sunday": 0, "Monday": 0, "Tuesday": 0, "Wednesday": 0, "Thursday": 0, "Friday": 0 };
        const arDays = { "Saturday": "السبت", "Sunday": "الأحد", "Monday": "الاثنين", "Tuesday": "الثلاثاء", "Wednesday": "الأربعاء", "Thursday": "الخميس", "Friday": "الجمعة" };

        attSnap.forEach(doc => {
            const d = doc.data();
            const parts = d.date.split('/');
            const recDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);

            if (recDate >= startDate && recDate <= endDate) {
                totalAttendance++;

                const sub = d.subject || "غير محدد";
                subjectsCount[sub] = (subjectsCount[sub] || 0) + 1;

                const dayName = recDate.toLocaleDateString('en-US', { weekday: 'long' });
                if (daysCount[dayName] !== undefined) daysCount[dayName]++;
            }
        });

        let doctorRatings = {}; 

        feedbackSnap.forEach(doc => {
            const d = doc.data();
            const recDate = d.timestamp ? d.timestamp.toDate() : new Date();

            if (recDate >= startDate && recDate <= endDate) {
                const drName = d.doctorName || "Unknown";
                if (!doctorRatings[drName]) doctorRatings[drName] = { sum: 0, count: 0 };

                doctorRatings[drName].sum += (d.rating || 0);
                doctorRatings[drName].count++;
            }
        });

        let finalRatings = {};
        let totalAvg = 0;
        let drCount = 0;
        for (let dr in doctorRatings) {
            finalRatings[dr] = (doctorRatings[dr].sum / doctorRatings[dr].count).toFixed(1);
            totalAvg += parseFloat(finalRatings[dr]);
            drCount++;
        }
        const globalAvg = drCount > 0 ? (totalAvg / drCount).toFixed(1) : "0.0";

        let toolsCount = {};
        let totalTools = 0;

        toolsSnap.forEach(doc => {
            const d = doc.data();
            const recDate = d.timestamp ? d.timestamp.toDate() : new Date();

            if (recDate >= startDate && recDate <= endDate) {
                const toolName = d.tool_name || "أداة";
                const qty = parseInt(d.quantity || 1);

                toolsCount[toolName] = (toolsCount[toolName] || 0) + qty;
                totalTools += qty;
            }
        });

        document.getElementById('totalAttVal').innerText = totalAttendance;
        document.getElementById('avgRatingVal').innerText = globalAvg + " / 5";
        document.getElementById('totalToolsVal').innerText = totalTools;
        document.getElementById('reportGenDate').innerText = new Date().toLocaleString('ar-EG');

        renderChart('subjectsChart', 'bar', 'حضور الطلاب للمواد', subjectsCount, '#0ea5e9');

        let arDaysData = {};
        for (let enDay in daysCount) arDaysData[arDays[enDay]] = daysCount[enDay];
        renderChart('daysChart', 'line', 'نشاط الحضور اليومي', arDaysData, '#8b5cf6');

        renderChart('ratingsChart', 'bar', 'تقييم الدكاترة (متوسط)', finalRatings, '#f59e0b');
        renderChart('toolsChart', 'doughnut', 'استهلاك الأدوات', toolsCount, ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6366f1']);

    } catch (e) {
        console.error("Analytics Error:", e);
        alert("حدث خطأ أثناء معالجة البيانات");
    } finally {
        btn.innerHTML = 'تحليل <i class="fa-solid fa-bolt"></i>';
        btn.disabled = false;
    }
};


function renderChart(canvasId, type, label, dataObj, color) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const labels = Object.keys(dataObj);
    const dataValues = Object.values(dataObj);

    if (chartsInstances[canvasId]) {
        chartsInstances[canvasId].destroy();
    }

    let bgColors = color;
    if (Array.isArray(color)) {
        bgColors = color;
    } else {
        bgColors = labels.map(() => color);
    }

    chartsInstances[canvasId] = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: dataValues,
                backgroundColor: bgColors,
                borderColor: Array.isArray(color) ? '#fff' : color,
                borderWidth: 1,
                borderRadius: 5,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: type === 'doughnut' },
            },
            scales: type !== 'doughnut' ? {
                y: { beginAtZero: true }
            } : {}
        }
    });
}



window.exportDashboard = async function (type) {
    const element = document.getElementById('dashboardContent');
    const btn = document.querySelector('.dash-actions');

    btn.style.display = 'none';

    try {
        const canvas = await html2canvas(element, { scale: 2 });

        if (type === 'image') {
            const link = document.createElement('a');
            link.download = 'تقرير_الكلية_الشامل.png';
            link.href = canvas.toDataURL();
            link.click();
        }
        else if (type === 'pdf') {
            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save('تقرير_الكلية_الشامل.pdf');
        }
        showToast("✅ تم التصدير بنجاح", 3000, "#10b981");
    } catch (e) {
        console.error(e);
        alert("خطأ في التصدير");
    } finally {
        btn.style.display = 'flex';
    }
};


window.exportAttendanceSheet = async function (subjectName) {
    if (typeof playClick === 'function') playClick();

    let subjectsConfig = JSON.parse(localStorage.getItem('subjectsData_v4')) || {
        "first_year": ["اساسيات تمريض 1 نظري", "اساسيات تمريض 1 عملي", "تقييم صحى نظرى", "مصطلحات طبية"],
        "second_year": ["تمريض بالغين 1 نظرى", "باثولوجى", "علم الأدوية"]
    };

    let TARGET_LEVEL = "1";
    if (subjectsConfig["first_year"]?.includes(subjectName)) TARGET_LEVEL = "1";
    else if (subjectsConfig["second_year"]?.includes(subjectName)) TARGET_LEVEL = "2";
    else if (subjectsConfig["third_year"]?.includes(subjectName)) TARGET_LEVEL = "3";
    else if (subjectsConfig["fourth_year"]?.includes(subjectName)) TARGET_LEVEL = "4";

    showToast(`⏳ جاري استخراج شيت (حضور + انضباط + تفاصيل) للفرقة ${TARGET_LEVEL}...`, 15000, "#3b82f6");

    try {

        const attendees = window.cachedReportData.filter(s => s.subject === subjectName);
        const attendeesMap = {};

        attendees.forEach(a => {
            let cleanNotes = "منضبط";
            if (a.notes && a.notes !== "منضبط") cleanNotes = a.notes;

            let sessionCounter = a.segment_count || 1;
            let docName = a.doctorName || "غير محدد";

            attendeesMap[a.uniID] = {
                ...a,
                finalStatus: cleanNotes,
                finalDoc: docName,
                finalCount: sessionCounter
            };
        });

        const q = query(collection(db, "students"), where("academic_level", "==", TARGET_LEVEL));
        const querySnapshot = await getDocs(q);

        let finalReport = [];

        querySnapshot.forEach((doc) => {
            const s = doc.data();
            const attendanceRecord = attendeesMap[s.id];

            if (attendanceRecord) {
                let rowStyle = "background-color: #ecfdf5; color: #065f46;"; 
                let statusText = "✅ حاضر";
                let notesText = "منضبط";

                if (attendanceRecord.finalStatus.includes("غير منضبط")) {
                    rowStyle = "background-color: #fee2e2; color: #b91c1c; font-weight:bold;"; // أحمر
                    statusText = "⚠️ حاضر (سلوك)";
                    notesText = "غير منضبط";
                } else if (attendanceRecord.finalStatus.includes("زي")) {
                    rowStyle = "background-color: #ffedd5; color: #c2410c; font-weight:bold;"; // برتقالي
                    statusText = "👕 حاضر (زي)";
                    notesText = "مخالفة زي";
                }

                finalReport.push({
                    name: s.name,
                    id: s.id,
                    level: s.academic_level,
                    status: statusText,
                    notes: notesText,
                    time: attendanceRecord.time,
                    group: attendanceRecord.group,
                    doctor: attendanceRecord.finalDoc,   
                    sessions: attendanceRecord.finalCount, 
                    rowColor: `style='${rowStyle}'`,
                    isPresent: true
                });

                delete attendeesMap[s.id];

            } else {
                finalReport.push({
                    name: s.name,
                    id: s.id,
                    level: s.academic_level,
                    status: "❌ غائب",
                    notes: "-",
                    time: "--:--",
                    group: "--",
                    doctor: "-",
                    sessions: "-",
                    rowColor: "style='color: #64748b;'",
                    isPresent: false
                });
            }
        });

        for (let intruderID in attendeesMap) {
            const intruder = attendeesMap[intruderID];
            finalReport.push({
                name: intruder.name,
                id: intruder.uniID,
                level: "تخلفات",
                status: "✅ حاضر (تخلفات)",
                notes: intruder.finalStatus,
                time: intruder.time,
                group: intruder.group,
                doctor: intruder.finalDoc,     
                sessions: intruder.finalCount, 
                rowColor: "style='background-color: #fef08a; color: #854d0e; font-weight:bold;'", // أصفر
                isPresent: true
            });
        }

        finalReport.sort((a, b) => {
            if (a.isPresent && !b.isPresent) return -1;
            if (!a.isPresent && b.isPresent) return 1;

            return a.id.toString().localeCompare(b.id.toString(), undefined, { numeric: true, sensitivity: 'base' });
        });

        const now = new Date();
        const dayName = now.toLocaleDateString('ar-EG', { weekday: 'long' });
        const dateOnly = now.toLocaleDateString('en-GB');
        const dateStrForFile = dateOnly.replace(/\//g, '-');
        const fileName = `تقرير_${subjectName}_${dateStrForFile}.xls`;

        let tableContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8">
                <style>
                    table { border-collapse: collapse; width: 100%; direction: rtl; font-family: 'Arial', sans-serif; }
                    th { background-color: #1e293b; color: white; border: 1px solid #000; padding: 10px; text-align: center; font-size: 14px; }
                    td { border: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle; font-size: 12px; }
                    .header-info { font-size: 16px; color: #334155; font-weight: normal; margin-top: 5px; }
                </style>
            </head>
            <body>
            
            <div style="text-align:center; padding:15px; margin-bottom:10px;">
                <h2 style="margin:0; color:#0f172a;">كشف تفصيلي لمادة: ${subjectName} (الفرقة ${TARGET_LEVEL})</h2>
                <div class="header-info">
                    اليوم: <b>${dayName}</b> &nbsp;|&nbsp; التاريخ: <b>${dateOnly}</b>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>م</th>
                        <th>اسم الطالب</th>
                        <th>الكود الجامعي</th>
                        <th>حالة الحضور</th>
                        <th>ملاحظات السلوك</th>
                        <th>وقت التسجيل</th>
                        <th>المجموعة</th>
                        
                        <!-- 🔥 الأعمدة الجديدة 🔥 -->
                        <th style="background-color: #0f766e;">عدد الجلسات</th>
                        <th style="background-color: #0369a1;">اسم الدكتور</th>
                    </tr>
                </thead>
                <tbody>
        `;

        finalReport.forEach((row, index) => {
            tableContent += `
                <tr ${row.rowColor}>
                    <td>${index + 1}</td>
                    <td>${row.name}</td>
                    <td style='mso-number-format:"\\@"'>${row.id}</td>
                    <td>${row.status}</td>
                    <td>${row.notes}</td>
                    <td>${row.time}</td>
                    <td>${row.group}</td>
                    
                    <!-- بيانات الأعمدة الجديدة -->
                    <td style="font-weight:bold;">${row.sessions}</td>
                    <td>${row.doctor}</td>
                </tr>
            `;
        });

        tableContent += `</tbody></table></body></html>`;

        if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {

            console.log("📲 Native Mode Detected: Starting Share Process...");

            const { Filesystem, Directory, Encoding } = Capacitor.Plugins.Filesystem;
            const { Share } = Capacitor.Plugins.Share;

            try {
                const base64Data = btoa(unescape(encodeURIComponent(tableContent)));

                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Cache
                });

                console.log("✅ File saved at:", result.uri);

                await Share.share({
                    title: 'تصدير كشف الحضور',
                    text: `إليك كشف حضور مادة ${subjectName}`,
                    url: result.uri,
                    dialogTitle: 'حفظ أو إرسال الملف'
                });

                showToast("✅ تم تجهيز الملف للمشاركة", 3000, "#10b981");

            } catch (nativeError) {
                console.error("Native Export Error:", nativeError);
                downloadWebFile();
            }

        } else {
            downloadWebFile();
        }

        function downloadWebFile() {
            const blob = new Blob([tableContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        if (typeof playSuccess === 'function') playSuccess();
        if (document.getElementById('toastNotification')) document.getElementById('toastNotification').style.display = 'none';

    } catch (error) {
        console.error(error);
        alert("حدث خطأ: " + error.message);
    }
};


window.downloadHistoricalSheet = async function () {
    playClick();

    const level = document.getElementById('archiveLevelSelect').value;
    const subjectName = document.getElementById('archiveSubjectInput').value.trim();
    const rawDate = document.getElementById('historyDateInput').value;
    const isWeekly = document.getElementById('repWeekly').checked; // هل اختار أسبوع؟

    if (!level) { showToast("⚠️ اختر الفرقة", 3000, "#f59e0b"); return; }
    if (!subjectName) { showToast("⚠️ اكتب اسم المادة", 3000, "#f59e0b"); return; }
    if (!rawDate) { showToast("⚠️ اختر التاريخ", 3000, "#f59e0b"); return; }

    const btn = document.querySelector('#attendanceRecordsModal .btn-main');
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التجميع...';
    btn.disabled = true;

    try {
        let datesToSearch = [];

        if (isWeekly) {
            const startDate = new Date(rawDate);
            for (let i = 0; i < 7; i++) {
                const nextDay = new Date(startDate);
                nextDay.setDate(startDate.getDate() + i);

                const dayStr = ('0' + nextDay.getDate()).slice(-2);
                const monthStr = ('0' + (nextDay.getMonth() + 1)).slice(-2);
                const yearStr = nextDay.getFullYear();
                datesToSearch.push(`${dayStr}/${monthStr}/${yearStr}`);
            }
        } else {
            datesToSearch.push(rawDate.split("-").reverse().join("/"));
        }

        console.log("Searching dates:", datesToSearch);

        const attQuery = query(
            collection(db, "attendance"),
            where("subject", "==", subjectName),
            where("date", "in", datesToSearch)
        );

        const attSnap = await getDocs(attQuery);

        if (attSnap.empty) {
            showToast(`❌ لا توجد بيانات لهذه الفترة`, 4000, "#ef4444");
            btn.innerHTML = oldText;
            btn.disabled = false;
            return;
        }

        const recordsMap = {};
        attSnap.forEach(d => {
            const data = d.data();
            const uniqueKey = `${data.id}_${data.date}`;
            recordsMap[uniqueKey] = data;
        });

        const stQuery = query(collection(db, "students"), where("academic_level", "==", level));
        const stSnap = await getDocs(stQuery);

        let csvContent = "\uFEFFالاسم,الكود,التاريخ,الحالة,وقت الدخول\n";

        datesToSearch.forEach(searchDate => {

            stSnap.forEach(doc => {
                const s = doc.data();
                const key = `${s.id}_${searchDate}`;

                if (recordsMap[key]) {
                    const r = recordsMap[key];
                    csvContent += `${s.name},"${s.id}",${searchDate},✅ حاضر,${r.time_str || '-'}\n`;
                } else {
                    csvContent += `${s.name},"${s.id}",${searchDate},❌ غائب,-\n`;
                }
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);

        let fileName = isWeekly
            ? `Report_Week_${rawDate}_${subjectName}.csv`
            : `Report_Day_${rawDate}_${subjectName}.csv`;

        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        playSuccess();
        document.getElementById('attendanceRecordsModal').style.display = 'none';

    } catch (e) {
        console.error("Archive Error:", e);
        showToast("حدث خطأ تقني: " + e.message, 4000, "#ef4444");
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
};

window.exportSubjectToExcel = async function (subjectName) {

    if (!window.cachedReportData || window.cachedReportData.length === 0) {
        alert("لا توجد بيانات متاحة حالياً للتصدير.");
        return;
    }

    const filteredStudents = window.cachedReportData.filter(s => s.subject === subjectName);

    if (filteredStudents.length === 0) {
        alert(`لا يوجد حضور مسجل في مادة: ${subjectName}`);
        return;
    }

    const dataForExcel = filteredStudents.map((student, index) => ({
        "م": index + 1,
        "اسم الطالب": student.name,
        "الكود الجامعي": student.uniID,
        "المجموعة": student.group,
        "وقت التسجيل": student.time,
        "القاعة": student.hall || "غير محدد",
        "كود الجلسة": student.code || "N/A"
    }));

    try {
        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "الحضور");

        worksheet['!dir'] = 'rtl';

        const fileName = `حضور_${subjectName}_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    } catch (error) {
        console.error("Excel Export Error:", error);
        alert("حدث خطأ أثناء إنشاء ملف الإكسل. تأكد من إضافة مكتبة XLSX في ملف HTML.");
    }
};