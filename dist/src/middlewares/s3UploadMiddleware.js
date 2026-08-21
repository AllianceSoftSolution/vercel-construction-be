"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.s3UploadMiddleware = void 0;
const multer_1 = __importDefault(require("multer"));
const s3Upload_1 = require("../utils/s3Upload");
const attachmentUrls_1 = require("../utils/attachmentUrls");
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: attachmentUrls_1.MAX_FILE_SIZE_BYTES },
});
const s3UploadMiddleware = (fields) => {
    const multerFields = upload.fields(fields);
    return async (req, res, next) => {
        multerFields(req, res, async (err) => {
            if (err)
                return next(err);
            const files = req.files;
            const uploadedFiles = {};
            try {
                for (const field of fields) {
                    const fieldName = field.name;
                    const fieldFiles = files?.[fieldName];
                    if (!fieldFiles || fieldFiles.length === 0)
                        continue;
                    if (field.maxCount === 1) {
                        const file = fieldFiles[0];
                        const url = await (0, s3Upload_1.uploadToS3)(file.buffer, file.originalname, file.mimetype, fieldName);
                        uploadedFiles[fieldName] = url;
                    }
                    else {
                        const urls = await Promise.all(fieldFiles.map((file) => (0, s3Upload_1.uploadToS3)(file.buffer, file.originalname, file.mimetype, fieldName)));
                        uploadedFiles[fieldName] = urls;
                    }
                }
                req.filesFromS3 = uploadedFiles;
                next();
            }
            catch (uploadErr) {
                console.error("S3 Upload Error:", uploadErr);
                res.status(500).json({ message: "Failed to upload files to S3." });
            }
        });
    };
};
exports.s3UploadMiddleware = s3UploadMiddleware;
//# sourceMappingURL=s3UploadMiddleware.js.map