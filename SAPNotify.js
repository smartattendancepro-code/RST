/*!
 * ╔══════════════════════════════════════════════════════╗
 * ║          SAPNotify.js  —  PUBG-Style Alerts          ║
 * ║       Smart Attendance Platform  |  v3.0.0           ║
 * ║       + WhatsApp Button + Full Responsive            ║
 * ╚══════════════════════════════════════════════════════╝
 */

const SAPNotify = (() => {
    const STORAGE_PREFIX = 'sap_notif_seen__';

    function _isSeen(id) {
        try { return localStorage.getItem(STORAGE_PREFIX + id) === '1'; } catch { return false; }
    }
    function _markSeen(id) {
        try { localStorage.setItem(STORAGE_PREFIX + id, '1'); } catch { }
    }

    function _injectCSS() {
        if (document.getElementById('_sapn_styles')) return;
        const CSS = `
        #_sapn_overlay {
            position:fixed;inset:0;z-index:2147483647;
            background:rgba(4,6,14,0.88);
            display:flex;align-items:center;justify-content:center;
            padding:16px;box-sizing:border-box;
            opacity:0;transition:opacity 0.35s ease;
            backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
            overflow-y:auto;
        }
        #_sapn_overlay.sapn-in  { opacity:1; }
        #_sapn_overlay.sapn-out { opacity:0;pointer-events:none; }

        #_sapn_card {
            position:relative;width:100%;max-width:360px;
            background:linear-gradient(160deg,#0b0f1c 0%,#0e1528 55%,#090c17 100%);
            border:1.5px solid #c8960c;
            clip-path:polygon(0 0,calc(100% - 20px) 0,100% 20px,100% 100%,20px 100%,0 calc(100% - 20px));
            padding:26px 20px 20px;direction:rtl;overflow:hidden;
            transform:scale(0.82) translateY(28px);
            transition:transform 0.44s cubic-bezier(0.34,1.56,0.64,1);
            box-sizing:border-box;
        }
        #_sapn_overlay.sapn-in #_sapn_card { transform:scale(1) translateY(0); }

        @media(max-height:640px){
            #_sapn_card{padding:16px 15px 15px;}
            #_sapn_badge{width:44px!important;height:44px!important;font-size:19px!important;margin-bottom:7px!important;}
            #_sapn_title{font-size:14px!important;}
            ._sapn_row{padding:8px 10px!important;margin-bottom:6px!important;}
            ._sapn_row_title{font-size:11.5px!important;}
            ._sapn_row_desc{font-size:11px!important;}
            #_sapn_btn,#_sapn_wa{padding:10px!important;font-size:13px!important;}
        }
        @media(max-width:360px){
            #_sapn_card{padding:18px 13px 15px;clip-path:polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px));}
            ._sapn_row_desc{font-size:11.5px!important;}
        }

        #_sapn_scanlines{
            position:absolute;inset:0;
            background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px);
            pointer-events:none;z-index:0;
        }
        .sapn-corner{position:absolute;width:13px;height:13px;border-color:#f0c040;border-style:solid;z-index:2;}
        .sapn-corner-tr{top:7px;left:7px;border-width:2px 2px 0 0;}
        .sapn-corner-bl{bottom:7px;right:7px;border-width:0 0 2px 2px;}
        #_sapn_glow{
            position:absolute;bottom:-45px;left:50%;transform:translateX(-50%);
            width:200px;height:85px;
            background:radial-gradient(ellipse,rgba(200,150,12,0.15) 0%,transparent 70%);
            pointer-events:none;z-index:0;
        }
        .sapn-divider{height:1px;background:linear-gradient(to left,transparent,#c8960c70,transparent);margin:12px 0;}
        #_sapn_inner{position:relative;z-index:3;}

        #_sapn_badge{
            display:flex;align-items:center;justify-content:center;
            width:54px;height:54px;margin:0 auto 12px;
            background:linear-gradient(135deg,#c8960c,#f0c040,#c8960c);
            clip-path:polygon(50% 0%,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%);
            font-size:24px;line-height:1;
            animation:_sapn_pulse 2.2s ease-in-out infinite;
        }
        @keyframes _sapn_pulse{0%,100%{filter:brightness(1);}50%{filter:brightness(1.4) drop-shadow(0 0 10px rgba(240,192,64,0.5));}}

        #_sapn_label{font-size:9px;font-weight:700;letter-spacing:3px;color:#c8960c;text-align:center;text-transform:uppercase;margin-bottom:7px;font-family:'Outfit','Cairo',sans-serif;}
        #_sapn_title{font-size:17px;font-weight:900;color:#f2e6b4;text-align:center;line-height:1.4;font-family:'Outfit','Cairo',sans-serif;}

        ._sapn_row{
            display:flex;align-items:flex-start;gap:10px;
            background:rgba(255,255,255,0.03);
            border:1px solid rgba(200,150,12,0.18);
            border-radius:8px;padding:10px 12px;margin-bottom:9px;
        }
        ._sapn_row_icon{font-size:19px;line-height:1;flex-shrink:0;margin-top:1px;}
        ._sapn_row_text{flex:1;text-align:right;}
        ._sapn_row_title{font-size:12.5px;font-weight:900;color:#f0c040;margin-bottom:3px;font-family:'Outfit','Cairo',sans-serif;}
        ._sapn_row_desc{font-size:12px;color:#8899bb;line-height:1.8;font-family:'Outfit','Cairo',sans-serif;}
        ._sapn_row_desc b{color:#c8d8f0;font-weight:700;}
        ._sapn_row_desc .sapn-warn{color:#ef4444;font-size:11px;display:block;margin-top:2px;}

        #_sapn_btn{
            display:block;width:100%;padding:13px;margin-top:14px;
            background:linear-gradient(90deg,#b07a08 0%,#f0c040 50%,#c8960c 100%);
            background-size:200% 100%;background-position:0% center;
            border:none;outline:none;cursor:pointer;
            clip-path:polygon(13px 0%,100% 0%,calc(100% - 13px) 100%,0% 100%);
            color:#0a0e18;font-size:14px;font-weight:900;letter-spacing:0.5px;
            font-family:'Outfit','Cairo',sans-serif;
            transition:background-position 0.35s,transform 0.1s;
            -webkit-tap-highlight-color:transparent;box-sizing:border-box;
        }
        #_sapn_btn:hover{background-position:100% center;}
        #_sapn_btn:active{transform:scale(0.96);}

        #_sapn_wa{
            display:flex;align-items:center;justify-content:center;gap:8px;
            width:100%;padding:11px;margin-top:9px;
            background:transparent;border:1px solid #25d36650;border-radius:6px;
            color:#25d366;font-size:13px;font-weight:700;
            font-family:'Outfit','Cairo',sans-serif;
            cursor:pointer;text-decoration:none;
            transition:background 0.2s,transform 0.1s;
            -webkit-tap-highlight-color:transparent;box-sizing:border-box;
        }
        #_sapn_wa:hover{background:rgba(37,211,102,0.08);}
        #_sapn_wa:active{transform:scale(0.97);}
        #_sapn_wa svg{width:17px;height:17px;fill:#25d366;flex-shrink:0;}
        `;
        const el = document.createElement('style');
        el.id = '_sapn_styles';
        el.textContent = CSS;
        document.head.appendChild(el);
    }

    const WA_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

    function _buildHTML({ icon, label, title, rows, btnText, whatsapp }) {
        const rowsHTML = rows.map(r => `
            <div class="_sapn_row">
                <div class="_sapn_row_icon">${r.icon}</div>
                <div class="_sapn_row_text">
                    ${r.title ? `<div class="_sapn_row_title">${r.title}</div>` : ''}
                    <div class="_sapn_row_desc">${r.desc}</div>
                </div>
            </div>`).join('');

        const waBtn = whatsapp
            ? `<a id="_sapn_wa" href="https://wa.me/${whatsapp}" target="_blank" rel="noopener">${WA_SVG} تواصل مع المطوّر</a>`
            : '';

        return `
        <div id="_sapn_card">
            <div id="_sapn_scanlines"></div>
            <div class="sapn-corner sapn-corner-tr"></div>
            <div class="sapn-corner sapn-corner-bl"></div>
            <div id="_sapn_glow"></div>
            <div id="_sapn_inner">
                <div id="_sapn_badge">${icon}</div>
                <div id="_sapn_label">${label}</div>
                <div id="_sapn_title">${title}</div>
                <div class="sapn-divider"></div>
                <div id="_sapn_body">${rowsHTML}</div>
                <button id="_sapn_btn">${btnText}</button>
                ${waBtn}
            </div>
        </div>`;
    }

    function show({
        id,
        title     = 'إشعار هام',
        rows      = [],
        body      = '',
        icon      = '⚠',
        label     = 'SYSTEM NOTICE',
        btnText   = 'فهمت',
        whatsapp  = null,
        onDismiss = null,
    } = {}) {
        if (!id) { console.warn('[SAPNotify] `id` is required.'); return; }
        if (_isSeen(id)) return;
        if (document.getElementById('_sapn_overlay')) return;

        if (!rows.length && body) {
            rows = [{ icon: '📋', title: '', desc: body }];
        }

        _injectCSS();

        const overlay = document.createElement('div');
        overlay.id = '_sapn_overlay';
        overlay.innerHTML = _buildHTML({ icon, label, title, rows, btnText, whatsapp });
        document.body.appendChild(overlay);

        requestAnimationFrame(() =>
            requestAnimationFrame(() => overlay.classList.add('sapn-in'))
        );

        overlay.querySelector('#_sapn_btn').addEventListener('click', () => {
            _markSeen(id);
            overlay.classList.remove('sapn-in');
            overlay.classList.add('sapn-out');
            setTimeout(() => { overlay.remove(); onDismiss?.(); }, 360);
        }, { once: true });
    }

    function _devReset(id) {
        try { localStorage.removeItem(STORAGE_PREFIX + id); } catch { }
    }

    return { show, _devReset };
})();

export default SAPNotify;
export { SAPNotify };