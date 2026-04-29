import {
    collection, doc,
    getDocs, getDoc, setDoc,
    query, where, orderBy, limit,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const TYPE_CONFIG = Object.freeze({
    info:    { headerBg: 'rgba(14,165,233,0.08)',  accentColor: '#0ea5e9', badgeSymbol: '◈', label: 'إعلان',  labelEn: 'INFO'    },
    warning: { headerBg: 'rgba(245,158,11,0.08)',  accentColor: '#f59e0b', badgeSymbol: '⚠', label: 'تنبيه',  labelEn: 'WARNING' },
    urgent:  { headerBg: 'rgba(239,68,68,0.08)',   accentColor: '#ef4444', badgeSymbol: '⛔', label: 'عاجل',   labelEn: 'URGENT'  },
    success: { headerBg: 'rgba(16,185,129,0.08)',  accentColor: '#10b981', badgeSymbol: '✔', label: 'مبروك',  labelEn: 'MISSION' },
    update:  { headerBg: 'rgba(99,102,241,0.08)',  accentColor: '#6366f1', badgeSymbol: '◉', label: 'تحديث',  labelEn: 'UPDATE'  },
});

const INJECTED_STYLE_ID = '_ann_tac_style';

function _injectStyles() {
    if (document.getElementById(INJECTED_STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = INJECTED_STYLE_ID;
    s.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800&family=Outfit:wght@500;700;900&display=swap');

@keyframes _ann_fadeInUp {
    from { opacity:0; transform:translateY(20px); }
    to   { opacity:1; transform:translateY(0); }
}

#_annModal {
    position:fixed; inset:0; z-index:2147483647;
    background:rgba(0,0,0,0.6);
    display:flex; align-items:center; justify-content:center;
    padding:20px;
    opacity:0; transition:opacity .25s ease;
    backdrop-filter:blur(4px);
    -webkit-backdrop-filter:blur(4px);
    overflow-y:auto;
    -webkit-overflow-scrolling:touch;
    box-sizing:border-box;
}

#_annCard {
    position:relative;
    width:100%; max-width:295px;
    max-height:90vh; overflow-y:auto; overflow-x:hidden;
    -webkit-overflow-scrolling:touch;
    background:linear-gradient(145deg,#e0f2fe,#f0f9ff);
    border:1px solid #7dd3fc;
    clip-path:polygon(
        0px 20px, 7px 7px, 20px 0px,
        52px 4px, 100px 0px, 150px 3px,
        190px 0px, calc(100% - 18px) 2px,
        calc(100% - 6px) 0px, 100% 14px,
        calc(100% - 2px) 48px, 100% 92px,
        calc(100% - 3px) 148px, 100% 208px,
        calc(100% - 2px) calc(100% - 18px),
        calc(100% - 8px) calc(100% - 6px),
        calc(100% - 20px) 100%,
        calc(100% - 62px) calc(100% - 4px),
        calc(100% - 115px) 100%,
        calc(100% - 168px) calc(100% - 3px),
        28px calc(100% - 1px),
        9px calc(100% - 8px),
        0px calc(100% - 22px),
        3px calc(100% - 72px),
        0px calc(100% - 135px),
        4px 78px
    );
    padding:28px 22px 24px;
    box-shadow:0 25px 60px rgba(0,0,0,0.3);
    font-family:'Cairo',sans-serif;
    box-sizing:border-box;
    animation:_ann_fadeInUp .3s ease;
    scrollbar-width:none;
}
#_annCard::-webkit-scrollbar { display:none; }

._ann_icon_wrap {
    width:56px; height:56px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    margin:0 auto 14px;
    background:rgba(14,165,233,0.15);
    border:2px solid rgba(14,165,233,0.3);
    flex-shrink:0;
}

._ann_title {
    color:#0c4a6e; font-size:16px; font-weight:800;
    text-align:center; margin-bottom:3px;
    font-family:'Outfit',sans-serif;
}

._ann_subtitle {
    color:#0369a1; font-size:12px; font-weight:500;
    text-align:center; margin-bottom:18px;
}

._ann_divider {
    display:flex; align-items:center; gap:8px;
    margin:0 0 14px; opacity:0.4;
}
._ann_divider_line { flex:1; height:1px; background:linear-gradient(90deg,transparent,#0ea5e9,transparent); }
._ann_divider_dots { font-size:8px; color:#0284c7; letter-spacing:2px; }

._ann_items {
    display:flex; flex-direction:column; gap:7px;
    margin-bottom:14px;
}

._ann_item {
    display:flex; align-items:flex-start; gap:9px;
    padding:9px 11px;
    background:rgba(255,255,255,0.7);
    border:1px solid #bae6fd;
    clip-path:polygon(
        0 0, calc(100% - 9px) 2px, 100% 0,
        calc(100% - 2px) calc(100% - 7px),
        calc(100% - 11px) 100%,
        4px calc(100% - 1px), 0 calc(100% - 5px)
    );
    box-sizing:border-box;
    text-align:right; direction:rtl;
}

._ann_item_icon { font-size:15px; flex-shrink:0; margin-top:1px; }
._ann_item_text { flex:1; min-width:0; }

._ann_item_title {
    font-size:12px; font-weight:800; color:#0c4a6e;
    display:block; margin-bottom:2px;
}

._ann_item_body {
    font-size:11px; color:#0369a1; line-height:1.5;
    word-break:break-word;
}

._ann_sep {
    height:1px;
    background:linear-gradient(90deg,transparent,#bae6fd,transparent);
    margin:6px 0 10px;
}

._ann_update_label {
    font-size:10px; color:#0284c7; letter-spacing:2px;
    text-align:center; margin-bottom:9px; font-weight:700;
}

._ann_update_item {
    display:flex; align-items:flex-start; gap:9px;
    padding:10px 12px;
    background:rgba(255,255,255,0.7);
    border-right:3px solid #0ea5e9;
    clip-path:polygon(
        0 0, calc(100% - 8px) 2px, 100% 0,
        calc(100% - 1px) calc(100% - 9px),
        calc(100% - 10px) 100%,
        3px calc(100% - 1px), 0 calc(100% - 7px)
    );
    margin-bottom:10px;
    text-align:right; direction:rtl;
    box-sizing:border-box;
}

._ann_update_title {
    font-size:11px; font-weight:800; color:#0284c7;
    display:block; margin-bottom:3px;
}

._ann_update_text {
    font-size:11px; color:#0369a1; line-height:1.5;
    word-break:break-word;
}

._ann_btn_got_it {
    display:flex; width:100%; padding:13px; border:none;
    border-radius:14px;
    background:linear-gradient(135deg,#0ea5e9,#0284c7);
    color:#fff; font-size:14px; font-weight:700;
    cursor:pointer;
    align-items:center; justify-content:center; gap:8px;
    box-shadow:0 4px 15px rgba(14,165,233,0.4);
    font-family:'Outfit',sans-serif;
    margin-bottom:9px; margin-top:4px;
    box-sizing:border-box;
    transition:filter .15s;
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation;
}
._ann_btn_got_it:active { filter:brightness(0.9); }

._ann_btn_close {
    display:block; width:100%; padding:10px;
    border:1px solid #bae6fd; border-radius:14px;
    background:rgba(255,255,255,0.5); cursor:pointer;
    font-family:'Outfit',sans-serif;
    font-size:13px; font-weight:700; color:#0369a1;
    transition:border-color .15s;
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation;
    box-sizing:border-box;
}
._ann_btn_close:active { border-color:#7dd3fc; }

@media (max-height:700px) {
    #_annModal { align-items:flex-start; padding:12px; }
    #_annCard { padding:18px 16px 16px; max-height:88vh; }
    ._ann_icon_wrap { width:44px; height:44px; margin-bottom:8px; }
    ._ann_items { gap:5px; margin-bottom:10px; }
    ._ann_item { padding:7px 9px; }
    ._ann_item_body { font-size:10px; }
    ._ann_update_item { padding:8px 10px; }
}
@media (max-height:600px) {
    #_annCard { padding:14px 14px 14px; }
    ._ann_icon_wrap { width:38px; height:38px; margin-bottom:6px; }
    ._ann_title { font-size:14px; }
    ._ann_subtitle { font-size:11px; margin-bottom:12px; }
    ._ann_items { gap:4px; margin-bottom:8px; }
    ._ann_btn_got_it { padding:10px; font-size:13px; }
    ._ann_btn_close { padding:8px; font-size:12px; }
}
@media (max-width:380px) {
    #_annCard { max-width:calc(100vw - 32px); padding:22px 16px 20px; }
    ._ann_title { font-size:15px; }
    ._ann_item_body { font-size:10px; }
}
@media (max-width:320px) {
    #_annCard { max-width:calc(100vw - 24px); padding:18px 13px 16px; }
    ._ann_title { font-size:14px; }
    ._ann_item_title { font-size:11px; }
}
    `;
    document.head.appendChild(s);
}

const _PS = window.PersistentStore || {
    async get(k) { return localStorage.getItem(k); },
    async setWithSync(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

function _patternIconSVG(size = 36) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;">
        <rect width="52" height="52" rx="5" fill="rgba(14,165,233,0.12)"/>
        <circle cx="4"  cy="4"  r="2" fill="#7dd3fc"/><circle cx="16" cy="4"  r="2" fill="#7dd3fc"/>
        <circle cx="28" cy="4"  r="2" fill="#7dd3fc"/><circle cx="40" cy="4"  r="2" fill="#7dd3fc"/>
        <circle cx="4"  cy="16" r="2" fill="#7dd3fc"/><circle cx="16" cy="16" r="2" fill="#7dd3fc"/>
        <circle cx="28" cy="16" r="2" fill="#7dd3fc"/><circle cx="40" cy="16" r="2" fill="#7dd3fc"/>
        <circle cx="4"  cy="28" r="2" fill="#7dd3fc"/><circle cx="16" cy="28" r="2" fill="#7dd3fc"/>
        <circle cx="28" cy="28" r="2" fill="#7dd3fc"/><circle cx="40" cy="28" r="2" fill="#7dd3fc"/>
        <circle cx="4"  cy="40" r="2" fill="#7dd3fc"/><circle cx="16" cy="40" r="2" fill="#7dd3fc"/>
        <circle cx="28" cy="40" r="2" fill="#7dd3fc"/><circle cx="40" cy="40" r="2" fill="#7dd3fc"/>
        <line x1="16" y1="16" x2="28" y2="28" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round"/>
        <line x1="28" y1="28" x2="16" y2="40" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round"/>
        <circle cx="16" cy="16" r="3.5" fill="#0ea5e9"/>
        <circle cx="28" cy="28" r="3.5" fill="#0ea5e9"/>
        <circle cx="16" cy="40" r="3.5" fill="#0ea5e9"/>
    </svg>`;
}

const _SAP_ANN_CONTENT = {
    title:       'مرحباً بك في SAP ',
    subtitle:    ' بنفكرك ',
    i1t: 'ضبط الوقت التلقائي',
    i1b: 'تأكد أنك مفعل ضبط الوقت التلقائي علي جهازك  لضمان تسجيل حضورك بدقة كاملة.',
    i2t: 'التسجيل بدون إنترنت',
    i2b: 'سجّل حضورك حتى عند انقطاع النت عن طريق وضع عدم الاتصال — يُزامَن تلقائياً عند العودة.',
    i3t: 'إشعارات لحظية',
    i3b: 'فعّل الإشعارات حتى تتلقي  تنبيهات الحضور و الغياب فورا .',
    updateLabel: '★  جديد  —   النمط   ★',
    u1Title: ' النمط ',
    u1:      '   تم استبدال كلمة المرور  بالنمط — أسرع وأكثر أماناً من كلمة المرور.',
    gotIt:   'رائع، فهمت  ✓',
    dismiss: 'ذكّرني لاحقاً  ✕',
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

    let _queue   = [];
    let _showing = false;
    let _db      = null;
    let _uid     = null;

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
        if (t === 'doctors'  && role === 'doctor') return true;
        if (/^[1-4]$/.test(t) && String(level) === t) return true;
        return false;
    }

    async function _fetch(level, role) {
        try {
            const now  = Date.now();
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

        const cfg  = TYPE_CONFIG[ann.type] || TYPE_CONFIG.info;
        const isAr = (localStorage.getItem('sys_lang') || 'ar') === 'ar';

        const overlay = document.createElement('div');
        overlay.id = '_annModal';

        const card = document.createElement('div');
        card.id = '_annCard';
        card.setAttribute('translate', 'no');
        card.classList.add('notranslate');

        const iconWrap = document.createElement('div');
        iconWrap.className = '_ann_icon_wrap';
        iconWrap.style.background = `${cfg.accentColor}22`;
        iconWrap.style.borderColor = `${cfg.accentColor}44`;
        iconWrap.innerHTML = `<i class="fa-solid ${ann.icon || 'fa-bullhorn'}" style="font-size:22px;color:${cfg.accentColor};"></i>`;

        const title = document.createElement('div');
        title.className = '_ann_title';
        title.textContent = _sanitize(ann.title || '');

        const subtitle = document.createElement('div');
        subtitle.className = '_ann_subtitle';
        subtitle.textContent = _sanitize(ann.body || '');

        const divider = document.createElement('div');
        divider.className = '_ann_divider';
        divider.innerHTML = `<div class="_ann_divider_line"></div><div class="_ann_divider_dots">◆ ◆ ◆</div><div class="_ann_divider_line"></div>`;

        card.appendChild(iconWrap);
        card.appendChild(title);
        card.appendChild(subtitle);
        card.appendChild(divider);

        if (ann.ctaLabel && ann.ctaUrl) {
            const cta = document.createElement('a');
            cta.className = '_ann_btn_got_it';
            cta.href = ann.ctaUrl;
            cta.target = '_blank';
            cta.rel = 'noopener noreferrer';
            cta.style.background = `linear-gradient(135deg,${cfg.accentColor},${cfg.accentColor}cc)`;
            cta.style.boxShadow = `0 4px 15px ${cfg.accentColor}44`;
            cta.textContent = ann.ctaLabel;
            cta.addEventListener('click', () => _close(overlay, ann.id));
            card.appendChild(cta);
        }

        const gotItBtn = document.createElement('button');
        gotItBtn.className = '_ann_btn_got_it';
        gotItBtn.type = 'button';
        gotItBtn.style.background = `linear-gradient(135deg,${cfg.accentColor},${cfg.accentColor}cc)`;
        gotItBtn.style.boxShadow = `0 4px 15px ${cfg.accentColor}44`;
        gotItBtn.innerHTML = `<i class="fa-solid fa-check"></i> ${isAr ? 'فهمت  ✓' : 'Got it  ✓'}`;
        gotItBtn.addEventListener('click', () => _close(overlay, ann.id));
        card.appendChild(gotItBtn);

        overlay.appendChild(card);
        document.body.appendChild(overlay);
        _animateIn(overlay);
        _attachCloseEvents(overlay, ann.id);
    }

    function _renderSapReminder(ann) {
        const c = _SAP_ANN_CONTENT;

        const overlay = document.createElement('div');
        overlay.id = '_annModal';

        const card = document.createElement('div');
        card.id = '_annCard';
        card.setAttribute('translate', 'no');
        card.classList.add('notranslate');

        card.innerHTML = `
            <div class="_ann_icon_wrap">
                ${_patternIconSVG(32)}
            </div>

            <div class="_ann_title">${c.title}</div>
            <div class="_ann_subtitle">${c.subtitle}</div>

            <div class="_ann_divider">
                <div class="_ann_divider_line"></div>
                <div class="_ann_divider_dots">◆ ◆ ◆</div>
                <div class="_ann_divider_line"></div>
            </div>

            <div class="_ann_items">
                <div class="_ann_item">
                    <div class="_ann_item_icon">🕐</div>
                    <div class="_ann_item_text">
                        <span class="_ann_item_title">${c.i1t}</span>
                        <div class="_ann_item_body">${c.i1b}</div>
                    </div>
                </div>
                <div class="_ann_item">
                    <div class="_ann_item_icon">📶</div>
                    <div class="_ann_item_text">
                        <span class="_ann_item_title">${c.i2t}</span>
                        <div class="_ann_item_body">${c.i2b}</div>
                    </div>
                </div>
                <div class="_ann_item">
                    <div class="_ann_item_icon">🔔</div>
                    <div class="_ann_item_text">
                        <span class="_ann_item_title">${c.i3t}</span>
                        <div class="_ann_item_body">${c.i3b}</div>
                    </div>
                </div>
            </div>

            <div class="_ann_sep"></div>
            <div class="_ann_update_label">${c.updateLabel}</div>

            <div class="_ann_update_item">
                <div style="flex:1;min-width:0;">
                    <span class="_ann_update_title">${c.u1Title}</span>
                    <div class="_ann_update_text">${c.u1}</div>
                </div>
                ${_patternIconSVG(38)}
            </div>
        `;

        const gotItBtn = document.createElement('button');
        gotItBtn.className = '_ann_btn_got_it';
        gotItBtn.type = 'button';
        gotItBtn.innerHTML = `<i class="fa-solid fa-check"></i> ${c.gotIt}`;
        gotItBtn.addEventListener('click', () => _close(overlay, ann.id));
        card.appendChild(gotItBtn);

        const dismissBtn = document.createElement('button');
        dismissBtn.className = '_ann_btn_close';
        dismissBtn.type = 'button';
        dismissBtn.textContent = c.dismiss;
        dismissBtn.addEventListener('click', () => _dismiss(overlay));
        card.appendChild(dismissBtn);

        overlay.appendChild(card);
        document.body.appendChild(overlay);
        _animateIn(overlay);
    }

    function _animateIn(overlay) {
        requestAnimationFrame(() => { overlay.style.opacity = '1'; });
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

    function _sanitize(html) {
        return String(html)
            .replace(/<(?!\/?(?:b|strong|br|em|span)(?:\s[^>]*)?>)[^>]+>/gi, '')
            .replace(/on\w+="[^"]*"/gi, '');
    }

    async function init(db, uid, { level = '', role = 'student' } = {}) {
        _db  = db;
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
        _PS.setWithSync(_localKey(annId), '').catch(() => {});
    }

    return { init, showManual, resetSeen };

})();
