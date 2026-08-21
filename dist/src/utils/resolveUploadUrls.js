"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveUploadUrls = void 0;
const attachmentUrls_1 = require("./attachmentUrls");
const resolveUploadUrls = (req, { bodyKey, multipartKey }) => {
    let fromBody = req.body?.[bodyKey];
    if (typeof fromBody === "string" && fromBody.trim()) {
        try {
            fromBody = JSON.parse(fromBody);
        }
        catch {
            fromBody = [fromBody];
        }
    }
    const bodyUrls = (0, attachmentUrls_1.normalizeAttachmentUrls)(fromBody);
    if (bodyUrls.length > 0)
        return bodyUrls;
    const filesFromS3 = req.filesFromS3?.[multipartKey];
    return (0, attachmentUrls_1.normalizeAttachmentUrls)(filesFromS3);
};
exports.resolveUploadUrls = resolveUploadUrls;
//# sourceMappingURL=resolveUploadUrls.js.map