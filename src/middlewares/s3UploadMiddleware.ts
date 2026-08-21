// src/middleware/uploadMiddleware.ts
import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { uploadToS3 } from "../utils/s3Upload";
import { MAX_FILE_SIZE_BYTES } from "../utils/attachmentUrls";

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

export const s3UploadMiddleware = (fields: { name: string; maxCount: number }[]) => {
    const multerFields = upload.fields(fields);

    return async (req: Request, res: Response, next: NextFunction) => {
        multerFields(req, res, async (err: any) => {
            if (err) return next(err);

            const files = req.files as { [fieldname: string]: Express.Multer.File[] };

            const uploadedFiles: Record<string, string | string[]> = {};

            try {
                for (const field of fields) {
                    const fieldName = field.name;
                    const fieldFiles = files?.[fieldName];

                    if (!fieldFiles || fieldFiles.length === 0) continue;

                    if (field.maxCount === 1) {
                        const file = fieldFiles[0];
                        const url = await uploadToS3(file.buffer, file.originalname, file.mimetype, fieldName);
                        uploadedFiles[fieldName] = url;
                    } else {
                        const urls = await Promise.all(
                            fieldFiles.map((file) =>
                                uploadToS3(file.buffer, file.originalname, file.mimetype, fieldName)
                            )
                        );
                        uploadedFiles[fieldName] = urls;
                    }
                }

                // Attach to request object
                (req as any).filesFromS3 = uploadedFiles;
                next();
            } catch (uploadErr) {
                console.error("S3 Upload Error:", uploadErr);
                res.status(500).json({ message: "Failed to upload files to S3." });
            }
        });
    };
};
