document.addEventListener('DOMContentLoaded', () => {
    RamadanManager.init();
});

const RamadanManager = {
    config: {
        start: new Date('2026-02-15T00:00:00'),
        end: new Date('2026-03-20T23:59:59')
    },

    init: function () {
        const now = new Date();
        if (now >= this.config.start && now <= this.config.end) {
            this.injectStyles();
            this.renderDecoration();
        }
    },

    injectStyles: function () {
        const style = document.createElement('style');
        style.innerHTML = `
            .ramadan-decor-layer {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 350px;
                z-index: 5;
                pointer-events: none;
                overflow: visible;
            }
            .lantern-swing {
                transform-origin: top center;
                animation: swing 3s ease-in-out infinite alternate;
            }
            .star-spin {
                transform-origin: center;
                animation: spin-glow 4s linear infinite;
            }
            @keyframes swing {
                0% { transform: rotate(5deg); }
                100% { transform: rotate(-5deg); }
            }
            @keyframes spin-glow {
                0% { transform: rotate(0deg) scale(1); filter: drop-shadow(0 0 2px #FFD700); }
                50% { transform: rotate(180deg) scale(1.1); filter: drop-shadow(0 0 8px #FFD700); }
                100% { transform: rotate(360deg) scale(1); filter: drop-shadow(0 0 2px #FFD700); }
            }
        `;
        document.head.appendChild(style);
    },

    renderDecoration: function () {
        const appCardBody = document.querySelector('.app-card .card-body');
        if (!appCardBody) return;

        const oldDecor = document.querySelector('.ramadan-decor-layer');
        if (oldDecor) oldDecor.remove();
        const oldStyle = document.getElementById('ramadan-style');
        if (oldStyle) oldStyle.remove();

        const style = document.createElement('style');
        style.id = 'ramadan-style';
        style.innerHTML = `
        .ramadan-decor-layer {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 120px; /* قللنا الارتفاع عشان نلم الدنيا لفوق */
            pointer-events: none;
            z-index: 10;
        }
        .swing { animation: swing 3s infinite ease-in-out alternate; transform-origin: top center; }
        .twinkle { animation: twinkle 2s infinite alternate; }
        @keyframes swing { from { transform: rotate(5deg); } to { transform: rotate(-5deg); } }
        @keyframes twinkle { 0% { opacity: 0.6; } 100% { opacity: 1; filter: drop-shadow(0 0 5px gold); } }
    `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.className = 'ramadan-decor-layer';

        container.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none">
        <defs>
            <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#FDB931" />
                <stop offset="100%" style="stop-color:#DAA520" />
            </linearGradient>
            <filter id="glow">
                <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>

        <!-- === الحبل الأيسر (مرفوع) === -->
        <!-- النهاية عند y=10 بدل y=60 -->
        <path d="M -10 5 Q 60 35 138 10" 
              stroke="#94a3b8" stroke-width="1.5" fill="none" />
        <!-- نقطة التثبيت -->
        <circle cx="138" cy="10" r="2.5" fill="#DAA520" />

        <!-- === فانوس (يسار) === -->
        <!-- متعلق من نقطة أعلى (y=20) -->
        <g class="swing" style="transform-origin: 65px 20px;">
            <line x1="65" y1="20" x2="65" y2="40" stroke="#DAA520" stroke-width="1" />
            
            <g transform="translate(50, 40) scale(0.55)">
                <circle cx="25" cy="0" r="4" stroke="#DAA520" stroke-width="2" fill="none"/>
                <path d="M15 4 L35 4 L42 15 L8 15 Z" fill="url(#goldGrad)" />
                <rect x="12" y="15" width="26" height="25" fill="#fff" fill-opacity="0.5" stroke="#DAA520"/>
                <circle cx="25" cy="28" r="4" fill="#FFA500" class="twinkle" filter="url(#glow)"/>
                <path d="M12 40 L38 40 L42 50 L8 50 Z" fill="url(#goldGrad)" />
            </g>
        </g>

        <!-- === الحبل الأيمن (مرفوع) === -->
        <!-- البداية عند y=10 بدل y=60 -->
        <path d="M 262 10 Q 340 35 410 5" 
              stroke="#94a3b8" stroke-width="1.5" fill="none" />
        <!-- نقطة التثبيت -->
        <circle cx="262" cy="10" r="2.5" fill="#DAA520" />

        <g class="swing" style="transform-origin: 335px 20px;">
            <line x1="335" y1="20" x2="335" y2="45" stroke="#DAA520" stroke-width="1" />
            
            <g transform="translate(320, 45) scale(0.6)">
                <!-- التعديل هنا: -->
                <!-- 1. نصف القطر الداخلي أصبح 25 (أكبر من 20) لعمل قوس داخلي أنحف -->
                <!-- 2. تم ضبط اتجاه القوس (Flags) لقص الشكل من الداخل -->
                <path d="M30 10 
                         A 20 20 0 1 0 30 50 
                         A 25 25 0 0 1 30 10 Z" 
                      fill="url(#goldGrad)" stroke="#B8860B" stroke-width="1" />
                      
                <!-- النجمة (تم تحريكها قليلاً لتتناسب مع تقويس الهلال الجديد) -->
                <path d="M42 22 L44 26 L49 26 L45 29 L46 34 L42 31 L38 34 L39 29 L35 26 L40 26 Z" 
                      fill="#DAA520" stroke="#B8860B" stroke-width="0.5" class="twinkle" />
            </g>
        </g>

    </svg>
    `;

        appCardBody.insertBefore(container, appCardBody.firstChild);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    RamadanManager.init();
});