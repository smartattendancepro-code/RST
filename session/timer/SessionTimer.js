import {
    doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;
const auth = window.auth;

let sessionInterval = null;

window.handleSessionTimer = function (isActive, startTime, duration) {
    const btn = document.getElementById('btnToggleSession');
    const icon = document.getElementById('sessionIcon');
    const txt = document.getElementById('sessionText');
    const floatTimer = document.getElementById('studentFloatingTimer');
    const floatText = document.getElementById('floatingTimeText');
    const doorStatus = document.getElementById('doorStatusText');

    const isAdmin = !!sessionStorage.getItem("secure_admin_session_token_v99");

    if (sessionInterval) clearInterval(sessionInterval);

    if (!isActive) {
        if (isAdmin && btn) {
            const lang = localStorage.getItem('sys_lang') || 'en';

            btn.classList.remove('session-open');
            btn.style.background = "#f1f5f9";
            btn.style.color = "#334155";
            btn.style.border = "2px solid #cbd5e1";

            if (txt) {
                txt.setAttribute('data-i18n', 'start_new_session_btn');
                txt.innerText = (lang === 'ar') ? "بدء محاضرة جديدة" : "Start New Session";
            }

            if (icon) icon.className = "fa-solid fa-play";
        }
        if (floatTimer) floatTimer.style.display = 'none';
        return;
    }

    let startMs = 0;
    if (startTime && typeof startTime.toMillis === 'function') {
        startMs = startTime.toMillis();
    } else {
        startMs = startTime || (Date.now() + (window.globalTimeOffset || 0));
    }

    const updateTick = () => {
        const currentServerTime = Date.now() + (window.globalTimeOffset || 0);

        const elapsedSeconds = Math.floor((currentServerTime - startMs) / 1000);

        let remaining = duration - elapsedSeconds;
        if (remaining > duration) remaining = duration;

        if (isAdmin) {
            if (doorStatus) {
                if (duration == -1) {
                    doorStatus.innerHTML = '<i class="fa-solid fa-door-open"></i> OPEN (∞)';
                    doorStatus.style.color = "#10b981";
                } else if (remaining > 0) {
                    doorStatus.innerHTML = `<i class="fa-solid fa-hourglass-half fa-spin"></i> ${remaining}s`;
                    doorStatus.style.color = "#f59e0b";
                } else {
                    clearInterval(sessionInterval);
                    const user = auth.currentUser;

                    updateDoc(doc(db, "active_sessions", user.uid), {
                        isDoorOpen: false,
                        sessionCode: "EXPIRED"
                    }).then(() => {
                        doorStatus.innerHTML = '<i class="fa-solid fa-door-closed"></i> CLOSED';
                        doorStatus.style.color = "#ef4444";
                        showToast("⏰ انتهى وقت الدخول وقُفل الباب", 4000, "#ef4444");
                    }).catch(err => console.error("Error closing door:", err));
                }
            }
        }

        else {
            if (floatTimer) {
                if (duration == -1) {
                    floatTimer.style.display = 'flex';
                    if (floatText) floatText.innerText = "OPEN";
                } else if (remaining > 0) {
                    floatTimer.style.display = 'flex';
                    if (floatText) floatText.innerText = remaining + "s";

                    if (remaining <= 10) floatTimer.classList.add('urgent');
                    else floatTimer.classList.remove('urgent');

                } else {
                    clearInterval(sessionInterval);
                    floatTimer.style.display = 'none';

                    const currentScreen = document.querySelector('.section.active')?.id;

                    if (currentScreen === 'screenDataEntry' && !window.isJoiningProcessActive) {

                        if (typeof window.resetApplicationState === 'function') {
                            window.resetApplicationState();
                        }

                        switchScreen('screenWelcome');
                        const modal = document.getElementById('systemTimeoutModal');
                        if (modal) modal.style.display = 'flex';
                    }
                }
            }
        }
    };

    updateTick();
    sessionInterval = setInterval(updateTick, 1000);
};
