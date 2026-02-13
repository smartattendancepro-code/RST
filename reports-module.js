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

    const allSubjects = JSON.parse(localStorage.getItem('subjectsData_v4')) || window.subjectsData || {};
    let TARGET_LEVEL = "1";

    if (allSubjects["first_year"]?.includes(subjectName) || allSubjects["1"]?.includes(subjectName)) TARGET_LEVEL = "1";
    else if (allSubjects["second_year"]?.includes(subjectName) || allSubjects["2"]?.includes(subjectName)) TARGET_LEVEL = "2";
    else if (allSubjects["third_year"]?.includes(subjectName) || allSubjects["3"]?.includes(subjectName)) TARGET_LEVEL = "3";
    else if (allSubjects["fourth_year"]?.includes(subjectName) || allSubjects["4"]?.includes(subjectName)) TARGET_LEVEL = "4";

    const levelNames = {
        "1": "الفرقة الأولى",
        "2": "الفرقة الثانية",
        "3": "الفرقة الثالثة",
        "4": "الفرقة الرابعة"
    };
    const displayLevelName = levelNames[TARGET_LEVEL] || `الفرقة ${TARGET_LEVEL}`;

    if (!window.cachedReportData || window.cachedReportData.length === 0) {
        alert("⚠️ لا توجد بيانات في التقرير الحالي. يرجى فتح السجل أولاً.");
        return;
    }

    showToast(`⏳ جاري الاتصال بقاعدة البيانات لجلب السجل التراكمي...`, 20000, "#0ea5e9");

    try {
        const attendees = window.cachedReportData.filter(s => s.subject === subjectName);
        const attendeesMap = {};
        const studentIDs = [];

        attendees.forEach(a => {
            const notes = (a.notes || "").toString();
            const hasUnrulyNote = notes.includes("مشاغب") || notes.includes("سلوك") || notes.includes("غير منضبط") || notes.includes("طرد");
            const hasUniformNote = notes.includes("زي") || notes.includes("مخالف") || notes.includes("يونيفورم");

            attendeesMap[a.uniID] = {
                ...a,
                isUnruly: a.isUnruly === true || hasUnrulyNote, 
                isUniformViolation: a.isUniformViolation === true || hasUniformNote, 
                sessionCount: a.segment_count || 1,
                docName: a.doctorName || "غير محدد",
                time: a.time || "--:--",
                group: a.group || "General"
            };
            if (a.uniID && a.uniID !== "---") studentIDs.push(a.uniID);
        });

        const cumulativeStats = {};

        if (studentIDs.length > 0) {
            const chunkSize = 30; 
            const chunks = [];
            for (let i = 0; i < studentIDs.length; i += chunkSize) {
                chunks.push(studentIDs.slice(i, i + chunkSize));
            }

            const promises = chunks.map(async (chunk) => {
                const statsQuery = query(
                    collection(db, "student_stats"),
                    where("studentID", "in", chunk)
                );
                const snapshot = await getDocs(statsQuery);
                snapshot.forEach(doc => {
                    const data = doc.data();
                    cumulativeStats[data.studentID] = {
                        totalUnruly: data.cumulative_unruly || 0,
                        totalUniform: data.cumulative_uniform || 0
                    };
                });
            });

            await Promise.all(promises);
            console.log("✅ تم تحميل السجل التراكمي للطلاب بنجاح");
        }

        const q = query(collection(db, "students"), where("academic_level", "==", TARGET_LEVEL));
        const querySnapshot = await getDocs(q);

        let finalReport = [];

        querySnapshot.forEach((doc) => {
            const s = doc.data();
            const record = attendeesMap[s.id];
            const history = cumulativeStats[s.id] || { totalUnruly: 0, totalUniform: 0 };

            if (record) {
                let statusColor = "#f0fdf4"; 

                let disciplineText = "منضبط";
                let currentTotalUnruly = history.totalUnruly + (record.isUnruly ? 1 : 0);

                if (record.isUnruly) {
                    statusColor = "#fef2f2"; 
                    disciplineText = `⚠️ مشاغب (تراكمي: ${currentTotalUnruly})`;
                } else if (history.totalUnruly > 0) {
                    disciplineText = `منضبط (سابقاً: ${history.totalUnruly})`;
                }

                if (currentTotalUnruly >= 5) {
                    statusColor = "#b91c1c"; 
                    disciplineText = `⛔ تجاوز الحد (${currentTotalUnruly} مخالفات)`;
                }

                let uniformText = "ملتزم";
                let currentTotalUniform = history.totalUniform + (record.isUniformViolation ? 1 : 0);

                if (record.isUniformViolation) {
                    if (statusColor === "#f0fdf4") statusColor = "#fffbeb"; 
                    uniformText = `👕 مخالف (تراكمي: ${currentTotalUniform})`;
                } else if (history.totalUniform > 0) {
                    uniformText = `ملتزم (سابقاً: ${history.totalUniform})`;
                }

                if (currentTotalUniform >= 5) {
                    if (currentTotalUnruly < 5 && !record.isUnruly) statusColor = "#fbbf24";
                    uniformText = `⚠️ تجاوز الحد (${currentTotalUniform} مخالفات)`;
                }

                finalReport.push({
                    name: s.name,
                    id: s.id,
                    status: "✅ حاضر",
                    discipline: disciplineText,
                    uniform: uniformText,
                    type: "نظامي",
                    time: record.time,
                    group: record.group,
                    sessions: record.sessionCount,
                    doctor: record.docName,
                    rowStyle: `style='background-color: ${statusColor}; color: ${statusColor === "#b91c1c" ? "#fff" : "#000"};'`, // النص أبيض لو الخلفية أحمر غامق
                    isPresent: true
                });

                delete attendeesMap[s.id];

            } else {
                finalReport.push({
                    name: s.name,
                    id: s.id,
                    status: "❌ غائب",
                    discipline: history.totalUnruly > 0 ? `(سوابق: ${history.totalUnruly})` : "-",
                    uniform: history.totalUniform > 0 ? `(سوابق: ${history.totalUniform})` : "-",
                    type: "نظامي",
                    time: "--:--",
                    group: "--",
                    sessions: "0",
                    doctor: "-",
                    rowStyle: "style='color: #64748b;'",
                    isPresent: false
                });
            }
        });

        for (let intruderID in attendeesMap) {
            const intruder = attendeesMap[intruderID];
            const history = cumulativeStats[intruder.uniID] || { totalUnruly: 0, totalUniform: 0 };

            let statusColor = "#fff9c4"; 
            let currentTotalUnruly = history.totalUnruly + (intruder.isUnruly ? 1 : 0);
            let currentTotalUniform = history.totalUniform + (intruder.isUniformViolation ? 1 : 0);

            if (intruder.isUnruly) statusColor = "#fef2f2";
            if (currentTotalUnruly >= 5) statusColor = "#b91c1c";

            let disciplineText = intruder.isUnruly ? `⚠️ مشاغب (تراكمي: ${currentTotalUnruly})` : (history.totalUnruly > 0 ? `(سابقاً: ${history.totalUnruly})` : "منضبط");
            let uniformText = intruder.isUniformViolation ? `👕 مخالف (تراكمي: ${currentTotalUniform})` : (history.totalUniform > 0 ? `(سابقاً: ${history.totalUniform})` : "ملتزم");

            if (currentTotalUnruly >= 5) disciplineText = `⛔ تجاوز الحد (${currentTotalUnruly})`;
            if (currentTotalUniform >= 5) uniformText = `⚠️ تجاوز الحد (${currentTotalUniform})`;

            finalReport.push({
                name: intruder.name,
                id: intruder.uniID,
                status: "✅ حاضر",
                discipline: disciplineText,
                uniform: uniformText,
                type: "🔴 تخلفات",
                time: intruder.time,
                group: intruder.group,
                sessions: intruder.sessionCount,
                doctor: intruder.docName,
                rowStyle: `style='background-color: ${statusColor}; color: ${statusColor === "#b91c1c" ? "#fff" : "#000"}; font-weight:bold;'`,
                isPresent: true
            });
        }

        finalReport.sort((a, b) => {
            if (a.isPresent && !b.isPresent) return -1;
            if (!a.isPresent && b.isPresent) return 1;
            return a.id.toString().localeCompare(b.id.toString(), undefined, { numeric: true, sensitivity: 'base' });
        });

        const now = new Date();
        const dateOnly = now.toLocaleDateString('en-GB');
        const fileName = `تقرير_${subjectName}_${dateOnly.replace(/\//g, '-')}.xls`;

        let tableContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8">
                <style>
                    table { border-collapse: collapse; width: 100%; direction: rtl; font-family: 'Arial', sans-serif; }
                    th { color: white; border: 1px solid #000; padding: 12px; text-align: center; font-size: 14px; font-weight: bold; }
                    td { border: 1px solid #000; padding: 8px; text-align: center; vertical-align: middle; font-size: 12px; }
                    .header-info { margin-top: 5px; font-size: 14px; }
                </style>
            </head>
            <body>
            
            <div style="text-align:center; padding:20px;">
                <h2 style="margin:0; color:#1e293b;">جامعة الريادة - كلية التمريض</h2>
                <h3 style="margin:5px 0;">كشف حضور وتتبع سلوك - مادة: ${subjectName}</h3>
                <p class="header-info"><strong>${displayLevelName}</strong> | التاريخ: ${dateOnly}</p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="background-color: #4472c4; width: 50px;">م</th>
                        <th style="background-color: #4472c4; width: 200px;">اسم الطالب</th>
                        <th style="background-color: #4472c4; width: 100px;">الكود الجامعي</th>
                        <th style="background-color: #4472c4; width: 100px;">حالة الحضور</th>
                        
                        <th style="background-color: #c00000; width: 150px;">السلوك (التراكمي)</th>
                        <th style="background-color: #ed7d31; width: 150px;">الزي (التراكمي)</th>
                        <th style="background-color: #5b9bd5; width: 100px;">نوع القيد</th>

                        <th style="background-color: #70ad47; width: 100px;">وقت الدخول</th>
                        <th style="background-color: #70ad47; width: 100px;">المجموعة</th>
                        <th style="background-color: #70ad47; width: 150px;">المحاضر</th>
                        
                        <th style="background-color: #4f46e5; width: 100px;">عدد الفترات</th>
                    </tr>
                </thead>
                <tbody>
        `;

        finalReport.forEach((row, index) => {
            tableContent += `
                <tr ${row.rowStyle}>
                    <td>${index + 1}</td>
                    <td>${row.name}</td>
                    <td style='mso-number-format:"\\@"'>${row.id}</td>
                    <td>${row.status}</td>
                    
                    <td style="font-weight:bold;">${row.discipline}</td>
                    <td>${row.uniform}</td>
                    <td style="font-weight:bold;">${row.type}</td>

                    <td>${row.time}</td>
                    <td>${row.group}</td>
                    <td>${row.doctor}</td>
                    
                    <td style="font-weight:bold;">${row.sessions}</td>
                </tr>
            `;
        });

        tableContent += `</tbody></table></body></html>`;

        const blob = new Blob([tableContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (typeof playSuccess === 'function') playSuccess();

    } catch (error) {
        console.error("Advanced Export Error:", error);
        alert("حدث خطأ أثناء الاتصال بقاعدة البيانات: " + error.message);
    }
};


window.downloadHistoricalSheet = async function () {
    playClick();

    const level = document.getElementById('archiveLevelSelect').value;
    const subjectName = document.getElementById('archiveSubjectInput').value.trim();
    const rawDate = document.getElementById('historyDateInput').value;
    const isWeekly = document.getElementById('repWeekly').checked;

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