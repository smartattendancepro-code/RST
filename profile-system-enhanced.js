/* ============================================================
   ENHANCED PROFILE SYSTEM JS
   Al-Ryada University - Faculty of Nursing
   ============================================================
   
   HOW TO USE:
   1. Add <link rel="stylesheet" href="profile-style-enhanced.css">
   2. Replace your #studentProfileModal HTML with profile-modal-enhanced.html
   3. Include this file: <script type="module" src="profile-system-enhanced.js"></script>
   4. Replace calls to old profile functions with new ones below
   ============================================================ */

// ── Avatar icon sets (distinguished by gender) ──
const MALE_AVATARS = [
  { icon: 'fa-user-graduate',    color: '#0ea5e9' },
  { icon: 'fa-user-tie',         color: '#3b82f6' },
  { icon: 'fa-person',           color: '#6366f1' },
  { icon: 'fa-user-ninja',       color: '#0284c7' },
  { icon: 'fa-user-astronaut',   color: '#7c3aed' },
  { icon: 'fa-user-doctor',      color: '#0891b2' },
  { icon: 'fa-user-secret',      color: '#475569' },
  { icon: 'fa-user-shield',      color: '#1d4ed8' },
  { icon: 'fa-user-cowboy',      color: '#92400e' },
  { icon: 'fa-face-smile',       color: '#f59e0b' },
];

const FEMALE_AVATARS = [
  { icon: 'fa-user-nurse',       color: '#ec4899' },
  { icon: 'fa-person-dress',     color: '#f43f5e' },
  { icon: 'fa-face-smile-beam',  color: '#f97316' },
  { icon: 'fa-face-grin-stars',  color: '#8b5cf6' },
  { icon: 'fa-user-graduate',    color: '#db2777' },
  { icon: 'fa-face-laugh',       color: '#e11d48' },
  { icon: 'fa-user-tie',         color: '#9333ea' },
  { icon: 'fa-face-smile-wink',  color: '#c026d3' },
  { icon: 'fa-user-doctor',      color: '#be185d' },
  { icon: 'fa-heart',            color: '#f43f5e' },
];

const NEUTRAL_AVATARS = [
  { icon: 'fa-user-graduate',    color: '#0ea5e9' },
  { icon: 'fa-user-astronaut',   color: '#7c3aed' },
  { icon: 'fa-face-smile',       color: '#f59e0b' },
  { icon: 'fa-user-shield',      color: '#1d4ed8' },
  { icon: 'fa-user-secret',      color: '#475569' },
];

// Year mapping (number → English ordinal)
const YEAR_MAP = {
  '1': '1st Year', '2': '2nd Year',
  '3': '3rd Year', '4': '4th Year',
  'First': '1st Year', 'Second': '2nd Year',
  'Third': '3rd Year', 'Fourth': '4th Year',
};

// ── Local Storage keys ──
const AVATAR_ICON_KEY  = 'student_avatar_icon_v2';
const AVATAR_COLOR_KEY = 'student_avatar_color_v2';
const AVATAR_PHOTO_KEY = 'student_avatar_photo_v2'; // base64

// ── State ──
let currentUserGender  = null; // 'Male' | 'Female' | null
let selectedAvatarData = null; // { icon, color } or null if photo

// ──────────────────────────────────────────────
//  Open / Close Profile
// ──────────────────────────────────────────────
window.openStudentProfile = function () {
  const modal = document.getElementById('studentProfileModal');
  if (!modal) return;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('active'));
  loadProfileData();
};

window.closeStudentProfile = function () {
  const modal = document.getElementById('studentProfileModal');
  if (!modal) return;
  modal.classList.remove('active');
  setTimeout(() => { modal.style.display = 'none'; }, 300);
};

// ──────────────────────────────────────────────
//  Load & Render Profile Data
// ──────────────────────────────────────────────
async function loadProfileData () {
  if (!window.currentUser) return;
  const uid  = window.currentUser.uid;
  const user = window.currentUserData || {};

  const name    = user.fullName || user.name || 'Student';
  const email   = window.currentUser.email || '--';
  const level   = user.level || user.academic_level || user.registrationInfo?.level || '1';
  const group   = user.group || user.registrationInfo?.group || '--';
  const gender  = user.gender || user.registrationInfo?.gender || null;
  const sid     = user.studentID || user.registrationInfo?.studentID || uid;

  currentUserGender = gender;

  // Name
  setEl('profFullName', name);
  setEl('profStudentID', sid);

  // Gender badge
  applyGenderBadge(gender);
  applyGenderBanner(gender);

  // Year
  const yearEng = YEAR_MAP[String(level)] || `Year ${level}`;
  setEl('profYearValue', yearEng);
  setEl('profLevel', yearEng);
  setEl('profGender', gender || '--');

  // Group chips
  setEl('profGroupChip', group);
  setEl('profGroupVal', group);

  // Email
  setEl('profEmail', email);

  // Avatar
  renderSavedAvatar();
}

// ──────────────────────────────────────────────
//  Gender UI
// ──────────────────────────────────────────────
function applyGenderBadge (gender) {
  const badge    = document.getElementById('profGenderBadge');
  const iconEl   = document.getElementById('profGenderIcon');
  const textEl   = document.getElementById('profGenderText');
  if (!badge) return;

  badge.classList.remove('gender-male', 'gender-female');
  if (gender === 'Female') {
    badge.classList.add('gender-female');
    iconEl.className = 'fa-solid fa-venus';
    textEl.textContent = 'Female';
  } else {
    badge.classList.add('gender-male');
    iconEl.className = 'fa-solid fa-mars';
    textEl.textContent = 'Male';
  }
}

function applyGenderBanner (gender) {
  const banner = document.getElementById('profileBannerEl');
  if (!banner) return;
  banner.classList.remove('male-banner', 'female-banner');
  if (gender === 'Female') banner.classList.add('female-banner');
  else banner.classList.add('male-banner');

  // Avatar ring gradient
  const ring = document.getElementById('profileAvatarRing');
  if (ring) {
    ring.classList.toggle('female', gender === 'Female');
  }
}

// ──────────────────────────────────────────────
//  Avatar Rendering
// ──────────────────────────────────────────────
function renderSavedAvatar () {
  const photo = localStorage.getItem(AVATAR_PHOTO_KEY);
  if (photo) {
    applyPhotoAvatar(photo);
    return;
  }
  const icon  = localStorage.getItem(AVATAR_ICON_KEY);
  const color = localStorage.getItem(AVATAR_COLOR_KEY);
  if (icon) {
    applyIconAvatar(icon, color || '#0ea5e9');
  } else {
    // default by gender
    const defaults = currentUserGender === 'Female'
      ? { icon: 'fa-user-nurse', color: '#ec4899' }
      : { icon: 'fa-user-graduate', color: '#0ea5e9' };
    applyIconAvatar(defaults.icon, defaults.color);
  }

  // Also sync profile trigger button
  syncTriggerButton();
}

function applyIconAvatar (iconClass, color) {
  const inner      = document.getElementById('profileAvatarInner');
  const iconEl     = document.getElementById('profileAvatarIcon');
  const triggerEl  = document.getElementById('profileIconImg');

  if (inner)  { inner.innerHTML = `<i class="fa-solid ${iconClass}" id="profileAvatarIcon" style="color:${color};"></i>`; }
  if (triggerEl) { triggerEl.className = `fa-solid ${iconClass}`; triggerEl.style.color = color; }
}

function applyPhotoAvatar (base64) {
  const inner     = document.getElementById('profileAvatarInner');
  const trigger   = document.getElementById('profileIconImg');

  if (inner) {
    inner.innerHTML = `<img src="${base64}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  }
  if (trigger && trigger.tagName !== 'IMG') {
    const img = document.createElement('img');
    img.src   = base64;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
    trigger.replaceWith(img);
    img.id = 'profileIconImg';
  } else if (trigger) {
    trigger.src = base64;
  }
}

function syncTriggerButton () {
  const photo = localStorage.getItem(AVATAR_PHOTO_KEY);
  if (photo) applyPhotoAvatar(photo);
}

// ──────────────────────────────────────────────
//  Avatar Selector Sheet
// ──────────────────────────────────────────────
window.openEnhancedAvatarSelector = function () {
  const sheet = document.getElementById('enhancedAvatarSelectorModal');
  if (!sheet) return;
  buildAvatarGrid();
  sheet.style.display = 'flex';
  requestAnimationFrame(() => sheet.classList.add('active'));
};

window.closeEnhancedAvatarSelector = function () {
  const sheet = document.getElementById('enhancedAvatarSelectorModal');
  if (!sheet) return;
  sheet.classList.remove('active');
  setTimeout(() => { sheet.style.display = 'none'; }, 300);
};

function buildAvatarGrid () {
  const grid = document.getElementById('enhancedAvatarsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const list = currentUserGender === 'Female' ? FEMALE_AVATARS
             : currentUserGender === 'Male'   ? MALE_AVATARS
             : NEUTRAL_AVATARS;

  const savedIcon = localStorage.getItem(AVATAR_ICON_KEY);

  list.forEach(({ icon, color }) => {
    const div = document.createElement('div');
    div.className = 'avatar-icon-item' + (savedIcon === icon ? ' selected' : '');
    div.innerHTML = `
      <i class="fa-solid ${icon}" style="color:${color};"></i>
      <div class="avatar-check"><i class="fa-solid fa-check"></i></div>
    `;
    div.onclick = () => selectIconAvatar(icon, color, div);
    grid.appendChild(div);
  });
}

function selectIconAvatar (icon, color, el) {
  // remove previous selection
  document.querySelectorAll('.avatar-icon-item.selected').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');

  // save
  localStorage.setItem(AVATAR_ICON_KEY,   icon);
  localStorage.setItem(AVATAR_COLOR_KEY,  color);
  localStorage.removeItem(AVATAR_PHOTO_KEY);

  // apply
  applyIconAvatar(icon, color);

  // close after brief moment
  setTimeout(() => closeEnhancedAvatarSelector(), 350);
}

// ──────────────────────────────────────────────
//  Photo Upload (stored locally as base64)
// ──────────────────────────────────────────────
window.triggerPhotoUpload = function () {
  document.getElementById('photoUploadInput')?.click();
};

window.handlePhotoUpload = function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const base64 = e.target.result;

    // Compress / resize before saving (max 300×300 quality 0.75)
    const img = new Image();
    img.onload = function () {
      const canvas  = document.createElement('canvas');
      const max     = 300;
      const ratio   = Math.min(max / img.width, max / img.height, 1);
      canvas.width  = img.width  * ratio;
      canvas.height = img.height * ratio;
      const ctx     = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', 0.75);

      // Save locally
      try {
        localStorage.setItem(AVATAR_PHOTO_KEY, compressed);
        localStorage.removeItem(AVATAR_ICON_KEY);
        localStorage.removeItem(AVATAR_COLOR_KEY);
      } catch (storageErr) {
        console.warn('localStorage full, saving smaller version');
        const smaller = canvas.toDataURL('image/jpeg', 0.5);
        localStorage.setItem(AVATAR_PHOTO_KEY, smaller);
      }

      applyPhotoAvatar(compressed);
      closeEnhancedAvatarSelector();
      showToast('✅ تم حفظ الصورة محلياً على جهازك');
    };
    img.src = base64;
  };
  reader.readAsDataURL(file);
  event.target.value = ''; // reset input
};

// ──────────────────────────────────────────────
//  Utility: handleProfileIconClick (trigger button)
// ──────────────────────────────────────────────
window.handleProfileIconClick = function () {
  if (window.currentUser) {
    openStudentProfile();
  } else {
    if (typeof openAuthDrawer === 'function') openAuthDrawer();
  }
};

// ──────────────────────────────────────────────
//  Utility helpers
// ──────────────────────────────────────────────
function setEl (id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showToast (msg) {
  if (typeof window.showTopToast === 'function') { window.showTopToast(msg); return; }
  const t = document.getElementById('toastNotification') || document.getElementById('topToast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => { t.style.display = 'none'; }, 400); }, 2500);
}

// ──────────────────────────────────────────────
//  On load: sync trigger avatar
// ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  syncTriggerButton();
});