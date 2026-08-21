"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapRecordAttachmentFields = exports.requireAttachmentUrls = exports.attachmentUrlsToJson = exports.primaryAttachmentUrl = exports.normalizeAttachmentUrls = exports.MAX_FILE_SIZE_BYTES = void 0;
const client_1 = require("@prisma/client");
const appError_1 = __importDefault(require("./appError"));
exports.MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;
const normalizeAttachmentUrls = (input) => {
    if (input == null)
        return [];
    if (typeof input === "string") {
        const trimmed = input.trim();
        if (!trimmed)
            return [];
        if (trimmed.startsWith("[")) {
            try {
                return (0, exports.normalizeAttachmentUrls)(JSON.parse(trimmed));
            }
            catch {
                return [trimmed];
            }
        }
        return [trimmed];
    }
    if (Array.isArray(input)) {
        return input
            .flatMap((item) => (0, exports.normalizeAttachmentUrls)(item))
            .filter(Boolean);
    }
    return [];
};
exports.normalizeAttachmentUrls = normalizeAttachmentUrls;
const primaryAttachmentUrl = (input) => (0, exports.normalizeAttachmentUrls)(input)[0] ?? null;
exports.primaryAttachmentUrl = primaryAttachmentUrl;
const attachmentUrlsToJson = (urls) => {
    const normalized = (0, exports.normalizeAttachmentUrls)(urls);
    if (normalized.length === 0)
        return client_1.Prisma.JsonNull;
    return normalized;
};
exports.attachmentUrlsToJson = attachmentUrlsToJson;
const requireAttachmentUrls = (urls, fieldLabel) => {
    if (!(0, exports.normalizeAttachmentUrls)(urls).length) {
        throw new appError_1.default(`${fieldLabel} is required`, 400);
    }
};
exports.requireAttachmentUrls = requireAttachmentUrls;
const mapRecordAttachmentFields = (record, fields) => {
    const next = { ...record };
    for (const field of fields) {
        if (field in next) {
            next[field] =
                (0, exports.normalizeAttachmentUrls)(next[field]);
        }
    }
    return next;
};
exports.mapRecordAttachmentFields = mapRecordAttachmentFields;
//# sourceMappingURL=attachmentUrls.js.map