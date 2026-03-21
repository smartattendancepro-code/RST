/**
 * GPS Permission Manager v3.1
 * ─────────────────────────────────────────────────────────────────────────────
 * Scenario 1 — granted  : silent fetch → cache → nothing shown to user
 * Scenario 2 — prompt   : Toast with "Allow" button → browser native dialog
 *                          Toast disappears instantly on grant
 * Scenario 3 — denied   : Guidance modal (tabs per browser) + "Done" retry btn
 *
 * Guarantees:
 *   • Runs once (_initialized guard)
 *   • No hanging: 8s hard timeout on every fetch
 *   • No polling: PermissionStatus.onchange for instant UI cleanup
 *   • Safari: Toast shown INSTANTLY before fetch — zero wait for user
 *   • Admin sessions are completely skipped
 *   • window.getGPSForJoin() is replaced — drop-in compatible
 *   • Old GPS functions neutralised to prevent conflicts
 * ─────────────────────────────────────────────────────────────────────────────
 */

window.GPSManager = (function () {

  /* ── Constants ──────────────────────────────────────────────────────── */
  const CACHE_TTL_MS  = 5  * 60 * 1000;
  const REFRESH_MS    = 3  * 60 * 1000;
  const FETCH_TIMEOUT = 8_000;
  const ADMIN_KEY     = "secure_admin_session_token_v99";
  const STYLE_ID      = "gps-mgr-v3-style";

  /* ── Singleton state ────────────────────────────────────────────────── */
  let _cache        = null;
  let _initialized  = false;
  let _permWatch    = null;
  let _refreshTimer = null;
  let _toastEl      = null;
  let _guideEl      = null;
  let _toastTimer   = null;

  /* ── i18n ───────────────────────────────────────────────────────────── */
  const STRINGS = {
    ar: {
      toast_msg     : "📍 هذا التطبيق يحتاج موقعك للتحقق الأمني",
      toast_btn     : "السماح",
      toast_fetching: "⏳ جاري تحديد الموقع…",
      toast_ok      : "✅ تم تحديد الموقع بنجاح",
      toast_denied  : "⚠️ الموقع مرفوض — اتبع الخطوات أدناه",
      guide_title   : "كيفية تفعيل الموقع",
      guide_note    : "اتبع خطوات متصفحك ثم اضغط «تم»",
      guide_btn     : "✅ تم — أعد التحقق",
      browsers: [
        {
          id   : "chrome",
          name : "Chrome",
          icon : "🌐",
          steps: [
            "اضغط على أيقونة 🔒 أو ⓘ بجانب عنوان الصفحة",
            "اختر «إعدادات الموقع»",
            "غيّر الموقع إلى «السماح»",
            "أعد تحميل الصفحة",
          ],
        },
        {
          id   : "safari",
          name : "Safari",
          icon : "🧭",
          steps: [
            "افتح الإعدادات ← الخصوصية والأمان",
            "خدمات الموقع ← Safari",
            "اختر «عند استخدام التطبيق»",
            "عُد للصفحة وأعد تحميلها",
          ],
        },
        {
          id   : "firefox",
          name : "Firefox",
          icon : "🦊",
          steps: [
            "اضغط على أيقونة 🔒 بجانب عنوان الصفحة",
            "اختر «مزيد من المعلومات»",
            "تبويب «الأذونات» ← الموقع",
            "أزل «الحظر» وأعد التحميل",
          ],
        },
        {
          id   : "samsung",
          name : "Samsung Internet",
          icon : "📱",
          steps: [
            "اضغط ⋮ ← الإعدادات ← مواقع الويب",
            "أذونات مواقع الويب ← الموقع",
            "تحقق أن الموقع الحالي غير محظور",
            "أعد تحميل الصفحة",
          ],
        },
        {
          id   : "edge",
          name : "Edge",
          icon : "🔷",
          steps: [
            "اضغط على أيقونة القفل بجانب العنوان",
            "اختر «أذونات هذا الموقع»",
            "الموقع ← «السماح»",
            "أعد تحميل الصفحة",
          ],
        },
        {
          id   : "opera",
          name : "Opera",
          icon : "🔴",
          steps: [
            "اضغط على أيقونة القفل أو ⓘ بجانب العنوان",
            "اختر «إعدادات الموقع»",
            "الموقع الجغرافي ← «السماح»",
            "أعد تحميل الصفحة",
          ],
        },
      ],
    },
    en: {
      toast_msg     : "📍 This app needs your location for secure check-in",
      toast_btn     : "Allow",
      toast_fetching: "⏳ Fetching your location…",
      toast_ok      : "✅ Location acquired",
      toast_denied  : "⚠️ Location blocked — follow the steps below",
      guide_title   : "How to enable location",
      guide_note    : "Follow the steps for your browser, then tap Done",
      guide_btn     : "✅ Done — retry",
      browsers: [
        {
          id   : "chrome",
          name : "Chrome",
          icon : "🌐",
          steps: [
            "Tap the 🔒 or ⓘ icon next to the address bar",
            'Choose "Site settings"',
            'Set Location to "Allow"',
            "Reload the page",
          ],
        },
        {
          id   : "safari",
          name : "Safari",
          icon : "🧭",
          steps: [
            "Open Settings → Privacy & Security",
            "Location Services → Safari",
            'Choose "While Using the App"',
            "Return to the page and reload",
          ],
        },
        {
          id   : "firefox",
          name : "Firefox",
          icon : "🦊",
          steps: [
            "Tap the 🔒 icon next to the address bar",
            'Choose "More Information"',
            "Permissions tab → Location",
            'Remove the "Block" and reload',
          ],
        },
        {
          id   : "samsung",
          name : "Samsung Internet",
          icon : "📱",
          steps: [
            "Tap ⋮ → Settings → Sites and downloads",
            "Site permissions → Location",
            "Make sure this site is not blocked",
            "Reload the page",
          ],
        },
        {
          id   : "edge",
          name : "Edge",
          icon : "🔷",
          steps: [
            "Tap the lock icon next to the address bar",
            'Choose "Permissions for this site"',
            'Location → "Allow"',
            "Reload the page",
          ],
        },
        {
          id   : "opera",
          name : "Opera",
          icon : "🔴",
          steps: [
            "Tap the lock or ⓘ icon next to the address bar",
            'Choose "Site settings"',
            'Geolocation → "Allow"',
            "Reload the page",
          ],
        },
      ],
    },
  };

  const _lang = () => localStorage.getItem("sys_lang") === "en" ? "en" : "ar";
  const _t    = (key) => (STRINGS[_lang()] || STRINGS.ar)[key];
  const _dir  = () => _lang() === "ar" ? "rtl" : "ltr";
  const _isAdmin = () => !!sessionStorage.getItem(ADMIN_KEY);

  /* ── Detect likely browser ──────────────────────────────────────────── */
  function _detectBrowser () {
    const ua = navigator.userAgent;
    if (/SamsungBrowser/i.test(ua)) return "samsung";
    if (/OPR|OPX|Opera/i.test(ua))  return "opera";
    if (/Edg\//i.test(ua))           return "edge";
    if (/Firefox/i.test(ua))         return "firefox";
    if (/iP(hone|ad|od)/i.test(ua)) return "safari";
    return "chrome";
  }

  /* ── Inject CSS (once) ──────────────────────────────────────────────── */
  function _injectStyles () {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
#gps-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(120px);
  z-index: 2147483640;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #0f172a;
  color: #f1f5f9;
  padding: 12px 16px 12px 20px;
  border-radius: 16px;
  font-family: 'Tajawal','Cairo',sans-serif;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 8px 32px rgba(0,0,0,.35);
  transition: transform .35s cubic-bezier(.22,.68,0,1.2), opacity .25s ease;
  opacity: 0;
  max-width: calc(100vw - 32px);
  line-height: 1.4;
}
#gps-toast.visible { transform: translateX(-50%) translateY(0); opacity: 1; }
#gps-toast.success { background: #064e3b; }
#gps-toast.warning { background: #78350f; }
#gps-toast.fetching{ background: #1e3a5f; }
#gps-toast-msg { flex: 1; }
#gps-toast-btn {
  flex-shrink: 0;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: transform .1s;
}
#gps-toast-btn:active { transform: scale(.95); }
#gps-guide-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,.65);
  backdrop-filter: blur(5px);
  z-index: 2147483641;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s ease;
}
#gps-guide-overlay.visible { opacity: 1; pointer-events: auto; }
#gps-guide-card {
  background: #fff;
  border-radius: 24px 24px 0 0;
  padding: 20px 20px 44px;
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  transform: translateY(40px);
  transition: transform .32s cubic-bezier(.22,.68,0,1.2);
  font-family: 'Tajawal','Cairo',sans-serif;
}
#gps-guide-overlay.visible #gps-guide-card { transform: translateY(0); }
@media (prefers-color-scheme: dark) {
  #gps-guide-card { background: #1e293b; }
  .gps-step { background: #0f172a !important; color: #e2e8f0 !important; }
  .gps-browser-title { color: #38bdf8 !important; }
  #gps-guide-title { color: #f1f5f9 !important; }
  #gps-guide-note  { color: #94a3b8 !important; }
  .gps-tab { background: #0f172a !important; }
  .gps-tab.active { background: #1d4ed8 !important; }
  .gps-tab-label { color: #e2e8f0 !important; }
  .gps-tab.active .gps-tab-label { color: #fff !important; }
}
.gps-handle {
  width: 36px; height: 4px; border-radius: 2px;
  background: #e2e8f0; margin: 0 auto 16px;
}
#gps-guide-title {
  font-size: 16px; font-weight: 900; color: #0f172a;
  text-align: center; margin: 0 0 4px;
}
#gps-guide-note {
  font-size: 12px; color: #64748b;
  text-align: center; margin: 0 0 16px;
}
#gps-tabs {
  display: flex; gap: 8px; overflow-x: auto;
  padding-bottom: 6px; margin-bottom: 14px;
  scrollbar-width: none;
}
#gps-tabs::-webkit-scrollbar { display: none; }
.gps-tab {
  flex-shrink: 0;
  background: #f1f5f9;
  border: none; border-radius: 10px;
  padding: 6px 14px;
  cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  font-family: inherit;
  transition: background .15s;
}
.gps-tab.active { background: #1d4ed8; }
.gps-tab-icon  { font-size: 15px; }
.gps-tab-label { font-size: 12px; font-weight: 700; color: #334155; white-space: nowrap; }
.gps-tab.active .gps-tab-label { color: #fff; }
.gps-panel { display: none; }
.gps-panel.active { display: block; }
.gps-browser-title {
  font-size: 13px; font-weight: 800; color: #0ea5e9;
  margin: 0 0 10px;
  display: flex; align-items: center; gap: 6px;
}
.gps-step {
  background: #f8fafc; border-radius: 10px;
  padding: 9px 12px; margin-bottom: 7px;
  font-size: 12px; color: #334155; font-weight: 500;
  display: flex; align-items: center; gap: 10px;
  line-height: 1.5;
}
.gps-step-num {
  width: 22px; height: 22px; border-radius: 50%;
  background: #0ea5e9; color: #fff;
  font-size: 10px; font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
#gps-guide-done {
  width: 100%; padding: 14px; margin-top: 12px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff; border: none; border-radius: 14px;
  font-size: 14px; font-weight: 800;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 6px 20px rgba(16,185,129,.3);
  transition: transform .15s;
}
#gps-guide-done:active { transform: scale(.97); }
    `;
    document.head.appendChild(s);
  }

  /* ── Toast helpers ──────────────────────────────────────────────────── */
  function _showToast (msg, type, withBtn) {
    _destroyToast();
    const el = document.createElement("div");
    el.id        = "gps-toast";
    el.className = type || "info";
    el.setAttribute("dir", _dir());
    el.innerHTML = `<span id="gps-toast-msg">${msg}</span>
      ${withBtn ? `<button id="gps-toast-btn">${_t("toast_btn")}</button>` : ""}`;
    document.body.appendChild(el);
    _toastEl = el;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("visible")));
    if (withBtn) {
      document.getElementById("gps-toast-btn")
        .addEventListener("click", _onAllowClick, { once: true });
    } else {
      _toastTimer = setTimeout(_destroyToast, 3000);
    }
  }

  function _updateToast (msg, type) {
    clearTimeout(_toastTimer);
    if (!_toastEl) return;
    const msgEl = document.getElementById("gps-toast-msg");
    const btnEl = document.getElementById("gps-toast-btn");
    if (msgEl) msgEl.textContent = msg;
    _toastEl.className = type;
    if (btnEl) btnEl.remove();
  }

  function _destroyToast () {
    clearTimeout(_toastTimer);
    if (!_toastEl) return;
    _toastEl.classList.remove("visible");
    const el = _toastEl; _toastEl = null;
    setTimeout(() => el.remove(), 380);
  }

  /* ── Allow button handler ───────────────────────────────────────────── */
  async function _onAllowClick () {
    _updateToast(_t("toast_fetching"), "fetching");
    const r = await _silentFetch();
    if (r.gps_success) {
      _updateToast(_t("toast_ok"), "success");
      setTimeout(_destroyToast, 2000);
      _startRefresh();
    } else if (r.status === "denied") {
      _updateToast(_t("toast_denied"), "warning");
      setTimeout(() => { _destroyToast(); _showGuide(); }, 1800);
    } else {
      // timeout / error → restore button for retry
      _updateToast(_t("toast_msg"), "info");
      if (_toastEl) {
        const btn = document.createElement("button");
        btn.id = "gps-toast-btn"; btn.textContent = _t("toast_btn");
        btn.addEventListener("click", _onAllowClick, { once: true });
        _toastEl.appendChild(btn);
      }
    }
  }

  /* ── Guidance modal ─────────────────────────────────────────────────── */
  function _showGuide () {
    if (_guideEl) return;
    const browsers = _t("browsers");
    const active   = _detectBrowser();
    const dir      = _dir();

    const tabsHtml = browsers.map(b =>
      `<button class="gps-tab${b.id === active ? " active" : ""}" data-tab="${b.id}">
         <span class="gps-tab-icon">${b.icon}</span>
         <span class="gps-tab-label">${b.name}</span>
       </button>`
    ).join("");

    const panelsHtml = browsers.map(b =>
      `<div class="gps-panel${b.id === active ? " active" : ""}" id="gps-panel-${b.id}">
         <div class="gps-browser-title">${b.icon} ${b.name}</div>
         ${b.steps.map((s, i) =>
           `<div class="gps-step">
              <span class="gps-step-num">${i + 1}</span>
              <span>${s}</span>
            </div>`
         ).join("")}
       </div>`
    ).join("");

    const overlay = document.createElement("div");
    overlay.id    = "gps-guide-overlay";
    overlay.innerHTML = `
      <div id="gps-guide-card" dir="${dir}">
        <div class="gps-handle"></div>
        <h3 id="gps-guide-title">⚙️ ${_t("guide_title")}</h3>
        <p id="gps-guide-note">${_t("guide_note")}</p>
        <div id="gps-tabs">${tabsHtml}</div>
        ${panelsHtml}
        <button id="gps-guide-done">${_t("guide_btn")}</button>
      </div>`;

    document.body.appendChild(overlay);
    _guideEl = overlay;

    // Tab switching
    overlay.querySelectorAll(".gps-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        overlay.querySelectorAll(".gps-tab").forEach(t => t.classList.remove("active"));
        overlay.querySelectorAll(".gps-panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("gps-panel-" + tab.dataset.tab)?.classList.add("active");
      });
    });

    // Done / retry
    document.getElementById("gps-guide-done").addEventListener("click", async () => {
      _destroyGuide();
      _showToast(_t("toast_fetching"), "fetching");
      const r = await _silentFetch();
      if (r.gps_success) {
        _updateToast(_t("toast_ok"), "success");
        setTimeout(_destroyToast, 2000);
        _startRefresh();
      } else if (r.status === "denied") {
        _updateToast(_t("toast_denied"), "warning");
        setTimeout(() => { _destroyToast(); _showGuide(); }, 1800);
      } else {
        _destroyToast();
        _showToast(_t("toast_msg"), "info", true);
      }
    });

    requestAnimationFrame(() =>
      requestAnimationFrame(() => overlay.classList.add("visible"))
    );
  }

  function _destroyGuide () {
    if (!_guideEl) return;
    _guideEl.classList.remove("visible");
    const el = _guideEl; _guideEl = null;
    setTimeout(() => el.remove(), 380);
  }

  /* ── Core GPS fetch (8s timeout, no hanging) ────────────────────────── */
  function _silentFetch () {
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        const r = { status:"no_support", gps_success:false, inRange:false, ts:Date.now() };
        _cache = r; resolve(r); return;
      }
      let settled = false;
      const finish = (r) => {
        if (settled) return; settled = true;
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
          finish({
            status:"success", gps_success:true, inRange:true,
            lat:pos.coords.latitude, lng:pos.coords.longitude,
            accuracy:pos.coords.accuracy,
          });
        },
        err => {
          clearTimeout(timer);
          finish({ status: err.code === 1 ? "denied" : "error", gps_success:false, inRange:false });
        },
        { enableHighAccuracy:false, timeout:FETCH_TIMEOUT, maximumAge:30_000 }
      );
    });
  }

  /* ── PermissionStatus watcher ───────────────────────────────────────── */
  async function _watchPermission () {
    if (!navigator.permissions) return;
    try {
      _permWatch = await navigator.permissions.query({ name:"geolocation" });
      _permWatch.addEventListener("change", async () => {
        if (_permWatch.state !== "granted") return;
        _destroyToast(); _destroyGuide();
        const r = await _silentFetch();
        if (r.gps_success) {
          _showToast(_t("toast_ok"), "success");
          setTimeout(_destroyToast, 2000);
          _startRefresh();
        }
      });
    } catch (_) {}
  }

  /* ── Background refresh ─────────────────────────────────────────────── */
  function _startRefresh () {
    clearInterval(_refreshTimer);
    _refreshTimer = setInterval(() => {
      if (_isAdmin()) return;
      _silentFetch().then(r => {
        if (r.gps_success) console.log("[GPS] bg refresh ✓", Math.round(r.accuracy) + "m");
      });
    }, REFRESH_MS);
  }

  /* ── Main init (runs once) ──────────────────────────────────────────── */
  async function _init () {
    if (_initialized) return;
    _initialized = true;
    _injectStyles();
    if (_isAdmin()) return;
    _watchPermission();

    /* ── Path A: Permissions API (Chrome, Edge, Firefox, Samsung) ────── */
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
          _showGuide();
          return;
        }
        // "prompt" — show Toast immediately, no fetch yet
        _showToast(_t("toast_msg"), "info", true);
        return;
      }
    }

    /* ── Path B: Safari / WKWebView (no Permissions API) ─────────────── */
    // Show Toast INSTANTLY — zero wait for user
    _showToast(_t("toast_msg"), "info", true);

    // Fetch in background — never blocks the UI
    _silentFetch().then(probe => {
      if (probe.gps_success) {
        // User already tapped Allow in Safari's native dialog
        _destroyToast();
        _startRefresh();
      } else if (probe.status === "denied") {
        // User tapped Deny — swap to guide
        _destroyToast();
        _showGuide();
      }
      // timeout / error → Toast stays, user can tap "Allow" to retry
    });
  }

  /* ── Boot ───────────────────────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init, { once: true });
  } else {
    _init();
  }

  /* ── Public API ─────────────────────────────────────────────────────── */
  return {
    getForJoin () {
      if (_cache && _cache.gps_success && (Date.now() - _cache.ts) < CACHE_TTL_MS * 2) {
        return { ..._cache };
      }
      return { status:"no_cache", gps_success:false, inRange:false, lat:0, lng:0 };
    },
    getCache : () => _cache,
    isReady  : () => !!(_cache && _cache.gps_success),
  };

})();

/* ── Drop-in replacements (no conflicts) ─────────────────────────────────── */
window.getGPSForJoin         = () => window.GPSManager.getForJoin();
window.initGPSOnStartup      = () => {};
window.getSilentLocationData = () => Promise.resolve(window.GPSManager.getForJoin());
window._showGPSForceModal    = () => {};
window._retryGPSPermission   = () => {};