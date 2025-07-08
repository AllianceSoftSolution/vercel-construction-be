// middlewares/upload.ts
import multer from "multer";

// Store files in memory
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({ storage });
