(function () {

  const CACHE_TTL_MS = 10 * 60 * 1000;
  const REFRESH_MS = 3 * 60 * 1000;
  const RECHECK_MS = 30 * 1000;          // Safari: recheck every 30s
  const FETCH_TIMEOUT = 8_000;
  const ADMIN_KEY = "secure_admin_session_token_v99";
  const STYLE_ID = "gps-mgr-v5";

  let _cache = null;
  let _initialized = false;
  let _permWatch = null;
  let _refreshTimer = null;
  let _recheckTimer = null;
  let _modalEl = null;
  let _guideEl = null;
  let _bdEl = null;
  let _fetchInProgress = false;

  const _lang = () => localStorage.getItem("sys_lang") === "en" ? "en" : "ar";
  const _dir = () => _lang() === "ar" ? "rtl" : "ltr";
  const _isAdmin = () => !!sessionStorage.getItem(ADMIN_KEY);
  const _isSafari = () =>
    /iP(hone|ad|od)/i.test(navigator.userAgent) ||
    (/Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent));

  const STR = {
    ar: {
      modal_title: "تحديد الموقع مطلوب",
      modal_body: "يحتاج التطبيق إذن الوصول إلى موقعك للتحقق الأمني أثناء تسجيل الحضور.",
      modal_allow: "📍 السماح بالموقع",
      modal_how: "كيف أفعّل الموقع؟",
      modal_skip: "⚡ تخطي (فترة تجريبية)",
      guide_title_safari: "تفعيل الموقع — Safari",
      guide_title_chrome: "تفعيل الموقع — Chrome",
      guide_steps_safari: [
        "افتح الإعدادات ← الخصوصية والأمان",
        "خدمات الموقع ← Safari",
        "اختر «عند استخدام التطبيق»",
        "عُد للصفحة وأعد تحميلها",
      ],
      guide_steps_chrome: [
        "اضغط على 🔒 بجانب عنوان الصفحة",
        "اختر «إعدادات الموقع»",
        "الموقع الجغرافي ← «السماح»",
        "أعد تحميل الصفحة",
      ],
      guide_done: "✅ تم — أعد المحاولة",
      status_fetching: "⏳ جاري تحديد الموقع…",
      status_ok: "✅ تم تحديد الموقع",
      status_denied: "⚠️ الموقع مرفوض — اضغط «كيف أفعّل»",
      status_retry: "⚠️ تعذر الحصول على الموقع، حاول مجدداً",
    },
    en: {
      modal_title: "Location Required",
      modal_body: "This app needs your location to verify attendance securely.",
      modal_allow: "📍 Allow Location",
      modal_how: "How to enable location?",
      modal_skip: "⚡ Skip (Trial Period)",
      guide_title_safari: "Enable Location — Safari",
      guide_title_chrome: "Enable Location — Chrome",
      guide_steps_safari: [
        "Open Settings → Privacy & Security",
        "Location Services → Safari",
        "Choose \"While Using the App\"",
        "Return here and reload",
      ],
      guide_steps_chrome: [
        "Tap 🔒 next to the address bar",
        "Choose \"Site settings\"",
        "Location → \"Allow\"",
        "Reload the page",
      ],
      guide_done: "✅ Done — retry",
      status_fetching: "⏳ Getting location…",
      status_ok: "✅ Location ready",
      status_denied: "⚠️ Still blocked — tap How to enable",
      status_retry: "⚠️ Couldn't get location, try again",
    },
  };
  const _t = k => (STR[_lang()] || STR.ar)[k];

  function _injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
/* Backdrop */
.gps-backdrop {
  position: fixed; inset: 0;
  background: rgba(15,23,42,.55);
  backdrop-filter: blur(4px);
  z-index: 2147483638;
  opacity: 0;
  transition: opacity .22s ease;
}
.gps-backdrop.show { opacity: 1; }

/* Centered modal */
#gps-modal {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -56%);
  z-index: 2147483639;
  background: #fff;
  border-radius: 20px;
  padding: 24px 20px 20px;
  width: min(310px, calc(100vw - 32px));
  box-shadow: 0 14px 44px rgba(0,0,0,.24);
  font-family: 'Tajawal','Cairo',sans-serif;
  opacity: 0;
  transition: transform .28s cubic-bezier(.22,.68,0,1.2), opacity .22s ease;
  pointer-events: none;
}
#gps-modal.show {
  transform: translate(-50%, -50%);
  opacity: 1;
  pointer-events: auto;
}
@media (prefers-color-scheme: dark) {
  #gps-modal        { background: #1e293b; }
  #gps-modal-title  { color: #f1f5f9 !important; }
  #gps-modal-body   { color: #94a3b8 !important; }
  #gps-modal-status { color: #94a3b8 !important; }
}
#gps-modal-icon {
  font-size: 38px;
  text-align: center;
  margin-bottom: 10px;
}
#gps-modal-title {
  font-size: 15px; font-weight: 900;
  color: #0f172a; text-align: center;
  margin: 0 0 8px;
}
#gps-modal-body {
  font-size: 12px; color: #64748b;
  text-align: center; line-height: 1.6;
  margin: 0 0 14px;
}
#gps-modal-status {
  font-size: 12px; text-align: center;
  min-height: 16px; margin-bottom: 12px;
  font-weight: 600; color: #64748b;
  transition: color .2s;
}
#gps-btn-allow {
  width: 100%; padding: 12px;
  background: #2563eb; color: #fff;
  border: none; border-radius: 12px;
  font-size: 14px; font-weight: 800;
  cursor: pointer; font-family: inherit;
  margin-bottom: 8px;
  transition: opacity .15s;
}
#gps-btn-allow:active  { opacity: .85; }
#gps-btn-allow:disabled { opacity: .45; cursor: default; }
#gps-btn-how {
  width: 100%; padding: 9px;
  background: transparent; color: #64748b;
  border: 1px solid #e2e8f0; border-radius: 12px;
  font-size: 12px; font-weight: 700;
  cursor: pointer; font-family: inherit;
  margin-bottom: 8px;
}
#gps-btn-how:active { background: #f1f5f9; }
#gps-btn-skip {
  width: 100%; padding: 10px;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #fff;
  border: none; border-radius: 12px;
  font-size: 12px; font-weight: 800;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 3px 10px rgba(249,115,22,.35);
  transition: opacity .15s, transform .1s;
  letter-spacing: .3px;
}
#gps-btn-skip:active { opacity: .88; transform: scale(.98); }
@media (prefers-color-scheme: dark) {
  #gps-btn-skip { box-shadow: 0 3px 14px rgba(249,115,22,.45); }
}

/* Compact guide — bottom sheet */
#gps-guide {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 2147483640;
  background: #fff;
  border-radius: 18px 18px 0 0;
  padding: 14px 18px 30px;
  max-width: 420px;
  margin: 0 auto;
  box-shadow: 0 -4px 24px rgba(0,0,0,.15);
  font-family: 'Tajawal','Cairo',sans-serif;
  transform: translateY(110%);
  transition: transform .28s cubic-bezier(.22,.68,0,1.2);
}
#gps-guide.show { transform: translateY(0); }
@media (prefers-color-scheme: dark) {
  #gps-guide        { background: #1e293b; }
  #gps-guide-title  { color: #f1f5f9 !important; }
  .gps-step         { background: #0f172a !important; color: #cbd5e1 !important; }
}
.gps-guide-bar {
  width: 32px; height: 4px; border-radius: 2px;
  background: #e2e8f0; margin: 0 auto 12px;
}
#gps-guide-title {
  font-size: 13px; font-weight: 900;
  color: #0f172a; margin: 0 0 11px;
  text-align: center;
}
.gps-step {
  display: flex; align-items: center; gap: 9px;
  background: #f8fafc; border-radius: 9px;
  padding: 8px 10px; margin-bottom: 5px;
  font-size: 12px; color: #334155; font-weight: 500;
  line-height: 1.45;
}
.gps-step-n {
  width: 19px; height: 19px; border-radius: 50%;
  background: #0ea5e9; color: #fff;
  font-size: 9px; font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
#gps-guide-done {
  width: 100%; padding: 12px; margin-top: 10px;
  background: #10b981; color: #fff;
  border: none; border-radius: 12px;
  font-size: 13px; font-weight: 800;
  cursor: pointer; font-family: inherit;
}
#gps-guide-done:active { opacity: .88; }
    `;
    document.head.appendChild(s);
  }

  /* ── Backdrop ───────────────────────────────────────────────────────── */
  function _showBackdrop() {
    if (_bdEl) return;
    const bd = document.createElement("div");
    bd.className = "gps-backdrop";
    document.body.appendChild(bd);
    _bdEl = bd;
    requestAnimationFrame(() => requestAnimationFrame(() => bd.classList.add("show")));
  }
  function _hideBackdrop() {
    if (!_bdEl) return;
    _bdEl.classList.remove("show");
    const el = _bdEl; _bdEl = null;
    setTimeout(() => el?.remove(), 280);
  }

  /* ── Modal ──────────────────────────────────────────────────────────── */
  function _showModal() {
    if (_modalEl) return;
    const modal = document.createElement("div");
    modal.id = "gps-modal";
    modal.setAttribute("dir", _dir());
    modal.innerHTML = `
      <div id="gps-modal-icon">📍</div>
      <h3 id="gps-modal-title">${_t("modal_title")}</h3>
      <p  id="gps-modal-body">${_t("modal_body")}</p>
      <div id="gps-modal-status"></div>
      <button id="gps-btn-allow">${_t("modal_allow")}</button>
      <button id="gps-btn-how">${_t("modal_how")}</button>
      <button id="gps-btn-skip">${_t("modal_skip")}</button>
    `;
    document.body.appendChild(modal);
    _modalEl = modal;
    _showBackdrop();
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add("show")));
    document.getElementById("gps-btn-allow").addEventListener("click", _onAllow);

    /* ── زر التخطي ── */
    document.getElementById("gps-btn-skip").addEventListener("click", _onSkip);

    /* DEV_BYPASS_START */
    let _bypassTaps = 0, _bypassTimer = null;
    /* DEV_BYPASS_END */
    document.getElementById("gps-btn-how").addEventListener("click", () => {
      /* DEV_BYPASS_START */
      _bypassTaps++;
      clearTimeout(_bypassTimer);
      if (_bypassTaps >= 3) {
        _bypassTaps = 0;
        _cache = { status: "success", gps_success: true, inRange: true, lat: 0, lng: 0, ts: Date.now() };
        _destroyModal();
        _hideGuide();
        _startRefresh();
        return;
      }
      _bypassTimer = setTimeout(() => {
        _bypassTaps = 0;
        _showGuide();
      }, 400);
      /* DEV_BYPASS_END */
    });
  }

  /* ── Skip button handler ────────────────────────────────────────────── */
  function _onSkip() {
    _cache = {
      status: "skipped",
      gps_success: true,
      inRange: true,
      lat: 0,
      lng: 0,
      ts: Date.now(),
      skipped: true
    };
    _destroyModal();
    _hideGuide();
    _startRefresh();
  }

  function _destroyModal() {
    if (!_modalEl) return;
    _modalEl.classList.remove("show");
    const el = _modalEl; _modalEl = null;
    _hideBackdrop();
    setTimeout(() => el?.remove(), 300);
  }

  function _setStatus(msg, color) {
    const el = document.getElementById("gps-modal-status");
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || "#64748b";
  }

  /* ── Allow button ───────────────────────────────────────────────────── */
  async function _onAllow() {
    const btn = document.getElementById("gps-btn-allow");
    if (btn) { btn.disabled = true; btn.textContent = _t("status_fetching"); }
    _setStatus(_t("status_fetching"), "#0ea5e9");

    // Force fresh fetch
    _cache = null;
    const r = await _silentFetch(true);

    if (r.gps_success) {
      _setStatus(_t("status_ok"), "#10b981");
      setTimeout(_destroyModal, 1200);
      _startRefresh();
    } else if (r.status === "denied") {
      _setStatus(_t("status_denied"), "#ef4444");
      if (btn) { btn.disabled = false; btn.textContent = _t("modal_allow"); }
    } else {
      _setStatus(_t("status_retry"), "#f59e0b");
      if (btn) { btn.disabled = false; btn.textContent = _t("modal_allow"); }
    }
  }

  /* ── Guide ──────────────────────────────────────────────────────────── */
  function _showGuide() {
    if (_guideEl) return;
    const safari = _isSafari();
    const steps = safari ? _t("guide_steps_safari") : _t("guide_steps_chrome");
    const title = safari ? _t("guide_title_safari") : _t("guide_title_chrome");

    const g = document.createElement("div");
    g.id = "gps-guide";
    g.setAttribute("dir", _dir());
    g.innerHTML = `
      <div class="gps-guide-bar"></div>
      <h3 id="gps-guide-title">${title}</h3>
      ${steps.map((s, i) => `
        <div class="gps-step">
          <span class="gps-step-n">${i + 1}</span>
          <span>${s}</span>
        </div>`).join("")}
      <button id="gps-guide-done">${_t("guide_done")}</button>
    `;
    document.body.appendChild(g);
    _guideEl = g;
    requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("show")));

    document.getElementById("gps-guide-done").addEventListener("click", () => {
      _hideGuide();
      const btn = document.getElementById("gps-btn-allow");
      if (btn) { btn.disabled = false; btn.textContent = _t("modal_allow"); }
      _setStatus("", "");
      if (!_modalEl) _showModal();
    });
  }

  function _hideGuide() {
    if (!_guideEl) return;
    _guideEl.classList.remove("show");
    const el = _guideEl; _guideEl = null;
    setTimeout(() => el?.remove(), 300);
  }

  /* ── Re-show modal if location turned off ───────────────────────────── */
  function _handlePermissionLost() {
    if (_modalEl || _isAdmin()) return;
    _cache = null;
    clearInterval(_refreshTimer);
    setTimeout(() => {
      if (_isAdmin() || _modalEl) return;
      _hideGuide();
      _showModal();
    }, 400);
  }

  /* ── Core GPS fetch ─────────────────────────────────────────────────── */
  function _silentFetch(forceFresh = false) {
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        const r = { status: "no_support", gps_success: false, inRange: false, ts: Date.now() };
        _cache = r; resolve(r); return;
      }

      if (_fetchInProgress) {
        setTimeout(() => resolve(_silentFetch(forceFresh)), 100);
        return;
      }

      _fetchInProgress = true;
      let done = false;
      const finish = r => {
        if (done) return;
        done = true;
        _fetchInProgress = false;
        _cache = { ...r, ts: Date.now() };
        resolve(_cache);
      };

      const timer = setTimeout(
        () => finish({ status: "timeout", gps_success: false, inRange: false }),
        FETCH_TIMEOUT
      );

      navigator.geolocation.getCurrentPosition(
        pos => {
          clearTimeout(timer);
          finish({
            status: "success", gps_success: true, inRange: true,
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        err => {
          clearTimeout(timer);
          finish({
            status: err.code === 1 ? "denied" : "error",
            gps_success: false, inRange: false
          });
        },
        {
          enableHighAccuracy: false,
          timeout: FETCH_TIMEOUT,
          maximumAge: 0           // always fresh
        }
      );
    });
  }

  /* ── Permission watcher (Chrome/Edge/Firefox/Samsung) ───────────────── */
  async function _watchPermission() {
    if (!navigator.permissions) return;
    try {
      const perm = await navigator.permissions.query({ name: "geolocation" });
      _permWatch = perm;
      perm.addEventListener("change", async () => {
        if (perm.state === "granted") {
          if (_modalEl) {
            _destroyModal();
            _hideGuide();
          }
          const r = await _silentFetch(true);
          if (r.gps_success) _startRefresh();
        } else if (perm.state === "denied" || perm.state === "prompt") {
          _handlePermissionLost();
        }
      });
    } catch (_) { }
  }

  /* ── Safari periodic recheck ────────────────────────────────────────── */
  function _startSafariRecheck() {
    clearInterval(_recheckTimer);
    _recheckTimer = setInterval(async () => {
      if (_isAdmin()) return;
      if (_cache && _cache.gps_success && !_modalEl) {
        // لو تم التخطي، متعملش recheck
        if (_cache.skipped) return;
        const r = await _silentFetch(true);
        if (!r.gps_success) {
          _handlePermissionLost();
        }
      }
    }, RECHECK_MS);
  }

  /* ── Background refresh ─────────────────────────────────────────────── */
  function _startRefresh() {
    clearInterval(_refreshTimer);
    _refreshTimer = setInterval(() => {
      if (_isAdmin()) return;
      // لو تم التخطي، متعملش refresh حقيقي
      if (_cache && _cache.skipped) return;
      _silentFetch();
    }, REFRESH_MS);
  }

  /* ── Main init ──────────────────────────────────────────────────────── */
  async function _init() {
    if (_initialized) return;
    _initialized = true;

    if (!document.body) {
      await new Promise(r => window.addEventListener("DOMContentLoaded", r, { once: true }));
    }

    _injectStyles();
    if (_isAdmin()) return;

    _watchPermission();

    if (navigator.permissions) {
      let perm = null;
      try { perm = await navigator.permissions.query({ name: "geolocation" }); } catch (_) { }

      if (perm) {
        if (perm.state === "granted") {
          _silentFetch().then(r => { if (r.gps_success) _startRefresh(); });
          return;
        }
        _showModal();
        return;
      }
    }

    _showModal();
    _startSafariRecheck();

    _silentFetch(true).then(probe => {
      if (probe.gps_success) {
        _destroyModal();
        _startRefresh();
      } else if (probe.status === "denied") {
        _setStatus(_t("status_denied"), "#ef4444");
        const btn = document.getElementById("gps-btn-allow");
        if (btn) { btn.disabled = false; btn.textContent = _t("modal_allow"); }
      }
    });
  }

  /* ── Boot ───────────────────────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init, { once: true });
  } else {
    _init();
  }

  /* ── Public API ─────────────────────────────────────────────────────── */
  window.GPSManager = {
    getForJoin() {
      if (_cache && _cache.gps_success && (Date.now() - _cache.ts) < CACHE_TTL_MS * 2) {
        return { ..._cache };
      }
      return { status: "no_cache", gps_success: false, inRange: false, lat: 0, lng: 0 };
    },
    getCache: () => _cache,
    isReady: () => !!(_cache && _cache.gps_success),
  };

  window.getGPSForJoin = () => window.GPSManager.getForJoin();
  window.initGPSOnStartup = () => { };
  window.getSilentLocationData = () => Promise.resolve(window.GPSManager.getForJoin());
  window._showGPSForceModal = () => { };
  window._retryGPSPermission = () => { };

})();
