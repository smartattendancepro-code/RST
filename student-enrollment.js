

import { COLLEGE_SUBJECTS, COLLEGE_NAMES } from './config.js';
import {
    collection, doc,
    getDoc, getDocs, addDoc, setDoc, deleteDoc,
    query, where, serverTimestamp,
    onSnapshot, writeBatch, runTransaction, deleteField
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import * as GlobalCache from './GlobalCacheDB.js';


window.enrollmentCache = {
    adminStatus: new Map(),
    collegeSubjects: new Map(),
    customSubjectsByCollege: new Map(),
    subjectMetadataByCollege: new Map(),
    enrollmentMap: new Map(),
    studentsData: new Map(),
    listeners: new Set(),
    isInitialLoadDone: false
};

const cache = window.enrollmentCache;

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function _writeEnrollmentAtomic(enrollmentDocId, metaPayload, isCreate, students, studentIds, indexEntry) {
    const mainBatch = writeBatch(db);
    mainBatch.set(doc(db, "subject_enrollments", enrollmentDocId),
        isCreate ? { ...metaPayload, createdAt: serverTimestamp() } : metaPayload,
        { merge: true });
    mainBatch.set(doc(db, "subject_rosters", enrollmentDocId),
        { students, studentIds, doctorUID: metaPayload.doctorUID, college: metaPayload.college },
        { merge: false });
    await mainBatch.commit();

    GlobalCache.saveRoster(enrollmentDocId, students, studentIds).catch(e =>
        console.warn("⚠️ GlobalCacheDB: failed to persist roster after upload", e)
    );

    const CHUNK = 400;
    for (let i = 0; i < students.length; i += CHUNK) {
        const slice = students.slice(i, i + CHUNK);
        const idxBatch = writeBatch(db);
        slice.forEach(s => {
            idxBatch.set(doc(db, "student_subject_index", s.id), {
                subjects: { [enrollmentDocId]: indexEntry }
            }, { merge: true });
        });
        await idxBatch.commit();
    }
}

(function injectStyles() {
    if (document.getElementById('enrollment-system-styles')) return;
    const style = document.createElement('style');
    style.id = 'enrollment-system-styles';
    style.innerHTML = `
        .en-loading { text-align:center; padding:30px 20px; color:#64748b; font-size:13px; font-weight:600; }
        .en-error { color:#ef4444; text-align:center; padding:30px; }
        .en-empty { text-align:center; padding:40px 20px; color:#94a3b8; }
        .en-year-header { background:linear-gradient(135deg,#7c3aed15,#6d28d915); border:1px solid #7c3aed30; border-radius:10px; padding:8px 14px; margin:16px 0 8px; font-size:12px; font-weight:800; color:#7c3aed; display:flex; align-items:center; gap:8px; }
        .en-card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:14px 16px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:all 0.2s ease; }
        .en-card.enrolled { border-right:4px solid #7c3aed; border-color:#7c3aed30; box-shadow:0 2px 8px rgba(124,58,237,0.08); }
        .en-card-body { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; }
        .en-subject-title { font-size:14px; font-weight:800; color:#1e293b; margin-bottom:6px; line-height:1.4; }
        .en-badges { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .en-badge { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:800; border:1px solid; display:inline-flex; align-items:center; gap:4px; }
        .en-badge-success { background:#f3e8ff; color:#7c3aed; border-color:#e9d5ff; }
        .en-badge-info { background:#e0f2fe; color:#0284c7; border-color:#bae6fd; }
        .en-badge-warning { background:#fef9c3; color:#ca8a04; border-color:#fde68a; }
        .en-badge-neutral { background:#f8fafc; color:#94a3b8; border-color:#e2e8f0; font-weight:600; }
        .en-actions { display:flex; flex-direction:row; flex-wrap:wrap; gap:6px; align-items:center; justify-content:flex-end; width:100%; margin-top:4px; }
        .en-btn { padding:7px 12px; border-radius:10px; font-size:11px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; border:none; transition:transform 0.1s; }
        .en-btn:active { transform:scale(0.96); }
        .en-btn-primary { background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#fff; box-shadow:0 2px 8px rgba(124,58,237,0.25); }
        .en-btn-update { background:linear-gradient(135deg,#f59e0b,#d97706); color:#fff; box-shadow:0 2px 8px rgba(245,158,11,0.25); }
        .en-btn-admin { background:linear-gradient(135deg,#0ea5e9,#0284c7); color:#fff; box-shadow:0 2px 8px rgba(2,132,199,0.3); }
        .en-btn-success { background:linear-gradient(135deg,#10b981,#059669); color:#fff; box-shadow:0 2px 8px rgba(16,185,129,0.3); }
        .en-btn-view { background:#f3e8ff; color:#7c3aed; border:1px solid #e9d5ff; }
        .en-btn-danger { background:#fee2e2; color:#dc2626; border:1px solid #fecaca; }
        .en-student-row { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:10px; }
        .en-avatar { width:36px; height:36px; min-width:36px; background:linear-gradient(135deg,#7c3aed15,#6d28d915); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#7c3aed; font-size:13px; font-weight:800; border:1px solid #7c3aed20; }
        .en-stat-box { background:#f8fafc; border-radius:10px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; border:1px solid #e2e8f0; }
        .en-live-badge { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; color:#10b981; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:20px; padding:3px 10px; }
        .en-live-dot { width:7px; height:7px; border-radius:50%; background:#10b981; animation:en-pulse 1.4s infinite; }
        @keyframes en-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.7); } }
      @media (max-width:480px) {
            .en-card-body { flex-direction:column; }
            .en-actions { justify-content:flex-start; }
            .en-btn { font-size:10px; padding:6px 10px; }
        }
       .en-format-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.6); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; z-index:99999; padding:16px; }
        .en-format-modal { background:#fff; border-radius:20px; max-width:440px; width:100%; max-height:88vh; overflow-y:auto; box-shadow:0 25px 60px rgba(124,58,237,0.25); }
       .en-format-modal-header { display:flex; align-items:flex-start; gap:12px; padding:18px 18px 16px; background:linear-gradient(135deg,#7c3aed12,#6d28d908); border-bottom:1px solid #f1f5f9; }
        .en-format-modal-icon { width:44px; height:44px; min-width:44px; border-radius:14px; background:linear-gradient(135deg,#10b981,#059669); display:flex; align-items:center; justify-content:center; color:#fff; font-size:19px; box-shadow:0 4px 12px rgba(16,185,129,0.35); }
        .en-format-modal-header-text { flex:1; min-width:0; }
        .en-format-modal-title { font-size:15px; font-weight:800; color:#1e293b; }
        .en-format-modal-title-en { font-size:11px; color:#94a3b8; font-weight:700; direction:ltr; margin-top:1px; }
        .en-format-modal-close { flex-shrink:0; background:#fff; border:1px solid #e2e8f0; border-radius:10px; width:30px; height:30px; cursor:pointer; color:#64748b; box-shadow:0 1px 3px rgba(0,0,0,0.06); }
        .en-format-modal-body { padding:18px 20px; }
        .en-format-modal-desc { font-size:13px; font-weight:800; color:#334155; margin:0 0 2px; }
        .en-format-modal-desc-en { font-size:11px; color:#94a3b8; font-weight:600; direction:ltr; margin:0 0 14px; }
        .en-format-sample-table { width:100%; border-collapse:collapse; margin-bottom:16px; border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(124,58,237,0.12); }
        .en-format-sample-table th { background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#fff; font-size:11px; padding:8px; text-align:center; }
        .en-format-sample-table td { font-size:12px; padding:8px; border-top:1px solid #f1f5f9; color:#334155; text-align:center; background:#fff; }
        .en-format-sample-table tr:first-child td { font-weight:800; background:#f3e8ff; color:#7c3aed; }
        .en-format-rule-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .en-format-rule-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px; display:flex; align-items:center; gap:8px; }
        .en-format-rule-card.full { grid-column:1 / -1; }
        .en-format-rule-icon { width:30px; height:30px; min-width:30px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:13px; color:#fff; }
        .en-format-rule-icon.purple { background:linear-gradient(135deg,#7c3aed,#6d28d9); }
        .en-format-rule-icon.blue { background:linear-gradient(135deg,#0ea5e9,#0284c7); }
        .en-format-rule-icon.red { background:linear-gradient(135deg,#ef4444,#dc2626); }
        .en-format-rule-icon.amber { background:linear-gradient(135deg,#f59e0b,#d97706); }
        .en-format-rule-text-ar { font-size:11.5px; font-weight:800; color:#334155; line-height:1.4; }
        .en-format-rule-text-en { font-size:10px; color:#94a3b8; font-weight:600; direction:ltr; line-height:1.3; }
        .en-format-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 20px 18px; border-top:1px solid #f1f5f9; }
        @media (max-width:480px) {
            .en-format-modal { max-width:100%; }
            .en-format-rule-grid { grid-template-columns:1fr; }
        }
    `;
    document.head.appendChild(style);
})();

let pendingExcelUploadContext = null;

function ensureFormatGuideModal() {
    if (document.getElementById('excelFormatGuideModal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'excelFormatGuideModal';
    overlay.className = 'en-format-modal-overlay';
    overlay.style.display = 'none';
    overlay.onclick = function (e) { if (e.target === overlay) window.closeUploadGuideModal(); };
    overlay.innerHTML = `
        <div class="en-format-modal" onclick="event.stopPropagation()">
          <div class="en-format-modal-header">
                <div class="en-format-modal-icon"><i class="fa-solid fa-file-excel"></i></div>
                <div class="en-format-modal-header-text">
                    <div class="en-format-modal-title">صيغة ملف الإكسيل المطلوبة</div>
                    <div class="en-format-modal-title-en">Required Excel File Format</div>
                </div>
                <button type="button" class="en-format-modal-close" onclick="closeUploadGuideModal()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="en-format-modal-body">
                <p class="en-format-modal-desc">يجب أن يحتوي الملف على عمودين فقط بهذا الترتيب:</p>
                <p class="en-format-modal-desc-en">The file must contain exactly two columns, in this order:</p>
                <table class="en-format-sample-table">
                    <thead><tr><th>A</th><th>B</th></tr></thead>
                    <tbody>
                        <tr><td>الكود / ID</td><td>الاسم / Name</td></tr>
                        <tr><td>2021001</td><td>أحمد محمد علي</td></tr>
                        <tr><td>2021002</td><td>سارة خالد إبراهيم</td></tr>
                    </tbody>
                </table>
                <div class="en-format-rule-grid">
                    <div class="en-format-rule-card">
                        <div class="en-format-rule-icon purple"><i class="fa-solid fa-hashtag"></i></div>
                        <div>
                            <div class="en-format-rule-text-ar">العمود الأول: الكود</div>
                            <div class="en-format-rule-text-en">First column: ID</div>
                        </div>
                    </div>
                    <div class="en-format-rule-card">
                        <div class="en-format-rule-icon blue"><i class="fa-solid fa-user"></i></div>
                        <div>
                            <div class="en-format-rule-text-ar">العمود الثاني: الاسم</div>
                            <div class="en-format-rule-text-en">Second column: Name</div>
                        </div>
                    </div>
                    <div class="en-format-rule-card full">
                        <div class="en-format-rule-icon red"><i class="fa-solid fa-ban"></i></div>
                        <div>
                            <div class="en-format-rule-text-ar">عمودان فقط — لا تُضف أي عمود آخر</div>
                            <div class="en-format-rule-text-en">Two columns only — no extra columns</div>
                        </div>
                    </div>
                    <div class="en-format-rule-card full">
                        <div class="en-format-rule-icon amber"><i class="fa-solid fa-forward"></i></div>
                        <div>
                            <div class="en-format-rule-text-ar">السطر الأول (العناوين) يُتجاهل تلقائيًا</div>
                            <div class="en-format-rule-text-en">The first row/header is ignored automatically</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="en-format-modal-footer">
                <button type="button" class="en-btn en-btn-view" onclick="closeUploadGuideModal()">إلغاء</button>
                <button type="button" class="en-btn en-btn-primary" onclick="confirmUploadGuideAndPickFile()">
                    <i class="fa-solid fa-check"></i> فهمت، اختيار الملف
                </button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const globalInput = document.createElement('input');
    globalInput.type = 'file';
    globalInput.id = 'globalExcelUploadInput';
    globalInput.accept = '.xlsx,.xls';
    globalInput.style.display = 'none';
    globalInput.addEventListener('change', function () {
        if (!pendingExcelUploadContext) return;
        const { subjectName, isAdmin } = pendingExcelUploadContext;
        pendingExcelUploadContext = null;
        if (isAdmin) {
            window.handleAdminSharedExcelUpload(globalInput, subjectName);
        } else {
            window.handleSubjectExcelUpload(globalInput, subjectName);
        }
    });
    document.body.appendChild(globalInput);
}

window.openUploadGuide = function (subjectName, isAdmin) {
    ensureFormatGuideModal();
    pendingExcelUploadContext = { subjectName, isAdmin: !!isAdmin };
    document.getElementById('excelFormatGuideModal').style.display = 'flex';
};

window.closeUploadGuideModal = function () {
    pendingExcelUploadContext = null;
    const modal = document.getElementById('excelFormatGuideModal');
    if (modal) modal.style.display = 'none';
};

window.confirmUploadGuideAndPickFile = function () {
    const modal = document.getElementById('excelFormatGuideModal');
    if (modal) modal.style.display = 'none';
    const input = document.getElementById('globalExcelUploadInput');
    if (input) input.click();
};

window.preFetchEnrollments = async function () {
    const user = window.auth?.currentUser;
    if (!user || window.enrollmentCache.isInitialLoadDone) return;

    try {
        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        if (facSnap.exists()) {
            const facData = facSnap.data();
            const { college, fullName = "" } = facData;

            GlobalCache.saveFacultyProfile({
                uid: user.uid,
                college: college || "",
                fullName,
                isAdminDoctor: facData.isAdminDoctor === true
            }).catch(e => console.warn("⚠️ GlobalCacheDB: failed to persist faculty profile", e));
            localStorage.setItem(`cached_profile_data_${user.uid}`, JSON.stringify({ college: college || "" }));



            await attachRealtimeListener(college, user.uid, fullName);
            window.enrollmentCache.isInitialLoadDone = true;
            console.log("⚡ Enrollment Engine Started in Background");
        }
    } catch (e) { console.warn("Pre-fetch failed", e); }
};
async function getAdminStatus(uid) {
    if (cache.adminStatus.has(uid)) return cache.adminStatus.get(uid);

    try {
        const cachedProfile = await GlobalCache.getFacultyProfile(uid);
        if (cachedProfile) {
            cache.adminStatus.set(uid, cachedProfile.isAdminDoctor === true);
            return cachedProfile.isAdminDoctor === true;
        }
    } catch (e) { console.warn("⚠️ GlobalCacheDB: profile read failed", e); }

    try {
        const snap = await getDoc(doc(db, "faculty_members", uid));
        const isAdmin = snap.exists() && snap.data().isAdminDoctor === true;
        cache.adminStatus.set(uid, isAdmin);

        if (snap.exists()) {
            const d = snap.data();
            GlobalCache.saveFacultyProfile({
                uid, college: d.college || "", fullName: d.fullName || "",
                isAdminDoctor: d.isAdminDoctor === true
            }).catch(() => { });
            localStorage.setItem(`cached_profile_data_${uid}`, JSON.stringify({ college: d.college || "" }));

        }

        return isAdmin;
    } catch (err) {
        console.error("Admin Check Error:", err);
        return false;
    }
}

function getSubjectMeta(college, subjectName) {
    const map = cache.subjectMetadataMapByCollege?.get(college);
    return map?.get(subjectName) || {};
}

function getCollegeSubjects(college) {
    const staticSubjects = COLLEGE_SUBJECTS[college] || {};
    const customList = cache.customSubjectsByCollege.get(college) || [];

    const merged = {};
    Object.keys(staticSubjects).forEach(year => {
        merged[year] = staticSubjects[year].map(name => ({ name, isCustom: false }));
    });
    customList.forEach(c => {
        if (!merged[c.year]) merged[c.year] = [];
        merged[c.year].push({ name: c.subjectName, isCustom: true, customDocId: c.docId });
    });
    return merged;
}

function detachAllListeners() {
    cache.listeners.forEach(unsub => unsub());
    cache.listeners.clear();
}

let listenerCleanupTimer = null;

function scheduleListenerCleanup() {
    if (listenerCleanupTimer) clearTimeout(listenerCleanupTimer);
    listenerCleanupTimer = setTimeout(() => {
        detachAllListeners();
        cache.isInitialLoadDone = false;
        console.log("🧹 تم قفل الـ listeners بعد فترة عدم نشاط");
    }, 20 * 60 * 1000); // 20 دقيقة
}

function cancelListenerCleanup() {
    if (listenerCleanupTimer) {
        clearTimeout(listenerCleanupTimer);
        listenerCleanupTimer = null;
    }
}

function buildMapFromCachedRecords(records, doctorUID, isAdmin) {
    const map = {};
    if (isAdmin) {
        records.forEach(r => {
            if (!r.subjectName) return;
            if (!map[r.subjectName] || r.doctorUID === doctorUID) {
                map[r.subjectName] = {
                    docId: r.docId,
                    studentCount: r.studentCount || 0,
                    isShared: r.sharedWithAll === true,
                    isOpen: r.isOpenForSelfEnrollment === true,
                    ownerUID: r.doctorUID || "",
                    sisCode: r.sisCode || "",
                    subjectCode: r.subjectCode || "",
                    subjectHours: r.subjectHours || ""
                };
            }
        });
    } else {
        records.filter(r => r.doctorUID === doctorUID && !r.sharedWithAll).forEach(r => {
            if (!r.subjectName) return;
            map[r.subjectName] = {
                docId: r.docId,
                studentCount: r.studentCount || 0,
                isShared: false,
                isOpen: r.isOpenForSelfEnrollment === true,
                ownerUID: doctorUID,
                sisCode: r.sisCode || "",
                subjectCode: r.subjectCode || "",
                subjectHours: r.subjectHours || ""
            };
        });
        records.filter(r => r.sharedWithAll === true).forEach(r => {
            if (r.subjectName && !map[r.subjectName]) {
                map[r.subjectName] = {
                    docId: r.docId,
                    studentCount: r.studentCount || 0,
                    isShared: true,
                    isOpen: r.isOpenForSelfEnrollment === true,
                    ownerUID: r.doctorUID || "",
                    sisCode: r.sisCode || "",
                    subjectCode: r.subjectCode || "",
                    subjectHours: r.subjectHours || ""
                };
            }
        });
    }
    return map;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

async function tryLoadFromIndexedDB(doctorUID) {
    try {
        const profile = await GlobalCache.getFacultyProfile(doctorUID);
        if (!profile || !profile.college) return null;

        const isFresh = (Date.now() - (profile.updatedAt || 0)) < CACHE_TTL_MS;
        const isAdmin = profile.isAdminDoctor === true;

        let allRecords;
        if (!isAdmin) {
            const ownRecords = await GlobalCache.getEnrollmentsByDoctor(doctorUID);
            const collegeRecords = await GlobalCache.getEnrollmentsByCollege(profile.college);
            const shared = collegeRecords.filter(r => r.sharedWithAll === true);
            const ownIds = new Set(ownRecords.map(r => r.docId));
            allRecords = [...ownRecords, ...shared.filter(r => !ownIds.has(r.docId))];
        } else {
            allRecords = await GlobalCache.getEnrollmentsByCollege(profile.college);
        }

        if (allRecords.length === 0) return null;

        const enrolledMap = buildMapFromCachedRecords(allRecords, doctorUID, isAdmin);


        return { college: profile.college, isAdmin, enrolledMap, isFresh };
    } catch (e) {
        console.warn("⚠️ GlobalCacheDB: tryLoadFromIndexedDB failed", e);
        return null;
    }
}

window.openSubjectEnrollmentModal = async function () {
    const modal = document.getElementById('subjectEnrollmentModal');
    if (!modal) return;

    modal.style.display = 'flex';
    cancelListenerCleanup();


    const user = window.auth?.currentUser;
    if (!user) {
        showToast?.("⚠️ يرجى تسجيل الدخول أولاً", 3000, "#f59e0b");
        modal.style.display = 'none';
        return;
    }

    const container = document.getElementById('enrollmentListContainer');
    const collegeSelector = document.getElementById('collegeSelectorSection');
    const cache = window.enrollmentCache;

    // 1. 🚀 الكاش في الذاكرة (الأسرع - 0ms)
    if (cache.isInitialLoadDone && cache.enrollmentMap.has(user.uid)) {
        console.log("⚡ [Instant Load] Rendering from Memory Cache...");

        const enrolledMap = cache.enrollmentMap.get(user.uid);
        const isAdmin = cache.adminStatus.get(user.uid) || false;
        let college = "";
        const cachedProfile = localStorage.getItem(`cached_profile_data_${user.uid}`);
        if (cachedProfile) {
            college = JSON.parse(cachedProfile).college;
        }

        if (college) {
            if (collegeSelector) collegeSelector.style.display = 'none';
            renderFullList(container, college, user.uid, enrolledMap, isAdmin);
            return;
        }
    }

    if (collegeSelector) collegeSelector.style.display = 'none';
    const dbCache = await tryLoadFromIndexedDB(user.uid);
    if (dbCache) {
        console.log("⚡ [IndexedDB Load] Rendering from local cache...");
        renderFullList(container, dbCache.college, user.uid, dbCache.enrolledMap, dbCache.isAdmin);
        cache.adminStatus.set(user.uid, dbCache.isAdmin);
        cache.enrollmentMap.set(user.uid, dbCache.enrolledMap);

        if (!dbCache.isFresh || cache.listeners.size === 0) {
            attachRealtimeListener(dbCache.college, user.uid, "").then(() => {
                cache.isInitialLoadDone = true;
            }).catch(e => console.warn("Background sync failed", e));
        } else {
            cache.isInitialLoadDone = true;
        }
        return;
    }

    // 3. 🐢 آخر حل: قراءة من Firebase مباشرة
    container.innerHTML = loadingHTML("جاري مزامنة المواد المسجلة...");

    try {
        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));

        if (!facSnap.exists()) {
            showToast?.("❌ لم يتم العثور على بيانات حسابك", 3000, "#ef4444");
            modal.style.display = 'none';
            return;
        }

        const data = facSnap.data();
        const college = data.college;
        const fullName = data.fullName || "";
        const isAdmin = data.isAdminDoctor === true;

        cache.adminStatus.set(user.uid, isAdmin);

        GlobalCache.saveFacultyProfile({
            uid: user.uid, college: college || "", fullName, isAdminDoctor: isAdmin
        }).catch(() => { });
        localStorage.setItem(`cached_profile_data_${user.uid}`, JSON.stringify({ college: college || "" }));



        if (!college) {
            if (collegeSelector) collegeSelector.style.display = 'block';
            container.innerHTML = `<div class="en-empty">يرجى اختيار الكلية لبدء إدارة المواد</div>`;
        } else {
            await attachRealtimeListener(college, user.uid, fullName);
            cache.isInitialLoadDone = true;
        }
    } catch (e) {
        console.error("Critical Error in Enrollment Open:", e);
        container.innerHTML = errorHTML("عذراً، فشل تحميل البيانات. تأكد من جودة الإنترنت.");
    }
};

window.closeSubjectEnrollmentModal = function () {
    const modal = document.getElementById('subjectEnrollmentModal');
    if (modal) modal.style.display = 'none';
    scheduleListenerCleanup();
};

window.closeEnrolledStudentsModal = function () {
    const modal = document.getElementById('enrolledStudentsViewModal');
    if (modal) modal.style.display = 'none';
    window._enrolledStudentsCache = null;
};

window.saveAndLoadCollege = async function () {
    const select = document.getElementById('enrollmentCollegeSelect');
    if (!select?.value) {
        showToast?.("⚠️ يرجى اختيار الكلية أولاً", 3000, "#f59e0b");
        return;
    }

    const college = select.value;
    const user = window.auth?.currentUser;
    if (!user) return;

    const btn = document.getElementById('btnSaveCollege');
    const originalHTML = btn?.innerHTML ?? '';
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الحفظ...';
        btn.disabled = true;
    }

    try {
        await setDoc(doc(db, "faculty_members", user.uid), { college }, { merge: true });
        const section = document.getElementById('collegeSelectorSection');
        if (section) section.style.display = 'none';

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const doctorName = facSnap.exists() ? (facSnap.data().fullName || "") : "";

        await attachRealtimeListener(college, user.uid, doctorName);
        showToast?.("✅ تم حفظ الكلية بنجاح", 2000, "#10b981");
    } catch (e) {
        console.error("saveAndLoadCollege:", e);
        showToast?.("❌ حدث خطأ أثناء الحفظ", 3000, "#ef4444");
    } finally {
        if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
    }
};

const renderFullList = (container, college, doctorUID, enrolledMap, isAdmin) => {
    const subjects = getCollegeSubjects(college);
    const allSubjects = Object.entries(subjects).flatMap(([year, items]) =>
        items.map(item => ({ name: item.name, year, isCustom: item.isCustom, customDocId: item.customDocId }))
    );

    if (allSubjects.length === 0) {
        container.innerHTML = `<div class="en-empty"><i class="fa-solid fa-book-open" style="font-size:40px;margin-bottom:15px;display:block;"></i><div style="font-weight:bold;">لا توجد مواد مضافة لهذه الكلية بعد</div></div>`;
        return;
    }

    const yearLabels = {
        first_year: "الفرقة الأولى", second_year: "الفرقة الثانية",
        third_year: "الفرقة الثالثة", fourth_year: "الفرقة الرابعة",
        fifth_year: "الفرقة الخامسة"
    };

    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;">
        ${isAdmin ? `<button type="button" class="en-btn en-btn-success" onclick="openAddSubjectModal('${college}')"><i class="fa-solid fa-plus"></i> إضافة مادة جديدة</button>` : `<span></span>`}
        <span class="en-live-badge"><span class="en-live-dot"></span> تحديث لحظي مفعّل</span>
    </div>
    <div style="position:relative; margin-bottom:14px;">
        <i class="fa-solid fa-magnifying-glass" style="position:absolute; top:50%; right:14px; transform:translateY(-50%); color:#94a3b8; font-size:13px;"></i>
        <input type="text" id="subjectSearchInput" placeholder="ابحث عن مادة..." oninput="filterSubjectCards(this.value)"
            style="width:100%; padding:10px 40px 10px 14px; border-radius:12px; border:1px solid #e2e8f0; font-size:13px; font-weight:700; color:#334155; outline:none; box-sizing:border-box;" />
    </div>`;
    let lastYear = '';

    allSubjects.forEach(({ name: subjectName, year, isCustom, customDocId }) => {
        if (year !== lastYear) {
            lastYear = year;
            html += `<div class="en-year-header"><i class="fa-solid fa-layer-group"></i>${yearLabels[year] || year}</div>`;
        }

        const enrolled = enrolledMap[subjectName];
        const isEnrolled = !!enrolled;
        const subEscaped = subjectName.replace(/'/g, "\\'");
        const currentCode = enrolled?.sisCode || "";
        const subjectMeta = getSubjectMeta(college, subjectName);
        const currentSubjectCode = subjectMeta.subjectCode || "";
        const currentHours = subjectMeta.subjectHours || "";

        html += `
                <div class="en-card ${isEnrolled ? 'enrolled' : ''}" data-subject="${subjectName}" data-custom-doc-id="${customDocId || ''}">
    <div class="en-card-body">
        <div style="flex:1;">
            <div class="en-subject-title">${escapeHtml(subjectName)}</div>
${isEnrolled ? `
                <div class="en-badges">
<span class="en-badge en-badge-success"><i class="fa-solid fa-check-circle"></i> مسجلة</span>
                                <span class="en-badge en-badge-info"><i class="fa-solid fa-users"></i> ${enrolled.studentCount} طالب</span>
                                ${enrolled.isShared ? `<span class="en-badge en-badge-warning"><i class="fa-solid fa-share-nodes"></i> مشترك</span>` : ''}
                                ${enrolled.isOpen ? `<span class="en-badge" style="background:#ecfdf5; color:#10b981; border-color:#a7f3d0;"><i class="fa-solid fa-door-open"></i> متاح للطلاب</span>` : ''}
                            </div>
                ${isAdmin ? `
                <div style="display:flex; align-items:center; gap:8px; margin-top:10px;">
                   <input 
    type="text" 
    id="sisCode_${subEscaped}"
    placeholder="كود SIS"
    value="${currentCode}"
    style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentCode ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentCode ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentCode ? '#f0fdf4' : '#fff'};"
/>
                  <button 
                        class="en-btn en-btn-primary" 
                        onclick="saveSisCode('${subEscaped}','${enrolled?.docId || ''}')">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                    <input 
    type="text" 
    id="subjectCode_${subEscaped}"
    placeholder="كود المادة"
    value="${currentSubjectCode}"
    style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentSubjectCode ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentSubjectCode ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentSubjectCode ? '#f0fdf4' : '#fff'};"
/>
                   <button 
                        class="en-btn en-btn-primary" 
                        onclick="saveSubjectCode('${subEscaped}','${college}')">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                    <input 
    type="number" 
    id="hours_${subEscaped}"
    placeholder="عدد الساعات"
    value="${currentHours}"
    min="0"
    style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentHours ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentHours ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentHours ? '#f0fdf4' : '#fff'};"
/>
                    <button 
                        class="en-btn en-btn-primary" 
                        onclick="saveSubjectHours('${subEscaped}','${college}')">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                </div>` : ''}` : `
                <span class="en-badge en-badge-neutral"><i class="fa-solid fa-minus-circle"></i> لم تُسجَّل بعد</span>
                ${isAdmin ? `
                <div style="display:flex; align-items:center; gap:8px; margin-top:10px;">
                    <input 
    type="text" 
    id="sisCode_${subEscaped}"
    placeholder="كود SIS"
    value="${currentCode}"
    style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentCode ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentCode ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentCode ? '#f0fdf4' : '#fff'};"
/>
                    <button 
                        class="en-btn en-btn-primary" 
                        onclick="saveSisCode('${subEscaped}','')">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                    <input 
    type="text" 
    id="subjectCode_${subEscaped}"
    placeholder="كود المادة"
    value="${currentSubjectCode}"
    style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentSubjectCode ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentSubjectCode ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentSubjectCode ? '#f0fdf4' : '#fff'};"
/>
                    <button 
                        class="en-btn en-btn-primary" 
                        onclick="saveSubjectCode('${subEscaped}','${college}')">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                    <input 
    type="number" 
    id="hours_${subEscaped}"
    placeholder="عدد الساعات"
    value="${currentHours}"
    min="0"
    style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentHours ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentHours ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentHours ? '#f0fdf4' : '#fff'};"
/>
                    <button 
                        class="en-btn en-btn-primary" 
                        onclick="saveSubjectHours('${subEscaped}','${college}')">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                </div>` : ''}`}
        </div>
      <div class="en-actions">
            <button type="button" class="en-btn ${isEnrolled ? 'en-btn-update' : 'en-btn-primary'}" onclick="openUploadGuide('${subEscaped}', false)">
                <i class="fa-solid fa-file-excel"></i>${isEnrolled ? 'تحديث' : 'رفع قائمة'}
            </button>
           ${isAdmin ? `
                                <button type="button" class="en-btn en-btn-admin" onclick="openUploadGuide('${subEscaped}', true)">
                                    <i class="fa-solid fa-globe"></i> رفع مشترك
                                </button>
                                <button type="button" class="en-btn ${enrolled?.isOpen ? 'en-btn-danger' : 'en-btn-success'}" onclick="toggleSelfEnrollment('${subEscaped}', ${enrolled?.isOpen ? 'true' : 'false'}, '${enrolled?.docId || ''}')">
                                    <i class="fa-solid ${enrolled?.isOpen ? 'fa-lock' : 'fa-door-open'}"></i> ${enrolled?.isOpen ? 'قفل التسجيل' : 'إتاحة للطلاب'}
                                </button>` : ''}
            ${isEnrolled ? `
                <button class="en-btn en-btn-view" onclick="viewEnrolledStudents('${subEscaped}','${enrolled.docId}')">
                    <i class="fa-solid fa-eye"></i> عرض
                </button>` : ''}
${isAdmin && isEnrolled ? `
                <button class="en-btn en-btn-danger" onclick="adminDeleteEnrollment('${enrolled.docId}','${subEscaped}')">
                    <i class="fa-solid fa-trash"></i> حذف
                </button>` : ''}
            ${isAdmin && isCustom ? `
                <button class="en-btn en-btn-danger" onclick="deleteCustomSubject('${customDocId}', '${subEscaped}')">
                    <i class="fa-solid fa-triangle-exclamation"></i> حذف المادة نهائيًا
                </button>` : ''}
        </div>
    </div>
</div>`;
    });

    container.innerHTML = html;
    cache.enrollmentMap.set(doctorUID, enrolledMap);
};
const updateListDynamically = (container, college, doctorUID, newMap, isAdmin) => {
    const oldMap = cache.enrollmentMap.get(doctorUID) || {};
    const cards = container.querySelectorAll('.en-card');

    cards.forEach(card => {
        const subjectName = card.dataset.subject;
        const customDocId = card.dataset.customDocId || '';
        const isCustom = !!customDocId;
        const oldEnrolled = oldMap[subjectName];
        const newEnrolled = newMap[subjectName];

        if ((oldEnrolled && !newEnrolled) || (!oldEnrolled && newEnrolled) ||
            (oldEnrolled && newEnrolled && (oldEnrolled.studentCount !== newEnrolled.studentCount || oldEnrolled.isShared !== newEnrolled.isShared || oldEnrolled.isOpen !== newEnrolled.isOpen))) {

            const year = card.previousElementSibling?.classList.contains('en-year-header') ? card.previousElementSibling.innerText : '';
            const subEscaped = subjectName.replace(/'/g, "\\'");
            const currentCode = newEnrolled?.sisCode || "";
            const subjectMeta = getSubjectMeta(college, subjectName);
            const currentSubjectCode = subjectMeta.subjectCode || "";
            const currentHours = subjectMeta.subjectHours || "";

            let newHtml = `
                    <div class="en-card ${newEnrolled ? 'enrolled' : ''}" data-subject="${subjectName}" data-custom-doc-id="${customDocId}">
                        <div class="en-card-body">
                            <div style="flex:1;">
                                <div class="en-subject-title">${escapeHtml(subjectName)}</div>
${newEnrolled ? `
                                    <div class="en-badges">
                                        <span class="en-badge en-badge-success"><i class="fa-solid fa-check-circle"></i> مسجلة</span>
                                        <span class="en-badge en-badge-info"><i class="fa-solid fa-users"></i> ${newEnrolled.studentCount} طالب</span>
                                        ${newEnrolled.isShared ? `<span class="en-badge en-badge-warning"><i class="fa-solid fa-share-nodes"></i> مشترك</span>` : ''}
                                        ${newEnrolled.isOpen ? `<span class="en-badge" style="background:#ecfdf5; color:#10b981; border-color:#a7f3d0;"><i class="fa-solid fa-door-open"></i> متاح للطلاب</span>` : ''}
                                    </div>
                                    ${isAdmin ? `
                                   <div style="display:flex; align-items:center; gap:8px; margin-top:10px;">
                                        <input 
                                            type="text" 
                                            id="sisCode_${subEscaped}"
                                            placeholder="كود SIS"
                                            value="${currentCode}"
                                            style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentCode ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentCode ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentCode ? '#f0fdf4' : '#fff'};"
                                        />
                                        <button 
                                            class="en-btn en-btn-primary" 
                                            onclick="saveSisCode('${subEscaped}','${newEnrolled?.docId || ''}')">
                                            <i class="fa-solid fa-floppy-disk"></i>
                                        </button>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                                        <input 
                                            type="text" 
                                            id="subjectCode_${subEscaped}"
                                            placeholder="كود المادة"
                                            value="${currentSubjectCode}"
                                            style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentSubjectCode ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentSubjectCode ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentSubjectCode ? '#f0fdf4' : '#fff'};"
                                        />
                                        <button 
                                            class="en-btn en-btn-primary" 
                                            onclick="saveSubjectCode('${subEscaped}','${college}')">
                                            <i class="fa-solid fa-floppy-disk"></i>
                                        </button>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                                        <input 
                                            type="number" 
                                            id="hours_${subEscaped}"
                                            placeholder="عدد الساعات"
                                            value="${currentHours}"
                                            min="0"
                                            style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentHours ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentHours ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentHours ? '#f0fdf4' : '#fff'};"
                                        />
                                        <button 
                                            class="en-btn en-btn-primary" 
                                            onclick="saveSubjectHours('${subEscaped}','${college}')">
                                            <i class="fa-solid fa-floppy-disk"></i>
                                        </button>
                                    </div>` : ''}` : `
                                    <span class="en-badge en-badge-neutral"><i class="fa-solid fa-minus-circle"></i> لم تُسجَّل بعد</span>
                                    ${isAdmin ? `
                                    <div style="display:flex; align-items:center; gap:8px; margin-top:10px;">
                                        <input 
                                            type="text" 
                                            id="sisCode_${subEscaped}"
                                            placeholder="كود SIS"
                                            value="${currentCode}"
                                            style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentCode ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentCode ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentCode ? '#f0fdf4' : '#fff'};"
                                        />
<button 
                        class="en-btn en-btn-primary" 
                        onclick="saveSisCode('${subEscaped}','')">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                    <input 
    type="text" 
    id="subjectCode_${subEscaped}"
    placeholder="كود المادة"
    value="${currentSubjectCode}"
    style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentSubjectCode ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentSubjectCode ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentSubjectCode ? '#f0fdf4' : '#fff'};"
/>
                    <button 
                        class="en-btn en-btn-primary" 
                        onclick="saveSubjectCode('${subEscaped}','${college}')">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                    <input 
    type="number" 
    id="hours_${subEscaped}"
    placeholder="عدد الساعات"
    value="${currentHours}"
    min="0"
    style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid ${currentHours ? '#10b981' : '#e2e8f0'}; font-size:12px; font-weight:700; color:${currentHours ? '#10b981' : '#334155'}; outline:none; direction:ltr; background:${currentHours ? '#f0fdf4' : '#fff'};"
/>
                    <button 
                        class="en-btn en-btn-primary" 
                        onclick="saveSubjectHours('${subEscaped}','${college}')">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                </div>` : ''}`}
        </div>
      <div class="en-actions">
                                <button type="button" class="en-btn ${newEnrolled ? 'en-btn-update' : 'en-btn-primary'}" onclick="openUploadGuide('${subEscaped}', false)">
                                    <i class="fa-solid fa-file-excel"></i>${newEnrolled ? 'تحديث' : 'رفع قائمة'}
                                </button>
                                ${isAdmin ? `
                                    <button type="button" class="en-btn en-btn-admin" onclick="openUploadGuide('${subEscaped}', true)">
                                        <i class="fa-solid fa-globe"></i> رفع مشترك
                                    </button>
                                    <button type="button" class="en-btn ${newEnrolled?.isOpen ? 'en-btn-danger' : 'en-btn-success'}" onclick="toggleSelfEnrollment('${subEscaped}', ${newEnrolled?.isOpen ? 'true' : 'false'}, '${newEnrolled?.docId || ''}')">
                                        <i class="fa-solid ${newEnrolled?.isOpen ? 'fa-lock' : 'fa-door-open'}"></i> ${newEnrolled?.isOpen ? 'قفل التسجيل' : 'إتاحة للطلاب'}
                                    </button>` : ''}
                                ${newEnrolled ? `
                                    <button class="en-btn en-btn-view" onclick="viewEnrolledStudents('${subEscaped}','${newEnrolled.docId}')">
                                        <i class="fa-solid fa-eye"></i> عرض
                                    </button>` : ''}
                              ${isAdmin && newEnrolled ? `
                                    <button class="en-btn en-btn-danger" onclick="adminDeleteEnrollment('${newEnrolled.docId}','${subEscaped}')">
                                        <i class="fa-solid fa-trash"></i> حذف
                                    </button>` : ''}
                                ${isAdmin && isCustom ? `
                                    <button class="en-btn en-btn-danger" onclick="deleteCustomSubject('${customDocId}', '${subEscaped}')">
                                        <i class="fa-solid fa-triangle-exclamation"></i> حذف المادة نهائيًا
                                    </button>` : ''}
                            </div>
                        </div>
                    </div>`;
            card.outerHTML = newHtml;
        }
    });
    const searchInput = document.getElementById('subjectSearchInput');
    if (searchInput && searchInput.value.trim()) {
        filterSubjectCards(searchInput.value);
    }
    cache.enrollmentMap.set(doctorUID, newMap);
};
async function attachRealtimeListener(college, doctorUID, doctorName) {
    const container = document.getElementById('enrollmentListContainer');
    if (!container) return;

    const headerEl = document.getElementById('enrollmentCollegeTitle');
    if (headerEl) headerEl.innerText = COLLEGE_NAMES[college] || college;

    const hasExistingContent = container.querySelector('.en-card');
    if (!hasExistingContent) {
        container.innerHTML = loadingHTML("جاري تحميل المواد...");
    }

    detachAllListeners();

    const isAdmin = await getAdminStatus(doctorUID);
    const metaRef = collection(db, "subject_enrollments");

    const queries = isAdmin
        ? [query(metaRef, where("college", "==", college))]
        : [
            query(metaRef, where("doctorUID", "==", doctorUID), where("college", "==", college)),
            query(metaRef, where("sharedWithAll", "==", true), where("college", "==", college))
        ];

    const snapshots = new Map();
    let firstLoad = true;
    const buildEnrolledMap = () => {
        const map = {};
        const recordsToCache = [];

        const pushCacheRecord = (d, data, isShared) => {
            recordsToCache.push({
                docId: d.id,
                subjectName: data.subjectName || "",
                college: data.college || college,
                doctorUID: data.doctorUID || "",
                studentCount: data.studentCount || 0,
                sharedWithAll: isShared,
                isOpenForSelfEnrollment: data.isOpenForSelfEnrollment === true,
                sisCode: data.sisCode || "",
                subjectCode: data.subjectCode || "",
                subjectHours: data.subjectHours || "",
                updatedAt: data.updatedAt || null
            });
        };

        if (isAdmin) {
            (snapshots.get(0) || []).forEach(d => {
                const data = d.data();
                const name = data.subjectName;
                if (!name) return;
                pushCacheRecord(d, data, data.sharedWithAll === true);
                if (!map[name] || data.doctorUID === doctorUID) {
                    map[name] = {
                        docId: d.id,
                        studentCount: data.studentCount || 0,
                        isShared: data.sharedWithAll === true,
                        isOpen: data.isOpenForSelfEnrollment === true,
                        ownerUID: data.doctorUID || "",
                        sisCode: data.sisCode || "",
                        subjectCode: data.subjectCode || "",
                        subjectHours: data.subjectHours || ""
                    };
                }
            });
        } else {
            (snapshots.get(0) || []).forEach(d => {
                const data = d.data();
                if (data.subjectName) {
                    pushCacheRecord(d, data, false);
                    map[data.subjectName] = {
                        docId: d.id,
                        studentCount: data.studentCount || 0,
                        isShared: false,
                        isOpen: data.isOpenForSelfEnrollment === true,
                        ownerUID: doctorUID,
                        sisCode: data.sisCode || "",
                        subjectCode: data.subjectCode || "",
                        subjectHours: data.subjectHours || ""
                    };
                }
            });
            (snapshots.get(1) || []).forEach(d => {
                const data = d.data();
                if (data.subjectName && !map[data.subjectName]) {
                    pushCacheRecord(d, data, true);
                    map[data.subjectName] = {
                        docId: d.id,
                        studentCount: data.studentCount || 0,
                        isShared: true,
                        isOpen: data.isOpenForSelfEnrollment === true,
                        ownerUID: data.doctorUID || "",
                        sisCode: data.sisCode || "",
                        subjectCode: data.subjectCode || "",
                        subjectHours: data.subjectHours || ""
                    };
                }
            });
        }

        if (recordsToCache.length > 0) {
            GlobalCache.saveEnrollments(recordsToCache).catch(e =>
                console.warn("⚠️ GlobalCacheDB: failed to persist enrollments", e)
            );
        }

        return map;
    };

    const mergeAndRender = () => {
        const enrolledMap = buildEnrolledMap();
        if (firstLoad) {
            renderFullList(container, college, doctorUID, enrolledMap, isAdmin);
            firstLoad = false;
        } else {
            updateListDynamically(container, college, doctorUID, enrolledMap, isAdmin);
        }
        if (!firstLoad) showToast?.("🔄 تم تحديث القائمة تلقائياً", 1500, "#7c3aed");
    };



    const fallbackTimer = setTimeout(async () => {
        if (firstLoad) {
            console.warn("⚠️ onSnapshot تأخر — استخدام getDocs كبديل");
            try {
                const results = await Promise.all(queries.map(q => getDocs(q)));
                results.forEach((snap, idx) => snapshots.set(idx, snap.docs));
                mergeAndRender();
                showToast?.("⚡ تم التحميل — التحديث اللحظي غير متاح حالياً", 3000, "#f59e0b");
            } catch (e) {
                console.error("Fallback getDocs فشل:", e);
                container.innerHTML = errorHTML("خطأ في تحميل البيانات");
            }
        }
    }, 5000);

    const unsubscribers = queries.map((q, idx) =>
        onSnapshot(q, (snap) => {
            clearTimeout(fallbackTimer);
            snapshots.set(idx, snap.docs);
            if (firstLoad && snapshots.size < queries.length) return;
            mergeAndRender();
        }, (err) => {
            console.error("onSnapshot error:", err);
            clearTimeout(fallbackTimer);
            Promise.all(queries.map(q => getDocs(q)))
                .then(results => {
                    results.forEach((snap, i) => snapshots.set(i, snap.docs));
                    mergeAndRender();
                    showToast?.("⚡ تم التحميل — التحديث اللحظي غير متاح", 3000, "#f59e0b");
                })
                .catch(() => {
                    container.innerHTML = errorHTML("خطأ في تحميل البيانات");
                });
        })
    );
    unsubscribers.forEach(fn => cache.listeners.add(fn));

    const customSubjectsQuery = query(collection(db, "custom_subjects"), where("college", "==", college));
    const unsubscribeCustomSubjects = onSnapshot(customSubjectsQuery, (snap) => {
        const list = snap.docs.map(d => ({ docId: d.id, year: d.data().year, subjectName: d.data().subjectName }));
        cache.customSubjectsByCollege.set(college, list);
        if (cache.enrollmentMap.has(doctorUID)) {
            renderFullList(container, college, doctorUID, cache.enrollmentMap.get(doctorUID), isAdmin);
        }
    }, (err) => console.error("Custom Subjects Listener Error:", err));
    cache.listeners.add(unsubscribeCustomSubjects);

    const subjectMetadataQuery = query(collection(db, "subject_metadata"), where("college", "==", college));
    let isFirstMetaLoad = true;
    const unsubscribeSubjectMetadata = onSnapshot(subjectMetadataQuery, (snap) => {
        const list = snap.docs.map(d => ({
            docId: d.id,
            subjectName: d.data().subjectName || "",
            subjectCode: d.data().subjectCode || "",
            subjectHours: Number(d.data().subjectHours) || 0
        }));
        cache.subjectMetadataByCollege.set(college, list);
        if (!cache.subjectMetadataMapByCollege) cache.subjectMetadataMapByCollege = new Map();
        cache.subjectMetadataMapByCollege.set(college, new Map(list.map(m => [m.subjectName, m])));
        if (isFirstMetaLoad) {
            isFirstMetaLoad = false;
            return;
        }
        if (cache.enrollmentMap.has(doctorUID)) {
            renderFullList(container, college, doctorUID, cache.enrollmentMap.get(doctorUID), isAdmin);
        }
    }, (err) => console.error("Subject Metadata Listener Error:", err));
    cache.listeners.add(unsubscribeSubjectMetadata);
}

window.handleSubjectExcelUpload = async function (input, subjectName) {
    const file = input.files[0];
    if (!file) return;

    const user = window.auth?.currentUser;
    if (!user) return showToast?.("⚠️ يجب تسجيل الدخول أولاً", 3000, "#f59e0b");

    showToast?.("⏳ جاري قراءة الملف...", 2000, "#7c3aed");
    await new Promise(r => setTimeout(r, 100));

    try {
        const students = await parseExcel(file);
        if (!students) { input.value = ''; return; }

        showToast?.(`⬆️ جاري رفع ${students.length} طالب...`, 2000, "#7c3aed");

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const { fullName: doctorName = "", college = "" } = facSnap.exists() ? facSnap.data() : {};

        const q = query(
            collection(db, "subject_enrollments"),
            where("doctorUID", "==", user.uid),
            where("subjectName", "==", subjectName),
            where("college", "==", college)
        );
        const existingSnap = await getDocs(q);

        const isCreate = existingSnap.empty;
        const enrollmentDocId = isCreate ? doc(collection(db, "subject_enrollments")).id : existingSnap.docs[0].id;

        const metaPayload = {
            doctorUID: user.uid,
            doctorName,
            college,
            subjectName,
            studentCount: students.length,
            sharedWithAll: false,
            updatedAt: serverTimestamp()
        };

        await _writeEnrollmentAtomic(
            enrollmentDocId, metaPayload, isCreate, students, students.map(s => s.id),
            { subjectName, college, doctorUID: user.uid, isShared: false }
        );

        showToast?.(`✅ تم رفع ${students.length} طالب بنجاح`, 3000, "#10b981");
        if (typeof playSuccess === "function") playSuccess();
        if (typeof clearTheoryAttendanceCache === "function") clearTheoryAttendanceCache();

    } catch (e) {
        console.error("Upload Error:", e);
        showToast?.(e.message === "SheetJS missing" ? "❌ مكتبة الإكسل غير موجودة" : "❌ خطأ أثناء رفع الملف", 3000, "#ef4444");
    } finally {
        input.value = '';
    }
};

window.handleAdminSharedExcelUpload = async function (input, subjectName) {
    const file = input.files[0];
    if (!file) return;

    const user = window.auth?.currentUser;
    if (!user) return showToast?.("⚠️ يجب تسجيل الدخول", 3000, "#f59e0b");

    if (!(await getAdminStatus(user.uid))) return showToast?.("❌ هذه الميزة للأدمن فقط", 3000, "#ef4444");

    showToast?.("⏳ جاري قراءة الملف...", 2000, "#7c3aed");
    await new Promise(r => setTimeout(r, 100));

    try {
        const students = await parseExcel(file);
        if (!students) { input.value = ''; return; }

        showToast?.(`⬆️ جاري رفع المشترك (${students.length} طالب)...`, 2000, "#7c3aed");

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const { fullName = "", college = "" } = facSnap.exists() ? facSnap.data() : {};

        const q = query(
            collection(db, "subject_enrollments"),
            where("sharedWithAll", "==", true),
            where("subjectName", "==", subjectName),
            where("college", "==", college)
        );
        const existingSnap = await getDocs(q);

        const isCreate = existingSnap.empty;
        const enrollmentDocId = isCreate ? doc(collection(db, "subject_enrollments")).id : existingSnap.docs[0].id;

        const metaPayload = {
            doctorUID: user.uid,
            doctorName: fullName,
            college,
            subjectName,
            studentCount: students.length,
            sharedWithAll: true,
            updatedAt: serverTimestamp()
        };

        await _writeEnrollmentAtomic(
            enrollmentDocId, metaPayload, isCreate, students, students.map(s => s.id),
            { subjectName, college, doctorUID: user.uid, isShared: true }
        );

        showToast?.(`✅ تم رفع الشيت المشترك`, 3000, "#10b981");
        if (typeof playSuccess === "function") playSuccess();
    } catch (e) {
        console.error("Admin Upload Error:", e);
        showToast?.("❌ خطأ أثناء الرفع", 3000, "#ef4444");
    } finally {
        input.value = '';
    }
};

window.adminDeleteEnrollment = async function (docId, subjectName) {
    const user = window.auth?.currentUser;
    if (!user) return;
    if (!(await getAdminStatus(user.uid))) return showToast?.("❌ ليس لديك صلاحية", 3000, "#ef4444");

    if (!confirm(`هل أنت متأكد من حذف تسجيل مادة "${subjectName}"؟`)) return;

    try {
        await deleteDoc(doc(db, "subject_enrollments", docId));
        await deleteDoc(doc(db, "subject_rosters", docId)).catch(() => { });
        showToast?.("🗑️ تم الحذف بنجاح", 2500, "#10b981");
    } catch (e) {
        console.error("Delete Error:", e);
        showToast?.("❌ خطأ أثناء الحذف", 3000, "#ef4444");
    }
};

window.viewEnrolledStudents = async function (subjectName, docId) {
    const modal = document.getElementById('enrolledStudentsViewModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const titleEl = document.getElementById('enrolledSubjectTitle');
    const listEl = document.getElementById('enrolledStudentsList');
    const searchInput = document.getElementById('enrolledSearchInput');

    if (titleEl) titleEl.innerText = subjectName;
    if (searchInput) searchInput.value = '';
    if (cache.studentsData.has(docId)) {
        const students = cache.studentsData.get(docId);
        window._enrolledStudentsCache = students;
        renderEnrolledList(students);
        return;
    }

    const localRoster = await GlobalCache.getRoster(docId).catch(() => null);
    if (localRoster?.students) {
        cache.studentsData.set(docId, localRoster.students);
        window._enrolledStudentsCache = localRoster.students;
        renderEnrolledList(localRoster.students);
        return;
    }

    if (listEl) listEl.innerHTML = loadingHTML("جاري جلب بيانات الطلاب...");

    try {
        const docSnap = await getDoc(doc(db, "subject_rosters", docId));
        if (!docSnap.exists()) {
            listEl.innerHTML = `<div class="en-empty">لا توجد بيانات</div>`;
            return;
        }

        const students = docSnap.data().students || [];
        const studentIds = docSnap.data().studentIds || [];
        cache.studentsData.set(docId, students);
        window._enrolledStudentsCache = students;
        renderEnrolledList(students);

        GlobalCache.saveRoster(docId, students, studentIds).catch(e =>
            console.warn("⚠️ GlobalCacheDB: failed to persist roster", e)
        );
    } catch (e) {
        console.error("View Students Error:", e);
        listEl.innerHTML = errorHTML("خطأ في التحميل");
    }
};

window.filterEnrolledStudents = function (searchText) {
    if (!window._enrolledStudentsCache) return;
    const q = searchText.toLowerCase().trim();
    const filtered = window._enrolledStudentsCache.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.group?.toLowerCase().includes(q)
    );
    renderEnrolledList(filtered);
};

window.filterSubjectCards = function (query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('#enrollmentListContainer .en-card').forEach(card => {
        const name = (card.dataset.subject || '').toLowerCase();
        card.style.display = name.includes(q) ? '' : 'none';
    });
    document.querySelectorAll('#enrollmentListContainer .en-year-header').forEach(header => {
        let sibling = header.nextElementSibling;
        let anyVisible = false;
        while (sibling && !sibling.classList.contains('en-year-header')) {
            if (sibling.classList.contains('en-card') && sibling.style.display !== 'none') anyVisible = true;
            sibling = sibling.nextElementSibling;
        }
        header.style.display = anyVisible ? '' : 'none';
    });
};

window.getStudentEnrolledSubjects = async function (studentId) {
    try {
        const snap = await getDoc(doc(db, "student_subject_index", studentId));
        if (!snap.exists()) return [];
        return Object.entries(snap.data().subjects || {}).map(([enrollmentDocId, info]) => ({
            enrollmentDocId, ...info
        }));
    } catch (e) {
        console.error("getStudentEnrolledSubjects Error:", e);
        return [];
    }
};

function renderEnrolledList(students) {
    const listEl = document.getElementById('enrolledStudentsList');
    if (!listEl) return;

    if (!students.length) {
        listEl.innerHTML = `<div class="en-empty"><i class="fa-solid fa-magnifying-glass-minus" style="font-size:35px;margin-bottom:12px;display:block;"></i><div>لا توجد نتائج</div></div>`;
        return;
    }

    const rows = students.map((s, i) => `
        <div class="en-student-row">
            <div class="en-avatar">${i + 1}</div>
            <div style="flex:1;">
                <div style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:3px;">${escapeHtml(s.name)}</div>
                <div class="en-badges">
                    <span style="font-size:11px;color:#64748b;font-weight:600;">ID: ${escapeHtml(s.id)}</span>
                    ${s.group ? `<span class="en-badge en-badge-info">${escapeHtml(s.group)}</span>` : ''}
                </div>
            </div>
        </div>`).join('');

    listEl.innerHTML = `
        <div class="en-stat-box">
            <span style="font-size:12px;color:#64748b;font-weight:600;">إجمالي الطلاب</span>
            <span style="background:#7c3aed;color:#fff;padding:3px 12px;border-radius:20px;font-size:13px;font-weight:800;">${students.length} طالب</span>
        </div>${rows}`;
}

async function parseExcel(file) {
    if (typeof XLSX === 'undefined') throw new Error("SheetJS missing");
    try {
        const data = await readExcelFile(file);
        if (!data?.length) { showToast?.("❌ الملف فارغ", 3000, "#ef4444"); return null; }

        const dataRows = data.slice(1);
        const validRows = dataRows.filter(r => r[0] && r[1]);

        if (validRows.length === 0) {
            showToast?.("❌ صيغة الملف غير صحيحة — يجب أن يحتوي على عمودين فقط: الكود ثم الاسم", 4500, "#ef4444");
            return null;
        }

        const skippedCount = dataRows.length - validRows.length;
        if (skippedCount > 0 && skippedCount >= dataRows.length * 0.3) {
            showToast?.(`⚠️ تم تجاهل ${skippedCount} صف لعدم تطابق الصيغة — تأكد إن العمود الأول هو الكود والثاني هو الاسم`, 4500, "#f59e0b");
        }

        const students = validRows.map(r => ({
            id: String(r[0]).trim(),
            name: String(r[1]).trim(),
            group: r[2] ? String(r[2]).trim() : ""
        }));

        return students;
    } catch (err) {
        console.error("Excel Parse:", err);
        showToast?.("❌ خطأ في القراءة", 3000, "#ef4444");
        return null;
    }
}

function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" }));
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error("Read Error"));
        reader.readAsArrayBuffer(file);
    });
}

function loadingHTML(msg) {
    return `<div class="en-loading"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px;color:#7c3aed;"></i><div style="margin-top:10px;">${msg}</div></div>`;
}

function errorHTML(msg) {
    return `<div class="en-error"><i class="fa-solid fa-triangle-exclamation" style="font-size:30px;margin-bottom:10px;display:block;"></i>${msg}</div>`;
}
window.saveSisCode = async function (subjectName, docId) {
    const input = document.getElementById(`sisCode_${subjectName}`);
    const code = input?.value.trim();

    if (!code) {
        showToast?.("⚠️ يرجى كتابة الكود أولاً", 3000, "#f59e0b");
        return;
    }

    if (!docId) {
        showToast?.("❌ يجب رفع قائمة الطلاب أولاً", 3000, "#ef4444");
        return;
    }

    try {
        await setDoc(doc(db, "subject_enrollments", docId), {
            sisCode: code
        }, { merge: true });

        showToast?.("✅ تم حفظ كود SIS بنجاح", 2500, "#10b981");
    } catch (e) {
        console.error("SIS Code Save Error:", e);
        showToast?.("❌ خطأ أثناء الحفظ", 3000, "#ef4444");
    }
};

function makeSubjectMetaDocId(college, subjectName) {
    const safeName = subjectName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\u0600-\u06FF]/g, '');
    return `${college}_${safeName}`;
}

window.saveSubjectCode = async function (subjectName, college) {
    const input = document.getElementById(`subjectCode_${subjectName}`);
    const code = input?.value.trim();

    if (!code) {
        showToast?.("⚠️ يرجى كتابة كود المادة أولاً", 3000, "#f59e0b");
        return;
    }

    if (!college) {
        showToast?.("❌ لم يتم تحديد الكلية", 3000, "#ef4444");
        return;
    }

    try {
        const metaDocId = makeSubjectMetaDocId(college, subjectName);
        await setDoc(doc(db, "subject_metadata", metaDocId), {
            college,
            subjectName,
            subjectCode: code,
            updatedAt: serverTimestamp()
        }, { merge: true });

        showToast?.("✅ تم حفظ كود المادة بنجاح", 2500, "#10b981");
    } catch (e) {
        console.error("Subject Code Save Error:", e);
        showToast?.("❌ خطأ أثناء الحفظ", 3000, "#ef4444");
    }
};

window.saveSubjectHours = async function (subjectName, college) {
    const input = document.getElementById(`hours_${subjectName}`);
    const hours = parseInt(input?.value, 10);

    if (isNaN(hours) || hours < 0) {
        showToast?.("⚠️ يرجى كتابة عدد ساعات صحيح", 3000, "#f59e0b");
        return;
    }

    if (!college) {
        showToast?.("❌ لم يتم تحديد الكلية", 3000, "#ef4444");
        return;
    }

    try {
        const metaDocId = makeSubjectMetaDocId(college, subjectName);
        await setDoc(doc(db, "subject_metadata", metaDocId), {
            college,
            subjectName,
            subjectHours: hours,
            updatedAt: serverTimestamp()
        }, { merge: true });

        showToast?.("✅ تم حفظ عدد الساعات بنجاح", 2500, "#10b981");
    } catch (e) {
        console.error("Subject Hours Save Error:", e);
        showToast?.("❌ خطأ أثناء الحفظ", 3000, "#ef4444");
    }
};

window.toggleSelfEnrollment = async function (subjectName, isCurrentlyOpen, docId) {
    const lang = localStorage.getItem('sys_lang') || 'ar';
    const _t = (ar, en) => lang === 'ar' ? ar : en;

    const user = window.auth?.currentUser;
    if (!user) return showToast?.(_t("⚠️ يجب تسجيل الدخول أولاً", "⚠️ Please sign in first"), 3000, "#f59e0b");
    if (!(await getAdminStatus(user.uid))) return showToast?.(_t("❌ هذه الميزة للأدمن فقط", "❌ Admin access required"), 3000, "#ef4444");

    const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
    const { fullName = "", college = "" } = facSnap.exists() ? facSnap.data() : {};

    const newState = !isCurrentlyOpen;
    const actionAr = newState ? 'فتح' : 'إغلاق';
    const actionEn = newState ? 'Opening' : 'Closing';
    showToast?.(_t(`⏳ جاري ${actionAr} باب التسجيل...`, `⏳ ${actionEn} enrollment...`), 2000, "#7c3aed");

    try {
        if (docId) {
            await setDoc(doc(db, "subject_enrollments", docId), {
                isOpenForSelfEnrollment: newState,
                sharedWithAll: true,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } else {
            const payload = {
                doctorUID: user.uid,
                doctorName: fullName,
                college,
                subjectName,
                students: [],
                studentIds: [],
                studentCount: 0,
                sharedWithAll: true,
                isOpenForSelfEnrollment: newState,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            await addDoc(collection(db, "subject_enrollments"), payload);
        }

        const successMsg = newState
            ? _t("🔓 تم إتاحة التسجيل للطلاب بنجاح", "🔓 Enrollment opened successfully")
            : _t("🔒 تم إغلاق باب التسجيل", "🔒 Enrollment closed");

        showToast?.(successMsg, 3000, newState ? "#10b981" : "#f59e0b");
        if (typeof playSuccess === "function") playSuccess();

    } catch (e) {
        console.error("Toggle Enrollment Error:", e);
        showToast?.(_t("❌ خطأ أثناء تنفيذ العملية", "❌ Operation failed"), 3000, "#ef4444");
    }
};
let pendingAddSubjectCollege = null;

function ensureAddSubjectModal() {
    if (document.getElementById('addSubjectModal')) return;

    const yearLabels = {
        first_year: "الفرقة الأولى", second_year: "الفرقة الثانية",
        third_year: "الفرقة الثالثة", fourth_year: "الفرقة الرابعة",
        fifth_year: "الفرقة الخامسة"
    };

    const overlay = document.createElement('div');
    overlay.id = 'addSubjectModal';
    overlay.className = 'en-format-modal-overlay';
    overlay.style.display = 'none';
    overlay.onclick = function (e) { if (e.target === overlay) window.closeAddSubjectModal(); };
    overlay.innerHTML = `
        <div class="en-format-modal" onclick="event.stopPropagation()">
            <div class="en-format-modal-header">
                <div class="en-format-modal-icon" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);"><i class="fa-solid fa-plus"></i></div>
                <div class="en-format-modal-header-text">
                    <div class="en-format-modal-title">إضافة مادة جديدة</div>
                    <div class="en-format-modal-title-en">Add New Subject</div>
                </div>
                <button type="button" class="en-format-modal-close" onclick="closeAddSubjectModal()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="en-format-modal-body">
                <label style="display:block;font-size:12px;font-weight:800;color:#334155;margin-bottom:6px;">الفرقة الدراسية</label>
                <select id="addSubjectYearSelect" style="width:100%;padding:10px;border-radius:10px;border:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#334155;margin-bottom:14px;">
                    ${Object.entries(yearLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}
                </select>
                <label style="display:block;font-size:12px;font-weight:800;color:#334155;margin-bottom:6px;">اسم المادة</label>
                <input type="text" id="addSubjectNameInput" placeholder="اكتب اسم المادة هنا" style="width:100%;padding:10px;border-radius:10px;border:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#334155;outline:none;">
            </div>
            <div class="en-format-modal-footer">
                <button type="button" class="en-btn en-btn-view" onclick="closeAddSubjectModal()">إلغاء</button>
                <button type="button" class="en-btn en-btn-success" onclick="confirmAddCustomSubject()">
                    <i class="fa-solid fa-check"></i> إضافة المادة
                </button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
}

window.openAddSubjectModal = function (college) {
    ensureAddSubjectModal();
    pendingAddSubjectCollege = college;
    const nameInput = document.getElementById('addSubjectNameInput');
    if (nameInput) nameInput.value = '';
    document.getElementById('addSubjectModal').style.display = 'flex';
};

window.closeAddSubjectModal = function () {
    pendingAddSubjectCollege = null;
    const modal = document.getElementById('addSubjectModal');
    if (modal) modal.style.display = 'none';
};

window.confirmAddCustomSubject = async function () {
    const user = window.auth?.currentUser;
    if (!user) return showToast?.("⚠️ يجب تسجيل الدخول أولاً", 3000, "#f59e0b");
    if (!(await getAdminStatus(user.uid))) return showToast?.("❌ هذه الميزة للأدمن فقط", 3000, "#ef4444");

    const college = pendingAddSubjectCollege;
    if (!college) return;

    const yearSelect = document.getElementById('addSubjectYearSelect');
    const nameInput = document.getElementById('addSubjectNameInput');
    const year = yearSelect?.value;
    const subjectName = (nameInput?.value || '').trim();

    if (!subjectName) {
        showToast?.("⚠️ يرجى كتابة اسم المادة", 3000, "#f59e0b");
        return;
    }

    // 🔒 منع تكرار الاسم (بين المواد الأصلية والمخصصة لنفس الكلية، بغض النظر عن السنة)
    const staticSubjects = COLLEGE_SUBJECTS[college] || {};
    const allExistingNames = new Set();
    Object.values(staticSubjects).forEach(names => names.forEach(n => allExistingNames.add(n.trim().toLowerCase())));
    (cache.customSubjectsByCollege.get(college) || []).forEach(c => allExistingNames.add(c.subjectName.trim().toLowerCase()));

    if (allExistingNames.has(subjectName.toLowerCase())) {
        showToast?.("❌ يوجد مادة بنفس الاسم بالفعل", 3500, "#ef4444");
        return;
    }

    try {
        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const doctorName = facSnap.exists() ? (facSnap.data().fullName || "") : "";

        // 🔒 توليد ID ثابت من اسم المادة + الكلية، عشان مستحيل تتكرر
        const safeName = subjectName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\u0600-\u06FF]/g, '');
        const subjectDocId = `${college}_${safeName}`;

        const subjectDocRef = doc(db, "custom_subjects", subjectDocId);
        const existingDoc = await getDoc(subjectDocRef);

        if (existingDoc.exists()) {
            showToast?.("❌ يوجد مادة بنفس الاسم بالفعل", 3500, "#ef4444");
            return;
        }

        await setDoc(subjectDocRef, {
            college,
            year,
            subjectName,
            addedBy: user.uid,
            addedByName: doctorName,
            createdAt: serverTimestamp()
        });

        showToast?.("✅ تم إضافة المادة بنجاح", 2500, "#10b981");
        if (typeof playSuccess === "function") playSuccess();
        window.closeAddSubjectModal();

        if (window.LECTURE_SETUP_CACHE) window.LECTURE_SETUP_CACHE.isReady = false;
    } catch (e) {
        console.error("Add Custom Subject Error:", e);
        showToast?.("❌ خطأ أثناء إضافة المادة", 3000, "#ef4444");
    }
};

window.deleteCustomSubject = async function (docId, subjectName) {
    const user = window.auth?.currentUser;
    if (!user) return;
    if (!(await getAdminStatus(user.uid))) return showToast?.("❌ ليس لديك صلاحية", 3000, "#ef4444");
    if (!docId) return;

    if (!confirm(`هل أنت متأكد من حذف مادة "${subjectName}" نهائيًا؟\nسيتم حذف أي تسجيلات طلاب مرتبطة بها أيضًا ولا يمكن التراجع عن ذلك.`)) return;

    try {
        await deleteDoc(doc(db, "custom_subjects", docId));

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const myCollege = facSnap.exists() ? (facSnap.data().college || "") : "";

        const enrollQ = query(
            collection(db, "subject_enrollments"),
            where("subjectName", "==", subjectName),
            where("college", "==", myCollege)
        );
        const enrollSnap = await getDocs(enrollQ);
        if (!enrollSnap.empty) {
            const batch = writeBatch(db);
            enrollSnap.forEach(d => {
                batch.delete(d.ref);
                batch.delete(doc(db, "subject_rosters", d.id));
            });
            await batch.commit();
        }

        showToast?.("🗑️ تم حذف المادة نهائيًا", 3000, "#10b981");
    } catch (e) {
        console.error("Delete Custom Subject Error:", e);
        showToast?.("❌ خطأ أثناء حذف المادة", 3000, "#ef4444");
    }
};

window.removeSelfEnrolledStudent = async function (subjectDocId, studentId) {
    const user = window.auth?.currentUser;
    if (!user) return showToast?.("⚠️ يجب تسجيل الدخول أولاً", 3000, "#f59e0b");

    if (!confirm(`هل أنت متأكد من حذف الطالب "${studentId}" من هذه المادة؟`)) return;

    try {
        const subjectRef = doc(db, "subject_enrollments", subjectDocId);
        const rosterRef = doc(db, "subject_rosters", subjectDocId);
        const indexRef = doc(db, "student_subject_index", studentId);

        await runTransaction(db, async (tx) => {
            const subjectSnap = await tx.get(subjectRef);
            if (!subjectSnap.exists()) throw new Error("المادة غير موجودة");

            const rosterSnap = await tx.get(rosterRef);
            const indexSnap = await tx.get(indexRef);

            const subjectData = subjectSnap.data();
            const students = subjectData.students || [];
            const studentIds = subjectData.studentIds || [];

            const filteredStudents = students.filter(s => String(s.id).trim() !== String(studentId).trim());
            if (filteredStudents.length === students.length) {
                throw new Error("الطالب غير موجود ضمن قائمة هذه المادة");
            }
            const filteredIds = studentIds.filter(id => String(id).trim() !== String(studentId).trim());

            tx.update(subjectRef, {
                students: filteredStudents,
                studentIds: filteredIds,
                studentCount: filteredStudents.length,
                updatedAt: serverTimestamp()
            });

            if (rosterSnap.exists()) {
                const rosterData = rosterSnap.data();
                const rosterStudents = (rosterData.students || [])
                    .filter(s => String(s.id).trim() !== String(studentId).trim());
                const rosterIds = (rosterData.studentIds || [])
                    .filter(id => String(id).trim() !== String(studentId).trim());

                tx.update(rosterRef, {
                    students: rosterStudents,
                    studentIds: rosterIds
                });
            }

            if (indexSnap.exists()) {
                tx.update(indexRef, {
                    [`subjects.${subjectDocId}`]: deleteField()
                });
            }
        });

        showToast?.("🗑️ تم حذف الطالب من كل السجلات بنجاح", 2500, "#10b981");
    } catch (e) {
        console.error("Remove Self-Enrolled Student Error:", e);
        showToast?.(`❌ ${e.message || "خطأ أثناء الحذف"}`, 3000, "#ef4444");
    }
};

window.addEventListener('beforeunload', () => {
    detachAllListeners();
});
console.log("✅ Subject Enrollment System v3.0 Loaded — High Performance Mode");
