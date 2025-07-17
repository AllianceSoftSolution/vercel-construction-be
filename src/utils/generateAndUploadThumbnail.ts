import { PdfExtractor } from "pdf-extractor";
import fs from "fs";
import path from "path";
import axios from "axios";
import { uploadToS3 } from "./s3Upload"; // Make sure this path is correct

export const generateAndUploadThumbnail = async (
  pdfUrl: string,
  outputDir: string = path.join(process.cwd(), "extracted-thumbnails")
): Promise<string> => {
  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const tempPdfPath = path.join(outputDir, "temp.pdf");
    const response = await axios.get(pdfUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(tempPdfPath, response.data);

    // Set up the extractor
    const pdfExtractor = new PdfExtractor(outputDir, {
      viewportScale: (width: number, height: number) =>
        width > height ? 1100 / width : 800 / width,
      pageRange: [1, 1],
      outputImageFormat: "PNG",
    });

    await pdfExtractor.parse(tempPdfPath);

    const files = fs.readdirSync(outputDir);

    // Filter for the actual image file (page-1.png)
    const thumbnailFile = files.find((f) => f.toLowerCase() === "page-1.png");

    if (!thumbnailFile) {
      throw new Error("Thumbnail file (page-1.png) not found.");
    }

    const thumbnailPath = path.join(outputDir, thumbnailFile);
    const buffer = fs.readFileSync(thumbnailPath);

    // Upload to S3
    const s3Url = await uploadToS3(
      buffer,
      "thumbnail.png",
      "image/png",
      "thumbnails"
    );

    // Clean up output folder
    for (const file of files) {
      fs.unlinkSync(path.join(outputDir, file));
    }

    return s3Url;
  } catch (err) {
    console.error("Thumbnail generation failed:", err);
    throw err;
  }
};
