import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, initializeBucket as initializeS3Bucket } from './s3';
import { logger } from '../utils/logger';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
export const STORAGE_BUCKET = process.env.S3_BUCKET_NAME || 'docmind-uploads';

const isUsingSupabase = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);

let supabaseAdmin: SupabaseClient | null = null;

export const getSupabaseAdmin = (): SupabaseClient => {
  if (!isUsingSupabase) {
    throw new Error('Supabase credentials are not configured in environment.');
  }
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabaseAdmin;
};

let isBucketInitialized = false;

export const initializeBucket = async () => {
  if (isBucketInitialized) return;

  if (isUsingSupabase) {
    try {
      logger.info(`Checking Supabase Storage bucket "${STORAGE_BUCKET}"...`);
      const client = getSupabaseAdmin();
      const { data: buckets } = await client.storage.listBuckets();
      const exists = buckets?.some((b) => b.name === STORAGE_BUCKET);
      if (!exists) {
        const { error } = await client.storage.createBucket(STORAGE_BUCKET, { public: true });
        if (error) throw error;
        logger.info(`Supabase Storage bucket "${STORAGE_BUCKET}" created.`);
      } else {
        logger.info(`Supabase Storage bucket "${STORAGE_BUCKET}" already exists.`);
      }
      isBucketInitialized = true;
    } catch (error: any) {
      logger.error(`Error initializing Supabase Storage: ${error.message}. Retrying in 5 seconds...`);
      setTimeout(initializeBucket, 5000);
    }
  } else {
    logger.info('Supabase URL/Service Key not set. Falling back to LocalStack S3 Storage.');
    try {
      await initializeS3Bucket();
      isBucketInitialized = true;
    } catch (err: any) {
      logger.error(`Failed to initialize fallback LocalStack S3: ${err.message}. Retrying in 5 seconds...`);
      setTimeout(initializeBucket, 5000);
    }
  }
};

/** Upload a file buffer to Storage */
export async function uploadToStorage(key: string, buffer: Buffer, mimeType: string): Promise<string> {
  if (isUsingSupabase) {
    const client = getSupabaseAdmin();
    const { error } = await client.storage.from(STORAGE_BUCKET).upload(key, buffer, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return key;
  } else {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    return key;
  }
}

/** Download a file from Storage as a Buffer */
export async function downloadFromStorage(key: string): Promise<Buffer> {
  if (isUsingSupabase) {
    const client = getSupabaseAdmin();
    const { data, error } = await client.storage.from(STORAGE_BUCKET).download(key);
    if (error) throw new Error(`Supabase download failed: ${error.message}`);
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } else {
    const res = await s3Client.send(
      new GetObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: key,
      })
    );
    // Convert ReadableStream to Buffer
    const streamToBuffer = async (stream: any): Promise<Buffer> => {
      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    };
    return streamToBuffer(res.Body);
  }
}

/** Get a public URL for a file */
export function getPublicUrl(key: string): string {
  if (isUsingSupabase) {
    const client = getSupabaseAdmin();
    const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(key);
    return data.publicUrl;
  } else {
    const endpoint = process.env.PUBLIC_S3_ENDPOINT || process.env.S3_ENDPOINT || 'http://localhost:4566';
    return `${endpoint}/${STORAGE_BUCKET}/${key}`;
  }
}

/** Delete a file from Storage */
export async function deleteFromStorage(key: string): Promise<void> {
  if (isUsingSupabase) {
    const client = getSupabaseAdmin();
    const { error } = await client.storage.from(STORAGE_BUCKET).remove([key]);
    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
  } else {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: key,
      })
    );
  }
}
