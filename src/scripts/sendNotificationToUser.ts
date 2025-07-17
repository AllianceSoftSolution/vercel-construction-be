import { sendNotificationToUser } from "../utils/notification";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const [, , userId, title, body] = process.argv;
  if (!userId || !title || !body) {
    console.error(
      "Usage: ts-node src/scripts/sendNotificationToUser.ts <userId> <title> <body>"
    );
    process.exit(1);
  }
  const result = await sendNotificationToUser({ userId, title, body });
  console.log("Notification result:", result);
  process.exit(0);
}

main();
