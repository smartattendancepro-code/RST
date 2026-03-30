import './session/SessionManager.js';
import {
    doc, getDoc, updateDoc, collection, query, where, getDocs,
    onSnapshot, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { i18n } from './i18n.js';
import { applyVipTheme } from './VipThemeManager.js';


const db = window.db;
const auth = window.auth;


window.startLiveSnapshotListener = function () {
    const user = auth.currentUser;
    if (!user) {
        setTimeout(window.startLiveSnapshotListener, 500);
        return;
    }

    const grid = document.getElementById('liveStudentsGrid');
    if (grid) {
        grid.innerHTML = '';
        grid.style.display = 'block';
    }

    const countEl  = document.getElementById('livePresentCount');
    const extraEl  = document.getElementById('liveExtraCount');

    const targetRoomUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
    if (!targetRoomUID) return;

    let maxLimit    = 9999;
    let currentCount = 0;

    const updateCapacityUI = () => {
        if (!extraEl) return;
        const limit     = parseInt(maxLimit);
        const count     = parseInt(currentCount);

        if (limit >= 9999 || isNaN(limit)) {
            extraEl.innerHTML  = `<span style="font-size:24px;">∞</span> <span style="font-size:11px;opacity:0.8;font-weight:normal;">OPEN</span>`;
            extraEl.style.color = "#3b82f6";
        } else {
            const remaining = limit - count;
            let remainingHtml = remaining;
            if (remaining < 0) {
                extraEl.style.color      = "#ef4444";
                extraEl.style.textShadow = "0 0 15px rgba(239,68,68,0.2)";
                remainingHtml = `<i class="fa-solid fa-triangle-exclamation" style="font-size:12px;"></i> ${remaining}`;
            } else {
                extraEl.style.color      = "#10b981";
                extraEl.style.textShadow = "none";
            }
            extraEl.innerHTML = `
                <span style="font-weight:800;font-size:20px;">${remainingHtml}</span>
                <span style="font-size:12px;color:#94a3b8;font-weight:600;"> / ${limit}</span>`;
        }
    };

    const sessionRef = doc(db, "active_sessions", targetRoomUID);

    const updateSessionHeaderUI = (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        if (document.getElementById('liveDocName'))     document.getElementById('liveDocName').innerText     = data.doctorName     || "Professor";
        if (document.getElementById('liveSubjectTag'))  document.getElementById('liveSubjectTag').innerText  = data.allowedSubject || "Subject";
        if (document.getElementById('liveHallTag'))     document.getElementById('liveHallTag').innerHTML     = `<i class="fa-solid fa-building-columns"></i> ${data.hall || "Hall"}`;
        if (document.getElementById('liveGroupTag'))    document.getElementById('liveGroupTag').innerText    = `GROUPS: ${(data.targetGroups || []).join(', ')}`;

        const avatarLink = document.getElementById('liveDocAvatar');
        if (avatarLink) {
            avatarLink.innerHTML       = `<i class="fa-solid ${data.doctorAvatar || 'fa-user-doctor'}"></i>`;
            avatarLink.onclick         = null;
            avatarLink.style.cursor    = "default";
            avatarLink.style.pointerEvents = "none";
        }

        const nameLink = document.getElementById('liveDocName');
        if (nameLink) {
            nameLink.onclick           = null;
            nameLink.style.cursor      = "default";
            nameLink.style.pointerEvents = "none";
        }

        if (document.getElementById('liveSessionCodeDisplay'))
            document.getElementById('liveSessionCodeDisplay').innerText = "••••••";

        const doorStatus = document.getElementById('doorStatusText');
        if (doorStatus) {
            if (data.sessionCode === "PAUSED") {
                doorStatus.innerHTML   = '<i class="fa-solid fa-mug-hot fa-bounce"></i> PAUSED';
                doorStatus.style.color = "#f59e0b";
            } else {
                doorStatus.innerHTML   = data.isDoorOpen
                    ? '<i class="fa-solid fa-door-open fa-fade"></i> OPEN'
                    : '<i class="fa-solid fa-door-closed"></i> CLOSED';
                doorStatus.style.color = data.isDoorOpen ? "#10b981" : "#ef4444";
            }
        }

        maxLimit     = (data.maxStudents !== undefined && data.maxStudents !== null && data.maxStudents !== "")
            ? parseInt(data.maxStudents) : 9999;
        currentCount = data.active_count || 0;
        if (countEl) countEl.innerText = currentCount;
        updateCapacityUI();

        if (!data.isActive) {
            showToast("🏁 انتهت المحاضرة", 4000, "#10b981");
            setTimeout(() => { goHome(); location.reload(); }, 1500);
        }
    };

    getDoc(sessionRef).then(updateSessionHeaderUI).catch(e => console.log("Header Prefetch:", e));
    if (window.unsubscribeHeaderSession) window.unsubscribeHeaderSession();
    window.unsubscribeHeaderSession = onSnapshot(sessionRef, updateSessionHeaderUI);

    /* ── participant card (current user only) ── */
    const participantsRef = collection(db, "active_sessions", targetRoomUID, "participants");
    const q = query(participantsRef, where("uid", "==", user.uid));

    if (window.unsubscribeLiveSnapshot) window.unsubscribeLiveSnapshot();

    window.unsubscribeLiveSnapshot = onSnapshot(q, (snapshot) => {
        if (!grid) return;
        grid.innerHTML = '';   

        snapshot.forEach((docSnap) => {
            const s = docSnap.data();
            if (s.status === 'expelled') return;

            const isOnBreak = s.status === 'on_break';
            const isLeft    = s.status === 'left';
            const opacityVal   = (isLeft || isOnBreak) ? '0.5' : '1';
            const borderStyle  = isOnBreak ? '2px dashed #f59e0b' : '1px solid #e2e8f0';

            const rawCount = s.segment_count;
            const segCount = (rawCount && !isNaN(rawCount)) ? parseInt(rawCount) : 1;
            let countBadge = '';
            if (segCount > 1) {
                const badgeColor = isOnBreak ? '#64748b' : '#0ea5e9';
                countBadge = `<div style="position:absolute;top:-10px;left:-10px;background:${badgeColor};color:white;font-family:'Outfit',sans-serif;font-size:11px;font-weight:800;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #f8fafc;z-index:100;box-shadow:0 4px 6px rgba(0,0,0,0.15);animation:popIn 0.3s cubic-bezier(0.175,0.885,0.32,1.275);">${segCount}</div>`;
            }

            let statusColor = isLeft ? "#94a3b8" : (s.isUnruly ? "#ef4444" : (s.isUniformViolation ? "#f97316" : "#10b981"));
            let statusText  = isLeft ? "مغادر"   : (s.isUnruly ? "مشاغب"  : (s.isUniformViolation ? "مخالف"   : "حاضر"));

            const card = document.createElement('div');
            card.className  = 'live-st-card student-view-card is-me-card';
            card.style.cssText = `background:white;border-radius:15px;padding:20px;display:flex;flex-direction:column;align-items:center;opacity:${opacityVal};transition:0.3s;width:100%;max-width:320px;margin:0 auto;border:${borderStyle};position:relative;overflow:visible !important;`;
            card.innerHTML  = `
                <div class="me-badge">أنت</div>
                ${countBadge}
                <div style="width:70px;height:70px;border-radius:50%;background:#f8fafc;border:3.5px solid ${statusColor};display:flex;align-items:center;justify-content:center;font-size:30px;color:#0284c7;margin-bottom:10px;z-index:2;">
                    <i class="fa-solid ${s.avatarClass || 'fa-user-graduate'}"></i>
                </div>
                <div style="text-align:center;">
                    <div class="st-name notranslate" translate="no" style="font-size:16px;font-weight:900;color:#1e293b;text-align:center;direction:auto;">${s.name}</div>
                    <div class="st-id en-font" style="font-size:12px;color:#64748b;">#${s.id}</div>
                </div>
                <div style="margin-top:12px;padding:4px 15px;border-radius:6px;font-size:11px;font-weight:800;border:1px solid ${statusColor}30;background:${statusColor}15;color:${statusColor};">
                    ${statusText}
                </div>`;

            grid.appendChild(card);
        });

        if (grid.children.length > 0 && !grid.querySelector('.wait-note')) {
            const noteDiv = document.createElement('div');
            noteDiv.className  = 'wait-note';
            noteDiv.style.cssText = `margin-top:50px;text-align:center;color:#070707;font-size:15px;width:100%;font-family:'Tajawal',sans-serif;opacity:1;`;
            noteDiv.innerHTML  = `<i class="fa-solid fa-circle-info" style="margin-left:5px;"></i> سيتم إتاحة عرض قائمة الحضور الكاملة في التحديث القادم`;
            grid.appendChild(noteDiv);
        }
    });
};
