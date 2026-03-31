import { MASTER_HALLS, MASTER_SUBJECTS } from '../config.js';
import { SmartHistory } from '../SmartHistory.js';
import {
    doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs,
    onSnapshot, serverTimestamp, increment, writeBatch, orderBy, limit,
    arrayUnion, arrayRemove, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { i18n } from '../i18n.js';
import { applyVipTheme } from '../VipThemeManager.js';
import './timer/SessionTimer.js';
import './ui/SessionButtonUI.js';
import './ui/modals/SessionEndModal.js';
import './utils/TimeSync.js';
import './auth/AdminAuth.js';
