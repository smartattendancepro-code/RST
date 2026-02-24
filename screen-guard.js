
document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
        const isAdmin = sessionStorage.getItem("secure_admin_session_token_v99");
        if (isAdmin) return;

        const activeScreen = document.querySelector('.section.active')?.id;

        if (activeScreen === 'screenDataEntry') {
            const input = document.getElementById('attendanceCode');
            if (input) {
                input.value = '';
                if (input.getRealValue) {
                    window.initPinMaskEffect();
                }
            }

            sessionStorage.removeItem('TEMP_DR_UID');

            if (typeof window.goHome === 'function') {
                window.goHome();
            }
        }
    }
});