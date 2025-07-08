// utils/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export const uploadToCloudinary = (
  fileBuffer: Buffer,
  fileName: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { public_id: fileName, folder: "uploads" },
      (error, result) => {
        if (error) reject(error);
        else if (result?.secure_url) resolve(result.secure_url);
      }
    );
    Readable.from(fileBuffer).pipe(uploadStream);
  });
};
