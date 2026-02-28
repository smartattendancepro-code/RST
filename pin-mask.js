document.addEventListener('DOMContentLoaded', function () {
    window.initPinMaskEffect = function () {
        const input = document.getElementById('attendanceCode');
        if (!input) return;

        let realValue = '';
        let maskTimeout = null;

        // ضبط نوع الكيبورد للموبايل
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('type', 'text');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('maxlength', '6');

        const updateDisplay = () => {
            clearTimeout(maskTimeout);
            if (realValue.length === 0) {
                input.value = '';
                return;
            }
            // آخر رقم يظهر ثم يتحول نجمة
            input.value = '*'.repeat(realValue.length - 1) + realValue[realValue.length - 1];
            maskTimeout = setTimeout(() => {
                input.value = '*'.repeat(realValue.length);
            }, 600);
        };

        // ✅ Desktop - keydown شغال عادي
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace') {
                e.preventDefault();
                realValue = realValue.slice(0, -1);
                updateDisplay();
            } else if (/^[0-9]$/.test(e.key) && realValue.length < 6) {
                e.preventDefault();
                realValue += e.key;
                updateDisplay();
            } else if (e.key !== 'Enter') {
                // منع أي حرف غير رقم
                if (!/^[0-9]$/.test(e.key) && e.key !== 'Tab') {
                    e.preventDefault();
                }
            }
        });

        // ✅ موبايل - input هو الحل
        input.addEventListener('input', function () {
            // استخرج الأرقام الحقيقية فقط
            const digits = input.value.replace(/[^0-9]/g, '').slice(0, 6);

            if (digits.length > 0) {
                realValue = digits;
            } else if (input.value === '' || input.value.replace(/\*/g, '') === '') {
                realValue = '';
            }

            updateDisplay();
        });

        // ✅ منع اللصق إلا للأرقام
        input.addEventListener('paste', function (e) { e.preventDefault(); });
        input.addEventListener('drop', function (e) { e.preventDefault(); });
        input.addEventListener('copy', function (e) { e.preventDefault(); });
        input.addEventListener('cut', function (e) { e.preventDefault(); });

        // الدالة اللي بتستخدمها searchForSession
        input.getRealValue = () => realValue;

        // reset عند مسح الحقل برمجياً
        input.resetValue = () => {
            realValue = '';
            input.value = '';
        };
    };

    window.initPinMaskEffect();
});

