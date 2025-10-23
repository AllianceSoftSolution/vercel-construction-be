"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinaryUploadMiddleware = void 0;
const cloudinary_1 = require("../utils/cloudinary");
const generateCustomFilename = (originalname) => {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = now.getFullYear();
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());
    const random = Math.random().toString(36).substring(2, 6);
    const ext = originalname.split(".").pop() || "jpg";
    return `diet-${day}-${month}-${year}-${hours}-${minutes}-${seconds}-${random}.${ext}`;
};
const cloudinaryUploadMiddleware = async (req, res, next) => {
    if (!req.files || typeof req.files !== "object") {
        return next();
    }
    const files = req.files;
    const cloudinaryFiles = {};
    try {
        for (const fieldName of Object.keys(files)) {
            const fileArray = files[fieldName];
            for (const file of fileArray) {
                const customFilename = generateCustomFilename(file.originalname);
                const url = await (0, cloudinary_1.uploadToCloudinary)(file.buffer, customFilename);
                if (!cloudinaryFiles[fieldName])
                    cloudinaryFiles[fieldName] = [];
                cloudinaryFiles[fieldName].push(url);
            }
        }
        req.cloudinaryFiles = cloudinaryFiles;
        next();
    }
    catch (err) {
        console.error("Cloudinary Upload Error:", err);
        res.status(500).json({ error: "Image upload failed" });
    }
};
exports.cloudinaryUploadMiddleware = cloudinaryUploadMiddleware;
//# sourceMappingURL=cloudinaryUpload.js.map