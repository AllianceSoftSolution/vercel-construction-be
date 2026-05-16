// utils/s3Upload.ts
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const s3 = new AWS.S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
});

export const uploadToS3 = async (
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    folder: string = 'uploads'
): Promise<string> => {
    const ext = path.extname(fileName);
    const key = `${folder}/${uuidv4()}${ext}`;

    const params: AWS.S3.PutObjectRequest = {
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
    };

    const data = await s3.upload(params).promise();

    return data.Location;
};
