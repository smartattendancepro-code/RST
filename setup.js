import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
    onSnapshot, query, where, orderBy, limit, writeBatch, serverTimestamp,
    Timestamp, arrayUnion, arrayRemove, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { i18n, t, changeLanguage, toggleSystemLanguage } from './i18n.js';

console.log = function () { };
console.warn = function () { };

const BACKEND_URL = "https://nursing-backend-eta.vercel.app";
window.BACKEND_URL = BACKEND_URL;

const firebaseConfig = {
    apiKey: "AIzaSyBQjD4FZKkhXQIL5FlyBs_VaEzW2GBBtGs",
    authDomain: "attendance-system-pro-dbdf1.firebaseapp.com",
    projectId: "attendance-system-pro-dbdf1",
    storageBucket: "attendance-system-pro-dbdf1.firebasestorage.app",
    messagingSenderId: "1094544109334",
    appId: "1:1094544109334:web:a7395159d617b3e6e82a37"
};

const app = initializeApp(firebaseConfig);

const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

const auth = getAuth(app);

window.db = db;
window.auth = auth;
window.changeLanguage = changeLanguage; // بنحتاجها كتير

console.log("🚀 Step 1 Complete: Firebase Config Loaded");

window.getUniqueDeviceId = function () {
    let storedId = localStorage.getItem("unique_device_id_v3");
    if (storedId) return storedId;

    const fingerprintData = [
        navigator.platform,
        navigator.hardwareConcurrency || 'x',
        navigator.deviceMemory || 'x',
        screen.height,
        screen.width,
        screen.colorDepth,
        Intl.DateTimeFormat().resolvedOptions().timeZone
    ].join('-');

    let hash = 0;
    for (let i = 0; i < fingerprintData.length; i++) {
        const char = fingerprintData.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const deviceId = 'DEV-FP-' + Math.abs(hash).toString(16).toUpperCase();
    localStorage.setItem("unique_device_id_v3", deviceId);
    console.log("Device Fingerprint Generated:", deviceId);
    return deviceId;
};

window.isProcessingClick = false;
window.safeClick = function (element, callback) {
    if (window.isProcessingClick) return;

    if (element && (element.disabled || element.classList.contains('disabled') || element.classList.contains('locked'))) {
        return;
    }

    window.isProcessingClick = true;
    if (element) {
        element.style.pointerEvents = 'none';
        element.style.opacity = '0.7';
    }

    if (typeof callback === 'function') {
        try {
            callback();
        } catch (e) {
            console.error("Error in button action:", e);
        }
    }

    setTimeout(() => {
        window.isProcessingClick = false;
        if (element) {
            element.style.pointerEvents = 'auto';
            element.style.opacity = '1';
        }
    }, 600);
};

window.showError = function (msg, isPermanent = false) {
    console.error("System Error:", msg);
    const errorMsgEl = document.getElementById('errorMsg');
    const retryBtn = document.getElementById('retryBtn');
    const errorContainer = document.getElementById('screenError');

    if (errorMsgEl) errorMsgEl.innerHTML = msg;
    if (retryBtn) {
        retryBtn.style.display = isPermanent ? 'none' : 'inline-block';
        retryBtn.onclick = () => location.reload();
    }

    if (errorContainer) {
        if (document.getElementById('step1_search')) document.getElementById('step1_search').style.display = 'none';
        if (document.getElementById('step2_auth')) document.getElementById('step2_auth').style.display = 'none';
        errorContainer.style.display = 'block';
    } else {
        alert("⚠️ " + msg);
    }
};

window.performLogout = async function () {
    try {
        const deviceId = localStorage.getItem("unique_device_id_v3");
        await signOut(window.auth); 
        sessionStorage.clear();
        localStorage.clear();
        if (deviceId) {
            localStorage.setItem("unique_device_id_v3", deviceId);
        }
        location.reload();
    } catch (error) {
        console.error("Logout Error:", error);
        location.reload();
    }
};

window.showToast = function (message, duration = 3000, bgColor = '#334155') {
    const toast = document.getElementById('toastNotification');
    if (toast) {
        toast.style.backgroundColor = bgColor;
        toast.innerText = message;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, duration);
    } else {
        console.log("Toast:", message);
    }
};

window.switchScreen = function (screenId) {
    const currentActive = document.querySelector('.section.active');
    if (currentActive && currentActive.id === screenId) return;

    window.scrollTo({ top: 0, behavior: 'auto' });

    const sections = document.querySelectorAll('.section');
    sections.forEach(sec => {
        sec.style.display = 'none';
        sec.classList.remove('active');
    });

    const target = document.getElementById(screenId);
    if (target) {
        target.style.display = 'flex';
        target.style.flexDirection = 'column';
        setTimeout(() => target.classList.add('active'), 10);
    }

    const infoBtn = document.getElementById('infoBtn');
    if (infoBtn) {
        if (screenId === 'screenWelcome') {
            infoBtn.style.display = 'flex';
        } else {
            infoBtn.style.display = 'none';
        }
    }
};

