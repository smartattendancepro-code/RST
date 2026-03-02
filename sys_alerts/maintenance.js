(function () {
    const STORAGE_KEY = 'pubg_maintenance_alert_v1';
    
    // --- الإعدادات الزمنية (توقيت مصر القياسي UTC+2) ---
    // تم الضبط على 06:40 صباحاً للتجربة كما طلبت
    const targetDate = new Date('2026-03-02T06:40:00+02:00').getTime();

    // 1. القفل الذكي: لو الوقت الحالي عبر الساعة 6:40، الكود يقتل نفسه فوراً
    const nowCheck = new Date().getTime();
    if (nowCheck >= targetDate) {
        console.log("Maintenance ended. Overlay will not load.");
        return;
    }

    // 2. التحقق من الذاكرة: لو المستخدم أغلقها يدوياً
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
        return;
    }

    // --- بناء التنسيقات (CSS) ---
    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&display=swap');

        .pubg-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(5px);
            z-index: 2147483655; display: flex; align-items: center; justify-content: center;
            font-family: 'Cairo', sans-serif; animation: fadeIn 0.4s ease-out;
            pointer-events: all;
        }

        .pubg-card {
            background: linear-gradient(180deg, #181d26 0%, #0d1116 100%);
            width: 320px; border: 2px solid #bfa05f; border-radius: 4px;
            position: relative; box-shadow: 0 0 40px rgba(0, 0, 0, 0.9);
            text-align: center; padding: 5px; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        /* زوايا ببجي الذهبية */
        .pubg-card::before, .pubg-card::after {
            content: ''; position: absolute; width: 15px; height: 15px; border: 2px solid #ffcc00;
        }
        .pubg-card::before { top: -2px; left: -2px; border-right: none; border-bottom: none; }
        .pubg-card::after { bottom: -2px; right: -2px; border-left: none; border-top: none; }

        .pubg-header {
            background: linear-gradient(90deg, transparent, rgba(191,160,95,0.2), transparent);
            padding: 15px 0; border-bottom: 1px solid rgba(191,160,95,0.3); margin-bottom: 15px;
        }

        .pubg-title { color: #f0e6d2; font-size: 18px; font-weight: 900; margin: 0; letter-spacing: 1px; }

        .pubg-timer-container { display: flex; justify-content: center; gap: 12px; margin: 20px 0; }
        
        .timer-box {
            background: rgba(255, 204, 0, 0.05); border: 1px solid rgba(255, 204, 0, 0.3);
            min-width: 60px; padding: 8px 5px; border-radius: 4px;
            box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
        }

        .timer-num { color: #ffcc00; font-size: 24px; font-weight: 900; display: block; text-shadow: 0 0 10px rgba(255,204,0,0.5); }
        .timer-label { color: #7a7a7a; font-size: 10px; font-weight: 700; }

        .pubg-text { color: #bbbbbb; font-size: 14px; font-weight: 700; margin-bottom: 20px; line-height: 1.6; }

        .pubg-btn {
            background: linear-gradient(180deg, #ffcc00 0%, #d4a000 100%);
            border: 1px solid #ffe680; color: #1a1a1a; font-weight: 900;
            width: 85%; padding: 12px; cursor: pointer; margin-bottom: 15px;
            text-transform: uppercase; font-size: 15px;
            clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
            transition: 0.2s; box-shadow: 0 4px 0 #8a6800;
        }

        .pubg-btn:hover { filter: brightness(1.1); }
        .pubg-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 #8a6800; }

        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(style);

    // --- بناء الـ HTML ---
    const overlay = document.createElement('div');
    overlay.className = 'pubg-overlay';
    overlay.innerHTML = `
        <div class="pubg-card">
            <div class="pubg-header"><h3 class="pubg-title">SYSTEM UPDATE</h3></div>
            <div class="pubg-text">النظام خرج عن الخدمة موقتا  <br>سيعود العمل تلقائياً خلال:</div>
            <div class="pubg-timer-container">
                <div class="timer-box"><span id="p-hrs" class="timer-num">00</span><span class="timer-label">ساعة</span></div>
                <div class="timer-box"><span id="p-min" class="timer-num">00</span><span class="timer-label">دقيقة</span></div>
                <div class="timer-box"><span id="p-sec" class="timer-num">00</span><span class="timer-label">ثانية</span></div>
            </div>
            <button id="btnClosePubg" class="pubg-btn">إغلاق التنبيه</button>
        </div>
    `;
    document.body.appendChild(overlay);

    // --- محرك الوقت الذكي ---
    const timerInterval = setInterval(function() {
        const currentTime = new Date().getTime();
        const distance = targetDate - currentTime;

        // إذا انتهى الوقت أثناء مشاهدة المستخدم للنافذة
        if (distance <= 0) {
            clearInterval(timerInterval);
            overlay.style.transition = 'all 0.5s ease';
            overlay.style.opacity = '0';
            overlay.style.transform = 'scale(1.1)';
            setTimeout(() => { overlay.remove(); }, 500);
            return;
        }

        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById('p-hrs').innerText = hours.toString().padStart(2, '0');
        document.getElementById('p-min').innerText = minutes.toString().padStart(2, '0');
        document.getElementById('p-sec').innerText = seconds.toString().padStart(2, '0');
    }, 1000);

    // زر الإغلاق اليدوي
    document.getElementById('btnClosePubg').onclick = function () {
        localStorage.setItem(STORAGE_KEY, 'true');
        overlay.style.opacity = '0';
        setTimeout(() => { 
            overlay.remove(); 
            clearInterval(timerInterval); 
        }, 300);
    };
})();
