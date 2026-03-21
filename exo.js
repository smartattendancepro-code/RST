/**
 * GPS Permission Manager v5.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Scenario 1 — granted : silent fetch → cache → nothing shown
 * Scenario 2 — prompt  : simple centered modal (Allow + optional How-to)
 * Scenario 3 — denied  : compact guide (Safari or Chrome steps only)
 *
 * Guarantees:
 *   • Shows on FIRST open (not just refresh) — sessionStorage flag
 *   • Runs once — _initialized guard
 *   • No hanging — 8s hard timeout
 *   • Safari: modal shown instantly, fetch in background
 *   • PermissionStatus.onchange — instant cleanup on grant
 *   • Admin sessions skipped
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {

  /* ── Constants ──────────────────────────────────────────────────────── */
  const CACHE_TTL_MS  = 10 * 60 * 1000;
  const REFRESH_MS    =  3 * 60 * 1000;
  const FETCH_TIMEOUT = 8_000;
  const ADMIN_KEY     = "secure_admin_session_token_v99";
  const STYLE_ID      = "gps-mgr-v5";

  /* ── State ──────────────────────────────────────────────────────────── */
  let _cache        = null;
  let _initialized  = false;
  let _permWatch    = null;
  let _refreshTimer = null;
  let _modalEl      = null;
  let _guideEl      = null;

  /* ── Helpers ────────────────────────────────────────────────────────── */
  const _lang    = () => localStorage.getItem("sys_lang") === "en" ? "en" : "ar";
  const _dir     = () => _lang() === "ar" ? "rtl" : "ltr";
  const _isAdmin = () => !!sessionStorage.getItem(ADMIN_KEY);
  const _isSafari= () =>
    /iP(hone|ad|od)/i.test(navigator.userAgent) ||
    (/Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent));

  /* ── i18n ───────────────────────────────────────────────────────────── */
  const STR = {
    ar: {
      modal_title   : "تحديد الموقع مطلوب",
      modal_body    : "يحتاج التطبيق إذن الوصول إلى موقعك للتحقق الأمني أثناء تسجيل الحضور.",
      modal_allow   : "📍 السماح بالموقع",
      modal_how     : "كيف أفعّل الموقع؟",
      guide_title_s : "تفعيل الموقع — Safari",
      guide_title_c : "تفعيل الموقع — Chrome",
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
      guide_done    : "✅ تم — أعد المحاولة",
      fetching      : "⏳ جاري تحديد الموقع…",
      success       : "✅ تم تحديد الموقع",
      denied        : "⚠️ الموقع مرفوض — اضغط «كيف أفعّل»",
    },
    en: {
      modal_title   : "Location Required",
      modal_body    : "This app needs your location to verify attendance securely.",
      modal_allow   : "📍 Allow Location",
      modal_how     : "How to enable location?",
      guide_title_s : "Enable Location — Safari",
      guide_title_c : "Enable Location — Chrome",
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
      guide_done    : "✅ Done — retry",
      fetching      : "⏳ Getting location…",
      success       : "✅ Location ready",
      denied        : "⚠️ Still blocked — tap How to enable",
    },
  };
  const _t = k => (STR[_lang()] || STR.ar)[k];

  /* ── Styles ─────────────────────────────────────────────────────────── */
  function _injectStyles () {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
/* ── Backdrop ── */
.gps-backdrop {
  position: fixed; inset: 0;
  background: rgba(15,23,42,.55);
  backdrop-filter: blur(4px);
  z-index: 2147483638;
  opacity: 0;
  transition: opacity .22s ease;
}
.gps-backdrop.show { opacity: 1; }

/* ── Centered modal ── */
#gps-modal {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -54%);
  z-index: 2147483639;
  background: #fff;
  border-radius: 20px;
  padding: 24px 20px 20px;
  width: min(320px, calc(100vw - 32px));
  box-shadow: 0 12px 40px rgba(0,0,0,.22);
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
  #gps-modal { background: #1e293b; }
  #gps-modal-title { color: #f1f5f9 !important; }
  #gps-modal-body  { color: #94a3b8 !important; }
}
#gps-modal-icon {
  font-size: 36px;
  text-align: center;
  margin-bottom: 10px;
}
#gps-modal-title {
  font-size: 15px;
  font-weight: 900;
  color: #0f172a;
  text-align: center;
  margin: 0 0 8px;
}
#gps-modal-body {
  font-size: 12px;
  color: #64748b;
  text-align: center;
  line-height: 1.6;
  margin: 0 0 18px;
}
#gps-modal-status {
  font-size: 12px;
  text-align: center;
  min-height: 18px;
  margin-bottom: 12px;
  font-weight: 600;
  color: #64748b;
  transition: color .2s;
}
#gps-btn-allow {
  width: 100%;
  padding: 12px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  font-family: inherit;
  margin-bottom: 8px;
  transition: opacity .15s;
}
#gps-btn-allow:active { opacity: .85; }
#gps-btn-allow:disabled { opacity: .5; cursor: default; }
#gps-btn-how {
  width: 100%;
  padding: 9px;
  background: transparent;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: background .15s;
}
#gps-btn-how:active { background: #f1f5f9; }

/* ── Compact guide (bottom sheet) ── */
#gps-guide {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 2147483640;
  background: #fff;
  border-radius: 18px 18px 0 0;
  padding: 14px 18px 32px;
  max-width: 420px;
  margin: 0 auto;
  box-shadow: 0 -4px 24px rgba(0,0,0,.15);
  font-family: 'Tajawal','Cairo',sans-serif;
  transform: translateY(110%);
  transition: transform .28s cubic-bezier(.22,.68,0,1.2);
}
#gps-guide.show { transform: translateY(0); }
@media (prefers-color-scheme: dark) {
  #gps-guide { background: #1e293b; }
  #gps-guide-title { color: #f1f5f9 !important; }
  .gps-step { background: #0f172a !important; color: #cbd5e1 !important; }
}
.gps-guide-bar {
  width: 32px; height: 4px; border-radius: 2px;
  background: #e2e8f0; margin: 0 auto 12px;
}
#gps-guide-title {
  font-size: 13px; font-weight: 900;
  color: #0f172a; margin: 0 0 12px;
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
  let _bdEl = null;
  function _showBackdrop (onClick) {
    if (_bdEl) return;
    const bd = document.createElement("div");
    bd.className = "gps-backdrop";
    document.body.appendChild(bd);
    _bdEl = bd;
    requestAnimationFrame(() => requestAnimationFrame(() => bd.classList.add("show")));
    if (onClick) bd.addEventListener("click", onClick);
  }
  function _hideBackdrop () {
    if (!_bdEl) return;
    _bdEl.classList.remove("show");
    const el = _bdEl; _bdEl = null;
    setTimeout(() => el?.remove(), 300);
  }

  /* ── Modal ──────────────────────────────────────────────────────────── */
  function _showModal () {
    if (_modalEl) return;
    const dir = _dir();
    const modal = document.createElement("div");
    modal.id = "gps-modal";
    modal.setAttribute("dir", dir);
    modal.innerHTML = `
      <div id="gps-modal-icon">📍</div>
      <h3 id="gps-modal-title">${_t("modal_title")}</h3>
      <p  id="gps-modal-body">${_t("modal_body")}</p>
      <div id="gps-modal-status"></div>
      <button id="gps-btn-allow">${_t("modal_allow")}</button>
      <button id="gps-btn-how">${_t("modal_how")}</button>
    `;
    document.body.appendChild(modal);
    _modalEl = modal;
    _showBackdrop();
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add("show")));

    document.getElementById("gps-btn-allow").addEventListener("click", _onAllow);
    document.getElementById("gps-btn-how").addEventListener("click", () => {
      _hideGuide();
      _showGuide();
    });
  }

  function _destroyModal () {
    if (!_modalEl) return;
    _modalEl.classList.remove("show");
    const el = _modalEl; _modalEl = null;
    _hideBackdrop();
    setTimeout(() => el?.remove(), 320);
  }

  function _setStatus (msg, color) {
    const el = document.getElementById("gps-modal-status");
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || "#64748b";
  }

  /* ── Allow handler ──────────────────────────────────────────────────── */
  async function _onAllow () {
    const btn = document.getElementById("gps-btn-allow");
    if (btn) { btn.disabled = true; btn.textContent = _t("fetching"); }
    _setStatus(_t("fetching"), "#0ea5e9");

    const r = await _silentFetch();

    if (r.gps_success) {
      _setStatus(_t("success"), "#10b981");
      setTimeout(_destroyModal, 1200);
      _startRefresh();
    } else if (r.status === "denied") {
      _setStatus(_t("denied"), "#ef4444");
      if (btn) { btn.disabled = false; btn.textContent = _t("modal_allow"); }
    } else {
      // timeout / error — restore button
      _setStatus("", "");
      if (btn) { btn.disabled = false; btn.textContent = _t("modal_allow"); }
    }
  }

  /* ── Guide ──────────────────────────────────────────────────────────── */
  function _showGuide () {
    if (_guideEl) return;
    const safari = _isSafari();
    const steps  = safari ? _t("guide_steps_safari") : _t("guide_steps_chrome");
    const title  = safari ? _t("guide_title_s") : _t("guide_title_c");
    const dir    = _dir();

    const stepsHtml = steps.map((s, i) => `
      <div class="gps-step">
        <span class="gps-step-n">${i + 1}</span>
        <span>${s}</span>
      </div>`).join("");

    const g = document.createElement("div");
    g.id = "gps-guide";
    g.setAttribute("dir", dir);
    g.innerHTML = `
      <div class="gps-guide-bar"></div>
      <h3 id="gps-guide-title">${title}</h3>
      ${stepsHtml}
      <button id="gps-guide-done">${_t("guide_done")}</button>
    `;
    document.body.appendChild(g);
    _guideEl = g;
    requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("show")));

    document.getElementById("gps-guide-done").addEventListener("click", async () => {
      _hideGuide();
      if (_modalEl) {
        const btn = document.getElementById("gps-btn-allow");
        if (btn) { btn.disabled = false; btn.textContent = _t("modal_allow"); }
        _setStatus("", "");
      } else {
        _showModal();
      }
    });
  }

  function _hideGuide () {
    if (!_guideEl) return;
    _guideEl.classList.remove("show");
    const el = _guideEl; _guideEl = null;
    setTimeout(() => el?.remove(), 320);
  }

  /* ── Core fetch ─────────────────────────────────────────────────────── */
  function _silentFetch () {
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        const r = { status:"no_support", gps_success:false, inRange:false, ts:Date.now() };
        _cache = r; resolve(r); return;
      }
      let done = false;
      const finish = r => {
        if (done) return; done = true;
        _cache = { ...r, ts: Date.now() };
        resolve(_cache);
      };
      const timer = setTimeout(
        () => finish({ status:"timeout", gps_success:false, inRange:false }),
        FETCH_TIMEOUT
      );
      navigator.geolocation.getCurrentPosition(
        pos => {
          clearTimeout(timer);
          finish({ status:"success", gps_success:true, inRange:true,
            lat:pos.coords.latitude, lng:pos.coords.longitude,
            accuracy:pos.coords.accuracy });
        },
        err => {
          clearTimeout(timer);
          finish({ status: err.code === 1 ? "denied" : "error",
            gps_success:false, inRange:false });
        },
        { enableHighAccuracy:false, timeout:FETCH_TIMEOUT, maximumAge:30_000 }
      );
    });
  }

  /* ── Permission watcher ─────────────────────────────────────────────── */
  async function _watchPermission () {
    if (!navigator.permissions) return;
    try {
      _permWatch = await navigator.permissions.query({ name:"geolocation" });
      _permWatch.addEventListener("change", async () => {
        if (_permWatch.state !== "granted") return;
        _destroyModal(); _hideGuide();
        const r = await _silentFetch();
        if (r.gps_success) _startRefresh();
      });
    } catch (_) {}
  }

  /* ── Background refresh ─────────────────────────────────────────────── */
  function _startRefresh () {
    clearInterval(_refreshTimer);
    _refreshTimer = setInterval(() => {
      if (_isAdmin()) return;
      _silentFetch();
    }, REFRESH_MS);
  }

  /* ── Main init ──────────────────────────────────────────────────────── */
  async function _init () {
    if (_initialized) return;
    _initialized = true;

    // Wait for body (handles script in <head>)
    if (!document.body) {
      await new Promise(r => window.addEventListener("DOMContentLoaded", r, { once:true }));
    }

    _injectStyles();
    if (_isAdmin()) return;
    _watchPermission();

    /* Path A — Permissions API (Chrome, Edge, Firefox, Samsung) */
    if (navigator.permissions) {
      let perm = null;
      try { perm = await navigator.permissions.query({ name:"geolocation" }); } catch (_) {}

      if (perm) {
        if (perm.state === "granted") {
          // Silent — user sees nothing
          _silentFetch().then(r => { if (r.gps_success) _startRefresh(); });
          return;
        }
        if (perm.state === "denied") {
          _showModal();
          return;
        }
        // "prompt"
        _showModal();
        return;
      }
    }

    /* Path B — Safari (no Permissions API)
       Show modal instantly, fetch in background */
    _showModal();

    _silentFetch().then(probe => {
      if (probe.gps_success) {
        _destroyModal();
        _startRefresh();
      } else if (probe.status === "denied") {
        _setStatus(_t("denied"), "#ef4444");
        const btn = document.getElementById("gps-btn-allow");
        if (btn) { btn.disabled = false; btn.textContent = _t("modal_allow"); }
      }
    });
  }

  /* ── Boot ───────────────────────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init, { once:true });
  } else {
    _init();
  }

  /* ── Public API ─────────────────────────────────────────────────────── */
  window.GPSManager = {
    getForJoin () {
      if (_cache && _cache.gps_success && (Date.now() - _cache.ts) < CACHE_TTL_MS * 2) {
        return { ..._cache };
      }
      return { status:"no_cache", gps_success:false, inRange:false, lat:0, lng:0 };
    },
    getCache : () => _cache,
    isReady  : () => !!(_cache && _cache.gps_success),
  };

  /* ── Drop-in replacements ───────────────────────────────────────────── */
  window.getGPSForJoin         = () => window.GPSManager.getForJoin();
  window.initGPSOnStartup      = () => {};
  window.getSilentLocationData = () => Promise.resolve(window.GPSManager.getForJoin());
  window._showGPSForceModal    = () => {};
  window._retryGPSPermission   = () => {};

})();
