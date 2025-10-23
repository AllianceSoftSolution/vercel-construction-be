"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateThumbnailFromPDF = generateThumbnailFromPDF;
const pdf_mjs_1 = require("pdfjs-dist/legacy/build/pdf.mjs");
const canvas_1 = require("canvas");
const sharp_1 = __importDefault(require("sharp"));
const axios_1 = __importDefault(require("axios"));
const s3Upload_1 = require("./s3Upload");
const crypto_1 = __importDefault(require("crypto"));
function randomString(length = 5) {
    return crypto_1.default.randomBytes(length).toString("base64").replace(/[^a-zA-Z0-9]/g, "").substring(0, length);
}
async function generateThumbnailFromPDF(pdfUrl, folder = "uploads") {
    const response = await axios_1.default.get(pdfUrl, { responseType: "arraybuffer" });
    const loadingTask = (0, pdf_mjs_1.getDocument)({ data: new Uint8Array(response.data) });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = (0, canvas_1.createCanvas)(viewport.width, viewport.height);
    const context = canvas.getContext("2d");
    const renderContext = {
        canvasContext: context,
        viewport,
    };
    const renderTask = page.render(renderContext);
    await renderTask.promise;
    const pngBuffer = canvas.toBuffer("image/png");
    const thumbBuffer = await (0, sharp_1.default)(pngBuffer).resize(300).jpeg().toBuffer();
    const timestamp = Date.now();
    const randomPart = randomString(5);
    const fileName = `${randomPart}-${timestamp}.jpg`;
    const thumbnailUrl = await (0, s3Upload_1.uploadToS3)(thumbBuffer, fileName, "image/jpeg", folder);
    return thumbnailUrl;
}
//# sourceMappingURL=generatePdfThumbnail.js.map