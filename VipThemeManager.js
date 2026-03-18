export const VIP_DOCTORS_LIST = [
    "oUCoiNiU5wNmSTbE92nI375FVhy1",
    "M106mqlI6yOYWYc85bQ2mQg87cQ2"
];

export function buildDoctorNameHTML(roomUID, doctorName) {
    const isVip = VIP_DOCTORS_LIST.includes(roomUID);

    if (!isVip) return doctorName || "Professor";

    return `
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
            <span style="
                display: inline-flex;
                align-items: center;
                gap: 4px;
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: #fff !important;
                -webkit-text-fill-color: #fff !important;
                font-size: 10px;
                font-weight: 800;
                padding: 3px 10px;
                border-radius: 20px;
                box-shadow: 0 2px 8px rgba(245,158,11,0.5);
                letter-spacing: 0.5px;
            ">
                <i class="fa-solid fa-crown" style="font-size:9px; color:#fff !important;"></i>
                DEAN
            </span>
            <span style="color:#d97706; font-weight:900; font-size:16px;">${doctorName || "Professor"}</span>
        </div>`;
}

export function applyVipTheme(currentRoomUID) {
    const themeId = 'vip-exclusive-theme';

    const existingStyle = document.getElementById(themeId);
    if (existingStyle) existingStyle.remove();

    if (!VIP_DOCTORS_LIST.includes(currentRoomUID)) return;

    const style = document.createElement('style');
    style.id = themeId;
    style.textContent = `
        #liveDocAvatar {
            background: linear-gradient(135deg, #f59e0b, #d97706) !important;
            border: 3px solid #fbbf24 !important;
            box-shadow: 0 0 15px rgba(245, 158, 11, 0.6), 0 0 30px rgba(245, 158, 11, 0.3) !important;
            color: #fff !important;
        }
        #liveDocAvatar i {
            color: #fff !important;
            font-size: 28px !important;
        }
    `;
    document.head.appendChild(style);
}