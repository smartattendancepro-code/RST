window.triggerSessionEndOptions = function () {
    if (typeof playClick === 'function') playClick();
    const modal = document.getElementById('sessionActionModal');
    if (modal) modal.style.display = 'flex';
};