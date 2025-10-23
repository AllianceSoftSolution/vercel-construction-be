"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAndUploadThumbnail = void 0;
const pdf_extractor_1 = require("pdf-extractor");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const s3Upload_1 = require("./s3Upload");
const generateAndUploadThumbnail = async (pdfUrl, outputDir = path_1.default.join(process.cwd(), "extracted-thumbnails")) => {
    try {
        if (!fs_1.default.existsSync(outputDir)) {
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        }
        const tempPdfPath = path_1.default.join(outputDir, "temp.pdf");
        const response = await axios_1.default.get(pdfUrl, { responseType: "arraybuffer" });
        fs_1.default.writeFileSync(tempPdfPath, response.data);
        const pdfExtractor = new pdf_extractor_1.PdfExtractor(outputDir, {
            viewportScale: (width, height) => width > height ? 1100 / width : 800 / width,
            pageRange: [1, 1],
            outputImageFormat: "PNG",
        });
        await pdfExtractor.parse(tempPdfPath);
        const files = fs_1.default.readdirSync(outputDir);
        const thumbnailFile = files.find((f) => f.toLowerCase() === "page-1.png");
        if (!thumbnailFile) {
            throw new Error("Thumbnail file (page-1.png) not found.");
        }
        const thumbnailPath = path_1.default.join(outputDir, thumbnailFile);
        const buffer = fs_1.default.readFileSync(thumbnailPath);
        const s3Url = await (0, s3Upload_1.uploadToS3)(buffer, "thumbnail.png", "image/png", "thumbnails");
        for (const file of files) {
            fs_1.default.unlinkSync(path_1.default.join(outputDir, file));
        }
        return s3Url;
    }
    catch (err) {
        console.error("Thumbnail generation failed:", err);
        throw err;
    }
};
exports.generateAndUploadThumbnail = generateAndUploadThumbnail;
//# sourceMappingURL=generateAndUploadThumbnail.js.map