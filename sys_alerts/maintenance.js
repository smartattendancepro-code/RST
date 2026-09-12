(function () {
    const STORAGE_KEY = 'pubg_maintenance_alert_v1';

    if (localStorage.getItem(STORAGE_KEY) === 'true') {
        return; 
    }

    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&display=swap');

        .pubg-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(3px);
            z-index: 2147483655;
            display: flex; align-items: center; justify-content: center;
            font-family: 'Cairo', sans-serif;
            animation: fadeIn 0.3s ease;
        }

        .pubg-card {
            background: linear-gradient(180deg, #181d26 0%, #0d1116 100%);
            width: 300px;
            border: 2px solid #bfa05f; /* ذهبي باهت */
            border-radius: 4px;
            position: relative;
            box-shadow: 0 0 20px rgba(191, 160, 95, 0.2), 0 10px 30px rgba(0,0,0,0.8);
            overflow: hidden;
            text-align: center;
            padding: 2px;
            transform: scale(0.9);
            animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        /* زوايا الإطار الجمالية */
        .pubg-card::before, .pubg-card::after {
            content: ''; position: absolute; width: 10px; height: 10px;
            border: 2px solid #ffcc00; transition: 0.3s;
        }
        .pubg-card::before { top: 0; left: 0; border-right: none; border-bottom: none; }
        .pubg-card::after { bottom: 0; right: 0; border-left: none; border-top: none; }

        .pubg-header {
            background: linear-gradient(90deg, rgba(191,160,95,0) 0%, rgba(191,160,95,0.2) 50%, rgba(191,160,95,0) 100%);
            padding: 10px 0;
            margin-bottom: 15px;
            border-bottom: 1px solid rgba(191,160,95,0.3);
        }

        .pubg-title {
            color: #f0e6d2;
            font-size: 16px;
            font-weight: 900;
            text-transform: uppercase;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
            margin: 0;
        }

        .pubg-content {
            padding: 0 15px 20px 15px;
        }

        .pubg-icon-warn {
            color: #ffcc00;
            font-size: 32px;
            margin-bottom: 10px;
            filter: drop-shadow(0 0 5px rgba(255, 204, 0, 0.5));
        }

        .pubg-text {
            color: #a3a3a3;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.5;
            margin-bottom: 15px;
        }

        .pubg-highlight {
            color: #ffcc00;
            font-size: 15px;
            display: block;
            margin-top: 5px;
            background: rgba(255, 204, 0, 0.1);
            padding: 5px;
            border-radius: 4px;
            border: 1px dashed rgba(255, 204, 0, 0.3);
        }

        .pubg-btn {
            background: linear-gradient(180deg, #ffcc00 0%, #d4a000 100%);
            border: 1px solid #ffe680;
            color: #1a1a1a;
            font-weight: 900;
            font-size: 14px;
            padding: 8px 0;
            width: 100%;
            cursor: pointer;
            text-transform: uppercase;
            clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
            transition: all 0.2s;
            box-shadow: 0 4px 0 #8a6800;
            margin-top: 5px;
        }

        .pubg-btn:active {
            transform: translateY(2px);
            box-shadow: 0 2px 0 #8a6800;
        }

        @keyframes popIn { to { transform: scale(1); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'pubg-overlay';

    overlay.innerHTML = `
        <div class="pubg-card">
            <div class="pubg-header">
                <h3 class="pubg-title">SYSTEM NOTICE</h3>
            </div>
            
            <div class="pubg-content">
                <i class="fa-solid fa-triangle-exclamation pubg-icon-warn fa-beat" style="--fa-animation-duration: 2s;"></i>
                
                <div class="pubg-text">
                    النظام خرج عن الخدمة مؤقتاً
                    <span class="pubg-highlight">
                        سيعود الساعة 10:00 صباحاً
                    </span>
                </div>

                <button id="btnClosePubg" class="pubg-btn">
                    إغـــلاق
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('btnClosePubg').onclick = function () {
        localStorage.setItem(STORAGE_KEY, 'true');

        overlay.style.transition = 'opacity 0.2s ease';
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
        }, 200);
    };

})();