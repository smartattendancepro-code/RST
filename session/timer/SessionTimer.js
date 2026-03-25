let sessionInterval = null;

window.handleSessionTimer = function (isActive, startTime, duration) {
    const floatTimer = document.getElementById('studentFloatingTimer');
    const floatText = document.getElementById('floatingTimeText');

    if (sessionInterval) clearInterval(sessionInterval);

    if (!isActive) {
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
    };

    updateTick();
    sessionInterval = setInterval(updateTick, 1000);
};
