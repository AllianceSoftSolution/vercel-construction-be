import AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
});

export const getPublicS3Url = (key: string): string => {
  const bucket = process.env.AWS_BUCKET_NAME!;
  const region = process.env.AWS_REGION!;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

export const buildS3ObjectKey = (
  folder: string,
  fileName: string
): string => {
  const ext = path.extname(fileName || "") || "";
  return `${folder}/${uuidv4()}${ext}`;
};

export const createPresignedPutUrl = async (
  key: string,
  mimeType: string,
  expiresSeconds = 900
): Promise<string> => {
  return s3.getSignedUrlPromise("putObject", {
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key,
    ContentType: mimeType || "application/octet-stream",
    Expires: expiresSeconds,
  });
};
