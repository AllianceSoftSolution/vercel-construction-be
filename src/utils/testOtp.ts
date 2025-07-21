// utils/testOtp.ts - Test utility for OTP functionality

import {
  generateOTP,
  validateOTPFormat,
  isOTPValid,
  incrementOTPAttempts,
  removeOTP,
  storeOTP,
  markOTPAsUsed,
} from "./otpUtils";

// Test OTP functionality
export const testOTPFunctionality = async () => {
  console.log("Testing OTP functionality...");

  // Test OTP generation
  const otp = generateOTP();
  console.log("Generated OTP:", otp);

  // Test OTP format validation
  console.log("OTP format valid:", validateOTPFormat(otp));
  console.log("Invalid OTP format valid:", validateOTPFormat("12345")); // Should be false

  // Test OTP storage and validation
  const testEmail = "test@example.com";

  // Store OTP in database
  await storeOTP(testEmail, otp, 15);
  console.log("OTP stored in database");

  // Test valid OTP
  const validOTP = await isOTPValid(testEmail, otp);
  console.log("Valid OTP check:", validOTP);

  // Test invalid OTP
  const invalidOTP = await isOTPValid(testEmail, "000000");
  console.log("Invalid OTP check:", invalidOTP);

  // Test increment attempts
  await incrementOTPAttempts(testEmail);
  console.log("Attempts incremented");

  // Test OTP removal
  await removeOTP(testEmail);
  console.log("OTP removed from database");

  // Test OTP storage and marking as used
  await storeOTP(testEmail, otp, 15);
  await markOTPAsUsed(testEmail);
  const usedOTP = await isOTPValid(testEmail, otp);
  console.log("Used OTP check:", usedOTP); // Should be false

  console.log("OTP functionality test completed.");
};
