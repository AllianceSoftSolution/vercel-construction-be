"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testOTPFunctionality = void 0;
const otpUtils_1 = require("./otpUtils");
const testOTPFunctionality = async () => {
    console.log("Testing OTP functionality...");
    const otp = (0, otpUtils_1.generateOTP)();
    console.log("Generated OTP:", otp);
    console.log("OTP format valid:", (0, otpUtils_1.validateOTPFormat)(otp));
    console.log("Invalid OTP format valid:", (0, otpUtils_1.validateOTPFormat)("12345"));
    const testEmail = "test@example.com";
    await (0, otpUtils_1.storeOTP)(testEmail, otp, 15);
    console.log("OTP stored in database");
    const validOTP = await (0, otpUtils_1.isOTPValid)(testEmail, otp);
    console.log("Valid OTP check:", validOTP);
    const invalidOTP = await (0, otpUtils_1.isOTPValid)(testEmail, "000000");
    console.log("Invalid OTP check:", invalidOTP);
    await (0, otpUtils_1.incrementOTPAttempts)(testEmail);
    console.log("Attempts incremented");
    await (0, otpUtils_1.removeOTP)(testEmail);
    console.log("OTP removed from database");
    await (0, otpUtils_1.storeOTP)(testEmail, otp, 15);
    await (0, otpUtils_1.markOTPAsUsed)(testEmail);
    const usedOTP = await (0, otpUtils_1.isOTPValid)(testEmail, otp);
    console.log("Used OTP check:", usedOTP);
    console.log("OTP functionality test completed.");
};
exports.testOTPFunctionality = testOTPFunctionality;
//# sourceMappingURL=testOtp.js.map