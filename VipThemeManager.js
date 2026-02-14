
const VIP_DOCTORS_LIST = [
    "oUCoiNiU5wNmSTbE92nI375FVhy1",
    "Xy9zkL22mPqA55v1B2cD"
];

export function applyVipTheme(currentRoomUID) {
    const themeId = 'vip-exclusive-theme';
    const bodyClass = 'vip-mode-active';

    const existingStyle = document.getElementById(themeId);
    if (existingStyle) existingStyle.remove();
    document.body.classList.remove(bodyClass);

    if (!VIP_DOCTORS_LIST.includes(currentRoomUID)) return;

    document.body.classList.add(bodyClass);

    const style = document.createElement('style');
    style.id = themeId;
    style.textContent = `

        body.vip-mode-active #screenLiveSession, 
        body.vip-mode-active main {
            background: linear-gradient(135deg, #fff0f3 0%, #ffe4e6 50%, #fce7f3 100%) !important;
            background-attachment: fixed !important;
        }

        body.vip-mode-active #screenLiveSession::before {
            content: '🌸'; position: fixed; top: 10%; left: 5%; font-size: 40px; opacity: 0.3; z-index: 0;
        }
        body.vip-mode-active #screenLiveSession::after {
            content: '🌺'; position: fixed; bottom: 15%; right: 5%; font-size: 50px; opacity: 0.2; z-index: 0;
        }

        body.vip-mode-active .live-header-card,
        body.vip-mode-active div[style*="background: white"],
        body.vip-mode-active div[style*="background-color: rgb(255, 255, 255)"] {
            background: linear-gradient(145deg, #ffffff 0%, #fff5f7 100%) !important;
            border: 2px solid #fbcfe8 !important;
            box-shadow: 0 20px 40px rgba(219, 39, 119, 0.1) !important;
            border-radius: 30px !important;
        }

        body.vip-mode-active .grid > div:nth-child(1) {
            background: linear-gradient(135deg, #ffffff 0%, #fff1f2 100%) !important;
        }
        body.vip-mode-active .grid > div:nth-child(2) {
            background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%) !important; /* لمسة سماوية */
        }
        body.vip-mode-active .grid > div:nth-child(3) {
            background: linear-gradient(135deg, #ffffff 0%, #faf5ff 100%) !important; /* لمسة بنفسجية */
        }
        body.vip-mode-active .grid > div:nth-child(4) {
            background: linear-gradient(135deg, #ffffff 0%, #fff7ed 100%) !important; /* لمسة مشمشية */
        }

        body.vip-mode-active button[style*="background-color: rgb(220, 38, 38)"],
        body.vip-mode-active .bg-red-600 {
            background: linear-gradient(135deg, #f43f5e, #be185d) !important;
            box-shadow: 0 8px 20px rgba(225, 29, 72, 0.4) !important;
        }
        body.vip-mode-active button[style*="background-color: rgb(5, 150, 105)"],
        body.vip-mode-active .bg-emerald-600 {
            background: linear-gradient(135deg, #10b981, #047857) !important;
            box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4) !important;
        }
        body.vip-mode-active button i, 
        body.vip-mode-active button svg {
            color: #ffffff !important;
            fill: #ffffff !important;
            font-size: 24px !important;
            opacity: 1 !important;
        }

        body.vip-mode-active #liveDocName {
            background: linear-gradient(to right, #9d174d, #db2777, #9d174d) !important;
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            font-weight: 900 !important;
            font-size: 28px !important;
        }

        body.vip-mode-active input {
            background: white !important;
            border: 2px solid #fbcfe8 !important;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.02) !important;
        }
            #liveDocName {
            position: relative !important;
        }

        #liveDocName::after {
            content: '🌸' !important; 
            position: absolute !important;
            top: -45px;      
            right: -30px;   
            font-size: 38px !important;
            z-index: 9999 !important;
            display: block !important;
            animation: flowerFloat 4s infinite ease-in-out !important;
            filter: drop-shadow(0 4px 8px rgba(219, 39, 119, 0.3));
        }

        @keyframes flowerFloat {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-10px) rotate(10deg); }
        }
    `;
    document.head.appendChild(style);

}

