"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const notification_1 = require("../utils/notification");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function main() {
    const [, , userId, title, body] = process.argv;
    if (!userId || !title || !body) {
        console.error("Usage: ts-node src/scripts/sendNotificationToUser.ts <userId> <title> <body>");
        process.exit(1);
    }
    const result = await (0, notification_1.sendNotificationToUser)({ userId, title, body });
    console.log("Notification result:", result);
    process.exit(0);
}
main();
//# sourceMappingURL=sendNotificationToUser.js.map