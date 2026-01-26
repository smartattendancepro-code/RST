
window.arabToEng = function (text) {
    if (!text) return "";
    const map = {
        'أ': 'A', 'إ': 'E', 'آ': 'A', 'ا': 'A', 'ب': 'B', 'ت': 'T', 'ث': 'Th',
        'ج': 'J', 'ح': 'H', 'خ': 'Kh', 'د': 'D', 'ذ': 'Dh', 'ر': 'R', 'ز': 'Z',
        'س': 'S', 'ش': 'Sh', 'ص': 'S', 'ض': 'D', 'ط': 'T', 'ظ': 'Z', 'ع': 'A',
        'غ': 'Gh', 'ف': 'F', 'ق': 'Q', 'ك': 'K', 'ل': 'L', 'م': 'M', 'ن': 'N',
        'ه': 'H', 'و': 'W', 'ي': 'Y', 'ى': 'A', 'ة': 'h', 'ئ': 'E', 'ؤ': 'O'
    };
    let res = text.split('').map(char => map[char] || char).join('');
    return res.length > 1 ? res.charAt(0).toUpperCase() + res.slice(1).toLowerCase() : res;
};



console.log = function () { };
console.warn = function () { };

window.playClick = function () {
    const sound = document.getElementById('clickSound');
    if (sound) {
        sound.play().catch(e => { });
    }

    if (navigator.vibrate) navigator.vibrate(10);
};

window.playSuccess = function () {
    console.log("تمت العملية بنجاح ✅");

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    const sound = document.getElementById('successSound');
    if (sound) sound.play().catch(e => { });
};

window.playBeep = function () {
    const sound = document.getElementById('beepSound');
    if (sound) {
        sound.play().catch(e => { });
    }
};

window.showToast = function (message, duration = 3000, bgColor = '#334155') {
    const toast = document.getElementById('toastNotification');
    if (toast) {
        toast.style.backgroundColor = bgColor;
        toast.innerText = message;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, duration);
    } else {
        console.log("تنبيه: " + message);
    }
};

window.getDistanceFromLatLonInKm = function (lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * (Math.PI / 180);
    var dLon = (lon2 - lon1) * (Math.PI / 180);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};
window.getUniqueDeviceId = function () {
    const DEVICE_ID_KEY = "unique_device_id_v1";

    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
};

window.isMobileDevice = function () {
    const ua = navigator.userAgent.toLowerCase();
    const isTargetMobile = /android|iphone|ipod/i.test(ua);
    const isExcluded = /windows|macintosh|ipad|tablet|x11|kindle/i.test(ua);
    return (isTargetMobile && !isExcluded);
};

window.convertArabicToEnglish = function (s) {
    return s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
};


window.isProcessingClick = false;
window.safeClick = function (element, callback) {
    if (window.isProcessingClick) return;
    if (element && (element.disabled || element.classList.contains('disabled') || element.classList.contains('locked'))) return;

    window.isProcessingClick = true;
    if (element) { element.style.pointerEvents = 'none'; element.style.opacity = '0.7'; }

    if (typeof callback === 'function') callback();

    setTimeout(() => {
        window.isProcessingClick = false;
        if (element) { element.style.pointerEvents = 'auto'; element.style.opacity = '1'; }
    }, 600);
};

window.normalizeArabic = function (text) {
    if (!text) return "";
    return text.toString()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .toLowerCase();
};

window.smartNormalize = function (text) {
    if (!text) return "";
    return text.toString()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/ت/g, 'ت')
        .trim()
        .toLowerCase();
};

window.transliterateArabicToEnglish = function (text) {
    const map = {
        'أ': 'A', 'إ': 'E', 'آ': 'A', 'ا': 'A', 'ب': 'B', 'ت': 'T', 'ث': 'Th',
        'ج': 'J', 'ح': 'H', 'خ': 'Kh', 'د': 'D', 'ذ': 'Dh', 'ر': 'R', 'ز': 'Z',
        'س': 'S', 'ش': 'Sh', 'ص': 'S', 'ض': 'D', 'ط': 'T', 'ظ': 'Z', 'ع': 'A',
        'غ': 'Gh', 'ف': 'F', 'ق': 'Q', 'ك': 'K', 'ل': 'L', 'م': 'M', 'ن': 'N',
        'ه': 'H', 'و': 'W', 'ي': 'Y', 'ى': 'A', 'ة': 'h', 'ئ': 'E', 'ؤ': 'O'
    };
    let res = text.split('').map(char => map[char] || char).join('');
    if (res.length > 1) {
        return res.charAt(0).toUpperCase() + res.slice(1).toLowerCase();
    }
    return res;
};

window.generateSessionKey = function () {
    return 'KEY-' + Math.random().toString(36).substr(2, 12).toUpperCase();
};

window.generateSessionCode = function () {
    return Math.floor(1000 + Math.random() * 9000).toString();
};