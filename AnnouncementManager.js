
import {
    collection, doc,
    getDocs, getDoc, setDoc,
    query, where, orderBy, limit,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const TYPE_CONFIG = Object.freeze({
    info: { headerBg: '#001828', accentColor: '#00e5ff', badgeSymbol: '◈', label: 'إعلان', labelEn: 'INFO' },
    warning: { headerBg: '#1a0f00', accentColor: '#d98b14', badgeSymbol: '⚠', label: 'تنبيه', labelEn: 'WARNING' },
    urgent: { headerBg: '#1a0400', accentColor: '#c73a18', badgeSymbol: '⛔', label: 'عاجل', labelEn: 'URGENT' },
    success: { headerBg: '#021209', accentColor: '#3a9a58', badgeSymbol: '✔', label: 'مبروك', labelEn: 'MISSION' },
    update: { headerBg: '#0c0620', accentColor: '#8060d0', badgeSymbol: '◉', label: 'تحديث', labelEn: 'UPDATE' },
});

const INJECTED_STYLE_ID = '_ann_tac_style';

function _injectStyles() {
    if (document.getElementById(INJECTED_STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = INJECTED_STYLE_ID;
    s.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;700&family=Orbitron:wght@700;900&display=swap');

#_annModal {
    position:fixed;inset:0;z-index:2147483647;
    background:rgba(0,0,0,0.82);
    display:flex;align-items:center;justify-content:center;
    padding:16px;
    opacity:0;transition:opacity .25s ease;
    backdrop-filter:blur(4px);
    -webkit-backdrop-filter:blur(4px);
    overflow-y:auto;
    -webkit-overflow-scrolling:touch;
    box-sizing:border-box;
}

#_annCard {
    position:relative;
    width:100%;
    max-width:320px;
    max-height:90vh;
    overflow-y:auto;
    overflow-x:hidden;
    -webkit-overflow-scrolling:touch;
    background:#040e18;
    clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% calc(100% - 14px),calc(100% - 14px) 100%,14px 100%,0 calc(100% - 14px),0 14px);
    font-family:'Rajdhani','Courier New',monospace;
    box-sizing:border-box;
    transform:translateY(28px) scale(.96);
    transition:transform .32s cubic-bezier(.34,1.56,.64,1);
    scrollbar-width:none;
}
#_annCard::-webkit-scrollbar { display:none; }

#_annCard::before {
    content:'';position:absolute;inset:0;pointer-events:none;z-index:0;
    background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,229,255,0.018) 3px,rgba(0,229,255,0.018) 4px);
}

._ann_scanline {
    position:absolute;top:0;left:0;right:0;height:2px;
    background:linear-gradient(90deg,transparent,#00e5ff,transparent);
    animation:_ann_scan 3s linear infinite;
    opacity:0.5;z-index:40;pointer-events:none;
}
@keyframes _ann_scan {
    0%{top:0;opacity:0.6;}85%{opacity:0.5;}100%{top:100%;opacity:0;}
}

._ann_border {
    position:absolute;inset:0;pointer-events:none;z-index:1;
    clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% calc(100% - 14px),calc(100% - 14px) 100%,14px 100%,0 calc(100% - 14px),0 14px);
    background:linear-gradient(135deg,#00e5ff,#005577,#00e5ff);
}
._ann_border::after {
    content:'';position:absolute;inset:1.5px;
    clip-path:polygon(13px 0,calc(100% - 13px) 0,100% 13px,100% calc(100% - 13px),calc(100% - 13px) 100%,13px 100%,0 calc(100% - 13px),0 13px);
    background:#040e18;
}

._ann_corner {
    position:absolute;width:18px;height:18px;z-index:20;pointer-events:none;
}
._ann_corner::before,._ann_corner::after {
    content:'';position:absolute;background:#00e5ff;
}
._ann_corner::before{width:100%;height:2px;}
._ann_corner::after {width:2px;height:100%;}
._ann_corner.tl{top:4px;left:4px;}
._ann_corner.tr{top:4px;right:4px;}
._ann_corner.tr::before{right:0;left:auto;}
._ann_corner.tr::after {right:0;left:auto;}
._ann_corner.bl{bottom:4px;left:4px;}
._ann_corner.bl::before{bottom:0;top:auto;}
._ann_corner.bl::after {bottom:0;top:auto;}
._ann_corner.br{bottom:4px;right:4px;}
._ann_corner.br::before{bottom:0;top:auto;right:0;left:auto;}
._ann_corner.br::after {bottom:0;top:auto;right:0;left:auto;}

._ann_clabel {
    position:absolute;font-family:'Orbitron',monospace;
    font-size:7px;color:rgba(0,229,255,0.2);
    letter-spacing:1px;z-index:25;pointer-events:none;
}
._ann_clabel.tl{top:20px;left:24px;}
._ann_clabel.br{bottom:20px;right:24px;}

._ann_header {
    position:relative;z-index:5;
    padding:16px 14px 12px;
    display:flex;flex-direction:column;align-items:center;gap:8px;
    overflow:hidden;
}
._ann_header::after {
    content:'';position:absolute;bottom:0;left:0;right:0;height:1px;
    background:linear-gradient(90deg,transparent,#00e5ff88,transparent);
}

._ann_icon_hex {
    position:relative;z-index:2;
    width:56px;height:56px;
    display:flex;align-items:center;justify-content:center;
    clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);
    background:#001828;
    flex-shrink:0;
}

._ann_pattern_svg {
    width:52px;height:52px;
    display:block;
}

._ann_badge {
    position:relative;z-index:2;
    font-family:'Orbitron',monospace;
    font-size:8px;font-weight:700;
    letter-spacing:3px;text-transform:uppercase;
    padding:4px 12px;
    border:1px solid rgba(0,229,255,0.4);
    clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 50%,calc(100% - 8px) 100%,8px 100%,0 50%);
    background:#001020;
    display:flex;align-items:center;gap:6px;
    white-space:nowrap;
}

._ann_ping {
    display:inline-block;width:5px;height:5px;
    border-radius:50%;background:#00e5ff;
    flex-shrink:0;
    animation:_ann_ping 1.5s ease infinite;
}
@keyframes _ann_ping {
    0%,100%{opacity:1;}50%{opacity:0.3;}
}

._ann_uid {
    font-family:'Orbitron',monospace;
    font-size:7px;color:rgba(0,229,255,0.25);letter-spacing:2px;
    text-align:center;
}

._ann_body {
    position:relative;z-index:5;
    padding:12px 14px 14px;
    border-top:1px solid rgba(0,229,255,0.1);
    box-sizing:border-box;
}

._ann_title {
    font-family:'Orbitron',monospace;
    font-size:12px;font-weight:700;
    color:#d0f0ff;
    text-align:center;
    margin-bottom:10px;
    line-height:1.4;
}

._ann_divider {
    display:flex;align-items:center;gap:6px;
    margin:0 0 10px;opacity:0.35;
}
._ann_divider_line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#00e5ff,transparent);}
._ann_divider_dots{font-size:8px;color:#00e5ff;letter-spacing:2px;}

._ann_items {
    display:flex;flex-direction:column;gap:6px;
    margin-bottom:10px;
}

._ann_item {
    display:flex;align-items:flex-start;gap:8px;
    padding:8px 9px;
    background:#001520;
    border:1px solid rgba(0,229,255,0.12);
    clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px);
    box-sizing:border-box;
}

._ann_item_icon {
    font-size:15px;flex-shrink:0;margin-top:1px;
}

._ann_item_text { flex:1;min-width:0; }

._ann_item_title {
    font-size:11px;font-weight:700;
    color:#a0d8ef;letter-spacing:0.5px;
    display:block;margin-bottom:2px;
}
._ann_item_title.ar { direction:rtl;text-align:right; }

._ann_item_body {
    font-size:10px;color:#4a8a9a;line-height:1.6;
    word-break:break-word;
}
._ann_item_body.ar { direction:rtl;text-align:right; }

._ann_sep {
    height:1px;
    background:linear-gradient(90deg,transparent,rgba(0,229,255,0.15),transparent);
    margin:6px 0 8px;
}

._ann_update_label {
    font-family:'Orbitron',monospace;
    font-size:7px;color:rgba(0,229,255,0.35);
    letter-spacing:3px;text-align:center;margin-bottom:8px;
}

._ann_update_item {
    display:flex;align-items:flex-start;gap:10px;
    padding:10px 12px;
    background:#002a1a;
    border-left:3px solid #00e5aa;
    margin-bottom:8px;
    box-sizing:border-box;
}

._ann_update_icon {
    flex-shrink:0;
    width:36px;height:36px;
    display:block;
}

._ann_update_content { flex:1;min-width:0; }

._ann_update_title {
    font-family:'Orbitron',monospace;
    font-size:9px;font-weight:700;
    color:#00e5aa;letter-spacing:1px;
    display:block;margin-bottom:4px;
}
._ann_update_title.ar { direction:rtl;text-align:right; }

._ann_update_text {
    font-size:10px;color:#7affd4;line-height:1.6;
    word-break:break-word;
}
._ann_update_text.ar { direction:rtl;text-align:right; }

._ann_btn_got_it {
    display:block;width:100%;
    padding:11px;border:0;cursor:pointer;
    font-family:'Orbitron',monospace;
    font-size:9px;font-weight:700;
    letter-spacing:2px;text-transform:uppercase;
    color:#001a2e;
    background:linear-gradient(135deg,#00e5ff,#0099bb);
    clip-path:polygon(10px 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,10px 100%,0 50%);
    margin-bottom:8px;margin-top:10px;
    transition:filter .15s;
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation;
    box-sizing:border-box;
}
._ann_btn_got_it:active { filter:brightness(0.9); }

._ann_btn_close {
    display:block;width:100%;
    padding:8px;
    border:1px solid rgba(0,229,255,0.2);
    background:transparent;cursor:pointer;
    font-family:'Rajdhani',monospace;
    font-size:10px;font-weight:700;
    letter-spacing:2px;text-transform:uppercase;
    color:#2a6a7a;
    clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 50%,calc(100% - 8px) 100%,8px 100%,0 50%);
    transition:border-color .15s,color .15s;
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation;
    box-sizing:border-box;
}
._ann_btn_close:active { border-color:rgba(0,229,255,0.5);color:#00e5ff; }

@media (max-height: 700px) {
    ._ann_header { padding:10px 14px 10px; }
    ._ann_icon_hex { width:46px;height:46px; }
    ._ann_pattern_svg { width:42px;height:42px; }
    ._ann_body { padding:10px 12px 12px; }
    ._ann_item { padding:6px 8px; }
    ._ann_items { gap:5px;margin-bottom:8px; }
}

@media (max-width: 360px) {
    #_annCard { max-width:290px; }
    ._ann_title { font-size:11px; }
    ._ann_badge { font-size:7px;letter-spacing:2px; }
}
    `;
    document.head.appendChild(s);
}

const _PS = window.PersistentStore || {
    async get(k) { return localStorage.getItem(k); },
    async setWithSync(k, v) { try { localStorage.setItem(k, v); } catch { } },
};

function _patternIconSVG() {
    return `<svg class="_ann_pattern_svg" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
        <rect width="52" height="52" rx="6" fill="#001828"/>
        <!-- 16 dot grid 4x4, spacing=12, start=4 -->
        <!-- row1 -->
        <circle cx="4"  cy="4"  r="2.5" fill="#1a3a4a"/>
        <circle cx="16" cy="4"  r="2.5" fill="#1a3a4a"/>
        <circle cx="28" cy="4"  r="2.5" fill="#1a3a4a"/>
        <circle cx="40" cy="4"  r="2.5" fill="#1a3a4a"/>
        <!-- row2 -->
        <circle cx="4"  cy="16" r="2.5" fill="#1a3a4a"/>
        <circle cx="16" cy="16" r="2.5" fill="#1a3a4a"/>
        <circle cx="28" cy="16" r="2.5" fill="#1a3a4a"/>
        <circle cx="40" cy="16" r="2.5" fill="#1a3a4a"/>
        <!-- row3 -->
        <circle cx="4"  cy="28" r="2.5" fill="#1a3a4a"/>
        <circle cx="16" cy="28" r="2.5" fill="#1a3a4a"/>
        <circle cx="28" cy="28" r="2.5" fill="#1a3a4a"/>
        <circle cx="40" cy="28" r="2.5" fill="#1a3a4a"/>
        <!-- row4 -->
        <circle cx="4"  cy="40" r="2.5" fill="#1a3a4a"/>
        <circle cx="16" cy="40" r="2.5" fill="#1a3a4a"/>
        <circle cx="28" cy="40" r="2.5" fill="#1a3a4a"/>
        <circle cx="40" cy="40" r="2.5" fill="#1a3a4a"/>
        <!-- connection lines: dot(16,16)→dot(28,28)→dot(16,40) -->
        <line x1="16" y1="16" x2="28" y2="28" stroke="#00e5ff" stroke-width="2" stroke-linecap="round" stroke-opacity="0.9"/>
        <line x1="28" y1="28" x2="16" y2="40" stroke="#00e5ff" stroke-width="2" stroke-linecap="round" stroke-opacity="0.9"/>
        <!-- active dot 1 -->
        <circle cx="16" cy="16" r="5" fill="#00e5ff" fill-opacity="0.15"/>
        <circle cx="16" cy="16" r="3.5" fill="#00e5ff"/>
        <!-- active dot 2 -->
        <circle cx="28" cy="28" r="5" fill="#00e5ff" fill-opacity="0.15"/>
        <circle cx="28" cy="28" r="3.5" fill="#00e5ff"/>
        <!-- active dot 3 -->
        <circle cx="16" cy="40" r="5" fill="#00e5ff" fill-opacity="0.15"/>
        <circle cx="16" cy="40" r="3.5" fill="#00e5ff"/>
    </svg>`;
}

const _SAP_ANN_CONTENT = {
    en: {
        badge: 'WHATS NEW',
        title: 'PLATFORM UPDATE',
        i1t: 'Auto Time Sync',
        i1b: 'Keep your device time automatic to ensure smooth attendance registration.',
        i2t: 'Offline Registration',
        i2b: 'Register attendance without internet using the Offline button.',
        i3t: 'Instant Notifications',
        i3b: 'Enable push notifications to never miss a session alert.',
        updateLabel: 'NEW  ★  PATTERN LOCK',
        u1Title: 'PATTERN LOCK',
        u1: 'Draw your secret pattern to register — faster, smarter, and more secure.',
        gotIt: 'AWESOME, GOT IT  ✓',
        dismiss: 'REMIND ME LATER  ✕',
    },
    ar: {
        badge: 'جديد الآن',
        title: 'تحديث المنصة',
        i1t: 'ضبط الوقت التلقائي',
        i1b: 'تأكد أن الوقت تلقائي على جهازك لضمان تسجيل حضورك بسلاسة.',
        i2t: 'التسجيل بدون إنترنت',
        i2b: 'يمكنك تسجيل الحضور بدون نت عبر زر التسجيل الأوفلاين.',
        i3t: 'إشعارات فورية',
        i3b: 'فعّل الإشعارات حتى لا تفوتك أي جلسة أو تنبيه.',
        updateLabel: '★  جديد  —  التسجيل بالنمط  ★',
        u1Title: 'التسجيل بالنمط',
        u1: 'ارسم نمطك السري للتسجيل — أسرع وأذكى وأكثر أماناً من أي وقت.',
        gotIt: 'رائع، فهمت  ✓',
        dismiss: 'ذكّرني لاحقاً  ✕',
    },
};

const HARDCODED_ANNOUNCEMENTS = [
    {
        id: 'sap_remind_v1',
        type: 'info',
        target: 'all',
        _isSapReminder: true,
    },
];

export const AnnouncementManager = (() => {

    let _queue = [];
    let _showing = false;
    let _db = null;
    let _uid = null;

    const _localKey = (annId) => `ann_seen_${annId}_${_uid}`;

    async function _isSeenLocally(annId) {
        if (localStorage.getItem(_localKey(annId))) return true;
        return !!(await _PS.get(_localKey(annId)));
    }

    async function _isSeenRemotely(annId) {
        if (!_db || !_uid) return false;
        try {
            const snap = await getDoc(doc(_db, 'announcement_reads', `${_uid}_${annId}`));
            return snap.exists();
        } catch { return false; }
    }

    async function _isSeen(annId) {
        if (await _isSeenLocally(annId)) return true;
        return _isSeenRemotely(annId);
    }

    async function _markSeen(annId) {
        const val = JSON.stringify({ ts: Date.now() });
        await _PS.setWithSync(_localKey(annId), val);
        if (_db && _uid) {
            setDoc(
                doc(_db, 'announcement_reads', `${_uid}_${annId}`),
                { uid: _uid, annId, seenAt: serverTimestamp() }
            ).catch(e => console.warn('[Ann] Remote mark-seen skipped:', e.code));
        }
    }

    function _isTargeted(ann, level, role) {
        const t = (ann.target || 'all').toString().trim().toLowerCase();
        if (t === 'all') return true;
        if (t === 'students' && role !== 'doctor') return true;
        if (t === 'doctors' && role === 'doctor') return true;
        if (/^[1-4]$/.test(t) && String(level) === t) return true;
        return false;
    }

    async function _fetch(level, role) {
        try {
            const now = Date.now();
            const snap = await getDocs(
                query(
                    collection(_db, 'announcements'),
                    where('isActive', '==', true),
                    orderBy('createdAt', 'desc'),
                    limit(20)
                )
            );
            if (snap.empty) return;
            for (const d of snap.docs) {
                const ann = { id: d.id, ...d.data() };
                if (ann.expiresAt && ann.expiresAt.toMillis() < now) continue;
                if (!_isTargeted(ann, level, role)) continue;
                if (await _isSeen(ann.id)) continue;
                _queue.push(ann);
            }
            _showNext();
        } catch (e) {
            console.warn('[AnnouncementManager] Fetch error:', e);
        }
    }

    async function _loadHardcoded(level, role) {
        for (const ann of HARDCODED_ANNOUNCEMENTS) {
            if (!_isTargeted(ann, level, role)) continue;
            if (await _isSeen(ann.id)) continue;
            _queue.push(ann);
        }
        _showNext();
    }

    function _showNext() {
        if (_showing || _queue.length === 0) return;
        _showing = true;
        _render(_queue.shift());
    }

    function _render(ann) {
        _injectStyles();
        document.getElementById('_annModal')?.remove();

        if (ann._isSapReminder) { _renderSapReminder(ann); return; }

        const cfg = TYPE_CONFIG[ann.type] || TYPE_CONFIG.info;
        const isAr = (localStorage.getItem('sys_lang') || 'ar') === 'ar';

        const overlay = document.createElement('div');
        overlay.id = '_annModal';

        const card = document.createElement('div');
        card.id = '_annCard';

        card.setAttribute('translate', 'no');
        card.classList.add('notranslate');
        card.innerHTML = `
            <div class="_ann_scanline"></div>
            <div class="_ann_border"></div>
            <div class="_ann_corner tl"></div>
            <div class="_ann_corner tr"></div>
            <div class="_ann_corner bl"></div>
            <div class="_ann_corner br"></div>
            <div class="_ann_clabel tl">SAP://ANN</div>
            <div class="_ann_clabel br">v3.2.0</div>`;

        const header = document.createElement('div');
        header.className = '_ann_header';
        header.style.background = cfg.headerBg;
        header.innerHTML = `
            <div class="_ann_icon_hex" style="border:2px solid ${cfg.accentColor}33;">
                <i class="fa-solid ${ann.icon || 'fa-bullhorn'}" style="font-size:20px;color:${cfg.accentColor};"></i>
            </div>
            <div class="_ann_badge" style="color:${cfg.accentColor};">
                <span class="_ann_ping" style="background:${cfg.accentColor};"></span>
                ${cfg.badgeSymbol}&nbsp;&nbsp;${isAr ? cfg.label : cfg.labelEn}
            </div>
            <div class="_ann_uid">UID-SYS &nbsp;◆&nbsp; PLATFORM-NOTIFY</div>`;

        const body = document.createElement('div');
        body.className = '_ann_body';
        body.innerHTML = `
            <div class="_ann_title">${_sanitize(ann.title || '')}</div>
            <div class="_ann_divider">
                <div class="_ann_divider_line"></div>
                <div class="_ann_divider_dots">◆ ◆ ◆</div>
                <div class="_ann_divider_line"></div>
            </div>
            <div class="_ann_item_body ${isAr ? 'ar' : ''}"
                 style="font-size:11px;text-align:center;margin-bottom:14px;color:#4a8a9a;line-height:1.6;">
                ${_sanitize(ann.body || '')}
            </div>`;

        if (ann.ctaLabel && ann.ctaUrl) {
            const cta = document.createElement('a');
            cta.className = '_ann_btn_got_it';
            cta.href = ann.ctaUrl;
            cta.target = '_blank';
            cta.rel = 'noopener noreferrer';
            cta.textContent = ann.ctaLabel;
            cta.style.background = cfg.accentColor;
            cta.style.color = _isDark(cfg.accentColor) ? '#fff' : '#001a2e';
            cta.addEventListener('click', () => _close(overlay, ann.id));
            body.appendChild(cta);
        }

        const gotItBtn = document.createElement('button');
        gotItBtn.className = '_ann_btn_got_it';
        gotItBtn.type = 'button';
        gotItBtn.style.background = `linear-gradient(135deg,${cfg.accentColor},${cfg.accentColor}99)`;
        gotItBtn.textContent = isAr ? 'فهمت  ✓' : 'GOT IT  ✓';
        gotItBtn.addEventListener('click', () => _close(overlay, ann.id));
        body.appendChild(gotItBtn);

        card.appendChild(header);
        card.appendChild(body);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        _animateIn(overlay, card);
        _attachCloseEvents(overlay, ann.id);
    }

    function _renderSapReminder(ann) {
        const isAr = (localStorage.getItem('sys_lang') || 'ar') === 'ar';
        const c = isAr ? _SAP_ANN_CONTENT.ar : _SAP_ANN_CONTENT.en;
        const cfg = TYPE_CONFIG.info;

        const overlay = document.createElement('div');
        overlay.id = '_annModal';

        const card = document.createElement('div');
        card.id = '_annCard';
        card.setAttribute('translate', 'no');
        card.classList.add('notranslate');
        card.innerHTML = `
    <div class="_ann_scanline"></div>
    <div class="_ann_border"></div>
    <div class="_ann_corner tl"></div>
    <div class="_ann_corner tr"></div>
    <div class="_ann_corner bl"></div>
    <div class="_ann_corner br"></div>
    <div class="_ann_clabel tl">SAP://BROADCAST</div>
    <div class="_ann_clabel br">v3.2.0</div>`;

        const header = document.createElement('div');
        header.className = '_ann_header';
        header.style.background = cfg.headerBg;
        header.innerHTML = `
            <div class="_ann_icon_hex" style="border:2px solid ${cfg.accentColor}33;">
                ${_patternIconSVG()}
            </div>
            <div class="_ann_badge" style="color:${cfg.accentColor};">
                <span class="_ann_ping"></span>
                ${c.badge}
            </div>
            <div class="_ann_uid">UID-SYS &nbsp;◆&nbsp; PLATFORM-NOTIFY</div>`;

        const body = document.createElement('div');
        body.className = '_ann_body';

        const title = document.createElement('div');
        title.className = '_ann_title';
        title.textContent = c.title;
        body.appendChild(title);

        body.insertAdjacentHTML('beforeend', `
            <div class="_ann_divider">
                <div class="_ann_divider_line"></div>
                <div class="_ann_divider_dots">◆ ◆ ◆</div>
                <div class="_ann_divider_line"></div>
            </div>`);

        const items = [
            { icon: '🕐', t: c.i1t, b: c.i1b },
            { icon: '📶', t: c.i2t, b: c.i2b },
            { icon: '🔔', t: c.i3t, b: c.i3b },
        ];
        const itemsWrap = document.createElement('div');
        itemsWrap.className = '_ann_items';
        items.forEach(({ icon, t, b }) => {
            const div = document.createElement('div');
            div.className = '_ann_item';
            div.innerHTML = `
                <div class="_ann_item_icon">${icon}</div>
                <div class="_ann_item_text">
                    <span class="_ann_item_title ${isAr ? 'ar' : ''}">${t}</span>
                    <div class="_ann_item_body ${isAr ? 'ar' : ''}">${b}</div>
                </div>`;
            itemsWrap.appendChild(div);
        });
        body.appendChild(itemsWrap);

        body.insertAdjacentHTML('beforeend', '<div class="_ann_sep"></div>');

        body.insertAdjacentHTML('beforeend',
            `<div class="_ann_update_label">${c.updateLabel}</div>`);

        const upd = document.createElement('div');
        upd.className = '_ann_update_item';
        upd.innerHTML = `
            <div style="flex-shrink:0;">
                ${_patternIconSVG()}
            </div>
            <div class="_ann_update_content">
                <span class="_ann_update_title ${isAr ? 'ar' : ''}">${c.u1Title}</span>
                <div class="_ann_update_text ${isAr ? 'ar' : ''}">${c.u1}</div>
            </div>`;
        body.appendChild(upd);

        const gotItBtn = document.createElement('button');
        gotItBtn.className = '_ann_btn_got_it';
        gotItBtn.type = 'button';
        gotItBtn.style.marginTop = '10px';
        gotItBtn.textContent = c.gotIt;
        gotItBtn.addEventListener('click', () => _close(overlay, ann.id));
        body.appendChild(gotItBtn);

        const dismissBtn = document.createElement('button');
        dismissBtn.className = '_ann_btn_close';
        dismissBtn.type = 'button';
        dismissBtn.textContent = c.dismiss;
        dismissBtn.addEventListener('click', () => _dismiss(overlay));
        body.appendChild(dismissBtn);

        card.appendChild(header);
        card.appendChild(body);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        _animateIn(overlay, card);
    }

    function _animateIn(overlay, card) {
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            card.style.transform = 'translateY(0) scale(1)';
        });
        try { navigator.vibrate?.(20); } catch { }
    }

    function _attachCloseEvents(overlay, annId) {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) _close(overlay, annId);
        });
        const onEsc = e => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', onEsc);
                _close(overlay, annId);
            }
        };
        document.addEventListener('keydown', onEsc);
    }

    async function _close(overlay, annId) {
        overlay.style.opacity = '0';
        const card = document.getElementById('_annCard');
        if (card) card.style.transform = 'translateY(20px) scale(0.96)';
        await _markSeen(annId);
        setTimeout(() => { overlay.remove(); _showing = false; _showNext(); }, 280);
    }

    function _dismiss(overlay) {
        overlay.style.opacity = '0';
        const card = document.getElementById('_annCard');
        if (card) card.style.transform = 'translateY(20px) scale(0.96)';
        setTimeout(() => { overlay.remove(); _showing = false; _showNext(); }, 280);
    }

    function _isDark(hex) {
        const c = hex.replace('#', '');
        const r = parseInt(c.substr(0, 2), 16);
        const g = parseInt(c.substr(2, 2), 16);
        const b = parseInt(c.substr(4, 2), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
    }

    function _sanitize(html) {
        return String(html)
            .replace(/<(?!\/?(?:b|strong|br|em|span)(?:\s[^>]*)?>)[^>]+>/gi, '')
            .replace(/on\w+="[^"]*"/gi, '');
    }


    async function init(db, uid, { level = '', role = 'student' } = {}) {
        _db = db;
        _uid = uid;
        await _loadHardcoded(level, role);
        await _fetch(level, role);
    }

    async function showManual(ann, force = false) {
        if (!_uid) return;
        if (!force && await _isSeen(ann.id)) return;
        _queue.unshift(ann);
        if (!_showing) _showNext();
    }

    function resetSeen(annId) {
        if (!_uid) return;
        localStorage.removeItem(_localKey(annId));
        _PS.setWithSync(_localKey(annId), '').catch(() => { });
    }

    return { init, showManual, resetSeen };

})();