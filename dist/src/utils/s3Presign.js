"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPresignedPutUrl = exports.buildS3ObjectKey = exports.getPublicS3Url = void 0;
const aws_sdk_1 = __importDefault(require("aws-sdk"));
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const s3 = new aws_sdk_1.default.S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
const getPublicS3Url = (key) => {
    const bucket = process.env.AWS_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};
exports.getPublicS3Url = getPublicS3Url;
const buildS3ObjectKey = (folder, fileName) => {
    const ext = path_1.default.extname(fileName || "") || "";
    return `${folder}/${(0, uuid_1.v4)()}${ext}`;
};
exports.buildS3ObjectKey = buildS3ObjectKey;
const createPresignedPutUrl = async (key, mimeType, expiresSeconds = 900) => {
    return s3.getSignedUrlPromise("putObject", {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        ContentType: mimeType || "application/octet-stream",
        Expires: expiresSeconds,
    });
};
exports.createPresignedPutUrl = createPresignedPutUrl;
//# sourceMappingURL=s3Presign.js.map