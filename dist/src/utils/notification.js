"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotificationToUser = sendNotificationToUser;
exports.sendNotificationToUserSafe = sendNotificationToUserSafe;
const firebase_1 = require("./firebase");
const prisma_1 = __importDefault(require("./prisma"));
async function sendNotificationToUser({ userId, title, body, data = {}, }) {
    const tokens = await prisma_1.default.deviceToken.findMany({
        where: { userId },
        select: { token: true },
    });
    const tokenList = tokens.map((t) => t.token);
    if (tokenList.length === 0) {
        return { success: false, error: "No device tokens for user" };
    }
    return (0, firebase_1.sendFirebaseNotification)({ tokens: tokenList, title, body, data });
}
async function sendNotificationToUserSafe({ userId, title, body, data = {}, }) {
    try {
        return await sendNotificationToUser({ userId, title, body, data });
    }
    catch (err) {
        console.error("Notification error for user", userId, err);
        return null;
    }
}
//# sourceMappingURL=notification.js.map