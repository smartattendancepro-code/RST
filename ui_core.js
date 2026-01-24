window.switchScreen = function (screenId) {
    const currentActive = document.querySelector('.section.active');
    if (currentActive && currentActive.id === screenId) return;

    window.scrollTo({ top: 0, behavior: 'auto' });

    const sections = document.querySelectorAll('.section');
    sections.forEach(sec => {
        sec.style.display = 'none';
        sec.classList.remove('active');
    });

    const target = document.getElementById(screenId);
    if (target) {
        target.style.display = 'flex';
        target.style.flexDirection = 'column';
        setTimeout(() => target.classList.add('active'), 10);
    }

    const infoBtn = document.getElementById('infoBtn');

    if (infoBtn) {
        if (screenId === 'screenWelcome') {
            infoBtn.style.display = 'flex';
        } else {
            infoBtn.style.display = 'none';
        }
    }

    const facBtn = document.getElementById('facultyProfileBtn');
};

function updateHeaderState(screenId) {
    const wrapper = document.getElementById('heroIconWrapper'); const icon = document.getElementById('statusIcon');
    wrapper.classList.remove('show-icon');
    if (screenId !== 'screenWelcome') {
        wrapper.classList.add('show-icon');
        if (screenId === 'screenLoading') { icon.className = "fa-solid fa-satellite-dish hero-icon fa-spin"; icon.style.color = "var(--primary)"; }
        else if (screenId === 'screenReadyToStart') { icon.className = "fa-solid fa-map-location-dot hero-icon"; icon.style.color = "#10b981"; icon.style.animation = "none"; }
        else if (screenId === 'screenDataEntry') { icon.className = "fa-solid fa-user-pen hero-icon"; icon.style.color = "var(--primary)"; icon.style.animation = "none"; }
        else if (screenId === 'screenScanQR') { icon.className = "fa-solid fa-qrcode hero-icon"; icon.style.color = "var(--primary)"; icon.style.animation = "none"; }
        else if (screenId === 'screenSuccess') { icon.className = "fa-solid fa-check hero-icon"; icon.style.color = "#10b981"; icon.style.animation = "none"; }
        else if (screenId === 'screenError') { icon.className = "fa-solid fa-triangle-exclamation hero-icon"; icon.style.color = "#ef4444"; icon.style.animation = "none"; }
        else if (screenId === 'screenAdminLogin') { icon.className = "fa-solid fa-lock hero-icon"; icon.style.color = "var(--primary-dark)"; icon.style.animation = "none"; }
    }
}

window.toggleDropdown = function (id) {
    const list = document.getElementById(id);
    if (!list) return;

    // إغلاق أي قائمة أخرى مفتوحة
    document.querySelectorAll('.dropdown-list').forEach(el => {
        if (el.id !== id) el.classList.remove('show');
    });
    list.classList.toggle('show');
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown')) {
        document.querySelectorAll('.dropdown-list').forEach(el => el.classList.remove('show'));
    }
});

window.togglePass = (inputId, icon) => {
    const input = document.getElementById(inputId);
    if (!input) return;

    const isPassword = input.type === 'password';

    input.type = isPassword ? 'text' : 'password';

    if (icon) {
        if (isPassword) {
            icon.classList.replace('fa-eye', 'fa-eye-slash');
            icon.style.color = "#0ea5e9";
            icon.style.filter = "drop-shadow(0 0 5px rgba(14, 165, 233, 0.5))";
        } else {
            icon.classList.replace('fa-eye-slash', 'fa-eye');
            icon.style.color = "#94a3b8";
            icon.style.filter = "none";
        }
    }

    if (navigator.vibrate) navigator.vibrate(10);
};

window.togglePasswordVisibility = function (inputId = 'adminPassword', iconElement = null) {
    const passInput = document.getElementById(inputId);

    const icon = iconElement || document.getElementById('eyeIcon');

    if (!passInput || !icon) return;

    if (passInput.type === 'password') {
        passInput.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
        icon.style.color = '#0ea5e9';
    } else {
        passInput.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
        icon.style.color = '#94a3b8';
    }
};

window.toggleAuthMode = (mode) => {
    const loginSec = document.getElementById('loginSection');
    const signupSec = document.getElementById('signupSection');
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');

    if (mode === 'signup') {
        loginSec.classList.remove('active');
        signupSec.classList.add('active');
        title.innerText = 'Create Account';
        subtitle.innerText = 'Join our nursing community below';
    } else {
        signupSec.classList.remove('active');
        loginSec.classList.add('active');
        title.innerText = 'Welcome Back';
        subtitle.innerText = 'Please enter your details to continue';
    }
};

window.switchFacultyTab = function (tab) {
    const loginSec = document.getElementById('facultyLoginSection');
    const signupSec = document.getElementById('facultySignupSection');
    const tLogin = document.getElementById('tabLogin');
    const tSignup = document.getElementById('tabSignup');

    if (tab === 'signup') {
        loginSec.style.display = 'none';
        signupSec.style.display = 'block';
        tSignup.classList.add('active');
        tLogin.classList.remove('active');
    } else {
        signupSec.style.display = 'none';
        loginSec.style.display = 'block';
        tLogin.classList.add('active');
        tSignup.classList.remove('active');
    }
};
const passMatch = (pass === passConfirm && pass !== "");
const passReady = pass.length >= 6;
const passConfirmField = getEl('regPassConfirm');
const passErrorMsg = getEl('passError');

if (passConfirm !== "") {
    passConfirmField.classList.toggle('input-error', !passMatch);
    passErrorMsg.style.display = passMatch ? 'none' : 'block';
} else {
    passConfirmField.classList.remove('input-error');
    passErrorMsg.style.display = 'none';
}

const level = getV('regLevel');
const gender = getV('regGender');
const name = getV('regFullName');
const group = getV('regGroup');

const isEverythingValid =
    isValidEmailFormat &&
    emailMatch &&
    passMatch &&
    passReady &&
    group !== "" &&
    level !== "" &&
    gender !== "" &&
    name !== "" &&
    !name.toLowerCase().includes("not registered");

const btn = getEl('btnDoSignup');
if (btn) {
    btn.disabled = !isEverythingValid;
    if (isEverythingValid) {
        btn.style.opacity = "1";
        btn.style.filter = "grayscale(0%)";
        btn.style.cursor = "pointer";
    } else {
        btn.style.opacity = "0.5";
        btn.style.filter = "grayscale(50%)";
        btn.style.cursor = "not-allowed";
    }
}
function validateSignupForm() {
    const getEl = (id) => document.getElementById(id);

    const fields = {
        email: getEl('regEmail'),
        emailConfirm: getEl('regEmailConfirm'),
        pass: getEl('regPass'),
        passConfirm: getEl('regPassConfirm'),
        gender: getEl('regGender'),
        level: getEl('regLevel'),
        group: getEl('regGroup'),
        name: getEl('regFullName'),
        btn: getEl('btnDoSignup')
    };

    if (!fields.btn) return;

    const val = {
        email: fields.email.value.trim(),
        emailConfirm: fields.emailConfirm.value.trim(),
        pass: fields.pass.value,
        passConfirm: fields.passConfirm.value,
        gender: fields.gender.value,
        level: fields.level.value,
        group: fields.group.value.trim(),
        name: fields.name.value
    };

    const isEmailsMatch = val.email === val.emailConfirm && val.email !== "";
    const isPassMatch = val.pass === val.passConfirm && val.pass.length >= 6;
    const isLevelSelected = val.level !== "";
    const isGenderSelected = val.gender !== "";
    const isGroupValid = val.group !== "" && val.group.toUpperCase().startsWith('G');
    const isNameFetched = val.name !== "" && !val.name.includes("غير مسجل");

    const isFormReady = isEmailsMatch && isPassMatch && isLevelSelected && isGenderSelected && isGroupValid && isNameFetched;

    if (isFormReady) {
        fields.btn.disabled = false;
        fields.btn.style.opacity = "1";
        fields.btn.style.cursor = "pointer";
    } else {
        fields.btn.disabled = true;
        fields.btn.style.opacity = "0.5";
        fields.btn.style.cursor = "not-allowed";
    }
}