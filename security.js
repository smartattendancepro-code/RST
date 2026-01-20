import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const _0x9a2b = ['\x66\x61\x63\x75\x6C\x74\x79\x5F\x6D\x65\x6D\x62\x65\x72\x73', '\x73\x65\x63\x75\x72\x65\x5F\x61\x64\x6D\x69\x6E\x5F\x73\x65\x73\x73\x69\x6F\x6E\x5F\x74\x6F\x6B\x65\x6E\x5F\x76\x39\x39', '\x5F\x49\x4E\x54\x45\x52\x4E\x41\x4C\x5F\x55\x53\x45\x52\x5F\x52\x4F\x4C\x45', '\x64\x6F\x63\x74\x6F\x72', '\x64\x65\x61\x6E', '\x73\x74\x75\x64\x65\x6E\x74', '\x63\x6C\x65\x61\x72', '\x65\x72\x72\x6F\x72', '\x1F6A8\x20\x53\x45\x43\x55\x52\x49\x54\x59\x20\x42\x52\x45\x41\x43\x48\x21', '\x69\x6E\x6E\x65\x72\x48\x54\x4D\x4C', '\x67\x65\x74\x49\x74\x65\x6D', '\x72\x65\x6D\x6F\x76\x65'];
function _0x4d1f(_0x1a, _0x2b) { return _0x9a2b[_0x1a]; }

const _0xDEAD = "PGRpdiBzdHlsZT0icG9zaXRpb246Zml4ZWQ7dG9wOjA7bGVmdDowO3dpZHRoOjEwMCU7aGVpZ2h0OjEwMCU7YmFja2dyb3VuZC1jb2xvcjojMDAwO3otaW5kZXg6MjE0NzQ4MzY0NztkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2NvbG9yOnJlZDtmb250LWZhbWlseTptb25vc3BhY2U7dGV4dC1hbGlnbjpjZW50ZXI7Ij48aSBjbGFzcz0iZmEtc29saWQgZmEtYmFuIiBzdHlsZT0iZm9udC1zaXplOjEwMHB4O21hcmdpbi1ib3R0b206MjBweDsiPjwvaT48aDEgc3R5bGU9ImZvbnQtc2l6ZTo1MHB4O21hcmdpbjowOyI+U0VDVVJJVFkgTF9DS0RPV048L2gxPjxoMyBzdHlsZT0iY29xOndoaXRlOyI+VW5hdXRob3JpemVkIEFkbWluIEFjY2VzcyBEZXRlY3RlZDwvaDM+PHA+VGhlIHN5c3RlbSBoYXMgbG9nZ2VkIHRoaXMgaW5jaWRlbnQuPC9wPjxidXR0b24gb25jbGljaz0ibG9jYXRpb24ucmVsb2FkKCkiIHN0eWxlPSJwYWRkaW5nOjE1cHggNDBweDtmb250LXNpemU6MjBweDtjdXJzb3I6cG9pbnRlcjsiPkRJU01JU1M8L2J1dHRvbj48L2Rpdj4=";

window['\x69\x6E\x69\x74\x53\x65\x63\x75\x72\x69\x74\x79\x57\x61\x74\x63\x68\x64\x6F\x67'] = function (_0xUID, _0xDB) {
    const _0xREF = doc(_0xDB, _0x4d1f(0), _0xUID);

    const _0xNUKE = async () => {
        try {
            const _0xTKN = sessionStorage[_0x4d1f(10)](_0x4d1f(1));
            const _0xVAR = window[_0x4d1f(2)];
            const _0xSUS = (_0xTKN || _0xVAR === _0x4d1f(3) || _0xVAR === _0x4d1f(4));

            if (!_0xSUS) return;

            const _0xSNAP = await getDoc(_0xREF);

            if (_0xSUS && !_0xSNAP.exists()) {
                sessionStorage[_0x4d1f(6)]();
                localStorage[_0x4d1f(6)]();

                document.documentElement[_0x4d1f(9)] = decodeURIComponent(escape(atob(_0xDEAD)));

                console[_0x4d1f(7)](_0x4d1f(8));

                throw new Error("System Halted.");
            }
        } catch (e) { }
    };

    _0xNUKE();
    setInterval(_0xNUKE, 1000);
};