import { Request, Response, NextFunction } from "express";
import { uploadToCloudinary } from "../utils/cloudinary";

interface CloudinaryUploadedFiles {
  [fieldname: string]: string[];
}

export interface CustomRequest extends Request {
  cloudinaryFiles?: CloudinaryUploadedFiles;
}

// Helper to generate formatted filename
const generateCustomFilename = (originalname: string): string => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");

  const day = pad(now.getDate());
  const month = pad(now.getMonth() + 1);
  const year = now.getFullYear();
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  const random = Math.random().toString(36).substring(2, 6); // 4-char alphanumeric

  const ext = originalname.split(".").pop() || "jpg"; // fallback ext

  return `diet-${day}-${month}-${year}-${hours}-${minutes}-${seconds}-${random}.${ext}`;
};

export const cloudinaryUploadMiddleware = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.files || typeof req.files !== "object") {
    return next();
  }

  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const cloudinaryFiles: CloudinaryUploadedFiles = {};

  try {
    for (const fieldName of Object.keys(files)) {
      const fileArray = files[fieldName];

      for (const file of fileArray) {
        const customFilename = generateCustomFilename(file.originalname);
        const url = await uploadToCloudinary(file.buffer, customFilename);
        if (!cloudinaryFiles[fieldName]) cloudinaryFiles[fieldName] = [];
        cloudinaryFiles[fieldName].push(url);
      }
    }

    req.cloudinaryFiles = cloudinaryFiles;
    next();
  } catch (err) {
    console.error("Cloudinary Upload Error:", err);
    res.status(500).json({ error: "Image upload failed" });
  }
};
