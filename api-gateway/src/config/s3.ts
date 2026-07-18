import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger';

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'docmind-uploads';

export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

export const initializeBucket = async () => {
  try {
    logger.info(`Checking if S3 Bucket "${S3_BUCKET_NAME}" exists...`);
    
    // Check if the bucket exists
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET_NAME }));
      logger.info(`S3 Bucket "${S3_BUCKET_NAME}" already exists and is accessible.`);
    } catch (headErr: any) {
      // 404 or NoSuchBucket means we need to create it
      if (headErr.name === 'NotFound' || headErr.$metadata?.httpStatusCode === 404) {
        logger.info(`S3 Bucket "${S3_BUCKET_NAME}" not found. Creating it...`);
        await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET_NAME }));
        logger.info(`S3 Bucket "${S3_BUCKET_NAME}" created successfully.`);
      } else {
        throw headErr;
      }
    }
  } catch (error: any) {
    logger.error(`Error initializing S3 Bucket: ${error.message}`);
    throw error;
  }
};
