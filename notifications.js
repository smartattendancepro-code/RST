import { getFirestore, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// تهيئة متغيرات الفايربيس
const db = getFirestore();
const auth = getAuth();

// ==========================================
// 🔄 نظام السحب للتحديث السريع (Instant Pull to Refresh)
// ==========================================

(function () {
    let ptrStartY = 0;
    let ptrIsPulling = false;
    let ptrIsRefreshing = false;

    const ptrElement = document.getElementById('pullToRefresh');
    const ptrIcon = document.getElementById('ptrIcon');
    const ptrBox = document.querySelector('.ptr-box');

    if (ptrElement && ptrIcon) {

        // 1. بداية اللمس
        window.addEventListener('touchstart', (e) => {
            if (window.scrollY === 0 && !ptrIsRefreshing) {
                ptrStartY = e.touches[0].clientY;
                ptrIsPulling = true;
            }
        }, { passive: true });

        // 2. حركة السحب
        window.addEventListener('touchmove', (e) => {
            if (!ptrIsPulling) return;

            const currentY = e.touches[0].clientY;
            const pullDistance = currentY - ptrStartY;

            if (pullDistance > 0) {
                const moveY = Math.min(pullDistance * 0.4, 120);

                ptrElement.style.top = (moveY - 60) + 'px';
                ptrIcon.style.transform = `rotate(${moveY * 3}deg)`;

                if (moveY > 55) {
                    ptrIcon.className = "fa-solid fa-rotate-right";
                    ptrBox.style.transform = "scale(1.1)";
                    ptrIcon.style.color = "#10b981";
                } else {
                    ptrIcon.className = "fa-solid fa-arrow-down";
                    ptrBox.style.transform = "scale(0.8)";
                    ptrIcon.style.color = "#0ea5e9";
                }
            }
        }, { passive: true });

        // 3. نهاية اللمس
        window.addEventListener('touchend', (e) => {
            if (!ptrIsPulling) return;
            ptrIsPulling = false;

            const currentTop = parseFloat(getComputedStyle(ptrElement).top);

            // الحساسية: لو نزل أي مسافة بسيطة يحدث فوراً
            if (currentTop > -30) {
                startPtrRefresh();
            } else {
                resetPtrPosition();
            }
        });
    }

    function startPtrRefresh() {
        ptrIsRefreshing = true;

        // تثبيت الشكل للحظة
        ptrElement.style.top = '25px';
        ptrElement.classList.add('ptr-loading');

        if (navigator.vibrate) navigator.vibrate(50);

        // 🔥 التعديل هنا: التحديث فوري (بعد 0.1 ثانية فقط)
        setTimeout(() => {
            location.reload();
        }, 100);
    }

    function resetPtrPosition() {
        ptrElement.style.top = '-80px';
        if (ptrBox) ptrBox.style.transform = "scale(0.8)";

        setTimeout(() => {
            ptrIcon.style.transform = 'rotate(0deg)';
            ptrIcon.className = "fa-solid fa-arrow-down";
            ptrElement.classList.remove('ptr-loading');
            ptrIsRefreshing = false;
        }, 300);
    }
})();