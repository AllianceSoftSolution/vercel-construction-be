import admin from "firebase-admin";
import path from "path";

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  // Use absolute path for Docker compatibility
  const serviceAccountPath = path.isAbsolute(
    "../config/radc-a6ce0-firebase-adminsdk-fbsvc-c5f458f8f6.json"
  )
    ? "../config/radc-a6ce0-firebase-adminsdk-fbsvc-c5f458f8f6.json"
    : path.join(
        process.cwd(),
        "src/config/radc-a6ce0-firebase-adminsdk-fbsvc-c5f458f8f6.json"
      );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
}

export async function sendFirebaseNotification({
  tokens,
  title,
  body,
  data = {},
}: {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  if (!tokens || tokens.length === 0)
    return { success: false, error: "No tokens provided" };
  const message = {
    notification: { title, body },
    data,
    tokens,
  };
  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    return { success: true, response };
  } catch (error) {
    return { success: false, error };
  }
}
