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
        console.log("⏳ Waiting for Auth to initialize...");
        setTimeout(window.startLiveSnapshotListener, 500);
        return;
    }

    if (window.studentCountInterval) clearInterval(window.studentCountInterval);

    const grid = document.getElementById('liveStudentsGrid');
    if (grid) grid.innerHTML = '';

    const countEl = document.getElementById('livePresentCount');
    const extraEl = document.getElementById('liveExtraCount');

    const capacityLabel = extraEl?.parentElement?.querySelector('.stat-label') || document.querySelector("label[for='liveExtraCount']");
    if (capacityLabel) capacityLabel.innerText = "CAPACITY STATUS";

    const adminToken = sessionStorage.getItem("secure_admin_session_token_v99");
    const isDean = (adminToken === "SUPER_ADMIN_ACTIVE");
    const isDoctor = (adminToken === "ADMIN_ACTIVE");

    const adminFab = document.getElementById('adminFabControls');
    if (adminFab) {
        if (isDoctor || isDean) {
            adminFab.style.setProperty('display', 'flex', 'important');
        } else {
            adminFab.style.setProperty('display', 'none', 'important');
        }
    }

    if (grid) {
        if (isDoctor || isDean) {
            grid.style.setProperty('display', 'grid', 'important');
            grid.style.setProperty('grid-template-columns', '1fr', 'important');
            grid.style.setProperty('gap', '15px', 'important');
        } else {
            grid.style.removeProperty('grid-template-columns');
            grid.style.display = 'block';
        }
    }

    let targetRoomUID;

    if (isDean) {
        targetRoomUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
    } else if (isDoctor) {
        const storedTarget = sessionStorage.getItem('TARGET_DOCTOR_UID');
        targetRoomUID = (storedTarget && storedTarget !== user.uid) ? storedTarget : user.uid;
    } else {
        targetRoomUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
    }

    applyVipTheme(targetRoomUID);


    if (!targetRoomUID) {
        return;
    }

    if (isDoctor && user.uid === targetRoomUID) document.body.classList.add('admin-mode');
    else document.body.classList.remove('admin-mode');

    let maxLimit = 9999;
    let currentCount = 0;

    const updateCapacityUI = () => {
        if (!extraEl) return;

        const limit = parseInt(maxLimit);
        const count = parseInt(currentCount);

        if (limit >= 9999 || isNaN(limit)) {
            extraEl.innerHTML = `<span style="font-size:24px;">∞</span> <span style="font-size:11px; opacity:0.8; font-weight:normal;">OPEN</span>`;
            extraEl.style.color = "#3b82f6";
        } else {
            const remaining = limit - count;
            let remainingHtml = remaining;

            if (remaining < 0) {
                extraEl.style.color = "#ef4444";
                extraEl.style.textShadow = "0 0 15px rgba(239, 68, 68, 0.2)";
                remainingHtml = `<i class="fa-solid fa-triangle-exclamation" style="font-size:12px;"></i> ${remaining}`;
            } else {
                extraEl.style.color = "#10b981";
                extraEl.style.textShadow = "none";
            }

            extraEl.innerHTML = `
                <span style="font-weight:800; font-size:20px;">${remainingHtml}</span>
                <span style="font-size:12px; color:#94a3b8; font-weight:600;"> / ${limit}</span>
            `;
        }
    };


    const sessionRef = doc(db, "active_sessions", targetRoomUID);

    const updateSessionHeaderUI = (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();

            const myToken = sessionStorage.getItem("secure_admin_session_token_v99");
            const iAmAdmin = (myToken === "ADMIN_ACTIVE" || myToken === "SUPER_ADMIN_ACTIVE");

            if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = data.doctorName || "Professor";
            if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = data.allowedSubject || "Subject";
            if (document.getElementById('liveHallTag')) document.getElementById('liveHallTag').innerHTML = `<i class="fa-solid fa-building-columns"></i> ${data.hall || "Hall"}`;
            if (document.getElementById('liveGroupTag')) document.getElementById('liveGroupTag').innerText = `GROUPS: ${(data.targetGroups || []).join(', ')}`;

            const avatarLink = document.getElementById('liveDocAvatar');
            if (avatarLink) {
                avatarLink.innerHTML = `<i class="fa-solid ${data.doctorAvatar || 'fa-user-doctor'}"></i>`;

                if (iAmAdmin) {
                    avatarLink.onclick = () => openPublicProfile(targetRoomUID, true);
                    avatarLink.style.cursor = "pointer";
                    avatarLink.style.pointerEvents = "auto";
                } else {
                    avatarLink.onclick = null;
                    avatarLink.style.cursor = "default";
                    avatarLink.style.pointerEvents = "none";
                }
            }

            const nameLink = document.getElementById('liveDocName');
            if (nameLink) {
                if (iAmAdmin) {
                    nameLink.onclick = () => openPublicProfile(targetRoomUID, true);
                    nameLink.style.cursor = "pointer";
                    nameLink.style.pointerEvents = "auto";
                } else {
                    nameLink.onclick = null;
                    nameLink.style.cursor = "default";
                    nameLink.style.pointerEvents = "none";
                }
            }

            if (document.getElementById('liveSessionCodeDisplay')) {
                document.getElementById('liveSessionCodeDisplay').innerText = (isDoctor || isDean) ? (data.sessionCode || "------") : "••••••";
            }

            const doorStatus = document.getElementById('doorStatusText');
            if (doorStatus) {
                if (data.sessionCode === "PAUSED") {
                    doorStatus.innerHTML = '<i class="fa-solid fa-mug-hot fa-bounce"></i> PAUSED';
                    doorStatus.style.color = "#f59e0b";
                } else {
                    doorStatus.innerHTML = data.isDoorOpen ? '<i class="fa-solid fa-door-open fa-fade"></i> OPEN' : '<i class="fa-solid fa-door-closed"></i> CLOSED';
                    doorStatus.style.color = data.isDoorOpen ? "#10b981" : "#ef4444";
                }
            }

            if (data.maxStudents !== undefined && data.maxStudents !== null && data.maxStudents !== "") {
                maxLimit = parseInt(data.maxStudents);
            } else {
                maxLimit = 9999;
            }

            if (!isDoctor && !isDean) {
                const centralCount = data.active_count || 0;
                currentCount = centralCount;
                if (countEl) countEl.innerText = centralCount;
            }

            updateCapacityUI();

            if (!data.isActive && !isDoctor && !isDean) {
                showToast("🏁 انتهت المحاضرة", 4000, "#10b981");
                setTimeout(() => { goHome(); location.reload(); }, 1500);
            }
        }
    };

    getDoc(sessionRef).then(updateSessionHeaderUI).catch(e => console.log("Header Prefetch:", e));

    if (window.unsubscribeHeaderSession) window.unsubscribeHeaderSession();

    window.unsubscribeHeaderSession = onSnapshot(sessionRef, updateSessionHeaderUI);


    const participantsRef = collection(db, "active_sessions", targetRoomUID, "participants");
    let q;

    if (isDoctor || isDean) {
        q = query(participantsRef, orderBy("timestamp", "desc"));
    } else {
        q = query(participantsRef, where("uid", "==", user.uid));
    }

    if (window.unsubscribeLiveSnapshot) window.unsubscribeLiveSnapshot();

    const domCache = new Map();


    window.unsubscribeLiveSnapshot = onSnapshot(q, (snapshot) => {

        const activeDocs = snapshot.docs.filter(d => d.data().status === 'active');

        if (isDoctor || isDean) {
            currentCount = activeDocs.length;
            if (countEl) countEl.innerText = currentCount;
            updateCapacityUI();

            if (window.updateCounterTimeout) clearTimeout(window.updateCounterTimeout);
            window.updateCounterTimeout = setTimeout(() => {
                updateDoc(doc(db, "active_sessions", targetRoomUID), {
                    active_count: currentCount
                }).catch(err => console.log("Counter Sync Skip", err));
            }, 2000);
        } else {

            if (window.studentCountInterval) {
                clearInterval(window.studentCountInterval);
                window.studentCountInterval = null;
            }
        }

        if (grid) {
            const currentIds = new Set();
            let sortedDocs = [];
            snapshot.forEach(doc => sortedDocs.push(doc));

            if (isDoctor || isDean) {
                sortedDocs.sort((a, b) => {
                    const sA = a.data();
                    const sB = b.data();

                    const trapA = sA.trap_report || { is_device_match: true, in_range: true };
                    const trapB = sB.trap_report || { is_device_match: true, in_range: true };

                    const isRedA = (trapA.is_device_match === false) || (trapA.is_in_range === false);
                    const isRedB = (trapB.is_device_match === false) || (trapA.is_in_range === false);

                    if (isRedA && !isRedB) return -1;
                    if (!isRedA && isRedB) return 1;

                    return 0;
                });
            }

            sortedDocs.forEach((docSnap, index) => {
                const s = docSnap.data();
                currentIds.add(docSnap.id);

                if (s.status === 'expelled') {
                    if (domCache.has(docSnap.id)) {
                        domCache.get(docSnap.id).element.remove();
                        domCache.delete(docSnap.id);
                    }
                    return;
                }

                const isOnBreak = s.status === 'on_break';
                const isLeft = s.status === 'left';
                const opacityVal = (isLeft || isOnBreak) ? '0.5' : '1';
                const borderStyle = isOnBreak ? '2px dashed #f59e0b' : '1px solid #e2e8f0';
                const rawCount = s.segment_count;
                const segCount = (rawCount && !isNaN(rawCount)) ? parseInt(rawCount) : 1;

                let countBadge = '';
                if (segCount > 1) {
                    let badgeColor = isOnBreak ? '#64748b' : '#0ea5e9';
                    countBadge = `<div style="position: absolute; top: -10px; left: -10px; background: ${badgeColor}; color: white; font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 800; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #f8fafc; z-index: 100; box-shadow: 0 4px 6px rgba(0,0,0,0.15); animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">${segCount}</div>`;
                }

                const clickAction = "";

                let finalInnerHTML = '';
                let finalClassName = '';
                let finalCSSText = '';

                if (isDoctor || isDean) {
                    const trap = s.trap_report || { is_device_match: true, in_range: true, is_gps_success: true };
                    const deviceIcon = trap.is_device_match ? `<div title="جهاز أصلي" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-mobile-screen" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="جهاز مختلف" style="background:#fee2e2; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; animation: shake 0.5s infinite;"><i class="fa-solid fa-mobile-screen-button" style="color:#dc2626; font-size:14px;"></i></div>`;
                    const rangeIcon = trap.is_in_range ? `<div title="داخل النطاق" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-location-dot" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="خارج النطاق" style="background:#fee2e2; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-location-crosshairs" style="color:#dc2626; font-size:14px;"></i></div>`;
                    const isGpsOk = (trap.gps_success !== undefined) ? trap.gps_success : trap.is_gps_success;
                    const gpsIcon = isGpsOk ? `<div title="GPS نشط" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-satellite-dish" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="فشل GPS" style="background:#f1f5f9; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-satellite-dish" style="color:#94a3b8; font-size:14px;"></i></div>`;
                    const badgesHTML = `<div style="display:flex; justify-content:center; gap:8px; margin-top:6px; border-top:1px dashed #e2e8f0; padding-top:6px; width:100%;">${deviceIcon} ${rangeIcon} ${gpsIcon}</div>`;
                    const leaveIcon = isLeft ? 'fa-arrow-rotate-left' : 'fa-person-walking-arrow-right';

                    finalClassName = `live-st-card admin-view-card`;
                    finalCSSText = `background: #ffffff; border-radius: 18px; border: ${borderStyle}; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 5px; box-shadow: 0 4px 10px rgba(206, 99, 38, 0.03); height: auto; min-height: 220px; width: 100%; position: relative; overflow: visible !important; opacity: ${opacityVal}; transition: all 0.3s ease;`;

                    finalInnerHTML = `
                            ${countBadge}
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <div ${clickAction} style="cursor:pointer; width:55px; height:55px; border-radius:50%; background:#f8fafc; display:flex; align-items:center; justify-content:center; font-size:24px; color:#0ea5e9; border:2.5px solid ${s.isUnruly ? '#ef4444' : (s.isUniformViolation ? '#f97316' : '#e2e8f0')};">
                                    <i class="fa-solid ${s.avatarClass || 'fa-user'}"></i>
                                </div>
                                <div ${clickAction} class="st-name" style="cursor:pointer; font-size:12px; font-weight:800; color:#0f172a; margin-top:5px; text-decoration:none;">${s.name}</div>
                                <div class="st-id en-font" style="font-size:10px; color:#64748b; background:#f1f5f9; padding:1px 8px; border-radius:10px;">#${s.id}</div>
                                ${badgesHTML}
                            </div>
                            <div style="display:flex; justify-content:center; gap:30px; border-top:1px solid #f1f5f9; padding-top:12px;">
                                <button onclick="toggleStudentFlag('${docSnap.id}', 'isUniformViolation', ${s.isUniformViolation})" class="mini-action-btn" style="background:${s.isUniformViolation ? '#f97316' : '#fff7ed'}; color:${s.isUniformViolation ? 'white' : '#ea580c'};"><i class="fa-solid fa-shirt"></i></button>
                                <button onclick="toggleStudentFlag('${docSnap.id}', 'isUnruly', ${s.isUnruly})" class="mini-action-btn" style="background:${s.isUnruly ? '#ef4444' : '#fef2f2'}; color:${s.isUnruly ? 'white' : '#ef4444'};"><i class="fa-solid fa-fire"></i></button>
                                <button onclick="toggleStudentStatus('${docSnap.id}', '${s.status}')" class="mini-action-btn" style="background:#f8fafc; color:#64748b;"><i class="fa-solid ${leaveIcon}"></i></button>
                                <button onclick="updateStudentStatus('${docSnap.id}', 'expelled')" class="mini-action-btn" style="background:#fee2e2; color:#b91c1c;"><i class="fa-solid fa-ban"></i></button>
                            </div>`;
                } else {
                    const isMe = (user.uid === s.uid);
                    let statusColor = isLeft ? "#94a3b8" : (s.isUnruly ? "#ef4444" : (s.isUniformViolation ? "#f97316" : "#10b981"));
                    let statusText = isLeft ? "مغادر" : (s.isUnruly ? "مشاغب" : (s.isUniformViolation ? "مخالف" : "حاضر"));
                    const meClass = isMe ? 'is-me-card' : '';

                    finalClassName = `live-st-card student-view-card ${meClass}`;
                    finalCSSText = `background:white; border-radius:15px; padding:20px; display:flex; flex-direction:column; align-items:center; opacity:${opacityVal}; transition:0.3s; width:100%; max-width: 320px; margin: 0 auto; border: ${borderStyle}; position: relative; overflow: visible !important;`;

                    finalInnerHTML = `
                        ${isMe ? '<div class="me-badge">أنت</div>' : ''}
                            ${countBadge}
                            <div ${clickAction} style="cursor:pointer; width:70px; height:70px; border-radius:50%; background:#f8fafc; border:3.5px solid ${statusColor}; display:flex; align-items:center; justify-content:center; font-size:30px; color:#0284c7; margin-bottom:10px; z-index:2;">
                                <i class="fa-solid ${s.avatarClass || 'fa-user-graduate'}"></i>
                            </div>
                            <div style="text-align:center;">
                                <div ${clickAction} class="st-name notranslate" translate="no" style="cursor:pointer; font-size:16px; font-weight:900; color:#1e293b; text-decoration:none; text-align: center; direction: auto;">
    ${s.name}
</div>
                                <div class="st-id en-font" style="font-size:12px; color:#64748b;">#${s.id}</div>
                            </div>
                            <div style="margin-top:12px; padding:4px 15px; border-radius:6px; font-size:11px; font-weight:800; border:1px solid ${statusColor}30; background:${statusColor}15; color:${statusColor};">
                                ${statusText}
                            </div>`;
                }
                const dataSignature = JSON.stringify({
                    st: s.status, ur: s.isUnruly, uv: s.isUniformViolation,
                    tr: s.trap_report, sg: segCount, nm: s.name, av: s.avatarClass
                });

                let cardElement;

                if (domCache.has(docSnap.id)) {
                    const cached = domCache.get(docSnap.id);
                    cardElement = cached.element;

                    if (cached.signature !== dataSignature) {
                        if (cardElement.innerHTML !== finalInnerHTML) cardElement.innerHTML = finalInnerHTML;
                        if (cardElement.className !== finalClassName) cardElement.className = finalClassName;
                        if (cardElement.style.cssText !== finalCSSText) cardElement.style.cssText = finalCSSText;

                        cached.signature = dataSignature;
                    }
                } else {
                    cardElement = document.createElement('div');
                    cardElement.id = `card-${docSnap.id}`;
                    cardElement.className = finalClassName;
                    cardElement.style.cssText = finalCSSText;
                    cardElement.innerHTML = finalInnerHTML;

                    domCache.set(docSnap.id, { element: cardElement, signature: dataSignature });
                }

                const currentChildAtIndex = grid.children[index];
                if (currentChildAtIndex !== cardElement) {
                    if (currentChildAtIndex) {
                        grid.insertBefore(cardElement, currentChildAtIndex);
                    } else {
                        grid.appendChild(cardElement);
                    }
                }
            });

            domCache.forEach((value, key) => {
                if (!currentIds.has(key)) {
                    value.element.remove();
                    domCache.delete(key);
                }
            });
        }
        if (!isDoctor && !isDean) {
            const existingNote = grid.querySelector('.wait-note');
            if (!existingNote && grid.children.length > 0) {
                const noteDiv = document.createElement('div');
                noteDiv.className = 'wait-note';
                noteDiv.style.cssText = `margin-top: 50px; text-align: center; color: #070707; font-size: 15px; width: 100%; font-family: 'Tajawal', sans-serif; opacity: 1;`;
                noteDiv.innerHTML = `<i class="fa-solid fa-circle-info" style="margin-left:5px;"></i> سيتم إتاحة عرض قائمة الحضور الكاملة في التحديث القادم`;
                grid.appendChild(noteDiv);
            }
        }
    });

};
