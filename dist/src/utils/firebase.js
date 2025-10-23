"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendFirebaseNotification = sendFirebaseNotification;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
if (!firebase_admin_1.default.apps.length) {
    const serviceAccountPath = path_1.default.isAbsolute("../config/radc-a6ce0-firebase-adminsdk-fbsvc-c5f458f8f6.json")
        ? "../config/radc-a6ce0-firebase-adminsdk-fbsvc-c5f458f8f6.json"
        : path_1.default.join(process.cwd(), "src/config/radc-a6ce0-firebase-adminsdk-fbsvc-c5f458f8f6.json");
    firebase_admin_1.default.initializeApp({
        credential: firebase_admin_1.default.credential.cert(serviceAccountPath),
    });
}
async function sendFirebaseNotification({ tokens, title, body, data = {}, }) {
    if (!tokens || tokens.length === 0)
        return { success: false, error: "No tokens provided" };
    const message = {
        notification: { title, body },
        data,
        tokens,
    };
    try {
        const response = await firebase_admin_1.default.messaging().sendEachForMulticast(message);
        return { success: true, response };
    }
    catch (error) {
        return { success: false, error };
    }
}
//# sourceMappingURL=firebase.js.map