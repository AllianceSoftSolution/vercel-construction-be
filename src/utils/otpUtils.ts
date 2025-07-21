// utils/otpUtils.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Clean up expired OTPs from the database
export const cleanupExpiredOTPs = async () => {
  try {
    await prisma.oTP.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { isUsed: true }],
      },
    });
  } catch (error) {
    console.error("Error cleaning up expired OTPs:", error);
  }
};

// Validate OTP format (6 digits)
export const validateOTPFormat = (otp: string): boolean => {
  return /^\d{6}$/.test(otp);
};

// Generate a secure OTP
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP in database
export const storeOTP = async (
  email: string,
  otp: string,
  expiryMinutes: number = 15
): Promise<void> => {
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  await prisma.oTP.upsert({
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

// Check if OTP exists and is valid
export const isOTPValid = async (
  email: string,
  otp: string
): Promise<boolean> => {
  try {
    const otpRecord = await prisma.oTP.findUnique({
      where: { email },
    });

    if (!otpRecord) {
      return false;
    }

    // Check if expired
    if (new Date() > otpRecord.expiresAt) {
      await prisma.oTP.delete({ where: { email } });
      return false;
    }

    // Check if already used
    if (otpRecord.isUsed) {
      return false;
    }

    // Check if too many attempts
    if (otpRecord.attempts >= 3) {
      await prisma.oTP.delete({ where: { email } });
      return false;
    }

    return otpRecord.otp === otp;
  } catch (error) {
    console.error("Error validating OTP:", error);
    return false;
  }
};

// Increment OTP attempts
export const incrementOTPAttempts = async (email: string): Promise<void> => {
  try {
    await prisma.oTP.update({
      where: { email },
      data: {
        attempts: {
          increment: 1,
        },
      },
    });
  } catch (error) {
    console.error("Error incrementing OTP attempts:", error);
  }
};

// Remove OTP from database (after successful use or expiry)
export const removeOTP = async (email: string): Promise<void> => {
  try {
    await prisma.oTP.delete({
      where: { email },
    });
  } catch (error) {
    console.error("Error removing OTP:", error);
  }
};

// Mark OTP as used
export const markOTPAsUsed = async (email: string): Promise<void> => {
  try {
    await prisma.oTP.update({
      where: { email },
      data: { isUsed: true },
    });
  } catch (error) {
    console.error("Error marking OTP as used:", error);
  }
};

// Set up periodic cleanup of expired OTPs
export const setupOTPCleanup = () => {
  // Clean up expired OTPs every 5 minutes
  setInterval(async () => {
    await cleanupExpiredOTPs();
  }, 5 * 60 * 1000);
};
