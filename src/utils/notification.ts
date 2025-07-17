import { PrismaClient } from "@prisma/client";
import { sendFirebaseNotification } from "./firebase";

const prisma = new PrismaClient();

export async function sendNotificationToUser({
  userId,
  title,
  body,
  data = {},
}: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  // Get all device tokens for the user
  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { token: true },
  });
  const tokenList = tokens.map((t) => t.token);
  if (tokenList.length === 0) {
    return { success: false, error: "No device tokens for user" };
  }
  // Send notification
  return sendFirebaseNotification({ tokens: tokenList, title, body, data });
}

// Utility: Safe notification sending (does not throw)
export async function sendNotificationToUserSafe({
  userId,
  title,
  body,
  data = {},
}: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  try {
    return await sendNotificationToUser({ userId, title, body, data });
  } catch (err) {
    console.error("Notification error for user", userId, err);
    return null;
  }
}
