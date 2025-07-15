import admin from "firebase-admin";
import path from "path";

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      path.join(
        __dirname,
        "../config/diet30-f2904-firebase-adminsdk-fbsvc-6e9db8ee5f.json"
      )
    ),
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
