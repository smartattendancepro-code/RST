// ============================================================
//  far-system.js  —  نظام الاستخبارات FAR
//  يظهر فقط لمن role == "dean" في faculty_members
// ============================================================

import { getFirestore, collection, getDocs, doc, getDoc }
    from "firebase/firestore";
import { getApp }
    from "firebase/app";
import { getAuth, onAuthStateChanged }
    from "firebase/auth";

// ============================================================
//  تحقق من الصلاحية عند تحميل الصفحة
//  لو role == "dean"  → أظهر زر FAR
//  لو غير كده         → لا تظهر أي حاجة
// ============================================================
(function initFARVisibility() {
    const auth = getAuth(getApp());

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;   // مش مسجل دخول

        try {
            const db = getFirestore(getApp());
            const docSnap = await getDoc(doc(db, "faculty_members", user.uid));

            if (docSnap.exists() && docSnap.data()?.role === "dean") {
                // ✅ عميد — أظهر الزر
                const btn = document.getElementById('farBtn');
                if (btn) btn.style.display = '';
            }
        } catch (e) {
            console.warn('[FAR] role check failed:', e);
        }
    });
})();


// ============================================================
//  فتح / إغلاق المودال
// ============================================================
window.openFARSystem = function () {
    document.getElementById('farModal').style.display = 'flex';
    document.getElementById('farLogBox').innerHTML = 'جاري الاتصال...\n';
    document.getElementById('farStats').style.display = 'none';
    document.getElementById('farResults').innerHTML = '';
    runFARScan();
};

window.closeFARModal = function () {
    document.getElementById('farModal').style.display = 'none';
};

window.farRescan = function () {
    document.getElementById('farLogBox').innerHTML = '';
    document.getElementById('farStats').style.display = 'none';
    document.getElementById('farResults').innerHTML = '';
    runFARScan();
};


// ============================================================
//  LOG
// ============================================================
function farLog(msg, type = '') {
    const box = document.getElementById('farLogBox');
    const color = type === 'ok' ? '#4ae8a0'
        : type === 'warn' ? '#e8c84a'
            : type === 'err' ? '#e84a4a'
                : '#6a7a8a';
    box.innerHTML += `<span style="color:${color}">${msg}\n</span>`;
    box.scrollTop = box.scrollHeight;
}


// ============================================================
//  STEP 1 : جلب كل البيانات من audit_logs
// ============================================================
async function fetchAllRecords(db) {
    const records = [];
    const datesSnap = await getDocs(collection(db, "audit_logs"));
    farLog(`📂 أيام مسجّلة: ${datesSnap.size}`, 'ok');

    for (const dateDoc of datesSnap.docs) {
        const dateKey = dateDoc.id;
        const sessionsSnap = await getDocs(
            collection(db, "audit_logs", dateKey, "sessions")
        );
        for (const sessionDoc of sessionsSnap.docs) {
            const doctorUID = sessionDoc.id;
            const sessionData = sessionDoc.data();
            const studentsSnap = await getDocs(
                collection(db, "audit_logs", dateKey, "sessions", doctorUID, "students")
            );
            for (const studentDoc of studentsSnap.docs) {
                const d = studentDoc.data();
                records.push({
                    studentUID: d.studentUID || studentDoc.id,
                    studentName: d.studentName || "Unknown",
                    studentID: d.studentID || "---",
                    date: d.entry_date || dateKey,
                    doctorName: d.doctorName || sessionData.doctorName || "---",
                    subject: d.subject || sessionData.subject || "---",
                    hall: d.hall || sessionData.hall || "---",
                    fingerprint: d.device?.fingerprint || "no_fingerprint",
                    ipAddress: d.device?.ipAddress || "Hidden",
                });
            }
        }
        farLog(`  ↳ ${dateKey}`, 'ok');
    }
    return records;
}


// ============================================================
//  STEP 2 : خريطة البصمات
// ============================================================
function buildFingerprintMap(records) {
    const map = {};
    for (const rec of records) {
        const fp = rec.fingerprint;
        if (!fp || fp === "no_fingerprint") continue;
        if (!map[fp]) map[fp] = [];
        map[fp].push(rec);
    }
    return map;
}


// ============================================================
//  STEP 3 : تحليل التعارضات
// ============================================================
function analyzeConflicts(map) {
    const conflicts = [], clean = [];

    for (const [fp, entries] of Object.entries(map)) {
        const studentMap = {};
        for (const e of entries) {
            if (!studentMap[e.studentUID]) {
                studentMap[e.studentUID] = {
                    studentUID: e.studentUID,
                    studentName: e.studentName,
                    studentID: e.studentID,
                    usages: []
                };
            }
            studentMap[e.studentUID].usages.push({
                date: e.date,
                ipAddress: e.ipAddress,
                subject: e.subject,
                hall: e.hall,
                doctorName: e.doctorName
            });
        }

        const uniq = Object.values(studentMap);

        // ✅ بصمة لطالب واحد بس
        if (uniq.length === 1) {
            clean.push({ fingerprint: fp, student: uniq[0] });
            continue;
        }

        // 🚨 بصمة مشتركة
        const ips = [...new Set(entries.map(e => e.ipAddress).filter(ip => ip !== "Hidden"))];
        const ipMatch = ips.length === 1;
        const sorted = uniq
            .map(s => ({ ...s, firstUse: [...s.usages].sort((a, b) => a.date.localeCompare(b.date))[0] }))
            .sort((a, b) => a.firstUse.date.localeCompare(b.firstUse.date));

        const orig = sorted[0];
        const later = sorted.slice(1);

        conflicts.push({
            fingerprint: fp,
            verdict: ipMatch ? "HIGH_RISK" : "MEDIUM_RISK",
            ipMatch, allIPs: ips,
            students: uniq,
            lines: later.map(l => ({
                studentName: l.studentName,
                studentID: l.studentID,
                date: l.usages[l.usages.length - 1].date,
                subject: l.usages[l.usages.length - 1].subject,
                hall: l.usages[l.usages.length - 1].hall,
                doctorName: l.usages[l.usages.length - 1].doctorName,
                origName: orig.studentName,
                origID: orig.studentID,
                origDate: orig.firstUse.date,
                ipMatch, allIPs: ips
            }))
        });
    }
    return { conflicts, clean };
}


// ============================================================
//  RENDER
// ============================================================
function renderFARResults({ summary, conflicts, clean }) {
    const s = document.getElementById('farStats');
    s.style.display = 'grid';
    s.innerHTML = `
        <div class="far-stat accent"><div class="far-stat-label">إجمالي السجلات</div><div class="far-stat-val">${summary.total}</div></div>
        <div class="far-stat accent"><div class="far-stat-label">بصمات فريدة</div><div class="far-stat-val">${summary.uniqueFingers}</div></div>
        <div class="far-stat danger"><div class="far-stat-label">خطر عالي</div><div class="far-stat-val">${summary.highRisk}</div></div>
        <div class="far-stat medium"><div class="far-stat-label">خطر متوسط</div><div class="far-stat-val">${summary.mediumRisk}</div></div>
        <div class="far-stat ok"><div class="far-stat-label">نظيف</div><div class="far-stat-val">${summary.clean}</div></div>
    `;

    const res = document.getElementById('farResults');
    res.innerHTML = '';

    if (conflicts.length) {
        res.innerHTML += `
        <div class="far-section-header">
            <span class="far-dot danger-dot"></span>
            <span class="far-section-title">حالات الاشتباه</span>
            <span class="far-badge">${conflicts.length}</span>
        </div>`;

        conflicts.forEach(c => {
            const isHigh = c.verdict === "HIGH_RISK";
            const riskClass = isHigh ? 'card-high' : 'card-medium';
            const riskLabel = isHigh ? 'HIGH RISK' : 'MEDIUM';

            const linesHTML = c.lines.map(line => `
                <div class="far-line">
                    <div class="far-line-summary">
                        ${line.ipMatch
                    ? `🔴 <b>${line.studentName}</b> (${line.studentID}) سجّل ببصمة <b>${line.origName}</b> (${line.origID}) بتاريخ ${line.origDate} — <span style="color:#e84a4a">IP متطابق ← نفس الجهاز</span>`
                    : `🟡 <b>${line.studentName}</b> (${line.studentID}) سجّل ببصمة <b>${line.origName}</b> (${line.origID}) بتاريخ ${line.origDate} — <span style="color:#e8944a">IP مختلف ← جهاز مشترك أو VPN</span>`
                }
                    </div>
                    <div class="far-line-meta">
                        <span>📅 ${line.date}</span>
                        <span>📚 ${line.subject}</span>
                        <span>🏛 ${line.hall}</span>
                        <span>👨‍⚕️ ${line.doctorName}</span>
                    </div>
                    <div class="far-ip-row ${line.ipMatch ? 'ip-match' : 'ip-diff'}">
                        ${line.ipMatch
                    ? `⚠ IP متطابق: ${line.allIPs.join(', ')}`
                    : `~ IP مختلف: ${line.allIPs.join(' | ') || 'مخفي'}`
                }
                    </div>
                </div>
            `).join('');

            res.innerHTML += `
            <div class="far-card ${riskClass}">
                <div class="far-card-header" onclick="this.nextElementSibling.classList.toggle('open')">
                    <div>
                        <span class="far-fp">FP: ${c.fingerprint.substring(0, 20)}...</span>
                        <span class="far-count">${c.students.length} طلاب — نفس البصمة</span>
                    </div>
                    <span class="far-risk-badge ${isHigh ? 'badge-high' : 'badge-medium'}">${riskLabel}</span>
                </div>
                <div class="far-card-body">${linesHTML}</div>
            </div>`;
        });
    }

    if (clean.length) {
        res.innerHTML += `
        <div class="far-section-header" style="margin-top:20px">
            <span class="far-dot ok-dot"></span>
            <span class="far-section-title">بصمات نظيفة</span>
            <span class="far-badge">${clean.length}</span>
        </div>`;
        clean.forEach(item => {
            res.innerHTML += `
            <div class="far-clean-card">
                <span class="far-clean-name">${item.student.studentName}</span>
                <span class="far-clean-id">${item.student.studentID}</span>
                <span class="far-risk-badge badge-ok">CLEAN ✓</span>
            </div>`;
        });
    }
}


// ============================================================
//  MAIN SCAN
// ============================================================
async function runFARScan() {
    const btn = document.getElementById('farScanBtn');
    btn.disabled = true;
    btn.textContent = '⏳ جاري الفحص...';

    try {
        const db = getFirestore(getApp());
        farLog('✅ تم الاتصال بقاعدة البيانات', 'ok');

        farLog('📥 جاري جلب بيانات audit_logs...', 'warn');
        const records = await fetchAllRecords(db);
        farLog(`📦 إجمالي السجلات: ${records.length}`, 'ok');

        if (!records.length) {
            farLog('⚠ لا توجد بيانات', 'warn');
            return;
        }

        farLog('🔍 تحليل البصمات...', 'warn');
        const fpMap = buildFingerprintMap(records);
        farLog(`🗂 بصمات فريدة: ${Object.keys(fpMap).length}`, 'ok');

        const { conflicts, clean } = analyzeConflicts(fpMap);
        farLog(`🚨 اشتباهات: ${conflicts.length}`, conflicts.length ? 'warn' : 'ok');
        farLog(`✅ نظيف: ${clean.length}`, 'ok');
        farLog('─────────────── اكتمل الفحص ✔', 'ok');

        renderFARResults({
            summary: {
                total: records.length,
                uniqueFingers: Object.keys(fpMap).length,
                conflicts: conflicts.length,
                highRisk: conflicts.filter(c => c.verdict === "HIGH_RISK").length,
                mediumRisk: conflicts.filter(c => c.verdict === "MEDIUM_RISK").length,
                clean: clean.length,
            },
            conflicts, clean
        });

    } catch (err) {
        farLog(`❌ خطأ: ${err.message}`, 'err');
        console.error('[FAR]', err);
    } finally {
        btn.disabled = false;
        btn.textContent = '🔄 إعادة الفحص';
    }
}