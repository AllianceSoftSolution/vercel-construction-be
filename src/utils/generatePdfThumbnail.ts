import { getDocument, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "canvas";
import sharp from "sharp";
import axios from "axios";
import { uploadToS3 } from "./s3Upload";
import crypto from "crypto";

function randomString(length: number = 5): string {
    return crypto.randomBytes(length).toString("base64").replace(/[^a-zA-Z0-9]/g, "").substring(0, length);
}

export async function generateThumbnailFromPDF(
    pdfUrl: string,
    folder: string = "uploads"
): Promise<string> {
    // 1. Download PDF as Uint8Array
    const response = await axios.get<ArrayBuffer>(pdfUrl, { responseType: "arraybuffer" });
    const loadingTask = getDocument({ data: new Uint8Array(response.data) });
    const pdf: PDFDocumentProxy = await loadingTask.promise;

    // 2. Get the first page
    const page: PDFPageProxy = await pdf.getPage(1);
    const scale = 2;
    const viewport = page.getViewport({ scale });

    // 3. Create canvas and render
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    const renderContext = {
        canvasContext: context as any,
        viewport,
    };

    const renderTask = page.render(renderContext as any);
    await renderTask.promise;

    // 4. Convert canvas to buffer, resize, convert to JPEG
    const pngBuffer = canvas.toBuffer("image/png");
    const thumbBuffer = await sharp(pngBuffer).resize(300).jpeg().toBuffer();

    // 5. Upload thumbnail to S3
    const timestamp = Date.now();
    const randomPart = randomString(5);
    const fileName = `${randomPart}-${timestamp}.jpg`;

    const thumbnailUrl = await uploadToS3(
        thumbBuffer,
        fileName,
        "image/jpeg",
        folder
    );

    return thumbnailUrl;
}
