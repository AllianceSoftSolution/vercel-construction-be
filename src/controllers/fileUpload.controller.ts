import { Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import {
  MAX_FILE_SIZE_BYTES,
  normalizeAttachmentUrls,
} from "../utils/attachmentUrls";
import {
  buildS3ObjectKey,
  createPresignedPutUrl,
  getPublicS3Url,
} from "../utils/s3Presign";

const MAX_FILES_PER_REQUEST = 50;

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "text/plain",
];

const isAllowedMime = (mimeType: string) => {
  if (!mimeType) return true;
  return ALLOWED_MIME_PREFIXES.some(
    (prefix) => mimeType === prefix || mimeType.startsWith(prefix)
  );
};

type PresignFileInput = {
  fileName?: string;
  mimeType?: string;
  size?: number;
};

export const presignUploads = catchAsync(
  async (req: Request, res: Response, next) => {
    const { folder, files } = req.body as {
      folder?: string;
      files?: PresignFileInput[];
    };

    if (!folder?.trim()) {
      return next(new AppError("Upload folder is required", 400));
    }
    if (!Array.isArray(files) || files.length === 0) {
      return next(new AppError("At least one file is required", 400));
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return next(
        new AppError(`Maximum ${MAX_FILES_PER_REQUEST} files per request`, 400)
      );
    }

    const uploads: Array<{
      key: string;
      url: string;
      publicUrl: string;
      fileName: string;
      mimeType: string;
    }> = [];
    for (const file of files) {
      const fileName = file.fileName?.trim() || "file";
      const mimeType = file.mimeType?.trim() || "application/octet-stream";
      const size = Number(file.size);

      if (!Number.isFinite(size) || size <= 0) {
        return next(new AppError(`Invalid file size for ${fileName}`, 400));
      }
      if (size > MAX_FILE_SIZE_BYTES) {
        return next(
          new AppError(
            `${fileName} exceeds the 150MB file size limit`,
            413
          )
        );
      }
      if (!isAllowedMime(mimeType)) {
        return next(
          new AppError(`File type not allowed for ${fileName}`, 400)
        );
      }

      const key = buildS3ObjectKey(folder, fileName);
      const url = await createPresignedPutUrl(key, mimeType);
      uploads.push({
        key,
        url,
        publicUrl: getPublicS3Url(key),
        fileName,
        mimeType,
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        uploads,
        urls: normalizeAttachmentUrls(uploads.map((u) => u.publicUrl)),
      },
    });
  }
);
