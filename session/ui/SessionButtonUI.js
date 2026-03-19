function updateSessionButtonUI(isOpen) {
    const btn = document.getElementById('btnToggleSession');
    const icon = document.getElementById('sessionIcon');
    const txt = document.getElementById('sessionText');

    const lang = localStorage.getItem('sys_lang') || 'en';

    if (!btn) return;

    btn.style.display = 'flex';

    if (isOpen) {
        btn.classList.add('session-open');
        btn.style.background = "#dcfce7";
        btn.style.color = "#166534";
        btn.style.border = "2px solid #22c55e";

        if (icon) icon.className = "fa-solid fa-tower-broadcast fa-fade";

        if (txt) {
            txt.setAttribute('data-i18n', 'session_active_btn');
            txt.innerText = (lang === 'ar') ? "جلستك نشطة" : "Session Active";
        }

    } else {
        btn.classList.remove('session-open');
        btn.style.background = "#f1f5f9";
        btn.style.color = "#334155";
        btn.style.border = "2px solid #cbd5e1";

        if (icon) icon.className = "fa-solid fa-play";

        if (txt) {
            txt.setAttribute('data-i18n', 'start_new_session_btn');
            txt.innerText = (lang === 'ar') ? "بدء محاضرة جديدة" : "Start New Session";
        }
    }

    window.lastSessionState = isOpen;
}