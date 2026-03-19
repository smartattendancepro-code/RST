import {
    doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;
const auth = window.auth;

window.verifyAdminRole = async function () {
    const user = auth.currentUser;
    if (!user) return false;

    try {
        const docRef = doc(db, "faculty_members", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.role === 'dean' || data.role === 'doctor') {
                console.log("✅ Identity Verified: " + data.role);
                return true;
            }
        }
    } catch (e) {
        console.error("Role Verification Failed:", e);
    }
    return false;
};