import {
    collection, doc, getDoc, getDocs, query, where, onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;

let currentStudentData = null;
let openSubjectsCache = [];
let enrolledSubjectIds = new Set(); // ← المواد اللي الطالب مسجل فيها (docIds)
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

let advisorInfoCache = null;
let _advisorListenerAttached = false;

let _listenerAttached = false;
let _notifierReady = false;
let _notifierReadyCbs = [];
let _clickHandlerAttached = false;

window.enrollmentNotifierUnsubscribe = null;

(function injectStyles() {
    if (document.getElementById('stu-enroll-styles')) return;
    const s = document.createElement('style');
    s.id = 'stu-enroll-styles';
    s.innerHTML = `
        @keyframes se-fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes se-pop     { 0%{opacity:0;transform:scale(.82)} 70%{transform:scale(1.04)} 100%{opacity:1;transform:scale(1)} }
        @keyframes se-shimmer { 0%{background-position:-500px 0} 100%{background-position:500px 0} }
        @keyframes se-spin    { to{transform:rotate(360deg)} }
        @keyframes se-checkIn { 0%{opacity:0;transform:scale(.5) rotate(-10deg)} 80%{transform:scale(1.1) rotate(2deg)} 100%{opacity:1;transform:scale(1) rotate(0)} }
        @keyframes se-badgePop{ 0%{transform:scale(.5)} 60%{transform:scale(1.25)} 100%{transform:scale(1)} }

        .se-skeleton {
            border-radius:16px; height:86px; margin-bottom:10px;
            background:linear-gradient(90deg,#f1f5f9 25%,#e9eef5 50%,#f1f5f9 75%);
            background-size:500px 100%;
            animation:se-shimmer 1.5s ease infinite;
        }
        .se-card {
            background:#fff; border:1.5px solid #e2e8f0; border-radius:20px;
            padding:16px 18px; margin-bottom:10px;
            box-shadow:0 2px 8px rgba(0,0,0,.04);
            transition:border-color .25s,box-shadow .25s,transform .2s;
            animation:se-fadeUp .35s ease both;
        }
        .se-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.08); }
        .se-card.enrolled {
            border-color:#10b981;
            background:linear-gradient(135deg,#f0fdf4 0%,#fff 100%);
            box-shadow:0 4px 16px rgba(16,185,129,.12);
        }
        .se-card.enrolled:hover { box-shadow:0 8px 24px rgba(16,185,129,.18); }
        .se-btn-enroll {
            background:linear-gradient(135deg,#3b82f6,#2563eb);
            color:#fff; padding:9px 18px; border-radius:12px;
            font-size:13px; border:none; cursor:pointer; font-weight:800;
            box-shadow:0 4px 14px rgba(59,130,246,.35);
            transition:all .2s ease;
            display:inline-flex; align-items:center; gap:7px; white-space:nowrap;
        }
        .se-btn-enroll:hover  { transform:translateY(-1px); box-shadow:0 7px 20px rgba(59,130,246,.45); }
        .se-btn-enroll:active { transform:scale(.96); }
        .se-btn-enroll:disabled{ opacity:.6; cursor:not-allowed; transform:none; }
        .se-enrolled-badge {
            background:#f0fdf4; color:#10b981; border:1.5px solid #a7f3d0;
            padding:8px 16px; border-radius:12px; font-size:12px; font-weight:800;
            display:inline-flex; align-items:center; gap:6px;
            animation:se-checkIn .4s ease;
        }
        .se-stats-row { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
        .se-chip {
            background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;
            padding:7px 13px; font-size:11px; font-weight:800; color:#475569;
            display:inline-flex; align-items:center; gap:6px;
        }
        .se-chip.blue  { background:#eff6ff; border-color:#bfdbfe; color:#2563eb; }
        .se-chip.green { background:#f0fdf4; border-color:#a7f3d0; color:#059669; }
        .se-notice {
            background:#fffbeb; border:1px solid #fde68a; border-radius:12px;
            padding:10px 14px; font-size:11px; font-weight:700; color:#92400e;
            display:flex; align-items:center; gap:8px; margin-bottom:14px;
        }
        .se-alert-count {
            position:absolute; top:-6px; right:-6px;
            min-width:18px; height:18px; padding:0 4px;
            background:linear-gradient(135deg,#ef4444,#dc2626);
            color:#fff; font-size:10px; font-weight:900;
            border-radius:9px; display:flex; align-items:center; justify-content:center;
            border:2px solid #fff;
            box-shadow:0 2px 6px rgba(239,68,68,.5);
            animation:se-badgePop .35s ease;
            pointer-events:none; line-height:1;
        }
        .se-overlay {
            position:fixed; inset:0; background:rgba(15,23,42,.65);
            backdrop-filter:blur(5px); display:flex; align-items:center;
            justify-content:center; z-index:999999; padding:16px;
        }
        .se-confirm-box {
            background:#fff; border-radius:26px; max-width:370px; width:100%;
            box-shadow:0 35px 80px rgba(0,0,0,.28); animation:se-pop .3s ease; overflow:hidden;
        }
        .se-confirm-head {
            padding:26px 22px 18px;
            background:linear-gradient(135deg,#fffbeb,#fff7ed);
            border-bottom:1px solid #f1f5f9; text-align:center;
        }
        .se-confirm-icon-wrap {
            width:58px; height:58px; margin:0 auto 14px;
            background:linear-gradient(135deg,#f59e0b,#d97706);
            border-radius:18px; display:flex; align-items:center; justify-content:center;
            font-size:26px; color:#fff; box-shadow:0 8px 22px rgba(245,158,11,.4);
        }
        .se-confirm-title   { font-size:17px; font-weight:900; color:#1e293b; margin-bottom:8px; }
        .se-confirm-subject {
            display:inline-block; background:#eff6ff; color:#2563eb;
            border-radius:10px; padding:5px 14px; font-size:13px; font-weight:800;
        }
        .se-confirm-body { padding:18px 22px 10px; }
        .se-confirm-list {
            background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px;
            padding:14px 16px; font-size:12px; color:#334155; font-weight:700; line-height:2;
        }
        .se-confirm-list li { list-style:none; display:flex; align-items:flex-start; gap:8px; }
        .se-confirm-footer  { display:flex; gap:10px; padding:14px 22px 22px; }
        .se-btn-cancel {
            flex:1; padding:12px; border-radius:13px; border:1.5px solid #e2e8f0;
            background:#f8fafc; color:#64748b; font-size:13px; font-weight:800;
            cursor:pointer; transition:background .2s;
        }
        .se-btn-cancel:hover { background:#f1f5f9; }
        .se-btn-go {
            flex:2; padding:12px; border-radius:13px; border:none; cursor:pointer;
            background:linear-gradient(135deg,#3b82f6,#2563eb); color:#fff;
            font-size:13px; font-weight:800; box-shadow:0 4px 14px rgba(59,130,246,.35);
            transition:all .2s; display:flex; align-items:center; justify-content:center; gap:8px;
        }
        .se-btn-go:hover { transform:translateY(-1px); box-shadow:0 7px 20px rgba(59,130,246,.45); }
        .se-empty { text-align:center; padding:52px 20px; }
        .se-empty-emoji { font-size:52px; display:block; margin-bottom:16px; opacity:.5; }
        .se-empty-title { font-size:16px; font-weight:900; color:#475569; margin-bottom:8px; }
        .se-empty-sub   { font-size:12px; color:#94a3b8; line-height:1.7; max-width:260px; margin:0 auto; }
        .se-error { text-align:center; padding:44px 20px; }
        .se-retry {
            background:linear-gradient(135deg,#3b82f6,#2563eb); color:#fff;
            border:none; border-radius:13px; padding:11px 28px;
            font-size:13px; font-weight:800; cursor:pointer; margin-top:16px;
            box-shadow:0 4px 14px rgba(59,130,246,.3);
            transition:all .2s; display:inline-flex; align-items:center; gap:8px;
        }
        .se-retry:hover { transform:translateY(-1px); }
        .se-doc-tag {
            font-size:11px; color:#94a3b8; font-weight:700;
            margin-top:5px; display:flex; align-items:center; gap:5px;
        }
        .se-enrolled-label {
            font-size:10px; font-weight:800; color:#10b981;
            display:flex; align-items:center; gap:4px; margin-bottom:5px;
        }
        @media(max-width:480px){
            .se-confirm-footer { flex-direction:column-reverse; }
            .se-confirm-box    { border-radius:20px; }
        }
    `;
    document.head.appendChild(s);
})();

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function skeletonHTML() {
    return [0, 1, 2].map(i =>
        `<div class="se-skeleton" style="animation-delay:${i * .12}s;"></div>`
    ).join('');
}

async function fetchStudentData(uid) {
    const snap = await getDoc(doc(db, "user_registrations", uid));
    if (!snap.exists()) return null;

    const raw = snap.data();
    const info = raw.registrationInfo || {};
    const group = info.group || raw.group || "عام";

    const collegeMap = {
        'G': 'NURS', 'N': 'NURS', 'P': 'PT',
        'C': 'PHARM', 'D': 'DENT', 'T': 'CS', 'B': 'BA', 'H': 'HS',
        'E': 'ENG', 'A': 'ART', 'M': 'MED', 'V': 'VET', 'I': 'MEDIA', 'L': 'ALSUN'
    };
    const letter = group.replace(/[^a-zA-Z]/g, '')[0] || "";
    const college = collegeMap[letter] || letter;
    const studentId = String(info.studentID || raw.studentID || "").trim();

    // 🔒 قراءة واحدة بس: فهرس المواد المسجل فيها (بديل عن قراءة students array من كل مادة)
    try {
        const idxSnap = await getDoc(doc(db, "student_subject_index", studentId));
        enrolledSubjectIds = idxSnap.exists()
            ? new Set(Object.keys(idxSnap.data().subjects || {}))
            : new Set();
    } catch (e) {
        console.warn("⚠️ [Index] تعذر تحميل فهرس المواد المسجلة:", e.message);
        enrolledSubjectIds = new Set();
    }

    return {
        studentId,
        fullName: info.fullName || raw.fullName || "Student",
        group,
        level: info.level || raw.level || "",
        college
    };
}

function updateEnrollmentBadge(count) {
    const btn = document.getElementById('btnStudentEnrollmentMenu');
    if (!btn) return;

    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';

    let badge = document.getElementById('enrollmentAlertBadge');

    if (count <= 0) {
        if (badge) badge.style.display = 'none';
        Object.assign(btn.style, { borderColor: '#e2e8f0', background: '#f8fafc', boxShadow: 'none' });
        return;
    }

    const label = count > 99 ? '99+' : String(count);

    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'enrollmentAlertBadge';
        badge.className = 'se-alert-count';
        btn.appendChild(badge);
    } else {
        badge.style.display = '';
        badge.className = 'se-alert-count';
    }

    if (badge.textContent !== label) {
        badge.textContent = label;
        badge.style.animation = 'none';
        requestAnimationFrame(() => { badge.style.animation = 'se-badgePop .35s ease'; });
    }

    Object.assign(btn.style, {
        borderColor: '#c7d2fe', background: '#eef2ff',
        boxShadow: '0 4px 15px rgba(99,102,241,.2)', transition: 'all .3s ease'
    });
}

function isCacheValid() {
    return openSubjectsCache.length > 0 && (Date.now() - _cacheTimestamp) < CACHE_TTL_MS;
}

async function fetchOpenSubjects(college) {
    console.log("🔍 [DEBUG] fetchOpenSubjects بدأ — الكلية:", college);
    if (isCacheValid()) return openSubjectsCache;
    const openSnap = await getDocs(query(
        collection(db, "subject_enrollments"),
        where("college", "==", college),
        where("isOpenForSelfEnrollment", "==", true)
    ));
    const openSubjects = openSnap.docs.map(d => ({ docId: d.id, ...d.data() }));

    const missingIds = [...enrolledSubjectIds].filter(
        id => !openSubjects.some(s => s.docId === id)
    );
    const enrolledButClosed = await Promise.all(
        missingIds.map(async id => {
            const snap = await getDoc(doc(db, "subject_enrollments", id));
            return snap.exists() ? { docId: id, ...snap.data() } : null;
        })
    );

    openSubjectsCache = [...openSubjects, ...enrolledButClosed.filter(Boolean)];
    _cacheTimestamp = Date.now();
    console.log("✅ [DEBUG] fetchOpenSubjects خلص، عدد المواد:", openSubjectsCache.length);
    return openSubjectsCache;
}

function initAdvisorInfoListener(uid) {
    if (_advisorListenerAttached) return;
    _advisorListenerAttached = true;

    const q = query(
        collection(db, "advising_students"),
        where("studentUID", "==", uid)
    );

    onSnapshot(q, snap => {
        if (snap.empty) {
            advisorInfoCache = null;
            const modal = document.getElementById('studentEnrollmentModal');
            if (modal && modal.style.display === 'flex') renderAdvisorInfoCard();
            return;
        }

        const data = snap.docs[0].data();
        advisorInfoCache = {
            doctorName: data.doctorName || null,
            doctorUID: data.doctorUID || null,
            doctorWhatsapp: advisorInfoCache?.doctorWhatsapp || null,
            courses: data.courses || []
        };

        const modal = document.getElementById('studentEnrollmentModal');
        if (modal && modal.style.display === 'flex') renderAdvisorInfoCard();

        if (data.doctorUID) initDoctorContactListener(data.doctorUID);

    }, err => {
        console.warn("⚠️ [AdvisorInfo] تعذر تحميل بيانات المرشد:", err.message);
        _advisorListenerAttached = false;
    });
}

let _contactListenerAttached = false;
let _contactListenerDoctorUID = null;

function initDoctorContactListener(doctorUID) {
    if (_contactListenerAttached && _contactListenerDoctorUID === doctorUID) return;
    _contactListenerAttached = true;
    _contactListenerDoctorUID = doctorUID;

    onSnapshot(doc(db, "doctor_contacts", doctorUID), snap => {
        if (advisorInfoCache) {
            advisorInfoCache.doctorWhatsapp = snap.exists() ? (snap.data().whatsapp || null) : null;
            const modal = document.getElementById('studentEnrollmentModal');
            if (modal && modal.style.display === 'flex') renderAdvisorInfoCard();
        }
    }, err => {
        console.warn("⚠️ [DoctorContact] تعذر تحميل رقم الواتس:", err.message);
        _contactListenerAttached = false;
    });

}
function _onWaClick(e) {
    const btn = e.target.closest('.se-whatsapp-btn');
    if (!btn) return;
    const number = btn.dataset.wa;
    if (!number) {
        showToast?.("⚠️ الدكتور لا يسمح بالتواصل حالياً", 3000, "#ef4444");
        return;
    }
    window.open(`https://wa.me/${number}`, '_blank');
}
function renderAdvisorInfoCard() {
    const container = document.getElementById('studentEnrollmentListContainer');
    if (!container) return;

    let card = document.getElementById('seAdvisorInfoCard');

    if (!advisorInfoCache) {
        card?.remove();

        if (!document.getElementById('seNoAdvisorMsg')) {
            container.insertAdjacentHTML('afterbegin', `
                <div id="seNoAdvisorMsg" style="
                    background:#fef2f2;border:1.5px solid #fecaca;border-radius:16px;
                    padding:14px 16px;margin-bottom:14px;text-align:center;
                ">
                    <i class="fa-solid fa-user-slash" style="color:#ef4444;font-size:16px;margin-bottom:6px;display:block;"></i>
                    <span style="font-size:12px;font-weight:800;color:#b91c1c;">ليس لديك مرشد أكاديمي حالياً</span>
                </div>`);
        }
        return;
    }

    const { doctorName, doctorWhatsapp, courses } = advisorInfoCache;
    document.getElementById('seNoAdvisorMsg')?.remove();

    const coursesHtml = courses.length
        ? courses.map(c => `
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#334155;padding:4px 0;">
                <i class="fa-solid fa-circle-check" style="color:#10b981;font-size:11px;"></i>
                ${escapeHtml(c.name)}
            </div>`).join('')
        : '';
    const html = `
        <div id="seAdvisorInfoCard" style="
            background:#f0fdf4;border:1.5px solid #a7f3d0;border-radius:16px;
            padding:14px 16px;margin-bottom:14px;
        ">
           <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;direction:ltr;justify-content:flex-start;">
                <i class="fa-solid fa-user-tie" style="color:#059669;font-size:13px;"></i>
<span style="font-size:12px;font-weight:800;color:#059669;">
                    Academic Advisor: ${doctorName ? escapeHtml(doctorName) : '—'}
                </span>
                <button class="se-whatsapp-btn"
                    data-wa="${doctorWhatsapp ? escapeHtml(doctorWhatsapp) : ''}"
                    title="${doctorWhatsapp ? 'تواصل عبر واتساب' : 'التواصل غير متاح'}"
                    style="
                        margin-inline-start:auto; width:26px; height:26px; border:none; border-radius:8px;
                        display:flex; align-items:center; justify-content:center; cursor:pointer;
                        background:${doctorWhatsapp ? '#25D366' : '#ef4444'}; color:#fff; font-size:13px;
                        box-shadow:0 2px 6px rgba(0,0,0,.15);
                    ">
                    <i class="fa-brands fa-whatsapp"></i>
                </button>
            </div>
            <div style="border-top:1px dashed #a7f3d0;padding-top:8px;">
                ${coursesHtml}
            </div>
        </div>`;

    if (card) {
        card.outerHTML = html;
    } else {
        container.insertAdjacentHTML('afterbegin', html);
    }

    if (!container._waHandlerAttached) {
        container.addEventListener('click', _onWaClick);
        container._waHandlerAttached = true;
    }
}
window.initStudentEnrollmentNotifier = async function () {
    console.log("🔔 [DEBUG] initStudentEnrollmentNotifier بدأ التنفيذ");
    const user = window.auth?.currentUser;
    if (!user) return;

    if (_listenerAttached && window.enrollmentNotifierUnsubscribe) return;

    try {
        if (!currentStudentData) {
            const data = await fetchStudentData(user.uid);
            if (!data) return;
            currentStudentData = data;
        }

        const { college } = currentStudentData;
        if (!college) {
            console.warn("⚠️ [Notifier] لم يُعثر على الكلية — الإشعار متوقف.");
            return;
        }
        const signalRef = doc(db, "enrollment_signals", college);

        _listenerAttached = true;

        window.enrollmentNotifierUnsubscribe = onSnapshot(signalRef, async () => {
            openSubjectsCache = [];
            _cacheTimestamp = 0;

            try {
                await fetchOpenSubjects(college);
            } catch (e) {
                console.warn("⚠️ [Notifier] فشل تحديث الكاش:", e.message);
                if (!_notifierReady) {
                    _notifierReady = true;
                    _notifierReadyCbs.forEach(cb => cb());
                    _notifierReadyCbs = [];
                }
                return;
            }

            const unenrolled = openSubjectsCache.filter(sub =>
                !enrolledSubjectIds.has(sub.docId)
            ).length;

            updateEnrollmentBadge(unenrolled);

            if (!_notifierReady) {
                _notifierReady = true;
                _notifierReadyCbs.forEach(cb => cb());
                _notifierReadyCbs = [];
            }

        }, err => {
            console.error("❌ [Notifier]", err);
            _listenerAttached = false;
            if (!_notifierReady) {
                _notifierReady = true;
                _notifierReadyCbs.forEach(cb => cb());
                _notifierReadyCbs = [];
            }
        });

    } catch (e) {
        console.error("❌ [Notifier] خطأ حرج:", e);
        _listenerAttached = false;
    }
};

window.openStudentEnrollmentModal = async function () {
    const modal = document.getElementById('studentEnrollmentModal');
    const container = document.getElementById('studentEnrollmentListContainer');
    if (!modal || !container) return;

    modal.style.display = 'flex';
    container.innerHTML = skeletonHTML();

    const user = window.auth?.currentUser;
    if (!user) {
        modal.style.display = 'none';
        showToast?.("⚠️ يرجى تسجيل الدخول بحسابك الجامعي أولاً", 3000, "#f59e0b");
        if (typeof openAuthDrawer === 'function') openAuthDrawer();
        return;
    }

    try {
        if (!currentStudentData) {
            const data = await fetchStudentData(user.uid);
            if (!data) {
                renderError(container, "لم يتم العثور على بياناتك. يرجى التواصل مع الإدارة.");
                return;
            }
            currentStudentData = data;
        }

        initAdvisorInfoListener(user.uid);

        if (isCacheValid()) {
            renderSubjects(container);
            return;
        }
        if (_notifierReady && isCacheValid()) {
            renderSubjects(container);
            return;
        }

        if (!_notifierReady) {
            await new Promise(resolve => {
                _notifierReadyCbs.push(resolve);
                if (!_listenerAttached) {
                    window.initStudentEnrollmentNotifier();
                }
            });
        } else {
            await fetchOpenSubjects(currentStudentData.college);
        }

        if (!openSubjectsCache.length && !isCacheValid()) {
            renderError(container, "تعذر تحميل المواد، تأكد من اتصالك وحاول مجدداً.");
            return;
        }

        renderSubjects(container);

    } catch (e) {
        console.error(e);
        renderError(container, "حدث خطأ في الاتصال بالخوادم.");
    }
};

window.closeStudentEnrollmentModal = function () {
    const modal = document.getElementById('studentEnrollmentModal');
    if (modal) modal.style.display = 'none';
};

function renderSubjects(container) {
    if (!openSubjectsCache.length) {
        container.innerHTML = '';
        renderAdvisorInfoCard();
        container.innerHTML += `
            <div class="se-empty">
                <span class="se-empty-emoji">☕</span>
                <div class="se-empty-title">لا توجد مواد متاحة حالياً</div>
                <div class="se-empty-sub">
                    سيصلك إشعار تلقائياً عندما يفتح الدكتور باب التسجيل لمادة جديدة.
                </div>
            </div>`;
        _clickHandlerAttached = false;
        return;
    }

    const total = openSubjectsCache.length;
    const enrolled = openSubjectsCache.filter(sub =>
        enrolledSubjectIds.has(sub.docId)
    ).length;

    let html = `
        <div class="se-stats-row">
            <div class="se-chip">
                <i class="fa-solid fa-book-open" style="color:#7c3aed;"></i>
                ${total} مادة متاحة
            </div>
            ${enrolled > 0 ? `
            <div class="se-chip green">
                <i class="fa-solid fa-circle-check"></i>
                مسجل في ${enrolled} ${enrolled === 1 ? 'مادة' : 'مواد'}
            </div>` : ''}
        </div>
        <div class="se-notice">
            <i class="fa-solid fa-circle-info" style="font-size:15px; flex-shrink:0;"></i>
            التسجيل نهائي ولا يمكن التراجع عنه — اختر بعناية
        </div>`;

    openSubjectsCache.forEach((sub, idx) => {
        const isEnrolled = enrolledSubjectIds.has(sub.docId);

        html += `
        <div class="se-card ${isEnrolled ? 'enrolled' : ''}" style="animation-delay:${idx * .06}s;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                <div style="flex:1;min-width:0;">
                    ${isEnrolled ? `<div class="se-enrolled-label"><i class="fa-solid fa-circle-check"></i> مسجل بنجاح</div>` : ''}
                    <div style="font-size:14px;font-weight:900;color:#1e293b;line-height:1.45;">
                        ${escapeHtml(sub.subjectName)}
                    </div>
                    <div class="se-doc-tag">
                        <i class="fa-solid fa-user-tie" style="color:#7c3aed;font-size:10px;"></i>
                        د. ${escapeHtml(sub.doctorName || "—")}
                    </div>
                </div>
                <div id="action_${escapeHtml(sub.docId)}">
                    ${isEnrolled
                ? `<span class="se-enrolled-badge"><i class="fa-solid fa-check-double"></i> مسجل</span>`
                : `<button
                                class="se-btn-enroll"
                                data-doc-id="${escapeHtml(sub.docId)}"
                                data-subject-name="${escapeHtml(sub.subjectName)}">
                                <i class="fa-solid fa-plus"></i> تسجيل
                           </button>`
            }
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
    renderAdvisorInfoCard();
    if (!_clickHandlerAttached) {
        container.addEventListener('click', _onEnrollClick);
        _clickHandlerAttached = true;
    }
}

function _onEnrollClick(e) {
    const btn = e.target.closest('.se-btn-enroll');
    if (!btn || btn.disabled) return;

    const docId = btn.dataset.docId;
    const subjectName = btn.dataset.subjectName;
    if (!docId || !subjectName) return;

    showConfirmModal(subjectName, () => executeEnrollment(subjectName, docId));
}

function renderError(container, msg) {
    _clickHandlerAttached = false;
    container.innerHTML = `
        <div class="se-error">
            <i class="fa-solid fa-triangle-exclamation"
               style="font-size:46px;color:#f59e0b;display:block;margin-bottom:14px;"></i>
            <div style="font-size:14px;font-weight:900;color:#1e293b;margin-bottom:6px;">حدث خطأ</div>
            <div style="font-size:12px;color:#64748b;">${escapeHtml(msg)}</div>
            <button class="se-retry" id="seRetryBtn">
                <i class="fa-solid fa-rotate-right"></i> إعادة المحاولة
            </button>
        </div>`;
    document.getElementById('seRetryBtn')?.addEventListener('click', () =>
        window.openStudentEnrollmentModal()
    );
}

function showConfirmModal(subjectName, onConfirm) {
    document.getElementById('seConfirmOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'seConfirmOverlay';
    overlay.className = 'se-overlay';
    overlay.innerHTML = `
        <div class="se-confirm-box" id="seConfirmBox">
            <div class="se-confirm-head">
                <div class="se-confirm-icon-wrap">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div class="se-confirm-title">تأكيد التسجيل في المادة</div>
                <div class="se-confirm-subject">${escapeHtml(subjectName)}</div>
            </div>
            <div class="se-confirm-body">
                <ul class="se-confirm-list">
                    <li><span>⚠️</span><span>هذا الإجراء <strong>نهائي</strong> ولا يمكن التراجع عنه.</span></li>
                    <li><span>📋</span><span>سيُدرَج اسمك رسمياً في كشوف الحضور والغياب.</span></li>
                    <li><span>✅</span><span>تأكد أن المادة تناسب جدولك الدراسي هذا الترم.</span></li>
                </ul>
            </div>
            <div class="se-confirm-footer">
                <button class="se-btn-cancel" id="seConfirmCancelBtn">إلغاء</button>
                <button class="se-btn-go"     id="seConfirmOkBtn">
                    <i class="fa-solid fa-check"></i> تأكيد التسجيل
                </button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    document.getElementById('seConfirmCancelBtn').addEventListener('click', close);
    document.getElementById('seConfirmOkBtn').addEventListener('click', () => {
        close();
        onConfirm();
    });
    overlay.addEventListener('click', e => {
        if (!document.getElementById('seConfirmBox')?.contains(e.target)) close();
    });
    const onKey = e => {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
}

async function executeEnrollment(subjectName, subjectDocId) {
    const user = window.auth?.currentUser;
    if (!user) {
        showToast?.("⚠️ انتهت الجلسة، يرجى تسجيل الدخول", 3000, "#ef4444");
        return;
    }

    const actionWrap = document.getElementById(`action_${subjectDocId}`);
    const btn = actionWrap?.querySelector('.se-btn-enroll');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch" style="animation:se-spin .8s linear infinite;"></i> جاري التسجيل...';
    }

    showToast?.("⏳ جاري تسجيلك في المادة...", 2000, "#3b82f6");

    try {
        const { studentId, fullName, group } = currentStudentData;
        const idToken = await user.getIdToken();

        const response = await fetch('https://student2-backend.vercel.app/api/student-enroll', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                subjectDocId,
                subjectName,
                studentId,
                studentName: fullName,
                studentGroup: group
            })
        });

        const result = await response.json();

        if (response.ok) {
            showToast?.(`✅ ${result.message || 'تم التسجيل رسمياً في المادة.'}`, 4000, "#10b981");
            if (typeof playSuccess === "function") playSuccess();

            // ✅ حدّث الحالة المحلية بدون أي قراءة إضافية من Firestore
            enrolledSubjectIds.add(subjectDocId);

            if (actionWrap) {
                actionWrap.innerHTML = `
                    <span class="se-enrolled-badge">
                        <i class="fa-solid fa-check-double"></i> مسجل
                    </span>`;
            }

            const card = actionWrap?.closest('.se-card');
            if (card) {
                card.classList.add('enrolled');
                const titleDiv = card.querySelector('[style*="font-weight:900"]');
                if (titleDiv && !card.querySelector('.se-enrolled-label')) {
                    const lbl = document.createElement('div');
                    lbl.className = 'se-enrolled-label';
                    lbl.innerHTML = '<i class="fa-solid fa-circle-check"></i> مسجل بنجاح';
                    titleDiv.before(lbl);
                }
            }
            const newUnenrolled = openSubjectsCache.filter(sub =>
                !enrolledSubjectIds.has(sub.docId)
            ).length;
            updateEnrollmentBadge(newUnenrolled);

        } else {
            showToast?.(`❌ ${result.error || "فشل التسجيل، تواصل مع الدعم"}`, 5000, "#ef4444");
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-plus"></i> تسجيل';
            }
        }

    } catch (e) {
        console.error("Enrollment Error:", e);
        showToast?.("❌ حدث خطأ في الاتصال بالخادم.", 3000, "#ef4444");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-plus"></i> تسجيل';
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    window.auth?.onAuthStateChanged(user => {
        if (user && !_listenerAttached) {
            window.initStudentEnrollmentNotifier();
        }
    });
});
