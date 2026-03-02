(function () {
    const STORAGE_KEY = 'pubg_maintenance_alert_v1';
    
    // تحديد موعد الانتهاء: 2 مارس 2026 الساعة 10 صباحاً بتوقيت مصر (UTC+2)
    const targetDate = new Date('2026-03-02T10:00:00+02:00').getTime();

    function checkExpiry() {
        const now = new Date().getTime();
        return now >= targetDate;
    }

    // إذا انتهى الوقت أو أغلقها المستخدم سابقاً، لا تفعل شيئاً
    if (checkExpiry() || localStorage.getItem(STORAGE_KEY) === 'true') {
        return;
    }

    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&display=swap');

        .pubg-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(4px);
            z-index: 2147483655; display: flex; align-items: center; justify-content: center;
            font-family: 'Cairo', sans-serif; animation: fadeIn 0.3s ease;
        }

        .pubg-card {
            background: linear-gradient(180deg, #181d26 0%, #0d1116 100%);
            width: 320px; border: 2px solid #bfa05f; border-radius: 4px;
            position: relative; box-shadow: 0 0 30px rgba(191, 160, 95, 0.3);
            text-align: center; padding: 5px; animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .pubg-header {
            background: rgba(191, 160, 95, 0.1); padding: 12px 0;
            border-bottom: 1px solid rgba(191, 160, 95, 0.3); margin-bottom: 15px;
        }

        .pubg-title { color: #f0e6d2; font-size: 18px; font-weight: 900; margin: 0; text-transform: uppercase; }

        /* تنسيق العداد التنازلي */
        .pubg-timer-container {
            display: flex; justify-content: center; gap: 10px; margin: 15px 0;
        }
        .timer-box {
            background: rgba(255, 204, 0, 0.1); border: 1px solid #ffcc00;
            min-width: 50px; padding: 5px; border-radius: 4px;
        }
        .timer-num { color: #ffcc00; font-size: 20px; font-weight: 900; display: block; }
        .timer-label { color: #a3a3a3; font-size: 10px; text-transform: uppercase; }

        .pubg-text { color: #a3a3a3; font-size: 14px; font-weight: 700; margin-bottom: 20px; padding: 0 10px; }
        
        .pubg-btn {
            background: linear-gradient(180deg, #ffcc00 0%, #d4a000 100%);
            border: 1px solid #ffe680; color: #1a1a1a; font-weight: 900;
            width: 90%; padding: 10px; cursor: pointer; margin-bottom: 15px;
            clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
            transition: 0.2s; box-shadow: 0 4px 0 #8a6800;
        }
        .pubg-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 #8a6800; }

        @keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'pubg-overlay';
    overlay.innerHTML = `
        <div class="pubg-card">
            <div class="pubg-header"><h3 class="pubg-title">MAINTENANCE</h3></div>
            <div class="pubg-text">النظام خرج عن الخدمة ، سيعود للعمل خلال:</div>
            
            <div class="pubg-timer-container">
                <div class="timer-box"><span id="p-hrs" class="timer-num">00</span><span class="timer-label">ساعة</span></div>
                <div class="timer-box"><span id="p-min" class="timer-num">00</span><span class="timer-label">دقيقة</span></div>
                <div class="timer-box"><span id="p-sec" class="timer-num">00</span><span class="timer-label">ثانية</span></div>
            </div>

            <button id="btnClosePubg" class="pubg-btn">إغلاق التنبيه</button>
        </div>
    `;
    document.body.appendChild(overlay);

    // وظيفة تحديث العداد
    const timerInterval = setInterval(function() {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            clearInterval(timerInterval);
            overlay.remove(); // تختفي تلقائياً عند انتهاء الوقت
            return;
        }

        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById('p-hrs').innerText = hours.toString().padStart(2, '0');
        document.getElementById('p-min').innerText = minutes.toString().padStart(2, '0');
        document.getElementById('p-sec').innerText = seconds.toString().padStart(2, '0');
    }, 1000);

    document.getElementById('btnClosePubg').onclick = function () {
        localStorage.setItem(STORAGE_KEY, 'true');
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.remove(); clearInterval(timerInterval); }, 200);
    };
})();

