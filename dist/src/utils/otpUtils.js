"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupOTPCleanup = exports.markOTPAsUsed = exports.removeOTP = exports.incrementOTPAttempts = exports.isOTPValid = exports.storeOTP = exports.generateOTP = exports.validateOTPFormat = exports.cleanupExpiredOTPs = void 0;
const prisma_1 = __importDefault(require("./prisma"));
const cleanupExpiredOTPs = async () => {
    try {
        await prisma_1.default.oTP.deleteMany({
            where: {
                OR: [{ expiresAt: { lt: new Date() } }, { isUsed: true }],
            },
        });
    }
    catch (error) {
        console.error("Error cleaning up expired OTPs:", error);
    }
};
exports.cleanupExpiredOTPs = cleanupExpiredOTPs;
const validateOTPFormat = (otp) => {
    return /^\d{6}$/.test(otp);
};
exports.validateOTPFormat = validateOTPFormat;
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};
exports.generateOTP = generateOTP;
const storeOTP = async (email, otp, expiryMinutes = 15) => {
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    await prisma_1.default.oTP.upsert({
        where: { email },
        update: {
            otp,
            attempts: 0,
            expiresAt,
            isUsed: false,
            createdAt: new Date(),
        },
        create: {
            email,
            otp,
            attempts: 0,
            expiresAt,
            isUsed: false,
        },
    });
};
exports.storeOTP = storeOTP;
const isOTPValid = async (email, otp) => {
    try {
        const otpRecord = await prisma_1.default.oTP.findUnique({
            where: { email },
        });
        if (!otpRecord) {
            return false;
        }
        if (new Date() > otpRecord.expiresAt) {
            await prisma_1.default.oTP.delete({ where: { email } });
            return false;
        }
        if (otpRecord.isUsed) {
            return false;
        }
        if (otpRecord.attempts >= 3) {
            await prisma_1.default.oTP.delete({ where: { email } });
            return false;
        }
        return otpRecord.otp === otp;
    }
    catch (error) {
        console.error("Error validating OTP:", error);
        return false;
    }
};
exports.isOTPValid = isOTPValid;
const incrementOTPAttempts = async (email) => {
    try {
        await prisma_1.default.oTP.update({
            where: { email },
            data: {
                attempts: {
                    increment: 1,
                },
            },
        });
    }
    catch (error) {
        console.error("Error incrementing OTP attempts:", error);
    }
};
exports.incrementOTPAttempts = incrementOTPAttempts;
const removeOTP = async (email) => {
    try {
        await prisma_1.default.oTP.delete({
            where: { email },
        });
    }
    catch (error) {
        console.error("Error removing OTP:", error);
    }
};
exports.removeOTP = removeOTP;
const markOTPAsUsed = async (email) => {
    try {
        await prisma_1.default.oTP.update({
            where: { email },
            data: { isUsed: true },
        });
    }
    catch (error) {
        console.error("Error marking OTP as used:", error);
    }
};
exports.markOTPAsUsed = markOTPAsUsed;
const setupOTPCleanup = () => {
    setInterval(async () => {
        await (0, exports.cleanupExpiredOTPs)();
    }, 5 * 60 * 1000);
};
exports.setupOTPCleanup = setupOTPCleanup;
//# sourceMappingURL=otpUtils.js.map