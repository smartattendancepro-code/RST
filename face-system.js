
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.faceSystem = window.faceSystem || {};

let storedSessionData = null;
let storedUser = null;
let isModelsLoaded = false;

let stabilityCounter = 0;
const REQUIRED_STABILITY_FRAMES = 25;
let tempDescriptor = null;

const t = window.t || ((key, def) => def);

window.faceSystem.getFace = async function (uid) {
    try {
        const db = window.db;
        const faceRef = doc(db, "face_biometrics", uid);
        const docSnap = await getDoc(faceRef);

        if (docSnap.exists()) {
            return new Float32Array(docSnap.data().descriptor);
        } else {
            return null;
        }
    } catch (e) {
        console.error("❌ Get Face Error:", e);
        return null;
    }
};

window.faceSystem.handleJoinRequest = async function (user, targetDoctorUID, passwordInput) {
    storedUser = user;
    const btn = document.querySelector('#studentPassModal .btn-main');
    const originalText = btn ? btn.innerHTML : "";

    if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('checking_status', 'Checking Hall...')}`;
        btn.style.pointerEvents = 'none';
    }

    try {
        const db = window.db;
        const sessionRef = doc(db, "active_sessions", targetDoctorUID);
        const sessionSnap = await getDoc(sessionRef);

        if (!sessionSnap.exists()) throw new Error(t('session_not_found_err', "⛔ Session not found"));

        const sessionData = sessionSnap.data();

        if (!sessionData.isActive || !sessionData.isDoorOpen) throw new Error(t('toast_session_closed', "🔒 Session is closed."));

        if (sessionData.sessionPassword && sessionData.sessionPassword !== "" && passwordInput !== sessionData.sessionPassword) {
            throw new Error(t('toast_wrong_pass', "❌ Incorrect Password"));
        }

        storedSessionData = { uid: targetDoctorUID, info: sessionData };

        let isFaceIDRequired = true;
        if (sessionData.isQuickMode === true && sessionData.quickModeFlags && sessionData.quickModeFlags.disableFace === true) {
            isFaceIDRequired = false;
        }

        if (isFaceIDRequired) {
            const passModal = document.getElementById('studentPassModal');
            if (passModal) passModal.style.display = 'none';

            window.switchScreen('screenFaceCheck');
            await initFaceCamera();

        } else {
            await finalizeJoiningProcess();
        }

    } catch (e) {
        console.error("Join Flow Error:", e);
        window.showToast("⚠️ " + e.message, 4000, "#ef4444");
        if (btn) {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
    }
};

async function initFaceCamera() {
    const video = document.getElementById('video');
    const statusTxt = document.getElementById('statusTxt');

    stabilityCounter = 0;
    tempDescriptor = null;

    if (!isModelsLoaded) {
        if (statusTxt) statusTxt.innerText = t('loading_text', "Loading AI Models...");
        const MODEL_URL = 'https://smartattendancepro-code.github.io/RST/models';

        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
            isModelsLoaded = true;
        } catch (error) {
            alert(t('ai_load_error', "Failed to load system files (404)."));
            return;
        }
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        video.srcObject = stream;

        startSmartScanning(video);

    } catch (err) {
        alert(t('camera_error_title', "Camera Error") + ": " + err);
        window.goBackToWelcome();
    }
}

async function startSmartScanning(video) {
    const statusTxt = document.getElementById('statusTxt');
    const scanRegion = document.getElementById('scanRegion');
    const scanLine = document.getElementById('scanLine');

    if (statusTxt) statusTxt.innerText = t('checking_status', "Checking Status...");

    const registeredDescriptor = await window.faceSystem.getFace(storedUser.uid);
    const mode = registeredDescriptor ? 'LOGIN' : 'REGISTER';

    if (mode === 'REGISTER') {
        if (statusTxt) {
            statusTxt.innerText = "👋 " + t('welcome_face_reg', "Welcome! Please hold steady to register.");
            statusTxt.style.color = "#3b82f6";
        }
    } else {
        if (statusTxt) statusTxt.innerText = t('verifying_title', "Verifying Identity...");
    }

    const interval = setInterval(async () => {
        if (window.getComputedStyle(document.getElementById('screenFaceCheck')).display === 'none') {
            clearInterval(interval); return;
        }

        const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (detection) {
            const { x, y, width, height } = detection.detection.box;
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;

            const centerX = x + width / 2;
            const centerY = y + height / 2;

            const isCentered = (centerX > videoWidth * 0.3 && centerX < videoWidth * 0.7) &&
                (centerY > videoHeight * 0.25 && centerY < videoHeight * 0.75);

            const isCloseEnough = width > (videoWidth * 0.25);

            if (!isCentered) {
                statusTxt.innerText = "⚠️ " + t('center_face_hint', "Center your face");
                statusTxt.style.color = "#f59e0b";
                if (scanRegion) scanRegion.className = "scan-region error";
                stabilityCounter = 0;

            } else if (!isCloseEnough) {
                statusTxt.innerText = "🔍 " + t('move_closer_hint', "Move closer");
                statusTxt.style.color = "#f59e0b";
                if (scanRegion) scanRegion.className = "scan-region error";
                stabilityCounter = 0;

            } else {
                stabilityCounter++;

                if (scanRegion) scanRegion.className = "scan-region success";
                if (scanLine) scanLine.style.display = "block";

                const progress = Math.min((stabilityCounter / REQUIRED_STABILITY_FRAMES) * 100, 100);

                if (statusTxt) {
                    statusTxt.style.color = "#10b981";
                    const holdTxt = t('hold_steady_hint', "Hold Steady...");
                    const matchTxt = t('matching_hint', "Matching...");

                    statusTxt.innerText = mode === 'REGISTER'
                        ? `${holdTxt} ${Math.floor(progress)}%`
                        : matchTxt;
                }

                if (stabilityCounter >= REQUIRED_STABILITY_FRAMES) {
                    clearInterval(interval);
                    if (scanLine) scanLine.style.display = "none";

                    if (mode === 'REGISTER') {
                        await performRegistration(detection.descriptor);
                    } else {
                        await performLogin(detection.descriptor, registeredDescriptor);
                    }
                }
            }
        } else {
            stabilityCounter = 0;
            if (statusTxt) {
                statusTxt.innerText = t('look_at_cam_hint', "Look at the camera");
                statusTxt.style.color = "white";
            }
            if (scanRegion) scanRegion.className = "scan-region";
            if (scanLine) scanLine.style.display = "none";
        }
    }, 100);
}


async function performRegistration(descriptor) {
    const statusTxt = document.getElementById('statusTxt');
    if (statusTxt) {
        statusTxt.innerText = t('saving_face_data', "💾 Saving Face Data...");
        statusTxt.style.color = "#3b82f6";
    }

    try {
        const db = window.db;
        const descriptorArray = Array.from(descriptor);

        await setDoc(doc(db, "face_biometrics", storedUser.uid), {
            descriptor: descriptorArray,
            studentName: storedUser.displayName || "Unknown",
            studentEmail: storedUser.email,
            registeredAt: new Date().toISOString()
        });

        if (statusTxt) statusTxt.innerText = "✅ " + t('reg_success_msg', "Registration Successful!");

        const video = document.getElementById('video');
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        await finalizeJoiningProcess();

    } catch (e) {
        console.error(e);
        alert("❌ " + t('reg_failed_msg', "Registration Failed") + ": " + e.message);
        window.goBackToWelcome();
    }
}

async function performLogin(currentDescriptor, savedDescriptor) {
    const distance = faceapi.euclideanDistance(currentDescriptor, savedDescriptor);
    console.log("Distance:", distance);

    if (distance < 0.45) {
        const statusTxt = document.getElementById('statusTxt');
        if (statusTxt) statusTxt.innerText = "✅ " + t('verified_title', "Identity Verified!");

        const video = document.getElementById('video');
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        await finalizeJoiningProcess();
    } else {
        alert("❌ " + t('face_mismatch_msg', "Face Mismatch! Try Again."));
        window.goBackToWelcome();
    }
}


async function finalizeJoiningProcess() {
    window.showToast(t('registering_att_toast', "Registering Attendance..."), 2000, "#3b82f6");

    try {
        const gpsData = await window.getSilentLocationData();
        const deviceID = localStorage.getItem("unique_device_id_v3");
        const idToken = await storedUser.getIdToken();

        const response = await fetch(`${window.BACKEND_URL}/joinSessionSecure`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                studentUID: storedUser.uid,
                sessionDocID: storedSessionData.uid,
                gpsLat: gpsData.lat || 0,
                gpsLng: gpsData.lng || 0,
                deviceFingerprint: deviceID
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            window.playSuccess();
            window.showToast(`✅ ${result.message}`, 3000, "#10b981");

            sessionStorage.setItem('TARGET_DOCTOR_UID', storedSessionData.uid);
            sessionStorage.removeItem('TEMP_DR_UID');

            if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = storedSessionData.info.doctorName;
            if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = storedSessionData.info.allowedSubject;

            window.switchScreen('screenLiveSession');
            if (window.startLiveSnapshotListener) window.startLiveSnapshotListener();

        } else {
            throw new Error(result.error || t('access_denied_title', "Access Denied."));
        }

    } catch (error) {
        console.error("Finalize Error:", error);
        window.showToast("❌ " + error.message, 4000, "#ef4444");
        window.goBackToWelcome();
    }
}

console.log("👤 Face System Module Loaded Fully ✅");