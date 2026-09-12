
document.addEventListener('DOMContentLoaded', function () {
    window.initPinMaskEffect = function () {
        const input = document.getElementById('attendanceCode');
        if (!input) return;

        let realValue = '';
        let maskTimeout = null;

        input.addEventListener('keydown', function (e) {
            e.preventDefault();

            if (e.key === 'Backspace') {
                realValue = realValue.slice(0, -1);
            } else if (/^[0-9]$/.test(e.key) && realValue.length < 6) {
                realValue += e.key;
            } else {
                return;
            }

            // عرض: آخر رقم ظاهر والباقي نجوم
            clearTimeout(maskTimeout);

            if (realValue.length > 0) {
                input.value = '*'.repeat(realValue.length - 1) + realValue[realValue.length - 1];

                maskTimeout = setTimeout(() => {
                    input.value = '*'.repeat(realValue.length);
                }, 600);
            } else {
                input.value = '';
            }
        });

        input.getRealValue = () => realValue;
    };

    window.initPinMaskEffect();
});