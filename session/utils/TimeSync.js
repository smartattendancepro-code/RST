window.globalTimeOffset = 0;

async function syncServerTime() {
    try {
        const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });

        const serverDateStr = response.headers.get('Date');
        if (!serverDateStr) return;

        const serverTime = new Date(serverDateStr).getTime();
        const localTime = Date.now();

        window.globalTimeOffset = serverTime - localTime;

        console.log("⏱️ Time Sync Offset:", window.globalTimeOffset, "ms");
    } catch (e) {
        console.warn("⚠️ Time Sync Failed, falling back to local time.", e);
    }
}

syncServerTime();