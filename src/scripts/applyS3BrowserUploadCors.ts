/**
 * Apply S3 CORS for browser presigned PUT uploads.
 * Run: npx ts-node src/scripts/applyS3BrowserUploadCors.ts
 */
import "dotenv/config";
import AWS from "aws-sdk";

const bucket = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_REGION;

if (!bucket || !region) {
  console.error("AWS_BUCKET_NAME and AWS_REGION are required in .env");
  process.exit(1);
}

const corsRules: AWS.S3.CORSRules = [
  {
    AllowedHeaders: ["*"],
    AllowedMethods: ["GET", "PUT", "HEAD"],
    AllowedOrigins: [
      "http://localhost:5173",
      "http://localhost:4173",
      "http://localhost:3000",
      "https://vercel-construction-fe.vercel.app",
      "https://vercel-construction-be.vercel.app",
    ],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3000,
  },
];

const s3 = new AWS.S3({
  region,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

async function main() {
  // Discover Elastic Beanstalk CNAME for production FE/API origin
  const eb = new AWS.ElasticBeanstalk({ region });
  try {
    const envs = await eb.describeEnvironments({ IncludeDeleted: false }).promise();
    for (const env of envs.Environments || []) {
      if (env.CNAME) {
        corsRules[0].AllowedOrigins?.push(`http://${env.CNAME}`);
        corsRules[0].AllowedOrigins?.push(`https://${env.CNAME}`);
        console.log(`Including EB origin: ${env.CNAME}`);
      }
    }
  } catch (err) {
    console.warn("Could not auto-detect EB origins:", (err as Error).message);
  }

  corsRules[0].AllowedOrigins = [
    ...new Set(corsRules[0].AllowedOrigins?.filter(Boolean)),
  ];

  const bucketName = bucket as string;

  console.log(`Applying CORS to s3://${bucketName} (${region})`);
  console.log("AllowedOrigins:", corsRules[0].AllowedOrigins);

  await s3
    .putBucketCors({
      Bucket: bucketName,
      CORSConfiguration: { CORSRules: corsRules },
    })
    .promise();

  const current = await s3.getBucketCors({ Bucket: bucketName }).promise();
  console.log("CORS applied successfully:");
  console.log(JSON.stringify(current.CORSRules, null, 2));
}

main().catch((err) => {
  console.error("Failed to apply S3 CORS:", err.message || err);
  process.exit(1);
});
