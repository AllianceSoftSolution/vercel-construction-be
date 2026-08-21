"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.presignUploads = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const attachmentUrls_1 = require("../utils/attachmentUrls");
const s3Presign_1 = require("../utils/s3Presign");
const MAX_FILES_PER_REQUEST = 50;
const ALLOWED_MIME_PREFIXES = [
    "image/",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "text/plain",
];
const isAllowedMime = (mimeType) => {
    if (!mimeType)
        return true;
    return ALLOWED_MIME_PREFIXES.some((prefix) => mimeType === prefix || mimeType.startsWith(prefix));
};
exports.presignUploads = (0, catchAsync_1.default)(async (req, res, next) => {
    const { folder, files } = req.body;
    if (!folder?.trim()) {
        return next(new appError_1.default("Upload folder is required", 400));
    }
    if (!Array.isArray(files) || files.length === 0) {
        return next(new appError_1.default("At least one file is required", 400));
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
        return next(new appError_1.default(`Maximum ${MAX_FILES_PER_REQUEST} files per request`, 400));
    }
    const uploads = [];
    for (const file of files) {
        const fileName = file.fileName?.trim() || "file";
        const mimeType = file.mimeType?.trim() || "application/octet-stream";
        const size = Number(file.size);
        if (!Number.isFinite(size) || size <= 0) {
            return next(new appError_1.default(`Invalid file size for ${fileName}`, 400));
        }
        if (size > attachmentUrls_1.MAX_FILE_SIZE_BYTES) {
            return next(new appError_1.default(`${fileName} exceeds the 150MB file size limit`, 413));
        }
        if (!isAllowedMime(mimeType)) {
            return next(new appError_1.default(`File type not allowed for ${fileName}`, 400));
        }
        const key = (0, s3Presign_1.buildS3ObjectKey)(folder, fileName);
        const url = await (0, s3Presign_1.createPresignedPutUrl)(key, mimeType);
        uploads.push({
            key,
            url,
            publicUrl: (0, s3Presign_1.getPublicS3Url)(key),
            fileName,
            mimeType,
        });
    }
    res.status(200).json({
        status: "success",
        data: {
            uploads,
            urls: (0, attachmentUrls_1.normalizeAttachmentUrls)(uploads.map((u) => u.publicUrl)),
        },
    });
});
//# sourceMappingURL=fileUpload.controller.js.map